import { getFirestore } from 'firebase-admin/firestore';

/**
 * Grants referral reward when a referral converts to a paid plan.
 * For Elite plan conversions, grants 2 months free to the referrer.
 */
export async function grantReferralRewardOnConversion(
  refereeId: string,
  planName: string,
  referralCode?: string
): Promise<void> {
  if (!referralCode || planName !== 'Elite') {
    // Only grant rewards for Elite plan conversions
    return;
  }

  const db = getFirestore();

  try {
    // Find the referrer by referral code
    const referrerSnapshot = await db.collection('users')
      .where('referralCode', '==', referralCode.toUpperCase())
      .limit(1)
      .get();

    if (referrerSnapshot.empty) {
      console.warn(`Referrer not found for referral code: ${referralCode}`);
      return;
    }

    const referrerDoc = referrerSnapshot.docs[0];
    const referrerId = referrerDoc.id;

    // Can't refer yourself
    if (referrerId === refereeId) {
      console.warn('User cannot refer themselves');
      return;
    }

    // Check if referral record exists
    const referralSnapshot = await db.collection('referrals')
      .where('referrerId', '==', referrerId)
      .where('refereeId', '==', refereeId)
      .limit(1)
      .get();

    let referralId: string;
    if (referralSnapshot.empty) {
      // Create referral record if it doesn't exist
      const referralRef = await db.collection('referrals').add({
        referrerId,
        refereeId,
        referralCode: referralCode.toUpperCase(),
        createdAt: new Date().toISOString(),
        rewardStatus: 'pending',
        convertedPlan: planName,
        convertedAt: new Date().toISOString(),
      });
      referralId = referralRef.id;
    } else {
      referralId = referralSnapshot.docs[0].id;
      // Update existing referral record
      await db.collection('referrals').doc(referralId).update({
        rewardStatus: 'pending',
        convertedPlan: planName,
        convertedAt: new Date().toISOString(),
      });
    }

    // Grant 2 months free to referrer
    const referrerData = referrerDoc.data();
    const currentSubscriptionEndDate = (referrerData as any)?.subscriptionEndDate as string | null | undefined;
    const hasActiveSubscription = !!(referrerData as any)?.stripeSubscriptionId;
    
    if (hasActiveSubscription && currentSubscriptionEndDate) {
      // Extend existing subscription by 2 months
      const currentEndDate = new Date(currentSubscriptionEndDate);
      const newEndDate = new Date(currentEndDate);
      newEndDate.setMonth(newEndDate.getMonth() + 2);
      
      await referrerDoc.ref.set({
        subscriptionEndDate: newEndDate.toISOString(),
        referralRewardsGranted: (referrerData.referralRewardsGranted || 0) + 1,
        lastReferralRewardGrantedAt: new Date().toISOString(),
      }, { merge: true });
    } else {
      // If no active subscription, grant 2 months of free access
      const grantStartDate = new Date();
      const grantEndDate = new Date();
      grantEndDate.setMonth(grantEndDate.getMonth() + 2);
      
      await referrerDoc.ref.set({
        inviteGrantPlan: 'Elite',
        inviteGrantExpiresAt: grantEndDate.toISOString(),
        subscriptionStatus: 'invite_grant',
        referralRewardsGranted: (referrerData.referralRewardsGranted || 0) + 1,
        lastReferralRewardGrantedAt: new Date().toISOString(),
      }, { merge: true });
    }

    // Update referral record to mark reward as granted
    await db.collection('referrals').doc(referralId).update({
      rewardStatus: 'granted',
      rewardGrantedAt: new Date().toISOString(),
      rewardType: '2_months_free',
      rewardAmount: 2,
    });

    // Update referrer's stats
    const currentStats = referrerData.referralStats || {
      totalReferrals: 0,
      activeReferrals: 0,
      rewardsEarned: 0,
      referralCode: referrerData.referralCode || '',
    };

    await referrerDoc.ref.set({
      referralStats: {
        ...currentStats,
        rewardsEarned: (currentStats.rewardsEarned || 0) + 1,
      },
    }, { merge: true });

    // Create notification for referrer
    const referrerNotificationsRef = db.collection('users').doc(referrerId).collection('notifications');
    await referrerNotificationsRef.add({
      id: `referral-reward-${Date.now()}`,
      text: `🎉 Congratulations! Your referral converted to Elite plan. You've been granted 2 months free!`,
      timestamp: new Date().toISOString(),
      read: false,
      messageId: 'referral-reward-granted',
      createdAt: new Date(),
    });

    console.log(`Referral reward granted: ${referrerId} received 2 months free for ${refereeId}'s Elite conversion`);
  } catch (error: any) {
    console.error('Error granting referral reward:', error);
    // Don't throw - we don't want to fail the webhook if reward granting fails
  }
}
