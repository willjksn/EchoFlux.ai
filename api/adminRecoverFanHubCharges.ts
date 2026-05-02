import type { VercelRequest, VercelResponse } from "@vercel/node";
import type Stripe from "stripe";
import { getAdminApp, getAdminDb } from "./_firebaseAdmin.js";
import { hasPlatformAdminAccess } from "./_platformAdminAccess.js";
import { getPlatformStripe } from "./_stripeConnect.js";
import { processFanHubCheckoutSessionCompleted } from "./stripeWebhook.js";
import { verifyAuth } from "./verifyAuth.js";

function stripeRefId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}

function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

async function fanUidFromEmail(email: string): Promise<string | null> {
  const clean = normalizeEmail(email);
  if (!clean) return null;
  try {
    return (await getAdminApp().auth().getUserByEmail(clean)).uid || null;
  } catch {
    return null;
  }
}

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

async function retrieveChargeFromAccount(
  stripe: Stripe,
  chargeId: string,
  accountId: string | null,
): Promise<Stripe.Charge | null> {
  try {
    const params: Stripe.ChargeRetrieveParams = { expand: ["payment_intent"] };
    return accountId
      ? await stripe.charges.retrieve(chargeId, params, { stripeAccount: accountId })
      : await stripe.charges.retrieve(chargeId, params);
  } catch {
    return null;
  }
}

async function retrievePaymentIntentFromAccount(
  stripe: Stripe,
  paymentIntentId: string,
  accountId: string | null,
): Promise<Stripe.PaymentIntent | null> {
  try {
    return accountId
      ? await stripe.paymentIntents.retrieve(paymentIntentId, {}, { stripeAccount: accountId })
      : await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch {
    return null;
  }
}

async function findCheckoutSessionForPaymentIntent(params: {
  stripe: Stripe;
  paymentIntentId: string;
  accountId: string | null;
}): Promise<Stripe.Checkout.Session | null> {
  const listParams: Stripe.Checkout.SessionListParams = {
    payment_intent: params.paymentIntentId,
    limit: 5,
    expand: ["data.payment_intent"],
  };
  const sessions = params.accountId
    ? await params.stripe.checkout.sessions.list(listParams, { stripeAccount: params.accountId })
    : await params.stripe.checkout.sessions.list(listParams);
  return sessions.data[0] || null;
}

async function findCheckoutSessionForCharge(params: {
  stripe: Stripe;
  charge: Stripe.Charge;
  accountId: string | null;
}): Promise<Stripe.Checkout.Session | null> {
  const paymentIntentId = stripeRefId(params.charge.payment_intent);
  if (!paymentIntentId) return null;
  return findCheckoutSessionForPaymentIntent({
    stripe: params.stripe,
    paymentIntentId,
    accountId: params.accountId,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) return res.status(401).json({ error: "Unauthorized" });

  const stripe = getPlatformStripe();
  if (!stripe) return res.status(503).json({ error: "Stripe is not configured" });

  const body = (req.body || {}) as {
    chargeIds?: unknown;
    paymentIntentIds?: unknown;
    ids?: unknown;
    creatorId?: unknown;
    fanEmail?: unknown;
  };
  const rawIds = [
    ...(Array.isArray(body.chargeIds) ? body.chargeIds : []),
    ...(Array.isArray(body.paymentIntentIds) ? body.paymentIntentIds : []),
    ...(Array.isArray(body.ids) ? body.ids : []),
  ];
  const ids = Array.from(new Set(rawIds.map((x) => String(x || "").trim()).filter((x) => /^(ch|pi)_[A-Za-z0-9]+$/.test(x))));
  if (ids.length === 0) return res.status(400).json({ error: "chargeIds, paymentIntentIds, or ids are required" });
  if (ids.length > 10) return res.status(400).json({ error: "Recover at most 10 Stripe ids at a time" });

  try {
    const db = getAdminDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    const adminSnap = await db.collection("users").doc(decoded.uid).get();
    if (!hasPlatformAdminAccess(adminSnap.data() as Record<string, unknown> | undefined)) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const requestedCreatorId = typeof body.creatorId === "string" ? body.creatorId.trim() : "";
    const fanEmail = normalizeEmail(body.fanEmail);
    const fallbackFanUid = fanEmail ? await fanUidFromEmail(fanEmail) : null;

    const accountCandidates: Array<{ accountId: string | null; creatorId: string | null }> = [{ accountId: null, creatorId: null }];
    if (requestedCreatorId) {
      const creatorSnap = await db.collection("creators").doc(requestedCreatorId).get();
      const accountId = connectAccountIdFromCreator(creatorSnap.data() as Record<string, unknown> | undefined);
      if (accountId) accountCandidates.push({ accountId, creatorId: requestedCreatorId });
    } else {
      const creatorsSnap = await db.collection("creators").limit(1000).get();
      creatorsSnap.docs.forEach((docSnap) => {
        const accountId = connectAccountIdFromCreator(docSnap.data() as Record<string, unknown>);
        if (accountId) accountCandidates.push({ accountId, creatorId: docSnap.id });
      });
    }

    const seenAccounts = new Set<string>();
    const uniqueAccounts = accountCandidates.filter((candidate) => {
      const key = candidate.accountId || "__platform__";
      if (seenAccounts.has(key)) return false;
      seenAccounts.add(key);
      return true;
    });

    const results = [];
    for (const stripeId of ids) {
      let recovered = false;
      let foundAccount: string | null = null;
      let sessionId: string | null = null;
      let error: string | null = null;

      for (const candidate of uniqueAccounts) {
        let session: Stripe.Checkout.Session | null = null;
        if (stripeId.startsWith("ch_")) {
          const charge = await retrieveChargeFromAccount(stripe, stripeId, candidate.accountId);
          if (!charge) continue;
          foundAccount = candidate.accountId;
          session = await findCheckoutSessionForCharge({ stripe, charge, accountId: candidate.accountId });
        } else {
          const paymentIntent = await retrievePaymentIntentFromAccount(stripe, stripeId, candidate.accountId);
          if (!paymentIntent) continue;
          foundAccount = candidate.accountId;
          session = await findCheckoutSessionForPaymentIntent({
            stripe,
            paymentIntentId: paymentIntent.id,
            accountId: candidate.accountId,
          });
        }
        if (!session) {
          error = "Stripe id was found, but no Checkout Session was linked to its payment intent.";
          break;
        }
        sessionId = session.id;
        const patchedSession = {
          ...session,
          metadata: {
            ...(session.metadata || {}),
            ...(fanEmail && !session.metadata?.fanEmail ? { fanEmail } : {}),
            ...(fallbackFanUid && !session.metadata?.fanId ? { fanId: fallbackFanUid } : {}),
          },
        } as typeof session;
        recovered = await processFanHubCheckoutSessionCompleted(db, patchedSession);
        error = recovered ? null : "Checkout Session metadata was not applicable to Fan Hub recovery.";
        break;
      }

      results.push({
        stripeId,
        recovered,
        accountId: foundAccount,
        sessionId,
        error,
      });
    }

    return res.status(200).json({
      success: results.every((r) => r.recovered),
      results,
    });
  } catch (e: unknown) {
    console.error("adminRecoverFanHubCharges error:", e);
    const msg = e instanceof Error ? e.message : "Recovery failed";
    return res.status(500).json({ error: "Failed to recover charges", message: msg.slice(0, 240) });
  }
}
