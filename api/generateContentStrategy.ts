import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getModel, parseJSON } from "./_geminiShared.js";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { getModelForTask } from "./_modelRouter.js";
import { getGoalFramework, getGoalSpecificCTAs, getGoalSpecificContentGuidance } from "./_goalFrameworks.js";
import { getLatestTrends, getOnlyFansWeeklyTrends } from "./_trendsHelper.js";
import { researchNicheStrategy } from "./_nicheResearch.js";
import { canGenerateStrategy, recordStrategyGeneration } from "./_strategyUsage.js";
import { getOnlyFansResearchContext } from "./_onlyfansResearch.js";
import { getEmojiInstructions, getEmojiExamplesForTone } from "./_emojiHelper.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { isCreatorIdentityPlan } from "./_creatorIdentityElite.js";
import { getCreatorIdentityCurrent } from "./_creatorIdentityFirestore.js";
import {
  buildCreatorIdentityBackgroundPromptBlock,
  buildCreatorIdentityBaselinePromptBlock,
  strategyNicheSeedFromIdentity,
} from "./_creatorIdentityPrompt.js";
import { getNaturalVoicePromptBlock } from "./_naturalVoicePrompt.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authUser = await verifyAuth(req);
  if (!authUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Rate limiting: 5 requests per minute per user (strategy generation is expensive)
  const ok = await enforceRateLimit({
    req,
    res,
    keyPrefix: "generateContentStrategy",
    limit: 5,
    windowMs: 60_000,
    identifier: authUser.uid,
  });
  if (!ok) return;

  // Fetch user's plan and role from Firestore
  const db = getAdminDb();
  const userDoc = await db.collection("users").doc(authUser.uid).get();
  
  if (!userDoc.exists) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const userData = userDoc.data();
  const userPlan = userData?.plan || 'Free';
  const userRole = userData?.role;

  const creatorIdentityDoc = isCreatorIdentityPlan(String(userPlan))
    ? await getCreatorIdentityCurrent(db, authUser.uid)
    : null;
  const identitySeedStr = strategyNicheSeedFromIdentity(creatorIdentityDoc);
  const hasIdentityBaseline = Boolean(identitySeedStr?.trim());
  
  // Get creator profile for gender-aware content generation
  const creatorGender = userData?.creatorGender || "";
  const targetAudienceGender = userData?.targetAudienceGender || "";

  // Check strategy generation limit
  const usageCheck = await canGenerateStrategy(authUser.uid, userPlan, userRole);
  if (!usageCheck.allowed) {
    res.status(200).json({
      error: "Strategy generation limit reached",
      note: `You've reached your monthly limit of ${usageCheck.limit} strategy generations. ${userPlan === 'Free' ? 'Upgrade to Pro or Elite for more strategies.' : 'Your limit will reset at the start of next month.'}`,
      limit: usageCheck.limit,
      remaining: usageCheck.remaining,
    });
    return;
  }

  const { niche, audience, goal, duration, tone, platformFocus, analyticsData, emojiEnabled, emojiIntensity, contextDescription, usePersonality, useFavoriteHashtags, creatorPersonality, favoriteHashtags, toneSettings } = req.body || {};

  const rawNiche = typeof niche === "string" ? niche.trim() : "";
  const rawAudience = typeof audience === "string" ? audience.trim() : "";
  const goalStr =
    goal !== undefined && goal !== null ? String(goal).trim() : "";
  const safeCreatorPersonality =
    typeof creatorPersonality === "string"
      ? creatorPersonality.trim().slice(0, 1200)
      : "";
  const safeFavoriteHashtags =
    typeof favoriteHashtags === "string"
      ? favoriteHashtags.trim().slice(0, 600)
      : "";
  const usePersonalityBool = Boolean(usePersonality && safeCreatorPersonality);

  if (!goalStr) {
    res.status(400).json({ error: "Primary goal is required" });
    return;
  }
  if (!rawNiche && !rawAudience && !usePersonalityBool && !hasIdentityBaseline) {
    res.status(400).json({
      error:
        "Add post ideas, target audience, enable Personality Override (with text in Settings), or complete Creator Identity (Elite).",
    });
    return;
  }

  const effectiveNiche =
    rawNiche ||
    (usePersonalityBool
      ? "Personality Override–led — topics from creator voice (see PERSONALITY OVERRIDE block)"
      : hasIdentityBaseline
        ? `Creator Identity–led — ${identitySeedStr.slice(0, 200)}`
      : "General social content");
  const effectiveAudience =
    rawAudience ||
    "Inferred from personality, goal, tone, platform focus, and trends";
  const researchNicheSeed =
    rawNiche ||
    (usePersonalityBool
      ? safeCreatorPersonality.slice(0, 120).replace(/\s+/g, " ").trim()
      : "") ||
    (hasIdentityBaseline ? identitySeedStr.slice(0, 160).replace(/\s+/g, " ").trim() : "") ||
    "social media creator content";
  const researchAudienceSeed = rawAudience || "social media audience";

  // Tone sliders: with Personality Override ON, formality/humor/warmth often fight the override text (user hears "it ignores me").
  // Keep sliders authoritative for emoji + profanity; override is ground truth for voice when usePersonalityBool.
  const toneStyleGuidance = toneSettings
    ? usePersonalityBool
      ? `
WRITING STYLE (Personality Override mode — follow emoji & profanity lines strictly; override block defines all other voice traits):
${toneSettings.profanity !== undefined && toneSettings.profanity > 0 ? `- Profanity (${toneSettings.profanity}/100): ${toneSettings.profanity < 30 ? 'Very mild swearing OK' : toneSettings.profanity < 50 ? 'Moderate casual swearing' : 'Frequent swearing acceptable'}` : '- Keep language clean, no swearing'}
${toneSettings.emojiLevel !== undefined ? `- Emoji usage (${toneSettings.emojiLevel}/100): ${toneSettings.emojiLevel < 20 ? 'No emojis in captions' : toneSettings.emojiLevel < 40 ? 'At most 1-2 emojis total per caption' : toneSettings.emojiLevel < 60 ? 'Moderate emojis (a few, purposeful)' : 'Liberal, expressive emoji use that matches the voice'}` : ''}
- Formality, humor, warmth sliders: IGNORE their numbers for caption voice — the PERSONALITY OVERRIDE & BRAND VOICE section defines those. Do not "sanitize" or corporate-wash captions to match sliders.
`
      : `
WRITING STYLE PREFERENCES (apply to every "caption", hook, and ready-to-post line — especially emoji count and warmth):
${toneSettings.formality !== undefined ? `- Formality (${toneSettings.formality}/100): ${toneSettings.formality < 30 ? 'Very casual, use slang and informal language' : toneSettings.formality < 50 ? 'Casual and conversational' : toneSettings.formality < 70 ? 'Balanced tone' : 'Professional and polished'}` : ''}
${toneSettings.humor !== undefined ? `- Humor (${toneSettings.humor}/100): ${toneSettings.humor < 30 ? 'Serious, minimal humor' : toneSettings.humor < 50 ? 'Light occasional humor' : toneSettings.humor < 70 ? 'Witty and playful' : 'Very funny, comedic tone'}` : ''}
${toneSettings.empathy !== undefined ? `- Warmth (${toneSettings.empathy}/100): ${toneSettings.empathy < 30 ? 'Direct and straightforward' : toneSettings.empathy < 50 ? 'Friendly but not overly warm' : toneSettings.empathy < 70 ? 'Warm and understanding' : 'Very supportive'}` : ''}
${toneSettings.profanity !== undefined && toneSettings.profanity > 0 ? `- Profanity (${toneSettings.profanity}/100): ${toneSettings.profanity < 30 ? 'Very mild swearing OK' : toneSettings.profanity < 50 ? 'Moderate casual swearing' : 'Frequent swearing acceptable'}` : '- Keep language clean, no swearing'}
${toneSettings.emojiLevel !== undefined ? `- Emoji usage (${toneSettings.emojiLevel}/100): ${toneSettings.emojiLevel < 20 ? 'No emojis in captions' : toneSettings.emojiLevel < 40 ? 'At most 1-2 emojis total per caption' : toneSettings.emojiLevel < 60 ? 'Moderate emojis (a few, purposeful)' : 'Liberal, expressive emoji use that matches the voice'}` : ''}
`
    : "";

  try {
    // Use strategy task type for better model routing
    const model = await getModelForTask("strategy", authUser.uid);
    
    // Parse duration - ensure it's a number
    let durationWeeks = 4; // default
    if (duration !== undefined && duration !== null) {
      const parsed = parseInt(String(duration).replace(/\D/g, ''));
      if (!isNaN(parsed) && parsed > 0) {
        durationWeeks = parsed;
      }
    }
    const platforms = platformFocus && platformFocus !== 'Mixed / All' 
      ? [platformFocus] 
      : ['Instagram', 'TikTok', 'X', 'LinkedIn', 'Facebook', 'Threads', 'YouTube', 'Pinterest'];

    /** Scheduled Tavily trends (unchanged cadence); strategy prompt uses this branch only for Instagram-only plans. */
    const isInstagramFocus = platformFocus === 'Instagram';
    
    // Detect if this is for OnlyFans platform
    const isOnlyFansPlatform = platformFocus === 'OnlyFans' || 
                               (Array.isArray(platforms) && platforms.includes('OnlyFans')) ||
                               rawNiche.toLowerCase().includes('onlyfans') ||
                               rawNiche.toLowerCase().includes('adult content creator');
    
    // Detect explicit content context
    const isExplicitContent = tone === 'Explicit/Adult Content' || 
                             tone === 'Explicit' ||
                             tone === 'Sexy / Explicit' ||
                             tone === 'Sexy / Bold' ||
                             isOnlyFansPlatform;

    // Get user explicitness level and OnlyFans-specific research if OnlyFans platform
    let explicitnessLevel = 7; // Default
    let onlyfansWeeklyTrends = '';
    let onlyfansResearch = '';
    
    if (isOnlyFansPlatform) {
      try {
        explicitnessLevel = userData?.explicitnessLevel ?? 7;
        
        // Get OnlyFans weekly trends with timeout
        try {
          const trendsPromise = getOnlyFansWeeklyTrends();
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('OnlyFans trends timeout')), 10000) // 10 second timeout
          );
          onlyfansWeeklyTrends = await Promise.race([trendsPromise, timeoutPromise]) as string;
        } catch (error) {
          console.error('[generateContentStrategy] Error fetching OnlyFans trends:', error);
        }
        
        // Get OnlyFans-specific research with timeout
        try {
          const researchPromise = getOnlyFansResearchContext(
            rawAudience || effectiveAudience || 'Subscribers',
            goalStr || 'Sales Conversion',
            authUser.uid,
            userPlan,
            userRole
          );
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('OnlyFans research timeout')), 15000) // 15 second timeout
          );
          onlyfansResearch = await Promise.race([researchPromise, timeoutPromise]) as string;
          console.log('[generateContentStrategy] OnlyFans research context fetched');
        } catch (error) {
          console.error('[generateContentStrategy] Error fetching OnlyFans research:', error);
          // Continue without OnlyFans research - not critical
        }
      } catch (error) {
        console.error('[generateContentStrategy] Error in OnlyFans platform setup:', error);
        // Continue without OnlyFans research - not critical
      }
    }

    // Detect if this is for My Page / Fan Hub platform
    const isMyPagePlatform = platformFocus === 'MyPage' || platformFocus === 'My Page' || platformFocus === 'Fan Hub';
    
    // Fetch Fan Hub analytics if My Page is selected
    let fanHubAnalyticsContext = '';
    if (isMyPagePlatform) {
      try {
        const postsSnap = await db.collection("creators").doc(authUser.uid).collection("fanPosts")
          .orderBy("createdAt", "desc").limit(20).get();
        
        let totalLikes = 0;
        let totalComments = 0;
        const postTypes: Record<string, number> = {};
        
        postsSnap.forEach((doc) => {
          const data = doc.data();
          totalLikes += data.likes || 0;
          totalComments += data.commentsCount || 0;
          const type = data.mediaType || "text";
          postTypes[type] = (postTypes[type] || 0) + 1;
        });
        
        const postCount = postsSnap.size || 1;
        const topTypes = Object.entries(postTypes)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([t]) => t);
        
        // Get recent tips count
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const tipsSnap = await db.collection("purchases")
          .where("creatorId", "==", authUser.uid)
          .where("type", "==", "tip")
          .where("createdAt", ">=", weekAgo.toISOString())
          .get();
        
        const avgLikes = Math.round(totalLikes / postCount);
        const avgComments = Math.round(totalComments / postCount);
        const recentTips = tipsSnap.size;
        
        fanHubAnalyticsContext = `
MY PAGE / FAN HUB ANALYTICS (use to tailor content strategy):
- Your top performing post types: ${topTypes.length > 0 ? topTypes.join(", ") : "varied content"}
- Average likes per post: ${avgLikes}
- Average comments per post: ${avgComments}
- Best engagement times: evenings and weekends
- Recent tip activity: ${recentTips} tips this week

Generate ideas that mirror your top-performing content patterns. Focus on what drives engagement, tips, and subscriber retention.
DO NOT include hashtags for My Page content - this is a private fan platform, not social media.
`;
        console.log('[generateContentStrategy] Fan Hub analytics fetched:', { postCount, avgLikes, avgComments, recentTips });
      } catch (e) {
        console.warn('[generateContentStrategy] Failed to fetch Fan Hub analytics:', e);
      }
    }

    // Build analytics context for AI
    let analyticsContext = '';
    if (analyticsData) {
      const topTopics = analyticsData.topTopics?.slice(0, 5).join(', ') || 'No trending topics available';
      const engagementInsights = analyticsData.engagementInsights?.map((insight: any) => `- ${insight.title}: ${insight.description}`).join('\n') || 'No specific insights available';
      const bestDays = analyticsData.responseRate?.sort((a: any, b: any) => b.value - a.value).slice(0, 3).map((d: any) => d.name).join(', ') || 'No data';
      const engagementIncrease = analyticsData.engagementIncrease || 0;
      
      analyticsContext = `
ANALYTICS DATA (What's Working for This Account):
- Top Performing Topics: ${topTopics}
- Engagement Insights:
${engagementInsights}
- Best Days for Posting: ${bestDays}
- Engagement Increase: ${engagementIncrease}%
- Top Topics Getting Engagement: ${topTopics}

Use this analytics data to inform your strategy:
1. Focus on topics that are already performing well (${topTopics})
2. Schedule content on days that historically perform best (${bestDays})
3. Create content similar to what's getting high engagement
4. For image ideas: Suggest visual styles/types that match high-performing content
5. For video ideas: Suggest video formats/types that align with trending engagement patterns
${isInstagramFocus ? `
6. Instagram-only strategy: Weight Reels vs Posts vs Stories using what actually drove engagement above; propose more of what worked, with controlled experiments on hooks and formats.
` : ''}`;
    }

    // Build explicitness context based on user's explicitness level for OnlyFans
    const explicitnessContext = isOnlyFansPlatform 
      ? (explicitnessLevel >= 9 
          ? 'EXTREMELY EXPLICIT - Use very explicit, graphic language describing sexual acts, intimate moments, and explicit content in detail. Focus on lust, desire, and explicit sexual experiences.'
          : explicitnessLevel >= 7
          ? 'HIGHLY EXPLICIT - Use explicit language describing sexual content, intimate moments, girlfriend experience, and explicit scenes. Focus on sexual desire, lust, and explicit experiences.'
          : explicitnessLevel >= 5
          ? 'MODERATELY EXPLICIT - Use suggestive and explicit language describing intimate content, sexual themes, girlfriend experience, and adult content. Focus on desire and intimate experiences.'
          : 'SUGGESTIVE - Use suggestive language with adult themes, intimate moments, and romantic/sexual undertones. Focus on connection and intimate experiences.')
      : '';

    // Build creator profile guidance for gender-appropriate content
    const creatorProfileGuidance = (creatorGender || targetAudienceGender) ? `
CREATOR PROFILE (CRITICAL - FOLLOW STRICTLY):
${creatorGender ? `- The creator is: ${creatorGender}` : ''}
${targetAudienceGender ? `- Target audience: ${targetAudienceGender === 'Male' ? 'Men' : targetAudienceGender === 'Female' ? 'Women' : targetAudienceGender === 'Both' ? 'Both men and women' : 'All audiences'}` : ''}

MANDATORY CONTENT RULES BASED ON CREATOR PROFILE:
(These she/he rules apply to imageIdeas, videoIdeas, and internal planning — NOT to the "caption" field: captions are always first person from the creator, I/my/we.)
${creatorGender === 'Female' && targetAudienceGender === 'Male' ? `- ALL content ideas must feature the FEMALE creator appealing to MALE audience
- Ideas should showcase HER (the creator): bikini photos, lingerie looks, selfies, body shots, intimate content
- NEVER suggest photos of men, mankinis, men in bikinis, or content featuring men
- Focus on feminine aesthetics, curves, confidence, seduction, flirtation aimed at male viewers
- Use "she/her" when referring to the creator in shot descriptions, never "he/him"` : ''}
${creatorGender === 'Male' && targetAudienceGender === 'Female' ? `- ALL content ideas must feature the MALE creator appealing to FEMALE audience
- Ideas should showcase HIM (the creator): shirtless photos, gym content, suits, confidence poses
- NEVER suggest photos of women or content featuring women as the subject
- Focus on masculine aesthetics, physique, charm, romance aimed at female viewers
- Use "he/him" when referring to the creator in shot descriptions, never "she/her"` : ''}
${creatorGender === 'Female' && targetAudienceGender === 'Female' ? `- ALL content ideas must feature the FEMALE creator appealing to FEMALE audience
- Ideas should showcase HER: confidence, beauty, lifestyle, behind-the-scenes, relatability
- Focus on aesthetics that appeal to women viewers` : ''}
${creatorGender === 'Male' && targetAudienceGender === 'Male' ? `- ALL content ideas must feature the MALE creator appealing to MALE audience
- Ideas should showcase HIM: physique, fitness, lifestyle, confidence
- Focus on aesthetics that appeal to male viewers` : ''}
${creatorGender === 'Couple' ? `- ALL content ideas must feature BOTH partners together
- Ideas should showcase the couple: couple content, duo shots, relationship moments
- Appeal to the specified target audience with couple-focused content` : ''}
${creatorGender === 'Non-binary' ? `- ALL content ideas should be gender-neutral or match the creator's presentation
- Focus on the creator's unique aesthetic and style` : ''}
` : '';

    // Build explicit content context for AI
    const explicitContentContext = isExplicitContent || isOnlyFansPlatform ? `
