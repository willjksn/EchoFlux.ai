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

type BalanceEntry = { currency: string; amountCents: number };

function mapBalanceEntries(entries: Stripe.Balance.Available[] | Stripe.Balance.Pending[]): BalanceEntry[] {
  return entries
    .filter((entry) => typeof entry.amount === "number" && entry.amount !== 0)
    .map((entry) => ({
      currency: (entry.currency || "usd").toLowerCase(),
      amountCents: entry.amount,
    }));
}

/**
 * GET: Return Stripe balance (available + pending) for the authenticated creator.
 * Platform owners read the main EchoFlux account; Connect creators read their Express account.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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
    const db = getAdminDb();
    const creatorSnap = await db.collection("creators").doc(creatorId).get();
    const data = creatorSnap.data() as
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

    const isPlatformOwner = isCreatorPlatformOwner(creatorId, data);

    if (isPlatformOwner) {
      const balance = await stripe.balance.retrieve();
      return res.status(200).json({
        isPlatformOwner: true,
        available: mapBalanceEntries(balance.available),
        pending: mapBalanceEntries(balance.pending),
      });
    }

    const accountId = resolveConnectAccountId(data);
    if (!accountId) {
      return res.status(200).json({
        isPlatformOwner: false,
        available: [],
        pending: [],
        hasConnectAccount: false,
      });
    }

    const balance = await stripe.balance.retrieve({}, { stripeAccount: accountId });
    return res.status(200).json({
      isPlatformOwner: false,
      hasConnectAccount: true,
      available: mapBalanceEntries(balance.available),
      pending: mapBalanceEntries(balance.pending),
    });
  } catch (e: unknown) {
    console.error("stripeConnectBalance error:", e);
    const msg = e instanceof Error ? e.message : "Balance check failed";
    const stripeCode = e instanceof Stripe.errors.StripeError ? e.code : undefined;
    return res.status(500).json({
      error: "Balance check failed",
      message: msg,
      stripeCode: stripeCode ?? null,
    });
  }
}
