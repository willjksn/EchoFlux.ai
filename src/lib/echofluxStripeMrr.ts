/**
 * EchoFlux creator-app MRR should reflect Stripe-paid subscriptions only — not plans set manually
 * by admins, invite-code grants (`invite_grant` without a real sub), or dashboard-only plan fields.
 */
export function hasActiveStripeEchofluxSubscription(user: {
  subscriptionStatus?: string | null | undefined;
  stripeSubscriptionId?: string | null | undefined;
  stripeCustomerId?: string | null | undefined;
  subscriptionCurrentPeriodEnd?: string | null | undefined;
}): boolean {
  const sid = String(user.stripeSubscriptionId || "").trim();
  if (!/^sub_[A-Za-z0-9]+$/.test(sid)) return false;
  const cid = String(user.stripeCustomerId || "").trim();
  if (!/^cus_[A-Za-z0-9]+$/.test(cid)) return false;
  const st = String(user.subscriptionStatus || "")
    .toLowerCase()
    .trim();
  if (st !== "active" && st !== "trialing") return false;
  const periodEndIso = String(user.subscriptionCurrentPeriodEnd || "").trim();
  if (periodEndIso) {
    const periodEndMs = Date.parse(periodEndIso);
    if (Number.isFinite(periodEndMs) && periodEndMs <= Date.now()) {
      return false;
    }
  }
  return true;
}
