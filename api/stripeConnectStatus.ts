import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPlatformStripe } from "./_stripeConnect.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";

// Platform owner creator IDs - no Stripe Connect needed, payments go directly to EchoFlux
const PLATFORM_OWNER_IDS = (process.env.PLATFORM_OWNER_CREATOR_IDS || "").split(",").map(s => s.trim()).filter(Boolean);

function isReconnectableConnectError(err: unknown): boolean {
  const e = err as { code?: string; type?: string; message?: string };
  const msg = (e?.message || "").toLowerCase();
  return (
    e?.code === "resource_missing" ||
    e?.type === "StripeInvalidRequestError" ||
    msg.includes("no such account") ||
    msg.includes("does not have access to account") ||
    msg.includes("this key cannot access account")
  );
}

/**
 * GET: Return Stripe Connect status for the authenticated creator.
 * Response: { stripeConnectAccountId, chargesEnabled, payoutsEnabled, detailsSubmitted, isPlatformOwner }.
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

  try {
    const db = getAdminDb();
    const creatorId = decoded.uid;
    
    // Check if this is a platform owner (e.g., Stormij)
    const isPlatformOwner = PLATFORM_OWNER_IDS.includes(creatorId);
    
    // Platform owners don't need Stripe Connect - payments go directly to EchoFlux
    if (isPlatformOwner) {
      return res.status(200).json({
        stripeConnectAccountId: null,
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
        isPlatformOwner: true,
      });
    }
    
    const creatorRef = db.collection("creators").doc(creatorId);
    const creatorSnap = await creatorRef.get();
    const data = creatorSnap.data() as {
      stripeConnectAccountId?: string;
      stripeAccountId?: string;
      connectedStripeAccountId?: string;
      stripe?: { connectAccountId?: string };
    } | undefined;
    const accountId =
      data?.stripeConnectAccountId ||
      data?.stripeAccountId ||
      data?.connectedStripeAccountId ||
      data?.stripe?.connectAccountId ||
      null;

    if (!accountId) {
      return res.status(200).json({
        stripeConnectAccountId: null,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        isPlatformOwner: false,
      });
    }

    // Backfill canonical field if we discovered a legacy key.
    if (accountId && data?.stripeConnectAccountId !== accountId) {
      await creatorRef.set(
        { stripeConnectAccountId: accountId, updatedAt: new Date().toISOString() },
        { merge: true },
      );
    }

    let chargesEnabled = false;
    let payoutsEnabled = false;
    let detailsSubmitted = false;
    try {
      const account = await stripe.accounts.retrieve(accountId);
      chargesEnabled = account.charges_enabled === true;
      payoutsEnabled = account.payouts_enabled === true;
      detailsSubmitted = account.details_submitted === true;
    } catch (e) {
      if (isReconnectableConnectError(e)) {
        return res.status(200).json({
          stripeConnectAccountId: accountId,
          chargesEnabled: false,
          payoutsEnabled: false,
          detailsSubmitted: false,
          isPlatformOwner: false,
          reconnectRequired: true,
        });
      }
      throw e;
    }

    return res.status(200).json({
      stripeConnectAccountId: accountId,
      chargesEnabled,
      payoutsEnabled,
      detailsSubmitted,
      isPlatformOwner: false,
    });
  } catch (e: unknown) {
    console.error("stripeConnectStatus error:", e);
    const msg = e instanceof Error ? e.message : "Status check failed";
    return res.status(500).json({ error: "Status check failed", message: msg });
  }
}
