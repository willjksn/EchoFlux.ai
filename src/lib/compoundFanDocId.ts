/**
 * Some fan docs use `creators/{creatorId}/fans/{firebaseUid}-{email}` as the document id
 * (migration / legacy). Parse auth uid and embedded email for merging rows and `users/{uid}` lookups.
 */
const COMPOUND_FAN_ID = /^([a-zA-Z0-9]{20,36})-(.+@.+)$/;

export function parseCompoundFanDocumentId(id: string): {
  authUid: string;
  emailFromId: string | null;
} {
  const raw = String(id ?? "").trim();
  if (!raw) return { authUid: raw, emailFromId: null };
  const m = raw.match(COMPOUND_FAN_ID);
  if (m) {
    return { authUid: m[1], emailFromId: m[2].trim().toLowerCase() };
  }
  return { authUid: raw, emailFromId: null };
}

/** Firebase Auth uid for this fan doc id (plain uid or uid extracted from compound id). */
export function authUidFromFanDocId(id: string): string {
  return parseCompoundFanDocumentId(id).authUid;
}
