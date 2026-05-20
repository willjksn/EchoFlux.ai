import React, { useLayoutEffect } from "react";
import { useAppContext } from "./AppContext";

/** Maps retired /studio?tab=… URLs to Fan Hub or Settings. */
function targetForStudioTab(tab: string | null): { path: string; page: "fanHub" | "settings" } {
  if (tab === "persona") {
    return { path: "/settings", page: "settings" };
  }
  if (tab === "dmSession") {
    return { path: "/fan-hub?tab=messages", page: "fanHub" };
  }
  const postsPanel = tab === "drops" ? "drops" : "ideas";
  return { path: `/fan-hub?tab=posts&postsPanel=${postsPanel}`, page: "fanHub" };
}

/**
 * Premium Studio sidebar was removed; legacy bookmarks to /studio still work via redirect.
 */
export const LegacyPremiumStudioRedirect: React.FC = () => {
  const { setActivePage } = useAppContext();

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const { path, page } = targetForStudioTab(params.get("tab"));
    if (page === "settings") {
      try {
        localStorage.setItem("settingsActiveTab", "ai-training");
      } catch {
        /* ignore */
      }
    }
    window.history.replaceState({}, "", path);
    setActivePage(page);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, [setActivePage]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center p-8 text-sm text-gray-500 dark:text-gray-400">
      Redirecting…
    </div>
  );
};
