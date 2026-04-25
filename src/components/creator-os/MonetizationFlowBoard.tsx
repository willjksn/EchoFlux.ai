import React from "react";
import type { AmazonLink, ContentIdea } from "../../types/creatorOS";
import { CONTENT_IDEA_STATUS_LABELS, CONTENT_IDEA_STATUSES } from "../../lib/creatorOS";
import { ContentIdeaCard } from "./ContentIdeaCard";

type Props = {
  ideas: ContentIdea[];
  amazonLinks: AmazonLink[];
  onAddIdea: () => void;
  onEditIdea: (idea: ContentIdea) => void;
  onDeleteIdea: (ideaId: string) => void;
  onSendToCreatePost: (idea: ContentIdea) => void;
  onPublishToMyPage: (idea: ContentIdea) => void;
  onUpdateIdea: (ideaId: string, updates: Partial<ContentIdea>) => void;
};

export const MonetizationFlowBoard: React.FC<Props> = ({
  ideas,
  amazonLinks,
  onAddIdea,
  onEditIdea,
  onDeleteIdea,
  onSendToCreatePost,
  onPublishToMyPage,
  onUpdateIdea,
}) => (
  <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-md dark:border-gray-700 dark:bg-gray-800">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Monetization Flow</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Ideas &gt; To Film &gt; Ready &gt; Posted &gt; Monetized &gt; Review</p>
      </div>
      <button onClick={onAddIdea} className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-700">Add idea</button>
    </div>

    <div className="mt-5 grid gap-4 xl:grid-cols-6">
      {CONTENT_IDEA_STATUSES.map((status) => {
        const list = ideas.filter((idea) => idea.status === status);
        return (
          <div key={status} className="min-h-[220px] rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200">{CONTENT_IDEA_STATUS_LABELS[status]}</h3>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-gray-500 dark:bg-gray-800">{list.length}</span>
            </div>
            <div className="space-y-3">
              {list.length === 0 ? (
                <p className="rounded-lg border border-dashed border-gray-300 p-3 text-xs text-gray-400 dark:border-gray-700">No cards yet.</p>
              ) : (
                list.map((idea) => (
                  <ContentIdeaCard
                    key={idea.id}
                    idea={idea}
                    amazonLinks={amazonLinks}
                    onEdit={onEditIdea}
                    onDelete={onDeleteIdea}
                    onSendToCreatePost={onSendToCreatePost}
                    onPublishToMyPage={onPublishToMyPage}
                    onUpdate={onUpdateIdea}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  </section>
);

