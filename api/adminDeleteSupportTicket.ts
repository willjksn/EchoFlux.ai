import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { CollectionReference, DocumentData } from "firebase-admin/firestore";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { hasPlatformAdminAccess } from "./_platformAdminAccess.js";

/** Repeated batched deletes until the collection is empty (Admin SDK bypasses Firestore rules). */
async function wipeCollection(db: ReturnType<typeof getAdminDb>, col: CollectionReference<DocumentData>): Promise<void> {
  for (let round = 0; round < 400; round++) {
    const snap = await col.limit(400).get();
    if (snap.empty) return;
    const batch = db.batch();
    for (const d of snap.docs) {
      batch.delete(d.ref);
    }
    await batch.commit();
  }
  throw new Error("Deleting subcollection took too many rounds");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const authUser = await verifyAuth(req);
  if (!authUser?.uid) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  const userSnap = await db.collection("users").doc(authUser.uid).get();
  if (!hasPlatformAdminAccess(userSnap.data() as Record<string, unknown> | undefined)) {
    return res.status(403).json({ error: "Admin access required" });
  }

  const { ticketId } = (req.body || {}) as { ticketId?: string };
  const tid = typeof ticketId === "string" ? ticketId.trim() : "";
  if (!tid) return res.status(400).json({ error: "ticketId is required" });

  try {
    const ticketRef = db.collection("support_tickets").doc(tid);
    const ticketSnap = await ticketRef.get();
    if (!ticketSnap.exists) return res.status(404).json({ error: "Ticket not found" });

    const ticket = (ticketSnap.data() || {}) as Record<string, unknown>;
    const reporterUid = typeof ticket.reporterUid === "string" ? ticket.reporterUid.trim() : null;
    const creatorId = typeof ticket.creatorId === "string" ? ticket.creatorId.trim() : null;

    await wipeCollection(db, ticketRef.collection("messages") as CollectionReference<DocumentData>);
    await ticketRef.delete();

    if (reporterUid) {
      const threadRef = db.collection("users").doc(reporterUid).collection("support_threads").doc(tid);
      await wipeCollection(db, threadRef.collection("messages") as CollectionReference<DocumentData>);
      await threadRef.delete().catch(() => {});
    }

    if (creatorId) {
      await db
        .collection("creators")
        .doc(creatorId)
        .collection("support_tickets")
        .doc(tid)
        .delete()
        .catch(() => {});
    }

    return res.status(200).json({ success: true });
  } catch (error: unknown) {
    console.error("adminDeleteSupportTicket error:", error);
    return res.status(500).json({
      error: "Failed to delete ticket",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
