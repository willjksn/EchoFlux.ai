// Server-only: Gemini generates `generatedProfile` JSON; validated and merged in saveCreatorIdentity.

import { getModelForTask } from "./_modelRouter.js";
import type { CreatorIdentityProfile } from "../src/lib/creatorIdentity/types.js";
import { NICHE_LABEL } from "../src/lib/creatorIdentity/synthesize.js";

/** Open responses explicitly about beauty / glam — then model may use that vocabulary. */
const BEAUTY_GLAM_OPEN_RE =
  /\b(beauty|makeup|cosmetics?|skincare|glam|glamour|\bmua\b|esthetician|sephora|ulta|lipstick|eyeshadow|contour|lashes|foundation\b|hair\s+stylist|nail\s+tech|nails)\b/i;

function joinedOpenText(profile: CreatorIdentityProfile): string {
  const o = profile.rawAnswers.openText;
  const keys = ["q14", "q15", "q16", "q17", "followup_clarifications"] as const;
  const parts: string[] = [];
  for (const k of keys) {
    const v = (o as Record<string, string | undefined>)[k];
    if (typeof v === "string" && v.trim()) parts.push(v);
  }
  return parts.join("\n");
}

function allowBeautyGlamVocabulary(profile: CreatorIdentityProfile): boolean {
  if (profile.primaryNiche === "beauty" || profile.secondaryNiche === "beauty") return true;
  if (BEAUTY_GLAM_OPEN_RE.test(joinedOpenText(profile))) return true;
  const top = Object.entries(profile.nicheScores)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])[0];
  if (top && top[0] === "beauty" && top[1] >= 6) return true;
  return false;
}

function topNicheLabelsHuman(profile: CreatorIdentityProfile, n: number): string {
  return Object.entries(profile.nicheScores)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => NICHE_LABEL[k] || k.replace(/_/g, " "))
    .join(", ");
}

const MAX = {
  brandSummary: 1200,
  brandStatement: 600,
  pageHeadline: 120,
  pageSubheadline: 220,
  shortBio: 500,
  longBio: 2000,
  welcomeMessage: 800,
  arrayItem: 200,
  ctaCount: 6,
  offerCount: 8,
  pillarCount: 8,
  studioTag: 120,
  studioTagsPerKey: 12,
};

function trimStr(x: unknown, max: number): string | null {
  if (typeof x !== "string") return null;
  const t = x.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function stringArray(x: unknown, maxItems: number, itemMax: number): string[] {
  if (!Array.isArray(x)) return [];
  const out: string[] = [];
  for (const i of x) {
    if (out.length >= maxItems) break;
    const s = trimStr(i, itemMax);
    if (s) out.push(s);
  }
  return out;
}

function studioBlock(x: unknown): CreatorIdentityProfile["generatedProfile"]["premiumStudioProfile"] {
  if (!x || typeof x !== "object") return undefined;
  const o = x as Record<string, unknown>;
  const contentStyle = stringArray(o.contentStyle, MAX.studioTagsPerKey, MAX.studioTag);
  const messageTone = stringArray(o.messageTone, MAX.studioTagsPerKey, MAX.studioTag);
  const audienceIntent = stringArray(o.audienceIntent, MAX.studioTagsPerKey, MAX.studioTag);
  const monetizationFocus = stringArray(o.monetizationFocus, MAX.studioTagsPerKey, MAX.studioTag);
  if (!contentStyle.length && !messageTone.length && !audienceIntent.length && !monetizationFocus.length) {
    return undefined;
  }
  return { contentStyle, messageTone, audienceIntent, monetizationFocus };
}

/**
 * Parse model output; returns null if required fields are missing or invalid.
 */
export function parseGeneratedProfileJson(
  raw: unknown,
  fallback: CreatorIdentityProfile["generatedProfile"]
): CreatorIdentityProfile["generatedProfile"] | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const brandSummary = trimStr(o.brandSummary, MAX.brandSummary);
  const brandStatement = trimStr(o.brandStatement, MAX.brandStatement);
  const pageHeadline = trimStr(o.pageHeadline, MAX.pageHeadline);
  const pageSubheadline = trimStr(o.pageSubheadline, MAX.pageSubheadline);
  const shortBio = trimStr(o.shortBio, MAX.shortBio);
  const suggestedCTAs = stringArray(o.suggestedCTAs, MAX.ctaCount, MAX.arrayItem);
  const suggestedOffers = stringArray(o.suggestedOffers, MAX.offerCount, MAX.arrayItem);
  const suggestedContentPillars = stringArray(o.suggestedContentPillars, MAX.pillarCount, MAX.arrayItem);

  if (!brandSummary || !brandStatement || !pageHeadline || !pageSubheadline || !shortBio) return null;
  if (suggestedCTAs.length < 1 || suggestedOffers.length < 1 || suggestedContentPillars.length < 1) return null;

  const longBio = trimStr(o.longBio, MAX.longBio);
  const welcomeMessage = trimStr(o.welcomeMessage, MAX.welcomeMessage);
  const suggestedMembershipName = trimStr(o.suggestedMembershipName, 120);
  const suggestedMembershipDescription = trimStr(o.suggestedMembershipDescription, 400);
  const premiumStudioProfile = studioBlock(o.premiumStudioProfile);

  return {
    brandSummary,
    brandStatement,
    pageHeadline,
    pageSubheadline,
    shortBio,
    ...(longBio ? { longBio } : {}),
    ...(welcomeMessage ? { welcomeMessage } : {}),
    suggestedCTAs,
    suggestedOffers,
    suggestedContentPillars,
    ...(suggestedMembershipName ? { suggestedMembershipName } : {}),
    ...(suggestedMembershipDescription ? { suggestedMembershipDescription } : {}),
    ...(premiumStudioProfile ? { premiumStudioProfile } : {}),
  };
}

