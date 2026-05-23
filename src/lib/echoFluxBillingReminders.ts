/**
 * EchoFlux SaaS billing reminders (7 / 3 / 1 days) for period end and card expiration.
 */
import type { EchoFluxSubscriptionUserFields } from "./echoFluxSubscriptionAccess.js";
import { isPaidEchoFluxPlan } from "./echoFluxSubscriptionAccess.js";

export const ECHOFLUX_BILLING_REMINDER_DAYS = [7, 3, 1] as const;
export type EchoFluxBillingReminderDay = (typeof ECHOFLUX_BILLING_REMINDER_DAYS)[number];

export type EchoFluxBillingReminderKind = "period" | "card";

export type EchoFluxBillingReminderState = {
  periodAnchor?: string | null;
  cardAnchor?: string | null;
  sent?: {
    period?: number[];
    card?: number[];
  };
};

export type EchoFluxDefaultCardExp = {
  expMonth: number;
  expYear: number;
  last4?: string;
  brand?: string;
};

export function daysUntilTimestampMs(endMs: number): number | null {
  if (!Number.isFinite(endMs)) return null;
  return Math.ceil((endMs - Date.now()) / 86_400_000);
}

export function daysUntilIso(iso: string | null | undefined): number | null {
  if (!iso || typeof iso !== "string") return null;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return daysUntilTimestampMs(ms);
}

/** Last moment of Stripe card exp month (exp_month is 1–12). */
export function cardExpiryEndMs(expMonth: number, expYear: number): number | null {
  if (!Number.isFinite(expMonth) || !Number.isFinite(expYear) || expMonth < 1 || expMonth > 12) {
    return null;
  }
  return new Date(expYear, expMonth, 0, 23, 59, 59, 999).getTime();
}

export function cardAnchorKey(expMonth: number, expYear: number): string {
  return `${expYear}-${String(expMonth).padStart(2, "0")}`;
}

export function matchReminderDay(daysUntil: number | null): EchoFluxBillingReminderDay | null {
  if (daysUntil == null) return null;
  if (daysUntil === 7 || daysUntil === 3 || daysUntil === 1) return daysUntil;
  return null;
}

function sentDaysFor(
  state: EchoFluxBillingReminderState | null | undefined,
  kind: EchoFluxBillingReminderKind,
  anchor: string,
): number[] {
  if (!state) return [];
  if (kind === "period") {
    if (state.periodAnchor !== anchor) return [];
    return state.sent?.period ?? [];
  }
  if (state.cardAnchor !== anchor) return [];
  return state.sent?.card ?? [];
}

export function shouldSendBillingReminder(
  state: EchoFluxBillingReminderState | null | undefined,
  kind: EchoFluxBillingReminderKind,
  anchor: string,
  day: EchoFluxBillingReminderDay,
): boolean {
  const sent = sentDaysFor(state, kind, anchor);
  return !sent.includes(day);
}

export function periodReminderAnchor(user: EchoFluxSubscriptionUserFields): string | null {
  const canceling = user.cancelAtPeriodEnd === true;
  const end =
    (canceling && user.subscriptionEndDate) ||
    user.subscriptionCurrentPeriodEnd ||
    user.subscriptionEndDate;
  return typeof end === "string" && end.trim() ? end.trim() : null;
}

export function evaluatePeriodBillingReminder(
  user: EchoFluxSubscriptionUserFields & { plan?: string | null; stripeSubscriptionId?: string | null },
  state: EchoFluxBillingReminderState | null | undefined,
): { day: EchoFluxBillingReminderDay; anchor: string; cancelAtPeriodEnd: boolean } | null {
  const plan = typeof user.plan === "string" ? user.plan : "";
  const hasStripe = !!(user.stripeSubscriptionId && String(user.stripeSubscriptionId).trim());
  if (!hasStripe || !isPaidEchoFluxPlan(plan)) return null;

  const status = (user.subscriptionStatus || "").toLowerCase();
  if (status !== "active" && status !== "trialing" && status !== "canceled") return null;

  const anchor = periodReminderAnchor(user);
  if (!anchor) return null;

  const daysUntil = daysUntilIso(anchor);
  if (daysUntil == null || daysUntil < 0) return null;

  const day = matchReminderDay(daysUntil);
  if (!day) return null;
  if (!shouldSendBillingReminder(state, "period", anchor, day)) return null;

  return { day, anchor, cancelAtPeriodEnd: user.cancelAtPeriodEnd === true };
}

export function evaluateCardBillingReminder(
  card: EchoFluxDefaultCardExp | null | undefined,
  state: EchoFluxBillingReminderState | null | undefined,
  user: EchoFluxSubscriptionUserFields & { plan?: string | null; stripeSubscriptionId?: string | null },
): { day: EchoFluxBillingReminderDay; anchor: string } | null {
  const plan = typeof user.plan === "string" ? user.plan : "";
  const hasStripe = !!(user.stripeSubscriptionId && String(user.stripeSubscriptionId).trim());
  if (!hasStripe || !isPaidEchoFluxPlan(plan)) return null;
  if (!card?.expMonth || !card?.expYear) return null;

  const status = (user.subscriptionStatus || "").toLowerCase();
  if (status !== "active" && status !== "trialing") return null;

  const endMs = cardExpiryEndMs(card.expMonth, card.expYear);
  if (endMs == null) return null;

  const daysUntil = daysUntilTimestampMs(endMs);
  if (daysUntil == null || daysUntil < 0) return null;

  const day = matchReminderDay(daysUntil);
  if (!day) return null;

  const anchor = cardAnchorKey(card.expMonth, card.expYear);
  if (!shouldSendBillingReminder(state, "card", anchor, day)) return null;

  return { day, anchor };
}

export function buildPeriodReminderNotificationText(
  day: EchoFluxBillingReminderDay,
  cancelAtPeriodEnd: boolean,
): string {
  const when = day === 1 ? "tomorrow" : `in ${day} days`;
  if (cancelAtPeriodEnd) {
    return `⏰ Your EchoFlux plan ends ${when}. Update billing in Stripe to keep your witme page and fan memberships active.`;
  }
  return `⏰ Your EchoFlux plan renews ${when}. Confirm your payment method in Stripe to avoid interruption.`;
}

export function buildCardReminderNotificationText(
  day: EchoFluxBillingReminderDay,
  card: EchoFluxDefaultCardExp,
): string {
  const when = day === 1 ? "tomorrow" : `in ${day} days`;
  const last4 = card.last4 ? ` (••••${card.last4})` : "";
  const expLabel = `${String(card.expMonth).padStart(2, "0")}/${card.expYear}`;
  return `💳 Your EchoFlux card${last4} expires ${when} (${expLabel}). Update it in Stripe before your next renewal.`;
}

export function notificationIdForBillingReminder(
  kind: EchoFluxBillingReminderKind,
  anchor: string,
  day: EchoFluxBillingReminderDay,
): string {
  const safeAnchor = anchor.replace(/[:.]/g, "-");
  return `echoflux-billing-${kind}-${safeAnchor}-${day}`;
}

export function formatCardExpiryLabel(card: EchoFluxDefaultCardExp): string {
  return `${String(card.expMonth).padStart(2, "0")}/${card.expYear}`;
}

export function isCardExpiryLater(
  prev: EchoFluxDefaultCardExp | null | undefined,
  next: EchoFluxDefaultCardExp,
): boolean {
  if (!prev?.expYear || !prev?.expMonth) return true;
  if (next.expYear > prev.expYear) return true;
  if (next.expYear === prev.expYear && next.expMonth > prev.expMonth) return true;
  return false;
}
