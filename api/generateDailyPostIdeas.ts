// api/generateDailyPostIdeas.ts - v12
// Instant "What to Post" ideas: 3 post ideas with optional regenerateAll or regenerateSingle (swap one card).
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getModelForTask, getModelNameForTask, getCostTierForTask } from "./_modelRouter.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { parseJSON } from "./_geminiShared.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { getLatestTrends } from "./_trendsHelper.js";
import { searchWeb } from "./_webSearch.js";

export interface DailyPostIdeaPayload {
  id: string;
  format: string;
  title: string;
  hook: string;
  shotList: string[];
  captionStarter?: string;
  cta?: string;
  hashtags: string[];
  whyThisWorks?: string;
  trendBased?: boolean;
  trendContext?: string;
  placeholderImage?: string;
  imageSource?: 'unsplash' | 'ai';
}

export interface GenerateDailyPostIdeasBody {
  platform?: string;
  goal?: string;
  effort?: number;
  format?: string;
  tone?: string;
  useTrends?: boolean;
  includeTrendContext?: boolean;
  spicyMode?: boolean;
  /** When set, regenerate only this idea (swap one card); otherwise generate 3 new ideas. */
  swapId?: string;
  /** Optional seed for deterministic swap (e.g. existing idea id). */
  seed?: string;
  /** When true and platform is Instagram, generate one idea per format (Reel, Carousel, Photo, Story). */
  generateAllFormats?: boolean;
  /** When true and platform is fan_hub/mypage, analyze engagement data to generate ideas. */
  analyzeMyPageEngagement?: boolean;
  /** Optional hint from creator to guide idea generation (e.g. "beach photos", "workout motivation"). */
  creatorHint?: string;
  /** When true and profile has personality text, personality overrides tone + tone sliders for voice. */
  prioritizeCreatorPersonality?: boolean;
}

const CONTENT_POLICY_SAFE = `
CONTENT POLICY (SAFE MODE - Default):
- Generate ideas suitable for mainstream social media (Instagram, Facebook, X).
- Keep content TASTEFUL and APPROPRIATE - no suggestive, racy, or provocative ideas.
- Focus on: lifestyle, personality, relatable moments, behind-the-scenes, hobbies, humor, Q&A, day-in-life.
- NO bikini, lingerie, suggestive poses, body-focused, or flirtatious content unless explicitly requested.
- Ideas should be something you'd comfortably show family members.
`;

const CONTENT_POLICY_SPICY = `
CONTENT POLICY (BOLD/SPICY MODE - User requested):
- Creator has enabled BOLD content mode - more daring ideas are allowed.
- Can include: bikini/swimwear content, lingerie teases, body-confident poses, flirty captions, suggestive themes.
- Still avoid: explicit nudity, adult services language, OnlyFans-specific terms (PPV, sexting).
- Focus on confident, alluring content that pushes boundaries tastefully.
`;

