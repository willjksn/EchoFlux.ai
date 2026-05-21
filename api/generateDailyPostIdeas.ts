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
import {
  MEMBER_HUB_RETENTION_SYSTEM,
  buildMemberHubCreatorContext,
  buildMemberHubNicheLine,
  creatorHintRequestsSpicyContent,
  getMemberHubToneGuidanceFromSettings,
  getMemberHubTrendsContext,
} from "./_memberHubContentContext.js";

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
  toneSettings?: {
    formality?: number;
    humor?: number;
    empathy?: number;
    spiciness?: number;
    profanity?: number;
    emojiLevel?: number;
  };
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
  memberHubToneLine?: string;
  niche?: string;
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
        ? "Generate exactly 3 ideas: ONE photo, ONE video, and ONE text post (poll only if it clearly fits the creator hint better than text). Each idea MUST include a full creation blueprint in shotList — not caption-only."
        : platform === "twitter"
        ? "Generate 3 varied X/Twitter ideas: tweets, threads, polls, or short videos."
        : (opts as any).generateAllFormats
        ? "Generate exactly 4 ideas, ONE for each format: 1 Reel, 1 Carousel, 1 Photo, 1 Story. Each must be clearly suited to its format."
        : "Generate a mix: e.g. 2 reels + 1 carousel, or 1 reel + 1 photo + 1 story, varied and scannable."
      : `Prefer format: ${format}. All ideas should be clearly ${format}-friendly.`;

  const personalityPrimary = Boolean(opts.prioritizeCreatorPersonality);

  // When personality leads, the personality text is the source of truth for voice and boundaries.
  const toneStyleGuidance = toneSettings
    ? personalityPrimary
      ? `
WRITING STYLE (order: Personality Override → AI personality & tone sliders below):
${toneSettings.formality !== undefined ? `- Formality (${toneSettings.formality}/100): apply after override; override wins if they conflict` : ''}
${toneSettings.humor !== undefined ? `- Humor (${toneSettings.humor}/100): apply after override` : ''}
${toneSettings.empathy !== undefined ? `- Warmth (${toneSettings.empathy}/100): apply after override` : ''}
${toneSettings.profanity !== undefined && toneSettings.profanity > 0 ? `- Profanity (${toneSettings.profanity}/100): only if override + sliders allow` : '- Keep language clean unless override and sliders allow profanity'}
${toneSettings.emojiLevel !== undefined ? `- Emoji usage (${toneSettings.emojiLevel}/100): ${toneSettings.emojiLevel < 20 ? 'No emojis in hook/captionStarter' : toneSettings.emojiLevel < 40 ? 'At most 1-2 emojis total' : toneSettings.emojiLevel < 60 ? 'Moderate emojis (a few, purposeful)' : 'Liberal, expressive emoji use that matches the voice'}` : ''}
- Personality Override defines voice and boundaries first; AI personality/training and sliders refine hooks second.
- If the override is calm, quiet, soft, classy, gentle, reserved, or wholesome, do NOT add profanity or spicy language even if sliders are high.
- Only use flirtiness or profanity when the override (and optionally sliders) clearly support it.
`
      : `
WRITING STYLE PREFERENCES (apply to hook and captionStarter):
${toneSettings.formality !== undefined ? `- Formality (${toneSettings.formality}/100): ${toneSettings.formality < 30 ? 'Very casual, use slang' : toneSettings.formality < 50 ? 'Casual and conversational' : toneSettings.formality < 70 ? 'Balanced tone' : 'Professional and polished'}` : ''}
${toneSettings.humor !== undefined ? `- Humor (${toneSettings.humor}/100): ${toneSettings.humor < 30 ? 'Serious, minimal humor' : toneSettings.humor < 50 ? 'Light occasional humor' : toneSettings.humor < 70 ? 'Witty and playful' : 'Very funny, comedic'}` : ''}
${toneSettings.empathy !== undefined ? `- Warmth (${toneSettings.empathy}/100): ${toneSettings.empathy < 30 ? 'Direct and straightforward' : toneSettings.empathy < 50 ? 'Friendly' : toneSettings.empathy < 70 ? 'Warm and understanding' : 'Very supportive'}` : ''}
${toneSettings.profanity !== undefined && toneSettings.profanity > 0 ? `- Profanity (${toneSettings.profanity}/100): ${toneSettings.profanity < 30 ? 'Very mild swearing OK' : toneSettings.profanity < 50 ? 'Moderate casual swearing' : 'Frequent swearing acceptable'}` : '- Keep language clean, no swearing'}
${toneSettings.emojiLevel !== undefined ? `- Emoji usage (${toneSettings.emojiLevel}/100): ${toneSettings.emojiLevel < 20 ? 'No emojis in hook/captionStarter' : toneSettings.emojiLevel < 40 ? 'At most 1-2 emojis total' : toneSettings.emojiLevel < 60 ? 'Moderate emojis (a few, purposeful)' : 'Liberal, expressive emoji use that matches the voice'}` : ''}
`
    : "";

  const spice = typeof toneSettings?.spiciness === "number" ? Math.max(0, Math.min(100, Math.round(toneSettings.spiciness))) : 0;
  const spicinessGuidance =
    spice > 0
      ? `
SPICINESS / BORDERLINE EXPLICITNESS (${spice}/100)${personalityPrimary ? " — secondary to Personality Override" : ""}:
- ${spice < 35 ? "Light flirtiness only: suggestive wording is subtle, tasteful, and still mainstream-safe." : spice < 70 ? "Noticeable flirtiness: hooks can be teasing, body-confident, and a little provocative without becoming explicit." : "Bold edge: hooks can be provocative and boundary-pushing for creator-owned spaces, while avoiding illegal content, harassment, or platform-banned claims."}
- Keep the level consistent across title, hook, captionStarter, and shotList. Do not randomly sanitize spicy requests into generic lifestyle content.
${personalityPrimary ? "- If Personality Override is clean/reserved, cap spiciness to what the override allows even when this slider is high." : ""}
`
      : "";

  const fanHubBlueprintBlock =
    platform === "fan_hub"
      ? `
FAN HUB CREATION BLUEPRINT (MOST IMPORTANT — creators need WHAT TO MAKE, not just captions):
- Each idea = (1) format + (2) title naming the concept + (3) shotList = step-by-step what to photograph, film, or write + (4) hook = separate caption for members.
- shotList is REQUIRED with 4–5 SPECIFIC bullets. Never return an idea with an empty shotList.
- title describes the POST CONCEPT (what members will see), NOT the caption text.
- hook/captionStarter are SECONDARY — written after the visual/text concept is defined.

Format-specific shotList rules:
- photo: outfit, pose, setting/background, lighting, camera angle/framing, expression/vibe (5 bullets).
- video: length (sec), opening frame, movement/action, outfit/setting, audio/music or voice note, ending beat (5 bullets).
- text: post structure (lines/paragraphs), topics to cover, tone, optional emoji, CTA for replies (4–5 bullets).
- poll: exact question text + 2–4 answer options members tap (as shotList items).

${opts.memberHubToneLine || ""}
${MEMBER_HUB_RETENTION_SYSTEM}
${buildMemberHubNicheLine(opts.niche)}
`
      : "";

  const contentPolicyBlock =
    platform === "fan_hub"
      ? fanHubBlueprintBlock
      : personalityPrimary
        ? `
CONTENT POLICY (PERSONALITY OVERRIDE):
- Let the creator personality define how spicy, flirty, clean, quiet, profane, or reserved the copy should be.
- If the personality clearly says flirty, sensual, bold, spicy, or provocative, you may use tasteful flirtiness that fits it.
- If the personality says calm, quiet, soft, classy, gentle, reserved, clean, wholesome, or similar, keep ideas clean and do NOT add profanity or flirtiness.
- Never become explicit or unsafe unless the personality clearly asks for an adult edge and the platform/context allows it.
`
        : spicyMode
          ? CONTENT_POLICY_SPICY
          : CONTENT_POLICY_SAFE;

  const ideaCount = swapOnly ? "ONE" : opts.generateAllFormats ? "exactly 4 (one per format: Reel, Carousel, Photo, Story)" : "exactly 3";
  
  // Creator profile guidance — not used on Fan Hub (avoids default lingerie/spicy framing)
  const creatorProfileGuidance =
    platform === "fan_hub"
      ? ""
      : (opts.creatorGender || opts.targetAudienceGender)
        ? `
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
`
        : "";
  
  // Fan Hub / My Page specific guidance
  const fanHubGuidance = opts.platform === "fan_hub"
    ? `${opts.fanHubAnalytics ? `
