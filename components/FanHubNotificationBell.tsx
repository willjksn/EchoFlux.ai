import React, { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  doc,
  type Timestamp,
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

export type FanHubNotificationBellProps = {
  /** Member storefront accent (e.g. creator primary). Creator hub can omit for CSS vars. */
  accentColor?: string;
  /** Text/icon color for member header contrast */
  iconColor?: string;
  className?: string;
};

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
};

/**
 * Fan Hub + member storefront: bell + dropdown backed by `users/{uid}/notifications`
 * (written by Admin SDK via `sendFanNotification` in api/_fanNotifications.ts).
 */
export const FanHubNotificationBell: React.FC<FanHubNotificationBellProps> = ({
  accentColor,
  iconColor,
  className = "",
}) => {
  const [uid, setUid] = useState<string | null>(() => auth.currentUser?.uid ?? null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [listenError, setListenError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) {
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
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            title: String(data.title ?? "Notification"),
            body: String(data.body ?? ""),
            read: data.read === true,
            createdAtMs: createdAtMs(data),
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

  const unread = useMemo(() => rows.filter((r) => !r.read).length, [rows]);

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
      await updateDoc(doc(db, "users", uid, "notifications", id), { read: true });
    } catch (e) {
      console.error("markRead", e);
    }
  };

  const markAllRead = async () => {
    if (!uid) return;
    await Promise.all(rows.filter((r) => !r.read).map((r) => markRead(r.id)));
  };

  if (!uid) return null;

  const bellStyle = {
    color: iconColor || "var(--fan-text, #6f4858)",
  } as React.CSSProperties;

  return (
    <div className={`relative ${className}`} ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex items-center justify-center rounded-lg p-2 transition hover:bg-black/5 dark:hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
        style={bellStyle}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        title="Notifications"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 ? (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-0.5 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
            style={{ backgroundColor: accentColor || "var(--fan-primary, #d4558b)" }}
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
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-black/5 dark:border-slate-700">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Notifications</span>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-xs font-medium text-pink-600 dark:text-pink-400 hover:underline"
              >
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {listenError ? (
              <p className="p-3 text-xs text-amber-700 dark:text-amber-300">{listenError}</p>
            ) : rows.length === 0 ? (
              <p className="p-4 text-sm text-gray-500 dark:text-gray-400 text-center">No notifications yet.</p>
            ) : (
              <ul className="divide-y divide-black/5 dark:divide-slate-700">
                {rows.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!r.read) void markRead(r.id);
                      }}
                      className={`w-full text-left px-3 py-2.5 hover:bg-black/[0.03] dark:hover:bg-white/5 ${
                        r.read ? "opacity-80" : "bg-pink-50/50 dark:bg-pink-950/20"
                      }`}
                    >
                      <p className="text-sm font-medium text-gray-900 dark:text-white pr-6">{r.title}</p>
                      {r.body ? (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-3">{r.body}</p>
                      ) : null}
                      {r.createdAtMs ? (
                        <p className="text-[10px] text-gray-400 mt-1">
                          {new Date(r.createdAtMs).toLocaleString()}
                        </p>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
