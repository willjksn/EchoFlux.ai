/**
 * POST: Issue a Stripe refund for one Fan Hub `orders/{orderId}` row (Checkout / subscription invoice).
 * Platform admin only. Fan Hub aggregates / order status refresh via existing `charge.refunded` webhook.
 */
import type { DocumentData, Firestore } from "firebase-admin/firestore";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { getAdminDb } from "./_firebaseAdmin.js";
import { fanHubCheckoutShouldUseConnectedAccount } from "./_fanHubCheckoutConnectRouting.js";
import { hasPlatformAdminAccess } from "./_platformAdminAccess.js";
import { getPlatformStripe } from "./_stripeConnect.js";
import { verifyAuth } from "./verifyAuth.js";

const PLATFORM_OWNER_IDS = (process.env.PLATFORM_OWNER_CREATOR_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function stripeRefId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}

function connectAccountIdFromCreator(data: Record<string, unknown> | undefined): string | null {
  const nested =
    data?.stripe && typeof data.stripe === "object"
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

function isCreatorPlatformOwner(
  creatorId: string,
  creatorData: DocumentData | undefined,
  userData: DocumentData | undefined,
): boolean {
  if (PLATFORM_OWNER_IDS.includes(creatorId)) return true;
  if (creatorData?.isPlatformOwner === true || userData?.isPlatformOwner === true) return true;
  if (creatorData?.platformOwner === true || userData?.platformOwner === true) return true;
  const role = typeof userData?.role === "string" ? userData.role.toLowerCase().trim() : "";
  if (role === "owner" || role === "admin" || role === "platform_owner") return true;
  return false;
}

async function resolveFanHubStripeAccountId(
  db: Firestore,
  creatorId: string,
): Promise<{ stripeAccount: string | null }> {
  const [creatorDoc, userDoc] = await Promise.all([
    db.collection("creators").doc(creatorId).get(),
    db.collection("users").doc(creatorId).get(),
  ]);
  const c = creatorDoc.data();
  const u = userDoc.data();
  const platformOwner = isCreatorPlatformOwner(creatorId, c, u);
  const connectId = connectAccountIdFromCreator(c as Record<string, unknown> | undefined);
  const useConn = !!connectId && fanHubCheckoutShouldUseConnectedAccount(creatorId, platformOwner);
  return { stripeAccount: useConn ? connectId : null };
}

async function resolvePaymentIntentIdForOrder(params: {
  stripe: Stripe;
  stripeAccount: string | null;
  orderData: Record<string, unknown>;
  orderDocId: string;
}): Promise<string | null> {
  const { stripe, stripeAccount, orderData, orderDocId } = params;
  const opts = stripeAccount ? { stripeAccount } : undefined;

  const piDirect = typeof orderData.stripePaymentIntentId === "string" ? orderData.stripePaymentIntentId.trim() : "";
  if (piDirect.startsWith("pi_")) return piDirect;

  const stripeInvoiceId = typeof orderData.stripeInvoiceId === "string" ? orderData.stripeInvoiceId.trim() : "";
  if (stripeInvoiceId.startsWith("in_")) {
    const inv = await stripe.invoices.retrieve(stripeInvoiceId, { expand: ["payment_intent"] }, opts);
    const invPi = (
      inv as Stripe.Invoice & { payment_intent?: string | Stripe.PaymentIntent | null }
    ).payment_intent;
    return stripeRefId(invPi);
  }

  const sessionIdRaw =
    (typeof orderData.stripeSessionId === "string" && orderData.stripeSessionId.trim()) ||
    (orderDocId.startsWith("cs_") ? orderDocId : "");
  if (!sessionIdRaw.startsWith("cs_")) return null;

  const session = await stripe.checkout.sessions.retrieve(
    sessionIdRaw,
    { expand: ["payment_intent", "invoice"] },
    opts,
  );
  let pi = stripeRefId(session.payment_intent);
  if (!pi) {
    const invId = stripeRefId(session.invoice);
    if (invId?.startsWith("in_")) {
      const inv = await stripe.invoices.retrieve(invId, { expand: ["payment_intent"] }, opts);
      const invPi = (
        inv as Stripe.Invoice & { payment_intent?: string | Stripe.PaymentIntent | null }
      ).payment_intent;
      pi = stripeRefId(invPi);
    }
  }
  return pi;
}

const REFUND_ALLOWED_TYPES = new Set([
  "subscription",
  "product",
  "tip",
  "post_unlock",
  "unlock",
  "live_stream_ticket",
]);

function safeOrderDocId(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s.length < 4 || s.length > 300) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  return s;
}

/** Matches `createdAt` shapes on Fan Hub `orders` (ISO string / Firestore Timestamp / ms). */
function orderCreatedAtMs(createdAt: unknown): number | null {
  if (createdAt == null) return null;
  if (typeof (createdAt as { toDate?: () => Date }).toDate === "function") {
    return (createdAt as { toDate: () => Date }).toDate().getTime();
  }
  if (createdAt instanceof Date) return createdAt.getTime();
  if (typeof createdAt === "string") {
    const t = Date.parse(createdAt);
    return Number.isNaN(t) ? null : t;
  }
  if (typeof createdAt === "number" && Number.isFinite(createdAt)) {
    return createdAt < 1e12 ? createdAt * 1000 : createdAt;
  }
  return null;
}

