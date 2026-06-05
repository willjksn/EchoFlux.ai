/**
 * Fan Hub paid membership lifecycle: stale webhook guard + Stripe reconciliation.
 *
 * When a fan's first Checkout payment fails and they retry, Stripe creates a second
 * subscription. A late `customer.subscription.deleted` for the failed sub must not
 * revoke access for the active subscription stored in Firestore.
 */
import type { Firestore } from "firebase-admin/firestore";
import type Stripe from "stripe";
import {
  getPlatformStripe,
  getLegacyFanSubscriptionStripeClients,
} from "./_stripeConnect.js";
import { reconcileFanHubFanPreferenceForMember } from "./_syncFanHubFanPreference.js";

function stripeRefId(
  value: string | Stripe.Customer | Stripe.Subscription | Stripe.DeletedCustomer | null | undefined,
): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return typeof value.id === "string" ? value.id : "";
}

export async function fanHubStoredStripeSubscriptionId(
  db: Firestore,
  creatorId: string,
  fanId: string,
): Promise<string | null> {
  const snap = await db
    .collection("creatorSubscribers")
    .doc(creatorId)
    .collection("subscribers")
    .doc(fanId)
    .get();
  const raw = snap.data()?.stripeSubscriptionId;
  const id = typeof raw === "string" ? raw.trim() : "";
  return id || null;
}

/** True when Firestore already tracks a different subscription than this webhook event. */
export async function fanHubSubscriptionLifecycleEventIsStale(
  db: Firestore,
  creatorId: string,
  fanId: string,
  incomingSubscriptionId: string,
): Promise<boolean> {
  const stored = await fanHubStoredStripeSubscriptionId(db, creatorId, fanId);
  return !!stored && stored !== incomingSubscriptionId;
}

export async function applyFanHubSubscriptionFromStripe(
  db: Firestore,
  subscription: Stripe.Subscription,
  reconcileSource: string,
  ids?: { creatorId: string; fanId: string },
): Promise<boolean> {
  const creatorId = ids?.creatorId || subscription.metadata?.creatorId;
  const fanId = ids?.fanId || subscription.metadata?.fanId;
  if (!creatorId || !fanId) return false;

  const now = new Date().toISOString();
  const raw = subscription.status;
  let subStatus: string;
  if (raw === "active" || raw === "trialing") {
    subStatus = raw;
  } else if (raw === "canceled" || raw === "unpaid" || raw === "incomplete_expired") {
    subStatus = "canceled";
  } else if (raw === "past_due") {
    subStatus = "past_due";
  } else {
    subStatus = raw;
  }
  const periodEndSec = (subscription as { current_period_end?: number }).current_period_end;
  const subscriptionCurrentPeriodEnd = periodEndSec
    ? new Date(periodEndSec * 1000).toISOString()
    : null;
  const cancelAtPeriodEnd = !!(subscription as { cancel_at_period_end?: boolean }).cancel_at_period_end;
  const periodEndMs = subscriptionCurrentPeriodEnd ? Date.parse(subscriptionCurrentPeriodEnd) : null;
  const grantActive =
    (subStatus === "active" || subStatus === "trialing") &&
    (periodEndMs == null || !Number.isFinite(periodEndMs) || periodEndMs > Date.now());

  const subRef = db.collection("creatorSubscribers").doc(creatorId).collection("subscribers").doc(fanId);
  await subRef.set(
    {
      status: subStatus,
      stripeSubscriptionId: subscription.id,
      cancelAtPeriodEnd,
      currentPeriodEnd: subscriptionCurrentPeriodEnd,
      updatedAt: now,
    },
    { merge: true },
  );

  const grantRef = db.collection("creatorEntitlements").doc(creatorId).collection("grants").doc(fanId);
  const grantSnap = await grantRef.get();
  const existing = grantSnap.data() as { unlockedProductIds?: string[] } | undefined;
  await grantRef.set(
    { subscription: grantActive, unlockedProductIds: existing?.unlockedProductIds ?? [], updatedAt: now },
    { merge: true },
  );

  const stripeCustomerId = stripeRefId(subscription.customer);
  const fanRef = db.collection("creators").doc(creatorId).collection("fans").doc(fanId);
  const fanSnap = await fanRef.get();
  if (fanSnap.exists) {
    const fanPatch: Record<string, unknown> = {
      subscriptionStatus: subStatus,
      cancelAtPeriodEnd,
      subscriptionCurrentPeriodEnd,
      stripeSubscriptionId: subscription.id,
      updatedAt: now,
    };
    if (stripeCustomerId && stripeCustomerId.startsWith("cus_")) {
      fanPatch.stripeCustomerId = stripeCustomerId;
    }
    await fanRef.update(fanPatch as Record<string, unknown>);
    try {
      await reconcileFanHubFanPreferenceForMember(db, creatorId, fanId, now, reconcileSource);
    } catch (e) {
      console.error("reconcileFanHubFanPreference (subscription sync):", e);
    }
  }

  return true;
}

