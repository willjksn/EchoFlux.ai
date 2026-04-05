/**
 * EchoFlux creator-app MRR should reflect Stripe-paid subscriptions only — not plans set manually
 * by admins, invite-code grants (`invite_grant` without a real sub), or dashboard-only plan fields.
 */
export function hasActiveStripeEchofluxSubscription(user: {
  subscriptionStatus?: string | null | undefined;
  stripeSubscriptionId?: string | null | undefined;
}): boolean {
  const sid = user.stripeSubscriptionId;
  if (typeof sid !== "string" || !sid.trim()) return false;
  const st = String(user.subscriptionStatus || "")
    .toLowerCase()
    .trim();
  return st === "active" || st === "trialing";
}
