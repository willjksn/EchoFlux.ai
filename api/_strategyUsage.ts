/**
 * Strategy Generation Usage Tracking & Limits
 * 
 * Tracks per-user strategy generation usage to control Tavily API costs.
 * 
 * Tavily Usage Calculation:
 * - Each strategy generation uses researchNicheStrategy() which makes 8 Tavily searches
 * - Weekly trends job uses ~32 searches/month (8 searches × 4 weeks)
 * - Total budget: 1000 Tavily calls/month
 * - Available for strategies: ~960 calls/month = ~120 strategy generations/month total
 * 
 * Per-User Limits (conservative to allow growth):
 * - Free: 1 strategy/month (8 Tavily calls)
 * - Pro: 5 strategies/month (40 Tavily calls)
 * - Elite: 15 strategies/month (120 Tavily calls)
 * - Admin: Unlimited (but tracked)
 */

import { getAdminDb } from "./_firebaseAdmin.js";
import { Timestamp } from "firebase-admin/firestore";

export interface StrategyUsage {
  userId: string;
  month: string; // Format: "2024-01"
  count: number;
  lastReset: Timestamp;
  lastUpdated: Timestamp;
}

const STRATEGY_LIMITS: Record<string, number> = {
  Free: 1,        // 1 strategy per month
  Pro: 2,          // 2 strategies per month (realistic for most users)
  Elite: 5,       // 5 strategies per month (generous but realistic)
  Admin: 999999,   // Effectively unlimited
  OnlyFansStudio: 2, // Same as Pro
  Agency: 5,      // 5 strategies per month (hidden for now)
};

/**
 * Get current month key (e.g., "2024-01")
 */
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Check if user can generate a strategy
 */
export async function canGenerateStrategy(
  userId: string,
  userPlan: string,
  userRole?: string
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  // Admin has unlimited access
  if (userRole === 'Admin') {
    return { allowed: true, remaining: 999999, limit: 999999 };
  }

  // Check plan limit
  const limit = STRATEGY_LIMITS[userPlan] || 0;
  if (limit === 0) {
    return { allowed: false, remaining: 0, limit: 0 };
  }

  // Get or create usage record
  const db = getAdminDb();
  const month = getCurrentMonth();
  const usageRef = db.collection('strategy_usage').doc(`${userId}_${month}`);

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

    const usage = usageDoc.data() as StrategyUsage;
    
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
    console.error('Error checking strategy usage:', error);
    // On error, allow but log (fail open to not break user experience)
    return { allowed: true, remaining: limit, limit };
  }
}

/**
 * Record a strategy generation
 */
export async function recordStrategyGeneration(
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
  const usageRef = db.collection('strategy_usage').doc(`${userId}_${month}`);

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
    console.error('Error recording strategy generation:', error);
    // Don't throw - usage tracking shouldn't break the feature
  }
}

/**
 * Get user's current strategy generation usage stats
 */
export async function getStrategyUsageStats(
  userId: string,
  userPlan: string,
  userRole?: string
): Promise<{ count: number; limit: number; remaining: number; month: string }> {
  if (userRole === 'Admin') {
    return { count: 0, limit: 999999, remaining: 999999, month: getCurrentMonth() };
  }

  const limit = STRATEGY_LIMITS[userPlan] || 0;
  const db = getAdminDb();
  const month = getCurrentMonth();
  const usageRef = db.collection('strategy_usage').doc(`${userId}_${month}`);

  try {
    const usageDoc = await usageRef.get();
    if (!usageDoc.exists) {
      return { count: 0, limit, remaining: limit, month };
    }

    const usage = usageDoc.data() as StrategyUsage;
    const remaining = Math.max(0, limit - usage.count);
    return {
      count: usage.count,
      limit,
      remaining,
      month: usage.month,
    };
  } catch (error) {
    console.error('Error getting strategy usage stats:', error);
    return { count: 0, limit, remaining: limit, month };
  }
}

