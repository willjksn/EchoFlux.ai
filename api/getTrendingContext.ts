import type { VercelRequest, VercelResponse } from "@vercel/node";
import { searchWeb } from "./_webSearch.js";
import { getVerifyAuth } from "./_errorHandler.js";

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

  // Check if user has access to Tavily (Elite-only)
  const hasTrendAccess = user.plan === 'Elite' || user.role === 'Admin';

  const { niche, platforms, context } = (req.body as any) || {};

  try {
    let allResults: any[] = [];
    
    // Only fetch trends if user has Elite access
    if (hasTrendAccess) {
      // Build search queries for trending information
      const queries = [
        niche ? `${niche} social media trends 2024` : 'social media trends 2024',
        niche ? `${niche} content creator tips` : 'content creator best practices 2024',
        'social media algorithm updates 2024',
        platforms && platforms.length > 0 
          ? `${platforms.join(' ')} posting best practices 2024`
          : 'social media posting best practices 2024',
      ];

      // Fetch trends from Tavily (with usage tracking)
      const trendResults = await Promise.all(
        queries.map(query => searchWeb(query, user.uid, user.plan, user.role))
      );

      // Combine and summarize results
      allResults = trendResults
        .filter(r => r.success)
        .flatMap(r => r.results)
        .slice(0, 20); // Limit to top 20 results
    }

    // Build context summary for Gemini
    const trendContext = hasTrendAccess && allResults.length > 0
      ? allResults.map((r, idx) => 
          `${idx + 1}. ${r.title}\n   ${r.snippet}\n   Source: ${r.link}`
        ).join('\n\n')
      : hasTrendAccess 
        ? 'No current trend data available. Use general best practices.'
        : 'Trend data requires Elite plan. Using general best practices.';

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
      resultsCount: allResults.length,
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
