/**
 * Creator DM mute: mirror thread ids under users/{creatorId}/dm_muted_threads
 * so the client can exclude muted threads from message badges (Firestore rules: read-only for owner).
 */

import { getAdminDb } from "./_firebaseAdmin.js";
import { FAN_DM_THREADS } from "./_fanDmHelpers.js";

const DM_MUTED_SUB = "dm_muted_threads";
const FIRESTORE_BATCH_MAX = 400;

export async function setCreatorDmMutedMirror(
  creatorId: string,
  threadId: string,
  muted: boolean
): Promise<void> {
  const db = getAdminDb();
  if (!db) return;
  const ref = db.collection("users").doc(creatorId).collection(DM_MUTED_SUB).doc(threadId);
  if (muted) {
    await ref.set(
      { threadId, mutedAt: new Date().toISOString() },
      { merge: true }
    );
  } else {
    try {
      await ref.delete();
    } catch {
      /* ignore */
    }
  }
}

type NotifData = { data?: { threadId?: string } };

/**
 * Mark unread new_message inbox rows read for a thread (creator muted conversation).
 * Only updates users/{uid}/notifications (what the bell reads).
 */
export async function markNewMessageNotificationsReadForThread(
  recipientUid: string,
  threadId: string
): Promise<void> {
  const db = getAdminDb();
  if (!db) return;

  const coll = db.collection("users").doc(recipientUid).collection("notifications");
  const snap = await coll.where("read", "==", false).where("type", "==", "new_message").get();
  const docs = snap.docs.filter((d) => (d.data() as NotifData).data?.threadId === threadId);
  if (docs.length === 0) return;

  let batch = db.batch();
  let n = 0;
  for (const d of docs) {
    batch.update(d.ref, { read: true });
    n++;
    if (n >= FIRESTORE_BATCH_MAX) {
      await batch.commit();
      batch = db.batch();
      n = 0;
    }
  }
  if (n > 0) await batch.commit();

  for (const d of docs) {
    try {
      await db.collection("fan_notifications").doc(d.id).update({ read: true });
    } catch {
      /* doc may not exist */
    }
  }
}

/** Upsert/delete dm_muted_threads docs from fanDmThreads.creatorInboxMuted flags. */
export async function syncCreatorDmMutedMirrors(creatorId: string): Promise<void> {
  const db = getAdminDb();
  if (!db) return;

  const threadsSnap = await db
    .collection(FAN_DM_THREADS)
    .where("creatorId", "==", creatorId)
    .limit(500)
    .get();

  const mutedIds = new Set<string>();
  for (const d of threadsSnap.docs) {
    const m = d.data() as { creatorInboxMuted?: boolean };
    if (m.creatorInboxMuted === true) mutedIds.add(d.id);
  }

  const mirrorSnap = await db.collection("users").doc(creatorId).collection(DM_MUTED_SUB).get();

  const now = new Date().toISOString();
  let batch = db.batch();
  let n = 0;

  const commitIfNeeded = async () => {
    if (n > 0) {
      await batch.commit();
      batch = db.batch();
      n = 0;
    }
  };

  for (const d of mirrorSnap.docs) {
    if (!mutedIds.has(d.id)) {
      batch.delete(d.ref);
      n++;
      if (n >= FIRESTORE_BATCH_MAX) await commitIfNeeded();
    }
  }

  for (const tid of mutedIds) {
    batch.set(
      db.collection("users").doc(creatorId).collection(DM_MUTED_SUB).doc(tid),
      { threadId: tid, mutedAt: now },
      { merge: true }
    );
    n++;
    if (n >= FIRESTORE_BATCH_MAX) await commitIfNeeded();
  }
  await commitIfNeeded();
}
