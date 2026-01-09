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

  const { niche, audience, goal, duration, tone, platformFocus, analyticsData, emojiEnabled, emojiIntensity } = req.body || {};

  if (!niche || !audience || !goal) {
    res.status(400).json({ error: "Missing required fields: niche, audience, and goal are required" });
    return;
  }

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
    
    // Detect if this is for OnlyFans platform
    const isOnlyFansPlatform = platformFocus === 'OnlyFans' || 
                               (Array.isArray(platforms) && platforms.includes('OnlyFans')) ||
                               niche?.toLowerCase().includes('onlyfans') ||
                               niche?.toLowerCase().includes('adult content creator');
    
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
            audience || 'Subscribers',
            goal || 'Sales Conversion',
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
`;
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
    const goalFramework = getGoalFramework(goal);
    
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
      const researchPromise = researchNicheStrategy(niche, audience, goal, platformFocus, authUser.uid, userPlan, userRole);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Research timeout')), 20000) // 20 second timeout
      );
      nicheResearch = await Promise.race([researchPromise, timeoutPromise]) as string;
      console.log('[generateContentStrategy] Niche research completed');
    } catch (error) {
      console.error('[generateContentStrategy] Error performing niche research:', error);
      nicheResearch = 'Niche research unavailable. Using general best practices.';
    }

    // Build JSON schema description (always include description/angle/cta so UI has consistent fields)
    const contentItemSchema = `{
          "dayOffset": 0,
          "topic": "Specific content topic/idea (e.g., 'Behind the scenes of our process')",
          "format": "Post" | "Reel" | "Story",
          "platform": "Instagram" | "TikTok" | "X" | "LinkedIn" | "Facebook" | "Threads" | "YouTube" | "Pinterest" | "Discord" | "Telegram" | "Reddit" | "Fanvue" | "OnlyFans",
          "description": "Detailed description of the content idea with specific angles and execution details",
          "angle": "What makes this post compelling and unique - detailed angle description",
          "cta": "Specific call-to-action tailored to the content and goal",
          "imageIdeas": ["Idea 1 for images", "Idea 2 for images", "Idea 3 for images"],
          "videoIdeas": ["Idea 1 for videos", "Idea 2 for videos"]
        }`;

    const prompt = `
You are an elite content strategist specializing in ${niche} for ${audience}. Your expertise is creating data-driven strategies that achieve specific business goals.

${explicitContentContext}

${goalFramework}

${isOnlyFansPlatform && onlyfansResearch ? `ONLYFANS-SPECIFIC RESEARCH & BEST PRACTICES:\n${onlyfansResearch}\n` : ''}

${nicheResearch}

${currentTrends}

${analyticsContext ? analyticsContext : 'Note: No analytics data available. Use best practices for this niche and audience.'}

PRIMARY OBJECTIVE: Create a ${durationWeeks}-week content strategy specifically designed to achieve: ${goal}
${durationWeeks === 1 ? '\n⚠️ IMPORTANT: This is a ONE-WEEK plan. Generate EXACTLY 1 week (7 days) with 10-14 detailed content items. Do NOT generate multiple weeks.' : ''}

Strategy Parameters:
- Primary Goal: ${goal} (THIS IS THE MOST IMPORTANT - every content piece should directly support this goal)
- Tone: ${tone}${isExplicitContent ? ' (EXPLICIT/ADULT CONTENT - Generate bold, sales-oriented, explicit content ideas)' : ''}
- Platform Focus: ${platformFocus || 'Mixed / All'}
- Target Audience: ${audience}
- Niche: ${niche}
- Duration: ${durationWeeks} week${durationWeeks === 1 ? '' : 's'}${durationWeeks === 1 ? ' (ONE WEEK ONLY - generate content for 7 days, not multiple weeks)' : ''}

CRITICAL INSTRUCTIONS FOR GOAL ACHIEVEMENT:
1. Every content piece must directly contribute to achieving "${goal}" - evaluate each topic against: "Does this help achieve ${goal}?"
2. Use the strategic framework above to guide content creation - these are proven tactics for ${goal}
3. PRIMARY STRATEGY SOURCE: Use the niche-specific research above as your PRIMARY source of insights:
   - This research includes successful strategies, competitor analysis, and proven tactics for ${niche} targeting ${audience}
   - Adapt successful strategies from the research to fit the goal: ${goal}
   - Incorporate proven content formats, engagement tactics, and platform strategies from the research
   - Use trending topics and hashtags identified in the research
4. Create a strategic progression:${durationWeeks === 1 ? 
   '\n   - For one-week plans, focus on a balanced mix: foundation building, engagement, and action-driving content all within the single week' :
   `\n   - Week 1-2: Foundation building (awareness, trust, value delivery)
   - Week 3-4: Engagement and relationship building
   - Week 5+: Action-driving content that directly moves toward ${goal}`}
5. Include specific CTAs and engagement tactics aligned with ${goal}:
   ${getGoalSpecificCTAs(goal)}
