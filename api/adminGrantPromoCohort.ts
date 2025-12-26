import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withErrorHandling, getVerifyAuth } from './_errorHandler.js';
import { getAdminDb } from './_firebaseAdmin.js';

type RewardType = 'extra_generations' | 'free_month' | 'storage_boost';

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const verifyAuth = await getVerifyAuth();
  const adminUser = await verifyAuth(req);
  if (!adminUser?.uid) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const db = getAdminDb();
  const adminDoc = await db.collection('users').doc(adminUser.uid).get();
  const adminData = adminDoc.data();
  if (adminData?.role !== 'Admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  const { announcementId, upgradedToPlans, rewardType, rewardAmount, reason } = (req.body as any) || {};

  if (!announcementId) {
    res.status(400).json({ error: 'Missing announcementId' });
    return;
  }

  const parsedRewardType: RewardType = rewardType as RewardType;
  if (!['extra_generations', 'free_month', 'storage_boost'].includes(parsedRewardType)) {
    res.status(400).json({ error: `Unknown reward type: ${rewardType}` });
    return;
  }

  const amountNum = Number(rewardAmount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    res.status(400).json({ error: 'Invalid rewardAmount' });
    return;
  }

  const targetPlans: string[] = Array.isArray(upgradedToPlans) ? upgradedToPlans : [];
  if (targetPlans.length === 0) {
    res.status(400).json({ error: 'upgradedToPlans must be a non-empty array' });
    return;
  }
  if (targetPlans.length > 10) {
    res.status(400).json({ error: 'upgradedToPlans supports max 10 values' });
    return;
  }

  const announcementDoc = await db.collection('announcements').doc(String(announcementId)).get();
  if (!announcementDoc.exists) {
    res.status(404).json({ error: 'Announcement not found' });
    return;
  }

  const announcement = announcementDoc.data() as any;
  const startsAt = announcement?.startsAt ? new Date(announcement.startsAt).toISOString() : (announcement?.createdAt || null);
  const endsAt = announcement?.endsAt ? new Date(announcement.endsAt).toISOString() : new Date().toISOString();

  if (!startsAt) {
    res.status(400).json({ error: 'Announcement must have startsAt or createdAt' });
    return;
  }

  // Query plan change events within window for upgraded plans
  // Note: We query per plan because Firestore doesn't support range + in reliably with our wrapper across all environments.
  const startIso = startsAt;
  const endIso = endsAt;

  let events: Array<{ id: string; userId: string; toPlan: string; changedAt: string }> = [];
  for (const plan of targetPlans) {
    const snap = await db
      .collection('plan_change_events')
      .where('toPlan', '==', plan)
      .where('changedAt', '>=', startIso)
      .where('changedAt', '<=', endIso)
      .get();
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    events = events.concat(rows);
  }

  // Deduplicate by user (keep most recent event)
  const byUser = new Map<string, any>();
  for (const ev of events) {
    const prev = byUser.get(ev.userId);
    if (!prev) {
      byUser.set(ev.userId, ev);
      continue;
    }
    const tPrev = prev.changedAt ? new Date(prev.changedAt).getTime() : 0;
    const tEv = ev.changedAt ? new Date(ev.changedAt).getTime() : 0;
    if (tEv > tPrev) byUser.set(ev.userId, ev);
  }

  const userIds = Array.from(byUser.keys());
  if (userIds.length === 0) {
    res.status(200).json({ success: true, eligibleUsers: 0, granted: 0, skippedAlreadyGranted: 0 });
    return;
  }

  const nowIso = new Date().toISOString();
  let granted = 0;
  let skippedAlreadyGranted = 0;

  // Batch updates (max 500)
  let batch = db.batch();
  let ops = 0;

  const commitBatch = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = db.batch();
    ops = 0;
  };

  for (const userId of userIds) {
    const grantId = `${announcementId}_${userId}`;
    const grantRef = db.collection('promo_cohort_grants').doc(grantId);
    const already = await grantRef.get();
    if (already.exists) {
      skippedAlreadyGranted += 1;
      continue;
    }

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) continue;
    const userData = userDoc.data() as any;
    if (userData?.role === 'Admin') continue;

    const updates: any = {};
    switch (parsedRewardType) {
      case 'extra_generations': {
        const currentUsed = userData?.monthlyCaptionGenerationsUsed || 0;
        updates.monthlyCaptionGenerationsUsed = Math.max(0, currentUsed - amountNum);
        break;
      }
      case 'free_month': {
        const currentPlan = userData?.plan || 'Free';
        if (currentPlan === 'Free') {
          updates.plan = 'Pro';
          updates.subscriptionStartDate = nowIso;
          updates.billingCycle = 'monthly';
          const endDate = new Date();
          endDate.setMonth(endDate.getMonth() + amountNum);
          updates.subscriptionEndDate = endDate.toISOString();
        } else {
          const currentEndDate = userData?.subscriptionEndDate ? new Date(userData.subscriptionEndDate) : new Date();
          currentEndDate.setMonth(currentEndDate.getMonth() + amountNum);
          updates.subscriptionEndDate = currentEndDate.toISOString();
          if (userData?.cancelAtPeriodEnd) updates.cancelAtPeriodEnd = false;
        }
        break;
      }
      case 'storage_boost': {
        const currentLimit = userData?.storageLimit || 0;
        const boostMB = amountNum * 1024;
        updates.storageLimit = currentLimit + boostMB;
        break;
      }
    }

    const manualRewards = Array.isArray(userData?.manualReferralRewards) ? userData.manualReferralRewards : [];
    manualRewards.push({
      rewardType: parsedRewardType,
      rewardAmount: amountNum,
      grantedAt: nowIso,
      grantedBy: adminUser.uid,
      reason: reason || `Promo cohort grant for announcement ${announcementId}`,
      promoAnnouncementId: announcementId,
    });
    updates.manualReferralRewards = manualRewards;

    batch.update(userRef, updates);
    batch.set(grantRef, {
      announcementId,
      userId,
      upgradedToPlan: byUser.get(userId)?.toPlan || null,
      upgradedAt: byUser.get(userId)?.changedAt || null,
      rewardType: parsedRewardType,
      rewardAmount: amountNum,
      reason: reason || null,
      grantedAt: nowIso,
      grantedBy: adminUser.uid,
    });

    ops += 2;
    granted += 1;

    if (ops >= 400) {
      await commitBatch();
    }
  }

  await commitBatch();

  res.status(200).json({
    success: true,
    eligibleUsers: userIds.length,
    granted,
    skippedAlreadyGranted,
    window: { startsAt: startIso, endsAt: endIso },
  });
}

export default withErrorHandling(handler);


