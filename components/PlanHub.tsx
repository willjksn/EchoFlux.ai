import React, { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { useAppContext } from "./AppContext";
import { useTabFromUrl } from "../src/hooks/useTabFromUrl";
import { useCreatorHandle } from "../src/hooks/useCreatorHandle";
import {
  getCreatorOSSettings,
  resolveAmazonAffiliateEnabled,
  resolvePaidMemberHubLabel,
} from "../src/lib/creatorOS";
import { hasEliteAccess } from "../src/utils/planAccess";
import { WhatToPost } from "./WhatToPost";
import { TargetIcon } from "./icons/UIIcons";

const CreatorOSPage = lazy(() => import("../src/pages/CreatorOSPage"));
const Strategy = lazy(() =>
  import("./Strategy").then((m) => ({ default: m.Strategy })),
);

const PLAN_TAB_IDS = ["today", "money-flow", "roadmap"] as const;
type PlanTabId = (typeof PLAN_TAB_IDS)[number];

const PLAN_TAB_LABELS: Record<PlanTabId, string> = {
  today: "Today",
  "money-flow": "Weekly monetization",
  roadmap: "Multi-week strategy",
};

function planTabFromActivePage(activePage: string): PlanTabId {
  if (activePage === "creator-os") return "money-flow";
  return "today";
}

function PanelFallback({ label }: { label: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center p-8 text-sm text-gray-500 dark:text-gray-400">
      <div className="text-center">
        <div
          className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
          aria-hidden
        />
        <span>{label}</span>
      </div>
    </div>
  );
}

/**
 * Unified planning: daily ideas (What to Post), affiliate funnel (Creator OS), multi-week roadmap (Strategy).
 * Replaces separate sidebar entries for What to Post + Creator OS.
 */
export const PlanHub: React.FC = () => {
  const { user, activePage, setActivePage } = useAppContext();
  const creatorHandle = useCreatorHandle(user?.id);
  const paidMemberHubLabel = useMemo(
    () => resolvePaidMemberHubLabel(undefined, creatorHandle),
    [creatorHandle],
  );
  const [showAmazonInPlan, setShowAmazonInPlan] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setShowAmazonInPlan(false);
      return;
    }
    let cancelled = false;
    getCreatorOSSettings(user.id)
      .then((settings) => {
        if (cancelled) return;
        setShowAmazonInPlan(resolveAmazonAffiliateEnabled(settings, creatorHandle));
      })
      .catch(() => {
        if (!cancelled) setShowAmazonInPlan(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, creatorHandle]);

  const weeklyMonetizationHint = useMemo(() => {
    if (showAmazonInPlan) {
      return `optional Amazon and ${paidMemberHubLabel} funnel`;
    }
    return `optional ${paidMemberHubLabel} funnel`;
  }, [showAmazonInPlan, paidMemberHubLabel]);

  const hasRoadmap = hasEliteAccess(user);
  const initialTab = useMemo(() => planTabFromActivePage(activePage), [activePage]);

  const [tab, setTab] = useTabFromUrl("/plan", PLAN_TAB_IDS, initialTab);

  // Deep links that still use activePage creator-os land on Money flow.
  useEffect(() => {
    if (activePage === "creator-os" && tab !== "money-flow") {
      setTab("money-flow");
    }
  }, [activePage, tab, setTab]);

  // Keep activePage on strategy so header + routing stay consistent.
  useEffect(() => {
    if (activePage !== "strategy" && activePage !== "creator-os") return;
    if (typeof window === "undefined") return;
    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    const legacy =
      path === "/what-to-post" ||
      path === "/strategy" ||
      path === "/plan-my-week" ||
      path === "/creator-os";
    if (legacy) {
      window.history.replaceState({}, "", `/plan?tab=${encodeURIComponent(tab)}`);
    }
    if (activePage === "creator-os") {
      setActivePage("strategy");
    }
  }, [activePage, setActivePage, tab]);

  const selectTab = (next: PlanTabId) => {
    if (next === "roadmap" && !hasRoadmap) return;
    setTab(next);
    if (activePage !== "strategy") {
      setActivePage("strategy");
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
              Plan
            </p>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">What to create next</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-2xl">
              One place to plan posts: quick ideas for social and My Page, {weeklyMonetizationHint}, and
              multi-week strategy on Elite.
            </p>
          </div>
        </div>

        <div
          className="flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-gray-50/80 p-1 dark:border-gray-700 dark:bg-gray-800/50"
          role="tablist"
          aria-label="Planning mode"
        >
          {PLAN_TAB_IDS.map((id) => {
            const isRoadmap = id === "roadmap";
            const disabled = isRoadmap && !hasRoadmap;
            const selected = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                disabled={disabled}
                onClick={() => selectTab(id)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  selected
                    ? "bg-white text-primary-700 shadow-sm dark:bg-gray-900 dark:text-primary-300"
                    : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
                } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {PLAN_TAB_LABELS[id]}
                {isRoadmap && !hasRoadmap ? (
                  <span className="ml-1.5 text-[10px] font-semibold uppercase text-primary-600 dark:text-primary-400">
                    Elite
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {tab === "today" && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Trend-powered post ideas for Instagram, Facebook, X, and My Page — send to Create Post or Fan Hub.
          </p>
        )}
        {tab === "money-flow" && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Today&apos;s move, weekly grid
            {showAmazonInPlan ? ", Amazon links," : ","} and {paidMemberHubLabel} — for IG + story + monetization
            funnel.
          </p>
        )}
        {tab === "roadmap" && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Multi-week content strategy with calendar handoff and media on each day.
          </p>
        )}
      </header>

      <div role="tabpanel">
        {tab === "today" && (
          <WhatToPost embedded onOpenAdvanced={() => selectTab("roadmap")} />
        )}

        {tab === "money-flow" && (
          <Suspense fallback={<PanelFallback label="Loading weekly monetization planner…" />}>
            <CreatorOSPage embedded />
          </Suspense>
        )}

        {tab === "roadmap" && hasRoadmap && (
          <Suspense fallback={<PanelFallback label="Loading multi-week strategy…" />}>
            <Strategy onBackToSimple={() => selectTab("today")} embedded />
          </Suspense>
        )}

        {tab === "roadmap" && !hasRoadmap && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center shadow-sm">
            <TargetIcon className="w-10 h-10 mx-auto text-primary-500 mb-3" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Multi-week strategy is Elite</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-md mx-auto">
              Use <strong className="text-gray-700 dark:text-gray-300">Today</strong> for daily ideas on Pro, or upgrade for
              multi-week strategy and calendar planning.
            </p>
            <button
              type="button"
              onClick={() => setActivePage("pricing")}
              className="mt-4 px-5 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700"
            >
              View plans
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
