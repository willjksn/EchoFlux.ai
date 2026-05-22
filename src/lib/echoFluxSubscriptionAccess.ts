/**
 * EchoFlux SaaS subscription gates creator shell access (`creatorApp` claim).
 * Shared by api/_creatorAppClaim.ts and the signed-in shell UI.
 */

export const PAID_ECHOFLUX_PLANS = new Set([
  "Pro",
  "Elite",
  "Agency",
  "OnlyFansStudio",
  "CreatorPro",
  "CreatorElite",
]);

export type EchoFluxSubscriptionUserFields = {
  plan?: string | null;
  subscriptionStatus?: string | null;
  cancelAtPeriodEnd?: boolean;
  subscriptionEndDate?: string | null;
  subscriptionCurrentPeriodEnd?: string | null;
  stripeSubscriptionId?: string | null;
};

export function isPaidEchoFluxPlan(plan: string | null | undefined): boolean {
  const p = typeof plan === "string" ? plan.trim() : "";
  return !!p && PAID_ECHOFLUX_PLANS.has(p);
}

function periodEndMs(d: EchoFluxSubscriptionUserFields): number | null {
  const iso = d.subscriptionEndDate || d.subscriptionCurrentPeriodEnd;
  if (!iso || typeof iso !== "string") return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** True while Stripe subscription is active, trialing, or canceled but still inside the paid period. */
export function hasActiveEchoFluxSubscription(d: EchoFluxSubscriptionUserFields): boolean {
  const status = (d.subscriptionStatus || "").toLowerCase().trim();

  if (status === "active" || status === "trialing") return true;

  if (status === "canceled" || d.cancelAtPeriodEnd === true) {
    const endMs = periodEndMs(d);
    if (endMs != null && endMs > Date.now()) return true;
  }

  return false;
}

const LAPSED_STRIPE_STATUSES = new Set([
  "past_due",
  "unpaid",
  "canceled",
  "incomplete",
  "incomplete_expired",
]);

/** Signed-in user looks like a creator who lost paid EchoFlux access (for billing/resubscribe UI). */
export function isEchoFluxPaidSubscriptionLapsed(
  d: EchoFluxSubscriptionUserFields & { hasCompletedOnboarding?: boolean }
): boolean {
  const hasStripe = !!(d.stripeSubscriptionId && String(d.stripeSubscriptionId).trim());
  const plan = typeof d.plan === "string" ? d.plan : "";

  if (isPaidEchoFluxPlan(plan)) {
    return !hasActiveEchoFluxSubscription(d);
  }

  if (hasStripe) {
    const status = (d.subscriptionStatus || "").toLowerCase().trim();
    if (status === "active" || status === "trialing") return false;
    if (LAPSED_STRIPE_STATUSES.has(status)) {
      if (status === "canceled" && d.cancelAtPeriodEnd) {
        const endMs = periodEndMs(d);
        if (endMs != null && endMs > Date.now()) return false;
      }
      return true;
    }
  }

  return false;
}

export type UserDocForCreatorAppClaim = EchoFluxSubscriptionUserFields & {
  role?: string;
  hasCompletedOnboarding?: boolean;
  accountOrigin?: string;
  inviteGrantPlan?: string;
};

export function shouldHaveCreatorAppAccess(params: {
  userData: UserDocForCreatorAppClaim | undefined;
  creatorDocExists: boolean;
}): boolean {
  const d = params.userData || {};
  if (d.role === "Admin") return true;

  if (
    d.subscriptionStatus === "creator_invite_pending" &&
    d.inviteGrantPlan === "CreatorChoice"
  ) {
    return true;
  }

  if (d.accountOrigin === "fan_hub") return false;

  const plan = typeof d.plan === "string" ? d.plan : "";
  const hasStripe = !!(d.stripeSubscriptionId && String(d.stripeSubscriptionId).trim());

  if (isPaidEchoFluxPlan(plan)) {
    return hasActiveEchoFluxSubscription(d);
  }

  if (hasStripe) {
    return hasActiveEchoFluxSubscription({
      ...d,
      plan: plan || "Pro",
    });
  }

  if (d.hasCompletedOnboarding === true) return true;

  return false;
}
