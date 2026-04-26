import React from "react";
import type { AmazonLink, ContentIdea } from "../../types/creatorOS";
import { CONTENT_LANE_LABELS, FUNNEL_GOAL_LABELS, PLATFORM_LABELS, CONTENT_IDEA_STATUS_LABELS, CONTENT_IDEA_STATUSES } from "../../lib/creatorOS";

type Props = {
  idea: ContentIdea;
  amazonLinks: AmazonLink[];
  onEdit: (idea: ContentIdea) => void;
  onDelete: (ideaId: string) => void;
  onSendToCreatePost: (idea: ContentIdea) => void;
  onPublishToMyPage: (idea: ContentIdea) => void;
  onUpdate: (ideaId: string, updates: Partial<ContentIdea>) => void;
};

export const ContentIdeaCard: React.FC<Props> = ({ idea, amazonLinks, onEdit, onDelete, onSendToCreatePost, onPublishToMyPage, onUpdate }) => {
  const link = idea.amazonLinkId ? amazonLinks.find((item) => item.id === idea.amazonLinkId) : null;
  const currentStatusIndex = CONTENT_IDEA_STATUSES.indexOf(idea.status);
  const nextStatus = CONTENT_IDEA_STATUSES[currentStatusIndex + 1];

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-gray-50 transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:ring-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">{idea.title || "Untitled idea"}</h3>
          <p className="mt-1 text-xs text-gray-500">{CONTENT_LANE_LABELS[idea.lane]}</p>
        </div>
        <select
          value={idea.status}
          onChange={(e) => onUpdate(idea.id, { status: e.target.value as ContentIdea["status"] })}
          className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-900"
        >
          {Object.entries(CONTENT_IDEA_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {idea.publicHook && <p className="mt-3 text-sm font-medium text-gray-800 dark:text-gray-200">"{idea.publicHook}"</p>}
      {idea.caption && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{idea.caption}</p>}
      <div className="mt-3 flex flex-wrap gap-1">
        {idea.platforms.map((platform) => (
          <span key={platform} className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
            {PLATFORM_LABELS[platform]}
          </span>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-500">{FUNNEL_GOAL_LABELS[idea.funnelGoal]}</p>
      {(link || idea.amazonCategory) && (
        <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-300">Amazon: {link?.productName || idea.amazonCategory}</p>
      )}
      {idea.innerCircleTieIn && <p className="mt-1 text-xs text-primary-600 dark:text-primary-300">Inner Circle: {idea.innerCircleTieIn}</p>}
      <div className="mt-4 grid gap-2">
        {nextStatus && (
          <button
            type="button"
            onClick={() => onUpdate(idea.id, { status: nextStatus })}
            className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            Move to {CONTENT_IDEA_STATUS_LABELS[nextStatus]}
          </button>
        )}
        {idea.status === "review" && (
          <button
            type="button"
            onClick={() => onUpdate(idea.id, { status: "ideas" })}
            className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
          >
            Restart as Idea
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => onSendToCreatePost(idea)} className="rounded-lg bg-primary-50 px-2.5 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-100 dark:bg-primary-900/30 dark:text-primary-300">Create Post</button>
        <button onClick={() => onPublishToMyPage(idea)} className="rounded-lg bg-pink-50 px-2.5 py-1.5 text-xs font-semibold text-pink-700 hover:bg-pink-100 dark:bg-pink-900/20 dark:text-pink-300">Post My Page</button>
        <button onClick={() => onEdit(idea)} className="rounded-lg bg-primary-50 px-2.5 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-100 dark:bg-primary-900/30 dark:text-primary-300">Edit</button>
        <button onClick={() => onDelete(idea.id)} className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300">Delete</button>
      </div>
    </div>
  );
};

