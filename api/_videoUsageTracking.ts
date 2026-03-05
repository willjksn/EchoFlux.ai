/**
 * Video Chat Usage Tracking for Echoflux Analytics
 * 
 * Tracks Daily.co usage for:
 * 1. Platform-wide analytics (admin dashboard)
 * 2. Per-creator quota management
 * 3. Cost monitoring and runaway prevention
 */

import { getAdminDb } from './_firebaseAdmin.js';

// Daily.co pricing: $0.004 per participant-minute after free tier
// 10,000 free participant-minutes per month
const DAILY_COST_PER_PARTICIPANT_MINUTE = 0.004;
const FREE_TIER_MINUTES = 10000;

export interface VideoUsageLog {
  id?: string;
  creatorId: string;
  fanId: string;
  sessionId: string;
  durationMinutes: number;
  participantMinutes: number; // durationMinutes * 2 (both parties)
  estimatedCost: number;
  amountPaidByFan: number; // cents
  echofluxCommission: number; // cents
  creatorEarnings: number; // cents
  timestamp: string;
  month: string; // YYYY-MM for aggregation
}

export interface CreatorVideoQuota {
  creatorId: string;
  monthlyMinutesLimit: number; // -1 = unlimited
  minutesUsedThisMonth: number;
  totalMinutesAllTime: number;
  lastResetMonth: string; // YYYY-MM
  bonusMinutes: number; // Purchased add-on minutes
  quotaExceededNotified: boolean;
  updatedAt: string;
}

export interface PlatformVideoStats {
  month: string;
  totalSessions: number;
  totalParticipantMinutes: number;
  estimatedCost: number;
  totalRevenue: number; // cents
  totalCommission: number; // cents
  uniqueCreators: number;
  uniqueFans: number;
  updatedAt: string;
}

/**
 * Track a completed video chat session
 */
export async function trackVideoUsage(params: {
  creatorId: string;
  fanId: string;
  sessionId: string;
  durationMinutes: number;
  amountPaidCents: number;
  echofluxCommissionCents: number;
  creatorEarningsCents: number;
}): Promise<void> {
  const db = getAdminDb();
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  const participantMinutes = params.durationMinutes * 2;
  
  // Get current monthly usage to determine if we're in free tier
  const monthlyStats = await getMonthlyPlatformStats(month);
  const totalMinutesSoFar = monthlyStats?.totalParticipantMinutes || 0;
  
  // Calculate cost (only charged after free tier)
  let estimatedCost = 0;
  if (totalMinutesSoFar >= FREE_TIER_MINUTES) {
    estimatedCost = participantMinutes * DAILY_COST_PER_PARTICIPANT_MINUTE;
  } else if (totalMinutesSoFar + participantMinutes > FREE_TIER_MINUTES) {
    const billableMinutes = (totalMinutesSoFar + participantMinutes) - FREE_TIER_MINUTES;
    estimatedCost = billableMinutes * DAILY_COST_PER_PARTICIPANT_MINUTE;
  }

  const usageLog: Omit<VideoUsageLog, 'id'> = {
    creatorId: params.creatorId,
    fanId: params.fanId,
    sessionId: params.sessionId,
    durationMinutes: params.durationMinutes,
    participantMinutes,
    estimatedCost,
    amountPaidByFan: params.amountPaidCents,
    echofluxCommission: params.echofluxCommissionCents,
    creatorEarnings: params.creatorEarningsCents,
    timestamp: now.toISOString(),
    month,
  };

  // Store individual usage log
  await db.collection('video_usage_logs').add(usageLog);

  // Update platform monthly stats
  await updatePlatformStats(month, usageLog);

  // Update creator quota
  await updateCreatorQuota(params.creatorId, params.durationMinutes, month);
}

/**
 * Get monthly platform stats
 */
async function getMonthlyPlatformStats(month: string): Promise<PlatformVideoStats | null> {
  const db = getAdminDb();
  const doc = await db.collection('video_platform_stats').doc(month).get();
  return doc.exists ? (doc.data() as PlatformVideoStats) : null;
}

/**
 * Update platform-wide stats for the month
 */