6. Balance content types to maximize goal achievement:
   - Educational content: Establishes authority and provides value
   - Entertaining content: Builds connection and shareability
   - Inspirational content: Creates emotional connection
   - Promotional content: Directly drives action toward goal
7. Ensure content is actionable and measurable:
   - Each week should have clear milestones toward ${goal}
   - Content should be trackable (can measure if it's working)
   - Include variety but maintain focus on the primary goal
8. Platform optimization:
   - Instagram: Visual storytelling, Reels for reach, Stories for engagement
   - TikTok: Trending formats, quick hooks, entertainment value
   - X/Twitter: Thought leadership, timely takes, conversation starters
   - LinkedIn: Professional insights, industry expertise, B2B value
   - YouTube: Educational deep-dives, tutorials, long-form value
   - Adapt content format to platform strengths while maintaining goal focus

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
- ${durationWeeks === 1 ? 'Generate 10-14 detailed content items for the single week' : `Each week should have 5-7 content items`} (mix of Posts, Reels, and Stories)
 - Each content item MUST include ALL of these fields with detailed information:
   * topic: Specific, detailed content idea (not just a one-word topic)
   * description: Detailed description with specific angles and execution details (2-3 sentences minimum)
   * angle: What makes this post compelling and unique - detailed explanation
   * cta: Specific call-to-action tailored to the content and goal
${durationWeeks === 1 ? '- Provide comprehensive, detailed content across all 7 days with variety' : ''}
- Distribute content across platforms: ${platforms.join(', ')}
 - DO NOT just provide topic names - provide FULL detailed descriptions for each content item
- Content should align with goal: ${goal}
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
  
- Captions should DESCRIBE the explicit content shown in detail:
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
- Make image/video type suggestions specific (e.g., "Behind-the-scenes photo with natural lighting", "Quick tutorial video with text overlays", "Product showcase with lifestyle context")
` : ''}
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
      
      plan.weeks = weeksToProcess.map((week: any, weekIndex: number) => ({
        weekNumber: week.weekNumber || weekIndex + 1,
        theme: week.theme || week.focus || `Week ${weekIndex + 1} Theme`,
        content: (week.content || []).map((day: any, dayIndex: number) => ({
          dayOffset: day.dayOffset !== undefined ? day.dayOffset : (weekIndex * 7) + dayIndex,
          topic: day.topic || day.postIdea || `Content idea ${dayIndex + 1}`,
          description: day.description || day.details || '', 
          angle: day.angle || day.hook || '', 
          cta: day.cta || day.callToAction || '', 
          format: day.format || (day.postType === 'Reel' ? 'Reel' : day.postType === 'Story' ? 'Story' : 'Post'),
          platform: day.platform || (Array.isArray(day.platforms) ? day.platforms[0] : platforms[0] || 'Instagram'),
          imageIdeas: day.imageIdeas || [],
          videoIdeas: day.videoIdeas || []
        }))
      }));

      // Post-validate: ensure required fields are always present/non-empty for UI reliability
      const safeString = (v: any) => (typeof v === "string" ? v.trim() : "");
      const ensureMin = (v: any, fallback: string, minLen = 8) => {
        const s = safeString(v);
        return s.length >= minLen ? s : fallback;
      };

      const defaultCta = (() => {
        const ctas = getGoalSpecificCTAs(goal);
        return typeof ctas === "string" && ctas.trim().length > 0 ? ctas.split("\n")[0].trim() : "Comment your thoughts and share this with someone who needs it.";
      })();

      plan.weeks = plan.weeks.map((week: any) => ({
        ...week,
        content: (week.content || []).map((item: any) => {
          const topic = ensureMin(item.topic, "Content idea");
          const format = safeString(item.format) || "Post";
          const platform = safeString(item.platform) || (platforms[0] || "Instagram");

          const descriptionFallback = `Create a ${format} about "${topic}" for ${audience}. Include specific talking points, how to present it, and what to show/do on-screen.`;
          const angleFallback = `Hook with a bold claim or question about "${topic}", then deliver 2-3 concrete insights tailored to ${audience}.`;
          const ctaFallback = defaultCta;

          const imageIdeas = Array.isArray(item.imageIdeas) ? item.imageIdeas.filter((x: any) => safeString(x).length > 0) : [];
          const videoIdeas = Array.isArray(item.videoIdeas) ? item.videoIdeas.filter((x: any) => safeString(x).length > 0) : [];

          return {
            ...item,
            topic,
            format,
            platform,
            description: ensureMin(item.description, descriptionFallback, 20),
            angle: ensureMin(item.angle, angleFallback, 12),
            cta: ensureMin(item.cta, ctaFallback, 6),
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
          primaryKPI: goal === 'Increase Followers/Fans' ? 'Follower Growth' :
                     goal === 'Lead Generation' ? 'Leads Generated' :
                     goal === 'Sales Conversion' ? 'Revenue' :
                     goal === 'Brand Awareness' ? 'Reach' : 'Engagement Rate',
          successCriteria: [
            `Achieve ${goal.toLowerCase()} targets`,
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

