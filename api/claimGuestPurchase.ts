import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPlatformStripe } from "./_stripeConnect.js";
import { getAdminApp, getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { mergeGuestTreatPurchasesIntoUid } from "./_mergeGuestFanPurchases.js";

/**
 * POST: After guest store checkout, fan signs in with the same email as Stripe → link purchases to uid.
 * Body: { sessionId?: string, session_id?: string }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = (req.body || {}) as { sessionId?: string; session_id?: string };
  const sessionId = (body.sessionId || body.session_id || "").trim();
  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }

  const stripe = getPlatformStripe();
  if (!stripe) {
    return res.status(503).json({ error: "Stripe is not configured" });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return res.status(400).json({ error: "Checkout is not complete" });
    }
    if (session.metadata?.guestCheckout !== "true" || session.metadata?.type !== "product") {
      return res.status(400).json({ error: "Not a guest store checkout" });
    }

    const creatorId = session.metadata?.creatorId;
    if (!creatorId) {
      return res.status(400).json({ error: "Invalid session metadata" });
    }

    const sessionEmail = (session.customer_details?.email || "").trim().toLowerCase();
    if (!sessionEmail) {
      return res.status(400).json({ error: "No email on checkout session" });
    }

    const app = getAdminApp();
    const user = await app.auth().getUser(decoded.uid);
    const firebaseEmail = (user.email || "").trim().toLowerCase();
    if (!firebaseEmail || firebaseEmail !== sessionEmail) {
      return res.status(403).json({
        error: "Sign in with the same email you used at checkout to link your purchase.",
      });
    }

    const stripeCustomerId =
      typeof session.customer === "string"
        ? session.customer
        : (session.customer as { id?: string } | null)?.id || null;
    if (!stripeCustomerId || !stripeCustomerId.startsWith("cus_")) {
      return res.status(400).json({ error: "Missing Stripe customer on session" });
    }

    const db = getAdminDb();
    const now = new Date().toISOString();
    const merged = await mergeGuestTreatPurchasesIntoUid(db, creatorId, decoded.uid, stripeCustomerId, now);

    return res.status(200).json({ success: true, merged });
  } catch (e: unknown) {
    console.error("claimGuestPurchase error:", e);
    const msg = e instanceof Error ? e.message : "Failed to claim purchase";
    return res.status(500).json({ error: "Claim failed", message: msg });
  }
}
