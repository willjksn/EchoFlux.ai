import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, getVerifyAuth } from "./_errorHandler.js";
import { getAdminDb } from "./_firebaseAdmin.js";

// Default reward configuration (fallback if admin config doesn't exist)
const DEFAULT_REWARDS = [
  { milestone: 1, type: 'extra_generations', amount: 50, description: '50 free AI generations' },
  { milestone: 3, type: 'extra_generations', amount: 100, description: '100 free AI generations' },
  { milestone: 5, type: 'free_month', amount: 1, description: '1 free month of Pro plan' },
  { milestone: 10, type: 'storage_boost', amount: 5, description: '5 GB extra storage' },
  { milestone: 20, type: 'free_month', amount: 3, description: '3 free months of Elite plan' },
];

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
    // Load reward configuration from admin settings (or use defaults)
    let rewardConfig = DEFAULT_REWARDS;
    try {
      const configDoc = await db.collection("admin").doc("referral_rewards_config").get();
      if (configDoc.exists) {
        const configData = configDoc.data();
        if (configData?.rewards && Array.isArray(configData.rewards)) {
          rewardConfig = configData.rewards;
        }
      }
    } catch (configError) {
      console.warn("Failed to load reward config, using defaults:", configError);
    }

    // Get user's referral stats
    const userDoc = await db.collection("users").doc(user.uid).get();
    if (!userDoc.exists) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const userData = userDoc.data();
    const stats = userData?.referralStats || { totalReferrals: 0, activeReferrals: 0, rewardsEarned: 0 };

    // Get all referrals
    const referralsSnapshot = await db.collection("referrals")
      .where("referrerId", "==", user.uid)
      .get();

    const totalReferrals = referralsSnapshot.size;

    // Get claimed rewards (track in user document)
    const claimedRewards = userData?.claimedReferralRewards || [];

    // Calculate available rewards based on milestones
    const availableRewards: Array<{
      milestone: number;
      type: string;
      amount: number;
      description: string;
      isEarned: boolean;
      isClaimed: boolean;
    }> = [];

    rewardConfig.forEach((reward) => {
      const isEarned = totalReferrals >= reward.milestone;
      const isClaimed = claimedRewards.some((cr: any) => cr.milestone === reward.milestone);

      availableRewards.push({
        ...reward,
        isEarned,
        isClaimed,
      });
    });

    // Get next milestone
    const nextMilestone = rewardConfig.find(
      (r) => totalReferrals < r.milestone
    );

    res.status(200).json({
      success: true,
      totalReferrals,
      availableRewards,
      nextMilestone: nextMilestone ? {
        referralsNeeded: nextMilestone.milestone - totalReferrals,
        reward: nextMilestone,
      } : null,
    });
  } catch (error: any) {
    console.error("Error getting referral rewards:", error);
    res.status(500).json({ error: error?.message || "Failed to get referral rewards" });
  }
}

export default withErrorHandling(handler);
