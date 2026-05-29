import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import { isChatSessionLiveForDmNotify } from "../src/lib/chatSessionLive";

/**
 * Count of non-expired chatSessions for the signed-in creator (active/paused and still within duration).
 * Stale rows left as active in Firestore must not hide Fan Hub message notifications.
 */
export function useCreatorLiveChatSessionsCount(enabled: boolean): number {
  const [uid, setUid] = useState<string | null>(() => auth.currentUser?.uid ?? null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!enabled || !uid) {
      setCount(0);
      return;
    }
    const q = query(collection(db, "chatSessions"), where("creatorId", "==", uid), limit(40));
    const off = onSnapshot(
      q,
      (snap) => {
        const nowMs = Date.now();
        let n = 0;
        snap.forEach((d) => {
          const data = d.data() as {
            status?: string;
            startedAt?: string;
            createdAt?: string;
            durationMinutes?: number;
          };
          if (isChatSessionLiveForDmNotify(data, nowMs)) n += 1;
        });
        setCount(n);
      },
      () => setCount(0),
    );
    return () => off();
  }, [enabled, uid]);

  return count;
}