CRITICAL CONTEXT - ONLYFANS ADULT/EXPLICIT CONTENT PLATFORM:
- This content strategy is EXCLUSIVELY for OnlyFans - an adult content creator platform focused on sexual content
- ALL content ideas MUST be focused on adult/explicit sexual content, NOT generic business/tech/product content
- Focus on: sexual experiences, intimate moments, girlfriend experience, lust, desire, explicit scenes, adult content
- DO NOT generate generic business strategies, tech product ideas, or non-sexual content
- Topics should be SPECIFIC explicit sexual content ideas (not just "subscribe" prompts):
  * Describe specific intimate sexual scenes, poses, outfits, settings, moods, girlfriend experience scenarios
  * Be explicit about what sexual content will be shown (not generic subscription messages)
  * Focus on specific explicit themes: intimate moments, sexual experiences, girlfriend experience, lust, desire, explicit shoots
- Captions should DESCRIBE the explicit sexual content shown, not just promote subscriptions
- Image/video ideas should suggest SPECIFIC explicit sexual visual concepts:
  * Describe specific poses, outfits, settings, lighting, moods for explicit sexual content
  * Be detailed about what explicit/intimate sexual content will be created
  * Focus on variety: different sexual themes, settings, outfits, poses, girlfriend experience scenarios
