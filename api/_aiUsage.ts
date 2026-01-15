import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "./_firebaseAdmin.js";

export type AiUsageType = "general_ai" | "sexting_session";

type UsageRecord = {
  userId: string;
  usageType: AiUsageType;
  month: string;
  count: number;
  lastReset: Timestamp;
  lastUpdated: Timestamp;
};

const AI_LIMITS: Record<AiUsageType, Record<string, number>> = {
  general_ai: {
    Free: 50,
    Pro: 1000,
    Elite: 3000,
    Agency: 3000,
    Admin: 999999,
    OnlyFansStudio: 3000,
  },
  sexting_session: {
    Free: 0,
    Pro: 0,
    Elite: 800,
    Agency: 800,
    Admin: 999999,
    OnlyFansStudio: 800,
  },
};

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function normalizePlan(plan: string): string {
  return plan === "OnlyFansStudio" ? "Elite" : plan;
}

export async function getAiUsageStats(
  userId: string,
  usageType: AiUsageType,
  userPlan: string,
  userRole?: string
): Promise<{ count: number; limit: number; remaining: number; month: string }> {
  if (userRole === "Admin") {
    return { count: 0, limit: 999999, remaining: 999999, month: getCurrentMonth() };
  }

  const normalizedPlan = normalizePlan(userPlan);
  const limit = AI_LIMITS[usageType]?.[normalizedPlan] ?? 0;
  const month = getCurrentMonth();
  const db = getAdminDb();
  const usageRef = db.collection("ai_usage").doc(`${userId}_${usageType}_${month}`);

  try {
    const snap = await usageRef.get();
    if (!snap.exists) {
      return { count: 0, limit, remaining: limit, month };
    }
    const data = snap.data() as UsageRecord;
    const remaining = Math.max(0, limit - (data?.count || 0));
    return { count: data?.count || 0, limit, remaining, month };
  } catch (error) {
    console.error("AI usage stats error:", error);
    return { count: 0, limit, remaining: limit, month };
  }
}

export async function recordAiUsage(
  userId: string,
  usageType: AiUsageType,
  userPlan: string,
  userRole?: string,
  count: number = 1
): Promise<void> {
  if (userRole === "Admin") return;
  const normalizedPlan = normalizePlan(userPlan);
  const limit = AI_LIMITS[usageType]?.[normalizedPlan] ?? 0;
  if (limit <= 0) return;

  const db = getAdminDb();
  const month = getCurrentMonth();
  const usageRef = db.collection("ai_usage").doc(`${userId}_${usageType}_${month}`);
  const now = Timestamp.now();

  try {
    const snap = await usageRef.get();
    if (!snap.exists) {
      await usageRef.set({
        userId,
        usageType,
        month,
        count,
        lastReset: now,
        lastUpdated: now,
      });
    } else {
      await usageRef.update({
        count: FieldValue.increment(count),
        lastUpdated: now,
      });
    }
  } catch (error) {
    console.error("AI usage record error:", error);
  }
}

export async function canUseAi(
  userId: string,
  usageType: AiUsageType,
  userPlan: string,
  userRole?: string
): Promise<{ allowed: boolean; limit: number; remaining: number; month: string }> {
  const stats = await getAiUsageStats(userId, usageType, userPlan, userRole);
  if (userRole === "Admin") return { ...stats, allowed: true };
  return {
    allowed: stats.remaining > 0,
    limit: stats.limit,
    remaining: stats.remaining,
    month: stats.month,
  };
}
