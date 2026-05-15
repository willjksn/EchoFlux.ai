import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { cascadeDeleteSupportTicketArtifacts } from "./_supportTicketCascadeDelete.js";

/**
 * Reporter removes their hub/profile thread → deletes canonical `support_tickets` and admin-side mirrors too
 * (same cascade as Echo Support “Delete”).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const authUser = await verifyAuth(req);
  if (!authUser?.uid) return res.status(401).json({ error: "Unauthorized" });

  const { ticketId } = (req.body || {}) as { ticketId?: string };
  const tid = typeof ticketId === "string" ? ticketId.trim() : "";
  if (!tid) return res.status(400).json({ error: "ticketId is required" });

  const db = getAdminDb();
  const uid = authUser.uid;

  try {
    const ticketRef = db.collection("support_tickets").doc(tid);
    const ticketSnap = await ticketRef.get();
    const threadRef = db.collection("users").doc(uid).collection("support_threads").doc(tid);
    const threadSnap = await threadRef.get();

    if (!threadSnap.exists && !ticketSnap.exists) {
      return res.status(404).json({ error: "Thread not found" });
    }

    if (ticketSnap.exists) {
      const ticket = ticketSnap.data() as Record<string, unknown>;
      const rep = typeof ticket.reporterUid === "string" ? ticket.reporterUid.trim() : "";
      if (rep && rep !== uid) {
        return res.status(403).json({ error: "Not allowed" });
      }
    }

    await cascadeDeleteSupportTicketArtifacts(db, tid, { reporterUidEnsure: uid });

    return res.status(200).json({ success: true });
  } catch (error: unknown) {
    console.error("deleteMySupportThread error:", error);
    return res.status(500).json({
      error: "Failed to delete ticket",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
