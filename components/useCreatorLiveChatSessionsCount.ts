import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";

/**
 * Count of chatSessions for the signed-in creator with status active or paused.
 * Used to badge Fan Hub "Chat Session" tab so live premium sessions are visible without opening Messages.
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
        let n = 0;
        snap.forEach((d) => {
          const st = (d.data() as { status?: string }).status;
          if (st === "active" || st === "paused") n += 1;
        });
        setCount(n);
      },
      () => setCount(0)
    );
    return () => off();
  }, [enabled, uid]);

  return count;
}
