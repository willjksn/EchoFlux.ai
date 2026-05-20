/**
 * Shared prompts + trend context for Fan Hub (My Page) post ideas and drop plans.
 * Focus: member retention and engagement — not graphic explicit content or OnlyFans-only framing.
 */

import { getAdultWeeklyTrends, getLatestTrends } from "./_trendsHelper.js";

/** Cached Mon/Thu Tavily digest: general social (IG, X, TikTok, etc.) + adult/creator trends. */
export async function getMemberHubTrendsContext(): Promise<string> {
  const [social, adult] = await Promise.all([
    getLatestTrends().catch(() => ""),
    getAdultWeeklyTrends().catch(() => ""),
  ]);
  const parts = [social, adult].filter((p) => p && p.trim().length > 0);
  if (parts.length === 0) {
    return "Trend data unavailable. Use proven member-retention and social content best practices.";
  }
  return parts.join("\n\n");
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
- Primary goal: keep paying members engaged, valued, and subscribed — reduce churn and ghosting.
- Mix content types: connection posts, exclusives, polls, BTS, voice-note prompts, soft PPV/drop teases, rewards for loyal members, and variety (not only sexual themes).
- Draw on what works on Instagram, TikTok, and X for hooks and formats, adapted for a private member feed (photo, video, text, poll — no reels/stories/carousels).
- Sensual or flirty angles are OK when they fit the creator niche and tone ceiling — never graphic or pornographic.
- Avoid repetitive hard-sell spam; balance free value with monetized drops/PPV.
`.trim();

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
- The personality text is the source of truth for voice, tone, and what to avoid.
- Do not contradict the personality with generic AI voice or default framing.
- Mirror the creator's style in every idea and description.
`.trim();
}
