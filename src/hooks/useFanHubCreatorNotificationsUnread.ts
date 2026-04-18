import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";

function useDmMutedThreadIds(uid: string | null, enabled: boolean): Set<string> {
  const [mutedIds, setMutedIds] = useState(() => new Set<string>());
  useEffect(() => {
    if (!enabled || !uid) {
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
  }, [uid, enabled]);
  return mutedIds;
}

function notificationDataAsStrings(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
    else if (v != null && (typeof v === "number" || typeof v === "boolean")) out[k] = String(v);
  }
  return out;
}

type Row = {
  read: boolean;
  type: string;
  threadId?: string;
};

/**
 * Unread count for `users/{uid}/notifications` with the same rules as {@link FanHubNotificationBell}
 * (muted DM threads excluded). Use for EchoFlux sidebar when the in-app bell is not on screen.
 */
export function useFanHubCreatorNotificationsUnread(enabled: boolean): number {
  const [uid, setUid] = useState<string | null>(() => auth.currentUser?.uid ?? null);
  const [rows, setRows] = useState<Row[]>([]);
  const mutedThreadIds = useDmMutedThreadIds(uid, enabled);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!enabled || !uid) {
      setRows([]);
      return;
    }
    const coll = collection(db, "users", uid, "notifications");
    const q = query(coll, orderBy("createdAt", "desc"), limit(50));
    const off = onSnapshot(
      q,
      (snap) => {
        const next: Row[] = snap.docs.map((d) => {
          const docData = d.data() as Record<string, unknown>;
          const payload = notificationDataAsStrings(docData.data);
          return {
            read: docData.read === true,
            type: String(docData.type ?? ""),
            threadId: payload.threadId?.trim() || undefined,
          };
        });
        setRows(next);
      },
      () => setRows([])
    );
    return () => off();
  }, [uid, enabled]);

  return useMemo(() => {
    return rows.filter((r) => {
      if (r.read) return false;
      if (r.type === "new_message" && r.threadId && mutedThreadIds.has(r.threadId)) return false;
      return true;
    }).length;
  }, [rows, mutedThreadIds]);
}