- Content should focus on creating explicit, descriptive sexual content that shows actual intimate/explicit sexual moments
- Use bold, direct language that describes explicit sexual content in detail
- Include themes like: specific intimate sexual scenes, explicit photosets with sexual details, girlfriend experience content, behind-the-scenes of explicit sexual content creation, specific explicit sexual video concepts
- Avoid generic "subscribe" topics - create specific, explicit sexual content ideas that describe what will be shown
${explicitnessContext ? `\nEXPLICITNESS LEVEL: ${explicitnessLevel}/10\n${explicitnessContext}` : ''}
` : '';

    // Get goal-specific strategic framework
    const goalFramework = getGoalFramework(goalStr);
    
    // Get trends - use OnlyFans weekly trends if OnlyFans platform, otherwise general trends
    // Add timeout to prevent trends from taking too long
    let currentTrends = '';
    if (isOnlyFansPlatform && onlyfansWeeklyTrends) {
      currentTrends = onlyfansWeeklyTrends;
    } else {
      try {
        const trendsPromise = getLatestTrends();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Trends timeout')), 10000) // 10 second timeout
        );
        currentTrends = await Promise.race([trendsPromise, timeoutPromise]) as string;
      } catch (error) {
        console.error('[generateContentStrategy] Error fetching trends:', error);
        currentTrends = 'Trend data unavailable. Using general best practices.';
      }
    }

    // Perform niche-specific research using Tavily (primary strategy input)
    // Note: This uses 8 Tavily searches per strategy generation
    // Add timeout to prevent research from taking too long
    let nicheResearch = '';
    try {
      const researchPromise = researchNicheStrategy(researchNicheSeed, researchAudienceSeed, goalStr, platformFocus, authUser.uid, userPlan, userRole);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Research timeout')), 20000) // 20 second timeout
      );
      nicheResearch = await Promise.race([researchPromise, timeoutPromise]) as string;
      console.log('[generateContentStrategy] Niche research completed');
    } catch (error) {
      console.error('[generateContentStrategy] Error performing niche research:', error);
      nicheResearch = 'Niche research unavailable. Using general best practices.';
    }

    // Build JSON schema description (always include description/angle/cta/caption so UI has consistent fields)
    const contentItemSchema = `{
          "dayOffset": 0,
          "topic": "Specific content topic/idea (e.g., 'Behind the scenes of our process')",
          "format": "Post" | "Reel" | "Story",
          "platform": "Instagram" | "TikTok" | "X" | "LinkedIn" | "Facebook" | "Threads" | "YouTube" | "Pinterest" | "Discord" | "Telegram" | "Reddit" | "Fanvue" | "OnlyFans",
          "description": "Detailed description of the content idea with specific angles and execution details",
          "angle": "What makes this post compelling and unique - detailed angle description",
          "cta": "Specific call-to-action tailored to the content and goal",
          "caption": "FINISHED post copy as if from a strong caption generator: scroll-stopping hook first line, conversational body, clear CTA, hashtags at end when appropriate—NOT a dull restatement of topic; NEVER start with Reel/Post/Story labels",
          "imageIdeas": ["Idea 1 for images", "Idea 2 for images", "Idea 3 for images"],
          "videoIdeas": ["Idea 1 for videos", "Idea 2 for videos"]
        }`;

    const safeContextDescription = typeof contextDescription === 'string'
      ? contextDescription.trim().slice(0, 1500)
      : '';

    const creatorIdentityBaselineBlock =
      hasIdentityBaseline && creatorIdentityDoc && !usePersonalityBool
        ? buildCreatorIdentityBaselinePromptBlock(creatorIdentityDoc)
        : "";
    const creatorIdentityBackgroundBlock =
      hasIdentityBaseline && creatorIdentityDoc && usePersonalityBool
        ? buildCreatorIdentityBackgroundPromptBlock(creatorIdentityDoc)
        : "";

    const personalityLeadBlock =
      usePersonalityBool && safeCreatorPersonality
        ? `
