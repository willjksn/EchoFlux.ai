/**
 * Shared prompts + trend context for Fan Hub (My Page) post ideas and drop plans.
 * Focus: member retention and engagement — not graphic explicit content or OnlyFans-only framing.
 */

import { getLatestTrends } from "./_trendsHelper.js";

/** Cached Mon/Thu Tavily digest: mainstream social trends (IG, X, TikTok) — not adult/OnlyFans defaults. */
export async function getMemberHubTrendsContext(): Promise<string> {
  const social = await getLatestTrends().catch(() => "");
  if (social && social.trim().length > 0) {
    return social;
  }
  return "Trend data unavailable. Use proven member-retention and social content best practices.";
}

/** True when the creator's prompt explicitly asks for sensual/spicy/adult angles. */
export function creatorHintRequestsSpicyContent(hint: string): boolean {
  const h = (hint || "").toLowerCase();
  return /\b(lingerie|bikini|swimwear|sexy|sensual|spicy|nsfw|nude|explicit|thirst|boudoir|onlyfans|ppv|tease|teasing|seductive|provocative|bedroom|lace)\b/.test(
    h,
  );
}

/** Blend profile explicitness with Content Preferences spiciness slider (0–100). */
export function getMemberHubToneGuidanceFromSettings(
  explicitnessLevel: number,
  spiciness?: number,
): string {
  const spice = typeof spiciness === "number" ? Math.max(0, Math.min(100, Math.round(spiciness))) : 0;
  const fromSpice = spice >= 70 ? 7 : spice >= 45 ? 5 : spice >= 20 ? 3 : 2;
  const level = Math.min(10, Math.max(0, Math.min(Math.round(explicitnessLevel), fromSpice)));
  return getMemberHubToneGuidance(level);
}

/**
 * Maps creator explicitness (0–10) to a ceiling — sensual/teasing allowed, never pornographic.
 */
export function getMemberHubToneGuidance(explicitnessLevel: number): string {
  const level = Math.min(10, Math.max(0, Math.round(explicitnessLevel)));
  if (level >= 8) {
    return `Tone ceiling (${level}/10): bold, flirty, sensual, and intimate — strong desire and closeness. Do NOT describe graphic sex acts, pornographic detail, or explicit body-part focus.`;
  }
  if (level >= 5) {
    return `Tone ceiling (${level}/10): playful, teasing, suggestive — chemistry and anticipation. Stay suggestive, not explicit.`;
  }
  return `Tone ceiling (${level}/10): warm, personal, conversational — lifestyle, BTS, polls, gratitude, and connection. Keep ideas broadly engaging.`;
}

export const MEMBER_HUB_RETENTION_SYSTEM = `
MEMBER HUB CONTENT (My Page / paid fan feed):
- Voice: natural, human, and current — use hot phrases from trend research when they fit; avoid stale AI-default templates ("spill the tea", "main character energy", etc.).
- Primary goal: keep paying members engaged, valued, and subscribed — reduce churn and ghosting.
- DEFAULT to broad creator-appropriate topics: lifestyle, personality, hobbies, BTS, polls, Q&A, gratitude, milestones, humor, fitness, travel, art, music, pets, work life — match niche + personality + tone settings.
- Do NOT default to lingerie, bikini, bedroom, or OnlyFans-style framing unless the creator hint or personality explicitly requests it.
- Mix content types: connection posts, exclusives, polls, BTS, voice-note prompts, soft drop/PPV teases, rewards for loyal members.
- Draw on what works on Instagram, TikTok, and X for hooks and formats, adapted for a private member feed (photo, video, text, poll — no reels/stories/carousels).
- Sensual or flirty angles are OK only when they fit creator hint, personality, niche, or tone ceiling — never graphic or pornographic.
- Avoid repetitive hard-sell spam; balance free value with monetized drops/PPV.
`.trim();

export function buildMemberHubCreatorContext(opts: {
  creatorPersonality: string;
  aiPersonality: string;
  aiTone: string;
  niche: string;
  toneSettings?: {
    formality?: number;
    humor?: number;
    empathy?: number;
    spiciness?: number;
    profanity?: number;
    emojiLevel?: number;
  };
  prioritizeCreatorPersonality: boolean;
}): string {
  const parts: string[] = [];
  const overrideOn =
    opts.prioritizeCreatorPersonality && !!opts.creatorPersonality.trim();
  const personalityBlock = buildCreatorPersonalityBlock(
    opts.creatorPersonality,
    overrideOn,
  );
  if (personalityBlock) parts.push(personalityBlock);

  const secondaryLabel = overrideOn
    ? "SECONDARY (after Personality Override — apply where consistent; override wins conflicts)"
    : "PRIMARY for voice (Personality Override is off)";

  if (opts.aiPersonality.trim()) {
    parts.push(
      `AI PERSONALITY & TRAINING — ${secondaryLabel} (Settings → Profile & AI):\n${opts.aiPersonality.trim()}`,
    );
  }
  if (opts.aiTone.trim()) {
    parts.push(`Default AI tone — ${secondaryLabel}: ${opts.aiTone.trim()}`);
  }
  if (opts.niche.trim()) {
    parts.push(`Niche: ${opts.niche.trim()}`);
  }
  const ts = opts.toneSettings;
  if (ts && typeof ts === "object") {
    const lines: string[] = [];
    if (typeof ts.formality === "number") lines.push(`Formality: ${ts.formality}/100`);
    if (typeof ts.humor === "number") lines.push(`Humor: ${ts.humor}/100`);
    if (typeof ts.empathy === "number") lines.push(`Warmth: ${ts.empathy}/100`);
    if (typeof ts.spiciness === "number") lines.push(`Spiciness: ${ts.spiciness}/100`);
    if (typeof ts.profanity === "number") lines.push(`Profanity: ${ts.profanity}/100`);
    if (typeof ts.emojiLevel === "number") lines.push(`Emoji level: ${ts.emojiLevel}/100`);
    if (lines.length) {
      parts.push(
        `CONTENT PREFERENCES (tone sliders) — ${secondaryLabel}:\n${lines.map((l) => `- ${l}`).join("\n")}`,
      );
    }
  }
  return parts.filter(Boolean).join("\n\n");
}

export function buildMemberHubNicheLine(niche?: string | null): string {
  const n = (niche || "").trim() || "Creator";
  return `Creator niche: ${n}. Tailor hooks and angles to this niche while prioritizing retention.`;
}

/** When prioritize is true, personality leads the prompt (Plan / Fan Hub parity). */
export function buildCreatorPersonalityBlock(
  personality: string | null | undefined,
  prioritize: boolean,
): string {
  const p = (personality || "").trim();
  if (!p) return "";
  if (!prioritize) {
    return "";
  }
  return `
CREATOR PERSONALITY (PRIMARY — read before trends and other instructions; voice and boundaries):
${p}

WRITING STYLE (personality-first):
- The Personality Override text is the source of truth for voice, tone, and what to avoid.
- Then apply AI personality & training and Content Preferences (tone sliders) from Settings → Profile & AI as secondary refinements.
- Where secondary settings conflict with the override, the override wins.
- Mirror the creator's style in every idea and description.
`.trim();
}