function signalsSummary(profile: CreatorIdentityProfile): string {
  const lines: string[] = [];
  lines.push(`primaryNiche: ${profile.primaryNiche ?? "null"}`);
  lines.push(`secondaryNiche: ${profile.secondaryNiche ?? "null"}`);
  lines.push(`confidenceScore: ${profile.confidenceScore}, clarityLevel: ${profile.clarityLevel}`);
  lines.push(`brandVibes: ${profile.brandVibes.join(", ") || "(none)"}`);
  lines.push(`audienceDrivers: ${profile.audienceDrivers.join(", ") || "(none)"}`);
  lines.push(`monetizationFits: ${profile.monetizationFits.join(", ") || "(none)"}`);
  const topNiches = Object.entries(profile.nicheScores)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, v]) => `${k}:${v}`);
  lines.push(`nicheScores (top): ${topNiches.join(", ") || "(none)"}`);
  return lines.join("\n");
}

function compactQuizPayload(profile: CreatorIdentityProfile): string {
  const { structured, openText } = profile.rawAnswers;
  const openTrim: Record<string, string> = {};
  for (const [k, v] of Object.entries(openText)) {
    if (typeof v === "string" && v.trim()) {
      const t = v.trim();
      openTrim[k] = t.length > 800 ? `${t.slice(0, 800)}…` : t;
    }
  }
  return JSON.stringify({ structured, openText: openTrim });
}

export async function tryAiGeneratedProfile(
  profile: CreatorIdentityProfile,
  userId: string,
  fallback: CreatorIdentityProfile["generatedProfile"]
): Promise<CreatorIdentityProfile["generatedProfile"] | null> {
  const model = await getModelForTask("brand", userId);

  const templateHint = JSON.stringify({
    brandSummary: fallback.brandSummary.slice(0, 400),
    pageHeadline: fallback.pageHeadline,
    pageSubheadline: fallback.pageSubheadline,
  });

  const beautyOk = allowBeautyGlamVocabulary(profile);
  const topNicheHuman = topNicheLabelsHuman(profile, 4);
  const beautyVocabBlock = beautyOk
    ? `Beauty / glam vocabulary: ALLOWED — primary or secondary niche is Beauty, open-text mentions beauty/makeup/skincare/glam, or beauty is the clear top scored niche. You may use industry-appropriate language when it fits.`
    : `Beauty / glam vocabulary: NOT ALLOWED for this profile.
- Do not use: glam, glamour, glammed, "aesthetic" as a filler noun, beauty guru, makeup muse, flawless beauty, glow-up culture, or similar influencer-beauty clichés.
- Prefer language that matches their actual top niches: ${topNicheHuman || "(see nicheScores)"}. Use neutral phrases: energy, presence, voice, story, perspective, craft, community, visuals, taste, style — without implying a beauty creator.
- Fashion, fitness, gaming, music, advice, humor, lifestyle, etc. are NOT beauty — do not collapse them into beauty framing.`;

  const prompt = `You write fan-facing creator brand copy for a subscription / creator platform. The creator completed a structured quiz. Use their answers and the scored signals to write cohesive, specific copy — do NOT merely rearrange quiz labels; synthesize a believable brand voice from open-text answers when present.

Scored profile (internal ids; translate to natural language for fans):
${signalsSummary(profile)}

Quiz answers (JSON; structured selections + openText fields):
${compactQuizPayload(profile)}

Template baseline (improve on this; keep factual alignment with the quiz):
${templateHint}

${beautyVocabBlock}

Rules:
- Stay consistent with the quiz; do not invent platforms, follower counts, or offers they did not imply.
- Tone: confident, clear, fan-friendly; avoid cringe or generic filler ("world-class", "unlock your potential").
- No markdown in string values. No emojis unless the quiz open-text strongly suggests playful tone.
- Headlines for a hero: pageHeadline max ~72 characters; pageSubheadline max ~140 characters; each must read well alone.
- suggestedCTAs: short imperative phrases (under 6 words each), no trailing punctuation.
- suggestedOffers: one concrete offer per line (what the fan gets), not vague ("exclusive stuff").
- suggestedContentPillars: noun phrases or short labels (2-5 words) creators can use as content buckets; align with their real lanes, not generic "lifestyle aesthetic" unless the quiz supports it.

Return ONLY a JSON object with exactly these keys:
{
  "brandSummary": string (2-4 tight sentences; lead with the hook),
  "brandStatement": string (first-person or brand voice matching their q14 style if present; 2-4 sentences),
  "pageHeadline": string (hero title),
  "pageSubheadline": string (one line under hero),
  "shortBio": string (~2-3 sentences for profile cards),
  "longBio": string (optional, richer paragraph for About-style blocks),
  "welcomeMessage": string (optional, warm DM-style welcome; 1-3 short sentences),
  "suggestedCTAs": string[] (3-6 short CTAs),
  "suggestedOffers": string[] (3-8 concrete offer ideas),
  "suggestedContentPillars": string[] (3-8 themes),
  "suggestedMembershipName": string (optional),
  "suggestedMembershipDescription": string (optional),
  "premiumStudioProfile": {
    "contentStyle": string[],
    "messageTone": string[],
    "audienceIntent": string[],
    "monetizationFocus": string[]
  } (optional; 3-8 tags each if included)
}

All required keys: brandSummary, brandStatement, pageHeadline, pageSubheadline, shortBio, suggestedCTAs, suggestedOffers, suggestedContentPillars. Arrays must be non-empty for those three.`;

  const r = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" },
  });
  const text = r?.response?.text?.() || "";
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  return parseGeneratedProfileJson(parsed, fallback);
}
