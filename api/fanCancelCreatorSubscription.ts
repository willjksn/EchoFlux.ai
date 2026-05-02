/**
 * POST: Fan cancels their subscription to a creator (at period end).
 * Auth: fan (Bearer). Body: { creatorId }.
 * Reads stripeSubscriptionId from creatorSubscribers/{creatorId}/subscribers/{fanId}.
 * Webhook customer.subscription.deleted will update Firestore when period ends.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Firestore } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { getLegacyFanSubscriptionStripeClients, getPlatformStripe } from "./_stripeConnect.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";

function subscriptionPeriodEndIso(sub: Stripe.Subscription): string | null {
  const cpe = (sub as Stripe.Subscription & { current_period_end?: number }).current_period_end;
  return typeof cpe === "number" && Number.isFinite(cpe) ? new Date(cpe * 1000).toISOString() : null;
}

function fanHubStripeStatusForFirestore(sub: Stripe.Subscription): string {
  const raw = sub.status;
  if (raw === "active" || raw === "trialing") return raw;
  if (raw === "canceled" || raw === "unpaid" || raw === "incomplete_expired") return "canceled";
  if (raw === "past_due") return "past_due";
  return raw;
}

/**
 * Keep Firestore in sync when a fan schedules cancel-at-period-end from the storefront.
 * Profile UI uses the API response; Fan Hub User Management reads fans + creatorSubscribers only.
 */
async function syncFanHubFirestoreAfterScheduleCancel(
  db: Firestore,
  creatorId: string,
  fanId: string,
  subscription: Stripe.Subscription,
  periodEndIso: string | null
): Promise<void> {
  const now = new Date().toISOString();
  const subStatus = fanHubStripeStatusForFirestore(subscription);

  await db
    .collection("creatorSubscribers")
    .doc(creatorId)
    .collection("subscribers")
    .doc(fanId)
    .set(
      {
        cancelAtPeriodEnd: true,
        currentPeriodEnd: periodEndIso,
        stripeSubscriptionId: subscription.id,
        status: subStatus,
        updatedAt: now,
      },
      { merge: true }
    );

  const fanRef = db.collection("creators").doc(creatorId).collection("fans").doc(fanId);
  const fanSnap = await fanRef.get();
  const fanPayload: Record<string, unknown> = {
    subscriptionStatus: subStatus,
    cancelAtPeriodEnd: true,
    updatedAt: now,
  };
  if (periodEndIso) {
    fanPayload.subscriptionCurrentPeriodEnd = periodEndIso;
    fanPayload.subscriptionEndDate = periodEndIso;
  }
  if (fanSnap.exists) {
    await fanRef.update(fanPayload as any);
  } else {
    await fanRef.set(fanPayload, { merge: true });
  }
}

