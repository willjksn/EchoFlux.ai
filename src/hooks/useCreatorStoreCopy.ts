import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import type { CreatorStorefrontSettings } from "../../types";
import { resolveStoreCopy, type ResolvedStoreCopy } from "../lib/storefrontStoreCopy";

/**
 * Loads `creators/{creatorId}.landingContent` store-related strings for creator dashboard (e.g. Treats tab preview).
 */
export function useCreatorStoreCopy(creatorId: string | undefined): ResolvedStoreCopy {
  const [copy, setCopy] = useState<ResolvedStoreCopy>(() => resolveStoreCopy());

  useEffect(() => {
    if (!creatorId || !db) {
      setCopy(resolveStoreCopy());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "creators", creatorId));
        if (cancelled || !snap.exists()) return;
        const data = snap.data() as Partial<CreatorStorefrontSettings>;
        setCopy(resolveStoreCopy(data.landingContent));
      } catch {
        if (!cancelled) setCopy(resolveStoreCopy());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [creatorId]);

  return copy;
}
