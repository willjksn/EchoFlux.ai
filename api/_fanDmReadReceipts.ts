import type { Firestore, QueryDocumentSnapshot, QuerySnapshot } from "firebase-admin/firestore";

const BATCH_SIZE = 400;

/**
 * Marks creator-sent rows as read when the fan has opened the thread (persisted receipts).
 */
export async function markCreatorMessagesReadByFan(
  db: Firestore,
  thread: { creatorId: string; fanId: string },
  fanUid: string,
  messagesSnap: QuerySnapshot
): Promise<Set<string>> {
  const markedIds = new Set<string>();
  if (!db || fanUid !== thread.fanId) return markedIds;

  const toMarkRead: QueryDocumentSnapshot[] = [];
  for (const d of messagesSnap.docs) {
    const data = d.data();
    if (data.read === true) continue;
    if (data.senderId === thread.creatorId) toMarkRead.push(d);
  }

  for (let i = 0; i < toMarkRead.length; i += BATCH_SIZE) {
    const chunk = toMarkRead.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const d of chunk) {
      batch.update(d.ref, { read: true });
      markedIds.add(d.id);
    }
    await batch.commit();
  }
  return markedIds;
}
