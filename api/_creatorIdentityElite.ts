import { normalizePlanForLimits } from "./_planLimits.js";

/** Creator Identity Builder + identity-aware generation: Elite-tier plans (incl. OnlyFansStudio → Elite) + Agency. */
export function isCreatorIdentityPlan(plan: string | undefined | null): boolean {
  const p = typeof plan === "string" ? plan : "";
  if (!p) return false;
  if (p === "Agency") return true;
  return normalizePlanForLimits(p) === "Elite";
}
