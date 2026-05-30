import type { Firestore } from "firebase-admin/firestore";

export function normalizedFanEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

export function buildFanIdentityDocIdCandidates(
  fanId: string,
  fanEmail: string,
  legacyFanDocId?: string | null,
): string[] {
  const ids: string[] = [fanId];
  if (fanEmail) ids.push(fanEmail);
  if (legacyFanDocId && legacyFanDocId !== fanId) ids.push(legacyFanDocId);
  if (fanEmail && fanId) ids.push(`${fanId}-${fanEmail}`);
  return Array.from(new Set(ids.filter((x) => typeof x === "string" && x.length > 0)));
}

export function normalizeStringArray(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    : [];
}

type GrantUnlockFields = {
  unlockedFanPostIds: string[];
  unlockedProductIds: string[];
  unlockedLiveStreamIds: string[];
};

function mergeGrantUnlockFields(
  ...sources: Array<GrantUnlockFields | undefined>
): GrantUnlockFields {
  const unlockedFanPostIds = new Set<string>();
  const unlockedProductIds = new Set<string>();
  const unlockedLiveStreamIds = new Set<string>();
  for (const src of sources) {
    if (!src) continue;
    for (const id of src.unlockedFanPostIds) unlockedFanPostIds.add(id);
    for (const id of src.unlockedProductIds) unlockedProductIds.add(id);
    for (const id of src.unlockedLiveStreamIds) unlockedLiveStreamIds.add(id);
  }
  return {
    unlockedFanPostIds: [...unlockedFanPostIds],
    unlockedProductIds: [...unlockedProductIds],
    unlockedLiveStreamIds: [...unlockedLiveStreamIds],
  };
}

function grantFieldsFromDoc(data: Record<string, unknown> | undefined): GrantUnlockFields {
  return {
    unlockedFanPostIds: normalizeStringArray(data?.unlockedFanPostIds),
    unlockedProductIds: normalizeStringArray(data?.unlockedProductIds),
    unlockedLiveStreamIds: normalizeStringArray(data?.unlockedLiveStreamIds),
  };
}

function orderPostUnlockIsPaid(status: unknown): boolean {
  const s = typeof status === "string" ? status.trim().toLowerCase() : "";
  return s !== "refunded";
}

/**
 * Read unlock lists from canonical uid grant and legacy grant doc ids (email, compound id).
 * Optionally migrates legacy grant data onto grants/{fanId}.
 */
export async function readFanGrantUnlockFields(
  db: Firestore,
  creatorId: string,
  fanId: string,
  fanEmail: string,
  options?: { migrateToCanonical?: boolean; legacyFanDocId?: string | null },
): Promise<GrantUnlockFields & { migratedFromGrantId?: string }> {
  const grantsCol = db.collection("creatorEntitlements").doc(creatorId).collection("grants");
  const canonicalRef = grantsCol.doc(fanId);
  const canonicalSnap = await canonicalRef.get();
  let merged = grantFieldsFromDoc(
    canonicalSnap.exists ? (canonicalSnap.data() as Record<string, unknown>) : undefined,
  );

  const candidateIds = buildFanIdentityDocIdCandidates(fanId, fanEmail, options?.legacyFanDocId);
  for (const legacyId of candidateIds) {
    if (legacyId === fanId) continue;
    try {
      const legacySnap = await grantsCol.doc(legacyId).get();
      if (!legacySnap.exists) continue;
      const legacyFields = grantFieldsFromDoc(legacySnap.data() as Record<string, unknown>);
      const hasLegacyUnlock =
        legacyFields.unlockedFanPostIds.length > 0 ||
        legacyFields.unlockedProductIds.length > 0 ||
        legacyFields.unlockedLiveStreamIds.length > 0;
      if (!hasLegacyUnlock) continue;

      merged = mergeGrantUnlockFields(merged, legacyFields);
      if (options?.migrateToCanonical !== false) {
        const nowIso = new Date().toISOString();
        await canonicalRef.set(
          {
            ...(legacySnap.data() || {}),
            unlockedFanPostIds: merged.unlockedFanPostIds,
            unlockedProductIds: merged.unlockedProductIds,
            unlockedLiveStreamIds: merged.unlockedLiveStreamIds,
            updatedAt: nowIso,
            migratedFromFanDocId: legacyId,
          },
          { merge: true },
        );
      }
      return { ...merged, migratedFromGrantId: legacyId };
    } catch {
      // Resilient reads for entitlement/media gates.
    }
  }

  return merged;
}

