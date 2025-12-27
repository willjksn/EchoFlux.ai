/**
 * Compose Insights Usage Tracking & Limits
 *
 * Controls usage for:
 * - Analyze Content Gaps
 * - Predict Performance
 * - Repurpose Content
 *
 * Limits requested:
 * - Pro: gaps 2/mo, predict 5/mo, repurpose 5/mo
 * - Elite: unlimited
 *
 * We track counts on the user document and reset them when the month changes.
 */

import { FieldValue } from "firebase-admin/firestore";

export type ComposeInsightFeature = "content_gaps" | "predict" | "repurpose";

const LIMITS: Record<
  string,
  { content_gaps: number; predict: number; repurpose: number }
> = {
  Free: { content_gaps: 0, predict: 0, repurpose: 0 },
  Caption: { content_gaps: 0, predict: 0, repurpose: 0 },
  Starter: { content_gaps: 0, predict: 0, repurpose: 0 },
  Growth: { content_gaps: 0, predict: 0, repurpose: 0 },
  Pro: { content_gaps: 2, predict: 5, repurpose: 5 },
  Elite: { content_gaps: 999999, predict: 999999, repurpose: 999999 },
  Agency: { content_gaps: 999999, predict: 999999, repurpose: 999999 },
};

function normalizePlan(plan: string | undefined | null): string {
  if (!plan) return "Free";
  if (plan === "OnlyFansStudio") return "Elite";
  return plan;
}

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getFieldName(feature: ComposeInsightFeature) {
  switch (feature) {
    case "content_gaps":
      return "monthlyContentGapsUsed";
    case "predict":
      return "monthlyPredictionsUsed";
    case "repurpose":
      return "monthlyRepurposesUsed";
  }
}

export class ComposeInsightLimitError extends Error {
  public readonly feature: ComposeInsightFeature;
  public readonly limit: number;
  public readonly used: number;

  constructor(opts: {
    feature: ComposeInsightFeature;
    limit: number;
    used: number;
    message: string;
  }) {
    super(opts.message);
    this.name = "ComposeInsightLimitError";
    this.feature = opts.feature;
    this.limit = opts.limit;
    this.used = opts.used;
  }
}

export async function enforceAndRecordComposeInsightUsage(params: {
  db: FirebaseFirestore.Firestore;
  userId: string;
  feature: ComposeInsightFeature;
}): Promise<{
  month: string;
  limit: number;
  usedAfter: number;
}> {
  const { db, userId, feature } = params;
  const userRef = db.collection("users").doc(userId);
  const monthKey = getCurrentMonthKey();
  const fieldName = getFieldName(feature);

  return await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) {
      throw new Error("User not found");
    }
    const data = snap.data() || {};

    const normalizedPlan = normalizePlan(data.plan);
    const role = data.role;
    const limits =
      role === "Admin"
        ? { content_gaps: 999999, predict: 999999, repurpose: 999999 }
        : (LIMITS[normalizedPlan] || LIMITS.Free);
    const limit = limits[feature];

    // Month rollover reset (only for these counters)
    const currentMonthInDoc = data.composeInsightsUsageMonth;
    const isNewMonth = currentMonthInDoc !== monthKey;

    const currentUsedRaw = isNewMonth ? 0 : Number(data[fieldName] || 0);
    const currentUsed = Number.isFinite(currentUsedRaw) ? currentUsedRaw : 0;

    if (limit <= 0) {
      throw new ComposeInsightLimitError({
        feature,
        limit,
        used: currentUsed,
        message: "Upgrade to Pro or Elite to unlock this feature.",
      });
    }

    if (currentUsed >= limit) {
      throw new ComposeInsightLimitError({
        feature,
        limit,
        used: currentUsed,
        message: "Monthly limit reached. Upgrade to Elite for unlimited access.",
      });
    }

    const updates: Record<string, any> = {};
    if (isNewMonth) {
      updates.composeInsightsUsageMonth = monthKey;
      updates.monthlyContentGapsUsed = 0;
      updates.monthlyPredictionsUsed = 0;
      updates.monthlyRepurposesUsed = 0;
    }

    updates[fieldName] = FieldValue.increment(1);
    tx.set(userRef, updates, { merge: true });

    return {
      month: monthKey,
      limit,
      usedAfter: currentUsed + 1,
    };
  });
}


