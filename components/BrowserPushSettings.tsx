import React, { useCallback, useEffect, useState } from "react";
import { auth } from "../firebaseConfig";
import { resolveApiUrl } from "../src/lib/resolveApiUrl";
import {
  disableWebPush,
  isBrowserPushEnabled,
  isWebPushSupported,
  PUSH_STATE_EVENT,
  registerWebPush,
  reinforceWebPushForCurrentUser,
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
  const [serverDeviceCount, setServerDeviceCount] = useState<number | null>(null);

  const refreshServerStatus = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      setServerDeviceCount(null);
      return;
    }
    try {
      const token = await user.getIdToken();
      const res = await fetch(resolveApiUrl("/api/fanPushToken"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setServerDeviceCount(null);
        return;
      }
      const data = (await res.json()) as { deviceCount?: number };
      setServerDeviceCount(typeof data.deviceCount === "number" ? data.deviceCount : null);
    } catch {
      setServerDeviceCount(null);
    }
  }, []);

  const sync = useCallback(() => {
    setEnabled(isBrowserPushEnabled());
    if (typeof Notification !== "undefined") {
      setPermission(Notification.permission);
    }
    void refreshServerStatus();
  }, [refreshServerStatus]);

  useEffect(() => {
    void isWebPushSupported().then(setSupported);
    sync();
  }, [sync]);

  /** Keep server token aligned when browser permission is already granted. */
  useEffect(() => {
    if (permission !== "granted") return;
    void reinforceWebPushForCurrentUser();
  }, [permission]);

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
    : "Browser alerts are separate from the Fan Hub bell. If your bell updates but your phone stays quiet, use Refresh this device below.";

  const disabledHelp = isMember
    ? `Enable to receive browser alerts when ${creatorLabel} posts or messages you.`
    : "Turn on to get phone and desktop alerts for Fan Hub messages, purchases, and sessions. The in-app bell still keeps full history.";

  const statusHelp = permissionDenied
    ? "Notifications are blocked in your browser. Open your browser or device settings, allow notifications for this site, then return here and turn the toggle on."
    : enabled
      ? enabledHelp
      : disabledHelp;

  const serverStatusLine =
    enabled && serverDeviceCount !== null
      ? serverDeviceCount > 0
        ? `This device is registered (${serverDeviceCount} device${serverDeviceCount === 1 ? "" : "s"} on your account).`
        : "Browser permission is on, but this device is not registered yet — turn the toggle off and on to retry."
      : permission === "granted" && !enabled
        ? "Browser permission is on — turn the toggle on to register this device for alerts."
        : null;

  const handleRefreshDevice = async () => {
    if (loading || permissionDenied) return;
    setLoading(true);
    try {
      const token = await registerWebPush({ force: true });
      if (token) {
        showToast?.("This device was re-registered for browser alerts", "success");
      } else {
        showToast?.("Could not refresh push on this device", "error");
      }
      sync();
    } catch (e) {
      console.error("[BrowserPushSettings] refresh", e);
      const msg = e instanceof Error ? e.message : "Could not refresh browser notifications";
      showToast?.(msg, "error");
      sync();
    } finally {
      setLoading(false);
    }
  };

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
      {serverStatusLine ? (
        <p
          className={`text-xs ${
            serverDeviceCount === 0
              ? "text-amber-700 dark:text-amber-300"
              : isMember
                ? "fan-member-about-text m-0 opacity-80"
                : "text-gray-500 dark:text-gray-400"
          }`}
        >
          {serverStatusLine}
        </p>
      ) : null}
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
      ) : enabled && !isMember ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => void handleRefreshDevice()}
          className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh this device"}
        </button>
      ) : null}
    </div>
  );
};
