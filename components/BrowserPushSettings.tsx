import React, { useCallback, useEffect, useState } from "react";
import {
  disableWebPush,
  isBrowserPushEnabled,
  isWebPushSupported,
  PUSH_STATE_EVENT,
  registerWebPush,
} from "../src/lib/fanPushNotifications";

type BrowserPushSettingsProps = {
  showToast?: (message: string, type: "success" | "error" | "info") => void;
  /** Creator app Settings vs member storefront Profile */
  variant?: "creator" | "member";
  /** Member hub: creator display name for notification copy */
  creatorDisplayName?: string;
};

export const BrowserPushSettings: React.FC<BrowserPushSettingsProps> = ({
  showToast,
  variant = "creator",
  creatorDisplayName = "",
}) => {
  const isMember = variant === "member";
  const creatorLabel = creatorDisplayName.trim() || "this creator";
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(() => isBrowserPushEnabled());
  const [loading, setLoading] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    typeof Notification !== "undefined" ? Notification.permission : "default",
  );

  const sync = useCallback(() => {
    setEnabled(isBrowserPushEnabled());
    if (typeof Notification !== "undefined") {
      setPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    void isWebPushSupported().then(setSupported);
    sync();
  }, [sync]);

  useEffect(() => {
    window.addEventListener(PUSH_STATE_EVENT, sync);
    return () => window.removeEventListener(PUSH_STATE_EVENT, sync);
  }, [sync]);

  /** Re-check after user changes site notification permission in browser settings. */
  useEffect(() => {
    const onFocus = () => sync();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [sync]);

  const permissionDenied = permission === "denied";

  const handleToggle = async (next: boolean) => {
    if (loading) return;
    if (next && permissionDenied) {
      showToast?.(
        "Notifications are blocked for this site. Allow them in your browser settings, then return here.",
        "error",
      );
      return;
    }
    setLoading(true);
    try {
      if (next) {
        const token = await registerWebPush({ force: true });
        if (token) {
          setEnabled(true);
          showToast?.("Browser notifications enabled", "success");
        } else if (typeof Notification !== "undefined" && Notification.permission === "denied") {
          showToast?.("Notifications blocked in browser settings", "error");
        } else {
          showToast?.("Could not enable browser notifications", "error");
        }
      } else {
        await disableWebPush();
        setEnabled(false);
        showToast?.("Browser notifications disabled", "success");
      }
      sync();
    } catch (e) {
      console.error("[BrowserPushSettings]", e);
      const msg = e instanceof Error ? e.message : "Could not update browser notifications";
      showToast?.(msg, "error");
      sync();
    } finally {
      setLoading(false);
    }
  };

  if (!supported || !import.meta.env.VITE_FIREBASE_VAPID_KEY) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Browser push is not available in this browser or is not configured for this environment.
      </p>
    );
  }

  const enabledHelp = isMember
    ? `You’ll get browser alerts when ${creatorLabel} posts, messages you, or schedules live sessions. Your in-app bell keeps the full history.`
    : "You’ll get browser alerts for Fan Hub activity, account reminders, and admin alerts (when applicable). In-app bells still show your full history.";

  const disabledHelp = isMember
    ? `Enable to receive browser alerts when ${creatorLabel} posts or messages you.`
    : "Enable to receive browser alerts for Fan Hub posts, messages, purchases, and account reminders. You can also enable from the EchoFlux header bell.";

  const statusHelp = permissionDenied
    ? "Notifications are blocked in your browser. Open your browser or device settings, allow notifications for this site, then return here and turn the toggle on."
    : enabled
      ? enabledHelp
      : disabledHelp;

  return (
    <div className="space-y-2">
      <div className={`flex items-center justify-between gap-3 ${loading ? "opacity-60" : ""}`}>
        <span
          className={
            isMember
              ? "font-medium fan-member-about-text m-0"
              : "font-medium text-gray-700 dark:text-gray-300"
          }
        >
          Browser notifications
        </span>
        <button
          type="button"
          disabled={loading || (permissionDenied && !enabled)}
          onClick={() => void handleToggle(!enabled)}
          className={`${
            enabled ? "bg-primary-600" : "bg-gray-200 dark:bg-gray-600"
          } relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50`}
          aria-pressed={enabled}
          title={
            permissionDenied && !enabled
              ? "Allow notifications for this site in browser settings first"
              : undefined
          }
        >
          <span
            className={`${
              enabled ? "translate-x-6" : "translate-x-1"
            } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
          />
        </button>
      </div>
      <p
        className={`text-sm ${
          permissionDenied
            ? isMember
              ? "fan-member-about-text m-0 text-amber-800 dark:text-amber-200"
              : "text-amber-700 dark:text-amber-300"
            : isMember
              ? "fan-member-about-text m-0 opacity-90"
              : "text-gray-500 dark:text-gray-400"
        }`}
      >
        {statusHelp}
      </p>
      {permissionDenied ? (
        <button
          type="button"
          onClick={() => sync()}
          className={`text-xs font-medium underline ${
            isMember ? "fan-member-about-text m-0" : "text-primary-600 dark:text-primary-400"
          }`}
        >
          I updated browser settings — check again
        </button>
      ) : null}
    </div>
  );
};