async function updatePlatformStats(month: string, log: Omit<VideoUsageLog, 'id'>): Promise<void> {
  const db = getAdminDb();
  const statsRef = db.collection('video_platform_stats').doc(month);
  
  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(statsRef);
    
    if (doc.exists) {
      const current = doc.data() as PlatformVideoStats;
      transaction.update(statsRef, {
        totalSessions: current.totalSessions + 1,
        totalParticipantMinutes: current.totalParticipantMinutes + log.participantMinutes,
        estimatedCost: current.estimatedCost + log.estimatedCost,
        totalRevenue: current.totalRevenue + log.amountPaidByFan,
        totalCommission: current.totalCommission + log.echofluxCommission,
        updatedAt: new Date().toISOString(),
      });
    } else {
      transaction.set(statsRef, {
        month,
        totalSessions: 1,
        totalParticipantMinutes: log.participantMinutes,
        estimatedCost: log.estimatedCost,
        totalRevenue: log.amountPaidByFan,
        totalCommission: log.echofluxCommission,
        uniqueCreators: 1,
        uniqueFans: 1,
        updatedAt: new Date().toISOString(),
      });
    }
  });
}

/**
 * Get default quota based on user's plan
 * - Free/Caption/Starter: 0 minutes (no video chat access)
 * - Pro/Growth: 100 minutes/month
 * - Elite/OnlyFansStudio: 250 minutes/month
 * - Agency: Unlimited (-1)
 */
async function getDefaultQuotaForUser(userId: string): Promise<number> {
  const db = getAdminDb();
  const userDoc = await db.collection('users').doc(userId).get();
  
  if (!userDoc.exists) return 0;
  
  const plan = userDoc.data()?.plan as string | undefined;
  
  switch (plan) {
    case 'Pro':
    case 'Growth':
      return 100;
    case 'Elite':
    case 'OnlyFansStudio':
      return 250;
    case 'Agency':
      return -1; // Unlimited
    default:
      return 0; // Free, Caption, Starter - no video chat
  }
}

/**
 * Update creator's video chat quota
 */
async function updateCreatorQuota(creatorId: string, minutesUsed: number, month: string): Promise<void> {
  const db = getAdminDb();
  const quotaRef = db.collection('creator_video_quotas').doc(creatorId);
  
  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(quotaRef);
    
    if (doc.exists) {
      const current = doc.data() as CreatorVideoQuota;
      
      // Reset monthly usage if new month
      const currentMonthUsage = current.lastResetMonth === month 
        ? current.minutesUsedThisMonth + minutesUsed 
        : minutesUsed;
      
      transaction.update(quotaRef, {
        minutesUsedThisMonth: currentMonthUsage,
        totalMinutesAllTime: current.totalMinutesAllTime + minutesUsed,
        lastResetMonth: month,
        updatedAt: new Date().toISOString(),
      });
    } else {
      // New creator - initialize with plan-based quota
      const defaultLimit = await getDefaultQuotaForUser(creatorId);
      transaction.set(quotaRef, {
        creatorId,
        monthlyMinutesLimit: defaultLimit,
        minutesUsedThisMonth: minutesUsed,
        totalMinutesAllTime: minutesUsed,
        lastResetMonth: month,
        bonusMinutes: 0,
        quotaExceededNotified: false,
        updatedAt: new Date().toISOString(),
      });
    }
  });
}

/**
 * Check if creator can start a video chat (quota check)
 */
