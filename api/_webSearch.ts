import fetch from "node-fetch";

export interface WebSearchResult {
  title: string;
  link: string;
  snippet: string;
}

export interface WebSearchResponse {
  success: boolean;
  note?: string;
  results: WebSearchResult[];
}

/**
 * Lightweight server-side web search helper using Tavily.
 *
 * Uses Tavily if TAVILY_API_KEY is configured. If not, returns a friendly
 * message explaining that live web search is not available.
 */
export async function searchWeb(query: string): Promise<WebSearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      note:
        "TAVILY_API_KEY is not configured. Add it to your environment to enable live web search for Elite voice assistant users.",
      results: [],
    };
  }

  try {
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
      return {
        success: false,
        note: `Search provider responded with status ${res.status}`,
        results: [],
      };
    }

    const data: any = await res.json();
    const resultsArray: any[] = data.results || data.data || [];

    const results: WebSearchResult[] = resultsArray.slice(0, 5).map((item) => ({
      title: item.title || "",
      link: item.url || item.link || "",
      snippet: item.content || item.snippet || "",
    }));

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

