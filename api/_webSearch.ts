import fetch from "node-fetch";
import { canUseTavily, recordTavilyApiCall, recordTavilyUsage } from "./_tavilyUsage.js";

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

export interface WebSearchOptions {
  maxResults?: number;
  searchDepth?: "basic" | "advanced";
  bypassCache?: boolean;
}

// Simple in-memory cache for Tavily results (resets on server restart)
// Cache key: query string, value: { results, timestamp }
const tavilyCache = new Map<string, { results: WebSearchResult[]; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour cache (trends change slowly)

function clampMaxResults(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(10, Math.floor(n)));
}

function normalizeSearchDepth(value: unknown): "basic" | "advanced" {
  return value === "advanced" ? "advanced" : "basic";
}

function makeCacheKey(query: string, maxResults: number, searchDepth: "basic" | "advanced"): string {
  return `${query.toLowerCase().trim()}::${maxResults}::${searchDepth}`;
}

/**
 * Get cached result if available and fresh
 */
function getCachedResult(cacheKey: string): WebSearchResult[] | null {
  const cached = tavilyCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.results;
  }
  return null;
}

/**
 * Store result in cache
 */
function setCachedResult(cacheKey: string, results: WebSearchResult[]): void {
  tavilyCache.set(cacheKey, {
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
  userRole?: string,
  options?: WebSearchOptions
): Promise<WebSearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY;

  // COST CONTROL / POLICY:
  // Only allow Tavily for:
  // - system jobs (no userId), e.g. weeklyTrendsJob
  // - Admin users
  // All end-user requests (including anonymous/public) must NOT trigger Tavily.
  const isSystemCaller = !userId;
  const isAdminCaller = userRole === "Admin";
  if (!isSystemCaller && !isAdminCaller) {
    return {
      success: false,
      note:
        "Live web search is disabled. This app uses cached weekly trend research only.",
      results: [],
    };
  }

  if (!apiKey) {
    return {
      success: false,
      note:
        "TAVILY_API_KEY is not configured. Add it to your environment to enable live web search for Elite voice assistant users.",
      results: [],
    };
  }

  const maxResults = clampMaxResults(options?.maxResults);
  const searchDepth = normalizeSearchDepth(options?.searchDepth);
  const cacheKey = makeCacheKey(query, maxResults, searchDepth);

  // Check cache first
  if (!options?.bypassCache) {
    const cachedResults = getCachedResult(cacheKey);
    if (cachedResults) {
      console.log("[Tavily] Using cached result for:", query);
      return {
        success: true,
        results: cachedResults,
      };
    }
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
        max_results: maxResults,
        search_depth: searchDepth,
      }),
    });

    // Count every real Tavily API call (exclude cache hits by design).
    // Count calls even if Tavily responds with a non-2xx status.
    await recordTavilyApiCall({
      userId,
      userPlan,
      userRole,
      callerType: userRole === "Admin" ? "admin" : userId ? "user" : "system",
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
      setCachedResult(cacheKey, results);
    }

    // Record per-user usage (non-admin) for monthly limit enforcement.
    // Count every real API call (excluding cache hits), even if results are empty.
    if (userId && userPlan) {
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

