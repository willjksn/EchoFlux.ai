// api/generateDailyPostIdeas.ts
// Instant "What to Post" ideas: 3 post ideas with optional regenerateAll or regenerateSingle (swap one card).
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getModelForTask, getModelNameForTask, getCostTierForTask } from "./_modelRouter.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { parseJSON } from "./_geminiShared.js";
import { enforceRateLimit } from "./_rateLimit.js";

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
}

export interface GenerateDailyPostIdeasBody {
  platform?: string;
  goal?: string;
  effort?: number;
  format?: string;
  tone?: string;
  useTrends?: boolean;
  spicyMode?: boolean;
  /** When set, regenerate only this idea (swap one card); otherwise generate 3 new ideas. */
  swapId?: string;
  /** Optional seed for deterministic swap (e.g. existing idea id). */
  seed?: string;
}

const CONTENT_POLICY = `
CONTENT POLICY (non-explicit, IG-like):
- Lingerie, bikini, implied nudity are allowed.
- Nipples/genitals must not be discernible; no explicit sex acts; no sexting-services framing.
- Keep ideas suitable for broad social (Instagram, TikTok, etc.) unless user context clearly indicates otherwise.
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

  const formatGuidance =
    format === "auto"
      ? "Generate a mix: e.g. 2 reels + 1 carousel, or 1 reel + 1 photo + 1 story, varied and scannable."
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

  return `You are a content strategist for social creators. Generate ${swapOnly ? "ONE" : "exactly 3"} post ideas for today.

PLATFORM: ${platform}
GOAL: ${goal}. ${goalGuidance}
EFFORT (minutes): ${effort}. ${effortGuidance}
PREFERRED FORMAT: ${format}. ${formatGuidance}
TONE: ${tone}. Keep hooks and copy in this voice.
${spicyMode ? "Creator allows slightly bolder/sexier framing (still non-explicit per policy)." : "Keep content family-friendly and broadly safe."}
${toneStyleGuidance}
${CONTENT_POLICY}

${creatorContext ? `CREATOR CONTEXT (use to tailor ideas):\n${creatorContext}\n` : "No creator profile provided; use broad, relatable angles."}

${useTrends && trendContext ? `TRENDS / CONTEXT (use where relevant):\n${trendContext}\n` : ""}

${existingIdeasForContext?.length ? `EXISTING IDEAS (avoid duplicating; generate one different idea for swap):\n${existingIdeasForContext.map((i) => `${i.title}: ${i.hook}`).join("\n")}\n` : ""}

OUTPUT STRICT JSON ONLY (no markdown, no code fence):
{
  "ideas": [
    {
      "id": "idea_<short_unique_id>",
      "format": "reel" | "carousel" | "photo" | "story" | "mixed",
      "title": "Short punchy title (3-6 words)",
      "hook": "One sentence that grabs attention (first line of caption)",
      "shotList": ["Shot/scene 1", "Shot 2", "Shot 3", "..."],
      "captionStarter": "Optional 1-2 sentence caption start",
      "cta": "Optional call-to-action line",
      "hashtags": ["#tag1", "#tag2", "..."],
      "whyThisWorks": "One sentence on why this fits the goal/platform"
    }
  ]
}

Rules: shotList must have 3-5 items. id must be unique. If generating one (swap), return one idea in ideas array.`;
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
  const creatorPersonality = userData?.creatorPersonality || "";
  const toneFromProfile = userData?.aiTone || userData?.tone || "";
  const niche = userData?.niche || "";
  // Get user's tone settings for style preferences
  const userToneSettings = userData?.settings?.tone || {};

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

  let trendContext = "";
  if (useTrends) {
    try {
      const trendRes = await fetch(
        `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}/api/getTrendingContext`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: (req.headers.authorization as string) || "",
          },
          body: JSON.stringify({ niche: niche || "lifestyle", platforms: [platform] }),
        }
      );
      if (trendRes.ok) {
        const data = await trendRes.json();
        trendContext = data.trendContext || "";
      }
    } catch (e) {
      console.warn("Trends fetch failed:", e);
    }
  }

  const swapOnly = Boolean(swapId);
  let existingIdeas: DailyPostIdeaPayload[] = [];
  if (swapOnly && Array.isArray((req.body as any)?.existingIdeas)) {
    existingIdeas = (req.body as any).existingIdeas;
  }

  try {
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
    ideas = ideas.map((i) => ({
      ...i,
      id: i.id || `idea_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      shotList: Array.isArray(i.shotList) ? i.shotList : [],
      hashtags: Array.isArray(i.hashtags) ? i.hashtags : [],
    }));

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