FAN HUB ANALYTICS CONTEXT:
- Your top performing post types: ${opts.fanHubAnalytics.topPostTypes?.join(", ") || "varied content"}
- Average likes per post: ${opts.fanHubAnalytics.avgLikes || "N/A"}
- Average comments per post: ${opts.fanHubAnalytics.avgComments || "N/A"}
- Best engagement times: ${opts.fanHubAnalytics.topEngagementTimes?.join(", ") || "varies"}
- Recent tip activity: ${opts.fanHubAnalytics.recentTips || 0} tips this week

Generate ideas that mirror your top-performing content patterns. Focus on what drives engagement, tips, and subscriber retention.
` : ""}
Prioritize shotList blueprints members can execute today. Hooks should complement the visual/text — never replace the blueprint.
`
    : "";

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
TONE: ${tone}.${personalityPrimary ? " Tertiary label — Personality Override is primary, then AI personality & tone sliders in the creator block below." : " Keep hooks and copy in this voice together with AI personality and tone sliders below."}
${toneStyleGuidance}
${spicinessGuidance}
${contentPolicyBlock}

${creatorContext ? `${personalityPrimary ? "CREATOR PERSONALITY & NICHE" : "CREATOR PROFILE (AI training, tone settings, niche)"} (reflect in ALL ideas):
${creatorContext}
${personalityPrimary ? `VOICE PRIORITY (PERSONALITY OVERRIDE ON):
1. CREATOR PERSONALITY (override) — PRIMARY for voice, attitude, hooks, and caption style.
2. AI PERSONALITY & TRAINING + CONTENT PREFERENCES (tone sliders) in the same block — SECONDARY; apply after the override where they fit.
3. TRENDS — topics and formats only; do not import trend-speak into hooks.
- When override and sliders conflict, the override wins.
- Still align topics and CTAs with GOAL: ${goal}.
` : `PERSONALITY OVERRIDE OFF:
- Use AI personality/training, tone sliders, niche, and the creator hint for voice (override field is not primary).
- Do not default to lingerie or OnlyFans-style framing unless the creator hint requests it.
`}${personalityPrimary ? " Match the override first, then refine with AI personality and tone sliders." : " Keep hooks aligned with AI personality, tone settings, and niche."}
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
${personalityPrimary ? `
FINAL CHECK — HOOKS: If a hook could fit any creator in this niche, rewrite until it clearly matches the Personality Override, then AI personality/tone sliders above.
` : ""}

BLUEPRINT FORMAT (be SPECIFIC and ACTIONABLE):
Each idea should be a clear blueprint the creator can follow step-by-step. Not vague suggestions - EXACT instructions.

OUTPUT STRICT JSON ONLY (no markdown, no code fence):
{
  "ideas": [
    {
      "id": "idea_<short_unique_id>",
      "format": "${platform === "fan_hub" ? "photo | video | text | poll" : platform === "twitter" ? "tweet | thread | poll | video" : "reel | carousel | photo | story | mixed"}",
      "title": "Short punchy title (3-6 words)",
      "hook": "FULL ready-to-use caption (2-4 sentences), FIRST PERSON (I/my/we — never third-person narrator). Optimize for GOAL + reach/engagement; match WRITING STYLE PREFERENCES for emojis and tone.",
      "shotList": ["SPECIFIC instruction 1: exactly what to show/do", "SPECIFIC instruction 2", "SPECIFIC instruction 3", "..."],
      "captionStarter": "Alternative first-person opening line (same emoji/tone rules as hook)",
      "cta": "Specific call-to-action for this exact post",${platform === "fan_hub" ? "" : `
      "hashtags": ["#tag1", "#tag2", "..."],`}
      "whyThisWorks": "Why this specific idea will perform well",
      "trendBased": true/false,
      "trendContext": "Brief 5-10 word description of the trend (only if trendBased is true)"
    }
  ]
}

IMPORTANT RULES:
- shotList must have ${platform === "fan_hub" ? "4-5" : "3-5"} SPECIFIC, ACTIONABLE items (not vague like "nice pose" - say exactly what pose, what angle, what to wear)
${platform === "fan_hub" ? `- REJECT caption-only ideas: if shotList would be empty, rewrite until shotList fully describes what to create
- hook should be a COMPLETE member-feed caption (2-4 sentences) that pairs with the shotList — do NOT repeat shotList items verbatim as the only content` : `- hook should be a COMPLETE caption ready to copy/paste, not just one sentence — scroll-stopping and conversational, not a dull restatement of the title; always first-person creator voice, not "explaining" the post in third person`}
- NEVER prefix hook or captionStarter with "Reel:", "Post:", "Story:", or similar format labels (format is in the JSON "format" field only)
- Be EXPLICIT about what the content should include${platform === "fan_hub" ? `
- DO NOT include hashtags for My Page/Fan Hub content
- NEVER say "link in bio" - this is already their own page, no external links needed` : ""}
- If generating one (swap), return one idea in ideas array.`;
}

