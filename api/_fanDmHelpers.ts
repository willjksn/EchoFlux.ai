/**
 * Shared helpers for fan DMs: thread id, ban check.
 * All Firestore access via getAdminDb() (server-only).
 */

export const FAN_DM_THREADS = "fanDmThreads";
export const FAN_DM_MESSAGES = "messages"; // subcollection under fanDmThreads/{threadId}
export const CREATOR_BLOCKS = "creatorBlocks";
export const REPORTS_COLLECTION = "reports";

/** Deterministic thread id so creator and fan share the same thread */
export function getThreadId(creatorId: string, fanId: string): string {
  return [creatorId, fanId].sort().join("_");
}

/** Returns true if creator has blocked this fan (banned from messaging and purchasing) */
export async function isFanBlocked(db: any, creatorId: string, fanId: string): Promise<boolean> {
  const blockRef = db
    .collection(CREATOR_BLOCKS)
    .doc(creatorId)
    .collection("blocked")
    .doc(fanId);
  const snap = await blockRef.get();
  return snap.exists;
}

/** Returns true if this creator has blocked a fan by uid, email doc id, or an email-linked fan row. */
export async function isFanBlockedByIdentity(
  db: any,
  creatorId: string,
  identity: { fanId?: string | null; email?: string | null },
): Promise<boolean> {
  const fanId = typeof identity.fanId === "string" ? identity.fanId.trim() : "";
  const email = typeof identity.email === "string" ? identity.email.trim().toLowerCase() : "";
  if (fanId && (await isFanBlocked(db, creatorId, fanId))) return true;
  if (email && (await isFanBlocked(db, creatorId, email))) return true;
  if (!email) return false;

  const blockedRef = db.collection(CREATOR_BLOCKS).doc(creatorId).collection("blocked");
  const emailFields = ["email", "emailLower", "fanEmail"];
  for (const field of emailFields) {
    const snap = await blockedRef.where(field, "==", email).limit(1).get().catch(() => null);
    if (snap && !snap.empty) return true;
  }

  const fansRef = db.collection("creators").doc(creatorId).collection("fans");
  const matchingFans = await fansRef.where("email", "==", email).limit(10).get().catch(() => null);
  if (!matchingFans) return false;
  for (const docSnap of matchingFans.docs) {
    if (await isFanBlocked(db, creatorId, docSnap.id)) return true;
    const data = docSnap.data() as Record<string, unknown>;
    const candidates = [
      typeof data.id === "string" ? data.id : "",
      typeof data.authUid === "string" ? data.authUid : "",
      typeof data.uid === "string" ? data.uid : "",
    ].filter(Boolean);
    for (const candidate of candidates) {
      if (await isFanBlocked(db, creatorId, candidate)) return true;
    }
  }
  return false;
}