${creatorIdentityBackgroundBlock}
PERSONALITY OVERRIDE & BRAND VOICE (PRIMARY — READ THIS BEFORE WRITING ANY "caption"):
${safeCreatorPersonality}

CRITICAL — OVERRIDE-FIRST PLANNING:
- This block is the top priority for HOW captions sound (word choice, humor, energy, slang, attitude). Every caption must read like THIS person typed it on their phone — not like a strategist, narrator, or generic influencer.
- On Elite, Creator Identity (if shown above as background) must not override this block when they conflict.
- ${rawNiche ? `Post ideas from the user: "${rawNiche}". Topics and angles should reflect these ideas AND this voice; if anything conflicts, Personality Override wins for wording.` : `The user did not specify post ideas—propose specific content ideas that fit this override voice, aligned with goal (${goalStr}), platform focus (${platformFocus || "Mixed / All"}), and audience (${effectiveAudience}).`}
- Research and trends above/below inform WHAT to post, timing, and formats — do NOT import their tone of voice into captions. Never replace this override with "best practices" speak.
- Strategy "Tone" dropdown is secondary when this block is present. Emoji and profanity rules come from Settings (see WRITING STYLE in parameters).
- Steer tactics toward "${goalStr}" using approaches that still sound like this creator.

`
        : `${creatorIdentityBaselineBlock}`;

    const personalityCaptionFinalCheck = usePersonalityBool
      ? `
