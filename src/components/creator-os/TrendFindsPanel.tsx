import React from "react";
import type { CreatorOSTrend } from "../../types/creatorOS";

type Props = {
  trends: CreatorOSTrend[];
  loading?: boolean;
  error?: string;
  onFind: () => void;
  onTurnIntoIdea: (trend: CreatorOSTrend) => void;
  onSaveToLibrary: (trend: CreatorOSTrend) => void;
  onUpdate: (trendId: string, updates: Partial<CreatorOSTrend>) => void;
};

export const TrendFindsPanel: React.FC<Props> = ({ trends, loading, error, onFind, onTurnIntoIdea, onSaveToLibrary, onUpdate }) => (
  <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
    <div className="border-b border-primary-100 bg-gradient-to-r from-primary-50 via-white to-pink-50 p-4 text-gray-900 dark:border-gray-700 dark:from-gray-900 dark:via-gray-900 dark:to-primary-950/20 dark:text-white">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-600 dark:text-primary-300">Creator OS research</p>
          <h2 className="mt-1 text-xl font-bold">Trend Finds</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-600 dark:text-gray-300">Amazon product trends turned into creator actions.</p>
        </div>
        <button onClick={onFind} disabled={loading} className="rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-60">
          {loading ? "Finding..." : "Find Product Trends"}
        </button>
      </div>
    </div>
    {error && <p className="mx-5 mt-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">{error}</p>}
    <div className="grid gap-4 p-5 lg:grid-cols-2">
      {trends.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-primary-200 bg-primary-50/60 p-5 text-sm text-primary-900 dark:border-primary-900/40 dark:bg-primary-950/20 dark:text-primary-100 lg:col-span-2">
          Trend search is unavailable right now? You can still plan your week manually.
        </div>
      ) : (
        trends.map((trend) => (
          <div key={trend.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/50">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">{trend.title}</h3>
                <p className="mt-1 text-xs text-gray-500">{trend.category} · {new Date(trend.dateFound).toLocaleDateString()}</p>
              </div>
              <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">{trend.status.replace(/_/g, " ")}</span>
            </div>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">{trend.audienceFit}</p>
            <p className="mt-2 text-sm font-medium text-gray-800 dark:text-gray-100">{trend.contentAngle}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {trend.storyText.map((line, idx) => (
                <span key={`${line}-${idx}`} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-600 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700">{line}</span>
              ))}
            </div>
            <p className="mt-2 text-xs text-primary-600 dark:text-primary-300">{trend.innerCircleTieIn}</p>
            <p className="mt-2 text-xs text-gray-500">Ownership: {trend.ownershipRecommendation.replace(/_/g, " ")}</p>
            {trend.sourceUrl && <a href={trend.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 block text-xs font-semibold text-primary-600 hover:underline">Source link</a>}
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
              <button onClick={() => onTurnIntoIdea(trend)} className="rounded-lg bg-white px-2.5 py-1.5 text-primary-600 ring-1 ring-gray-200 hover:bg-primary-50 dark:bg-gray-800 dark:ring-gray-700">Turn into Idea</button>
              <button onClick={() => onSaveToLibrary(trend)} className="rounded-lg bg-white px-2.5 py-1.5 text-emerald-600 ring-1 ring-gray-200 hover:bg-emerald-50 dark:bg-gray-800 dark:ring-gray-700">Save Link</button>
              <button onClick={() => onUpdate(trend.id, { status: "ignored" })} className="rounded-lg bg-white px-2.5 py-1.5 text-gray-500 ring-1 ring-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:ring-gray-700">Ignore</button>
              <button onClick={() => onUpdate(trend.id, { status: "tested" })} className="rounded-lg bg-white px-2.5 py-1.5 text-gray-500 ring-1 ring-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:ring-gray-700">Tested</button>
              <button onClick={() => onUpdate(trend.id, { status: "proven" })} className="rounded-lg bg-white px-2.5 py-1.5 text-gray-500 ring-1 ring-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:ring-gray-700">Proven</button>
            </div>
          </div>
        ))
      )}
    </div>
  </section>
);