function normalizeIdeaShotList(idea: DailyPostIdeaPayload & Record<string, unknown>): string[] {
  const fromShot = Array.isArray(idea.shotList)
    ? idea.shotList.map((s) => String(s).trim()).filter(Boolean)
    : [];
  if (fromShot.length > 0) return fromShot;
  const alt = idea.whatToCreate ?? idea.whatToShow ?? idea.contentBrief ?? idea.creationBlueprint;
  if (Array.isArray(alt)) {
    return alt.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof alt === "string" && alt.trim()) {
    return alt
      .split(/\n+/)
      .map((line) => line.replace(/^[-•*]\s*/, "").trim())
      .filter(Boolean);
  }
  return [];
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
  const aiPersonality =
    (typeof userData?.aiPersonality === "string" ? userData.aiPersonality : "") || "";
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
    toneSettings: requestToneSettings,
  } = (req.body || {}) as GenerateDailyPostIdeasBody;

  // Map balanced_followers_engagement to goal with engagement bias
  const mappedGoal =
    goal === "balanced_followers_engagement"
      ? "followers"
      : goal === "sales_subs"
      ? "sales_subs"
      : goal;

  const effectiveTone = tone || toneFromProfile || "relatable";
  const mergedToneSettings = { ...userToneSettings, ...(requestToneSettings || {}) };
  const isFanHub = platform === "fan_hub";
  const prioritizePersonality = Boolean(prioritizeCreatorPersonality);
  const creatorContext = isFanHub
    ? buildMemberHubCreatorContext({
        creatorPersonality,
        aiPersonality,
        aiTone: toneFromProfile,
        niche,
        toneSettings: mergedToneSettings,
        prioritizeCreatorPersonality: prioritizePersonality,
      })
    : [creatorPersonality, niche].filter(Boolean).join("\n");

  const userPlan = typeof (userData as { plan?: string })?.plan === "string" ? (userData as { plan: string }).plan : "Free";
  const userRole = typeof (userData as { role?: string })?.role === "string" ? (userData as { role: string }).role : undefined;

  const explicitnessLevel =
    typeof userData?.explicitnessLevel === "number" ? userData.explicitnessLevel : 6;
  const fanHubSpiciness =
    typeof mergedToneSettings.spiciness === "number" ? mergedToneSettings.spiciness : 0;
  const effectiveSpicyMode = isFanHub
    ? creatorHintRequestsSpicyContent(creatorHint)
    : Boolean(spicyMode);

  let trendContext = "";
  if (useTrends) {
    if (platform === "fan_hub") {
      try {
        trendContext = await getMemberHubTrendsContext();
      } catch (e) {
        console.warn("[generateDailyPostIdeas] Member hub trends failed:", e);
      }
    }
    try {
      const socialTrends = await getLatestTrends();
      if (socialTrends) {
        trendContext = trendContext
          ? `${trendContext}\n\n${socialTrends}`
          : socialTrends;
      }
    } catch (e) {
      console.warn("[generateDailyPostIdeas] getLatestTrends failed:", e);
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
    if (platform !== "fan_hub") {
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
      spicyMode: effectiveSpicyMode,
      creatorContext,
      trendContext,
      swapOnly,
      existingIdeasForContext: existingIdeas,
      toneSettings: mergedToneSettings,
      generateAllFormats: Boolean(generateAllFormats),
      analyzeMyPageEngagement: Boolean(analyzeMyPageEngagement),
      fanHubAnalytics,
      creatorGender: isFanHub ? undefined : creatorGender,
      targetAudienceGender: isFanHub ? undefined : targetAudienceGender,
      creatorHint,
      prioritizeCreatorPersonality: prioritizePersonality,
      memberHubToneLine: isFanHub
        ? getMemberHubToneGuidanceFromSettings(explicitnessLevel, fanHubSpiciness)
        : undefined,
      niche,
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
      const shotList = normalizeIdeaShotList(idea as DailyPostIdeaPayload & Record<string, unknown>);
      const baseIdea = {
        ...idea,
        id: idea.id || `idea_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        shotList,
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
