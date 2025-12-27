/**
 * Tavily API Usage Tracking & Limits
 * 
 * Tracks per-user Tavily API calls to control costs.
 * Limits:
 * - Elite users: 40 searches/month
 * - Pro users: 16 searches/month
 * - Admin: Unlimited
 * - Others: 0 (no access)
 */

import { getAdminDb } from "./_firebaseAdmin.js";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export interface TavilyUsage {
  userId: string;
  month: string; // Format: "2024-01"
  count: number;
  lastReset: Timestamp;
  lastUpdated: Timestamp;
}

const TAVILY_LIMITS: Record<string, number> = {
  Elite: 40, // 40 searches per month (Enhanced live trend research)
  Admin: 999999, // Effectively unlimited
  Pro: 16, // 16 searches per month (Live trend research included)
  Free: 0, // No access (strategies use general trends only, no live research - basic Gemini only)
  OnlyFansStudio: 16, // Same as Pro
  Agency: 40, // 40 searches per month (hidden for now)
};

/**
 * Get current month key (e.g., "2024-01")
 */
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function getCurrentMonthKey(): string {
  return getCurrentMonth();
}

export type TavilyCallerType = "admin" | "user" | "system";

export interface TavilyCallTotals {
  month?: string;
  totalCalls: number;
  adminCalls: number;
  userCalls: number;
  systemCalls: number;
  lastUpdated?: Timestamp;
}

/**
 * Check if user can make a Tavily search
 */
export async function canUseTavily(
  userId: string,
  userPlan: string,
  userRole?: string
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  // Admin has unlimited access
  if (userRole === 'Admin') {
    return { allowed: true, remaining: 999999, limit: 999999 };
  }

  // Check plan limit
  const limit = TAVILY_LIMITS[userPlan] || 0;
  if (limit === 0) {
    return { allowed: false, remaining: 0, limit: 0 };
  }

  // Get or create usage record
  const db = getAdminDb();
  const month = getCurrentMonth();
  const usageRef = db.collection('tavily_usage').doc(`${userId}_${month}`);

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

    const usage = usageDoc.data() as TavilyUsage;
    
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
    console.error('Error checking Tavily usage:', error);
    // On error, allow but log
    return { allowed: true, remaining: limit, limit };
  }
}

/**
 * Record a Tavily API call
 */
export async function recordTavilyUsage(
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
  const usageRef = db.collection('tavily_usage').doc(`${userId}_${month}`);

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
    console.error('Error recording Tavily usage:', error);
    // Don't throw - usage tracking shouldn't break the feature
  }
}

/**
 * Record an actual Tavily API call (global totals + per-month totals + per-user totals).
 * IMPORTANT: This should be called ONLY for real Tavily HTTP requests (not cache hits).
 */
export async function recordTavilyApiCall(params: {
  userId?: string;
  userPlan?: string;
  userRole?: string;
  callerType?: TavilyCallerType;
}): Promise<void> {
  const { userId, userPlan, userRole, callerType } = params || {};

  const role = userRole === "Admin" ? "Admin" : "User";
  const type: TavilyCallerType =
    callerType ||
    (userRole === "Admin" ? "admin" : userId ? "user" : "system");

  const db = getAdminDb();
  const month = getCurrentMonth();
  const now = Timestamp.now();

  const globalRef = db.collection("tavily_call_totals").doc("global");
  const monthRef = db.collection("tavily_call_totals").doc(`month_${month}`);

  try {
    const incTotal: any = {
      totalCalls: FieldValue.increment(1),
      adminCalls: FieldValue.increment(type === "admin" ? 1 : 0),
      userCalls: FieldValue.increment(type === "user" ? 1 : 0),
      systemCalls: FieldValue.increment(type === "system" ? 1 : 0),
      lastUpdated: now,
    };

    await Promise.all([
      globalRef.set(incTotal, { merge: true }),
      monthRef.set({ ...incTotal, month }, { merge: true }),
    ]);
  } catch (err) {
    console.error("[recordTavilyApiCall] Failed to update totals:", err);
  }

  if (!userId) return;

  // Per-user breakdown (month + lifetime), includes admins.
  // Structure avoids Firestore composite indexes:
  // tavily_user_totals/{month}/users/{userId}
  // tavily_user_totals/lifetime/users/{userId}
  const monthUserRef = db
    .collection("tavily_user_totals")
    .doc(month)
    .collection("users")
    .doc(userId);

  const lifetimeUserRef = db
    .collection("tavily_user_totals")
    .doc("lifetime")
    .collection("users")
    .doc(userId);

  const payload: any = {
    userId,
    role,
    plan: userPlan || null,
    callerType: type,
    count: FieldValue.increment(1),
    lastUpdated: now,
  };

  try {
    await Promise.all([
      monthUserRef.set(payload, { merge: true }),
      lifetimeUserRef.set(payload, { merge: true }),
    ]);
  } catch (err) {
    console.error("[recordTavilyApiCall] Failed to update per-user totals:", err);
  }
}

/**
 * Get user's current Tavily usage stats
 */
export async function getTavilyUsageStats(
  userId: string,
  userPlan: string,
  userRole?: string
): Promise<{ count: number; limit: number; remaining: number; month: string }> {
  if (userRole === 'Admin') {
    return { count: 0, limit: 999999, remaining: 999999, month: getCurrentMonth() };
  }

  const limit = TAVILY_LIMITS[userPlan] || 0;
  const db = getAdminDb();
  const month = getCurrentMonth();
  const usageRef = db.collection('tavily_usage').doc(`${userId}_${month}`);

  try {
    const usageDoc = await usageRef.get();
    if (!usageDoc.exists) {
      return { count: 0, limit, remaining: limit, month };
    }

    const usage = usageDoc.data() as TavilyUsage;
    const remaining = Math.max(0, limit - usage.count);
    return {
      count: usage.count,
      limit,
      remaining,
      month: usage.month,
    };
  } catch (error) {
    console.error('Error getting Tavily usage stats:', error);
    return { count: 0, limit, remaining: limit, month };
  }
}




