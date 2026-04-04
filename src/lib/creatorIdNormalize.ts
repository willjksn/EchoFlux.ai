/**
 * Firestore / console paste mistakes sometimes produce values like
 * `uid--collection=members`. Product queries use the real Auth uid; normalize for compares and multi-key lookup.
 */
export function normalizeCreatorId(id: string | undefined | null): string {
  if (id == null || typeof id !== "string") return "";
  const t = id.trim();
  const idx = t.indexOf("--collection=");
  if (idx !== -1) return t.slice(0, idx).trimEnd();
  return t;
}

/**
 * Values to try for `where("creatorId", "==", …)` when legacy docs used a polluted id.
 * Order: canonical uid first, then raw query string if different, then `uid--collection=members`.
 */
export function creatorIdFirestoreQueryVariants(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const clean = normalizeCreatorId(trimmed);
  const legacyMembers = `${clean}--collection=members`;
  const out: string[] = [];
  const add = (s: string) => {
    if (s.length > 0 && !out.includes(s)) out.push(s);
  };
  add(clean);
  add(trimmed);
  add(legacyMembers);
  return out;
}
