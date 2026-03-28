import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

type TicketStatus = "open" | "done";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const authUser = await verifyAuth(req);
  if (!authUser?.uid) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  const userSnap = await db.collection("users").doc(authUser.uid).get();
  const role = (userSnap.data() as { role?: string } | undefined)?.role;
  if (role !== "Admin") return res.status(403).json({ error: "Admin access required" });

  const { ticketId, status } = (req.body || {}) as { ticketId?: string; status?: TicketStatus };
  if (!ticketId || typeof ticketId !== "string") return res.status(400).json({ error: "ticketId is required" });
  if (status !== "open" && status !== "done") return res.status(400).json({ error: "status must be open or done" });

  try {
    const ticketRef = db.collection("support_tickets").doc(ticketId);
    const ticketSnap = await ticketRef.get();
    if (!ticketSnap.exists) return res.status(404).json({ error: "Ticket not found" });
    const ticket = (ticketSnap.data() || {}) as Record<string, unknown>;
    const reporterUid = typeof ticket.reporterUid === "string" ? ticket.reporterUid : null;
    const creatorId = typeof ticket.creatorId === "string" ? ticket.creatorId : null;
    const now = new Date().toISOString();

    const batch = db.batch();
    batch.set(
      ticketRef,
      {
        status,
        updatedAt: now,
        adminLastTouchedAt: now,
        adminLastTouchedBy: authUser.uid,
      },
      { merge: true }
    );
    if (reporterUid) {
      batch.set(
        db.collection("users").doc(reporterUid).collection("support_threads").doc(ticketId),
        { status, updatedAt: now },
        { merge: true }
      );
    }
    if (creatorId) {
      batch.set(
        db.collection("creators").doc(creatorId).collection("support_tickets").doc(ticketId),
        { status, updatedAt: now },
        { merge: true }
      );
    }
    await batch.commit();

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("adminUpdateSupportTicket error:", error);
    return res.status(500).json({ error: "Failed to update ticket", details: error?.message || String(error) });
  }
}

