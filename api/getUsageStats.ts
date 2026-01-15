/**
 * Get User Usage Stats API
 * Returns strategy generation and Tavily usage statistics for the current month
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { getStrategyUsageStats } from "./_strategyUsage.js";
import { getTavilyUsageStats } from "./_tavilyUsage.js";
import { getWeeklyPlanUsageStats } from "./_weeklyPlanUsage.js";
import { getAiUsageStats } from "./_aiUsage.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authUser = await verifyAuth(req);
  if (!authUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    // Fetch user's plan and role from Firestore
    const db = getAdminDb();
    const userDoc = await db.collection("users").doc(authUser.uid).get();
    
    if (!userDoc.exists) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const userData = userDoc.data();
    const userPlan = userData?.plan || 'Free';
    const userRole = userData?.role;

    const [strategyStats, tavilyStats, weeklyPlanStats, generalAiStats, sextingAiStats] = await Promise.all([
      getStrategyUsageStats(authUser.uid, userPlan, userRole),
      getTavilyUsageStats(authUser.uid, userPlan, userRole),
      getWeeklyPlanUsageStats(authUser.uid, userPlan, userRole),
      getAiUsageStats(authUser.uid, "general_ai", userPlan, userRole),
      getAiUsageStats(authUser.uid, "sexting_session", userPlan, userRole),
    ]);

    res.status(200).json({
      strategy: strategyStats,
      tavily: tavilyStats,
      weeklyPlan: weeklyPlanStats,
      ai: {
        general: generalAiStats,
        sextingSession: sextingAiStats,
      },
    });
    return;
  } catch (error: any) {
    console.error("getUsageStats error:", error);
    res.status(500).json({
      error: "Failed to get usage stats",
      details: error?.message || String(error),
    });
    return;
  }
}

