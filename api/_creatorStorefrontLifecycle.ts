/**
 * witme.io storefront lifecycle: active only while creator EchoFlux SaaS is in good standing.
 * On lapse, block new fan monetization and schedule fan Connect subscriptions to cancel at period end.
 */
import type { Firestore } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { getLegacyFanSubscriptionStripeClients, getPlatformStripe } from "./_stripeConnect.js";
import {
  isCreatorEchoFluxStorefrontActive,
  STOREFRONT_SUSPENDED_PUBLIC_MESSAGE,
  type CreatorStorefrontUserFields,
} from "../src/lib/creatorStorefrontActive.js";

const PLATFORM_OWNER_IDS = (process.env.PLATFORM_OWNER_CREATOR_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isCreatorPlatformOwner(
  creatorId: string,
  creatorData: { isPlatformOwner?: boolean; platformOwner?: boolean; role?: string } | undefined,
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
}): Promise<{
  subscription: Stripe.Response<Stripe.Subscription>;
  stripe: Stripe;
  options: { stripeAccount?: string } | undefined;
}> {
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

async function syncFanHubFirestoreAfterScheduleCancel(
  db: Firestore,
  creatorId: string,
  fanId: string,
  subscription: Stripe.Subscription,
  periodEndIso: string | null,
  reason: string,
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
        echoFluxStorefrontWindDown: true,
        echoFluxStorefrontWindDownReason: reason,
        updatedAt: now,
      },
      { merge: true },
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
    await fanRef.update(fanPayload as Record<string, unknown>);
  } else {
    await fanRef.set(fanPayload, { merge: true });
  }
}

const WIND_DOWN_REASON = "creator_echoflux_subscription_lapsed";

async function scheduleFanSubscriptionCancelAtPeriodEnd(
  db: Firestore,
  stripe: Stripe,
  creatorId: string,
  fanId: string,
  subscriptionId: string,
  creatorData: Record<string, unknown> | undefined,
  ownerDetection: { isPlatformOwner?: boolean; platformOwner?: boolean; role?: string },
): Promise<void> {
  const isPlatform = isCreatorPlatformOwner(creatorId, ownerDetection);
  const connectId = resolveConnectAccountId(creatorData);
  const stripeOpts = !isPlatform && connectId ? { stripeAccount: connectId } : undefined;
  const fallbackStripeOpts = stripeOpts ? undefined : connectId ? { stripeAccount: connectId } : undefined;

  const { subscription, stripe: resolvedStripe, options: resolvedStripeOpts } =
    await retrieveSubscriptionWithFallback({
      stripe,
      subscriptionId,
      preferredOptions: stripeOpts,
      fallbackOptions: fallbackStripeOpts,
    });

  const periodEarly = subscriptionPeriodEndIso(subscription);
  if (subscription.cancel_at_period_end) {
    await syncFanHubFirestoreAfterScheduleCancel(
      db,
      creatorId,
      fanId,
      subscription,
      periodEarly,
      WIND_DOWN_REASON,
    );
    return;
  }

  await resolvedStripe.subscriptions.update(
    subscriptionId,
    { cancel_at_period_end: true },
    resolvedStripeOpts,
  );
  const subAfter = await resolvedStripe.subscriptions.retrieve(subscriptionId, resolvedStripeOpts);
  const periodEnd = subscriptionPeriodEndIso(subAfter);
  await syncFanHubFirestoreAfterScheduleCancel(db, creatorId, fanId, subAfter, periodEnd, WIND_DOWN_REASON);
}

async function windDownFanBillingSubscriptions(
  db: Firestore,
  stripe: Stripe,
  creatorId: string,
): Promise<void> {
  const [creatorSnap, subsSnap] = await Promise.all([
    db.collection("creators").doc(creatorId).get(),
    db.collection("creatorSubscribers").doc(creatorId).collection("subscribers").get(),
  ]);
  const creatorData = creatorSnap.data() as Record<string, unknown> | undefined;
  const creatorUserSnap = await db.collection("users").doc(creatorId).get();
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

  for (const subDoc of subsSnap.docs) {
    const fanId = subDoc.id;
    const data = subDoc.data() as {
      stripeSubscriptionId?: string;
      status?: string;
      cancelAtPeriodEnd?: boolean;
    };
    const subscriptionId = data.stripeSubscriptionId;
    if (!subscriptionId || typeof subscriptionId !== "string") continue;
    const status = (data.status || "").toLowerCase();
    if (status === "canceled" || status === "incomplete_expired" || status === "unpaid") continue;

    try {
      await scheduleFanSubscriptionCancelAtPeriodEnd(
        db,
        stripe,
        creatorId,
        fanId,
        subscriptionId,
        creatorData,
        ownerDetection,
      );
    } catch (e) {
      console.error(`windDownFanBillingSubscriptions(${creatorId}, fan=${fanId}):`, e);
    }
  }
}

export type StorefrontGateResult =
  | { ok: true; active: true }
  | { ok: false; status: number; error: string; code: string };

/** Block new fan checkouts / free joins when creator EchoFlux is lapsed. */
export async function assertCreatorStorefrontAcceptsNewFans(
  db: Firestore,
  creatorId: string,
): Promise<StorefrontGateResult> {
  const userSnap = await db.collection("users").doc(creatorId).get();
  const active = isCreatorEchoFluxStorefrontActive(
    creatorId,
    userSnap.exists ? (userSnap.data() as CreatorStorefrontUserFields) : undefined,
  );
  if (active) return { ok: true, active: true };
  return {
    ok: false,
    status: 403,
    error: STOREFRONT_SUSPENDED_PUBLIC_MESSAGE,
    code: "STOREFRONT_SUSPENDED",
  };
}

/** Persist storefront flag on creator doc and wind down fan billing when inactive. */
export async function syncCreatorStorefrontLifecycle(
  db: Firestore,
  creatorId: string,
): Promise<boolean> {
  const [userSnap, creatorSnap] = await Promise.all([
    db.collection("users").doc(creatorId).get(),
    db.collection("creators").doc(creatorId).get(),
  ]);
  if (!creatorSnap.exists) return false;

  const active = isCreatorEchoFluxStorefrontActive(
    creatorId,
    userSnap.exists ? (userSnap.data() as CreatorStorefrontUserFields) : undefined,
  );
  const now = new Date().toISOString();

  await db.collection("creators").doc(creatorId).set(
    {
      echoFluxStorefrontActive: active,
      echoFluxStorefrontSyncedAt: now,
      ...(active
        ? {}
        : {
            echoFluxStorefrontSuspendedAt: now,
            echoFluxStorefrontSuspendedMessage: STOREFRONT_SUSPENDED_PUBLIC_MESSAGE,
          }),
    },
    { merge: true },
  );

  if (!active) {
    const stripe = getPlatformStripe();
    if (stripe) {
      try {
        await windDownFanBillingSubscriptions(db, stripe, creatorId);
      } catch (e) {
        console.error(`syncCreatorStorefrontLifecycle windDown(${creatorId}):`, e);
      }
    } else {
      console.warn(`syncCreatorStorefrontLifecycle: Stripe unavailable; fan wind-down skipped for ${creatorId}`);
    }
  }

  return active;
}