const REFUND_ELIGIBILITY_WINDOW_MS = 24 * 60 * 60 * 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) return res.status(401).json({ error: "Unauthorized" });

  const stripe = getPlatformStripe();
  if (!stripe) return res.status(503).json({ error: "Stripe is not configured" });

  const body = (req.body || {}) as { orderId?: unknown; cancelSubscription?: unknown };
  const orderId = safeOrderDocId(body.orderId);
  const cancelSubscription = body.cancelSubscription === true;

  if (!orderId) return res.status(400).json({ error: "orderId is required" });

  const db = getAdminDb();
  if (!db) return res.status(500).json({ error: "Database unavailable" });

  const adminSnap = await db.collection("users").doc(decoded.uid).get();
  if (!hasPlatformAdminAccess(adminSnap.data() as Record<string, unknown> | undefined)) {
    return res.status(403).json({ error: "Admin access required" });
  }

  try {
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return res.status(404).json({ error: "Order not found" });
    }
    const orderData = orderSnap.data() || {};
    const creatorId = typeof orderData.creatorId === "string" ? orderData.creatorId.trim() : "";
    if (!creatorId) {
      return res.status(400).json({ error: "Order is missing creatorId" });
    }

    const rawType = typeof orderData.type === "string" ? orderData.type.trim().toLowerCase() : "";
    const orderType =
      rawType === "treat" ? "product" : rawType === "unlock" ? "post_unlock" : rawType;

    if (!REFUND_ALLOWED_TYPES.has(orderType)) {
      return res.status(400).json({ error: "Refunds are not enabled for this order type" });
    }

    const status = typeof orderData.status === "string" ? orderData.status.trim().toLowerCase() : "";
    if (status === "refunded") {
      return res.status(400).json({ error: "This order is already marked refunded" });
    }
    if (status !== "paid" && status !== "partially_refunded") {
      return res.status(400).json({ error: "Only paid (or partially refunded) orders can be refunded in Stripe" });
    }

    const amountCents = Math.max(0, Math.round(Number(orderData.amountCents) || 0));
    if (amountCents <= 0) {
      return res.status(400).json({ error: "Order amount is invalid for refund" });
    }

    const createdMs = orderCreatedAtMs(orderData.createdAt);
    if (createdMs == null) {
      return res.status(400).json({
        error: "Order has no usable createdAt; refund only via Stripe Dashboard.",
        code: "ORDER_TIME_UNKNOWN",
      });
    }
    if (Date.now() - createdMs > REFUND_ELIGIBILITY_WINDOW_MS) {
      return res.status(403).json({
        error:
          "This order is outside the 24-hour admin refund window. Refund in Stripe Dashboard if still needed.",
        code: "REFUND_WINDOW_EXPIRED",
      });
    }

    const { stripeAccount } = await resolveFanHubStripeAccountId(db, creatorId);

    const piId = await resolvePaymentIntentIdForOrder({
      stripe,
      stripeAccount,
      orderData,
      orderDocId: orderId,
    });
    if (!piId) {
      return res.status(400).json({
        error:
          "Could not resolve Stripe PaymentIntent for this order. Use Stripe Dashboard or admin recover tools.",
        code: "PAYMENT_INTENT_UNRESOLVED",
      });
    }

    await orderRef.set({ stripePaymentIntentId: piId }, { merge: true });

    const stripeOpts = stripeAccount ? { stripeAccount } : undefined;

    try {
      const refund = await stripe.refunds.create(
        {
          payment_intent: piId,
          reason: "requested_by_customer",
          ...(stripeAccount ? { refund_application_fee: true } : {}),
        },
        stripeOpts,
      );

      let subscriptionCanceled = false;
      if (cancelSubscription) {
        const subId =
          typeof orderData.stripeSubscriptionId === "string" ? orderData.stripeSubscriptionId.trim() : "";
        if (subId.startsWith("sub_")) {
          await stripe.subscriptions.cancel(subId, {}, stripeOpts);
          subscriptionCanceled = true;
        }
      }

      return res.status(200).json({
        ok: true,
        refundId: refund.id,
        paymentIntentId: piId,
        subscriptionCanceled,
        message:
          "Stripe refund created. EchoFlux bookkeeping updates when Stripe sends charge.refunded (usually within seconds).",
      });
    } catch (e: unknown) {
      console.error("adminRefundFanHubOrder stripe error:", e);
      const msg = e instanceof Error ? e.message : "Stripe refund failed";
      return res.status(400).json({ error: msg, code: "STRIPE_REFUND_FAILED" });
    }
  } catch (e: unknown) {
    console.error("adminRefundFanHubOrder error:", e);
    const msg = e instanceof Error ? e.message : "Refund failed";
    return res.status(500).json({ error: msg });
  }
}
