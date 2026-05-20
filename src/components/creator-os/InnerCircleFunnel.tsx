import React, { useEffect, useState } from "react";
import type { InnerCircleFunnel as InnerCircleFunnelData } from "../../types/creatorOS";
import { DEFAULT_INNER_CIRCLE_FUNNEL } from "../../lib/creatorOS";
import { useCreatorOSDisplay } from "./CreatorOSDisplayContext";

type Props = {
  funnel: InnerCircleFunnelData | null;
  defaultFunnel?: InnerCircleFunnelData;
  onSave: (funnel: InnerCircleFunnelData) => Promise<void> | void;
};

const funnelFields = [
  {
    key: "welcomeScript",
    title: "Welcome post script",
    label: "Welcome",
    helper: "What new members see first so they feel like joining was worth it.",
    accent: "from-primary-500 to-pink-500",
    bg: "bg-primary-50/70 dark:bg-primary-950/20",
    border: "border-primary-100 dark:border-primary-900/40",
    rows: 8,
  },
  {
    key: "first48HourPlan",
    title: "First 48-hour content plan",
    label: "First 48 hours",
    helper: "Line-by-line actions for the first two days after someone joins.",
    accent: "from-amber-500 to-orange-500",
    bg: "bg-amber-50/70 dark:bg-amber-950/20",
    border: "border-amber-100 dark:border-amber-900/40",
    rows: 6,
  },
  {
    key: "weeklyRetentionPlan",
    title: "Weekly retention plan",
    label: "Retention",
    helper: "Repeatable weekly reasons for members to stay subscribed.",
    accent: "from-emerald-500 to-teal-500",
    bg: "bg-emerald-50/70 dark:bg-emerald-950/20",
    border: "border-emerald-100 dark:border-emerald-900/40",
    rows: 6,
  },
  {
    key: "treatUpsellIdeas",
    title: "Treat upsell ideas",
    label: "Treats",
    helper: "Soft support prompts that fit naturally after engagement.",
    accent: "from-fuchsia-500 to-purple-500",
    bg: "bg-fuchsia-50/70 dark:bg-fuchsia-950/20",
    border: "border-fuchsia-100 dark:border-fuchsia-900/40",
    rows: 5,
  },
] as const;

export const InnerCircleFunnel: React.FC<Props> = ({ funnel, defaultFunnel, onSave }) => {
  const { paidMemberHubLabel } = useCreatorOSDisplay();
  const seedFunnel = defaultFunnel || DEFAULT_INNER_CIRCLE_FUNNEL;
  const [draft, setDraft] = useState<InnerCircleFunnelData>(funnel || seedFunnel);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(funnel || seedFunnel);
  }, [funnel, seedFunnel]);

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
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
      <div className="border-b border-primary-100 bg-gradient-to-r from-primary-50 via-white to-pink-50 p-4 text-gray-900 dark:border-gray-700 dark:from-gray-900 dark:via-gray-900 dark:to-primary-950/20 dark:text-white">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-600 dark:text-primary-300">{paidMemberHubLabel} money flow</p>
            <h2 className="mt-1 text-xl font-bold">{paidMemberHubLabel} funnel</h2>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-600 dark:text-gray-300">
              Turn new subscribers into retained members with a welcome post, first 48-hour plan, weekly rhythm, and Treat prompts.
            </p>
          </div>
          <button onClick={submit} disabled={saving} className="rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-60">
            {saving ? "Saving..." : "Save funnel"}
          </button>
        </div>
      </div>

      <div className="border-b border-gray-100 bg-gradient-to-r from-primary-50 via-white to-pink-50 p-4 dark:border-gray-700 dark:from-gray-900 dark:via-gray-900 dark:to-primary-950/20">
        <div className="grid gap-3 text-sm md:grid-cols-3">
          <div className="rounded-xl border border-primary-100 bg-white/80 p-3 text-primary-900 shadow-sm dark:border-primary-900/40 dark:bg-gray-800/80 dark:text-primary-100">
            <span className="font-bold">1. Welcome:</span> make the first member touchpoint feel premium.
          </div>
          <div className="rounded-xl border border-emerald-100 bg-white/80 p-3 text-emerald-900 shadow-sm dark:border-emerald-900/40 dark:bg-gray-800/80 dark:text-emerald-100">
            <span className="font-bold">2. Retain:</span> give subscribers a weekly reason to stay.
          </div>
          <div className="rounded-xl border border-fuchsia-100 bg-white/80 p-3 text-fuchsia-900 shadow-sm dark:border-fuchsia-900/40 dark:bg-gray-800/80 dark:text-fuchsia-100">
            <span className="font-bold">3. Upsell:</span> use Treats only when it fits the moment.
          </div>
        </div>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-2">
        {funnelFields.map((field) => {
          const value =
            field.key === "welcomeScript"
              ? draft.welcomeScript
              : draft[field.key].join("\n");

          return (
            <label
              key={field.key}
              className={`block rounded-2xl border p-4 shadow-sm ${field.bg} ${field.border} ${
                field.key === "welcomeScript" || field.key === "treatUpsellIdeas" ? "lg:col-span-2" : ""
              }`}
            >
              <div className="mb-2 flex items-start gap-2">
                <span className={`mt-1 h-9 w-1.5 rounded-full bg-gradient-to-b ${field.accent}`} />
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{field.title}</p>
                  <p className="mt-0.5 text-xs font-normal text-gray-500 dark:text-gray-400">{field.helper}</p>
                </div>
              </div>
              <textarea
                value={value}
                onChange={(e) =>
                  field.key === "welcomeScript"
                    ? setDraft({ ...draft, welcomeScript: e.target.value })
                    : updateList(field.key, e.target.value)
                }
                rows={field.rows}
                className={`w-full rounded-xl border bg-white px-3 py-2 text-sm font-normal leading-relaxed text-gray-900 shadow-sm outline-none transition focus:ring-2 focus:ring-primary-300 dark:bg-gray-800 dark:text-white ${field.border}`}
              />
            </label>
          );
        })}
      </div>
    </section>
  );
};

