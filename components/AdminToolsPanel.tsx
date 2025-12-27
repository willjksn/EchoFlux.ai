import React, { useMemo, useState } from "react";
import { auth } from "../firebaseConfig";
import { useAppContext } from "./AppContext";

type SearchDepth = "basic" | "advanced";

type TavilyResult = {
  title: string;
  link: string;
  snippet: string;
};

type TavilyResponse = {
  success: boolean;
  note?: string;
  results: TavilyResult[];
  usageLimitReached?: boolean;
};

export const AdminToolsPanel: React.FC = () => {
  const { showToast } = useAppContext();
  const [query, setQuery] = useState<string>("");
  const [maxResults, setMaxResults] = useState<number>(5);
  const [searchDepth, setSearchDepth] = useState<SearchDepth>("basic");
  const [bypassCache, setBypassCache] = useState<boolean>(false);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [response, setResponse] = useState<TavilyResponse | null>(null);

  const hasResults = useMemo(() => (response?.results?.length ?? 0) > 0, [response]);

  const runSearch = async () => {
    const q = query.trim();
    if (!q) {
      showToast("Enter a Tavily query first", "error");
      return;
    }

    setIsSearching(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const res = await fetch("/api/adminTavilySearch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          query: q,
          maxResults,
          searchDepth,
          bypassCache,
        }),
      });

      const data = (await res.json()) as TavilyResponse & { error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.note || "Tavily search failed");
      }

      setResponse(data);
      showToast("Tavily search complete", "success");
    } catch (err: any) {
      console.error("Admin Tavily search failed:", err);
      showToast(err?.message || "Tavily search failed", "error");
    } finally {
      setIsSearching(false);
    }
  };

  const runWeeklyTrendsNow = async () => {
    setIsSearching(true);
    try {
      // weeklyTrendsJob supports GET without CRON_SECRET (cron-compatible)
      const res = await fetch("/api/weeklyTrendsJob", { method: "GET" });
      const data = (await res.json()) as any;

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || data?.note || "Weekly trends job failed");
      }

      showToast("Weekly trends refreshed", "success");
    } catch (err: any) {
      console.error("Weekly trends job failed:", err);
      showToast(err?.message || "Weekly trends job failed", "error");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Admin Tools</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Run live Tavily searches on demand (admin-only). Useful for validating trends, policies, and platform updates quickly.
            </p>
          </div>
          <button
            type="button"
            onClick={runWeeklyTrendsNow}
            disabled={isSearching}
            className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
            title="Fetch and store weekly trends immediately"
          >
            Run Weekly Trends Now
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
            Query
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='e.g. "OnlyFans policy updates 2025 content restrictions"'
              className="mt-1 w-full px-3 py-2 rounded-md bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Max results
              <input
                type="number"
                min={1}
                max={10}
                value={maxResults}
                onChange={(e) => setMaxResults(Number(e.target.value))}
                className="mt-1 w-full px-3 py-2 rounded-md bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
              />
            </label>

            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Search depth
              <select
                value={searchDepth}
                onChange={(e) => setSearchDepth(e.target.value as SearchDepth)}
                className="mt-1 w-full px-3 py-2 rounded-md bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="basic">Basic</option>
                <option value="advanced">Advanced</option>
              </select>
            </label>

            <label className="text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center gap-2 mt-6">
              <input
                type="checkbox"
                checked={bypassCache}
                onChange={(e) => setBypassCache(e.target.checked)}
              />
              Bypass cache
            </label>
          </div>

          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={runSearch}
              disabled={isSearching}
              className="px-4 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {isSearching ? "Running..." : "Run Tavily Search"}
            </button>
            <button
              type="button"
              onClick={() => setResponse(null)}
              disabled={isSearching}
              className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              Clear
            </button>
          </div>

          {response?.note && (
            <div className="mt-3 text-sm text-gray-700 dark:text-gray-200">
              <span className="font-semibold">Note:</span> {response.note}
            </div>
          )}

          {hasResults && (
            <div className="mt-4 space-y-3">
              {response!.results.map((r, idx) => (
                <div key={`${r.link}-${idx}`} className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                  <a
                    href={r.link}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-primary-700 dark:text-primary-300 hover:underline"
                  >
                    {r.title || r.link}
                  </a>
                  <div className="text-sm text-gray-700 dark:text-gray-200 mt-2 whitespace-pre-wrap">
                    {r.snippet}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 break-all">{r.link}</div>
                </div>
              ))}
            </div>
          )}

          {response && !hasResults && (
            <div className="mt-4 text-sm text-gray-600 dark:text-gray-300">
              No results returned.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


