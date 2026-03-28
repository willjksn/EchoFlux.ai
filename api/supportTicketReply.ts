import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const authUser = await verifyAuth(req);
  if (!authUser?.uid) return res.status(401).json({ error: "Unauthorized" });

  const { ticketId, content } = (req.body || {}) as { ticketId?: string; content?: string };
  if (!ticketId || typeof ticketId !== "string") return res.status(400).json({ error: "ticketId is required" });
  if (!content || !String(content).trim()) return res.status(400).json({ error: "content is required" });

  const db = getAdminDb();
  const now = new Date().toISOString();
  const text = String(content).trim();

  try {
    const ticketRef = db.collection("support_tickets").doc(ticketId);
    const ticketSnap = await ticketRef.get();
    if (!ticketSnap.exists) return res.status(404).json({ error: "Ticket not found" });

    const ticket = (ticketSnap.data() || {}) as Record<string, unknown>;
    const reporterUid = typeof ticket.reporterUid === "string" ? ticket.reporterUid : null;
    if (!reporterUid || reporterUid !== authUser.uid) {
      return res.status(403).json({ error: "Not allowed" });
    }

    const creatorId = typeof ticket.creatorId === "string" ? ticket.creatorId : null;
    const reporterName =
      (typeof ticket.reporterName === "string" && ticket.reporterName) || authUser.email || "Reporter";

    const batch = db.batch();
    batch.set(ticketRef.collection("messages").doc(), {
      senderKind: "fan",
      senderUid: authUser.uid,
      senderName: reporterName,
      content: text,
      createdAt: now,
    });
    batch.set(
      ticketRef,
      {
        updatedAt: now,
        status: "open",
        lastMessageAt: now,
        lastMessagePreview: text.slice(0, 180),
        messageCount: (typeof ticket.messageCount === "number" ? ticket.messageCount : 1) + 1,
      },
      { merge: true }
    );
    batch.set(
      db.collection("users").doc(reporterUid).collection("support_threads").doc(ticketId).collection("messages").doc(),
      {
        senderType: "fan",
        content: text,
        createdAt: now,
      }
    );
    batch.set(
      db.collection("users").doc(reporterUid).collection("support_threads").doc(ticketId),
      { updatedAt: now, lastMessage: text, status: "open" },
      { merge: true }
    );
    if (creatorId) {
      batch.set(
        db.collection("creators").doc(creatorId).collection("support_tickets").doc(ticketId),
        { updatedAt: now, status: "open", lastMessageAt: now, preview: text.slice(0, 180) },
        { merge: true }
      );
    }

    await batch.commit();
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("supportTicketReply error:", error);
    return res.status(500).json({ error: "Failed to send reply", details: error?.message || String(error) });
  }
}

