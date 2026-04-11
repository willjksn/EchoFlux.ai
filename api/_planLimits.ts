/**
 * Map Stripe / Firestore plan ids to internal tier keys used in usage limit tables.
 * CreatorPro / CreatorElite are invite-only EchoFlux subscriptions that mirror Pro / Elite entitlements.
 */
export function normalizePlanForLimits(plan: string): string {
  if (plan === "OnlyFansStudio" || plan === "CreatorElite") return "Elite";
  if (plan === "CreatorPro") return "Pro";
  return plan;
}
