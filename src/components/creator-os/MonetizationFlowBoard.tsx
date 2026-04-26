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

const statusHelp: Record<(typeof CONTENT_IDEA_STATUSES)[number], string> = {
  ideas: "Fresh concepts and saved moves start here.",
  to_film: "Ideas ready to capture on camera.",
  ready_to_post: "Drafted or ready for Create Post.",
  posted: "Published to Instagram, TikTok, or My Page.",
  monetized: "Linked, sold, tipped, or converted.",
  review: "Check what worked and reuse winners.",
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
  <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
    <div className="border-b border-primary-100 bg-gradient-to-r from-primary-50 via-white to-pink-50 p-4 text-gray-900 dark:border-gray-700 dark:from-gray-900 dark:via-gray-900 dark:to-primary-950/20 dark:text-white">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-600 dark:text-primary-300">Creator OS money board</p>
          <h2 className="mt-1 text-xl font-bold">Monetization Flow</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-600 dark:text-gray-300">
            Move ideas from concept to filming, posting, money action, and review.
          </p>
        </div>
        <button onClick={onAddIdea} className="rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary-700">Add idea</button>
      </div>
    </div>

    <div className="border-b border-gray-100 bg-gradient-to-r from-primary-50 via-white to-pink-50 p-4 dark:border-gray-700 dark:from-gray-900 dark:via-gray-900 dark:to-primary-950/20">
      <div className="grid gap-3 text-sm md:grid-cols-3">
        <div className="rounded-xl border border-primary-100 bg-white/80 p-3 text-primary-900 shadow-sm dark:border-primary-900/40 dark:bg-gray-800/80 dark:text-primary-100">
          <span className="font-bold">1. Create:</span> save Today&apos;s Move or add an idea.
        </div>
        <div className="rounded-xl border border-amber-100 bg-white/80 p-3 text-amber-900 shadow-sm dark:border-amber-900/40 dark:bg-gray-800/80 dark:text-amber-100">
          <span className="font-bold">2. Publish:</span> send ready ideas to Create Post or My Page.
        </div>
        <div className="rounded-xl border border-emerald-100 bg-white/80 p-3 text-emerald-900 shadow-sm dark:border-emerald-900/40 dark:bg-gray-800/80 dark:text-emerald-100">
          <span className="font-bold">3. Review:</span> mark what made clicks, subs, Treats, or sales.
        </div>
      </div>
    </div>

    <div className="grid items-start gap-4 overflow-x-auto p-5 xl:grid-cols-6">
      {CONTENT_IDEA_STATUSES.map((status) => {
        const list = ideas.filter((idea) => idea.status === status);
        return (
          <div key={status} className="min-w-[240px] rounded-2xl border border-gray-100 bg-gray-50 p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900/50">
            <div className="mb-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-100 dark:bg-gray-800 dark:ring-gray-700">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">{CONTENT_IDEA_STATUS_LABELS[status]}</h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{statusHelp[status]}</p>
                </div>
                <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-bold text-primary-700 dark:bg-primary-900/30 dark:text-primary-200">{list.length}</span>
              </div>
            </div>
            <div className="space-y-3">
              {list.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-300 bg-white/70 p-3 text-xs leading-relaxed text-gray-400 dark:border-gray-700 dark:bg-gray-800/70">
                  No cards yet. Use a card&apos;s move button to send it here.
                </p>
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

