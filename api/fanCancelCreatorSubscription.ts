/**
 * POST: Fan cancels their subscription to a creator (at period end).
 * Auth: fan (Bearer). Body: { creatorId }.
 * Reads stripeSubscriptionId from creatorSubscribers/{creatorId}/subscribers/{fanId}.
 * Webhook customer.subscription.deleted will update Firestore when period ends.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPlatformStripe } from "./_stripeConnect.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const fanId = decoded.uid;

  const body = (req.body || {}) as { creatorId?: string };
  const creatorId = body.creatorId;
  if (!creatorId || typeof creatorId !== "string") {
    return res.status(400).json({ error: "creatorId is required" });
  }

  const stripe = getPlatformStripe();
  if (!stripe) {
    return res.status(503).json({ error: "Payments are not configured" });
  }

  const db = getAdminDb();
  if (!db) {
    return res.status(500).json({ error: "Database unavailable" });
  }

  const subRef = db
    .collection("creatorSubscribers")
    .doc(creatorId)
    .collection("subscribers")
    .doc(fanId);
  const subSnap = await subRef.get();
  if (!subSnap.exists) {
    return res.status(404).json({ error: "No subscription found for this creator" });
  }
  const data = subSnap.data() as { stripeSubscriptionId?: string; status?: string };
  const subscriptionId = data.stripeSubscriptionId;
  if (!subscriptionId) {
    return res.status(400).json({ error: "No active subscription to cancel" });
  }
  if (data.status === "canceled") {
    return res.status(400).json({ error: "Subscription is already canceled" });
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (subscription.cancel_at_period_end) {
      return res.status(200).json({
        ok: true,
        message: "Subscription is already set to cancel at the end of the billing period",
        currentPeriodEnd: subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null,
      });
    }

    await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
    const periodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null;

    return res.status(200).json({
      ok: true,
      message: "Subscription will cancel at the end of your current billing period. You keep access until then.",
      currentPeriodEnd: periodEnd,
    });
  } catch (e: unknown) {
    const err = e as { message?: string; code?: string };
    console.error("fanCancelCreatorSubscription error:", err);
    return res.status(500).json({
      error: err?.message || "Failed to cancel subscription",
    });
  }
}
