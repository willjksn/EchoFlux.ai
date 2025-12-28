import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, getVerifyAuth } from "./_errorHandler.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const verifyAuth = await getVerifyAuth();
  const adminUser = await verifyAuth(req);

  if (!adminUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Verify admin role
  const db = getAdminDb();
  const adminDoc = await db.collection("users").doc(adminUser.uid).get();
  const adminData = adminDoc.data();
  
  if (adminData?.role !== "Admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const { userId, rewardType, rewardAmount, reason } = (req.body as any) || {};

  if (!userId || !rewardType || !rewardAmount) {
    res.status(400).json({ error: "Missing userId, rewardType, or rewardAmount" });
    return;
  }

  try {
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const userData = userDoc.data();
    const updates: any = {};

    // Apply reward based on type
    switch (rewardType) {
      case 'extra_generations':
        const currentUsed = userData?.monthlyCaptionGenerationsUsed || 0;
        updates.monthlyCaptionGenerationsUsed = Math.max(0, currentUsed - rewardAmount);
        break;

      case 'strategy_generations': {
        // Add a per-month "bonus" to strategy generation limit (does not affect plan limits permanently).
        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const usageRef = db.collection('strategy_usage').doc(`${userId}_${month}`);
        await usageRef.set(
          {
            userId,
            month,
            bonus: FieldValue.increment(rewardAmount),
            lastUpdated: new Date().toISOString(),
          } as any,
          { merge: true }
        );
        break;
      }

      case 'free_month':
        const currentPlan = userData?.plan || 'Free';
        if (currentPlan === 'Free') {
          updates.plan = 'Pro';
          updates.subscriptionStartDate = new Date().toISOString();
          updates.billingCycle = 'monthly';
          const endDate = new Date();
          endDate.setMonth(endDate.getMonth() + rewardAmount);
          updates.subscriptionEndDate = endDate.toISOString();
        } else {
          const currentEndDate = userData?.subscriptionEndDate 
            ? new Date(userData.subscriptionEndDate)
            : new Date();
          currentEndDate.setMonth(currentEndDate.getMonth() + rewardAmount);
          updates.subscriptionEndDate = currentEndDate.toISOString();
          if (userData?.cancelAtPeriodEnd) {
            updates.cancelAtPeriodEnd = false;
          }
        }
        break;

      case 'storage_boost':
        const currentLimit = userData?.storageLimit || 0;
        const boostMB = rewardAmount * 1024; // Convert GB to MB
        updates.storageLimit = currentLimit + boostMB;
        break;

      default:
        res.status(400).json({ error: `Unknown reward type: ${rewardType}` });
        return;
    }

    // Track manually granted reward
    const manualRewards = userData?.manualReferralRewards || [];
    manualRewards.push({
      rewardType,
      rewardAmount,
      grantedAt: new Date().toISOString(),
      grantedBy: adminUser.uid,
      reason: reason || 'Manually granted by admin',
    });
    updates.manualReferralRewards = manualRewards;

    // Update user
    await db.collection("users").doc(userId).update(updates);

    res.status(200).json({
      success: true,
      message: `Reward granted successfully! ${getRewardDescription(rewardType, rewardAmount)}`,
    });
  } catch (error: any) {
    console.error("Error granting reward:", error);
    res.status(500).json({ error: error?.message || "Failed to grant reward" });
  }
}

function getRewardDescription(type: string, amount: number): string {
  switch (type) {
    case 'extra_generations':
      return `Granted ${amount} free AI generations`;
    case 'strategy_generations':
      return `Granted ${amount} extra strategy generation${amount > 1 ? 's' : ''} this month`;
    case 'free_month':
      return `Granted ${amount} free month${amount > 1 ? 's' : ''} of subscription`;
    case 'storage_boost':
      return `Granted ${amount} GB extra storage`;
    default:
      return 'Reward granted';
  }
}

export default withErrorHandling(handler);