const PLATFORM_OWNER_IDS = (process.env.PLATFORM_OWNER_CREATOR_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isCreatorPlatformOwner(
  creatorId: string,
  creatorData: { isPlatformOwner?: boolean; platformOwner?: boolean; role?: string } | undefined
): boolean {
  if (PLATFORM_OWNER_IDS.includes(creatorId)) return true;
  if (!creatorData) return false;
  if (creatorData.isPlatformOwner === true) return true;
  if (creatorData.platformOwner === true) return true;
  if (typeof creatorData.role === "string") {
    const role = creatorData.role.toLowerCase().trim();
    if (role === "owner" || role === "admin" || role === "platform_owner") return true;
  }
  return false;
}

function resolveConnectAccountId(creatorData: Record<string, unknown> | undefined): string | null {
  if (!creatorData) return null;
  const d = creatorData as {
    stripeConnectAccountId?: string;
    stripeAccountId?: string;
    connectedStripeAccountId?: string;
    stripe?: { connectAccountId?: string };
  };
  const id =
    d.stripeConnectAccountId ||
    d.stripeAccountId ||
    d.connectedStripeAccountId ||
    d.stripe?.connectAccountId ||
    null;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function isMissingStripeResource(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  const msg = (e?.message || "").toLowerCase();
  return e?.code === "resource_missing" || msg.includes("no such subscription");
}

async function retrieveSubscriptionWithFallback({
  stripe,
  subscriptionId,
  preferredOptions,
  fallbackOptions,
}: {
  stripe: Stripe;
  subscriptionId: string;
  preferredOptions: { stripeAccount?: string } | undefined;
  fallbackOptions: { stripeAccount?: string } | undefined;
}): Promise<{ subscription: Stripe.Response<Stripe.Subscription>; stripe: Stripe; options: { stripeAccount?: string } | undefined }> {
  const attempts: Array<{ stripe: Stripe; options: { stripeAccount?: string } | undefined }> = [];
  const pushAttempt = (opts: { stripeAccount?: string } | undefined) => {
    const key = opts?.stripeAccount || "";
    if (!attempts.some((existing) => existing.stripe === stripe && (existing.options?.stripeAccount || "") === key)) {
      attempts.push({ stripe, options: opts });
    }
  };
  pushAttempt(preferredOptions);
  pushAttempt(fallbackOptions);
  for (const legacy of getLegacyFanSubscriptionStripeClients()) {
    if (!attempts.some((existing) => existing.stripe === legacy.stripe && !existing.options?.stripeAccount)) {
      attempts.push({ stripe: legacy.stripe, options: undefined });
    }
  }

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const subscription = await attempt.stripe.subscriptions.retrieve(subscriptionId, attempt.options);
      return { subscription, stripe: attempt.stripe, options: attempt.options };
    } catch (e) {
      lastError = e;
      if (!isMissingStripeResource(e)) throw e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Failed to load subscription");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const fanId = decoded.uid;

  const body = (req.body || {}) as { creatorId?: string };
  const creatorId = body.creatorId;
  if (!creatorId || typeof creatorId !== "string") {
    return res.status(400).json({ error: "creatorId is required" });
  }

  const stripe = getPlatformStripe();
  if (!stripe) {
    return res.status(503).json({ error: "Payments are not configured" });
  }

  const db = getAdminDb();
  if (!db) {
    return res.status(500).json({ error: "Database unavailable" });
  }

  const subRef = db
    .collection("creatorSubscribers")
    .doc(creatorId)
    .collection("subscribers")
    .doc(fanId);
  const subSnap = await subRef.get();
  if (!subSnap.exists) {
    return res.status(404).json({ error: "No subscription found for this creator" });
  }
  const data = subSnap.data() as { stripeSubscriptionId?: string; status?: string };
  const subscriptionId = data.stripeSubscriptionId;
  if (!subscriptionId) {
    return res.status(400).json({ error: "No active subscription to cancel" });
  }
  if (data.status === "canceled") {
    return res.status(400).json({ error: "Subscription is already canceled" });
  }

  const [creatorSnap, creatorUserSnap] = await Promise.all([
    db.collection("creators").doc(creatorId).get(),
    db.collection("users").doc(creatorId).get(),
  ]);
  const creatorData = creatorSnap.data() as Record<string, unknown> | undefined;
  const creatorUserData = creatorUserSnap.data() as
    | { isPlatformOwner?: boolean; platformOwner?: boolean; role?: string }
    | undefined;
  const ownerDetection = {
    isPlatformOwner:
      (creatorData as { isPlatformOwner?: boolean } | undefined)?.isPlatformOwner === true ||
      creatorUserData?.isPlatformOwner === true,
    platformOwner:
      (creatorData as { platformOwner?: boolean } | undefined)?.platformOwner === true ||
      creatorUserData?.platformOwner === true,
    role: ((creatorData as { role?: string } | undefined)?.role || creatorUserData?.role) as string | undefined,
  };
  const isPlatform = isCreatorPlatformOwner(creatorId, ownerDetection);
  const connectId = resolveConnectAccountId(creatorData);
  const stripeOpts = !isPlatform && connectId ? { stripeAccount: connectId } : undefined;
  const fallbackStripeOpts = stripeOpts ? undefined : connectId ? { stripeAccount: connectId } : undefined;

  try {
    const { subscription, stripe: resolvedStripe, options: resolvedStripeOpts } = await retrieveSubscriptionWithFallback({
      stripe,
      subscriptionId,
      preferredOptions: stripeOpts,
      fallbackOptions: fallbackStripeOpts,
    });
    const periodEarly = subscriptionPeriodEndIso(subscription);
    if (subscription.cancel_at_period_end) {
      try {
        await syncFanHubFirestoreAfterScheduleCancel(db, creatorId, fanId, subscription, periodEarly);
      } catch (syncErr) {
        console.error("fanCancelCreatorSubscription Firestore sync (already scheduled):", syncErr);
      }
      return res.status(200).json({
        ok: true,
        message: "Subscription is already set to cancel at the end of the billing period",
        currentPeriodEnd: periodEarly,
      });
    }

    await resolvedStripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true }, resolvedStripeOpts);
    const subAfter = await resolvedStripe.subscriptions.retrieve(subscriptionId, resolvedStripeOpts);
    const periodEnd = subscriptionPeriodEndIso(subAfter);
    try {
      await syncFanHubFirestoreAfterScheduleCancel(db, creatorId, fanId, subAfter, periodEnd);
    } catch (syncErr) {
      console.error("fanCancelCreatorSubscription Firestore sync:", syncErr);
    }

    return res.status(200).json({
      ok: true,
      message: "Subscription will cancel at the end of your current billing period. You keep access until then.",
      currentPeriodEnd: periodEnd,
    });
  } catch (e: unknown) {
    const err = e as { message?: string; code?: string };
    console.error("fanCancelCreatorSubscription error:", err);
    return res.status(500).json({
      error: err?.message || "Failed to cancel subscription",
    });
  }
}
