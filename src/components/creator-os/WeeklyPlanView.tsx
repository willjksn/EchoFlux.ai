import React, { useMemo } from "react";
import type { WeeklyPlan, WeeklyPlanDayKey } from "../../types/creatorOS";
import { useCreatorOSDisplay } from "./CreatorOSDisplayContext";

type Props = {
  plan: WeeklyPlan | null;
  onChange: (plan: WeeklyPlan) => void;
  onSave: (plan: WeeklyPlan) => void;
  onGenerate: () => void;
};

const days: WeeklyPlanDayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];


const dayFocus: Record<WeeklyPlanDayKey, string> = {
  monday: "Attention starter",
  tuesday: "Story clicks",
  wednesday: "Retention check",
  thursday: "Product angle",
  friday: "Conversation push",
  saturday: "Lifestyle sell",
  sunday: "Review and reset",
};

export const WeeklyPlanView: React.FC<Props> = ({ plan, onChange, onSave, onGenerate }) => {
  const { showAmazonAffiliate, paidMemberHubLabel } = useCreatorOSDisplay();
  const fieldConfig = useMemo(
    () => ({
      publicPost: {
        label: "Public post",
        shortLabel: "Public",
        accent: "from-primary-500 to-pink-500",
        border: "border-primary-100 dark:border-primary-900/40",
        bg: "bg-primary-50/70 dark:bg-primary-950/20",
        helper: "Film and post the attention piece.",
      },
      storyLink: {
        label: showAmazonAffiliate ? "Story / Amazon" : "Story link",
        shortLabel: "Story",
        accent: "from-amber-500 to-orange-500",
        border: "border-amber-100 dark:border-amber-900/40",
        bg: "bg-amber-50/70 dark:bg-amber-950/20",
        helper: showAmazonAffiliate
          ? "Move attention into clicks, replies, or product interest."
          : "Move attention into clicks, replies, or My Page.",
      },
      innerCircleDrop: {
        label: `${paidMemberHubLabel} / Retention`,
        shortLabel: "Members",
        accent: "from-emerald-500 to-teal-500",
        border: "border-emerald-100 dark:border-emerald-900/40",
        bg: "bg-emerald-50/70 dark:bg-emerald-950/20",
        helper: "Give paid members the closer or retention follow-up.",
      },
    }),
    [paidMemberHubLabel, showAmazonAffiliate],
  );

  if (!plan) {
    return (
      <section className="overflow-hidden rounded-2xl border border-primary-100 bg-white shadow-lg dark:border-primary-900/40 dark:bg-gray-800">
        <div className="bg-gradient-to-br from-primary-600 via-primary-500 to-pink-500 p-6 text-white">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/75">Creator OS planner</p>
          <h2 className="mt-2 text-2xl font-bold">Weekly Plan</h2>
          <p className="mt-2 max-w-2xl text-sm text-white/85">
            Generate an editable week that tells you what to post, what to link, and what to drop for paid members.
          </p>
          <button onClick={onGenerate} className="mt-5 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-primary-700 shadow-sm transition hover:bg-primary-50">Plan My Week</button>
        </div>
      </section>
    );
  }

  const updateDay = (day: WeeklyPlanDayKey, field: "publicPost" | "storyLink" | "innerCircleDrop", value: string) => {
    onChange({ ...plan, days: { ...plan.days, [day]: { ...plan.days[day], [field]: value } } });
  };

  const toggle = (day: WeeklyPlanDayKey, field: "publicPost" | "storyLink" | "innerCircleDrop") => {
    onChange({
      ...plan,
      days: {
        ...plan.days,
        [day]: {
          ...plan.days[day],
          completed: { ...plan.days[day].completed, [field]: !plan.days[day].completed[field] },
        },
      },
    });
  };

  const totalActions = days.length * 3;
  const completedActions = days.reduce(
    (count, day) =>
      count +
      Number(plan.days[day].completed.publicPost) +
      Number(plan.days[day].completed.storyLink) +
      Number(plan.days[day].completed.innerCircleDrop),
    0,
  );
  const completionPercent = Math.round((completedActions / totalActions) * 100);

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
      <div className="border-b border-primary-100 bg-gradient-to-r from-primary-50 via-white to-pink-50 p-4 text-gray-900 dark:border-gray-700 dark:from-gray-900 dark:via-gray-900 dark:to-primary-950/20 dark:text-white">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-600 dark:text-primary-300">Creator OS weekly flow</p>
            <h2 className="mt-1 text-xl font-bold">Plan My Week</h2>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-600 dark:text-gray-300">
              Week of {plan.weekStartDate} · {completedActions}/{totalActions} tasks done · {completionPercent}% complete
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={onGenerate} className="rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary-700">Regenerate detailed week</button>
            <button onClick={() => onSave(plan)} className="rounded-xl border border-primary-200 bg-white px-4 py-2.5 text-sm font-bold text-primary-700 transition hover:bg-primary-50 dark:border-primary-900/40 dark:bg-gray-800 dark:text-primary-200 dark:hover:bg-gray-700">Save plan</button>
          </div>
        </div>
      </div>

      <div className="border-b border-gray-100 bg-gradient-to-r from-primary-50 via-white to-pink-50 p-4 dark:border-gray-700 dark:from-gray-900 dark:via-gray-900 dark:to-primary-950/20">
        <div className="grid gap-3 text-sm md:grid-cols-3">
          <div className="rounded-xl border border-primary-100 bg-white/80 p-3 text-primary-900 shadow-sm dark:border-primary-900/40 dark:bg-gray-800/80 dark:text-primary-100">
            <span className="font-bold">1. Public:</span> get attention with one repeatable post.
          </div>
          <div className="rounded-xl border border-amber-100 bg-white/80 p-3 text-amber-900 shadow-sm dark:border-amber-900/40 dark:bg-gray-800/80 dark:text-amber-100">
            <span className="font-bold">2. {showAmazonAffiliate ? "Story/Amazon" : "Story"}:</span> turn views into clicks or replies.
          </div>
          <div className="rounded-xl border border-emerald-100 bg-white/80 p-3 text-emerald-900 shadow-sm dark:border-emerald-900/40 dark:bg-gray-800/80 dark:text-emerald-100">
            <span className="font-bold">3. {paidMemberHubLabel}:</span> convert or retain paid members.
          </div>
        </div>
      </div>

      <div className="grid gap-5 p-5 xl:grid-cols-2">
        {days.map((day) => (
          <div key={day} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm ring-1 ring-gray-50 dark:border-gray-700 dark:bg-gray-900/70 dark:ring-gray-800">
            <div className="border-b border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-primary-600 dark:text-primary-400">{dayFocus[day]}</p>
                  <h3 className="mt-1 text-lg font-bold capitalize text-gray-900 dark:text-white">{day}</h3>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-gray-500 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700">
                  {Number(plan.days[day].completed.publicPost) + Number(plan.days[day].completed.storyLink) + Number(plan.days[day].completed.innerCircleDrop)}/3 done
                </span>
              </div>
            </div>
            {(["publicPost", "storyLink", "innerCircleDrop"] as const).map((field) => (
              <div key={field} className={`border-t border-gray-100 p-4 first:border-t-0 dark:border-gray-800 ${fieldConfig[field].bg}`}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`h-8 w-1.5 rounded-full bg-gradient-to-b ${fieldConfig[field].accent}`} />
                    <div>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{fieldConfig[field].label}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{fieldConfig[field].helper}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggle(day, field)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                      plan.days[day].completed[field]
                        ? "bg-green-600 text-white shadow-sm hover:bg-green-700"
                        : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-gray-700"
                    }`}
                  >
                    {plan.days[day].completed[field] ? `Done: ${fieldConfig[field].shortLabel}` : `Mark ${fieldConfig[field].shortLabel} done`}
                  </button>
                </div>
                <textarea
                  value={plan.days[day][field]}
                  onChange={(e) => updateDay(day, field, e.target.value)}
                  rows={5}
                  className={`mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm font-normal leading-relaxed text-gray-900 shadow-sm outline-none transition focus:ring-2 focus:ring-primary-300 dark:bg-gray-800 dark:text-white ${fieldConfig[field].border}`}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
};

