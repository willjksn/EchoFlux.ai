import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import {
  upsertFanHubFanPreferenceFromMember,
  ensureFanDmThreadForMember,
} from "./_syncFanHubFanPreference.js";

/**
 * POST: Join a creator's fan page for free (no payment required).
 * Creates a fan record in creators/{creatorId}/fans collection.
 * 
 * Body: { creatorId }
 * Requires authentication.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized - please sign in" });
  }

  const body = (req.body || {}) as { creatorId?: string };
  const { creatorId } = body;

  if (!creatorId) {
    return res.status(400).json({ error: "creatorId is required" });
  }

  const fanId = decoded.uid;
  const fanEmail = decoded.email || null;

  try {
    const db = getAdminDb();
    const now = new Date().toISOString();

    // Get creator data to verify free access is enabled
    const creatorSnap = await db.collection("creators").doc(creatorId).get();
    if (!creatorSnap.exists) {
      return res.status(404).json({ error: "Creator not found" });
    }

    const creatorData = creatorSnap.data() as {
      monetization?: { freeAccessEnabled?: boolean };
      /** Legacy shape on older creator docs */
      freeAccessEnabled?: boolean;
      displayName?: string;
      handle?: string;
    } | undefined;

    // Check if free access is enabled for this creator
    const freeAccessEnabled =
      creatorData?.monetization?.freeAccessEnabled === true ||
      creatorData?.freeAccessEnabled === true;
    if (!freeAccessEnabled) {
      return res.status(400).json({ error: "This creator requires a paid subscription" });
    }

    // Check if fan is already a member
    const fanRef = db.collection("creators").doc(creatorId).collection("fans").doc(fanId);
    const fanSnap = await fanRef.get();

    const syncMemberUsernameToFan = async () => {
      try {
        const userSnap = await db.collection("users").doc(fanId).get();
        const raw = userSnap.data() as { username?: string } | undefined;
        const un = typeof raw?.username === "string" ? raw.username.trim().toLowerCase() : "";
        if (un.length >= 3 && /^[a-z0-9_]+$/.test(un)) {
          await fanRef.set({ username: un, updatedAt: now }, { merge: true });
        }
      } catch {
        // non-fatal
      }
    };

    const syncFanHubFanCardAndThread = async () => {
      try {
        await upsertFanHubFanPreferenceFromMember(db, creatorId, fanId, now, "free_membership");
        await ensureFanDmThreadForMember(db, creatorId, fanId, now);
      } catch (e) {
        console.error("syncFanHubFanPreference (free join):", e);
      }
    };

    if (fanSnap.exists) {
      const existingData = fanSnap.data() as { subscriptionStatus?: string };
      // If already an active subscriber, just return success
      if (existingData?.subscriptionStatus === 'active' || existingData?.subscriptionStatus === 'free') {
        await syncMemberUsernameToFan();
        await syncFanHubFanCardAndThread();
        return res.status(200).json({ 
          success: true, 
          message: "Already a member",
          membershipType: existingData.subscriptionStatus === 'free' ? 'free' : 'paid'
        });
      }
      // Update existing record to free membership
      await fanRef.update({
        subscriptionStatus: 'free',
        freeJoinedAt: now,
        updatedAt: now,
      });
      await syncMemberUsernameToFan();
    } else {
      // Create new free member record
      await fanRef.set({
        id: fanId,
        creatorId,
        email: fanEmail,
        displayName: null, // Will be updated from user profile if available
        subscriptionStatus: 'free',
        freeJoinedAt: now,
        totalSpentCents: 0,
        purchaseCount: 0,
        tipCount: 0,
        totalTipsCents: 0,
        createdAt: now,
        updatedAt: now,
      });
      await syncMemberUsernameToFan();
    }

    // Also grant entitlements for free members
    const grantRef = db.collection("creatorEntitlements").doc(creatorId).collection("grants").doc(fanId);
    const grantSnap = await grantRef.get();
    const existing = grantSnap.data() as { unlockedProductIds?: string[] } | undefined;
    const unlocked = Array.isArray(existing?.unlockedProductIds) ? existing.unlockedProductIds : [];
    await grantRef.set({ 
      subscription: true, // Grant access like a subscriber
      membershipType: 'free',
      unlockedProductIds: unlocked, 
      updatedAt: now 
    }, { merge: true });

    await syncFanHubFanCardAndThread();

    // Update creator stats
    const statsRef = db.collection("creatorStats").doc(creatorId);
    const statsSnap = await statsRef.get();
    const stats = statsSnap.data() as { totalFreeMembers?: number; totalMembers?: number } | undefined;
    await statsRef.set({
      totalFreeMembers: (stats?.totalFreeMembers ?? 0) + 1,
      totalMembers: (stats?.totalMembers ?? 0) + 1,
      updatedAt: now,
    }, { merge: true });

    console.log(`Free membership joined: creator=${creatorId} fan=${fanId}`);

    return res.status(200).json({ 
      success: true, 
      message: "Successfully joined!",
      membershipType: 'free'
    });
  } catch (e: unknown) {
    console.error("joinFreeMembership error:", e);
    const msg = e instanceof Error ? e.message : "Failed to join";
    return res.status(500).json({ error: "Failed to join", message: msg });
  }
}
