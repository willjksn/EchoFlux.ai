/**
 * Caption Generation Usage Tracking & Limits
 * 
 * Tracks per-user caption generation usage to control AI API costs.
 * 
 * Per-User Limits:
 * - Free: 10 captions/month
 * - Pro: 500 captions/month
 * - Elite: 1500 captions/month
 * - Agency: 1000 captions/month
 * - Admin: Unlimited (but tracked)
 */

import { getAdminDb } from "./_firebaseAdmin.js";
import { Timestamp, FieldValue } from "firebase-admin/firestore";

export interface CaptionUsage {
  userId: string;
  month: string; // Format: "2024-01"
  count: number;
  lastReset: Timestamp;
  lastUpdated: Timestamp;
}

const CAPTION_LIMITS: Record<string, number> = {
  Free: 10,        // 10 captions per month
  Pro: 500,        // 500 captions per month
  Elite: 1500,     // 1500 captions per month
  Agency: 1000,    // 1000 captions per month
  Admin: 999999,   // Effectively unlimited
  // OnlyFansStudio is part of Elite plan, so it shares the same 1500 allowance
};

/**
 * Normalize plan name - OnlyFansStudio users share Elite's allowance
 */
function normalizePlan(plan: string): string {
  if (plan === 'OnlyFansStudio') {
    return 'Elite'; // OnlyFansStudio is part of Elite plan, shares same allowance
  }
  return plan;
}

/**
 * Get current month key (e.g., "2024-01")
 */
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Record a caption generation (increment count)
 */
export async function recordCaptionGeneration(
  userId: string,
  userPlan: string,
  userRole?: string,
  count: number = 1
): Promise<void> {
  // Admin doesn't need tracking (unlimited)
  if (userRole === 'Admin') {
    return;
  }

  // Normalize plan - OnlyFansStudio shares Elite's allowance
  const normalizedPlan = normalizePlan(userPlan);
  const limit = CAPTION_LIMITS[normalizedPlan] || 0;

  const db = getAdminDb();
  const month = getCurrentMonth();
  // Use normalized plan for usage tracking so OnlyFansStudio and Elite share the same pool
  const usageRef = db.collection('caption_usage').doc(`${userId}_${month}`);

  try {
    const usageDoc = await usageRef.get();
    const now = Timestamp.now();

    if (!usageDoc.exists) {
      // Create new record
      await usageRef.set({
        userId,
        month,
        count: count,
        lastReset: now,
        lastUpdated: now,
      });
    } else {
      // Increment count
      await usageRef.update({
        count: FieldValue.increment(count),
        lastUpdated: now,
      });
    }

    // Also update the user document's monthlyCaptionGenerationsUsed field
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (userDoc.exists) {
      const currentCount = userDoc.data()?.monthlyCaptionGenerationsUsed || 0;
      await userRef.update({
        monthlyCaptionGenerationsUsed: currentCount + count,
      });
    }
  } catch (error) {
    console.error('Error recording caption generation:', error);
    // Don't throw - usage tracking shouldn't break the feature
  }
}

/**
 * Get user's current caption generation usage stats
 */
export async function getCaptionUsageStats(
  userId: string,
  userPlan: string,
  userRole?: string
): Promise<{ count: number; limit: number; remaining: number; month: string }> {
  if (userRole === 'Admin') {
    return { count: 0, limit: 999999, remaining: 999999, month: getCurrentMonth() };
  }

  // Normalize plan - OnlyFansStudio shares Elite's allowance
  const normalizedPlan = normalizePlan(userPlan);
  const limit = CAPTION_LIMITS[normalizedPlan] || 0;
  const db = getAdminDb();
  const month = getCurrentMonth();
  const usageRef = db.collection('caption_usage').doc(`${userId}_${month}`);

  try {
    const usageDoc = await usageRef.get();
    if (!usageDoc.exists) {
      return { count: 0, limit, remaining: limit, month };
    }

    const usage = usageDoc.data() as CaptionUsage;
    const remaining = Math.max(0, limit - usage.count);
    return {
      count: usage.count,
      limit,
      remaining,
      month: usage.month,
    };
  } catch (error) {
    console.error('Error getting caption usage stats:', error);
    return { count: 0, limit, remaining: limit, month };
  }
}

