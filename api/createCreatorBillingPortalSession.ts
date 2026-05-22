/**
 * POST: Stripe Customer Portal for the authenticated creator's EchoFlux SaaS subscription.
 * Auth: Bearer. Body: { returnUrl? }.
 * Platform Stripe only (not Connect).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  getPlatformStripe,
  billingPortalSessionsCreate,
  subscriptionsRetrieve,
} from "./_stripeConnect.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";

const STRIPE_USE_TEST_MODE =
  (process.env.STRIPE_USE_TEST_MODE || "").toString().toLowerCase().trim() === "true" ||
  (process.env.STRIPE_USE_TEST_MODE || "").toString().toLowerCase().trim() === "1";

function sanitizeReturnUrl(input: string | undefined, fallback: string, allowLocalHttp: boolean): string {
  if (!input || typeof input !== "string") return fallback;
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return fallback;
    const host = parsed.hostname.toLowerCase();
    const isLocalHost =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local");
    if (isLocalHost && !allowLocalHttp) return fallback;
    if (parsed.protocol === "http:" && !isLocalHost) return fallback;
    return parsed.toString();
  } catch {
    return fallback;
  }
}

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
    return res.status(503).json({ error: "Payments are not configured" });
  }

  const db = getAdminDb();
  if (!db) {
    return res.status(500).json({ error: "Database unavailable" });
  }

  const body = (req.body || {}) as { returnUrl?: string };
  const configuredAppUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://echoflux.ai").replace(/\/$/, "");
  const fallbackReturn = `${configuredAppUrl}/profile`;
  const returnUrl = sanitizeReturnUrl(body.returnUrl, fallbackReturn, STRIPE_USE_TEST_MODE);

  const userSnap = await db.collection("users").doc(decoded.uid).get();
  if (!userSnap.exists) {
    return res.status(404).json({ error: "User not found" });
  }

  const userData = userSnap.data() as {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
  };

  let customerId =
    typeof userData?.stripeCustomerId === "string" ? userData.stripeCustomerId.trim() : "";

  const subscriptionId =
    typeof userData?.stripeSubscriptionId === "string" ? userData.stripeSubscriptionId.trim() : "";

  if (!customerId.startsWith("cus_") && subscriptionId) {
    try {
      const subscription = await subscriptionsRetrieve(stripe, subscriptionId, null);
      const cust = subscription.customer;
      customerId = typeof cust === "string" ? cust : (cust as { id?: string } | null)?.id || "";
      if (customerId.startsWith("cus_")) {
        try {
          await userSnap.ref.set({ stripeCustomerId: customerId }, { merge: true });
        } catch {
          /* non-fatal */
        }
      }
    } catch (e) {
      const err = e as { message?: string };
      console.error("createCreatorBillingPortalSession: subscription retrieve failed", err?.message);
      return res.status(502).json({
        error: "Could not load your subscription from Stripe. Try again or contact support.",
      });
    }
  }

  if (!customerId.startsWith("cus_")) {
    return res.status(400).json({
      error: "No billing profile found. Subscribe to a plan first, then you can update your card in Stripe.",
    });
  }

  try {
    const session = await billingPortalSessionsCreate(
      stripe,
      { customer: customerId, return_url: returnUrl },
      null,
    );
    const url = session?.url;
    if (!url) {
      return res.status(502).json({ error: "Stripe did not return a portal URL" });
    }
    return res.status(200).json({ url });
  } catch (e: unknown) {
    const err = e as { message?: string; code?: string };
    console.error("createCreatorBillingPortalSession: portal session failed", err?.code, err?.message);
    const msg = (err?.message || "").toLowerCase();
    if (
      msg.includes("portal") ||
      msg.includes("billing portal") ||
      msg.includes("configuration") ||
      msg.includes("customer portal") ||
      err?.code === "billing_portal_configuration_inactive"
    ) {
      return res.status(503).json({
        error:
          "Stripe billing portal is not configured yet. Contact support to update your payment method.",
        code: "PORTAL_NOT_CONFIGURED",
      });
    }
    return res.status(500).json({ error: err?.message || "Failed to open billing portal" });
  }
}