export async function revokeFanHubSubscriptionFromStripe(
  db: Firestore,
  subscription: Stripe.Subscription,
): Promise<boolean> {
  const creatorId = subscription.metadata?.creatorId;
  const fanId = subscription.metadata?.fanId;
  if (!creatorId || !fanId) return false;

  const now = new Date().toISOString();
  const subTs = subscription as Stripe.Subscription & { current_period_end?: number; ended_at?: number | null };
  const cpe = subTs.current_period_end;
  const endedAt = subTs.ended_at;
  let periodEndIso: string | null = null;
  if (typeof cpe === "number" && Number.isFinite(cpe)) {
    periodEndIso = new Date(cpe * 1000).toISOString();
  } else if (typeof endedAt === "number" && Number.isFinite(endedAt)) {
    periodEndIso = new Date(endedAt * 1000).toISOString();
  }

  const subRef = db.collection("creatorSubscribers").doc(creatorId).collection("subscribers").doc(fanId);
  await subRef.set(
    {
      status: "canceled",
      updatedAt: now,
      ...(periodEndIso ? { currentPeriodEnd: periodEndIso } : {}),
    },
    { merge: true },
  );

  const grantRef = db.collection("creatorEntitlements").doc(creatorId).collection("grants").doc(fanId);
  const grantSnap = await grantRef.get();
  const existing = grantSnap.data() as { unlockedProductIds?: string[] } | undefined;
  await grantRef.set(
    { subscription: false, unlockedProductIds: existing?.unlockedProductIds ?? [], updatedAt: now },
    { merge: true },
  );

  const fanRef = db.collection("creators").doc(creatorId).collection("fans").doc(fanId);
  const fanSnap = await fanRef.get();
  if (fanSnap.exists) {
    const fanUpdate: Record<string, unknown> = {
      subscriptionStatus: "canceled",
      canceledAt: now,
      cancelAtPeriodEnd: false,
      updatedAt: now,
    };
    if (periodEndIso) {
      fanUpdate.subscriptionCurrentPeriodEnd = periodEndIso;
      fanUpdate.subscriptionEndDate = periodEndIso;
    }
    await fanRef.update(fanUpdate as Record<string, unknown>);
    try {
      await reconcileFanHubFanPreferenceForMember(db, creatorId, fanId, now, "stripe_subscription_canceled");
    } catch (e) {
      console.error("reconcileFanHubFanPreference (subscription canceled):", e);
    }
  }

  return true;
}

function subscriptionMatchesFanHub(
  sub: Stripe.Subscription,
  creatorId: string,
  fanId: string,
): boolean {
  const metaCreator = (sub.metadata?.creatorId || "").trim();
  const metaFan = (sub.metadata?.fanId || "").trim();
  return metaCreator === creatorId && metaFan === fanId;
}

function isPaidLikeStripeStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === "active" || s === "trialing" || s === "past_due";
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

function isMissingStripeResource(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  const msg = (e?.message || "").toLowerCase();
  return e?.code === "resource_missing" || msg.includes("no such subscription") || msg.includes("no such customer");
}

type StripeAttempt = { stripe: Stripe; accountId: string | null; label: string };

function buildStripeAttempts(
  stripe: Stripe,
  preferredAccountId: string | null,
  fallbackAccountId: string | null,
): StripeAttempt[] {
  const attempts: StripeAttempt[] = [];
  const push = (accountId: string | null, label: string) => {
    if (!attempts.some((a) => a.stripe === stripe && a.accountId === accountId)) {
      attempts.push({ stripe, accountId, label });
    }
  };
  push(preferredAccountId, preferredAccountId ? `connect:${preferredAccountId}` : "platform");
  if (fallbackAccountId !== preferredAccountId) {
    push(fallbackAccountId, fallbackAccountId ? `connect:${fallbackAccountId}` : "platform-fallback");
  }
  for (const legacy of getLegacyFanSubscriptionStripeClients()) {
    if (!attempts.some((a) => a.stripe === legacy.stripe && a.accountId === null)) {
      attempts.push({ stripe: legacy.stripe, accountId: null, label: legacy.label });
    }
  }
  return attempts;
}

