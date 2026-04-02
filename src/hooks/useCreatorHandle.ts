import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";

/** Loads `handle` from `creators/{creatorId}` for the logged-in creator. */
export function useCreatorHandle(creatorId: string | undefined): string | undefined {
  const [handle, setHandle] = useState<string | undefined>();

  useEffect(() => {
    if (!creatorId || !db) {
      setHandle(undefined);
      return;
    }
    let cancelled = false;
    getDoc(doc(db, "creators", creatorId))
      .then((snap) => {
        if (cancelled || !snap.exists()) return;
        const h = (snap.data() as { handle?: string }).handle;
        setHandle(typeof h === "string" ? h.trim() : undefined);
      })
      .catch(() => {
        if (!cancelled) setHandle(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [creatorId]);

  return handle;
}
