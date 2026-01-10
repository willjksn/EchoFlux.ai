// api/adminGetOnlyFansUsage.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { withErrorHandling } from "./_errorHandler.js";

type UsageCounts = {
  last24h: number;
  last7d: number;
  last30d: number;
};

function within(ms: number, sinceMs: number) {
  return ms >= sinceMs;
}

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authed = await verifyAuth(req);
  if (!authed?.uid) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  const db = getAdminDb();

  // Check admin role from user doc (safer than relying on custom claims)
  const userDoc = await db.collection("users").doc(authed.uid).get();
  const userData = userDoc.exists ? (userDoc.data() as any) : null;
  if (userData?.role !== "Admin") {
    res.status(403).json({ success: false, error: "Admin access required" });
    return;
  }

  const now = Date.now();
  const ms24h = now - 24 * 60 * 60 * 1000;
  const ms7d = now - 7 * 24 * 60 * 60 * 1000;
  const ms30d = now - 30 * 24 * 60 * 60 * 1000;

  const countsByEvent: Record<string, UsageCounts> = {};
  const challengeCounts: Record<string, number> = {};
  const revenueGoalCounts: Record<string, number> = {};

  const bump = (eventType: string, tsMs: number) => {
    if (!countsByEvent[eventType]) {
      countsByEvent[eventType] = { last24h: 0, last7d: 0, last30d: 0 };
    }
    if (within(tsMs, ms30d)) countsByEvent[eventType].last30d += 1;
    if (within(tsMs, ms7d)) countsByEvent[eventType].last7d += 1;
    if (within(tsMs, ms24h)) countsByEvent[eventType].last24h += 1;
  };

  try {
    // Pull last 30d worth of usage events across all users
    const snap = await db
      .collectionGroup("usage_events")
      .where("ts", ">=", new Date(ms30d))
      .orderBy("ts", "desc")
      .limit(5000)
      .get();

    snap.forEach((doc) => {
      const data = doc.data() as any;
      const eventType = String(data.eventType || "");
      if (!eventType) return;

      // ts is preferred; fall back to createdAt
      let tsMs = now;
      const ts = data.ts;
      if (ts && typeof ts.toDate === "function") {
        tsMs = ts.toDate().getTime();
      } else if (typeof data.createdAt === "string") {
        const d = new Date(data.createdAt);
        if (!Number.isNaN(d.getTime())) tsMs = d.getTime();
      }

      bump(eventType, tsMs);

      // Extract onboarding insights
      if (eventType === "monetized_onboarding_completed") {
        const props = (data.props || {}) as any;
        const challenge = props.biggestChallenge;
        const goal = props.monthlyGoal;
        if (typeof challenge === "string" && challenge.trim()) {
          challengeCounts[challenge] = (challengeCounts[challenge] || 0) + 1;
        }
        if (typeof goal === "string" && goal.trim()) {
          revenueGoalCounts[goal] = (revenueGoalCounts[goal] || 0) + 1;
        }
      }
    });

    const monetizedEnabled = countsByEvent["monetized_mode_enabled"] || { last24h: 0, last7d: 0, last30d: 0 };
    const monetizedOnboardingViewed = countsByEvent["monetized_onboarding_viewed"] || { last24h: 0, last7d: 0, last30d: 0 };
    const studioOpened = countsByEvent["onlyfans_studio_opened"] || { last24h: 0, last7d: 0, last30d: 0 };
    const captions = countsByEvent["of_generate_captions"] || { last24h: 0, last7d: 0, last30d: 0 };
    const weeklyPlan = countsByEvent["of_generate_weekly_plan"] || { last24h: 0, last7d: 0, last30d: 0 };
    const monetizationPlan = countsByEvent["of_generate_monetization_plan"] || { last24h: 0, last7d: 0, last30d: 0 };

    const enableRate30d = monetizedOnboardingViewed.last30d > 0
      ? Math.round((monetizedEnabled.last30d / monetizedOnboardingViewed.last30d) * 100)
      : null;

    const topChallenges = Object.entries(challengeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([challenge, count]) => ({ challenge, count }));

    const revenueGoals = Object.entries(revenueGoalCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([goal, count]) => ({ goal, count }));

    res.status(200).json({
      success: true,
      metrics: {
        monetizedOnboardingViewed,
        monetizedEnabled,
        enableRate30d,
        studioOpened,
        captions: { last7d: captions.last7d },
        weeklyPlan: { last7d: weeklyPlan.last7d },
        monetizationPlan: { last7d: monetizationPlan.last7d },
        topChallenges,
        revenueGoals,
      },
    });
  } catch (err: any) {
    console.error("adminGetOnlyFansUsage error:", err);
    res.status(500).json({ success: false, error: "Failed to load OnlyFans usage metrics", metrics: null });
  }
}

export default withErrorHandling(handler);


