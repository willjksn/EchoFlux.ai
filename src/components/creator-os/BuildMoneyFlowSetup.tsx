import React, { useEffect, useState } from "react";
import type { ContentLane, CreatorOSSettings } from "../../types/creatorOS";
import { CONTENT_LANE_LABELS, defaultCreatorOSSettings } from "../../lib/creatorOS";

type Props = {
  open: boolean;
  settings: CreatorOSSettings | null;
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

const monetizationPaths = [
  ["amazon_links", "Amazon Influencer links"],
  ["inner_circle_subscriptions", "Inner Circle subscriptions"],
  ["treats", "Treats"],
  ["tips", "Tips"],
  ["brand_deals", "Brand deals"],
  ["none_yet", "None yet"],
] as const;

const filmingDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export const BuildMoneyFlowSetup: React.FC<Props> = ({ open, settings, onClose, onSave }) => {
  const [draft, setDraft] = useState<CreatorOSSettings>(settings || defaultCreatorOSSettings());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(settings || defaultCreatorOSSettings());
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
      await onSave(draft);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-950 dark:text-white">Build My Money Flow</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Answer once. You can edit this anytime.</p>
          </div>
          <button onClick={onClose} className="rounded-full px-3 py-1 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Close</button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Primary goal this week</span>
            <select
              value={draft.primaryGoal}
              onChange={(e) => setDraft({ ...draft, primaryGoal: e.target.value as CreatorOSSettings["primaryGoal"] })}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
            >
              {goals.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>

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
            <div className="mt-2 flex flex-wrap gap-2">
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
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Monetization paths</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {monetizationPaths.map(([value, label]) => (
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

          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Weekly rhythm</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[
                ["weeklyPublicPostsTarget", "Public posts"],
                ["weeklyStoriesTarget", "IG stories"],
                ["weeklyInnerCircleDropsTarget", "Inner Circle drops"],
                ["weeklyAmazonLinksTarget", "Amazon links"],
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

          <label className="block lg:col-span-2">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Brand tone</span>
            <textarea
              value={draft.brandTone}
              onChange={(e) => setDraft({ ...draft, brandTone: e.target.value })}
              rows={3}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700">Cancel</button>
          <button onClick={submit} disabled={saving} className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? "Saving..." : "Save Money Flow"}
          </button>
        </div>
      </div>
    </div>
  );
};

