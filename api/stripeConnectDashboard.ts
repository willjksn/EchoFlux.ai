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

/**
 * POST: Create a short-lived Stripe Express dashboard login link for the authenticated creator.
 * Creators use this from Fan Hub > Payouts to manage payout details, business info, and descriptors.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
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

    if (isCreatorPlatformOwner(creatorId, data)) {
      return res.status(400).json({ error: "Platform owners do not use connected Stripe accounts." });
    }

    const accountId = resolveConnectAccountId(data);
    if (!accountId) {
      return res.status(400).json({ error: "Connect Stripe before opening Stripe settings." });
    }

    const link = await stripe.accounts.createLoginLink(accountId);

    if (!link.url) {
      return res.status(500).json({ error: "Failed to create Stripe dashboard link" });
    }

    return res.status(200).json({ url: link.url, accountId });
  } catch (e: unknown) {
    console.error("stripeConnectDashboard error:", e);
    const msg = e instanceof Error ? e.message : "Dashboard link failed";
    const stripeCode = e instanceof Stripe.errors.StripeError ? e.code : undefined;
    return res.status(500).json({
      error: "Dashboard link failed",
      message: msg,
      stripeCode: stripeCode ?? null,
    });
  }
}
