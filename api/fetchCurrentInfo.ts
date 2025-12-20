import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, getVerifyAuth } from "./_errorHandler.js";
import { searchWeb } from "./_webSearch.js";
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

  console.log('[fetchCurrentInfo] Tavily search requested for topic:', searchQuery, 'user:', user?.uid || 'anonymous');
  const result = await searchWeb(
    searchQuery,
    user?.uid,
    user?.plan,
    user?.role
  );
  console.log('[fetchCurrentInfo] Tavily search result:', {
    success: result.success,
    resultCount: result.results?.length || 0,
    note: result.note,
    topic: searchQuery
  });

  // Track Tavily usage for admin analytics (only when we know the user)
  if (user?.uid) {
    try {
      await trackModelUsage({
        userId: user.uid,
        taskType: "trends", // reuse trends/task bucket for external web insights
        modelName: "tavily-web-search",
        costTier: "low",
        // Tavily is billed per query – approximate a tiny fixed cost here
        estimatedCost: result.success ? 0.0005 : 0,
        success: result.success,
      });
    } catch (err) {
      // Do not fail the request if tracking fails
      console.error("Failed to track Tavily usage from fetchCurrentInfo:", err);
    }
  }

  res.status(200).json({
    success: result.success,
    note: result.note,
    results: result.results,
    topic: searchQuery,
    uid: user?.uid ?? null,
  });
}

export default withErrorHandling(handler);

