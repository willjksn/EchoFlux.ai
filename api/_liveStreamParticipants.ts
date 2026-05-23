import type { Firestore } from "firebase-admin/firestore";

export type LiveStreamParticipantRecord = {
  fanId: string;
  displayName: string;
  joinedAt: string;
};

function participantsCol(db: Firestore, creatorId: string, streamId: string) {
  return db
    .collection("creators")
    .doc(creatorId)
    .collection("liveStreams")
    .doc(streamId)
    .collection("participants");
}

/** Record a fan/member entering the Daily room (viewer token issued). */
export async function recordLiveStreamViewerJoin(
  db: Firestore,
  creatorId: string,
  streamId: string,
  fanId: string,
  displayName: string,
): Promise<void> {
  const now = new Date().toISOString();
  await participantsCol(db, creatorId, streamId).doc(fanId).set(
    {
      fanId,
      displayName: displayName.slice(0, 80) || "Member",
      joinedAt: now,
      updatedAt: now,
    },
    { merge: true },
  );
}

/** Remove viewer from live roster (leave stream or tab close). */
export async function recordLiveStreamViewerLeave(
  db: Firestore,
  creatorId: string,
  streamId: string,
  fanId: string,
): Promise<void> {
  await participantsCol(db, creatorId, streamId).doc(fanId).delete().catch(() => undefined);
}

/** Clear roster when host ends the broadcast. */
export async function clearLiveStreamParticipants(
  db: Firestore,
  creatorId: string,
  streamId: string,
): Promise<void> {
  const snap = await participantsCol(db, creatorId, streamId).get();
  if (snap.empty) return;
  const batch = db.batch();
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
  }
  await batch.commit();
}
