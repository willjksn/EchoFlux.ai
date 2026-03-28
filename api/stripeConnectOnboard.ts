import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPlatformStripe } from "./_stripeConnect.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";

/**
 * POST: Start or continue Stripe Connect Express onboarding for the authenticated creator.
 * - If creator has no stripeConnectAccountId: creates Express account, saves to creators/{creatorId}, returns account link URL.
 * - If creator already has account: creates a new account link (e.g. for refresh_url) and returns URL.
 * Body: { refresh?: boolean } — set refresh true when user lands on refresh_url (e.g. re-onboard).
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
    const useTest =
      (process.env.STRIPE_USE_TEST_MODE || "").toString().toLowerCase().trim() === "true" ||
      (process.env.STRIPE_USE_TEST_MODE || "").toString().toLowerCase().trim() === "1";
    return res.status(503).json({
      error: "Stripe is not configured",
      code: "STRIPE_NOT_CONFIGURED",
      hint: useTest
        ? "This deployment has no usable sk_test_ key. Set STRIPE_SECRET_KEY_Test or STRIPE_SECRET_KEY_TEST (or STRIPE_SECRET_KEY) for Preview. In Vercel, enable these variables for the Preview environment."
        : "This deployment has no usable secret key. Set STRIPE_SECRET_KEY_LIVE or STRIPE_SECRET_KEY for Preview/Production. In Vercel → Settings → Environment Variables, tick Preview (not only Production).",
    });
  }

  const origin = (req.headers.origin || req.headers.referer || "").replace(/\/$/, "") || process.env.NEXT_PUBLIC_APP_URL || "https://echoflux.ai";
  // Fan Hub is primary entry (/fan); /studio still resolves to Premium Studio for legacy bookmarks
  const returnUrl = `${origin}/fan?tab=payouts&connect=return`;
  const refreshUrl = `${origin}/fan?tab=payouts&connect=refresh`;

  try {
    const db = getAdminDb();
    const creatorId = decoded.uid;
    const creatorRef = db.collection("creators").doc(creatorId);
    const creatorSnap = await creatorRef.get();
    const data = creatorSnap.data() as { stripeConnectAccountId?: string } | undefined;
    let accountId = data?.stripeConnectAccountId;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "US",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
      accountId = account.id;
      await creatorRef.set(
        { stripeConnectAccountId: accountId, updatedAt: new Date().toISOString() },
        { merge: true }
      );
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    if (!link.url) {
      return res.status(500).json({ error: "Failed to create account link" });
    }

    return res.status(200).json({ url: link.url, accountId });
  } catch (e: unknown) {
    console.error("stripeConnectOnboard error:", e);
    const msg = e instanceof Error ? e.message : "Onboarding failed";
    
    // Check for Connect not enabled error
    if (msg.includes("signed up for Connect") || msg.includes("Connect")) {
      return res.status(503).json({ 
        error: "Stripe Connect not enabled", 
        message: "The platform needs to enable Stripe Connect. Please contact support.",
        setupRequired: true
      });
    }
    
    return res.status(500).json({ error: "Onboarding failed", message: msg });
  }
}
