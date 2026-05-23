/**
 * GET: Safe default payment method summary for EchoFlux SaaS billing (platform Stripe customer).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPlatformStripe } from "./_stripeConnect.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import {
  fetchDefaultCardFromStripeCustomer,
  resolvePlatformStripeCustomerId,
} from "./_echoFluxBillingReminders.js";
import { formatCardExpiryLabel } from "../src/lib/echoFluxBillingReminders.js";

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
    return res.status(503).json({ error: "Payments are not configured" });
  }

  const db = getAdminDb();
  if (!db) {
    return res.status(500).json({ error: "Database unavailable" });
  }

  try {
    const userSnap = await db.collection("users").doc(decoded.uid).get();
    if (!userSnap.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userSnap.data() as {
      stripeCustomerId?: string;
      stripeSubscriptionId?: string;
      echoFluxDefaultCardExp?: { expMonth: number; expYear: number; last4?: string; brand?: string };
    };

    const customerId = await resolvePlatformStripeCustomerId(db, decoded.uid, userData);
    if (!customerId) {
      return res.status(200).json({ hasCard: false });
    }

    const card =
      (await fetchDefaultCardFromStripeCustomer(stripe, customerId)) || userData.echoFluxDefaultCardExp || null;

    if (!card) {
      return res.status(200).json({ hasCard: false });
    }

    return res.status(200).json({
      hasCard: true,
      last4: card.last4 || null,
      brand: card.brand || null,
      expMonth: card.expMonth,
      expYear: card.expYear,
      expLabel: formatCardExpiryLabel(card),
    });
  } catch (e) {
    console.error("getCreatorBillingPaymentMethod:", e);
    return res.status(500).json({ error: "Failed to load payment method" });
  }
}
