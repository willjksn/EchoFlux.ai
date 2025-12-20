import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, getVerifyAuth } from "./_errorHandler.js";
import { getAdminDb } from "./_firebaseAdmin.js";

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const verifyAuth = await getVerifyAuth();
  const user = await verifyAuth(req);

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const db = getAdminDb();
  
  try {
    // Get or create referral code for user
    const userDoc = await db.collection("users").doc(user.uid).get();
    if (!userDoc.exists) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const userData = userDoc.data();
    let referralCode = userData?.referralCode;

    // Generate referral code if doesn't exist
    if (!referralCode) {
      referralCode = generateReferralCode(user.uid);
      await db.collection("users").doc(user.uid).update({
        referralCode,
      });
    }

    // Get referral stats
    const referralsSnapshot = await db.collection("referrals")
      .where("referrerId", "==", user.uid)
      .get();

    const totalReferrals = referralsSnapshot.size;
    const activeReferrals = referralsSnapshot.docs.filter(
      (doc) => {
        const data = doc.data();
        return data.rewardStatus === "pending" || data.rewardStatus === "claimed";
      }
    ).length;

    // Calculate rewards earned (simplified - can be enhanced)
    const rewardsEarned = Math.floor(totalReferrals / 5); // 1 reward per 5 referrals

    const stats = {
      totalReferrals,
      activeReferrals,
      rewardsEarned,
      referralCode,
    };

    // Update user's referral stats
    await db.collection("users").doc(user.uid).update({
      referralStats: stats,
    });

    res.status(200).json({
      success: true,
      stats,
    });
  } catch (error: any) {
    console.error("Error getting referral stats:", error);
    res.status(500).json({ error: error?.message || "Failed to get referral stats" });
  }
}

function generateReferralCode(userId: string): string {
  // Generate a simple referral code from user ID
  const chars = userId.substring(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return chars || Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default withErrorHandling(handler);
