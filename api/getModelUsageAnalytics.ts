// api/getModelUsageAnalytics.ts
// Fetch model usage analytics for admin dashboard

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.ts";
import { getAdminDb } from "./_firebaseAdmin.ts";
import type { TaskType } from "./_modelRouter.ts";
import admin from "firebase-admin";

interface ModelUsageStats {
  totalRequests: number;
  totalCost: number;
  requestsByModel: Record<string, number>;
  requestsByTask: Record<TaskType, number>;
  requestsByCostTier: {
    low: number;
    medium: number;
    high: number;
  };
  requestsByDay: Array<{ date: string; count: number; cost: number }>;
  topUsers: Array<{ userId: string; userName: string; requests: number; cost: number }>;
  errorRate: number;
  averageCostPerRequest: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth required - Admin only
  const user = await verifyAuth(req);
  if (!user || user.role !== 'Admin') {
    return res.status(403).json({ error: "Admin access required" });
  }

  try {
    const { days = '30' } = req.query;
    const daysNum = parseInt(days as string, 10) || 30;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysNum);

    // Fetch usage logs
    const logsSnapshot = await adminDb
      .collection('model_usage_logs')
      .where('timestamp', '>=', cutoffDate.toISOString())
      .orderBy('timestamp', 'desc')
      .get();

    const logs = logsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Fetch user names for top users
    const userIds = [...new Set(logs.map((log: any) => log.userId))].slice(0, 10); // Firestore 'in' limit is 10
    const usersMap = new Map<string, any>();
    
    // Fetch users individually (Firestore 'in' query can be tricky with documentId)
    // For simplicity, fetch each user individually
    if (userIds.length > 0) {
      const userPromises = userIds.map(async (userId) => {
        try {
          const userDoc = await getAdminDb().collection('users').doc(userId).get();
          if (userDoc.exists) {
            usersMap.set(userId, userDoc.data());
          }
        } catch (error) {
          console.warn(`Failed to fetch user ${userId}:`, error);
        }
      });
      await Promise.all(userPromises);
    }

    // Calculate statistics
    const stats: ModelUsageStats = {
      totalRequests: logs.length,
      totalCost: 0,
      requestsByModel: {},
      requestsByTask: {} as Record<TaskType, number>,
      requestsByCostTier: { low: 0, medium: 0, high: 0 },
      requestsByDay: [],
      topUsers: [],
      errorRate: 0,
      averageCostPerRequest: 0,
    };

    // Group by day
    const dayMap = new Map<string, { count: number; cost: number }>();
    
    // Process logs
    let successCount = 0;
    let totalCost = 0;
    const userRequestMap = new Map<string, { requests: number; cost: number }>();

    logs.forEach((log: any) => {
      // Count by model
      const modelName = log.modelName || 'unknown';
      stats.requestsByModel[modelName] = (stats.requestsByModel[modelName] || 0) + 1;

      // Count by task type
      const taskType = log.taskType || 'unknown';
      stats.requestsByTask[taskType as TaskType] = (stats.requestsByTask[taskType as TaskType] || 0) + 1;

      // Count by cost tier
      const costTier = log.costTier || 'medium';
      stats.requestsByCostTier[costTier as 'low' | 'medium' | 'high']++;

      // Group by day
      const date = new Date(log.timestamp).toISOString().split('T')[0];
      if (!dayMap.has(date)) {
        dayMap.set(date, { count: 0, cost: 0 });
      }
      const day = dayMap.get(date) || dayMap.get(date)!;
      day.count++;
      day.cost += log.estimatedCost || 0;

      // Track user usage
      if (log.userId) {
        if (!userRequestMap.has(log.userId)) {
          userRequestMap.set(log.userId, { requests: 0, cost: 0 });
        }
        const userStats = userRequestMap.get(log.userId)!;
        userStats.requests++;
        userStats.cost += log.estimatedCost || 0;
      }

      // Track success/errors
      if (log.success !== false) {
        successCount++;
      }
      totalCost += log.estimatedCost || 0;
    });

    // Convert day map to array and sort
    stats.requestsByDay = Array.from(dayMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Get top users
    stats.topUsers = Array.from(userRequestMap.entries())
      .map(([userId, data]) => {
        const user = usersMap.get(userId);
        return {
          userId,
          userName: user?.name || 'Unknown User',
          requests: data.requests,
          cost: data.cost,
        };
      })
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);

    // Calculate final stats
    stats.totalCost = totalCost;
    stats.errorRate = logs.length > 0 ? ((logs.length - successCount) / logs.length) * 100 : 0;
    stats.averageCostPerRequest = logs.length > 0 ? totalCost / logs.length : 0;

    return res.status(200).json(stats);
  } catch (err: any) {
    console.error("getModelUsageAnalytics error:", err);
    return res.status(500).json({
      error: "Failed to fetch model usage analytics",
      details: err?.message || String(err),
    });
  }
}