async function listCustomerSubscriptions(
  stripe: Stripe,
  customerId: string,
  accountId: string | null,
): Promise<Stripe.Subscription[]> {
  const opts = accountId ? { stripeAccount: accountId } : undefined;
  const statuses: Stripe.SubscriptionListParams["status"][] = ["active", "trialing", "past_due"];
  const found: Stripe.Subscription[] = [];
  for (const status of statuses) {
    try {
      const page = await stripe.subscriptions.list({ customer: customerId, status, limit: 25 }, opts);
      for (const sub of page.data) {
        if (!found.some((s) => s.id === sub.id)) found.push(sub);
      }
    } catch (e) {
      if (!isMissingStripeResource(e)) throw e;
    }
  }
  return found;
}

async function retrieveSubscriptionById(
  stripe: Stripe,
  subscriptionId: string,
  attempts: StripeAttempt[],
): Promise<Stripe.Subscription | null> {
  for (const attempt of attempts) {
    try {
      const opts = attempt.accountId ? { stripeAccount: attempt.accountId } : undefined;
      return await attempt.stripe.subscriptions.retrieve(subscriptionId, undefined, opts);
    } catch (e) {
      if (!isMissingStripeResource(e)) throw e;
    }
  }
  return null;
}

async function findPaidSubscriptionIdFromOrders(
  db: Firestore,
  creatorId: string,
  fanId: string,
  fanEmail: string,
): Promise<string | null> {
  const candidates = new Set<string>([fanId]);
  const email = fanEmail.trim().toLowerCase();
  if (email) {
    candidates.add(email);
    candidates.add(`${fanId}-${email}`);
  }

  for (const value of candidates) {
    for (const field of ["fanId", "fanEmail"] as const) {
      let snap;
      try {
        snap = await db
          .collection("orders")
          .where("creatorId", "==", creatorId)
          .where("type", "==", "subscription")
          .where("status", "==", "paid")
          .where(field, "==", value)
          .orderBy("createdAt", "desc")
          .limit(8)
          .get();
      } catch {
        snap = await db
          .collection("orders")
          .where("creatorId", "==", creatorId)
          .where("type", "==", "subscription")
          .where(field, "==", value)
          .limit(40)
          .get()
          .catch(() => null);
      }
      if (!snap) continue;
      const rows = snap.docs
        .map((d) => d.data() as { stripeSubscriptionId?: string; createdAt?: string })
        .filter((r) => typeof r.stripeSubscriptionId === "string" && r.stripeSubscriptionId.startsWith("sub_"))
        .sort((a, b) => {
          const ta = Date.parse(String(a.createdAt || "")) || 0;
          const tb = Date.parse(String(b.createdAt || "")) || 0;
          return tb - ta;
        });
      if (rows[0]?.stripeSubscriptionId) return rows[0].stripeSubscriptionId.trim();
    }
  }
  return null;
}

/** Last resort when fan row lost stripeCustomerId but subscription metadata is correct in Stripe. */
async function findActiveSubscriptionByMetadataScan(
  attempts: StripeAttempt[],
  creatorId: string,
  fanId: string,
): Promise<Stripe.Subscription | null> {
  const statuses: Stripe.SubscriptionListParams["status"][] = ["active", "trialing", "past_due"];
  for (const attempt of attempts) {
    const opts = attempt.accountId ? { stripeAccount: attempt.accountId } : undefined;
    for (const status of statuses) {
      try {
        const page = await attempt.stripe.subscriptions.list({ status, limit: 100 }, opts);
        for (const sub of page.data) {
          if (!subscriptionMatchesFanHub(sub, creatorId, fanId)) continue;
          if (!isPaidLikeStripeStatus(sub.status)) continue;
          return sub;
        }
      } catch (e) {
        if (!isMissingStripeResource(e)) throw e;
      }
    }
  }
  return null;
}

export type FanHubSubscriptionCheckoutBlock =
  | { ok: true }
  | {
      ok: false;
      status: 409;
      code: "ALREADY_SUBSCRIBED";
      error: string;
      subscribed: true;
      subscriptionId?: string | null;
    };

