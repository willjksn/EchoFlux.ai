import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Timestamp,
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { resolveApiUrl } from "../src/lib/resolveApiUrl";
import {
  clearPushDeclined,
  isBrowserPushEnabled,
  isWebPushSupported,
  PUSH_STATE_EVENT,
  registerWebPush,
} from "../src/lib/fanPushNotifications";

/** Writes go through Vercel + Admin SDK so client Firestore rules cannot block mark-read / delete. */
async function fanNotificationMutateApi(action: "mark_read" | "delete", notificationIds: string[]): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  if (!notificationIds.length) return;
  const token = await user.getIdToken();
  const res = await fetch(resolveApiUrl("/api/fanNotificationMutate"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, notificationIds }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "Could not update notifications");
  }
}

/** DM thread ids the creator muted (no new_message badge; server mirror). */
function useDmMutedThreadIds(uid: string | null): Set<string> {
  const [mutedIds, setMutedIds] = useState(() => new Set<string>());
  useEffect(() => {
    if (!uid) {
      setMutedIds(new Set());
      return;
    }
    const coll = collection(db, "users", uid, "dm_muted_threads");
    const off = onSnapshot(
      coll,
      (snap) => {
        const next = new Set<string>();
        snap.forEach((d) => next.add(d.id));
        setMutedIds(next);
      },
      () => setMutedIds(new Set())
    );
    return () => off();
  }, [uid]);
  return mutedIds;
}

/** Normalized payload when the user opens a notification (Firestore `data` map + metadata). */
export type FanHubNotificationNavigatePayload = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
};

export type FanHubNotificationBellProps = {
  /** Member storefront accent (e.g. creator primary). Creator hub can omit for CSS vars. */
  accentColor?: string;
  /** Text/icon color for member header contrast */
  iconColor?: string;
  className?: string;
  /**
   * Smaller icon + padding + stroke to align with compact nav chrome (e.g. My Page preview tabs).
   */
  compact?: boolean;
  /** Deep-link: messages thread, purchases, video session, etc. */
  onNavigate?: (payload: FanHubNotificationNavigatePayload) => void;
  /** When true, render nothing (e.g. live premium chat session — DM pings suppressed). */
  hidden?: boolean;
  /** Optional toast when dismiss / clear succeeds or fails (e.g. from `useAppContext` or `useUI`). */
  showToast?: (message: string, type: "success" | "error" | "info") => void;
  /** Member storefront: one-time opt-in banner in the bell dropdown (hidden once enabled). */
  enablePushOptIn?: boolean;
  /** Creator name for member push opt-in copy */
  pushOptInCreatorName?: string;
};

function notificationDataAsStrings(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
    else if (v != null && (typeof v === "number" || typeof v === "boolean")) out[k] = String(v);
  }
  return out;
}