async function healPostUnlockOnCanonicalGrant(
  db: Firestore,
  creatorId: string,
  fanId: string,
  postId: string,
): Promise<void> {
  const grantRef = db.collection("creatorEntitlements").doc(creatorId).collection("grants").doc(fanId);
  const grantSnap = await grantRef.get();
  const existing = grantFieldsFromDoc(
    grantSnap.exists ? (grantSnap.data() as Record<string, unknown>) : undefined,
  );
  if (existing.unlockedFanPostIds.includes(postId)) return;
  await grantRef.set(
    {
      unlockedFanPostIds: [...existing.unlockedFanPostIds, postId],
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

/**
 * Paid post_unlock orders may exist under legacy fanId or fanEmail while the grant doc is email-keyed.
 */
export async function collectPaidPostUnlockIdsFromOrders(
  db: Firestore,
  creatorId: string,
  fanId: string,
  fanEmail: string,
  legacyFanDocId?: string | null,
): Promise<string[]> {
  const found = new Set<string>();
  const fanIdCandidates = buildFanIdentityDocIdCandidates(fanId, fanEmail, legacyFanDocId);

  const considerDocs = (docs: Array<{ data: () => Record<string, unknown> }>) => {
    for (const d of docs) {
      const row = d.data();
      const postId = typeof row.postId === "string" ? row.postId.trim() : "";
      if (!postId) continue;
      if (!orderPostUnlockIsPaid(row.status)) continue;
      found.add(postId);
    }
  };

  for (const candidateFanId of fanIdCandidates) {
    const snap = await db
      .collection("orders")
      .where("creatorId", "==", creatorId)
      .where("fanId", "==", candidateFanId)
      .where("type", "==", "post_unlock")
      .limit(40)
      .get()
      .catch(() => null);
    if (snap) considerDocs(snap.docs);
  }

  if (fanEmail) {
    const byEmail = await db
      .collection("orders")
      .where("creatorId", "==", creatorId)
      .where("fanEmail", "==", fanEmail)
      .where("type", "==", "post_unlock")
      .limit(40)
      .get()
      .catch(() => null);
    if (byEmail) considerDocs(byEmail.docs);
  }

  return [...found];
}

/**
 * Whether the fan has paid to unlock a specific feed post. Mirrors getFanEntitlement legacy grant
 * resolution and order fallbacks; optionally heals grants/{fanId} when an order proves purchase.
 */
export async function fanHasPaidPostUnlock(
  db: Firestore,
  creatorId: string,
  fanId: string,
  fanEmail: string,
  postId: string,
  options?: { healCanonicalGrant?: boolean; legacyFanDocId?: string | null },
): Promise<boolean> {
  const grantFields = await readFanGrantUnlockFields(db, creatorId, fanId, fanEmail, {
    migrateToCanonical: options?.healCanonicalGrant !== false,
    legacyFanDocId: options?.legacyFanDocId,
  });
  if (grantFields.unlockedFanPostIds.includes(postId)) return true;

  const orderPostIds = await collectPaidPostUnlockIdsFromOrders(
    db,
    creatorId,
    fanId,
    fanEmail,
    options?.legacyFanDocId,
  );
  if (!orderPostIds.includes(postId)) return false;

  if (options?.healCanonicalGrant !== false) {
    await healPostUnlockOnCanonicalGrant(db, creatorId, fanId, postId);
  }
  return true;
}
