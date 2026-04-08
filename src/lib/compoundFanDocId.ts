/**
 * Some fan docs use `creators/{creatorId}/fans/{firebaseUid}-{email}` as the document id
 * (migration / legacy). Parse auth uid and embedded email for merging rows and `users/{uid}` lookups.
 */
const COMPOUND_FAN_ID = /^([a-zA-Z0-9]{20,36})-(.+@.+)$/;
const UID_LABEL_SUFFIX = /(?:^|[-_\s])u(?:id|di)\s*:\s*([A-Za-z0-9]{20,36})$/i;
const EMAIL_IN_ID = /([^\s]+@[^\s]+)$/i;

export function parseCompoundFanDocumentId(id: string): {
  authUid: string;
  emailFromId: string | null;
} {
  const raw = String(id ?? "").trim();
  if (!raw) return { authUid: raw, emailFromId: null };

  // Pattern: "<label>-<email>-uid:<firebaseUid>" (or legacy typo "udi:")
  // Example:
  //  "stonemanbill-stonemanbill@yahoo.com-udi:VCIJOXM0B9YFTfNbzFXnkTJ7oIq1"
  const labeled = raw.match(UID_LABEL_SUFFIX);
  if (labeled?.[1]) {
    const emailMatch = raw.match(EMAIL_IN_ID);
    return {
      authUid: labeled[1],
      emailFromId: emailMatch?.[1] ? emailMatch[1].trim().toLowerCase() : null,
    };
  }

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
