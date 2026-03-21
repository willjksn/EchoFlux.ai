import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

/**
 * Live count of unread `new_message` rows in `users/{uid}/notifications`
 * (written by `sendFanNotification` from `api/fanDmSend.ts`).
 *
 * @param filterCreatorId
 *   - `false` — do not listen (count stays 0).
 *   - `null` — count all unread new_message (creator Fan Hub / preview).
 *   - `string` — only notifications whose `data.creatorId` matches (fan on a storefront).
 */
export function useUnreadNewMessageNotificationCount(
  filterCreatorId: string | null | false
): number {
  const [uid, setUid] = useState<string | null>(() => auth.currentUser?.uid ?? null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (filterCreatorId === false || !uid) {
      setCount(0);
      return;
    }

    const coll = collection(db, "users", uid, "notifications");
    const q = query(coll, where("read", "==", false), where("type", "==", "new_message"));

    const off = onSnapshot(
      q,
      (snap) => {
        let c = 0;
        snap.forEach((d) => {
          const raw = d.data() as { data?: { creatorId?: string } };
          if (filterCreatorId !== null) {
            if (raw.data?.creatorId === filterCreatorId) c++;
          } else {
            c++;
          }
        });
        setCount(c);
      },
      (err) => {
        console.warn("useUnreadNewMessageNotificationCount:", err);
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