FINAL — CAPTIONS VS PERSONALITY OVERRIDE (MANDATORY):
- Before outputting JSON, skim every "caption" field: if it could belong to any random creator in this niche, rewrite it until it clearly matches PERSONALITY OVERRIDE & BRAND VOICE above.
- Do not flatten voice to sound "on-brand" in a generic way; keep quirks, specificity, and attitude from the override text.

`
      : hasIdentityBaseline
        ? `
FINAL — CAPTIONS VS CREATOR IDENTITY (MANDATORY):
- Every "caption" should reflect the Creator Identity baseline (positioning, audience pull, monetization angle) even though Personality Override is off.

`
        : "";

    const favoriteHashtagsBlock =
      useFavoriteHashtags && safeFavoriteHashtags
        ? `
FAVORITE HASHTAGS:
${safeFavoriteHashtags}

Incorporate relevant hashtags into the strategy recommendations where appropriate.

`
        : "";

    const strategistOpening =
      usePersonalityBool && !rawNiche
        ? `You are an elite content strategist. Market research and trends appear first for topics and timing; the PERSONALITY OVERRIDE section (after that context) is the PRIMARY anchor for caption voice and authenticity. Use research for WHAT/when — never for generic influencer diction in captions. Audience: ${effectiveAudience}.`
        : usePersonalityBool && rawNiche
          ? `You are an elite content strategist. Blend the user's post ideas ("${rawNiche}") with their Personality Override (full block below, after research/trends). Post ideas steer topics; the override steers every caption's voice. Target audience: ${effectiveAudience}.`
          : hasIdentityBaseline && !rawNiche
            ? `You are an elite content strategist. Use Creator Identity (baseline block below) as the default brand lens for topics, tone, and monetization framing when Personality Override is off. Audience: ${effectiveAudience}.`
            : `You are an elite content strategist specializing in ${effectiveNiche} for ${effectiveAudience}. Your expertise is creating data-driven strategies that achieve specific business goals.`;

    const primaryStrategySourceInstruction =
      usePersonalityBool && !rawNiche
        ? `3. PRIMARY STRATEGY SOURCE: Personality Override (voice + differentiated topics) + trend/research for timing and formats + goal (${goalStr}). Research suggests themes; captions must still sound like the override block — not like the research prose.`
        : usePersonalityBool && rawNiche
          ? `3. PRIMARY STRATEGY SOURCE: Post ideas ("${rawNiche}") define topics; Personality Override defines caption voice; research/trends refine angles and timing. Do not let research replace the override voice in "caption" fields.`
          : hasIdentityBaseline && !usePersonalityBool
            ? `3. PRIMARY STRATEGY SOURCE: Creator Identity baseline + trend/research + goal (${goalStr}). Identity informs positioning and voice unless the user later enables Personality Override for a specific run.`
          : `3. PRIMARY STRATEGY SOURCE: Use the topic-specific research above as your PRIMARY source of insights:
   - This research includes successful strategies, competitor analysis, and proven tactics for ${effectiveNiche} targeting ${effectiveAudience}
   - Adapt successful strategies from the research to fit the goal: ${goalStr}
   - Incorporate proven content formats, engagement tactics, and platform strategies from the research
   - Use trending topics and hashtags identified in the research`;

    const instagramFocusGuidance = isInstagramFocus
      ? `
INSTAGRAM-ONLY STRATEGY (platform focus is Instagram only; trend context comes from scheduled research above — same cadence, no live pulls):
- Discovery and reach: prioritize Reels-first concepts — strong opening frame, tight pacing, native vertical feel; design for watch time, saves, comments, and shares. Do not promise virality or guaranteed algorithm outcomes.
- Use scheduled trend data with an Instagram lens (categories such as instagram_trends, instagram_reels_growth, instagram_discoverability, video_content_trends, engagement_strategies, hashtag_strategies when present in context above).
- FORMAT MIX across all items in this plan: target roughly 60–70% Reels, 15–25% Feed Posts, 10–20% Stories — keep variety but skew heavily Reels for discovery. Use carousels only when the idea clearly needs multi-slide education or storytelling.
- Captions: hook in the first line; scannable lines; blend broader-discovery hashtags with niche tags where appropriate.
${analyticsData
          ? `- ANALYTICS DATA is included above: prioritize topics, formats, and posting days that already perform well; propose iterations and tests that build on winners.`
          : `- No analytics payload: still run Reels-heavy plan; in metrics/milestones, suggest tracking saves, shares, reach, and profile visits via Instagram Insights.`}
`
      : "";

    const prompt = `
${getNaturalVoicePromptBlock("strategy")}

${strategistOpening}

${creatorProfileGuidance}

${explicitContentContext}

${goalFramework}

${isOnlyFansPlatform && onlyfansResearch ? `ONLYFANS-SPECIFIC RESEARCH & BEST PRACTICES:\n${onlyfansResearch}\n` : ''}

${favoriteHashtagsBlock}
${nicheResearch}

${currentTrends}

${analyticsContext ? analyticsContext : 'Note: No analytics data available. Use best practices for this content direction and audience.'}

${fanHubAnalyticsContext}

${personalityLeadBlock}

PRIMARY OBJECTIVE: Create a ${durationWeeks}-week content strategy specifically designed to achieve: ${goalStr}
${durationWeeks === 1 ? '\n⚠️ IMPORTANT: This is a ONE-WEEK plan. Generate EXACTLY 1 week (7 days) with 10-14 detailed content items. Do NOT generate multiple weeks.' : ''}

