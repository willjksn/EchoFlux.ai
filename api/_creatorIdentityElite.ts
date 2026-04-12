import { normalizePlanForLimits } from "./_planLimits.js";

/**
 * Creator Identity Builder + identity-aware generation: Elite-tier entitlements only (not Pro/CreatorPro).
 * Legacy Firestore may still store OnlyFansStudio; normalizePlanForLimits maps that (and CreatorElite) to Elite.
 * Current product name for that tier is Premium Studio.
 */
export function isCreatorIdentityPlan(plan: string | undefined | null): boolean {
  const p = typeof plan === "string" ? plan : "";
  if (!p) return false;
  if (p === "Agency") return true;
  return normalizePlanForLimits(p) === "Elite";
}
