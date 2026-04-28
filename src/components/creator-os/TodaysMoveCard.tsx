import React from "react";
import type { TodaysMove } from "../../types/creatorOS";
import { PLATFORM_LABELS } from "../../lib/creatorOS";

type Props = {
  move: TodaysMove | null;
  onSaveAsIdea: () => void;
  onAddToWeeklyPlan: () => void;
  onMarkDone: () => void;
  onRegenerate: () => void;
  onSendToCreatePost: () => void;
  onPublishToMyPage: () => void;
  onToggleChecklist: (id: string) => void;
};

export const TodaysMoveCard: React.FC<Props> = ({
  move,
  onSaveAsIdea,
  onAddToWeeklyPlan,
  onMarkDone,
  onRegenerate,
  onSendToCreatePost,
  onPublishToMyPage,
  onToggleChecklist,
}) => {
  if (!move) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-md dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Today's Move</h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Build your money flow to generate a daily action plan.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-md dark:border-gray-700 dark:bg-gray-800">
      <div className="bg-gradient-to-r from-primary-600 via-indigo-600 to-purple-600 px-6 py-5 text-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-white/80">Today's Move</p>
            <h2 className="mt-2 text-2xl font-bold">{move.publicPost}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={onSaveAsIdea} className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-primary-700 shadow-sm transition-colors hover:bg-primary-50">Save as Idea</button>
            <button onClick={onSendToCreatePost} className="rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/30 transition-colors hover:bg-white/25">Send to Create Post</button>
            <button onClick={onPublishToMyPage} className="rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/30 transition-colors hover:bg-white/25">Post to My Page</button>
            <button onClick={onAddToWeeklyPlan} className="rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/30 transition-colors hover:bg-white/25">Add to Week</button>
            <button onClick={onMarkDone} className="rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/30 transition-colors hover:bg-white/25">Mark Done</button>
            <button onClick={onRegenerate} className="rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/30 transition-colors hover:bg-white/25">Regenerate</button>
          </div>
        </div>
      </div>
      <div className="p-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Public Post</p>
          <p className="mt-2 text-sm"><span className="font-semibold">Hook:</span> {move.hook}</p>
          <p className="mt-1 text-sm"><span className="font-semibold">Caption:</span> {move.caption}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {move.platforms.map((p) => (
              <span key={p} className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-gray-600 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700">
                {PLATFORM_LABELS[p]}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Story Link</p>
          <p className="mt-2 text-sm"><span className="font-semibold">Amazon angle:</span> {move.suggestedAmazonCategory}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {move.storyLinkPlan.map((line, idx) => (
              <span key={`${line}-${idx}`} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-gray-700 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700">{line}</span>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Inner Circle Drop</p>
          <p className="mt-2 text-sm">{move.innerCircleDrop}</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{move.innerCircleCaption}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Action Steps</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {move.checklist.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onToggleChecklist(item.id)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  item.completed
                    ? "bg-green-100 text-green-700 ring-1 ring-green-200 dark:bg-green-900/30 dark:text-green-300 dark:ring-green-800"
                    : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-700"
                }`}
              >
                {item.completed ? "Done: " : ""}
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

