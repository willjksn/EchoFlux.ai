import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
  writeBatch,
  type QuerySnapshot,
  type DocumentData,
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

type NotifPayload = { data?: { creatorId?: string; threadId?: string } };

function countUnreadNewMessages(
  snap: QuerySnapshot<DocumentData>,
  filterCreatorId: string | null,
  mutedThreadIds: Set<string>
): number {
  let c = 0;
  snap.forEach((d) => {
    const raw = d.data() as NotifPayload;
    if (filterCreatorId !== null) {
      if (raw.data?.creatorId === filterCreatorId) c++;
    } else {
      const tid = raw.data?.threadId;
      if (typeof tid === "string" && mutedThreadIds.has(tid)) return;
      c++;
    }
  });
  return c;
}

/**
 * Live count of unread `new_message` rows in `users/{uid}/notifications`
 * (written by `sendFanNotification` from `api/fanDmSend.ts`).
 *
 * For creators (`filterCreatorId === null`), notifications for threads in
 * `users/{uid}/dm_muted_threads` are excluded (mute applies to messages + bell).
 *
 * @param filterCreatorId
 *   - `false` — do not listen (count stays 0).
 *   - `null` — count all unread new_message except muted threads (creator Fan Hub / preview).
 *   - `string` — only notifications whose `data.creatorId` matches (fan on a storefront).
 */
export function useUnreadNewMessageNotificationCount(
  filterCreatorId: string | null | false
): number {
  const [uid, setUid] = useState<string | null>(() => auth.currentUser?.uid ?? null);
  const [count, setCount] = useState(0);
  const mutedThreadIdsRef = useRef<Set<string>>(new Set());
  const lastNotifSnapRef = useRef<QuerySnapshot<DocumentData> | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  /** Creator hub: mirror of muted conversations (server-maintained). */
  useEffect(() => {
    if (filterCreatorId !== null || !uid) {
      mutedThreadIdsRef.current = new Set();
      return;
    }
    const coll = collection(db, "users", uid, "dm_muted_threads");
    const off = onSnapshot(
      coll,
      (snap) => {
        const next = new Set<string>();
        snap.forEach((d) => next.add(d.id));
        mutedThreadIdsRef.current = next;
        const n = lastNotifSnapRef.current;
        if (n) setCount(countUnreadNewMessages(n, null, next));
      },
      (err) => {
        console.warn("dm_muted_threads listener:", err);
        mutedThreadIdsRef.current = new Set();
        const n = lastNotifSnapRef.current;
        if (n) setCount(countUnreadNewMessages(n, null, new Set()));
      }
    );
    return () => off();
  }, [uid, filterCreatorId]);

  useEffect(() => {
    if (filterCreatorId === false || !uid) {
      lastNotifSnapRef.current = null;
      setCount(0);
      return;
    }

    const coll = collection(db, "users", uid, "notifications");
    const q = query(coll, where("read", "==", false), where("type", "==", "new_message"));

    const off = onSnapshot(
      q,
      (snap) => {
        lastNotifSnapRef.current = snap;
        setCount(countUnreadNewMessages(snap, filterCreatorId, mutedThreadIdsRef.current));
      },
      (err) => {
        console.warn("useUnreadNewMessageNotificationCount:", err);
        lastNotifSnapRef.current = null;
        setCount(0);
      }
    );
    return () => off();
  }, [uid, filterCreatorId]);

  return count;
}

/**
 * Mark matching unread new_message notifications as read (clears tab/badge).
 */
export async function clearNewMessageNotificationBadge(
  uid: string,
  filterCreatorId?: string | null
): Promise<void> {
  const coll = collection(db, "users", uid, "notifications");
  const q = query(coll, where("read", "==", false), where("type", "==", "new_message"));
  const snap = await getDocs(q);

  const MAX_BATCH = 400;
  let batch = writeBatch(db);
  let n = 0;

  for (const d of snap.docs) {
    const raw = d.data() as { data?: { creatorId?: string } };
    if (typeof filterCreatorId === "string" && raw.data?.creatorId !== filterCreatorId) {
      continue;
    }
    batch.update(d.ref, { read: true });
    n++;
    if (n >= MAX_BATCH) {
      await batch.commit();
      batch = writeBatch(db);
      n = 0;
    }
  }
  if (n > 0) await batch.commit();
}
