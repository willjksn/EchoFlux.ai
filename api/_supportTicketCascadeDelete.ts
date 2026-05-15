import type { CollectionReference, DocumentData } from "firebase-admin/firestore";
import { getAdminDb } from "./_firebaseAdmin.js";

type AdminDb = ReturnType<typeof getAdminDb>;

/** Repeated batched deletes until empty (Admin SDK bypasses Firestore rules). */
export async function wipeSupportMessagesCollection(db: AdminDb, col: CollectionReference<DocumentData>): Promise<void> {
  for (let round = 0; round < 400; round++) {
    const snap = await col.limit(400).get();
    if (snap.empty) return;
    const batch = db.batch();
    for (const d of snap.docs) {
      batch.delete(d.ref);
    }
    await batch.commit();
  }
  throw new Error("Deleting support messages exceeded iteration limit");
}

export type CascadeDeleteSupportTicketOptions = {
  /**
   * When the reporter deletes their thread: merges this uid into mirrored user deletes and,
   * when the canonical ticket doc is missing, resolves `creatorId` from `users/{uid}/support_threads/{ticketId}`.
   */
  reporterUidEnsure?: string;
};

/**
 * Deletes `support_tickets/{ticketId}`, its messages, all known `users/{reporterUid}/support_threads/{ticketId}`
 * mirrors (plus optional `reporterUidEnsure`), and `creators/{creatorId}/support_tickets/{ticketId}` when set.
 */
export async function cascadeDeleteSupportTicketArtifacts(
  db: AdminDb,
  ticketId: string,
  opts?: CascadeDeleteSupportTicketOptions,
): Promise<void> {
  const tid = ticketId.trim();
  if (!tid) throw new Error("ticketId is required");

  const ticketRef = db.collection("support_tickets").doc(tid);
  const ticketSnap = await ticketRef.get();

  let reporterUid: string | null = null;
  let creatorId: string | null = null;
  if (ticketSnap.exists) {
    const t = ticketSnap.data() as Record<string, unknown>;
    reporterUid = typeof t.reporterUid === "string" ? t.reporterUid.trim() : null;
    creatorId = typeof t.creatorId === "string" ? t.creatorId.trim() : null;
  }

  const ensure = opts?.reporterUidEnsure?.trim();
  if (ensure) {
    const threadSnap = await db.collection("users").doc(ensure).collection("support_threads").doc(tid).get();
    if (threadSnap.exists) {
      const d = threadSnap.data() as Record<string, unknown>;
      if (!creatorId && typeof d.creatorId === "string" && d.creatorId.trim()) {
        creatorId = d.creatorId.trim();
      }
    }
  }

  await wipeSupportMessagesCollection(db, ticketRef.collection("messages") as CollectionReference<DocumentData>);
  await ticketRef.delete().catch(() => {});

  const purgeReporterUids = new Set<string>();
  if (reporterUid) purgeReporterUids.add(reporterUid);
  if (ensure) purgeReporterUids.add(ensure);

  for (const r of purgeReporterUids) {
    const threadRef = db.collection("users").doc(r).collection("support_threads").doc(tid);
    await wipeSupportMessagesCollection(db, threadRef.collection("messages") as CollectionReference<DocumentData>);
    await threadRef.delete().catch(() => {});
  }

  if (creatorId) {
    await db.collection("creators").doc(creatorId).collection("support_tickets").doc(tid).delete().catch(() => {});
  }
}
