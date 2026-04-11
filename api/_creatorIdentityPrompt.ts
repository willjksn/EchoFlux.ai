/**
 * EchoFlux generation — Creator Identity vs Personality Override (Elite only).
 *
 * Precedence:
 * - Pro: only Personality Override when toggled on (unchanged).
 * - Elite, Override OFF: Creator Identity doc is the default brand/voice baseline.
 * - Elite, Override ON: saved personality dominates; identity stays as background context.
 */

import type { CreatorIdentityDoc } from "./_creatorIdentityFirestore.js";

function asProfile(doc: CreatorIdentityDoc | null): {
  status?: string;
  version?: number;
  generatedProfile?: Record<string, unknown>;
  brandSummary?: string;
  brandStatement?: string;
  primaryNiche?: string;
  secondaryNiche?: string;
  brandVibes?: string[];
  audienceDrivers?: string[];
  monetizationFits?: string[];
  confidenceScore?: number;
} | null {
  if (!doc || typeof doc !== "object") return null;
  const status = typeof doc.status === "string" ? doc.status : "";
  if (status === "draft") return null;
  const gp = doc.generatedProfile && typeof doc.generatedProfile === "object" ? (doc.generatedProfile as Record<string, unknown>) : {};
  return {
    status,
    version: typeof doc.version === "number" ? doc.version : undefined,
    generatedProfile: gp,
    brandSummary: typeof gp.brandSummary === "string" ? gp.brandSummary : undefined,
    brandStatement: typeof gp.brandStatement === "string" ? gp.brandStatement : undefined,
    primaryNiche: typeof doc.primaryNiche === "string" ? doc.primaryNiche : undefined,
    secondaryNiche: typeof doc.secondaryNiche === "string" ? doc.secondaryNiche : undefined,
    brandVibes: Array.isArray(doc.brandVibes) ? (doc.brandVibes as string[]) : undefined,
    audienceDrivers: Array.isArray(doc.audienceDrivers) ? (doc.audienceDrivers as string[]) : undefined,
    monetizationFits: Array.isArray(doc.monetizationFits) ? (doc.monetizationFits as string[]) : undefined,
    confidenceScore: typeof doc.confidenceScore === "number" ? doc.confidenceScore : undefined,
  };
}

export function buildCreatorIdentityBaselinePromptBlock(doc: CreatorIdentityDoc | null): string {
  const p = asProfile(doc);
  if (!p) return "";
  const lines = [
    "🎯 CREATOR IDENTITY (DEFAULT BRAND BASELINE — Elite)",
    "This creator completed the Creator Identity Builder. Use it as the default lens for tone, positioning, audience pull, and monetization angle when Personality Override is OFF.",
    p.brandSummary ? `Summary: ${p.brandSummary}` : "",
    p.brandStatement ? `Brand statement: ${p.brandStatement}` : "",
    p.primaryNiche ? `Primary niche (internal): ${p.primaryNiche.replace(/_/g, " ")}` : "",
    p.secondaryNiche ? `Secondary niche (internal): ${p.secondaryNiche.replace(/_/g, " ")}` : "",
    p.brandVibes?.length ? `Brand vibe tags: ${p.brandVibes.join(", ")}` : "",
    p.audienceDrivers?.length ? `Audience drivers: ${p.audienceDrivers.map((s) => s.replace(/_/g, " ")).join(", ")}` : "",
    p.monetizationFits?.length ? `Monetization fit (prioritize naturally): ${p.monetizationFits.map((s) => s.replace(/_/g, " ")).join(", ")}` : "",
    typeof p.confidenceScore === "number" ? `Profile confidence (internal): ${p.confidenceScore}/100` : "",
  ].filter(Boolean);
  return `\n${lines.join("\n")}\n`;
}

/** Shorter background block when Personality Override is ON (still Elite). */
export function buildCreatorIdentityBackgroundPromptBlock(doc: CreatorIdentityDoc | null): string {
  const p = asProfile(doc);
  if (!p) return "";
  const snippet = p.brandSummary || p.brandStatement || "";
  if (!snippet) return "";
  return `
🎯 CREATOR IDENTITY (BACKGROUND CONTEXT — Elite)
Personality Override is ON for this run; follow the override for voice first.
Use this identity only for consistency when it does not conflict with the override:
${snippet.slice(0, 900)}
`;
}

export function strategyNicheSeedFromIdentity(doc: CreatorIdentityDoc | null): string {
  const p = asProfile(doc);
  if (!p?.brandSummary && !p?.primaryNiche) return "";
  const niche = p.primaryNiche ? p.primaryNiche.replace(/_/g, " ") : "";
  return [niche, p.brandSummary?.slice(0, 200)].filter(Boolean).join(" — ");
}
