import { normalizePlanForLimits } from "./_planLimits.js";

/**
 * Creator-hosted live streams (Daily.co, tickets, Fan Hub promos).
 * Allowed for Elite-equivalent plans (incl. CreatorElite, OnlyFansStudio → Elite) and Agency; Admin for operations.
 */
export function userMayUseLiveStreaming(
  plan: string | undefined | null,
  role: string | undefined | null,
): boolean {
  if (role === "Admin") return true;
  const tier = normalizePlanForLimits(plan ?? "");
  return tier === "Elite" || tier === "Agency";
}
