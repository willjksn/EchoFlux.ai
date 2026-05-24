import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { sendSupportTicketAcknowledgmentEmail } from "./_supportTicketAcknowledgmentEmail.js";
import { appendAttachmentsToMessageBody, sanitizeSupportAttachmentUrlsForUid } from "./_supportAttachmentUrls.js";
import { memberFacingReplyBrandForReporterKind } from "./_supportTicketBranding.js";
import { pushForAdminAlert } from "./_userWebPush.js";

type ReporterKind = "fan" | "creator";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const authUser = await verifyAuth(req);
  if (!authUser?.uid) return res.status(401).json({ error: "Unauthorized" });

  const {
    creatorId,
    message,
    diagnostics,
    page,
    url,
    userAgent,
    reporterKind = "fan",
    attachmentUrls,
  } = (req.body || {}) as {
    creatorId?: string;
    message?: string;
    diagnostics?: string;
    page?: string;
    url?: string;
    userAgent?: string;
    reporterKind?: ReporterKind;
    attachmentUrls?: unknown;
  };

  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: "Message is required" });
  }
  if (!creatorId || typeof creatorId !== "string") {
    return res.status(400).json({ error: "creatorId is required" });
  }

  const db = getAdminDb();
  const now = new Date().toISOString();

  try {
    const [reporterSnap, creatorSnap] = await Promise.all([
      db.collection("users").doc(authUser.uid).get(),
      db.collection("creators").doc(creatorId).get(),
    ]);

    const reporterData = (reporterSnap.data() || {}) as Record<string, unknown>;
    const creatorData = (creatorSnap.data() || {}) as Record<string, unknown>;
    const creatorHandle = typeof creatorData.handle === "string" ? creatorData.handle : null;
    const creatorDisplayName =
      typeof creatorData.displayName === "string" && creatorData.displayName.trim()
        ? creatorData.displayName.trim()
        : creatorHandle || creatorId;

    const reporterKindResolved: ReporterKind = reporterKind === "creator" ? "creator" : "fan";
    const fanUsernameRaw =
      reporterKindResolved === "fan" && typeof reporterData.username === "string"
        ? reporterData.username.trim().toLowerCase()
        : "";
    const verifiedFanUsername =
      reporterKindResolved === "fan" && fanUsernameRaw.length >= 3 && /^[a-z0-9_]+$/.test(fanUsernameRaw)
        ? fanUsernameRaw
        : "";
    const reporterNameResolved =
      reporterKindResolved === "creator"
        ? (typeof reporterData.name === "string" && reporterData.name) ||
          (typeof reporterData.displayName === "string" && reporterData.displayName) ||
          authUser.email ||
          "Unknown"
        : verifiedFanUsername
          ? `@${verifiedFanUsername}`
          : (typeof reporterData.name === "string" && reporterData.name) ||
            (typeof reporterData.displayName === "string" && reporterData.displayName) ||
            authUser.email ||
            "Unknown";

    const memberFacingReplyBrand = memberFacingReplyBrandForReporterKind(reporterKindResolved);

    const initialMessage = String(message).trim();
    const messageWithDiagnostics = diagnostics?.trim()
      ? `${initialMessage}\n\n---\n${diagnostics.trim()}`
      : initialMessage;
    const validatedAttachments = sanitizeSupportAttachmentUrlsForUid(attachmentUrls, authUser.uid);
    const storedMessageBody = appendAttachmentsToMessageBody(messageWithDiagnostics, validatedAttachments);

    const ticketRef = db.collection("support_tickets").doc();
    const ticketId = ticketRef.id;
    const baseTicket = {
      id: ticketId,
      creatorId,
      creatorHandle: creatorHandle || null,
      creatorDisplayName,
      reporterUid: authUser.uid,
      reporterEmail: authUser.email || null,
      reporterName: reporterNameResolved,
      reporterRole: (typeof reporterData.role === "string" && reporterData.role) || "User",
      reporterKind: reporterKindResolved,
      memberFacingReplyBrand,
      status: "open",
      page: typeof page === "string" ? page : null,
      url: typeof url === "string" ? url : null,
      userAgent: typeof userAgent === "string" ? userAgent : null,
      preview: initialMessage.slice(0, 180),
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
      lastMessagePreview: initialMessage.slice(0, 180),
      messageCount: 1,
    };

    const batch = db.batch();
    batch.set(ticketRef, baseTicket);
    batch.set(ticketRef.collection("messages").doc(), {
      senderKind: baseTicket.reporterKind,
      senderUid: authUser.uid,
      senderName: baseTicket.reporterName,
      content: storedMessageBody,
      createdAt: now,
    });
    batch.set(db.collection("users").doc(authUser.uid).collection("support_threads").doc(ticketId), {
      title: initialMessage.slice(0, 72) || "Problem report",
      status: "open",
      createdAt: now,
      updatedAt: now,
      lastMessage: initialMessage,
      creatorId,
      creatorDisplayName,
      memberFacingReplyBrand,
    });
    batch.set(
      db.collection("users").doc(authUser.uid).collection("support_threads").doc(ticketId).collection("messages").doc(),
      {
        senderType: "fan",
        content: storedMessageBody,
        createdAt: now,
      }
    );
    batch.set(db.collection("creators").doc(creatorId).collection("support_tickets").doc(ticketId), {
      ticketId,
      creatorId,
      creatorHandle: creatorHandle || null,
      creatorDisplayName,
      reporterUid: authUser.uid,
      reporterEmail: authUser.email || null,
      reporterName: baseTicket.reporterName,
      reporterKind: baseTicket.reporterKind,
      status: "open",
      preview: initialMessage.slice(0, 180),
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
    });
    batch.set(db.collection("admin_alerts").doc(), {
      type: "support_ticket_created",
      severity: "warning",
      title: "New support ticket",
      message: `${baseTicket.reporterKind === "creator" ? "Creator" : "Fan"} report from ${baseTicket.reporterName}`,
      ticketId,
      reporterUid: authUser.uid,
      reporterEmail: authUser.email || null,
      reporterKind: baseTicket.reporterKind,
      creatorId,
      read: false,
      createdAt: new Date(),
    });

    await batch.commit();

    void pushForAdminAlert({
      type: "support_ticket_created",
      title: "New support ticket",
      message: `${baseTicket.reporterKind === "creator" ? "Creator" : "Fan"} report from ${baseTicket.reporterName}`,
    }).catch((e) => console.warn("createSupportTicket admin push:", e));

    void sendSupportTicketAcknowledgmentEmail({
      to: authUser.email,
      reporterName: baseTicket.reporterName,
      ticketId,
      memberFacingBrand: memberFacingReplyBrand,
    });

    return res.status(200).json({ success: true, ticketId });
  } catch (error: any) {
    console.error("createSupportTicket error:", error);
    return res.status(500).json({ error: "Failed to create support ticket", details: error?.message || String(error) });
  }
}

