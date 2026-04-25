import React from "react";

type Props = {
  onUpgrade: () => void;
};

export const CreatorOSLockedState: React.FC<Props> = ({ onUpgrade }) => {
  const previews = ["Today's Move", "Monetization Flow Board", "Amazon Trend Finds", "Inner Circle Funnel"];

  return (
    <div className="min-h-full bg-slate-50 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-primary-600 dark:text-primary-300">Creator OS</p>
          <h1 className="mt-3 text-3xl font-bold">Turn your content into a simple money workflow.</h1>
          <p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-300">
            Plan what to post, where it goes, and how it makes money. Upgrade to unlock the daily action plan,
            Amazon product trends, Inner Circle planning, and content flow board.
          </p>
          <button
            type="button"
            onClick={onUpgrade}
            className="mt-6 rounded-xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
          >
            Upgrade to Pro or Elite
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {previews.map((title) => (
            <div key={title} className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-5 dark:border-slate-700 dark:bg-slate-900/70">
              <div className="mb-3 h-2 w-24 rounded-full bg-slate-200 dark:bg-slate-700" />
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Preview locked on Free. Upgrade to use this workflow.</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