Strategy Parameters:
- Primary Goal: ${goalStr} (THIS IS THE MOST IMPORTANT - every content piece should directly support this goal)
- Tone: ${tone}${usePersonalityBool ? " (SECONDARY when Personality Override is on — override wins for voice)" : ""}${isExplicitContent ? ' (EXPLICIT/ADULT CONTENT - Generate bold, sales-oriented, explicit content ideas)' : ''}
- Platform Focus: ${platformFocus || 'Mixed / All'}
- Target Audience: ${effectiveAudience}${rawAudience ? "" : " (inferred when not provided)"}
- Post ideas / content direction: ${effectiveNiche}${rawNiche ? "" : " (inferred / personality-led when not provided)"}
- Duration: ${durationWeeks} week${durationWeeks === 1 ? '' : 's'}${durationWeeks === 1 ? ' (ONE WEEK ONLY - generate content for 7 days, not multiple weeks)' : ''}
${toneStyleGuidance}
${safeContextDescription ? `\nADDITIONAL CONTEXT & REQUIREMENTS:\n${safeContextDescription}\n\nUse this additional context to tailor the strategy according to the user's specific requirements, preferences, and desired approach.\n` : ''}
${instagramFocusGuidance}

CRITICAL INSTRUCTIONS FOR GOAL ACHIEVEMENT:
1. Every content piece must directly contribute to achieving "${goalStr}" - evaluate each topic against: "Does this help achieve ${goalStr}?"
2. Use the strategic framework above to guide content creation - these are proven tactics for ${goalStr}
${primaryStrategySourceInstruction}
4. Create a strategic progression:${durationWeeks === 1 ? 
   '\n   - For one-week plans, focus on a balanced mix: foundation building, engagement, and action-driving content all within the single week' :
   `\n   - Week 1-2: Foundation building (awareness, trust, value delivery)
   - Week 3-4: Engagement and relationship building
   - Week 5+: Action-driving content that directly moves toward ${goalStr}`}
5. Include specific CTAs and engagement tactics aligned with ${goalStr}:
   ${getGoalSpecificCTAs(goalStr)}
6. Balance content types to maximize goal achievement:
   - Educational content: Establishes authority and provides value
   - Entertaining content: Builds connection and shareability
   - Inspirational content: Creates emotional connection
   - Promotional content: Directly drives action toward goal
