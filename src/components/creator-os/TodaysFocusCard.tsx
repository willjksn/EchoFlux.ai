import React from "react";

type Props = {
  items: Array<{ id: string; label: string; completed: boolean }>;
  onToggle: (id: string) => void;
};

export const TodaysFocusCard: React.FC<Props> = ({ items, onToggle }) => (
  <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-md dark:border-gray-700 dark:bg-gray-800">
    <p className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Today's focus</p>
    <h2 className="mt-2 text-xl font-bold text-gray-900 dark:text-white">3 things to finish</h2>
    <div className="mt-4 space-y-3">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onToggle(item.id)}
          className={`flex w-full items-center justify-between gap-3 rounded-lg p-3 text-left text-sm font-medium transition-colors ${
            item.completed
              ? "bg-green-50 text-green-700 ring-1 ring-green-200 dark:bg-green-900/20 dark:text-green-300 dark:ring-green-800"
              : "bg-gray-50 text-gray-700 ring-1 ring-gray-100 hover:bg-gray-100 dark:bg-gray-900/60 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-700"
          }`}
        >
          <span>{item.label}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${item.completed ? "bg-green-600 text-white" : "bg-white text-gray-500 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700"}`}>
            {item.completed ? "Done" : "Mark"}
          </span>
        </button>
      ))}
    </div>
  </div>
);

