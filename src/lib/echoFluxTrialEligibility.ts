/**
 * EchoFlux SaaS free trial: one per creator, Pro or Elite only (not both).
 * Server checkout must omit trial_period_days when ineligible.
 */

export const ECHOFLUX_TRIAL_CHECKOUT_PLANS = new Set(["Pro", "Elite"]);

/** Plans that count as having subscribed to EchoFlux SaaS (trial or paid). */
export const ECHOFLUX_SAAS_SUBSCRIPTION_PLANS = new Set([
  "Pro",
  "Elite",
  "CreatorPro",
  "CreatorElite",
]);

export type EchoFluxTrialEligibilityUser = {
  hasUsedEchoFluxFreeTrial?: boolean;
  trialEndDate?: string | null;
  stripeSubscriptionId?: string | null;
  subscriptionStartDate?: string | null;
  plan?: string | null;
  subscriptionStatus?: string | null;
  /** Set when account was created or upgraded via creator invite code. */
  inviteGrantPlan?: string | null;
};

/** Invite checkout (CreatorPro/CreatorElite / CreatorChoice) never includes a 7-day trial. */
export function isEchoFluxInviteCreatorAccount(
  user: EchoFluxTrialEligibilityUser | null | undefined,
): boolean {
  if (!user) return false;

  const plan = typeof user.plan === "string" ? user.plan.trim() : "";
  if (plan === "CreatorPro" || plan === "CreatorElite") return true;

  const status = (user.subscriptionStatus || "").toLowerCase().trim();
  if (status === "creator_invite_pending" || status === "invite_grant") return true;

  const grant = typeof user.inviteGrantPlan === "string" ? user.inviteGrantPlan.trim() : "";
  if (grant) return true;

  return false;
};

/** Whether Pricing / onboarding copy should advertise the 7-day trial. */
export function canShowEchoFluxTrialMarketing(
  user: EchoFluxTrialEligibilityUser | null | undefined,
): boolean {
  if (isEchoFluxInviteCreatorAccount(user)) return false;
  if (user && hasUsedEchoFluxFreeTrial(user)) return false;
  return true;
};

/** True if this creator has already used (or is using) their one EchoFlux free trial. */
export function hasUsedEchoFluxFreeTrial(
  user: EchoFluxTrialEligibilityUser | null | undefined,
): boolean {
  if (!user) return false;
  if (user.hasUsedEchoFluxFreeTrial === true) return true;

  if (typeof user.trialEndDate === "string" && user.trialEndDate.trim()) {
    return true;
  }

  const subId =
    typeof user.stripeSubscriptionId === "string" ? user.stripeSubscriptionId.trim() : "";
  if (subId) return true;

  const plan = typeof user.plan === "string" ? user.plan.trim() : "";
  if (!plan || !ECHOFLUX_SAAS_SUBSCRIPTION_PLANS.has(plan)) {
    return false;
  }

  const status = (user.subscriptionStatus || "").toLowerCase().trim();
  if (status === "creator_invite_pending") return false;

  if (typeof user.subscriptionStartDate === "string" && user.subscriptionStartDate.trim()) {
    return true;
  }

  if (
    status === "active" ||
    status === "trialing" ||
    status === "past_due" ||
    status === "canceled" ||
    status === "unpaid" ||
    status === "incomplete" ||
    status === "incomplete_expired"
  ) {
    return true;
  }

  return false;
}

export function isEligibleForEchoFluxCheckoutTrial(
  user: EchoFluxTrialEligibilityUser | null | undefined,
  planName: string,
): boolean {
  if (!ECHOFLUX_TRIAL_CHECKOUT_PLANS.has(planName)) return false;
  if (isEchoFluxInviteCreatorAccount(user)) return false;
  return !hasUsedEchoFluxFreeTrial(user);
}

export function shouldMarkEchoFluxFreeTrialUsed(planName: string): boolean {
  return ECHOFLUX_SAAS_SUBSCRIPTION_PLANS.has(planName);
}