7. Ensure content is actionable and measurable:
   - Each week should have clear milestones toward ${goalStr}
   - Content should be trackable (can measure if it's working)
   - Include variety but maintain focus on the primary goal
8. Platform optimization:${isInstagramFocus ? `
   - Instagram ONLY: Follow INSTAGRAM-ONLY STRATEGY above. Every item: "platform": "Instagram". Reels-heavy mix (~60–70% Reels). Leverage analytics when provided.
   - Do not assign topics to other platforms.` : `
   - Instagram: Visual storytelling, Reels for reach, Stories for engagement
   - TikTok: Trending formats, quick hooks, entertainment value
   - X/Twitter: Thought leadership, timely takes, conversation starters
   - LinkedIn: Professional insights, industry expertise, B2B value
   - YouTube: Educational deep-dives, tutorials, long-form value
   - Adapt content format to platform strengths while maintaining goal focus`}

Return ONLY valid JSON in this exact structure:${durationWeeks === 1 ? '\n⚠️ CRITICAL: The "weeks" array must contain EXACTLY ONE object. Do NOT add multiple week objects.' : ''}

{
  "weeks": [
    {
      "weekNumber": 1,
      "theme": "Week theme/focus (e.g., 'Brand Introduction' or 'Product Showcase')",
      "content": [
        ${contentItemSchema}
      ]
    }
  ],
  "metrics": {
    "primaryKPI": "Main metric to track (e.g., 'Follower Growth', 'Lead Generation', 'Engagement Rate')",
    "targetValue": 100,
    "successCriteria": [
      "Criterion 1 (e.g., '20% increase in followers')",
      "Criterion 2 (e.g., '15% engagement rate')"
    ],
    "milestones": [
      {
        "week": 1,
        "description": "Week 1 milestone description",
        "targetMetric": 25
      }
    ]
  }
}

Requirements:
${durationWeeks === 1 ? '⚠️ CRITICAL: Generate EXACTLY 1 WEEK (7 days) of content. DO NOT generate 2 or more weeks.' : `- Generate ${durationWeeks} weeks of content`}
- ${durationWeeks === 1 ? 'Generate 10-14 detailed content items for the single week' : `Each week should have 5-7 content items`} (mix of Posts, Reels, and Stories)${isInstagramFocus ? ' — Instagram-only: obey Reels-heavy FORMAT MIX in INSTAGRAM-ONLY STRATEGY; every item platform "Instagram"' : ''}
 - Each content item MUST include ALL of these fields with detailed information:
   * topic: Specific, detailed content idea (not just a one-word topic)
   * description: Detailed description with specific angles and execution details (2-3 sentences minimum)
   * angle: What makes this post compelling and unique - detailed explanation
   * cta: Specific call-to-action tailored to the content and goal
   * caption: READY-TO-USE copy the creator can paste as the actual post (same quality bar as your in-app caption generator):
     - FIRST PERSON: Write as the creator speaking to their audience — use "I", "my", "me", or "we" (brand/collective). Never third-person narration ("This creator…", "She shares…", "Today's post is about…" as a detached narrator).
     - Do NOT copy the "topic" field verbatim as the caption; expand into real, engaging social copy
     - Do NOT begin the caption with "Reel:", "Post:", "Story:", or any format label—those belong only in the JSON "format" field
     - Shape the caption to match this item's "format": Reel = punchy short lines, pattern-interrupt hook, mobile-first rhythm; Story = 1-2 very short lines + light CTA; Post = strong opener, readable body, CTA
     - Start with an attention-grabbing hook (question, bold statement, or intriguing opener)
     - Include engaging body content (not a boring title or outline)
     - End with the CTA; include 3-5 relevant hashtags at the end when the platform uses hashtags (unless OnlyFans/Fan Hub)
     - ${usePersonalityBool ? `Voice: mirror PERSONALITY OVERRIDE & BRAND VOICE exactly for diction and attitude; use WRITING STYLE above only for emoji count and profanity` : hasIdentityBaseline ? `Voice: align with Creator Identity baseline and tone (${tone}); follow WRITING STYLE PREFERENCES` : `Match tone (${tone}); follow WRITING STYLE PREFERENCES above for emoji density, warmth, humor, and formality`}
     - Sound human and platform-native, not generic or robotic — follow NATURAL HUMAN VOICE rules at the top (no viral clichés, no "vibes"/"energy" filler)
${durationWeeks === 1 ? '- Provide comprehensive, detailed content across all 7 days with variety' : ''}
- Distribute content across platforms: ${platforms.join(', ')}
 - DO NOT just provide topic names - provide FULL detailed descriptions for each content item
- Content should align with goal: ${goalStr}
- Use tone: ${tone}${isExplicitContent ? ' - EXPLICIT/ADULT CONTENT: Generate bold, explicit content ideas that describe specific explicit/intimate content to be created (not generic subscription prompts)' : ''}
- Make topics specific and actionable${isExplicitContent ? ' - describe specific explicit scenes, intimate moments, explicit photoset concepts with details (outfits, settings, poses, moods) - NOT generic "subscribe for more" type topics' : ''}
- Ensure variety in formats and platforms
- dayOffset should be 0-6 for week 1, 7-13 for week 2, etc.
- For each content item, provide 2-3 creative imageIdeas (specific visual concepts that would work well as images)${isExplicitContent ? ' - For explicit platforms: Describe SPECIFIC explicit photoset concepts with details like "Intimate photoset with [specific outfit], [specific setting/background], [specific pose/position], [lighting mood], [specific intimate details]" - be explicit and detailed about what will be shown' : ''}
- For each content item, provide 1-2 creative videoIdeas (specific video concepts that would work well as short-form videos)${isExplicitContent ? ' - For explicit platforms: Describe SPECIFIC explicit video concepts like "Intimate video showing [specific scene/action], [specific setting], [specific mood/style], [explicit content details]" - be explicit and detailed about what will be shown' : ''}
- Image and video ideas should be specific, actionable, and aligned with the topic and format${isExplicitContent ? ' - Explicit content ideas must describe SPECIFIC explicit/intimate content to be created with visual details - focus on what will be shown, not just "exclusive content"' : ''}
${isExplicitContent ? `
EXPLICIT CONTENT GUIDELINES:
- Topics must be SPECIFIC explicit content ideas, not generic subscription prompts:
  * Describe specific intimate scenes: "Intimate bedroom photoset with soft lighting and lingerie"
  * Specific explicit concepts: "Behind-the-scenes of intimate video shoot - preparation and setup"
  * Detailed explicit themes: "Boudoir photoset with specific outfit, setting, and mood descriptions"
  * Variety: Different poses, outfits, settings, moods for explicit content each day
  
- Captions should DESCRIBE the explicit content shown in detail (still first person — "I'm…", "my…", never narrator voice):
  * Analyze what's in the media and describe it explicitly
  * Use bold, direct language about what's visually shown
  * Describe specific poses, outfits, settings, actions, moods
  * Make it enticing through explicit, detailed description
  * Natural monetization hints (don't make every caption a sales pitch)
  * Do NOT mention platform name in captions
  
- Image ideas must be SPECIFIC explicit visual concepts:
  * "Intimate photoset: [specific outfit], [specific setting], [specific pose/mood], [lighting details]"
  * "Boudoir shoot: [specific theme], [specific props], [specific composition]"
  * Be detailed about what explicit content will be created visually
  
- Video ideas must be SPECIFIC explicit video concepts:
  * "Intimate video: [specific scene], [specific actions], [specific setting], [mood/style]"
  * "Behind-the-scenes: [specific aspect of explicit content creation]"
  * Describe what explicit content will be shown in the video
  
- Focus on CREATING explicit content, not just promoting subscriptions:
  * Topics describe actual explicit/intimate content to be created
  * Captions describe what's shown explicitly
  * Image/video ideas are specific explicit concepts
  * Natural monetization, but content-first approach
` : ''}
${analyticsData ? `
IMPORTANT: When generating imageIdeas and videoIdeas:
- Base suggestions on what types of images/videos are getting high engagement according to the analytics
- Suggest visual styles, compositions, and formats that match trending content types
- Consider the engagement patterns - if certain visual styles are working, incorporate similar approaches
- Make image/video type suggestions specific (e.g., "Behind-the-scenes photo with natural lighting", "Quick tutorial video with text overlays", "Product showcase with lifestyle context")${isInstagramFocus ? `
- Instagram: Prioritize Reels-oriented videoIdeas (hook-first, pattern interrupt, on-screen text where it fits winners); align imageIdeas with feed/carousel strengths shown in analytics.` : ''}
` : ''}
${personalityCaptionFinalCheck}
`;

    const response = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    const raw = response.response.text();
    let plan;

    try {
      plan = parseJSON(raw);
      
      // Validate and transform the response to ensure correct structure
      if (!plan.weeks || !Array.isArray(plan.weeks)) {
        throw new Error("Invalid response structure: missing weeks array");
      }

      // Ensure each week has the correct structure
      // For one-week plans, limit to exactly 1 week
      const weeksToProcess = durationWeeks === 1 ? plan.weeks.slice(0, 1) : plan.weeks;
      
      plan.weeks = weeksToProcess.map((week: any, weekIndex: number) => {
        const weekContent = week.content || [];
        const isSingleWeek = durationWeeks === 1;
        const maxDayOffset = isSingleWeek ? 6 : (weekIndex + 1) * 7 - 1;
        const minDayOffset = weekIndex * 7;
        
        return {
          weekNumber: week.weekNumber || weekIndex + 1,
          theme: week.theme || week.focus || `Week ${weekIndex + 1} Theme`,
          content: weekContent.map((day: any, dayIndex: number) => {
            // Calculate dayOffset, ensuring it's within valid range for the week
            let calculatedDayOffset: number;
            
            if (day.dayOffset !== undefined && typeof day.dayOffset === 'number') {
              // If AI provided dayOffset, validate and clamp it to valid range
              calculatedDayOffset = Math.max(minDayOffset, Math.min(maxDayOffset, day.dayOffset));
              
              // For single week plans, ensure dayOffset is 0-6 (not absolute day from multiple weeks)
              if (isSingleWeek && calculatedDayOffset > 6) {
                // If it's beyond 6, wrap it using modulo to distribute across the 7 days
                calculatedDayOffset = calculatedDayOffset % 7;
              } else if (isSingleWeek && calculatedDayOffset < 0) {
                // If negative, use dayIndex as fallback
                calculatedDayOffset = dayIndex % 7;
              }
            } else {
              // Calculate based on position, but ensure it's within valid range
              calculatedDayOffset = Math.min(maxDayOffset, (weekIndex * 7) + (dayIndex % 7));
              
              // For single week, ensure it's 0-6
              if (isSingleWeek) {
                calculatedDayOffset = dayIndex % 7;
              }
            }
            
            return {
              dayOffset: calculatedDayOffset,
              topic: day.topic || day.postIdea || `Content idea ${dayIndex + 1}`,
              description: day.description || day.details || '', 
              angle: day.angle || day.hook || '', 
              cta: day.cta || day.callToAction || '', 
              caption: day.caption || '', // Pre-generated caption
              format: day.format || (day.postType === 'Reel' ? 'Reel' : day.postType === 'Story' ? 'Story' : 'Post'),
              platform: day.platform || (Array.isArray(day.platforms) ? day.platforms[0] : platforms[0] || 'Instagram'),
              imageIdeas: day.imageIdeas || [],
              videoIdeas: day.videoIdeas || []
            };
          })
        };
      });

      // Post-validate: ensure required fields are always present/non-empty for UI reliability
      const safeString = (v: any) => (typeof v === "string" ? v.trim() : "");
      const stripStrategyCaptionFormatPrefix = (s: string) =>
        s.replace(/^\s*(reel|post|story)\s*[:—–-]\s*/i, "").trim();
      const ensureMin = (v: any, fallback: string, minLen = 8) => {
        const s = safeString(v);
        return s.length >= minLen ? s : fallback;
      };

      const defaultCta = (() => {
        const ctas = getGoalSpecificCTAs(goalStr);
        return typeof ctas === "string" && ctas.trim().length > 0 ? ctas.split("\n")[0].trim() : "Comment your thoughts and share this with someone who needs it.";
      })();

      plan.weeks = plan.weeks.map((week: any) => ({
        ...week,
        content: (week.content || []).map((item: any) => {
          const topic = ensureMin(item.topic, "Content idea");
          const format = safeString(item.format) || "Post";
          const platform = safeString(item.platform) || (platforms[0] || "Instagram");
          const itemCta = ensureMin(item.cta, defaultCta, 6);

          const descriptionFallback = `Create a ${format} about "${topic}" for ${effectiveAudience}. Include specific talking points, how to present it, and what to show/do on-screen.`;
          const angleFallback = `Hook with a bold claim or question about "${topic}", then deliver 2-3 concrete insights tailored to ${effectiveAudience}.`;
          const ctaFallback = defaultCta;
          
          // Generate a fallback caption if not provided
          const hashtagBase = (rawNiche || "creator").replace(/\s+/g, "").slice(0, 40);
          const goalTag = goalStr.replace(/\s+/g, "");
          const captionFallback = `${item.angle || angleFallback}\n\n${item.description || descriptionFallback}\n\n${itemCta}${!isOnlyFansPlatform && !isMyPagePlatform ? `\n\n#${hashtagBase} #${goalTag} #contentcreator` : ''}`;

          const imageIdeas = Array.isArray(item.imageIdeas) ? item.imageIdeas.filter((x: any) => safeString(x).length > 0) : [];
          const videoIdeas = Array.isArray(item.videoIdeas) ? item.videoIdeas.filter((x: any) => safeString(x).length > 0) : [];

          const captionCleaned = stripStrategyCaptionFormatPrefix(safeString(item.caption));

          return {
            ...item,
            topic,
            format,
            platform,
            description: ensureMin(item.description, descriptionFallback, 20),
            angle: ensureMin(item.angle, angleFallback, 12),
            cta: itemCta,
            caption: ensureMin(captionCleaned, captionFallback, 20),
            imageIdeas: imageIdeas.length > 0 ? imageIdeas : [
              `On-brand visual concept for "${topic}" (clean composition, clear focal point, text overlay with hook)`,
              `Behind-the-scenes style image supporting "${topic}" (authentic, candid, process-oriented)`,
            ],
            videoIdeas: videoIdeas.length > 0 ? videoIdeas : [
              `Short video: hook → 3 quick points → CTA, centered on "${topic}"`,
            ],
          };
        }),
      }));

      // Ensure metrics structure
      if (!plan.metrics) {
        plan.metrics = {
          primaryKPI: goalStr === 'Increase Followers/Fans' ? 'Follower Growth' :
                     goalStr === 'Lead Generation' ? 'Leads Generated' :
                     goalStr === 'Sales Conversion' ? 'Revenue' :
                     goalStr === 'Brand Awareness' ? 'Reach' : 'Engagement Rate',
          successCriteria: [
            `Achieve ${goalStr.toLowerCase()} targets`,
            "Maintain consistent posting schedule"
          ]
        };
      }

    } catch (parseError: any) {
      console.error("Failed to parse strategy response:", parseError);
      console.error("Raw response:", raw);
      res.status(200).json({
        error: "Failed to parse strategy response",
        note: "The AI generated a response but it wasn't in the expected format. Please try again.",
        details: process.env.NODE_ENV === "development" ? parseError?.message : undefined
      });
      return;
    }

    // Record strategy generation usage (only after successful generation)
    try {
      await recordStrategyGeneration(authUser.uid, userPlan, userRole);
    } catch (usageError) {
      // Don't fail the request if usage tracking fails
      console.error("Failed to record strategy generation usage:", usageError);
    }

    res.status(200).json({ plan });
    return;
  } catch (error: any) {
    console.error("generateContentStrategy error:", error);
    res.status(200).json({
      error: "Failed to generate content strategy",
      note: error?.message || "An unexpected error occurred. Please try again.",
      details: process.env.NODE_ENV === "development" ? error?.stack : undefined
    });
    return;
  }
}

