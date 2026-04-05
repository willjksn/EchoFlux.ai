import type { VercelRequest, VercelResponse } from "@vercel/node";
import type Stripe from "stripe";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { getPlatformStripe } from "./_stripeConnect.js";

type OrderRow = {
  id: string;
  creatorId: string;
  type: string;
  amountCents: number;
  status: string;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  tipHandle?: string;
  fanEmail?: string;
  createdAt: string;
};

function hasPlatformAdminAccess(userData: Record<string, unknown> | undefined): boolean {
  if (!userData) return false;
  const role = typeof userData.role === "string" ? userData.role.trim().toLowerCase() : "";
  if (role === "admin" || role === "superadmin" || role === "owner") return true;
  if (userData.isAdmin === true || userData.isSuperAdmin === true || userData.isOwner === true) return true;
  return false;
}

function createdAtToMs(createdAt: unknown): number {
  if (createdAt == null) return 0;
  if (typeof (createdAt as { toDate?: () => Date }).toDate === "function") {
    return (createdAt as { toDate: () => Date }).toDate().getTime();
  }
  if (createdAt instanceof Date) return createdAt.getTime();
  if (typeof createdAt === "string") {
    const t = Date.parse(createdAt);
    return Number.isNaN(t) ? 0 : t;
  }
  if (typeof createdAt === "number" && Number.isFinite(createdAt)) {
    return createdAt < 1e12 ? createdAt * 1000 : createdAt;
  }
  return 0;
}

function toIso(createdAt: unknown): string {
  const ms = createdAtToMs(createdAt);
  return ms > 0 ? new Date(ms).toISOString() : new Date(0).toISOString();
}

function normalizeOrderType(d: Record<string, unknown>): string {
  const raw = typeof d.type === "string" ? d.type.trim().toLowerCase() : "";
  if (
    raw === "tip" ||
    raw === "product" ||
    raw === "subscription" ||
    raw === "unlock" ||
    raw === "post_unlock"
  ) {
    return raw;
  }
  if (raw === "treat") return "product";
  if (typeof d.tipHandle === "string" && d.tipHandle.trim()) return "tip";
  return "product";
}

