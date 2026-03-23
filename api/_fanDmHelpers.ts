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
