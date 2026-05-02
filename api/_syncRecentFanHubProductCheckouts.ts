import type Stripe from "stripe";
import type { Firestore } from "firebase-admin/firestore";
import { getPlatformStripe } from "./_stripeConnect.js";
import { processFanHubCheckoutSessionCompleted } from "./stripeWebhook.js";

function connectAccountIdFromCreator(data: Record<string, unknown> | undefined): string | null {
  const nested = data?.stripe && typeof data.stripe === "object"
    ? (data.stripe as { connectAccountId?: unknown }).connectAccountId
    : null;
  const id =
    data?.stripeConnectAccountId ||
    data?.stripeAccountId ||
    data?.connectedStripeAccountId ||
    nested ||
    null;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

function sessionEmail(session: Stripe.Checkout.Session): string {
  return (
    normalizeEmail(session.customer_details?.email) ||
    normalizeEmail(session.customer_email) ||
    normalizeEmail(session.metadata?.fanEmail)
  );
}

function sessionBelongsToFan(session: Stripe.Checkout.Session, fanId?: string, fanEmail?: string): boolean {
  const wantedFanId = typeof fanId === "string" ? fanId.trim() : "";
  const wantedEmail = normalizeEmail(fanEmail);
  if (!wantedFanId && !wantedEmail) return true;
  const metaFanId = normalizeEmail(session.metadata?.fanId || session.client_reference_id);
  if (wantedFanId && metaFanId === wantedFanId.toLowerCase()) return true;
  return !!wantedEmail && sessionEmail(session) === wantedEmail;
}

function paymentIntentMetadata(session: Stripe.Checkout.Session): Stripe.Metadata | undefined {
  return session.payment_intent && typeof session.payment_intent === "object"
    ? session.payment_intent.metadata
    : undefined;
}

function withMergedMetadata(session: Stripe.Checkout.Session, fallbackFanId?: string, fallbackFanEmail?: string): Stripe.Checkout.Session {
  const piMetadata = paymentIntentMetadata(session) || {};
  const sessionMetadata = session.metadata || {};
  const merged = {
    ...piMetadata,
    ...sessionMetadata,
    ...(fallbackFanId && !sessionMetadata.fanId && !piMetadata.fanId ? { fanId: fallbackFanId } : {}),
    ...(fallbackFanEmail && !sessionMetadata.fanEmail && !piMetadata.fanEmail ? { fanEmail: fallbackFanEmail } : {}),
  };
  return { ...session, metadata: merged };
}

export async function syncRecentFanHubProductCheckouts(params: {
  db: Firestore;
  creatorId: string;
  fanId?: string;
  fanEmail?: string;
  days?: number;
  limit?: number;
}): Promise<{ synced: number; scanned: number }> {
  const { db, creatorId, fanId, fanEmail } = params;
  const cleanCreatorId = creatorId.trim();
  if (!cleanCreatorId) return { synced: 0, scanned: 0 };
  const stripe = getPlatformStripe();
  if (!stripe) return { synced: 0, scanned: 0 };

  const creatorSnap = await db.collection("creators").doc(cleanCreatorId).get();
  const connectAccountId = connectAccountIdFromCreator(creatorSnap.data() as Record<string, unknown> | undefined);
  const accountIds = Array.from(new Set([connectAccountId, null]));
  const sinceUnix = Math.floor((Date.now() - Math.min(Math.max(params.days ?? 60, 1), 365) * 24 * 60 * 60 * 1000) / 1000);
  const perAccountLimit = Math.min(Math.max(params.limit ?? 100, 1), 100);

  let synced = 0;
  let scanned = 0;
  for (const accountId of accountIds) {
    try {
      const listParams: Stripe.Checkout.SessionListParams = {
        limit: perAccountLimit,
        created: { gte: sinceUnix },
        expand: ["data.payment_intent"],
      };
      const sessions = accountId
        ? await stripe.checkout.sessions.list(listParams, { stripeAccount: accountId })
        : await stripe.checkout.sessions.list(listParams);
      for (const session of sessions.data) {
        scanned += 1;
        const patchedSession = withMergedMetadata(session, fanId, fanEmail);
        const metadata = patchedSession.metadata || {};
        if (metadata.creatorId !== cleanCreatorId) continue;
        if (!sessionBelongsToFan(patchedSession, fanId, fanEmail)) continue;
        const paid =
          patchedSession.status === "complete" ||
          patchedSession.payment_status === "paid" ||
          patchedSession.payment_status === "no_payment_required";
        if (!paid) continue;
        const applied = await processFanHubCheckoutSessionCompleted(db, patchedSession);
        if (applied) synced += 1;
      }
    } catch (e) {
      console.warn("syncRecentFanHubProductCheckouts skipped account", accountId, e);
    }
  }

  return { synced, scanned };
}

export async function syncRecentFanHubCheckoutsForAdminRevenue(params: {
  db: Firestore;
  days?: number;
  limitPerAccount?: number;
  maxCreators?: number;
}): Promise<{ synced: number; scanned: number; accounts: number; creators: number }> {
  const stripe = getPlatformStripe();
  if (!stripe) return { synced: 0, scanned: 0, accounts: 0, creators: 0 };

  const maxCreators = Math.min(Math.max(params.maxCreators ?? 1000, 1), 2000);
  const creatorSnap = await params.db.collection("creators").limit(maxCreators).get();
  const creatorIds = new Set<string>();
  const accountIds = new Set<string | null>([null]);
  creatorSnap.docs.forEach((docSnap) => {
    creatorIds.add(docSnap.id);
    const accountId = connectAccountIdFromCreator(docSnap.data() as Record<string, unknown>);
    if (accountId) accountIds.add(accountId);
  });

  const sinceUnix = Math.floor((Date.now() - Math.min(Math.max(params.days ?? 90, 1), 365) * 24 * 60 * 60 * 1000) / 1000);
  const limit = Math.min(Math.max(params.limitPerAccount ?? 100, 1), 100);
  let synced = 0;
  let scanned = 0;

  for (const accountId of accountIds) {
    try {
      const listParams: Stripe.Checkout.SessionListParams = {
        limit,
        created: { gte: sinceUnix },
        expand: ["data.payment_intent"],
      };
      const sessions = accountId
        ? await stripe.checkout.sessions.list(listParams, { stripeAccount: accountId })
        : await stripe.checkout.sessions.list(listParams);
      for (const session of sessions.data) {
        scanned += 1;
        const patchedSession = withMergedMetadata(session);
        const creatorId = String(patchedSession.metadata?.creatorId || "").trim();
        if (!creatorId || !creatorIds.has(creatorId)) continue;
        const paid =
          patchedSession.status === "complete" ||
          patchedSession.payment_status === "paid" ||
          patchedSession.payment_status === "no_payment_required";
        if (!paid) continue;
        const applied = await processFanHubCheckoutSessionCompleted(params.db, patchedSession);
        if (applied) synced += 1;
      }
    } catch (e) {
      console.warn("syncRecentFanHubCheckoutsForAdminRevenue skipped account", accountId, e);
    }
  }

  return { synced, scanned, accounts: accountIds.size, creators: creatorIds.size };
}
