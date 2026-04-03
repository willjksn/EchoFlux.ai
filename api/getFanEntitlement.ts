import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";

/**
 * Check if the current user (fan) has an active subscription/entitlement to the given creator.
 * Used by fan storefront: if subscribed, show Feed + Store + Messages; otherwise show landing.
 *
 * Firestore: creatorSubscribers/{creatorId}/subscribers/{fanId} with { status: 'active', ... }
 * or equivalent. Until that is populated, returns { subscribed: false } when no doc exists.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { creatorId } = req.query;
  if (!creatorId || typeof creatorId !== "string") {
    return res.status(400).json({ error: "creatorId is required" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(200).json({ subscribed: false, unlockedProductIds: [], unlockedFanPostIds: [] });
  }

  const fanId = decoded.uid;

  try {
    const db = getAdminDb();
    if (!db) {
      return res.status(500).json({ error: "Database unavailable" });
    }

    let subscribed = false;
    let membershipType: 'paid' | 'free' | null = null;

    // First check the primary fans collection (includes both paid and free members)
    const fanRef = db.collection("creators").doc(creatorId).collection("fans").doc(fanId);
    const fanSnap = await fanRef.get();
    if (fanSnap.exists) {
      const fanData = fanSnap.data() as { subscriptionStatus?: string } | undefined;
      const status = fanData?.subscriptionStatus;
      if (status === "active" || status === "trialing") {
        subscribed = true;
        membershipType = 'paid';
      } else if (status === "free") {
        subscribed = true;
        membershipType = 'free';
      }
    }

    // Also check legacy creatorSubscribers collection if not already subscribed
    if (!subscribed) {
      const subscriberRef = db
        .collection("creatorSubscribers")
        .doc(creatorId)
        .collection("subscribers")
        .doc(fanId);
      const subscriberSnap = await subscriberRef.get();
      if (subscriberSnap.exists) {
        const data = subscriberSnap.data() as { status?: string } | undefined;
        if (data?.status === "active" || data?.status === "trialing") {
          subscribed = true;
          membershipType = 'paid';
        }
      }
    }

    // Load creatorEntitlements grant for unlocked products
    const grantRef = db
      .collection("creatorEntitlements")
      .doc(creatorId)
      .collection("grants")
      .doc(fanId);
    const grantSnap = await grantRef.get();
    let unlockedProductIds: string[] = [];
    let unlockedFanPostIds: string[] = [];
    if (grantSnap.exists) {
      const grantData = grantSnap.data() as {
        unlockedProductIds?: string[];
        unlockedFanPostIds?: string[];
        subscription?: boolean;
        membershipType?: string;
      } | undefined;
      unlockedProductIds = Array.isArray(grantData?.unlockedProductIds) ? grantData.unlockedProductIds : [];
      unlockedFanPostIds = Array.isArray(grantData?.unlockedFanPostIds) ? grantData.unlockedFanPostIds : [];
      // Also check entitlements grant for subscription status
      if (!subscribed && grantData?.subscription) {
        subscribed = true;
        membershipType = grantData.membershipType === 'free' ? 'free' : 'paid';
      }
    }

    // Member username (global fan handle) — server read; clients cannot write username on users/*
    let memberUsername: string | null = null;
    let memberUsernameRequired = false;
    const userSnap = await db.collection("users").doc(fanId).get();
    const uData = userSnap.data() as { username?: string } | undefined;
    const u = typeof uData?.username === "string" ? uData.username.trim().toLowerCase() : "";
    if (u.length >= 3 && /^[a-z0-9_]+$/.test(u)) {
      memberUsername = u;
    }
    // Same gate for free and paid: any signed-in fan on this storefront must pick @handle (claim API allows pre-membership).
    if (!memberUsername) {
      memberUsernameRequired = true;
    }

    return res.status(200).json({
      subscribed,
      membershipType,
      unlockedProductIds,
      unlockedFanPostIds,
      memberUsername,
      memberUsernameRequired,
    });
  } catch (error: unknown) {
    console.error("getFanEntitlement error:", error);
    return res.status(500).json({
      error: "Failed to check entitlement",
      details: process.env.NODE_ENV === "development" ? (error as Error)?.message : undefined,
    });
  }
}