/** Block duplicate Checkout when Firestore or Stripe already shows paid membership. */
export async function assertFanHubMemberMayStartSubscriptionCheckout(
  db: Firestore,
  creatorId: string,
  fanId: string,
  fanEmail: string,
): Promise<FanHubSubscriptionCheckoutBlock> {
  const [grantSnap, subSnap] = await Promise.all([
    db.collection("creatorEntitlements").doc(creatorId).collection("grants").doc(fanId).get(),
    db.collection("creatorSubscribers").doc(creatorId).collection("subscribers").doc(fanId).get(),
  ]);
  const subStatus =
    typeof subSnap.data()?.status === "string" ? subSnap.data()!.status.trim().toLowerCase() : "";
  if (subStatus === "active" || subStatus === "trialing") {
    return {
      ok: false,
      status: 409,
      code: "ALREADY_SUBSCRIBED",
      error: "You already have an active membership on this page.",
      subscribed: true,
      subscriptionId:
        typeof subSnap.data()?.stripeSubscriptionId === "string"
          ? subSnap.data()!.stripeSubscriptionId
          : null,
    };
  }

  const grantActive = grantSnap.data()?.subscription === true;
  if (grantActive && subStatus !== "canceled") {
    return {
      ok: false,
      status: 409,
      code: "ALREADY_SUBSCRIBED",
      error: "You already have membership access on this page.",
      subscribed: true,
    };
  }

  const recon = await reconcileFanHubPaidSubscriptionFromStripe(db, creatorId, fanId, fanEmail);
  if (recon.reconciled) {
    return {
      ok: false,
      status: 409,
      code: "ALREADY_SUBSCRIBED",
      error: "Your active membership was restored — no need to pay again.",
      subscribed: true,
      subscriptionId: recon.subscriptionId,
    };
  }

  return { ok: true };
}

/**
 * If Stripe has an active Fan Hub subscription for this fan+creator but Firestore is stale,
 * repair subscriber + grant + fan row. Returns the subscription id when reconciled.
 */
export async function reconcileFanHubPaidSubscriptionFromStripe(
  db: Firestore,
  creatorId: string,
  fanId: string,
  fanEmail = "",
): Promise<{ reconciled: boolean; subscriptionId: string | null; stripeStatus: string | null }> {
  const stripe = getPlatformStripe();
  if (!stripe) {
    return { reconciled: false, subscriptionId: null, stripeStatus: null };
  }

  const [creatorSnap, creatorUserSnap, fanSnap, subSnap] = await Promise.all([
    db.collection("creators").doc(creatorId).get(),
    db.collection("users").doc(creatorId).get(),
    db.collection("creators").doc(creatorId).collection("fans").doc(fanId).get(),
    db.collection("creatorSubscribers").doc(creatorId).collection("subscribers").doc(fanId).get(),
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
  const preferredAccountId = isPlatform ? null : connectId;
  const fallbackAccountId = isPlatform ? connectId : null;
  const attempts = buildStripeAttempts(stripe, preferredAccountId, fallbackAccountId);

  const fanData = fanSnap.data() as { stripeCustomerId?: string } | undefined;
  const subData = subSnap.data() as { stripeSubscriptionId?: string; stripeCustomerId?: string } | undefined;
  const customerId =
    (typeof fanData?.stripeCustomerId === "string" ? fanData.stripeCustomerId.trim() : "") ||
    (typeof subData?.stripeCustomerId === "string" ? subData.stripeCustomerId.trim() : "") ||
    "";

  const storedSubId =
    typeof subData?.stripeSubscriptionId === "string" ? subData.stripeSubscriptionId.trim() : "";

  let best: Stripe.Subscription | null = null;

  if (storedSubId) {
    const retrieved = await retrieveSubscriptionById(stripe, storedSubId, attempts);
    if (retrieved && subscriptionMatchesFanHub(retrieved, creatorId, fanId) && isPaidLikeStripeStatus(retrieved.status)) {
      best = retrieved;
    }
  }

  if (!best && customerId.startsWith("cus_")) {
    for (const attempt of attempts) {
      let subs: Stripe.Subscription[] = [];
      try {
        subs = await listCustomerSubscriptions(attempt.stripe, customerId, attempt.accountId);
      } catch (e) {
        if (!isMissingStripeResource(e)) throw e;
        continue;
      }
      for (const sub of subs) {
        if (!subscriptionMatchesFanHub(sub, creatorId, fanId)) continue;
        if (!isPaidLikeStripeStatus(sub.status)) continue;
        if (!best) {
          best = sub;
          continue;
        }
        const rank = (s: string) => (s === "active" || s === "trialing" ? 0 : 1);
        if (rank(sub.status) < rank(best.status)) best = sub;
      }
      if (best) break;
    }
  }

  if (!best) {
    const orderSubId = await findPaidSubscriptionIdFromOrders(db, creatorId, fanId, fanEmail);
    if (orderSubId) {
      const retrieved = await retrieveSubscriptionById(stripe, orderSubId, attempts);
      if (retrieved && subscriptionMatchesFanHub(retrieved, creatorId, fanId) && isPaidLikeStripeStatus(retrieved.status)) {
        best = retrieved;
      }
    }
  }

  if (!best) {
    best = await findActiveSubscriptionByMetadataScan(attempts, creatorId, fanId);
  }

  if (!best) {
    return { reconciled: false, subscriptionId: null, stripeStatus: null };
  }

  await applyFanHubSubscriptionFromStripe(db, best, "stripe_subscription_reconcile");
  return { reconciled: true, subscriptionId: best.id, stripeStatus: best.status };
}
