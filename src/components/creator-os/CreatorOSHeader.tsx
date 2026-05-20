import React, { useState } from "react";
import { EchoFluxHowItWorksModal } from "../../../components/EchoFluxHowItWorksModal";

type Props = {
  onOpenSetup: () => void;
  onAddIdea: () => void;
  onPlanWeek: () => void;
  onFindTrends: () => void;
  isFindingTrends?: boolean;
  /** Toolbar only — for Plan hub Money flow tab. */
  compact?: boolean;
  showAmazonAffiliate?: boolean;
};

export const CreatorOSHeader: React.FC<Props> = ({
  onOpenSetup,
  onAddIdea,
  onPlanWeek,
  onFindTrends,
  isFindingTrends,
  compact = false,
  showAmazonAffiliate = true,
}) => {
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  const howItWorksButton = (
    <button
      type="button"
      onClick={() => setShowHowItWorks(true)}
      className="text-xs font-medium text-primary-600 underline-offset-2 hover:text-primary-700 hover:underline dark:text-primary-400 dark:hover:text-primary-300 px-3 py-2"
    >
      How it works
    </button>
  );

  const actionButtons = (
    <>
      <button onClick={onOpenSetup} className="rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700">
        Build My Money Flow
      </button>
      <button onClick={onAddIdea} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
        Add Content Idea
      </button>
      <button onClick={onPlanWeek} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
        Plan My Week
      </button>
      {showAmazonAffiliate ? (
        <button
          onClick={onFindTrends}
          disabled={isFindingTrends}
          className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900"
        >
          {isFindingTrends ? "Finding..." : "Find Product Trends"}
        </button>
      ) : null}
    </>
  );

  return (
    <>
      {compact ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {howItWorksButton}
          {actionButtons}
        </div>
      ) : (
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
            <div className="flex flex-wrap gap-2">{actionButtons}</div>
          </div>

          <div className="mt-6 rounded-xl border border-primary-100 bg-gradient-to-br from-primary-50 via-white to-pink-50 p-4 shadow-sm ring-1 ring-primary-100/60 dark:border-primary-900/40 dark:from-gray-900 dark:via-gray-900/95 dark:to-primary-950/25 dark:ring-primary-900/20">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-primary-600 dark:text-primary-400">How Creator OS works</p>
                <h2 className="mt-1 text-base font-semibold text-gray-900 dark:text-white">
                  One system for ideas, posting, My Page, Amazon links, and Inner Circle.
                </h2>
              </div>
              <span className="shrink-0">{howItWorksButton}</span>
            </div>
            <div className="mt-3 grid gap-2 text-[13px] leading-relaxed text-gray-600 dark:text-gray-300 md:grid-cols-3">
              <p><strong className="text-gray-900 dark:text-white">1. Plan:</strong> choose your goal, audience, and content lanes.</p>
              <p><strong className="text-gray-900 dark:text-white">2. Create:</strong> get Today&apos;s Move and a weekly content plan.</p>
              <p><strong className="text-gray-900 dark:text-white">3. Publish:</strong> send to Create Post for Instagram or post to My Page.</p>
            </div>
          </div>
        </div>
      )}

      <EchoFluxHowItWorksModal
        open={showHowItWorks}
        onClose={() => setShowHowItWorks(false)}
        ariaTitleId="creator-os-how-it-works-title"
        title={compact ? "How Weekly monetization works" : "How Creator OS works"}
        subtitle="A simple example of how one idea becomes content, clicks, subscribers, and sales."
      >
        <section>
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
            Real scenario
          </h4>
          <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
            A creator runs a paid member hub, posts on Instagram, may share affiliate products, and publishes on My Page. Weekly
            monetization tells them what to post today and how that post should lead to a click, subscriber, treat, or sale.
          </p>
        </section>

        <section>
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
            1. Build My Money Flow
          </h4>
          <ul className="list-inside list-disc space-y-1 text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
            <li>Set your audience, weekly goal, content lanes, posting rhythm, tone, and monetization paths.</li>
            <li>Example: lifestyle creator, wants more paid members, optional Amazon links, posts five times a week.</li>
          </ul>
        </section>

        <section>
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
            2. Plan My Week
          </h4>
          <ul className="list-inside list-disc space-y-1 text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
            <li>Get a week where each day maps public posts, story/affiliate touchpoints, and member-only drops.</li>
            <li>Pairs with Plan → Today for daily social ideas and Plan → Multi-week strategy for long-range roadmaps.</li>
          </ul>
        </section>

        <section>
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
            3. Today&apos;s Move
          </h4>
          <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
            Each day you get one clear move—for example a Reel, a story CTA, and a closer drop for paying members.
          </p>
        </section>

        <section>
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
            4. Publish
          </h4>
          <ul className="list-inside list-disc space-y-1 text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
            <li>
              <strong className="text-gray-800 dark:text-gray-200">Send to Create Post</strong> opens Create Post with the caption ready
              for Instagram scheduling.
            </li>
            <li>
              <strong className="text-gray-800 dark:text-gray-200">Post to My Page</strong> publishes directly to Fan Hub.
            </li>
          </ul>
        </section>

        <section>
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
            5. Review and repeat
          </h4>
          <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
            Track ideas through Ideas, To Film, Ready to Post, Posted, Monetized, and Review so you always know the next action.
          </p>
        </section>
      </EchoFluxHowItWorksModal>
    </>
  );
};
