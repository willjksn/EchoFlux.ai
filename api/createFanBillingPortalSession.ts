/**
 * POST: Stripe Customer Portal for a fan's subscription to a creator (Connect or platform).
 * Auth: fan (Bearer). Body: { creatorId, returnUrl? }.
 * Uses stripeCustomerId on creators/.../fans/{fanId} or resolves customer from the subscription.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  getPlatformStripe,
  billingPortalSessionsCreate,
  subscriptionsRetrieve,
} from "./_stripeConnect.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";

const PLATFORM_OWNER_IDS = (process.env.PLATFORM_OWNER_CREATOR_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const STRIPE_USE_TEST_MODE =
  (process.env.STRIPE_USE_TEST_MODE || "").toString().toLowerCase().trim() === "true" ||
  (process.env.STRIPE_USE_TEST_MODE || "").toString().toLowerCase().trim() === "1";

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

function isMissingStripeResource(err: unknown): boolean {
  const e = err as { code?: string; type?: string; message?: string };
  const msg = (e?.message || "").toLowerCase();
  return e?.code === "resource_missing" || msg.includes("no such subscription") || msg.includes("no such customer");
}

async function retrieveSubscriptionWithFallback({
  stripe,
  subscriptionId,
  preferredAccountId,
  fallbackAccountId,
}: {
  stripe: NonNullable<ReturnType<typeof getPlatformStripe>>;
  subscriptionId: string;
  preferredAccountId: string | null;
  fallbackAccountId: string | null;
}) {
  const attempts: Array<string | null> = [];
  const pushAttempt = (id: string | null) => {
    if (!attempts.includes(id)) attempts.push(id);
  };
  pushAttempt(preferredAccountId);
  pushAttempt(fallbackAccountId);

  let lastError: unknown = null;
  for (const accountId of attempts) {
    try {
      const subscription = await subscriptionsRetrieve(stripe, subscriptionId, accountId);
      return { subscription, accountId };
    } catch (e) {
      lastError = e;
      if (!isMissingStripeResource(e)) throw e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not load subscription from Stripe");
}

function sanitizeReturnUrl(input: string | undefined, fallback: string, allowLocalHttp: boolean): string {
  if (!input || typeof input !== "string") return fallback;
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return fallback;
    const host = parsed.hostname.toLowerCase();
    const isLocalHost =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local");
    if (isLocalHost && !allowLocalHttp) return fallback;
    if (parsed.protocol === "http:" && !isLocalHost) return fallback;
    return parsed.toString();
  } catch {
    return fallback;
  }
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

  const body = (req.body || {}) as { creatorId?: string; returnUrl?: string };
  const creatorId = typeof body.creatorId === "string" ? body.creatorId.trim() : "";
  if (!creatorId) {
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

  const configuredAppUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://echoflux.ai").replace(/\/$/, "");
  const fallbackReturn = `${configuredAppUrl}/`;
  const returnUrl = sanitizeReturnUrl(body.returnUrl, fallbackReturn, STRIPE_USE_TEST_MODE);

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
  /** Platform-owner checkouts live on the platform account even if a Connect id exists on the creator doc. */
  const connectedAccountIdForStripe = isPlatform ? null : connectId;

  const subRef = db
    .collection("creatorSubscribers")
    .doc(creatorId)
    .collection("subscribers")
    .doc(fanId);
  const subSnap = await subRef.get();
  const subRow = subSnap.exists ? (subSnap.data() as { stripeSubscriptionId?: string }) : undefined;
  const subscriptionId = typeof subRow?.stripeSubscriptionId === "string" ? subRow.stripeSubscriptionId.trim() : "";
  if (!subscriptionId) {
    return res.status(404).json({ error: "No subscription found for this creator" });
  }

  let resolvedAccountId: string | null = connectedAccountIdForStripe;
  let customerId = "";
  try {
    const { subscription, accountId } = await retrieveSubscriptionWithFallback({
      stripe,
      subscriptionId,
      preferredAccountId: connectedAccountIdForStripe,
      fallbackAccountId: connectedAccountIdForStripe ? null : connectId,
    });
    resolvedAccountId = accountId;
    const cust = subscription.customer;
    customerId = typeof cust === "string" ? cust : (cust as { id?: string } | null)?.id || "";
  } catch (e) {
    const err = e as { message?: string };
    console.error("createFanBillingPortalSession: subscription retrieve failed", err?.message);
    return res.status(502).json({
      error: "Could not load subscription from Stripe. Try again or use cancel at period end in the app.",
    });
  }

  if (!customerId.startsWith("cus_")) {
    return res.status(400).json({ error: "Missing Stripe customer for this membership" });
  }

  const fanRef = db.collection("creators").doc(creatorId).collection("fans").doc(fanId);
  const fanSnap = await fanRef.get();
  const fanData = fanSnap.exists ? (fanSnap.data() as { stripeCustomerId?: string }) : undefined;
  if (fanSnap.exists && fanData?.stripeCustomerId !== customerId) {
    try {
      await fanRef.set({ stripeCustomerId: customerId, updatedAt: new Date().toISOString() }, { merge: true });
    } catch {
      /* non-fatal */
    }
  }

  try {
    const session = await billingPortalSessionsCreate(
      stripe,
      { customer: customerId, return_url: returnUrl },
      resolvedAccountId,
    );
    const url = session?.url;
    if (!url) {
      return res.status(502).json({ error: "Stripe did not return a portal URL" });
    }
    return res.status(200).json({ url });
  } catch (e: unknown) {
    const err = e as { message?: string; code?: string; type?: string };
    console.error("createFanBillingPortalSession: portal session failed", err?.code, err?.message);
    const msg = (err?.message || "").toLowerCase();
    if (
      msg.includes("portal") ||
      msg.includes("billing portal") ||
      msg.includes("configuration") ||
      msg.includes("customer portal") ||
      err?.code === "billing_portal_configuration_inactive"
    ) {
      return res.status(503).json({
        error:
          "Billing portal is not available for this page yet. Use “Cancel at end of billing period” below, or contact the creator.",
        code: "PORTAL_NOT_CONFIGURED",
      });
    }
    return res.status(500).json({ error: err?.message || "Failed to open billing portal" });
  }
}
