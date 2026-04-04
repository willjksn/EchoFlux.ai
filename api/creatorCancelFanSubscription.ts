/**
 * POST: Creator cancels a fan's Stripe subscription (at period end, same as fan self-service).
 * Auth: creator (Bearer uid). Body: { fanId }.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPlatformStripe } from "./_stripeConnect.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";

const PLATFORM_OWNER_IDS = (process.env.PLATFORM_OWNER_CREATOR_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isCreatorPlatformOwner(
  creatorId: string,
  creatorData: { isPlatformOwner?: boolean; platformOwner?: boolean; role?: string } | undefined
): boolean {
  if (PLATFORM_OWNER_IDS.includes(creatorId)) return true;
  if (!creatorData) return false;
  if (creatorData.isPlatformOwner === true) return true;
  if (creatorData.platformOwner === true) return true;
  if (typeof creatorData.role === "string") {
    const role = creatorData.role.toLowerCase().trim();
    if (role === "owner" || role === "admin" || role === "platform_owner") return true;
  }
  return false;
}

function resolveConnectAccountId(creatorData: Record<string, unknown> | undefined): string | null {
  if (!creatorData) return null;
  const d = creatorData as {
    stripeConnectAccountId?: string;
    stripeAccountId?: string;
    connectedStripeAccountId?: string;
    stripe?: { connectAccountId?: string };
  };
  const id =
    d.stripeConnectAccountId ||
    d.stripeAccountId ||
    d.connectedStripeAccountId ||
    d.stripe?.connectAccountId ||
    null;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const creatorId = decoded.uid;

  const body = (req.body || {}) as { fanId?: string };
  const fanId = typeof body.fanId === "string" ? body.fanId.trim() : "";
  if (!fanId) {
    return res.status(400).json({ error: "fanId is required" });
  }

  const stripe = getPlatformStripe();
  if (!stripe) {
    return res.status(503).json({ error: "Payments are not configured" });
  }

  const db = getAdminDb();
  if (!db) {
    return res.status(500).json({ error: "Database unavailable" });
  }

  const fanRef = db.collection("creators").doc(creatorId).collection("fans").doc(fanId);
  const fanSnap = await fanRef.get();
  if (!fanSnap.exists) {
    return res.status(404).json({ error: "No member record for this fan" });
  }

  const subRef = db.collection("creatorSubscribers").doc(creatorId).collection("subscribers").doc(fanId);
  const subSnap = await subRef.get();
  if (!subSnap.exists) {
    return res.status(404).json({ error: "No Stripe subscription on file for this member" });
  }

  const data = subSnap.data() as { stripeSubscriptionId?: string; status?: string };
  const subscriptionId =
    typeof data.stripeSubscriptionId === "string" ? data.stripeSubscriptionId.trim() : "";
  if (!subscriptionId) {
    return res.status(400).json({ error: "No Stripe subscription id — member may be manual or migrated without billing" });
  }
  if (data.status === "canceled") {
    return res.status(400).json({ error: "Subscription is already canceled" });
  }

  const [creatorSnap, creatorUserSnap] = await Promise.all([
    db.collection("creators").doc(creatorId).get(),
    db.collection("users").doc(creatorId).get(),
  ]);
  const creatorData = creatorSnap.data() as Record<string, unknown> | undefined;
  const creatorUserData = creatorUserSnap.data() as
    | { isPlatformOwner?: boolean; platformOwner?: boolean; role?: string }
    | undefined;
  const ownerDetection = {
    isPlatformOwner:
      (creatorData as { isPlatformOwner?: boolean } | undefined)?.isPlatformOwner === true ||
      creatorUserData?.isPlatformOwner === true,
    platformOwner:
      (creatorData as { platformOwner?: boolean } | undefined)?.platformOwner === true ||
      creatorUserData?.platformOwner === true,
    role: ((creatorData as { role?: string } | undefined)?.role || creatorUserData?.role) as string | undefined,
  };
  const isPlatform = isCreatorPlatformOwner(creatorId, ownerDetection);
  const connectId = resolveConnectAccountId(creatorData);

  const stripeOpts = !isPlatform && connectId ? { stripeAccount: connectId } : undefined;

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, stripeOpts);
    const subCpe = (subscription as { current_period_end?: number }).current_period_end;
    if (subscription.cancel_at_period_end) {
      return res.status(200).json({
        ok: true,
        message: "Already set to cancel at the end of the billing period",
        currentPeriodEnd:
          typeof subCpe === "number" && Number.isFinite(subCpe) ? new Date(subCpe * 1000).toISOString() : null,
      });
    }

    await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true }, stripeOpts);
    const periodEnd =
      typeof subCpe === "number" && Number.isFinite(subCpe) ? new Date(subCpe * 1000).toISOString() : null;

    return res.status(200).json({
      ok: true,
      message: "Subscription will cancel at the end of the current billing period. They keep access until then.",
      currentPeriodEnd: periodEnd,
    });
  } catch (e: unknown) {
    const err = e as { message?: string; code?: string };
    console.error("creatorCancelFanSubscription error:", err);
    return res.status(500).json({
      error: err?.message || "Failed to cancel subscription",
    });
  }
}
