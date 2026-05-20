import React, { useEffect, useState } from "react";
import type { ContentLane, CreatorOSSettings } from "../../types/creatorOS";
import { CONTENT_LANE_LABELS, defaultCreatorOSSettings } from "../../lib/creatorOS";

type Props = {
  open: boolean;
  settings: CreatorOSSettings | null;
  showAmazonAffiliate?: boolean;
  paidMemberHubLabel?: string;
  onClose: () => void;
  onSave: (settings: CreatorOSSettings) => Promise<void> | void;
};

const goals = [
  ["grow_attention", "Grow attention"],
  ["story_clicks", "Get more story clicks"],
  ["inner_circle_subscribers", "Drive Inner Circle subscribers"],
  ["retain_subscribers", "Retain subscribers"],
  ["test_amazon_products", "Test Amazon products"],
  ["sell_treats", "Sell Treats"],
] as const;

const goalPlans: Record<(typeof goals)[number][0], { outcome: string; weeklyPlan: string; nextAction: string }> = {
  grow_attention: {
    outcome: "More public reach and more reasons for new people to stop scrolling.",
    weeklyPlan: "Creator OS will prioritize public posts, curiosity hooks, and easy-to-film attention clips.",
    nextAction: "After saving, Today's Move will tell you the exact public post to make first.",
  },
  story_clicks: {
    outcome: "More fans clicking from public attention into Stories, links, and My Page.",
    weeklyPlan: "Creator OS will connect public posts to Story prompts, soft links, and follow-up actions.",
    nextAction: "After saving, Plan My Week will include the Story link angle for each content day.",
  },
  inner_circle_subscribers: {
    outcome: "More people moving from casual viewer to paid Inner Circle subscriber.",
    weeklyPlan: "Creator OS will pair public teasers with closer Inner Circle drops and conversion captions.",
    nextAction: "After saving, Today's Move will include what to post publicly and what to drop inside Inner Circle.",
  },
  retain_subscribers: {
    outcome: "More paid members staying active because they know what they get next.",
    weeklyPlan: "Creator OS will focus on consistent member drops, retention prompts, and review moments.",
    nextAction: "After saving, Plan My Week will give you a steady member content rhythm.",
  },
  test_amazon_products: {
    outcome: "Find which Amazon products your audience actually cares about before pushing harder.",
    weeklyPlan: "Creator OS will build soft product mentions, Story questions, and Inner Circle tie-ins.",
    nextAction: "After saving, Today's Move will suggest a product category and how to mention it naturally.",
  },
  sell_treats: {
    outcome: "Turn attention and conversations into Treat sales without making every post feel salesy.",
    weeklyPlan: "Creator OS will plan public hooks, fan intent prompts, and Treat upsell moments.",
    nextAction: "After saving, Today's Move will show the post and CTA that leads toward a Treat.",
  },
};

const fullFunnelPlan = {
  title: "Full weekly money flow",
  weeklyPlan:
    "Every week, Creator OS plans the whole path: get attention, push Story clicks, drive Inner Circle, retain subscribers, test Amazon interest, and create Treat sales moments.",
  nextAction:
    "After saving, Today's Move and Plan My Week will show the exact public post, Story link, Inner Circle drop, Amazon angle, and money action to take next.",
};

const monetizationPaths = [
  ["amazon_links", "Amazon Influencer links"],
  ["inner_circle_subscriptions", "Inner Circle subscriptions"],
  ["treats", "Treats"],
  ["tips", "Tips"],
  ["brand_deals", "Brand deals"],
  ["none_yet", "None yet"],
] as const;

const filmingDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export const BuildMoneyFlowSetup: React.FC<Props> = ({
  open,
  settings,
  showAmazonAffiliate = true,
  paidMemberHubLabel = "Paid members",
  onClose,
  onSave,
}) => {
  const [draft, setDraft] = useState<CreatorOSSettings>(settings || defaultCreatorOSSettings());
  const [saving, setSaving] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (open) {
      setDraft(settings || defaultCreatorOSSettings());
      setActiveStep(0);
    }
  }, [open, settings]);

  if (!open) return null;

  const toggle = (field: "preferredLanes" | "monetizationPaths" | "filmingDays" | "mainMonetization", value: string) => {
    setDraft((prev) => {
      const current = prev[field] as string[];
      return {
        ...prev,
        [field]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
      };
    });
  };

  const submit = async () => {
    setSaving(true);
    try {
      await onSave({ ...defaultCreatorOSSettings(), ...draft });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    { title: "Goal", description: "Creator OS uses the full weekly funnel every week, not just one goal." },
    { title: "Content", description: "Choose the lanes and audience Creator OS should plan around." },
    { title: "Money", description: "Tell Creator OS where attention should turn into clicks, subscribers, tips, or sales." },
    { title: "Rhythm", description: "Set a realistic weekly cadence so the plan matches your time." },
    { title: "Review", description: "Confirm the flow, then save to generate Today's Move and Plan My Week." },
  ];

  const selectedLaneLabels = draft.preferredLanes.map((lane) => CONTENT_LANE_LABELS[lane]).join(", ") || "No lanes selected yet";
  const selectedMoneyPaths = draft.monetizationPaths
    .map((path) => monetizationPaths.find(([value]) => value === path)?.[1] || path)
    .join(", ") || "No money paths selected yet";
  const selectedFilmingDays = draft.filmingDays.map((day) => day.slice(0, 3)).join(", ") || "No filming days selected yet";
  const canGoBack = activeStep > 0;
  const canGoNext = activeStep < steps.length - 1;
  const renderActiveStepContent = () => (
    <div className="mt-5">
      {activeStep === 0 && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-white p-4 text-sm text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300">
            <strong className="text-slate-900 dark:text-white">What this means:</strong> this is not a single-choice goal. Creator OS plans the whole weekly funnel so every piece of content has a job.
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Weekly goal flow</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              These are all active every week. The plan tells you how to move attention into clicks, subscribers, products, Treats, and retention.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {goals.map(([value, label], index) => (
                <div
                  key={value}
                  className="rounded-2xl border border-primary-100 bg-white p-4 text-left shadow-sm dark:border-primary-900/40 dark:bg-slate-900"
                >
                  <span className="text-xs font-bold uppercase tracking-wide text-primary-600 dark:text-primary-400">
                    {index + 1}. Always included
                  </span>
                  <span className="mt-1 block text-sm font-semibold text-slate-900 dark:text-white">{label}</span>
                  <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{goalPlans[value].outcome}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-primary-100 bg-white p-4 shadow-sm dark:border-primary-900/50 dark:bg-slate-900">
            <p className="text-xs font-bold uppercase tracking-wide text-primary-600 dark:text-primary-400">
              {fullFunnelPlan.title}
            </p>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{fullFunnelPlan.weeklyPlan}</p>
            <p className="mt-2 text-sm font-medium text-slate-900 dark:text-white">{fullFunnelPlan.nextAction}</p>
          </div>
        </div>
      )}

      {activeStep === 1 && (
        <div className="space-y-5">
          <div className="rounded-2xl bg-white p-4 text-sm text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300">
            <strong className="text-slate-900 dark:text-white">What to do:</strong> pick who you are posting for and the content lanes you can actually make. These lanes become your daily post ideas.
          </div>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Primary audience</span>
            <select
              value={draft.primaryAudience}
              onChange={(e) => setDraft({ ...draft, primaryAudience: e.target.value as CreatorOSSettings["primaryAudience"] })}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="mostly_men">Mostly men</option>
              <option value="mostly_women">Mostly women</option>
              <option value="mixed">Mixed audience</option>
            </select>
          </label>
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Content lanes</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Choose 2-4 lanes you can repeat weekly.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(Object.keys(CONTENT_LANE_LABELS) as ContentLane[]).map((lane) => (
                <button
                  key={lane}
                  type="button"
                  onClick={() => toggle("preferredLanes", lane)}
                  className={`rounded-full border px-3 py-1 text-sm ${draft.preferredLanes.includes(lane) ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-200" : "border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}
                >
                  {CONTENT_LANE_LABELS[lane]}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Brand tone</span>
            <textarea
              value={draft.brandTone}
              onChange={(e) => setDraft({ ...draft, brandTone: e.target.value })}
              rows={3}
              placeholder="Example: playful, confident, flirty, direct, casual"
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
        </div>
      )}

      {activeStep === 2 && (
        <div className="space-y-5">
          <div className="rounded-2xl bg-white p-4 text-sm text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300">
            <strong className="text-slate-900 dark:text-white">What to do:</strong> select every way this content can make money. Creator OS will connect public posts to Stories
            {showAmazonAffiliate ? ", Amazon links" : ""}, {paidMemberHubLabel}, Treats, and retention.
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Monetization paths</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {monetizationPaths
                .filter(([value]) => showAmazonAffiliate || value !== "amazon_links")
                .map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggle("monetizationPaths", value)}
                  className={`rounded-full border px-3 py-1 text-sm ${draft.monetizationPaths.includes(value) ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200" : "border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeStep === 3 && (
        <div className="space-y-5">
          <div className="rounded-2xl bg-white p-4 text-sm text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300">
            <strong className="text-slate-900 dark:text-white">What to do:</strong> set numbers you can really hit. Creator OS will use this to build a weekly plan that is realistic, not overwhelming.
          </div>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Time to create</span>
            <select
              value={draft.availableTime}
              onChange={(e) => setDraft({ ...draft, availableTime: e.target.value as CreatorOSSettings["availableTime"] })}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="5_minutes">5 minutes</option>
              <option value="15_minutes">15 minutes</option>
              <option value="30_plus">30+ minutes</option>
              <option value="batch_film">I batch film</option>
            </select>
          </label>
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Weekly rhythm</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[
                ["weeklyPublicPostsTarget", "Public posts"],
                ["weeklyStoriesTarget", "IG stories"],
                ["weeklyInnerCircleDropsTarget", `${paidMemberHubLabel} drops`],
                ...(showAmazonAffiliate ? ([["weeklyAmazonLinksTarget", "Amazon links"]] as const) : []),
              ].map(([key, label]) => (
                <label key={key} className="text-xs text-slate-500 dark:text-slate-400">
                  {label}
                  <input
                    type="number"
                    min={0}
                    value={Number(draft[key as keyof CreatorOSSettings] || 0)}
                    onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Filming days</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {filmingDays.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggle("filmingDays", day)}
                  className={`rounded-full border px-3 py-1 text-sm capitalize ${draft.filmingDays.includes(day) ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-950" : "border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeStep === 4 && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-white p-4 text-sm text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300">
            <strong className="text-slate-900 dark:text-white">What happens after save:</strong> Creator OS creates a fresh Today's Move and an editable weekly plan. Then use Send to Create Post for Instagram or Post to My Page for Fan Hub.
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Goal</p>
              <p className="mt-1 font-semibold text-slate-900 dark:text-white">{fullFunnelPlan.title}</p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{fullFunnelPlan.weeklyPlan}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Content lanes</p>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{selectedLaneLabels}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Money paths</p>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{selectedMoneyPaths}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Rhythm</p>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                {draft.weeklyPublicPostsTarget} public, {draft.weeklyStoriesTarget} stories, {draft.weeklyInnerCircleDropsTarget} {paidMemberHubLabel}
                {showAmazonAffiliate ? `, ${draft.weeklyAmazonLinksTarget} Amazon` : ""}. Film: {selectedFilmingDays}.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-6 dark:border-slate-800">
          <div>
            <h2 className="text-2xl font-bold text-slate-950 dark:text-white">Build My Money Flow</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Follow these 5 steps once. Creator OS will turn your answers into Today's Move, Plan My Week, and publishing actions.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-1 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Close</button>
        </div>

        <div className="overflow-y-auto p-6">
          <div>
            <div className="space-y-3">
              {steps.map((step, index) => {
                const isOpen = activeStep === index;
                return (
                  <div key={step.title} className="rounded-3xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/50">
                    <button
                      type="button"
                      onClick={() => setActiveStep(index)}
                      className={`w-full rounded-3xl p-4 text-left transition ${
                        isOpen
                          ? "bg-primary-50 text-primary-800 dark:bg-primary-950/40 dark:text-primary-100"
                          : "text-slate-700 dark:text-slate-200"
                      }`}
                      aria-expanded={isOpen}
                    >
                      <span className="text-xs font-bold uppercase tracking-wide">Step {index + 1}</span>
                      <span className="mt-1 block text-sm font-semibold">{step.title}</span>
                      <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{step.description}</span>
                    </button>
                    {isOpen && (
                      <div className="border-t border-slate-200 p-4 dark:border-slate-800">
                        {renderActiveStepContent()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 p-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400 sm:max-w-sm">
            Tip: Save closes this popup and refreshes Today's Move automatically.
          </p>
          <div className="grid grid-cols-3 gap-2 sm:flex">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700 sm:px-4">Cancel</button>
            <button
              type="button"
              onClick={() => setActiveStep((step) => Math.max(0, step - 1))}
              disabled={!canGoBack || saving}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-40 dark:border-slate-700 sm:px-4"
            >
              Back
            </button>
            {canGoNext ? (
              <button
                type="button"
                onClick={() => setActiveStep((step) => Math.min(steps.length - 1, step + 1))}
                disabled={saving}
                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-slate-950 sm:px-4"
              >
                Next Step
              </button>
            ) : (
              <button type="button" onClick={submit} disabled={saving} className="rounded-xl bg-primary-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:px-4">
                {saving ? "Saving..." : "Save Money Flow"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

