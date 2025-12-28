import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getVerifyAuth } from "./_errorHandler.js";
import { getLatestTrends } from "./_trendsHelper.js";

/**
 * Fetches trending context for a specific niche/topic to inform AI suggestions.
 * Uses Tavily to get current trends, then summarizes for Gemini consumption.
 * 
 * This provides weekly updates on social media trends, algorithm changes, and
 * best practices to keep AI suggestions current and optimized.
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const verifyAuth = await getVerifyAuth();
  const user = await verifyAuth(req);

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { niche, platforms, context } = (req.body as any) || {};

  try {
    // Cached weekly trends (system job) — no user-triggered Tavily
    const cached = await getLatestTrends().catch(() => 'Trend data unavailable. Use general best practices.');
    const trendContext = cached;

    const summary = `
CURRENT SOCIAL MEDIA TRENDS & BEST PRACTICES (${new Date().toLocaleDateString()}):

${trendContext}

KEY INSIGHTS FOR AI SUGGESTIONS:
- Stay current with algorithm changes and platform updates
- Adapt content to trending formats and styles
- Use trending hashtags and topics when relevant
- Follow platform-specific best practices
- Consider seasonal and cultural trends
${context ? `\nADDITIONAL CONTEXT: ${context}` : ''}
`;

    res.status(200).json({
      success: true,
      trendContext: summary,
      resultsCount: 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error fetching trending context:", error);
    res.status(500).json({ 
      error: error?.message || "Failed to fetch trending context",
      // Fallback: return empty context so AI can still work
      trendContext: "Trend data unavailable. Use general best practices.",
    });
  }
}

export default handler;
