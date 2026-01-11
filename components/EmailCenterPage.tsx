import React, { useState } from "react";
import { SupportInbox } from "./SupportInbox";
import { EmailOutbox } from "./EmailOutbox";
import { EmailCenter } from "./EmailCenter";

type Tab = "inbox" | "sent" | "failed" | "tools";

export const EmailCenterPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>("inbox");

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Email Center</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Inbox for incoming messages, and folders for sent/failed email activity.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
        <button
          onClick={() => setTab("inbox")}
          className={`px-4 py-2 rounded-md transition-colors ${tab === "inbox" ? "bg-primary-600 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"}`}
        >
          Inbox
        </button>
        <button
          onClick={() => setTab("sent")}
          className={`px-4 py-2 rounded-md transition-colors ${tab === "sent" ? "bg-primary-600 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"}`}
        >
          Sent
        </button>
        <button
          onClick={() => setTab("failed")}
          className={`px-4 py-2 rounded-md transition-colors ${tab === "failed" ? "bg-primary-600 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"}`}
        >
          Failed
        </button>
        <button
          onClick={() => setTab("tools")}
          className={`px-4 py-2 rounded-md transition-colors ${tab === "tools" ? "bg-primary-600 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"}`}
        >
          Tools
        </button>
      </div>

      {tab === "inbox" && <SupportInbox />}
      {tab === "sent" && <EmailOutbox status="sent" />}
      {tab === "failed" && <EmailOutbox status="failed" />}
      {tab === "tools" && <EmailCenter />}
    </div>
  );
};


