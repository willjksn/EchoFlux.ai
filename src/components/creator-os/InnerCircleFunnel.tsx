import React, { useEffect, useState } from "react";
import type { InnerCircleFunnel as InnerCircleFunnelData } from "../../types/creatorOS";
import { DEFAULT_INNER_CIRCLE_FUNNEL } from "../../lib/creatorOS";

type Props = {
  funnel: InnerCircleFunnelData | null;
  onSave: (funnel: InnerCircleFunnelData) => Promise<void> | void;
};

export const InnerCircleFunnel: React.FC<Props> = ({ funnel, onSave }) => {
  const [draft, setDraft] = useState<InnerCircleFunnelData>(funnel || DEFAULT_INNER_CIRCLE_FUNNEL);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(funnel || DEFAULT_INNER_CIRCLE_FUNNEL);
  }, [funnel]);

  const updateList = (field: "first48HourPlan" | "weeklyRetentionPlan" | "treatUpsellIdeas", value: string) => {
    setDraft({ ...draft, [field]: value.split("\n").map((line) => line.trim()).filter(Boolean) });
  };

  const submit = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-md dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Inner Circle Funnel</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Welcome, first 48 hours, weekly retention, and Treat upsells.</p>
        </div>
        <button onClick={submit} disabled={saving} className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60">
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <label className="text-sm font-semibold lg:col-span-2">
          Welcome post script
          <textarea value={draft.welcomeScript} onChange={(e) => setDraft({ ...draft, welcomeScript: e.target.value })} rows={9} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal dark:border-gray-600 dark:bg-gray-900" />
        </label>
        <label className="text-sm font-semibold">
          First 48-hour content plan
          <textarea value={draft.first48HourPlan.join("\n")} onChange={(e) => updateList("first48HourPlan", e.target.value)} rows={5} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal dark:border-gray-600 dark:bg-gray-900" />
        </label>
        <label className="text-sm font-semibold">
          Weekly retention plan
          <textarea value={draft.weeklyRetentionPlan.join("\n")} onChange={(e) => updateList("weeklyRetentionPlan", e.target.value)} rows={5} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal dark:border-gray-600 dark:bg-gray-900" />
        </label>
        <label className="text-sm font-semibold lg:col-span-2">
          Treat upsell ideas
          <textarea value={draft.treatUpsellIdeas.join("\n")} onChange={(e) => updateList("treatUpsellIdeas", e.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal dark:border-gray-600 dark:bg-gray-900" />
        </label>
      </div>
    </section>
  );
};

