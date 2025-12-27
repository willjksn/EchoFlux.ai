import React, { useMemo, useState } from "react";
import { auth } from "../firebaseConfig";
import { useAppContext } from "./AppContext";

type SearchDepth = "basic" | "advanced";
type PresetPlatform = "instagram" | "tiktok" | "x" | "onlyfans";

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

type Preset = {
  id: string;
  platform: PresetPlatform;
  label: string;
};

const PRESETS: Preset[] = [
  // Instagram
  { id: "instagram_reels_trends_week", platform: "instagram", label: "Reels trends this week" },
  { id: "instagram_algorithm_updates", platform: "instagram", label: "IG algorithm updates" },
  { id: "instagram_hook_formulas", platform: "instagram", label: "Hook formulas working now" },
  { id: "instagram_caption_patterns", platform: "instagram", label: "Top performing caption patterns" },
  // TikTok
  { id: "tiktok_trend_signals", platform: "tiktok", label: "Trend signals" },
  { id: "tiktok_caption_structure", platform: "tiktok", label: "Caption structure" },
  { id: "tiktok_retention_hooks", platform: "tiktok", label: "Retention hooks" },
  { id: "tiktok_policy_compliance_changes", platform: "tiktok", label: "Policy/compliance changes" },
  // X
  { id: "x_high_performing_post_formats", platform: "x", label: "High-performing post formats" },
  { id: "x_thread_templates", platform: "x", label: "Thread templates" },
  { id: "x_engagement_patterns_working_now", platform: "x", label: "Engagement patterns that still work" },
  { id: "x_policy_changes", platform: "x", label: "Policy changes" },
  // OnlyFans
  { id: "onlyfans_monetization_best_practices", platform: "onlyfans", label: "Monetization best practices" },
  { id: "onlyfans_ppv_promo_copy_patterns", platform: "onlyfans", label: "PPV promo copy patterns" },
  { id: "onlyfans_retention_messaging", platform: "onlyfans", label: "Retention messaging" },
  { id: "onlyfans_policy_updates", platform: "onlyfans", label: "Policy updates" },
];

export const AdminToolsPanel: React.FC = () => {
  const { showToast } = useAppContext();
  const [query, setQuery] = useState<string>("");
  const [maxResults, setMaxResults] = useState<number>(5);
  const [searchDepth, setSearchDepth] = useState<SearchDepth>("basic");
  const [bypassCache, setBypassCache] = useState<boolean>(false);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [response, setResponse] = useState<TavilyResponse | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(PRESETS[0]?.id || "");

  const hasResults = useMemo(() => (response?.results?.length ?? 0) > 0, [response]);
  const selectedPreset = useMemo(() => PRESETS.find((p) => p.id === selectedPresetId) || null, [selectedPresetId]);

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

  const runPresetAndSave = async () => {
    if (!selectedPresetId) {
      showToast("Select a preset first", "error");
      return;
    }

    setIsSearching(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const res = await fetch("/api/adminRunViralPreset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          presetId: selectedPresetId,
          maxResults,
          searchDepth,
          bypassCache,
        }),
      });

      const data = (await res.json()) as TavilyResponse & { error?: string; saved?: boolean };
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.note || "Preset run failed");
      }

      setResponse(data);
      showToast("Preset saved for Gemini", "success");
    } catch (err: any) {
      console.error("Admin preset run failed:", err);
      showToast(err?.message || "Preset run failed", "error");
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
              Run live Tavily searches on demand (admin-only). Use presets to save “what’s viral this week” into Firestore so Gemini uses it immediately.
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

        <div className="mt-6 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <h4 className="font-semibold text-gray-900 dark:text-white">“What’s Viral This Week” Presets (Saved for Gemini)</h4>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
            Choose a category and run it to store fresh references that Gemini can use right away (without waiting for cron).
          </p>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200 sm:col-span-2">
              Preset category
              <select
                value={selectedPresetId}
                onChange={(e) => setSelectedPresetId(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
              >
                <optgroup label="Instagram">
                  {PRESETS.filter((p) => p.platform === "instagram").map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="TikTok">
                  {PRESETS.filter((p) => p.platform === "tiktok").map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="X">
                  {PRESETS.filter((p) => p.platform === "x").map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="OnlyFans">
                  {PRESETS.filter((p) => p.platform === "onlyfans").map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>

            <div className="flex items-end">
              <button
                type="button"
                onClick={runPresetAndSave}
                disabled={isSearching}
                className="w-full px-4 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {isSearching ? "Running..." : "Run Preset (Save)"}
              </button>
            </div>
          </div>

          {selectedPreset && (
            <div className="mt-2 text-xs text-gray-600 dark:text-gray-300">
              Selected: <span className="font-semibold">{selectedPreset.platform.toUpperCase()}</span> — {selectedPreset.label}
            </div>
          )}
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


