/**
 * POST: Creator (or platform admin) restores a member's paid access from Stripe when
 * Firestore is stale after failed-then-succeeded checkouts.
 *
 * Body: { fanId?: string; fanEmail?: string; creatorId?: string } — creatorId only for platform admins.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { hasPlatformAdminAccess } from "./_platformAdminAccess.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { resolveFanHubMemberAuthUid } from "./_resolveFanHubMemberId.js";
import { reconcileFanHubPaidSubscriptionFromStripe } from "./_fanHubSubscriptionLifecycle.js";

type MembershipSnapshot = {
  fanSubscriptionStatus: string | null;
  subscriberStatus: string | null;
  grantSubscription: boolean;
  stripeSubscriptionId: string | null;
};

async function readMembershipSnapshot(
  db: ReturnType<typeof getAdminDb>,
  creatorId: string,
  fanId: string,
): Promise<MembershipSnapshot> {
  const [fanSnap, subSnap, grantSnap] = await Promise.all([
    db.collection("creators").doc(creatorId).collection("fans").doc(fanId).get(),
    db.collection("creatorSubscribers").doc(creatorId).collection("subscribers").doc(fanId).get(),
    db.collection("creatorEntitlements").doc(creatorId).collection("grants").doc(fanId).get(),
  ]);
  const fan = fanSnap.data() as { subscriptionStatus?: string } | undefined;
  const sub = subSnap.data() as { status?: string; stripeSubscriptionId?: string } | undefined;
  const grant = grantSnap.data() as { subscription?: boolean } | undefined;
  return {
    fanSubscriptionStatus:
      typeof fan?.subscriptionStatus === "string" ? fan.subscriptionStatus : null,
    subscriberStatus: typeof sub?.status === "string" ? sub.status : null,
    grantSubscription: grant?.subscription === true,
    stripeSubscriptionId:
      typeof sub?.stripeSubscriptionId === "string" ? sub.stripeSubscriptionId : null,
  };
}

function membershipLooksActive(snap: MembershipSnapshot): boolean {
  const st = (snap.fanSubscriptionStatus || snap.subscriberStatus || "").trim().toLowerCase();
  return snap.grantSubscription && (st === "active" || st === "trialing");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
    keyPrefix: "creatorReconcileFanMembership",
    limit: 20,
    windowMs: 60_000,
    identifier: decoded.uid,
  });
  if (!rlOk) return;

  const body = (req.body || {}) as {
    fanId?: string;
    fanEmail?: string;
    creatorId?: string;
  };

  try {
    const db = getAdminDb();
    if (!db) {
      return res.status(500).json({ error: "Database unavailable" });
    }

    let creatorId = decoded.uid;
    const requestedCreatorId = typeof body.creatorId === "string" ? body.creatorId.trim() : "";
    if (requestedCreatorId && requestedCreatorId !== creatorId) {
      const adminSnap = await db.collection("users").doc(decoded.uid).get();
      if (!hasPlatformAdminAccess(adminSnap.data() as Record<string, unknown> | undefined)) {
        return res.status(403).json({ error: "Only platform admins may reconcile another creator's members" });
      }
      creatorId = requestedCreatorId;
    }

    const fanIdInput = typeof body.fanId === "string" ? body.fanId.trim() : "";
    const fanEmailInput = typeof body.fanEmail === "string" ? body.fanEmail.trim() : "";
    if (!fanIdInput && !fanEmailInput) {
      return res.status(400).json({
        error: "fanId or fanEmail is required",
        code: "MISSING_MEMBER",
      });
    }

    const resolved = await resolveFanHubMemberAuthUid(db, creatorId, {
      fanId: fanIdInput,
      fanEmail: fanEmailInput,
    });
    if (!resolved) {
      return res.status(404).json({
        error: "Could not find a member for that email or id. They need a fan row or Firebase Auth account.",
        code: "MEMBER_NOT_FOUND",
      });
    }

    const { fanId, email } = resolved;
    const before = await readMembershipSnapshot(db, creatorId, fanId);

    if (membershipLooksActive(before)) {
      return res.status(200).json({
        ok: true,
        reconciled: false,
        alreadyActive: true,
        fanId,
        email: email || null,
        before,
        after: before,
        message: "Member already has active paid access in Firestore.",
      });
    }

    const stripeResult = await reconcileFanHubPaidSubscriptionFromStripe(db, creatorId, fanId, email);
    const after = await readMembershipSnapshot(db, creatorId, fanId);

    if (!stripeResult.reconciled) {
      return res.status(404).json({
        error:
          "No active Stripe subscription found for this member on your page. Check Stripe Customers for their email, or have them use Membership & billing in the member portal.",
        code: "NO_ACTIVE_STRIPE_SUBSCRIPTION",
        fanId,
        email: email || null,
        before,
        after,
      });
    }

    return res.status(200).json({
      ok: true,
      reconciled: true,
      alreadyActive: false,
      fanId,
      email: email || null,
      subscriptionId: stripeResult.subscriptionId,
      stripeStatus: stripeResult.stripeStatus,
      before,
      after,
      message: "Membership restored from Stripe. They can sign in without paying again.",
    });
  } catch (e: unknown) {
    console.error("creatorReconcileFanMembership error:", e);
    return res.status(500).json({
      error: "Failed to reconcile membership",
      details: process.env.NODE_ENV === "development" ? (e as Error)?.message : undefined,
    });
  }
}
