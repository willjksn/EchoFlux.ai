/**
 * Weekly Plan Generation Usage Tracking & Limits
 * 
 * Tracks per-user weekly plan generation usage.
 * 
 * Per-User Limits:
 * - Free: 1 weekly plan per month
 * - Pro: Unlimited (999 per month)
 * - Elite: Unlimited (999 per month)
 * - Admin: Unlimited
 */

import { getAdminDb } from "./_firebaseAdmin.js";
import { Timestamp } from "firebase-admin/firestore";

export interface WeeklyPlanUsage {
  userId: string;
  month: string; // Format: "2024-01"
  count: number;
  lastReset: Timestamp;
  lastUpdated: Timestamp;
}

const WEEKLY_PLAN_LIMITS: Record<string, number> = {
  Free: 1,              // 1 weekly plan per month
  Pro: 999,             // Effectively unlimited
  Elite: 999,           // Effectively unlimited
  Admin: 999999,        // Effectively unlimited
  OnlyFansStudio: 999,  // Same as Pro
  Agency: 999,          // Effectively unlimited
};

/**
 * Get current month key (e.g., "2024-01")
 */
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Check if user can generate a weekly plan
 */
export async function canGenerateWeeklyPlan(
  userId: string,
  userPlan: string,
  userRole?: string
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  // Admin has unlimited access
  if (userRole === 'Admin') {
    return { allowed: true, remaining: 999999, limit: 999999 };
  }

  // Check plan limit
  const limit = WEEKLY_PLAN_LIMITS[userPlan] || 0;
  if (limit === 0) {
    return { allowed: false, remaining: 0, limit: 0 };
  }

  // Get or create usage record
  const db = getAdminDb();
  const month = getCurrentMonth();
  const usageRef = db.collection('weekly_plan_usage').doc(`${userId}_${month}`);

  try {
    const usageDoc = await usageRef.get();
    
    if (!usageDoc.exists) {
      // First use this month - create record
      const now = Timestamp.now();
      await usageRef.set({
        userId,
        month,
        count: 0,
        lastReset: now,
        lastUpdated: now,
      });
      return { allowed: true, remaining: limit, limit };
    }

    const usage = usageDoc.data() as WeeklyPlanUsage;
    
    // Check if month has changed (shouldn't happen, but safety check)
    if (usage.month !== month) {
      // Reset for new month
      const now = Timestamp.now();
      await usageRef.set({
        userId,
        month,
        count: 0,
        lastReset: now,
        lastUpdated: now,
      });
      return { allowed: true, remaining: limit, limit };
    }

    const remaining = Math.max(0, limit - usage.count);
    return {
      allowed: remaining > 0,
      remaining,
      limit,
    };
  } catch (error) {
    console.error('Error checking weekly plan usage:', error);
    // On error, allow but log (fail open to not break user experience)
    return { allowed: true, remaining: limit, limit };
  }
}

/**
 * Record a weekly plan generation
 */
export async function recordWeeklyPlanGeneration(
  userId: string,
  userPlan: string,
  userRole?: string
): Promise<void> {
  // Admin doesn't need tracking (unlimited)
  if (userRole === 'Admin') {
    return;
  }

  const db = getAdminDb();
  const month = getCurrentMonth();
  const usageRef = db.collection('weekly_plan_usage').doc(`${userId}_${month}`);

  try {
    const usageDoc = await usageRef.get();
    const now = Timestamp.now();

    if (!usageDoc.exists) {
      // Create new record
      await usageRef.set({
        userId,
        month,
        count: 1,
        lastReset: now,
        lastUpdated: now,
      });
    } else {
      // Increment count
      await usageRef.update({
        count: (usageDoc.data()?.count || 0) + 1,
        lastUpdated: now,
      });
    }
  } catch (error) {
    console.error('Error recording weekly plan generation:', error);
    // Don't throw - usage tracking shouldn't break the feature
  }
}

/**
 * Get user's current weekly plan usage stats
 */
export async function getWeeklyPlanUsageStats(
  userId: string,
  userPlan: string,
  userRole?: string
): Promise<{ count: number; limit: number; remaining: number; month: string }> {
  if (userRole === 'Admin') {
    return { count: 0, limit: 999999, remaining: 999999, month: getCurrentMonth() };
  }

  const limit = WEEKLY_PLAN_LIMITS[userPlan] || 0;
  const db = getAdminDb();
  const month = getCurrentMonth();
  const usageRef = db.collection('weekly_plan_usage').doc(`${userId}_${month}`);

  try {
    const usageDoc = await usageRef.get();
    if (!usageDoc.exists) {
      return { count: 0, limit, remaining: limit, month };
    }

    const usage = usageDoc.data() as WeeklyPlanUsage;
    const remaining = Math.max(0, limit - usage.count);
    return {
      count: usage.count,
      limit,
      remaining,
      month: usage.month,
    };
  } catch (error) {
    console.error('Error getting weekly plan usage stats:', error);
    return { count: 0, limit, remaining: limit, month };
  }
}