export async function canCreatorStartVideoChat(creatorId: string, requestedMinutes: number): Promise<{
  allowed: boolean;
  reason?: string;
  remainingMinutes: number;
  monthlyLimit: number;
}> {
  const db = getAdminDb();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  const quotaRef = db.collection('creator_video_quotas').doc(creatorId);
  const doc = await quotaRef.get();
  
  if (!doc.exists) {
    // New creator - get plan-based default quota
    const defaultLimit = await getDefaultQuotaForUser(creatorId);
    
    if (defaultLimit === 0) {
      return {
        allowed: false,
        reason: "Video chat is not available on your current plan. Upgrade to Pro or Elite to use video chat, or purchase a minutes add-on.",
        remainingMinutes: 0,
        monthlyLimit: 0,
      };
    }
    
    if (defaultLimit === -1) {
      return {
        allowed: true,
        remainingMinutes: -1,
        monthlyLimit: -1,
      };
    }
    
    return {
      allowed: requestedMinutes <= defaultLimit,
      remainingMinutes: defaultLimit,
      monthlyLimit: defaultLimit,
    };
  }
  
  const quota = doc.data() as CreatorVideoQuota;
  
  // Reset monthly usage if new month
  const currentUsage = quota.lastResetMonth === currentMonth 
    ? quota.minutesUsedThisMonth 
    : 0;
  
  // Unlimited quota check
  if (quota.monthlyMinutesLimit === -1) {
    return {
      allowed: true,
      remainingMinutes: -1,
      monthlyLimit: -1,
    };
  }
  
  const totalAvailable = quota.monthlyMinutesLimit + quota.bonusMinutes;
  const remaining = totalAvailable - currentUsage;
  
  if (remaining < requestedMinutes) {
    return {
      allowed: false,
      reason: `You've used ${currentUsage} of your ${totalAvailable} monthly video minutes. Purchase more minutes or wait until next month.`,
      remainingMinutes: Math.max(0, remaining),
      monthlyLimit: quota.monthlyMinutesLimit,
    };
  }
  
  return {
    allowed: true,
    remainingMinutes: remaining - requestedMinutes,
    monthlyLimit: quota.monthlyMinutesLimit,
  };
}

/**
 * Get creator's current quota status
 */
export async function getCreatorQuotaStatus(creatorId: string): Promise<CreatorVideoQuota> {
  const db = getAdminDb();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  const doc = await db.collection('creator_video_quotas').doc(creatorId).get();
  
  if (!doc.exists) {
    // Get plan-based default
    const defaultLimit = await getDefaultQuotaForUser(creatorId);
    return {
      creatorId,
      monthlyMinutesLimit: defaultLimit,
      minutesUsedThisMonth: 0,
      totalMinutesAllTime: 0,
      lastResetMonth: currentMonth,
      bonusMinutes: 0,
      quotaExceededNotified: false,
      updatedAt: new Date().toISOString(),
    };
  }
  
  const quota = doc.data() as CreatorVideoQuota;
  
  // Reset display if new month
  if (quota.lastResetMonth !== currentMonth) {
    return {
      ...quota,
      minutesUsedThisMonth: 0,
      lastResetMonth: currentMonth,
    };
  }
  
  return quota;
}

/**
 * Add bonus minutes to a creator (for purchased add-ons)
 */
export async function addBonusMinutes(creatorId: string, minutes: number): Promise<void> {
  const db = getAdminDb();
  const quotaRef = db.collection('creator_video_quotas').doc(creatorId);
  
  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(quotaRef);
    
    if (doc.exists) {
      const current = doc.data() as CreatorVideoQuota;
      transaction.update(quotaRef, {
        bonusMinutes: current.bonusMinutes + minutes,
        updatedAt: new Date().toISOString(),
      });
    } else {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      transaction.set(quotaRef, {
        creatorId,
        monthlyMinutesLimit: 500,
        minutesUsedThisMonth: 0,
        totalMinutesAllTime: 0,
        lastResetMonth: currentMonth,
        bonusMinutes: minutes,
        quotaExceededNotified: false,
        updatedAt: now.toISOString(),
      });
    }
  });
}

/**
 * Update a creator's monthly limit (admin function)
 */
export async function updateCreatorMonthlyLimit(creatorId: string, newLimit: number): Promise<void> {
  const db = getAdminDb();
  const quotaRef = db.collection('creator_video_quotas').doc(creatorId);
  
  await quotaRef.set({
    monthlyMinutesLimit: newLimit,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

/**
 * Get platform-wide video stats for admin dashboard
 */
export async function getPlatformVideoStats(months: number = 3): Promise<PlatformVideoStats[]> {
  const db = getAdminDb();
  const now = new Date();
  const stats: PlatformVideoStats[] = [];
  
  for (let i = 0; i < months; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    const doc = await db.collection('video_platform_stats').doc(month).get();
    if (doc.exists) {
      stats.push(doc.data() as PlatformVideoStats);
    } else {
      stats.push({
        month,
        totalSessions: 0,
        totalParticipantMinutes: 0,
        estimatedCost: 0,
        totalRevenue: 0,
        totalCommission: 0,
        uniqueCreators: 0,
        uniqueFans: 0,
        updatedAt: new Date().toISOString(),
      });
    }
  }
  
  return stats;
}
