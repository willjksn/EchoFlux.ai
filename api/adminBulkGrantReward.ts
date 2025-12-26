import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, getVerifyAuth } from "./_errorHandler.js";
import { getAdminDb } from "./_firebaseAdmin.js";

type RewardType = "extra_generations" | "free_month" | "storage_boost";

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const verifyAuth = await getVerifyAuth();
  const adminUser = await verifyAuth(req);
  if (!adminUser?.uid) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const db = getAdminDb();
  const adminDoc = await db.collection("users").doc(adminUser.uid).get();
  const adminData = adminDoc.data();
  if (adminData?.role !== "Admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const { targetPlans, rewardType, rewardAmount, reason } = (req.body as any) || {};

  if (!rewardType || !rewardAmount) {
    res.status(400).json({ error: "Missing rewardType or rewardAmount" });
    return;
  }

  const parsedRewardType: RewardType = rewardType as RewardType;
  if (!["extra_generations", "free_month", "storage_boost"].includes(parsedRewardType)) {
    res.status(400).json({ error: `Unknown reward type: ${rewardType}` });
    return;
  }

  const amountNum = Number(rewardAmount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    res.status(400).json({ error: "Invalid rewardAmount" });
    return;
  }

  const plans: string[] = Array.isArray(targetPlans) ? targetPlans : [];
  if (plans.length === 0) {
    res.status(400).json({ error: "targetPlans must be a non-empty array" });
    return;
  }

  // Firestore `in` supports up to 10 values.
  if (plans.length > 10) {
    res.status(400).json({ error: "targetPlans supports max 10 values" });
    return;
  }

  const usersSnap = await db.collection("users").where("plan", "in", plans).get();

  let updatedCount = 0;
  const nowIso = new Date().toISOString();

  // Batch writes (max 500 operations)
  let batch = db.batch();
  let ops = 0;

  const commitBatch = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = db.batch();
    ops = 0;
  };

  for (const doc of usersSnap.docs) {
    const data = doc.data() as any;
    // Skip admins
    if (data?.role === "Admin") continue;

    const updates: any = {};
    switch (parsedRewardType) {
      case "extra_generations": {
        const currentUsed = data?.monthlyCaptionGenerationsUsed || 0;
        updates.monthlyCaptionGenerationsUsed = Math.max(0, currentUsed - amountNum);
        break;
      }
      case "free_month": {
        const currentPlan = data?.plan || "Free";
        if (currentPlan === "Free") {
          updates.plan = "Pro";
          updates.subscriptionStartDate = nowIso;
          updates.billingCycle = "monthly";
          const endDate = new Date();
          endDate.setMonth(endDate.getMonth() + amountNum);
          updates.subscriptionEndDate = endDate.toISOString();
        } else {
          const currentEndDate = data?.subscriptionEndDate ? new Date(data.subscriptionEndDate) : new Date();
          currentEndDate.setMonth(currentEndDate.getMonth() + amountNum);
          updates.subscriptionEndDate = currentEndDate.toISOString();
          if (data?.cancelAtPeriodEnd) updates.cancelAtPeriodEnd = false;
        }
        break;
      }
      case "storage_boost": {
        const currentLimit = data?.storageLimit || 0;
        const boostMB = amountNum * 1024; // GB -> MB
        updates.storageLimit = currentLimit + boostMB;
        break;
      }
    }

    const manualRewards = Array.isArray(data?.manualReferralRewards) ? data.manualReferralRewards : [];
    manualRewards.push({
      rewardType: parsedRewardType,
      rewardAmount: amountNum,
      grantedAt: nowIso,
      grantedBy: adminUser.uid,
      reason: reason || "Bulk granted by admin",
    });
    updates.manualReferralRewards = manualRewards;

    batch.update(doc.ref, updates);
    ops += 1;
    updatedCount += 1;

    if (ops >= 450) {
      // stay under limit conservatively
      await commitBatch();
    }
  }

  await commitBatch();

  res.status(200).json({
    success: true,
    updatedCount,
  });
}

export default withErrorHandling(handler);


