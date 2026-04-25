import React from "react";
import type { WeeklyPlan, WeeklyPlanDayKey } from "../../types/creatorOS";

type Props = {
  plan: WeeklyPlan | null;
  onChange: (plan: WeeklyPlan) => void;
  onSave: (plan: WeeklyPlan) => void;
  onGenerate: () => void;
};

const days: WeeklyPlanDayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export const WeeklyPlanView: React.FC<Props> = ({ plan, onChange, onSave, onGenerate }) => {
  if (!plan) {
    return (
      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-md dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Weekly Plan</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Generate an editable week based on your setup.</p>
        <button onClick={onGenerate} className="mt-4 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700">Plan My Week</button>
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

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-md dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Weekly Plan</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Week of {plan.weekStartDate}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onGenerate} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">Regenerate</button>
          <button onClick={() => onSave(plan)} className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-700">Save</button>
        </div>
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-7">
        {days.map((day) => (
          <div key={day} className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
            <h3 className="text-sm font-bold capitalize text-gray-800 dark:text-gray-100">{day}</h3>
            {(["publicPost", "storyLink", "innerCircleDrop"] as const).map((field) => (
              <label key={field} className="mt-3 block text-xs font-semibold text-gray-500 dark:text-gray-400">
                <button
                  type="button"
                  onClick={() => toggle(day, field)}
                  className={`mb-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                    plan.days[day].completed[field]
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                      : "bg-white text-gray-500 ring-1 ring-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700"
                  }`}
                >
                  {plan.days[day].completed[field] ? "Done: " : ""}
                  {field === "publicPost" ? "Public" : field === "storyLink" ? "Story/Amazon" : "Inner Circle"}
                </button>
                <textarea
                  value={plan.days[day][field]}
                  onChange={(e) => updateDay(day, field, e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs font-normal text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </label>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
};

