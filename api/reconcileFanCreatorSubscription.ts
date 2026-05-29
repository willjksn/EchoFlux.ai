/**
 * POST: Repair Fan Hub paid membership when Firestore is stale but Stripe shows an active subscription.
 * Auth: fan. Body: { creatorId }
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyBrowserApiCors } from "./_browserApiCors.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { reconcileFanHubPaidSubscriptionFromStripe } from "./_fanHubSubscriptionLifecycle.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyBrowserApiCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const rlOk = await enforceRateLimit({
    req,
    res,
    keyPrefix: "reconcileFanCreatorSubscription",
    limit: 12,
    windowMs: 60_000,
    identifier: decoded.uid,
  });
  if (!rlOk) return;

  const body = (req.body || {}) as { creatorId?: string };
  const creatorId = typeof body.creatorId === "string" ? body.creatorId.trim() : "";
  if (!creatorId) {
    return res.status(400).json({ error: "creatorId is required" });
  }

  try {
    const db = getAdminDb();
    if (!db) {
      return res.status(500).json({ error: "Database unavailable" });
    }

    const fanEmail =
      typeof decoded.email === "string" ? decoded.email.trim().toLowerCase() : undefined;
    const result = await reconcileFanHubPaidSubscriptionFromStripe(db, creatorId, decoded.uid, {
      fanEmail,
    });
    return res.status(200).json({
      reconciled: result.reconciled,
      subscribed: result.reconciled,
      subscriptionId: result.subscriptionId,
      stripeStatus: result.stripeStatus,
    });
  } catch (e: unknown) {
    console.error("reconcileFanCreatorSubscription error:", e);
    return res.status(500).json({ error: "Failed to reconcile subscription" });
  }
}