function createdAtMs(data: Record<string, unknown>): number {
  const c = data.createdAt;
  if (c && typeof (c as Timestamp).toMillis === "function") {
    return (c as Timestamp).toMillis();
  }
  if (typeof c === "string" || typeof c === "number") {
    const t = new Date(c).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

type Row = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAtMs: number;
  type: string;
  threadId?: string;
  data: Record<string, string>;
};

/**
 * Fan Hub + member storefront: bell + dropdown backed by `users/{uid}/notifications`
 * (written by Admin SDK via `sendFanNotification` in api/_fanNotifications.ts).
 */
export const FanHubNotificationBell: React.FC<FanHubNotificationBellProps> = ({
  accentColor,
  iconColor,
  className = "",
  compact = false,
  onNavigate,
  hidden = false,
  showToast,
  enablePushOptIn = false,
  pushOptInCreatorName = "",
}) => {
  const [uid, setUid] = useState<string | null>(() => auth.currentUser?.uid ?? null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [listenError, setListenError] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(() => new Set());
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(() => isBrowserPushEnabled());
  const [pushLoading, setPushLoading] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(() =>
    typeof Notification !== "undefined" ? Notification.permission : "default",
  );
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const mutedThreadIds = useDmMutedThreadIds(uid);

  const syncPushState = useCallback(() => {
    setPushEnabled(isBrowserPushEnabled());
    if (typeof Notification !== "undefined") {
      setPushPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    void isWebPushSupported().then(setPushSupported);
    syncPushState();
  }, [uid, syncPushState]);

  useEffect(() => {
    window.addEventListener(PUSH_STATE_EVENT, syncPushState);
    return () => window.removeEventListener(PUSH_STATE_EVENT, syncPushState);
  }, [syncPushState]);

  const showMemberPushOptIn =
    enablePushOptIn &&
    pushSupported &&
    !pushEnabled &&
    pushPermission !== "denied" &&
    !!import.meta.env.VITE_FIREBASE_VAPID_KEY;

  const handleEnableMemberPush = async () => {
    if (pushLoading) return;
    setPushLoading(true);
    clearPushDeclined();
    try {
      const token = await registerWebPush({ force: true });
      if (typeof Notification !== "undefined") setPushPermission(Notification.permission);
      if (token) {
        setPushEnabled(true);
        showToast?.("Push notifications enabled", "success");
      } else if (typeof Notification !== "undefined" && Notification.permission === "denied") {
        showToast?.("Notifications blocked in browser settings", "error");
      } else {
        showToast?.("Could not enable push notifications", "error");
      }
      syncPushState();
    } catch (e) {
      console.error("[FanHubNotificationBell] push opt-in", e);
      const msg = e instanceof Error ? e.message : "Could not enable push notifications";
      showToast?.(msg, "error");
      syncPushState();
    } finally {
      setPushLoading(false);
    }
  };

  const pushOptInCreatorLabel = pushOptInCreatorName.trim() || "this creator";

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid || hidden) {
      setRows([]);
      setListenError(null);
      return;
    }
    const coll = collection(db, "users", uid, "notifications");
    const q = query(coll, orderBy("createdAt", "desc"), limit(50));
    const off = onSnapshot(
      q,
      (snap) => {
        setListenError(null);
        const next: Row[] = snap.docs.map((d) => {
          const docData = d.data() as Record<string, unknown>;
          const payload = notificationDataAsStrings(docData.data);
          return {
            id: d.id,
            title: String(docData.title ?? "Notification"),
            body: String(docData.body ?? ""),
            read: docData.read === true,
            createdAtMs: createdAtMs(docData),
            type: String(docData.type ?? ""),
            threadId: payload.threadId?.trim() || undefined,
            data: payload,
          };
        });
        next.sort((a, b) => b.createdAtMs - a.createdAtMs);
        setRows(next);
      },
      (err) => {
        console.error("[FanHubNotificationBell]", err);
        setListenError(err.message || "Could not load notifications");
        setRows([]);
      }
    );
    return () => off();
  }, [uid]);

  const unread = useMemo(() => {
    return rows.filter((r) => {
      if (r.read) return false;
      if (r.type === "new_message" && r.threadId && mutedThreadIds.has(r.threadId)) return false;
      return true;
    }).length;
  }, [rows, mutedThreadIds]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const markRead = async (id: string) => {
    if (!uid) return;
    try {
      await fanNotificationMutateApi("mark_read", [id]);
    } catch (e) {
      console.error("markRead", e);
    }
  };

  const markAllRead = async () => {
    if (!uid) return;
    const unreadRows = rows.filter((r) => !r.read);
    if (unreadRows.length === 0) return;
    try {
      await fanNotificationMutateApi(
        "mark_read",
        unreadRows.map((r) => r.id)
      );
      showToast?.("Marked all as read", "success");
    } catch (e) {
      console.error("markAllRead", e);
      showToast?.("Could not update notifications", "error");
    }
  };

  const dismissNotification = async (id: string, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!uid) return;
    setDismissingIds((prev) => new Set(prev).add(id));
    try {
      await fanNotificationMutateApi("delete", [id]);
      showToast?.("Notification removed", "success");
    } catch (err) {
      console.error("dismissNotification", err);
      showToast?.("Could not clear notification", "error");
    } finally {
      setDismissingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const clearAllNotifications = async () => {
    if (!uid || rows.length === 0 || clearingAll) return;
    if (
      !window.confirm(
        `Remove all ${rows.length} notification${rows.length === 1 ? "" : "s"} from this list? This cannot be undone.`
      )
    ) {
      return;
    }
    setClearingAll(true);
    try {
      await fanNotificationMutateApi(
        "delete",
        rows.map((r) => r.id)
      );
      showToast?.("All notifications cleared", "success");
    } catch (e) {
      console.error("clearAllNotifications", e);
      showToast?.("Could not clear all notifications", "error");
    } finally {
      setClearingAll(false);
    }
  };

  const clearReadNotifications = async () => {
    const readRows = rows.filter((r) => r.read);
    if (!uid || readRows.length === 0 || clearingAll) return;
    if (
      !window.confirm(
        `Clear ${readRows.length} read notification${readRows.length === 1 ? "" : "s"}? Unread items stay in the list.`
      )
    ) {
      return;
    }
    setClearingAll(true);
    try {
      await fanNotificationMutateApi(
        "delete",
        readRows.map((r) => r.id)
      );
      showToast?.("Read notifications cleared", "success");
    } catch (e) {
      console.error("clearReadNotifications", e);
      showToast?.("Could not clear read notifications", "error");
    } finally {
      setClearingAll(false);
    }
  };

  if (!uid || hidden) return null;

  const bellStyle = {
    color: iconColor || "var(--fan-text, #6f4858)",
  } as React.CSSProperties;

  const btnPad = compact ? "p-1.5" : "p-2";
  const iconClass = compact ? "h-4 w-4" : "h-5 w-5";
  const strokeW = compact ? 1.5 : 2;
  const ringClass = compact
    ? "focus-visible:ring-1 focus-visible:ring-offset-0"
    : "focus-visible:ring-2 focus-visible:ring-offset-1";

  return (
    <div className={`relative ${className}`} ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative inline-flex items-center justify-center rounded-lg ${btnPad} transition hover:bg-black/5 dark:hover:bg-white/10 focus:outline-none focus-visible:ring-primary-500/40 dark:focus-visible:ring-primary-400/50 ${ringClass}`}
        style={bellStyle}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        title="Notifications"
      >
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeW} aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 ? (
          <span
            className={`absolute rounded-full font-bold text-white flex items-center justify-center ${
              compact
                ? "-top-0.5 -right-0.5 min-w-[0.95rem] h-[0.95rem] px-[2px] text-[9px] leading-none"
                : "-top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-0.5 text-[10px]"
            }`}
            style={{ backgroundColor: accentColor || "var(--fan-primary, #6366f1)" }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute right-0 mt-2 w-[min(100vw-1.5rem,20rem)] rounded-xl border border-black/10 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-lg z-[200] overflow-hidden"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-black/5 dark:border-slate-700">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Notifications</span>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {unread > 0 ? (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  disabled={clearingAll}
                  className="text-xs font-medium text-pink-600 dark:text-pink-400 hover:underline disabled:opacity-50"
                >
                  Mark all read
                </button>
              ) : null}
              {rows.some((r) => r.read) ? (
                <button
                  type="button"
                  onClick={() => void clearReadNotifications()}
                  disabled={clearingAll}
                  className="text-xs font-medium rounded-md border border-gray-200 dark:border-slate-600 px-2 py-1 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  {clearingAll ? "Clearing…" : "Clear read"}
                </button>
              ) : null}
              {rows.length > 0 ? (
                <button
                  type="button"
                  onClick={() => void clearAllNotifications()}
                  disabled={clearingAll}
                  className="text-xs font-medium rounded-md border border-gray-200 dark:border-slate-600 px-2 py-1 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  {clearingAll ? "Clearing…" : "Clear all"}
                </button>
              ) : null}
            </div>
          </div>
          {showMemberPushOptIn ? (
            <div
              className="px-3 py-2 border-b border-black/5 dark:border-slate-700"
              style={{
                backgroundColor: accentColor
                  ? `color-mix(in srgb, ${accentColor} 12%, white)`
                  : "color-mix(in srgb, var(--fan-primary, #6366f1) 12%, white)",
              }}
            >
              <p className="text-xs text-gray-700 dark:text-gray-300 mb-2">
                Get browser alerts when {pushOptInCreatorLabel} posts, messages you, or schedules
                live sessions. Manage anytime in Profile.
              </p>
              <button
                type="button"
                onClick={() => void handleEnableMemberPush()}
                disabled={pushLoading}
                className="w-full text-xs font-semibold rounded-lg px-3 py-2 text-white disabled:opacity-60"
                style={{ backgroundColor: accentColor || "var(--fan-primary, #6366f1)" }}
              >
                {pushLoading ? "Enabling…" : "Enable notifications"}
              </button>
            </div>
          ) : null}
          <div className="max-h-80 overflow-y-auto">
            {listenError ? (
              <p className="p-3 text-xs text-amber-700 dark:text-amber-300">{listenError}</p>
            ) : rows.length === 0 ? (
              <p className="p-4 text-sm text-gray-500 dark:text-gray-400 text-center">No notifications yet.</p>
            ) : (
              <ul className="divide-y divide-black/5 dark:divide-slate-700">
                {rows.map((r) => {
                  const mutedDm =
                    r.type === "new_message" &&
                    r.threadId &&
                    mutedThreadIds.has(r.threadId);
                  const dismissing = dismissingIds.has(r.id);
                  return (
                    <li key={r.id} className="flex items-stretch gap-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (!r.read) void markRead(r.id);
                          setOpen(false);
                          onNavigate?.({
                            id: r.id,
                            type: r.type,
                            title: r.title,
                            body: r.body,
                            data: r.data,
                          });
                        }}
                        className={`min-w-0 flex-1 text-left px-3 py-2.5 hover:bg-black/[0.03] dark:hover:bg-white/5 ${
                          r.read
                            ? "opacity-80"
                            : mutedDm
                              ? "opacity-70 bg-gray-50/80 dark:bg-slate-800/50"
                              : "bg-pink-50/50 dark:bg-pink-950/20"
                        }`}
                      >
                        <p className="text-sm font-medium text-gray-900 dark:text-white pr-1 flex items-center gap-2 flex-wrap">
                          {r.title}
                          {mutedDm ? (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                              Muted
                            </span>
                          ) : null}
                        </p>
                        {r.body ? (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-3">{r.body}</p>
                        ) : null}
                        {r.createdAtMs ? (
                          <p className="text-[10px] text-gray-400 mt-1">
                            {new Date(r.createdAtMs).toLocaleString()}
                          </p>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        aria-label={`Dismiss: ${r.title}`}
                        title="Dismiss"
                        disabled={dismissing || clearingAll}
                        onClick={(e) => void dismissNotification(r.id, e)}
                        className="shrink-0 px-2.5 text-gray-400 hover:text-gray-700 hover:bg-black/[0.04] dark:hover:bg-white/10 dark:hover:text-gray-200 disabled:opacity-40 border-l border-black/5 dark:border-slate-700"
                      >
                        {dismissing ? (
                          <span className="text-[10px] font-medium">…</span>
                        ) : (
                          <svg className="w-4 h-4 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                          </svg>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
