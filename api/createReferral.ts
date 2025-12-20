import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, getVerifyAuth } from "./_errorHandler.js";
import { getAdminDb } from "./_firebaseAdmin.js";

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const verifyAuth = await getVerifyAuth();
  const user = await verifyAuth(req);

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { referralCode } = (req.body as any) || {};

  if (!referralCode || typeof referralCode !== "string") {
    res.status(400).json({ error: "Missing or invalid referralCode" });
    return;
  }

  const db = getAdminDb();
  
  try {
    // Check if user already has a referral (can't be referred twice)
    const existingReferrals = await db.collection("referrals")
      .where("refereeId", "==", user.uid)
      .get();
    
    if (!existingReferrals.empty) {
      res.status(400).json({ error: "You have already used a referral code" });
      return;
    }

    // Find the referrer by referral code
    const referrerSnapshot = await db.collection("users")
      .where("referralCode", "==", referralCode.toUpperCase())
      .get();

    if (referrerSnapshot.empty) {
      res.status(404).json({ error: "Invalid referral code" });
      return;
    }

    const referrerDoc = referrerSnapshot.docs[0];
    const referrerId = referrerDoc.id;

    // Can't refer yourself
    if (referrerId === user.uid) {
      res.status(400).json({ error: "You cannot use your own referral code" });
      return;
    }

    // Create referral record
    const referralData = {
      referrerId,
      refereeId: user.uid,
      referralCode: referralCode.toUpperCase(),
      createdAt: new Date().toISOString(),
      rewardStatus: "pending",
    };

    const referralRef = await db.collection("referrals").add(referralData);

    // Update referrer's stats
    const referrerData = referrerDoc.data();
    const currentStats = referrerData.referralStats || {
      totalReferrals: 0,
      activeReferrals: 0,
      rewardsEarned: 0,
      referralCode: referrerData.referralCode || generateReferralCode(referrerId),
    };

    await db.collection("users").doc(referrerId).update({
      referralStats: {
        ...currentStats,
        totalReferrals: (currentStats.totalReferrals || 0) + 1,
        activeReferrals: (currentStats.activeReferrals || 0) + 1,
      },
    });

    // Grant rewards to referee (welcome bonus)
    const userDoc = await db.collection("users").doc(user.uid).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      // Give extra AI generations as welcome bonus
      await db.collection("users").doc(user.uid).update({
        monthlyCaptionGenerationsUsed: Math.max(0, (userData?.monthlyCaptionGenerationsUsed || 0) - 10), // Give 10 free generations
      });
    }

    res.status(200).json({
      success: true,
      referralId: referralRef.id,
      message: "Referral code applied successfully! You've received 10 free AI generations.",
    });
  } catch (error: any) {
    console.error("Error creating referral:", error);
    res.status(500).json({ error: error?.message || "Failed to create referral" });
  }
}

function generateReferralCode(userId: string): string {
  // Generate a simple referral code from user ID
  const chars = userId.substring(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return chars || Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default withErrorHandling(handler);
