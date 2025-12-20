import fetch from "node-fetch";
import { canUseTavily, recordTavilyUsage } from "./_tavilyUsage.js";

export interface WebSearchResult {
  title: string;
  link: string;
  snippet: string;
}

export interface WebSearchResponse {
  success: boolean;
  note?: string;
  results: WebSearchResult[];
  usageLimitReached?: boolean;
}

// Simple in-memory cache for Tavily results (resets on server restart)
// Cache key: query string, value: { results, timestamp }
const tavilyCache = new Map<string, { results: WebSearchResult[]; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour cache (trends change slowly)

/**
 * Get cached result if available and fresh
 */
function getCachedResult(query: string): WebSearchResult[] | null {
  const cached = tavilyCache.get(query.toLowerCase().trim());
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.results;
  }
  return null;
}

/**
 * Store result in cache
 */
function setCachedResult(query: string, results: WebSearchResult[]): void {
  tavilyCache.set(query.toLowerCase().trim(), {
    results,
    timestamp: Date.now(),
  });
  // Limit cache size to prevent memory issues (keep last 100 queries)
  if (tavilyCache.size > 100) {
    const firstKey = tavilyCache.keys().next().value;
    if (firstKey !== undefined) {
      tavilyCache.delete(firstKey);
    }
  }
}

/**
 * Lightweight server-side web search helper using Tavily.
 *
 * Uses Tavily if TAVILY_API_KEY is configured. If not, returns a friendly
 * message explaining that live web search is not available.
 * 
 * @param query - Search query
 * @param userId - User ID for usage tracking (optional)
 * @param userPlan - User plan for limit checking (optional)
 * @param userRole - User role (optional, Admin has unlimited)
 */
export async function searchWeb(
  query: string,
  userId?: string,
  userPlan?: string,
  userRole?: string
): Promise<WebSearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      note:
        "TAVILY_API_KEY is not configured. Add it to your environment to enable live web search for Elite voice assistant users.",
      results: [],
    };
  }

  // Check cache first (skip cache for admins if needed, but generally cache is fine)
  const cachedResults = getCachedResult(query);
  if (cachedResults) {
    console.log('[Tavily] Using cached result for:', query);
    return {
      success: true,
      results: cachedResults,
    };
  }

  // Check usage limits if user info provided
  if (userId && userPlan) {
    const usageCheck = await canUseTavily(userId, userPlan, userRole);
    if (!usageCheck.allowed) {
      return {
        success: false,
        note: `Tavily search limit reached (${usageCheck.limit} searches/month). Upgrade to Elite for more searches.`,
        results: [],
        usageLimitReached: true,
      };
    }
  }

  try {
    console.log('[Tavily] Searching web for:', query);
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        max_results: 5,
        search_depth: "basic",
      }),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      console.error('[Tavily] API error:', res.status, errorText);
      return {
        success: false,
        note: `Search provider responded with status ${res.status}: ${errorText}`,
        results: [],
      };
    }

    const data: any = await res.json();
    console.log('[Tavily] API response received:', {
      hasResults: !!(data.results || data.data),
      resultCount: (data.results || data.data || []).length,
      query
    });
    
    const resultsArray: any[] = data.results || data.data || [];

    const results: WebSearchResult[] = resultsArray.slice(0, 5).map((item) => ({
      title: item.title || "",
      link: item.url || item.link || "",
      snippet: item.content || item.snippet || "",
    }));

    console.log('[Tavily] Processed results:', results.length, 'results for query:', query);

    // Cache the results (even if empty, to avoid repeated failed searches)
    if (results.length > 0) {
      setCachedResult(query, results);
    }

    // Record usage if user info provided (only count actual API calls, not cache hits)
    if (userId && userPlan && results.length > 0) {
      await recordTavilyUsage(userId, userPlan, userRole);
    }

    return {
      success: true,
      results,
      note: results.length === 0 ? "No results found for this query." : undefined,
    };
  } catch (err: any) {
    console.error("searchWeb error:", err);
    return {
      success: false,
      note: err?.message || "Unexpected error during web search.",
      results: [],
    };
  }
}

