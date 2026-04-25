import React, { useState } from "react";

type Props = {
  onOpenSetup: () => void;
  onAddIdea: () => void;
  onPlanWeek: () => void;
  onFindTrends: () => void;
  isFindingTrends?: boolean;
};

export const CreatorOSHeader: React.FC<Props> = ({
  onOpenSetup,
  onAddIdea,
  onPlanWeek,
  onFindTrends,
  isFindingTrends,
}) => {
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  return (
    <>
      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-md dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">Creator OS</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">Creator OS</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-300">Plan what to post, where it goes, and how it makes money.</p>
            <p className="mt-3 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
              Creator OS turns your content, links, and paid community into a simple daily action plan.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={onOpenSetup} className="rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700">
              Build My Money Flow
            </button>
            <button onClick={onAddIdea} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
              Add Content Idea
            </button>
            <button onClick={onPlanWeek} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
              Plan My Week
            </button>
            <button
              onClick={onFindTrends}
              disabled={isFindingTrends}
              className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900"
            >
              {isFindingTrends ? "Finding..." : "Find Product Trends"}
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-primary-100 bg-gradient-to-br from-primary-50 via-white to-pink-50 p-4 shadow-sm ring-1 ring-primary-100/60 dark:border-primary-900/40 dark:from-gray-900 dark:via-gray-900/95 dark:to-primary-950/25 dark:ring-primary-900/20">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-primary-600 dark:text-primary-400">How Creator OS works</p>
              <h2 className="mt-1 text-base font-semibold text-gray-900 dark:text-white">
                One system for ideas, posting, My Page, Amazon links, and Inner Circle.
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowHowItWorks(true)}
              className="shrink-0 text-xs font-medium text-primary-600 underline-offset-2 hover:text-primary-700 hover:underline dark:text-primary-400 dark:hover:text-primary-300"
            >
              How it works
            </button>
          </div>
          <div className="mt-3 grid gap-2 text-[13px] leading-relaxed text-gray-600 dark:text-gray-300 md:grid-cols-3">
            <p><strong className="text-gray-900 dark:text-white">1. Plan:</strong> choose your goal, audience, and content lanes.</p>
            <p><strong className="text-gray-900 dark:text-white">2. Create:</strong> get Today's Move and a weekly content plan.</p>
            <p><strong className="text-gray-900 dark:text-white">3. Publish:</strong> send to Create Post for Instagram or post to My Page.</p>
          </div>
        </div>
      </div>

      {showHowItWorks && (
        <div
          className="fixed inset-0 z-[62] flex items-start justify-center overflow-y-auto bg-black/50 p-4"
          role="presentation"
          onClick={() => setShowHowItWorks(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="creator-os-how-it-works-title"
            className="my-4 flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col rounded-xl border border-primary-100 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-primary-100 bg-gradient-to-r from-primary-50/90 to-white p-4 dark:border-gray-700 dark:from-primary-950/30 dark:to-gray-800">
              <div>
                <h3 id="creator-os-how-it-works-title" className="text-lg font-semibold text-gray-900 dark:text-white">
                  How Creator OS works
                </h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  A simple example of how one idea becomes content, clicks, subscribers, and sales.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowHowItWorks(false)}
                className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                aria-label="Close"
              >
                X
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto p-4 text-sm text-gray-700 dark:text-gray-300">
              <section>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
                  Real scenario
                </h4>
                <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
                  A creator sells Inner Circle memberships, posts on Instagram, shares Amazon products, and has a My Page for fans.
                  Creator OS tells them what to post today and how that post should lead to a click, subscriber, Treat, or sale.
                </p>
              </section>

              <section>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
                  1. Build My Money Flow
                </h4>
                <ul className="list-inside list-disc space-y-1 text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
                  <li>Tell Creator OS your audience, weekly goal, content lanes, posting rhythm, tone, and money paths.</li>
                  <li>Example: lifestyle creator, wants more Inner Circle subscribers, uses Amazon beauty links, posts 5 times a week.</li>
                </ul>
              </section>

              <section>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
                  2. Plan My Week
                </h4>
                <ul className="list-inside list-disc space-y-1 text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
                  <li>Creator OS creates a week where each day has a public post, Story/Amazon link, and Inner Circle drop.</li>
                  <li>This covers the planning job from EchoFlux Plan My Week, but adds the money flow around every post.</li>
                </ul>
              </section>

              <section>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
                  3. Today's Move
                </h4>
                <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
                  Each day, Creator OS gives one clear move. Example: post a morning routine Reel, mention the Amazon mirror in Stories,
                  and drop the full product list inside Inner Circle.
                </p>
              </section>

              <section>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
                  4. Publish
                </h4>
                <ul className="list-inside list-disc space-y-1 text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
                  <li><strong className="text-gray-800 dark:text-gray-200">Send to Create Post</strong> opens Create Post with the caption ready. Add media, then publish or schedule to Instagram.</li>
                  <li><strong className="text-gray-800 dark:text-gray-200">Post to My Page</strong> publishes directly to the creator's Fan Hub/My Page feed.</li>
                </ul>
              </section>

              <section>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
                  5. Review and repeat
                </h4>
                <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
                  Move ideas through Ideas, To Film, Ready to Post, Posted, Monetized, and Review so the creator can see what needs action next.
                </p>
              </section>
            </div>

            <div className="flex justify-end gap-2 rounded-b-xl border-t border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-800/80">
              <button
                type="button"
                onClick={() => setShowHowItWorks(false)}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

