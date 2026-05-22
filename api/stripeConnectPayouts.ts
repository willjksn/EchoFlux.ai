import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { getPlatformStripe } from "./_stripeConnect.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";

const PLATFORM_OWNER_IDS = (process.env.PLATFORM_OWNER_CREATOR_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isCreatorPlatformOwner(
  creatorId: string,
  creatorData:
    | { isPlatformOwner?: boolean; platformOwner?: boolean; role?: string }
    | undefined,
): boolean {
  if (PLATFORM_OWNER_IDS.includes(creatorId)) return true;
  if (creatorData?.isPlatformOwner === true) return true;
  if (creatorData?.platformOwner === true) return true;
  if (typeof creatorData?.role === "string" && creatorData.role.toLowerCase().trim() === "owner") {
    return true;
  }
  return false;
}

function resolveConnectAccountId(
  creatorData:
    | {
        stripeConnectAccountId?: string;
        stripeAccountId?: string;
        connectedStripeAccountId?: string;
        stripe?: { connectAccountId?: string };
      }
    | undefined,
): string | null {
  const id =
    creatorData?.stripeConnectAccountId ||
    creatorData?.stripeAccountId ||
    creatorData?.connectedStripeAccountId ||
    creatorData?.stripe?.connectAccountId ||
    null;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export type PayoutRecord = {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  arrivalDate: number | null;
  createdAt: number;
  method: string | null;
};

export type MonthlyPayoutSummary = {
  month: string;
  label: string;
  totalCents: number;
  currency: string;
  count: number;
  payouts: PayoutRecord[];
};

function mapStripePayout(p: Stripe.Payout): PayoutRecord {
  return {
    id: p.id,
    amountCents: p.amount,
    currency: (p.currency || "usd").toLowerCase(),
    status: p.status,
    arrivalDate: typeof p.arrival_date === "number" ? p.arrival_date : null,
    createdAt: p.created,
    method: typeof p.method === "string" ? p.method : null,
  };
}

function monthKeyFromUnix(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabelFromKey(key: string): string {
  const [y, m] = key.split("-");
  const monthIndex = Number(m) - 1;
  if (!Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) return key;
  return new Date(Date.UTC(Number(y), monthIndex, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Earliest month shown in Fan Hub payout history (newest first back through this month). */
const PAYOUT_HISTORY_START_MONTH = "2026-03";

function payoutHistoryMonthKeys(): string[] {
  const keys: string[] = [];
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [startY, startM] = PAYOUT_HISTORY_START_MONTH.split("-").map(Number);
  let cursor = new Date(Date.UTC(startY, startM - 1, 1));
  while (cursor <= end) {
    keys.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return keys.reverse();
}

async function listPayoutsLast12Months(
  stripe: Stripe,
  stripeAccount?: string | null,
): Promise<Stripe.Payout[]> {
  const twelveMonthsAgo = Math.floor(Date.now() / 1000) - 366 * 24 * 3600;
  const requestOptions = stripeAccount ? { stripeAccount } : undefined;
  const all: Stripe.Payout[] = [];
  let startingAfter: string | undefined;

  for (let page = 0; page < 10; page++) {
    const batch = await stripe.payouts.list(
      {
        limit: 100,
        created: { gte: twelveMonthsAgo },
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      },
      requestOptions,
    );
    all.push(...batch.data);
    if (!batch.has_more || batch.data.length === 0) break;
    startingAfter = batch.data[batch.data.length - 1]?.id;
  }

  return all.sort((a, b) => b.created - a.created);
}

function buildPayoutHistory(payouts: Stripe.Payout[]): {
  recent: PayoutRecord[];
  monthly: MonthlyPayoutSummary[];
} {
  const mapped = payouts.map(mapStripePayout);
  const recent = mapped.slice(0, 5);

  const byMonth = new Map<string, PayoutRecord[]>();
  for (const p of mapped) {
    const ts = p.arrivalDate ?? p.createdAt;
    const key = monthKeyFromUnix(ts);
    const list = byMonth.get(key) ?? [];
    list.push(p);
    byMonth.set(key, list);
  }

  const monthly: MonthlyPayoutSummary[] = payoutHistoryMonthKeys().map((month) => {
    const items = byMonth.get(month) ?? [];
    const totalCents = items.reduce((sum, p) => sum + p.amountCents, 0);
    return {
      month,
      label: monthLabelFromKey(month),
      totalCents,
      currency: items[0]?.currency ?? "usd",
      count: items.length,
      payouts: items.sort((a, b) => (b.arrivalDate ?? b.createdAt) - (a.arrivalDate ?? a.createdAt)),
    };
  });

  return { recent, monthly };
}

type CreatorDoc = {
  stripeConnectAccountId?: string;
  stripeAccountId?: string;
  connectedStripeAccountId?: string;
  stripe?: { connectAccountId?: string };
  isPlatformOwner?: boolean;
  platformOwner?: boolean;
  role?: string;
};

async function resolveStripeContext(decodedUid: string) {
  const db = getAdminDb();
  const creatorSnap = await db.collection("creators").doc(decodedUid).get();
  const data = creatorSnap.data() as CreatorDoc | undefined;
  const isPlatformOwner = isCreatorPlatformOwner(decodedUid, data);
  const accountId = isPlatformOwner ? null : resolveConnectAccountId(data);
  return { isPlatformOwner, accountId, hasConnectAccount: !!accountId };
}

/**
 * GET: Recent payouts (last 5) + monthly breakdown from PAYOUT_HISTORY_START_MONTH through current month.
 * POST: Platform owner only — pay out full available USD balance to bank.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const stripe = getPlatformStripe();
  if (!stripe) {
    return res.status(503).json({ error: "Stripe is not configured" });
  }

  const creatorId = decoded.uid;

  try {
    const { isPlatformOwner, accountId, hasConnectAccount } = await resolveStripeContext(creatorId);

    if (req.method === "GET") {
      if (!isPlatformOwner && !hasConnectAccount) {
        return res.status(200).json({
          isPlatformOwner: false,
          canManualPayout: false,
          recent: [],
          monthly: payoutHistoryMonthKeys().map((month) => ({
            month,
            label: monthLabelFromKey(month),
            totalCents: 0,
            currency: "usd",
            count: 0,
            payouts: [],
          })),
        });
      }

      const raw = await listPayoutsLast12Months(stripe, isPlatformOwner ? null : accountId);
      const { recent, monthly } = buildPayoutHistory(raw);

      return res.status(200).json({
        isPlatformOwner,
        canManualPayout: isPlatformOwner,
        recent,
        monthly,
      });
    }

    if (req.method === "POST") {
      if (!isPlatformOwner) {
        return res.status(403).json({
          error: "Manual payouts are only available for the platform owner account.",
        });
      }

      const balance = await stripe.balance.retrieve();
      const usdAvailable =
        balance.available.find((entry) => (entry.currency || "").toLowerCase() === "usd")?.amount ?? 0;

      if (usdAvailable <= 0) {
        return res.status(400).json({
          error: "No available balance to pay out.",
          message: "No available balance to pay out.",
        });
      }

      if (usdAvailable < 100) {
        return res.status(400).json({
          error: "Available balance is below the minimum payout amount ($1.00).",
          message: "Available balance is below the minimum payout amount ($1.00).",
        });
      }

      const payout = await stripe.payouts.create({
        amount: usdAvailable,
        currency: "usd",
      });

      return res.status(200).json({
        ok: true,
        payout: mapStripePayout(payout),
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e: unknown) {
    console.error("stripeConnectPayouts error:", e);
    const msg = e instanceof Error ? e.message : "Payout request failed";
    const stripeCode = e instanceof Stripe.errors.StripeError ? e.code : undefined;
    return res.status(500).json({
      error: "Payout request failed",
      message: msg,
      stripeCode: stripeCode ?? null,
    });
  }
}
