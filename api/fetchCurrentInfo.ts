import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, getVerifyAuth } from "./_errorHandler.js";
import { getLatestTrends } from "./_trendsHelper.js";
import { trackModelUsage } from "./trackModelUsage.js";

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Auth is optional here: if verifyAuth fails we still allow a basic search
  let user: any = null;
  try {
    const verifyAuth = await getVerifyAuth();
    user = await verifyAuth(req);
  } catch (err) {
    // swallow auth errors – this endpoint can be used in a "public" way too
    user = null;
  }

  const { topic } = (req.body as any) || {};

  if (!topic || typeof topic !== "string" || !topic.trim()) {
    res.status(400).json({ error: "Missing or invalid 'topic'" });
    return;
  }

  const searchQuery = topic.trim();

  // Live Tavily search is disabled (cost control). Return cached weekly trends context instead.
  const cached = await getLatestTrends().catch(() => 'Trend data unavailable. Use general best practices.');

  // Track as a cache read (no cost)
  if (user?.uid) {
    try {
      await trackModelUsage({
        userId: user.uid,
        taskType: "trends",
        modelName: "weekly-trends-cache",
        costTier: "low",
        estimatedCost: 0,
        success: true,
      });
    } catch (err) {
      console.error("Failed to track cached trend usage from fetchCurrentInfo:", err);
    }
  }

  res.status(200).json({
    success: true,
    note: "Live web search is disabled. Returning cached weekly trends context only.",
    results: [],
    topic: searchQuery,
    uid: user?.uid ?? null,
    cachedTrendContext: cached,
  });
}

export default withErrorHandling(handler);

