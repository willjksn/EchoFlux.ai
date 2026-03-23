/**
 * Video Usage Stats API
 * 
 * GET /api/videoUsageStats - Get platform-wide stats (admin only)
 * GET /api/videoUsageStats?creatorId= - Get creator's quota status
 * POST /api/videoUsageStats?action=addMinutes - Add bonus minutes (admin)
 * POST /api/videoUsageStats?action=setLimit - Set monthly limit (admin)
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { 
  getPlatformVideoStats, 
  getCreatorQuotaStatus, 
  addBonusMinutes, 
  updateCreatorMonthlyLimit 
} from "./_videoUsageTracking.js";

// Admin user IDs (should be in environment or database)
const ADMIN_UIDS = process.env.ADMIN_UIDS?.split(',') || [];

async function isAdmin(uid: string): Promise<boolean> {
  if (ADMIN_UIDS.includes(uid)) return true;
  
  const db = getAdminDb();
  const userDoc = await db.collection('users').doc(uid).get();
  const userData = userDoc.data();
  return userData?.role === 'admin' || userData?.isAdmin === true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const db = getAdminDb();
  if (!db) {
    return res.status(500).json({ error: "Database unavailable" });
  }

  // GET requests
  if (req.method === "GET") {
    const creatorId = req.query.creatorId as string | undefined;

    // Get creator's own quota
    if (creatorId) {
      // Users can only see their own quota (or admin can see anyone's)
      const isAdminUser = await isAdmin(decoded.uid);
      if (decoded.uid !== creatorId && !isAdminUser) {
        return res.status(403).json({ error: "Not authorized" });
      }

      try {
        const quota = await getCreatorQuotaStatus(creatorId);
        return res.status(200).json({ quota });
      } catch (e) {
        console.error("Failed to get quota:", e);
        return res.status(500).json({ error: "Failed to get quota status" });
      }
    }

    // Admin-only: Get platform-wide stats
    const isAdminUser = await isAdmin(decoded.uid);
    if (!isAdminUser) {
      return res.status(403).json({ error: "Admin access required" });
    }

    try {
      const months = parseInt(req.query.months as string) || 3;
      const stats = await getPlatformVideoStats(months);
      
      // Calculate totals
      const totals = stats.reduce((acc, month) => ({
        totalSessions: acc.totalSessions + month.totalSessions,
        totalParticipantMinutes: acc.totalParticipantMinutes + month.totalParticipantMinutes,
        estimatedCost: acc.estimatedCost + month.estimatedCost,
        totalRevenue: acc.totalRevenue + month.totalRevenue,
        totalCommission: acc.totalCommission + month.totalCommission,
      }), {
        totalSessions: 0,
        totalParticipantMinutes: 0,
        estimatedCost: 0,
        totalRevenue: 0,
        totalCommission: 0,
      });

      // Current month status
      const currentMonth = stats[0];
      const FREE_TIER_MINUTES = 10000;
      const freeMinutesRemaining = Math.max(0, FREE_TIER_MINUTES - (currentMonth?.totalParticipantMinutes || 0));
      const isOverFreeTier = (currentMonth?.totalParticipantMinutes || 0) >= FREE_TIER_MINUTES;

      return res.status(200).json({
        monthlyStats: stats,
        totals,
        currentMonth: {
          ...currentMonth,
          freeMinutesRemaining,
          isOverFreeTier,
          freeTierLimit: FREE_TIER_MINUTES,
        },
      });
    } catch (e) {
      console.error("Failed to get platform stats:", e);
      return res.status(500).json({ error: "Failed to get platform stats" });
    }
  }

  // POST requests (admin actions)
  if (req.method === "POST") {
    const isAdminUser = await isAdmin(decoded.uid);
    if (!isAdminUser) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const action = req.query.action as string;
    const body = req.body as Record<string, unknown>;

    // Add bonus minutes to a creator
    if (action === "addMinutes") {
      const creatorId = body.creatorId as string;
      const minutes = body.minutes as number;

      if (!creatorId || typeof minutes !== 'number' || minutes <= 0) {
        return res.status(400).json({ error: "creatorId and positive minutes required" });
      }

      try {
        await addBonusMinutes(creatorId, minutes);
        const quota = await getCreatorQuotaStatus(creatorId);
        return res.status(200).json({ 
          success: true, 
          message: `Added ${minutes} bonus minutes`,
          quota,
        });
      } catch (e) {
        console.error("Failed to add minutes:", e);
        return res.status(500).json({ error: "Failed to add minutes" });
      }
    }

    // Set monthly limit for a creator
    if (action === "setLimit") {
      const creatorId = body.creatorId as string;
      const limit = body.limit as number;

      if (!creatorId || typeof limit !== 'number') {
        return res.status(400).json({ error: "creatorId and limit required (use -1 for unlimited)" });
      }

      try {
        await updateCreatorMonthlyLimit(creatorId, limit);
        const quota = await getCreatorQuotaStatus(creatorId);
        return res.status(200).json({ 
          success: true, 
          message: limit === -1 ? "Set to unlimited" : `Set limit to ${limit} minutes/month`,
          quota,
        });
      } catch (e) {
        console.error("Failed to set limit:", e);
        return res.status(500).json({ error: "Failed to set limit" });
      }
    }

    return res.status(400).json({ error: "Invalid action" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