function buildPrompt(opts: {
  platform: string;
  goal: string;
  effort: number;
  format: string;
  tone: string;
  useTrends: boolean;
  spicyMode: boolean;
  creatorContext: string;
  trendContext: string;
  swapOnly: boolean;
  existingIdeasForContext?: DailyPostIdeaPayload[];
  toneSettings?: {
    formality?: number;
    humor?: number;
    empathy?: number;
    spiciness?: number;
    profanity?: number;
    emojiLevel?: number;
  };
  generateAllFormats?: boolean;
  analyzeMyPageEngagement?: boolean;
  fanHubAnalytics?: {
    topPostTypes?: string[];
    avgLikes?: number;
    avgComments?: number;
    topEngagementTimes?: string[];
    recentTips?: number;
  };
  creatorGender?: string;
  targetAudienceGender?: string;
  creatorHint?: string;
  prioritizeCreatorPersonality?: boolean;
}): string {
  const {
    platform,
    goal,
    effort,
    format,
    tone,
    useTrends,
    spicyMode,
    creatorContext,
    trendContext,
    swapOnly,
    existingIdeasForContext,
    toneSettings,
  } = opts;

  const goalGuidance =
    goal === "reach"
      ? "Prioritize discoverability and shareability (hooks, trends, broad appeal)."
      : goal === "engagement"
      ? "Prioritize comments, saves, and DMs (questions, polls, relatable moments)."
      : goal === "followers"
      ? "Balance reach and follow-worthy value; include clear follow triggers."
      : "Prioritize link clicks, DMs, or product/service interest where relevant.";

  const effortGuidance =
    effort <= 5
      ? "Quick, low-effort ideas (single photo, short clip, simple text)."
      : effort <= 15
      ? "Medium effort: reels, carousels, or short series (15 min–1 hr)."
      : "Higher effort: polished reels, multi-slide carousels, or planned series.";

  // Platform-specific format guidance
  const platformFormatGuidance = platform === "fan_hub"
    ? `CRITICAL FOR MY PAGE/FAN HUB:
- ONLY use these formats: 'photo', 'video', 'text', 'poll'
- NEVER use: 'reel', 'carousel', 'story' - these DO NOT exist on My Page
- My Page is a simple feed, not Instagram. No swipe content, no stories.
- Focus on single photo posts, video posts, text updates, or polls.`
    : platform === "twitter"
    ? "For X/Twitter: Generate ideas using formats: 'tweet', 'thread', 'poll', or 'video'. Focus on concise, punchy content."
    : platform === "facebook"
    ? "For Facebook: Generate ideas using formats: 'photo', 'video', 'post', or 'live'. Focus on shareable, community-building content."
    : "";

  const formatGuidance =
    format === "auto"
      ? platform === "fan_hub"
        ? "Generate 3 varied ideas using My Page formats: photo posts, video posts, text updates, or polls. NO Instagram-specific formats."
        : platform === "twitter"
        ? "Generate 3 varied X/Twitter ideas: tweets, threads, polls, or short videos."
        : (opts as any).generateAllFormats
        ? "Generate exactly 4 ideas, ONE for each format: 1 Reel, 1 Carousel, 1 Photo, 1 Story. Each must be clearly suited to its format."
        : "Generate a mix: e.g. 2 reels + 1 carousel, or 1 reel + 1 photo + 1 story, varied and scannable."
      : `Prefer format: ${format}. All ideas should be clearly ${format}-friendly.`;

  // Build tone style guidance from settings
  const toneStyleGuidance = toneSettings ? `
WRITING STYLE PREFERENCES:
${toneSettings.formality !== undefined ? `- Formality (${toneSettings.formality}/100): ${toneSettings.formality < 30 ? 'Very casual, use slang' : toneSettings.formality < 50 ? 'Casual and conversational' : toneSettings.formality < 70 ? 'Balanced tone' : 'Professional and polished'}` : ''}
${toneSettings.humor !== undefined ? `- Humor (${toneSettings.humor}/100): ${toneSettings.humor < 30 ? 'Serious, minimal humor' : toneSettings.humor < 50 ? 'Light occasional humor' : toneSettings.humor < 70 ? 'Witty and playful' : 'Very funny, comedic'}` : ''}
${toneSettings.empathy !== undefined ? `- Warmth (${toneSettings.empathy}/100): ${toneSettings.empathy < 30 ? 'Direct and straightforward' : toneSettings.empathy < 50 ? 'Friendly' : toneSettings.empathy < 70 ? 'Warm and understanding' : 'Very supportive'}` : ''}
${toneSettings.profanity !== undefined && toneSettings.profanity > 0 ? `- Profanity (${toneSettings.profanity}/100): ${toneSettings.profanity < 30 ? 'Very mild swearing OK' : toneSettings.profanity < 50 ? 'Moderate casual swearing' : 'Frequent swearing acceptable'}` : '- Keep language clean, no swearing'}
${toneSettings.emojiLevel !== undefined ? `- Emoji usage (${toneSettings.emojiLevel}/100): ${toneSettings.emojiLevel < 20 ? 'No emojis' : toneSettings.emojiLevel < 40 ? 'Minimal emojis (1-2)' : toneSettings.emojiLevel < 60 ? 'Moderate emojis' : 'Heavy emoji usage'}` : ''}
` : '';

  const personalityPrimary = Boolean(
    opts.prioritizeCreatorPersonality && creatorContext.trim(),
  );
  const effectiveToneStyleGuidance = personalityPrimary ? "" : toneStyleGuidance;

  const ideaCount = swapOnly ? "ONE" : opts.generateAllFormats ? "exactly 4 (one per format: Reel, Carousel, Photo, Story)" : "exactly 3";
  
  // Creator profile guidance - conservative by default, only racy when spicyMode enabled
  const creatorProfileGuidance = (opts.creatorGender || opts.targetAudienceGender) ? `
CREATOR PROFILE:
${opts.creatorGender ? `- The creator is: ${opts.creatorGender}` : ''}
${opts.targetAudienceGender ? `- Target audience: ${opts.targetAudienceGender === 'Male' ? 'Men' : opts.targetAudienceGender === 'Female' ? 'Women' : opts.targetAudienceGender === 'Both' ? 'Both men and women' : 'All audiences'}` : ''}

${spicyMode ? `BOLD MODE ENABLED - more daring content allowed:
${opts.creatorGender === 'Female' ? `- Can include: bikini/swimwear, lingerie teases, body-confident poses, flirty selfies
- Focus on confidence, allure, feminine appeal` : ''}
${opts.creatorGender === 'Male' ? `- Can include: shirtless photos, gym content, confident poses, romantic vibes
- Focus on physique, charm, masculine appeal` : ''}` : `SAFE MODE (default) - keep it tasteful:
- Focus on: personality, lifestyle, humor, relatable moments, hobbies, Q&A, day-in-life
- NO suggestive content, bikini/lingerie, or body-focused ideas
- Ideas should appeal to the target audience through personality, not provocative content`}
` : '';
  
  // Fan Hub / My Page specific guidance
  const fanHubGuidance = opts.platform === "fan_hub" && opts.fanHubAnalytics ? `
FAN HUB ANALYTICS CONTEXT:
- Your top performing post types: ${opts.fanHubAnalytics.topPostTypes?.join(", ") || "varied content"}
- Average likes per post: ${opts.fanHubAnalytics.avgLikes || "N/A"}
- Average comments per post: ${opts.fanHubAnalytics.avgComments || "N/A"}
- Best engagement times: ${opts.fanHubAnalytics.topEngagementTimes?.join(", ") || "varies"}
- Recent tip activity: ${opts.fanHubAnalytics.recentTips || 0} tips this week

Generate ideas that mirror your top-performing content patterns. Focus on what drives engagement, tips, and subscriber retention.
` : "";

  // Add randomness seed to ensure unique ideas each time
  const uniqueSeed = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  return `You are a content strategist for social creators. Generate ${ideaCount} FRESH, UNIQUE post ideas for today.

UNIQUENESS REQUIREMENT (CRITICAL):
- Session ID: ${uniqueSeed}
- EVERY idea must be completely NEW and DIFFERENT from anything you've generated before
- DO NOT repeat common/generic ideas like "behind the scenes", "day in my life", "Q&A" unless given a unique creative spin
- Be CREATIVE and SPECIFIC - avoid generic templates
- Each title, hook, and caption must be ORIGINAL and FRESH
- Think of angles, themes, and concepts that feel NEW and UNEXPECTED

PLATFORM: ${platform}
GOAL: ${goal}. ${goalGuidance}
EFFORT (minutes): ${effort}. ${effortGuidance}
PREFERRED FORMAT: ${format}. ${formatGuidance}
${platformFormatGuidance}
TONE: ${tone}.${personalityPrimary ? " SECONDARY for voice — creator personality block below overrides this label (and tone sliders) when they conflict." : " Keep hooks and copy in this voice."}
${effectiveToneStyleGuidance}
${spicyMode ? CONTENT_POLICY_SPICY : CONTENT_POLICY_SAFE}

${creatorContext ? `CREATOR PERSONALITY & NICHE (IMPORTANT - reflect this in ALL ideas):
${creatorContext}
${personalityPrimary ? `VOICE PRIORITY (PERSONALITY FIRST — TOGGLE ON):
- This personality text is PRIMARY for voice, attitude, hooks, and caption style in every idea.
- Ignore the TONE field above and the writing-style sliders when they conflict with the personality.
- Still align topics and CTAs with GOAL: ${goal} — express them in this brand voice.
` : ""}Generate ideas that match this personality - the tone, style, and content should feel authentic to who this creator is.
` : "No creator profile provided; use broad, relatable angles."}
${creatorProfileGuidance}
${opts.creatorHint ? `
CREATOR'S SPECIFIC REQUEST (MUST INCLUDE THIS):
The creator specifically requested: "${opts.creatorHint}"
This is CRITICAL - you MUST incorporate their exact keywords/theme into the ideas.
If they said "boobs", the ideas should be about that. If they said "beach", make it beach-focused.
DO NOT ignore or soften their request. The ideas must directly reflect what they asked for.
` : ""}
${useTrends && trendContext ? `TRENDS / CONTEXT (use where relevant):\n${trendContext}\n` : ""}
${fanHubGuidance}

${existingIdeasForContext?.length ? `EXISTING IDEAS (DO NOT DUPLICATE - generate completely different ideas):\n${existingIdeasForContext.map((i) => `${i.title}: ${i.hook}`).join("\n")}\n` : ""}

BLUEPRINT FORMAT (be SPECIFIC and ACTIONABLE):
Each idea should be a clear blueprint the creator can follow step-by-step. Not vague suggestions - EXACT instructions.

OUTPUT STRICT JSON ONLY (no markdown, no code fence):
{
  "ideas": [
    {
      "id": "idea_<short_unique_id>",
      "format": "${platform === "fan_hub" ? "photo | video | text | poll" : platform === "twitter" ? "tweet | thread | poll | video" : "reel | carousel | photo | story | mixed"}",
      "title": "Short punchy title (3-6 words)",
      "hook": "FULL ready-to-use caption (2-4 sentences). Optimize for GOAL + reach/engagement; may lean trend/personality/story — not only a literal shot description.",
      "shotList": ["SPECIFIC instruction 1: exactly what to show/do", "SPECIFIC instruction 2", "SPECIFIC instruction 3", "..."],
      "captionStarter": "Alternative caption opening they could use",
      "cta": "Specific call-to-action for this exact post",${platform === "fan_hub" ? "" : `
      "hashtags": ["#tag1", "#tag2", "..."],`}
      "whyThisWorks": "Why this specific idea will perform well",
      "trendBased": true/false,
      "trendContext": "Brief 5-10 word description of the trend (only if trendBased is true)"
    }
  ]
}

IMPORTANT RULES:
- shotList must have 3-5 SPECIFIC, ACTIONABLE items (not vague like "nice pose" - say exactly what pose, what angle, what to wear)
- hook should be a COMPLETE caption ready to copy/paste, not just one sentence
- Be EXPLICIT about what the content should include${platform === "fan_hub" ? `
- DO NOT include hashtags for My Page/Fan Hub content
- NEVER say "link in bio" - this is already their own page, no external links needed` : ""}
- If generating one (swap), return one idea in ideas array.`;
}

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

  const ok = await enforceRateLimit({
    req,
    res,
    keyPrefix: "generateDailyPostIdeas",
    limit: 30,
    windowMs: 60_000,
    identifier: authUser.uid,
  });
  if (!ok) return;

  const db = getAdminDb();
  const userDoc = await db.collection("users").doc(authUser.uid).get();
  const userData = userDoc.exists ? userDoc.data() : {};
  const settingsBlock = (userData?.settings || {}) as { creatorPersonality?: string };
  const creatorPersonality =
    (typeof userData?.creatorPersonality === "string" && userData.creatorPersonality.trim()
      ? userData.creatorPersonality
      : "") ||
    (typeof settingsBlock.creatorPersonality === "string" ? settingsBlock.creatorPersonality : "") ||
    "";
  const toneFromProfile = userData?.aiTone || userData?.tone || "";
  const niche = userData?.niche || "";
  // Get user's tone settings for style preferences
  const userToneSettings = userData?.settings?.tone || {};
  // Get creator profile for gender-aware content generation
  const creatorGender = userData?.creatorGender || "";
  const targetAudienceGender = userData?.targetAudienceGender || "";

  const {
    platform = "instagram",
    goal = "balanced_followers_engagement",
    effort = 15,
    format = "auto",
    tone,
    useTrends = false,
    spicyMode = false,
    swapId,
    seed,
    generateAllFormats = false,
    analyzeMyPageEngagement = false,
    creatorHint = "",
    prioritizeCreatorPersonality = false,
  } = (req.body || {}) as GenerateDailyPostIdeasBody;

  // Map balanced_followers_engagement to goal with engagement bias
  const mappedGoal =
    goal === "balanced_followers_engagement"
      ? "followers"
      : goal === "sales_subs"
      ? "sales_subs"
      : goal;

  const effectiveTone = tone || toneFromProfile || "relatable";
  const creatorContext = [creatorPersonality, niche].filter(Boolean).join("\n");

  const userPlan = typeof (userData as { plan?: string })?.plan === "string" ? (userData as { plan: string }).plan : "Free";
  const userRole = typeof (userData as { role?: string })?.role === "string" ? (userData as { role: string }).role : undefined;

  let trendContext = "";
  if (useTrends) {
    try {
      trendContext = await getLatestTrends();
    } catch (e) {
      console.warn("[generateDailyPostIdeas] getLatestTrends failed:", e);
      trendContext = "";
    }
    const nicheLabel = (niche || "lifestyle").trim().slice(0, 100);
    const platformLabel =
      platform === "fan_hub"
        ? "creator fan pages and membership feeds"
        : platform === "instagram"
          ? "Instagram Reels and feed"
          : platform === "twitter"
            ? "X Twitter"
            : platform === "facebook"
              ? "Facebook"
              : platform;
    const year = new Date().getFullYear();
    const trendQueries = [
      `${nicheLabel} ${platformLabel} viral hooks trends algorithm growth tips creators ${year}`,
    ];
    for (const q of trendQueries) {
      try {
        const sw = await searchWeb(q, authUser.uid, userPlan, userRole, {
          maxResults: 5,
          searchDepth: "basic",
          allowQuotaUserTrendSearch: true,
        });
        if (sw.success && sw.results?.length) {
          trendContext +=
            "\n\nLIVE WEB RESEARCH (Tavily — cite at least one concrete angle when relevant):\n" +
            sw.results.map((r, i) => `${i + 1}. ${r.title}: ${r.snippet}`).join("\n");
        }
      } catch (e) {
        console.warn("[generateDailyPostIdeas] Tavily search failed:", e);
      }
    }
  }

  const swapOnly = Boolean(swapId);
  let existingIdeas: DailyPostIdeaPayload[] = [];
  if (swapOnly && Array.isArray((req.body as any)?.existingIdeas)) {
    existingIdeas = (req.body as any).existingIdeas;
  }

  try {
    // For My Page / Fan Hub, fetch analytics data
    let fanHubAnalytics = undefined;
    if (platform === "fan_hub" && analyzeMyPageEngagement) {
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
        
        fanHubAnalytics = {
          topPostTypes: topTypes,
          avgLikes: Math.round(totalLikes / postCount),
          avgComments: Math.round(totalComments / postCount),
          topEngagementTimes: ["evenings", "weekends"],
          recentTips: tipsSnap.size,
        };
      } catch (e) {
        console.warn("Failed to fetch fan hub analytics:", e);
      }
    }

    const model = await getModelForTask("strategy", authUser.uid);
    const prompt = buildPrompt({
      platform,
      goal: mappedGoal,
      effort,
      format,
      tone: effectiveTone,
      useTrends,
      spicyMode: Boolean(spicyMode),
      creatorContext,
      trendContext,
      swapOnly,
      existingIdeasForContext: existingIdeas,
      toneSettings: userToneSettings,
      generateAllFormats: Boolean(generateAllFormats),
      analyzeMyPageEngagement: Boolean(analyzeMyPageEngagement),
      fanHubAnalytics,
      creatorGender,
      targetAudienceGender,
      creatorHint,
      prioritizeCreatorPersonality: Boolean(prioritizeCreatorPersonality),
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: seed ? 0.6 : 0.8,
      },
    });

    const raw = result.response.text().trim();
    let parsed: { ideas: DailyPostIdeaPayload[] };
    try {
      parsed = parseJSON(raw) as { ideas: DailyPostIdeaPayload[] };
    } catch (e) {
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned || "{}");
    }

    let ideas = Array.isArray(parsed?.ideas) ? parsed.ideas : [];
    
    // Process ideas - no AI image generation, frontend uses gradient + emoji
    const processedIdeas: typeof ideas = [];
    for (let index = 0; index < ideas.length; index++) {
      const idea = ideas[index];
      const baseIdea = {
        ...idea,
        id: idea.id || `idea_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        shotList: Array.isArray(idea.shotList) ? idea.shotList : [],
        hashtags: Array.isArray(idea.hashtags) ? idea.hashtags : [],
        placeholderImage: undefined, // Frontend will use gradient + emoji
        imageSource: undefined,
      };
      processedIdeas.push(baseIdea);
    }
    
    ideas = processedIdeas as DailyPostIdeaPayload[];

    if (ideas.length === 0) {
      res.status(200).json({ success: false, error: "No ideas generated", ideas: [] });
      return;
    }

    res.status(200).json({
      success: true,
      ideas,
      settings: {
        platform,
        goal: mappedGoal,
        effort,
        format,
        tone: effectiveTone,
        useTrends,
      },
    });
  } catch (error: any) {
    console.error("generateDailyPostIdeas error:", error);
    res.status(500).json({
      error: error?.message || "Failed to generate ideas",
      note: "Please try again.",
    });
  }
}
