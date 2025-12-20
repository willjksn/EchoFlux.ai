import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, getVerifyAuth } from "./_errorHandler.js";
import { getAdminDb } from "./_firebaseAdmin.js";

// Reward configuration - can be moved to admin panel or constants
const REWARD_CONFIG = {
  // Rewards for referrer (person who referred)
  referrerRewards: [
    { milestone: 1, type: 'extra_generations', amount: 50, description: '50 free AI generations' },
    { milestone: 3, type: 'extra_generations', amount: 100, description: '100 free AI generations' },
    { milestone: 5, type: 'free_month', amount: 1, description: '1 free month of Pro plan' },
    { milestone: 10, type: 'storage_boost', amount: 5, description: '5 GB extra storage' },
    { milestone: 20, type: 'free_month', amount: 3, description: '3 free months of Elite plan' },
  ],
  // Rewards for referee (person who was referred)
  refereeRewards: {
    type: 'extra_generations',
    amount: 10,
    description: '10 free AI generations'
  }
};

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

  const { rewardId, rewardType, rewardAmount, milestone } = (req.body as any) || {};

  if (!rewardType || !rewardAmount) {
    res.status(400).json({ error: "Missing rewardType or rewardAmount" });
    return;
  }

  const db = getAdminDb();

  try {
    const userDoc = await db.collection("users").doc(user.uid).get();
    if (!userDoc.exists) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const userData = userDoc.data();
    const updates: any = {};

    // Apply reward based on type
    switch (rewardType) {
      case 'extra_generations':
        // Give free AI generations by reducing usage count
        const currentUsed = userData?.monthlyCaptionGenerationsUsed || 0;
        updates.monthlyCaptionGenerationsUsed = Math.max(0, currentUsed - rewardAmount);
        break;

      case 'free_month':
        // Extend subscription by adding free months
        const currentPlan = userData?.plan || 'Free';
        if (currentPlan === 'Free') {
          // Upgrade to Pro for free month
          updates.plan = 'Pro';
          updates.subscriptionStartDate = new Date().toISOString();
          updates.billingCycle = 'monthly';
          // Set subscription end date to 1 month from now
          const endDate = new Date();
          endDate.setMonth(endDate.getMonth() + rewardAmount);
          updates.subscriptionEndDate = endDate.toISOString();
        } else {
          // Extend existing subscription
          const currentEndDate = userData?.subscriptionEndDate 
            ? new Date(userData.subscriptionEndDate)
            : new Date();
          currentEndDate.setMonth(currentEndDate.getMonth() + rewardAmount);
          updates.subscriptionEndDate = currentEndDate.toISOString();
          // Clear cancellation if subscription was ending
          if (userData?.cancelAtPeriodEnd) {
            updates.cancelAtPeriodEnd = false;
          }
        }
        break;

      case 'storage_boost':
        // Increase storage limit
        const currentLimit = userData?.storageLimit || 0;
        const boostMB = rewardAmount * 1024; // Convert GB to MB
        updates.storageLimit = currentLimit + boostMB;
        break;

      default:
        res.status(400).json({ error: `Unknown reward type: ${rewardType}` });
        return;
    }

    // Track claimed reward (for milestone-based rewards)
    if (milestone) {
      const claimedRewards = userData?.claimedReferralRewards || [];
      // Check if already claimed
      const alreadyClaimed = claimedRewards.some((cr: any) => cr.milestone === milestone);
      if (alreadyClaimed) {
        res.status(400).json({ error: "This reward has already been claimed" });
        return;
      }
      
      claimedRewards.push({
        milestone,
        type: rewardType,
        amount: rewardAmount,
        claimedAt: new Date().toISOString(),
      });
      updates.claimedReferralRewards = claimedRewards;
    }

    // Update referral stats
    const stats = userData?.referralStats || { totalReferrals: 0, activeReferrals: 0, rewardsEarned: 0 };
    updates.referralStats = {
      ...stats,
      rewardsEarned: (stats.rewardsEarned || 0) + 1,
    };

    // Update user with all changes in one operation
    await db.collection("users").doc(user.uid).update(updates);

    // If this is claiming a specific referral reward, mark it as claimed
    if (rewardId) {
      await db.collection("referrals").doc(rewardId).update({
        rewardStatus: 'claimed',
        claimedAt: new Date().toISOString(),
      });
    }

    res.status(200).json({
      success: true,
      message: `Reward claimed successfully! ${getRewardDescription(rewardType, rewardAmount)}`,
    });
  } catch (error: any) {
    console.error("Error claiming reward:", error);
    res.status(500).json({ error: error?.message || "Failed to claim reward" });
  }
}

function getRewardDescription(type: string, amount: number): string {
  switch (type) {
    case 'extra_generations':
      return `You've received ${amount} free AI generations`;
    case 'free_month':
      return `You've received ${amount} free month${amount > 1 ? 's' : ''} of subscription`;
    case 'storage_boost':
      return `You've received ${amount} GB extra storage`;
    default:
      return 'Reward applied';
  }
}

export default withErrorHandling(handler);