function isCreatorPlatformOwner(
  creatorId: string,
  creatorData:
    | {
        isPlatformOwner?: boolean;
        platformOwner?: boolean;
        role?: string;
      }
    | undefined,
): boolean {
  const platformOwnerIds = (process.env.PLATFORM_OWNER_CREATOR_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (platformOwnerIds.includes(creatorId)) return true;
  if (creatorData?.isPlatformOwner === true) return true;
  if (creatorData?.platformOwner === true) return true;
  if (typeof creatorData?.role === "string") {
    const role = creatorData.role.toLowerCase().trim();
    if (role === "owner" || role === "admin" || role === "platform_owner") return true;
  }
  return false;
}

async function listTipSessionsForAccount(
  stripe: Stripe,
  accountId: string | null,
  creatorId: string,
  sinceUnix: number,
  limit: number
): Promise<
  Array<{
    id: string;
    account: string | null;
    amountCents: number;
    paymentStatus: string;
    status: string;
    fanEmail?: string;
    tipHandle?: string;
    paymentIntentId?: string;
    applicationFeeCents?: number;
    createdAt: string;
  }>
> {
  const out: Array<{
    id: string;
    account: string | null;
    amountCents: number;
    paymentStatus: string;
    status: string;
    fanEmail?: string;
    tipHandle?: string;
    paymentIntentId?: string;
    applicationFeeCents?: number;
    createdAt: string;
  }> = [];

  const params: Stripe.Checkout.SessionListParams = {
    limit: Math.min(Math.max(limit, 1), 100),
    created: { gte: sinceUnix },
    expand: ["data.payment_intent"],
  };
  const reqOpts = accountId ? ({ stripeAccount: accountId } as Stripe.RequestOptions) : undefined;
  const list = reqOpts
    ? await stripe.checkout.sessions.list(params, reqOpts)
    : await stripe.checkout.sessions.list(params);

  for (const s of list.data) {
    const md = s.metadata || {};
    const mdCreator = (md.creatorId || "").trim();
    const mdType = (md.type || "").trim().toLowerCase();
    if (mdCreator !== creatorId || mdType !== "tip") continue;
    const paymentIntentId =
      typeof s.payment_intent === "string"
        ? s.payment_intent
        : (s.payment_intent as Stripe.PaymentIntent | null)?.id;
    const appFee =
      typeof s.payment_intent === "object" && s.payment_intent
        ? ((s.payment_intent as Stripe.PaymentIntent).application_fee_amount ?? undefined)
        : undefined;
    out.push({
      id: s.id,
      account: accountId,
      amountCents: s.amount_total ?? 0,
      paymentStatus: s.payment_status || "",
      status: s.status || "",
      fanEmail:
        (typeof s.customer_details?.email === "string" && s.customer_details.email.trim()) ||
        (typeof s.metadata?.fanEmail === "string" && s.metadata.fanEmail.trim()) ||
        undefined,
      tipHandle: typeof s.metadata?.tipHandle === "string" ? s.metadata.tipHandle : undefined,
      paymentIntentId: paymentIntentId || undefined,
      applicationFeeCents: typeof appFee === "number" ? appFee : undefined,
      createdAt: new Date((s.created || 0) * 1000).toISOString(),
    });
  }
  return out;
}

/**
 * Admin-only reconciliation for Fan Hub tips.
 * Compares Firestore `orders` vs Stripe Checkout sessions (type=tip) for a creator.
 * GET /api/adminReconcileFanHubTips?creatorId=<uid>&days=90&limit=50
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) return res.status(401).json({ error: "Unauthorized" });

  const creatorId = String(req.query.creatorId || "").trim();
  if (!creatorId) return res.status(400).json({ error: "creatorId is required" });

  const daysParam = parseInt(String(req.query.days || "90"), 10);
  const days = Number.isFinite(daysParam) ? Math.min(Math.max(daysParam, 1), 365) : 90;
  const limitParam = parseInt(String(req.query.limit || "50"), 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 50;
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const sinceIso = new Date(sinceMs).toISOString();
  const sinceUnix = Math.floor(sinceMs / 1000);

  try {
    const db = getAdminDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    const callerSnap = await db.collection("users").doc(decoded.uid).get();
    const caller = (callerSnap.data() as Record<string, unknown> | undefined) ?? undefined;
    if (!hasPlatformAdminAccess(caller)) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const stripe = getPlatformStripe();
    if (!stripe) {
      return res.status(503).json({ error: "Stripe not configured" });
    }

    const creatorSnap = await db.collection("creators").doc(creatorId).get();
    const creatorData = creatorSnap.data() as
      | {
          stripeConnectAccountId?: string;
          stripeAccountId?: string;
          connectedStripeAccountId?: string;
          stripe?: { connectAccountId?: string };
          isPlatformOwner?: boolean;
          platformOwner?: boolean;
          role?: string;
        }
      | undefined;
    const creatorUserSnap = await db.collection("users").doc(creatorId).get();
    const creatorUserData = creatorUserSnap.data() as
      | { isPlatformOwner?: boolean; platformOwner?: boolean; role?: string }
      | undefined;

    const ownerDetectionData = {
      isPlatformOwner:
        creatorData?.isPlatformOwner === true || creatorUserData?.isPlatformOwner === true,
      platformOwner:
        creatorData?.platformOwner === true || creatorUserData?.platformOwner === true,
      role: creatorData?.role || creatorUserData?.role,
    };
    const isPlatformOwner = isCreatorPlatformOwner(creatorId, ownerDetectionData);
    const connectAccountId =
      creatorData?.stripeConnectAccountId ||
      creatorData?.stripeAccountId ||
      creatorData?.connectedStripeAccountId ||
      creatorData?.stripe?.connectAccountId ||
      null;

    // Firestore source of truth in app dashboards
    let orderDocs = await db
      .collection("orders")
      .where("creatorId", "==", creatorId)
      .where("createdAt", ">=", sinceIso)
      .limit(5000)
      .get()
      .catch(async () => {
        const snap = await db.collection("orders").where("creatorId", "==", creatorId).limit(5000).get();
        return snap;
      });

    const firestoreOrders: OrderRow[] = orderDocs.docs
      .map((d) => {
        const raw = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          creatorId: String(raw.creatorId || ""),
          type: normalizeOrderType(raw),
          amountCents: Number(raw.amountCents || 0),
          status: String(raw.status || "paid"),
          stripeSessionId: typeof raw.stripeSessionId === "string" ? raw.stripeSessionId : undefined,
          stripePaymentIntentId:
            typeof raw.stripePaymentIntentId === "string" ? raw.stripePaymentIntentId : undefined,
          tipHandle: typeof raw.tipHandle === "string" ? raw.tipHandle : undefined,
          fanEmail: typeof raw.fanEmail === "string" ? raw.fanEmail : undefined,
          createdAt: toIso(raw.createdAt),
        };
      })
      .filter((o) => Date.parse(o.createdAt) >= sinceMs)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    const firestoreTipOrders = firestoreOrders.filter((o) => o.type === "tip" && o.status !== "refunded");
    const firestoreTipBySession = new Map(
      firestoreTipOrders
        .filter((o) => typeof o.stripeSessionId === "string" && o.stripeSessionId.trim())
        .map((o) => [String(o.stripeSessionId), o] as const)
    );

    // Stripe source (platform + connected account where relevant)
    const accountCandidates: Array<string | null> = [];
    if (isPlatformOwner) {
      accountCandidates.push(null);
      if (connectAccountId) accountCandidates.push(connectAccountId);
    } else {
      if (connectAccountId) accountCandidates.push(connectAccountId);
      accountCandidates.push(null);
    }
    const accountSet = Array.from(new Set(accountCandidates));

    const stripeTipsNested = await Promise.all(
      accountSet.map((acct) => listTipSessionsForAccount(stripe, acct, creatorId, sinceUnix, limit))
    );
    const stripeTips = stripeTipsNested.flat().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const stripeTipsBySession = new Map(stripeTips.map((s) => [s.id, s] as const));

    const missingInFirestore = stripeTips
      .filter((s) => !firestoreTipBySession.has(s.id))
      .map((s) => ({
        stripeSessionId: s.id,
        amountCents: s.amountCents,
        amountUsd: Number((s.amountCents / 100).toFixed(2)),
        account: s.account,
        paymentStatus: s.paymentStatus,
        status: s.status,
        fanEmail: s.fanEmail,
        tipHandle: s.tipHandle,
        createdAt: s.createdAt,
      }));

    const firestoreTipMissingOnStripe = firestoreTipOrders
      .filter((o) => o.stripeSessionId && !stripeTipsBySession.has(String(o.stripeSessionId)))
      .map((o) => ({
        orderId: o.id,
        stripeSessionId: o.stripeSessionId,
        amountCents: o.amountCents,
        fanEmail: o.fanEmail,
        tipHandle: o.tipHandle,
        createdAt: o.createdAt,
      }));

    const stripeTipGrossCents = stripeTips.reduce((acc, s) => acc + (s.amountCents || 0), 0);
    const stripeApplicationFeeCents = stripeTips.reduce(
      (acc, s) => acc + (typeof s.applicationFeeCents === "number" ? s.applicationFeeCents : 0),
      0
    );
    const firestoreTipGrossCents = firestoreTipOrders.reduce((acc, o) => acc + (o.amountCents || 0), 0);

    return res.status(200).json({
      creatorId,
      windowDays: days,
      since: sinceIso,
      limitPerStripeAccount: limit,
      connectAccountId: connectAccountId || null,
      isPlatformOwner,
      summary: {
        firestoreTipOrders: firestoreTipOrders.length,
        stripeTipSessions: stripeTips.length,
        firestoreTipGrossUsd: Number((firestoreTipGrossCents / 100).toFixed(2)),
        stripeTipGrossUsd: Number((stripeTipGrossCents / 100).toFixed(2)),
        stripeApplicationFeeUsd: Number((stripeApplicationFeeCents / 100).toFixed(2)),
        expectedTenPercentFromStripeGrossUsd: Number(((stripeTipGrossCents * 0.1) / 100).toFixed(2)),
        missingInFirestoreCount: missingInFirestore.length,
        firestoreTipMissingOnStripeCount: firestoreTipMissingOnStripe.length,
      },
      missingInFirestore: missingInFirestore.slice(0, 100),
      firestoreTipMissingOnStripe: firestoreTipMissingOnStripe.slice(0, 100),
      samples: {
        stripeTips: stripeTips.slice(0, 20),
        firestoreTipOrders: firestoreTipOrders.slice(0, 20),
      },
    });
  } catch (e: unknown) {
    console.error("adminReconcileFanHubTips error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return res.status(500).json({ error: "Failed to reconcile tips", message: msg.slice(0, 240) });
  }
}
