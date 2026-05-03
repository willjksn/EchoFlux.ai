import type { Firestore } from "firebase-admin/firestore";

/** Avoid showing stale Firebase-auth placeholders as the creator face in admin tables. */
export function isPlaceholderAdminCreatorDisplay(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  return !s || s === "new user" || s === "member" || s === "user";
}

function trimAtHandle(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().replace(/^@/, "") : "";
}

/**
 * Label from a single `creators/{id}` document (no users fallback).
 * Preference: @handle, then non-placeholder displayName.
 */
export function adminCreatorLabelFromCreatorDoc(creatorData: Record<string, unknown> | undefined): string {
  if (!creatorData) return "";
  const handleRaw = trimAtHandle(creatorData.handle);
  const handle = handleRaw ? `@${handleRaw}` : "";
  const dnRaw = typeof creatorData.displayName === "string" ? creatorData.displayName.trim() : "";
  const dn = !isPlaceholderAdminCreatorDisplay(dnRaw) ? dnRaw : "";
  return handle || dn || "";
}

/**
 * Label from a single `users/{id}` document when no creator profile applies.
 * Preference: @username, then non-placeholder displayName.
 */
export function adminCreatorLabelFromUserDoc(userData: Record<string, unknown> | undefined): string {
  if (!userData) return "";
  const unRaw = trimAtHandle(userData.username);
  const un = unRaw ? `@${unRaw}` : "";
  const dnRaw = typeof userData.displayName === "string" ? userData.displayName.trim() : "";
  const dn = !isPlaceholderAdminCreatorDisplay(dnRaw) ? dnRaw : "";
  return un || dn || "";
}

export function adminCreatorShortUidFallback(creatorId: string): string {
  const id = creatorId.trim();
  if (!id) return "—";
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

/**
 * Batch-resolve admin-facing creator labels (creators doc first, then users/{id}).
 * Returns labels keyed by requested id; performs chunked getAll reads.
 */
export async function resolveAdminCreatorLabels(
  db: Firestore,
  ids: string[],
): Promise<{ labels: Record<string, string>; profileDocReads: number }> {
  const unique = [...new Set(ids.filter((x) => x.trim()))];
  const out: Record<string, string> = {};
  let profileDocReads = 0;
  if (unique.length === 0) return { labels: out, profileDocReads: 0 };

  const chunkSize = 30;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    profileDocReads += chunk.length;
    const snaps = await db.getAll(...chunk.map((id) => db.collection("creators").doc(id)));
    snaps.forEach((snap, j) => {
      const id = chunk[j]!;
      if (snap.exists) {
        const cd = snap.data() as Record<string, unknown>;
        out[id] = adminCreatorLabelFromCreatorDoc(cd);
      } else {
        out[id] = "";
      }
    });
  }

  const missing = unique.filter((id) => !out[id]);
  for (let i = 0; i < missing.length; i += chunkSize) {
    const chunk = missing.slice(i, i + chunkSize);
    profileDocReads += chunk.length;
    const snaps = await db.getAll(...chunk.map((id) => db.collection("users").doc(id)));
    snaps.forEach((snap, j) => {
      const id = chunk[j]!;
      if (snap.exists) {
        const ud = snap.data() as Record<string, unknown>;
        out[id] = adminCreatorLabelFromUserDoc(ud);
      }
      if (!out[id]) out[id] = adminCreatorShortUidFallback(id);
    });
  }

  return { labels: out, profileDocReads };
}
