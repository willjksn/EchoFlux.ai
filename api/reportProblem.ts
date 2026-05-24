import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { getVerifyAuth, withErrorHandling } from "./_errorHandler.js";
import { sendSupportTicketAcknowledgmentEmail } from "./_supportTicketAcknowledgmentEmail.js";
import { appendAttachmentsToMessageBody, sanitizeSupportAttachmentUrlsForUid } from "./_supportAttachmentUrls.js";
import { memberFacingReplyBrandForReporterKind } from "./_supportTicketBranding.js";
import { pushForAdminAlert } from "./_userWebPush.js";

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const verifyAuth = await getVerifyAuth();
  const user = await verifyAuth(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { message, diagnostics, page, url, userAgent, inboxBucket, attachmentUrls, hubCreatorId } = (req.body || {}) as {
    message?: string;
    diagnostics?: string;
    page?: string;
    url?: string;
    userAgent?: string;
    /** "contact" = general EchoFlux inbox; omit or anything else defaults to IT-style triage. */
    inboxBucket?: string;
    attachmentUrls?: unknown;
    /** Fan hub: validated server-side against creators/{id}; links platform ticket to storefront for admins. */
    hubCreatorId?: string;
  };

  if (!message || !String(message).trim()) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  const trimmedUserMessage = String(message).trim();
  const diagTrim = diagnostics && String(diagnostics).trim() ? String(diagnostics).trim() : "";
  const storedBody = diagTrim ? `${trimmedUserMessage}\n\n---\n${diagTrim}` : trimmedUserMessage;
  const bucket =
    inboxBucket === "contact" ? "contact" : "it_support";

  const attachmentList = sanitizeSupportAttachmentUrlsForUid(attachmentUrls, user.uid);
  const storedBodyWithAttachments = appendAttachmentsToMessageBody(storedBody, attachmentList);

  const db = getAdminDb();
  const now = new Date().toISOString();

  await db.collection("user_problem_reports").add({
    userId: user.uid,
    email: user.email || null,
    message: storedBodyWithAttachments,
    inboxBucket: bucket,
    page: page || null,
    url: url || null,
    userAgent: userAgent || null,
    createdAt: now,
    status: "new",
  });

  // Mirror into unified IT support tickets so Admin Tools can triage
  const [userDoc, creatorDoc] = await Promise.all([
    db.collection("users").doc(user.uid).get().catch(() => null),
    db.collection("creators").doc(user.uid).get().catch(() => null),
  ]);
  const userData = (userDoc?.data?.() || {}) as Record<string, unknown>;
  const isCreatorReporter = !!creatorDoc?.exists;
  const creatorData = (creatorDoc?.data?.() || {}) as Record<string, unknown>;
  const creatorHandle = isCreatorReporter && typeof creatorData.handle === "string" ? creatorData.handle : null;
  const creatorDisplayName =
    isCreatorReporter && typeof creatorData.displayName === "string" && creatorData.displayName.trim()
      ? creatorData.displayName.trim()
      : creatorHandle || null;

  let hubCreatorIdResolved: string | null = null;
  let hubCreatorHandleResolved: string | null = null;
  let hubCreatorDisplayNameResolved: string | null = null;
  if (!isCreatorReporter && hubCreatorId && typeof hubCreatorId === "string" && hubCreatorId.trim()) {
    const hubSnap = await db.collection("creators").doc(hubCreatorId.trim()).get();
    if (hubSnap.exists) {
      const hubData = (hubSnap.data() || {}) as Record<string, unknown>;
      hubCreatorIdResolved = hubCreatorId.trim();
      hubCreatorHandleResolved = typeof hubData.handle === "string" ? hubData.handle : null;
      hubCreatorDisplayNameResolved =
        typeof hubData.displayName === "string" && hubData.displayName.trim()
          ? hubData.displayName.trim()
          : hubCreatorHandleResolved || hubCreatorIdResolved;
    }
  }

  const ticketCreatorId = isCreatorReporter ? user.uid : hubCreatorIdResolved;
  const ticketCreatorHandle = isCreatorReporter ? creatorHandle : hubCreatorHandleResolved;
  const ticketCreatorDisplayName = isCreatorReporter ? creatorDisplayName : hubCreatorDisplayNameResolved;
  const preview = trimmedUserMessage.slice(0, 180);
  const threadTitle =
    bucket === "contact"
      ? (preview ? `Contact · ${preview.slice(0, 72)}` : "Contact request")
      : preview || "Problem report";

  const ticketRef = db.collection("support_tickets").doc();
  const ticketId = ticketRef.id;
  const reporterKind = isCreatorReporter ? "creator" : "fan";
  const fanUsernameRaw =
    !isCreatorReporter && typeof userData.username === "string" ? userData.username.trim().toLowerCase() : "";
  const verifiedFanUsername =
    !isCreatorReporter && fanUsernameRaw.length >= 3 && /^[a-z0-9_]+$/.test(fanUsernameRaw) ? fanUsernameRaw : "";
  const reporterName = isCreatorReporter
    ? (typeof userData.name === "string" && userData.name) ||
      (typeof userData.displayName === "string" && userData.displayName) ||
      user.email ||
      "Unknown"
    : verifiedFanUsername
      ? `@${verifiedFanUsername}`
      : (typeof userData.name === "string" && userData.name) ||
        (typeof userData.displayName === "string" && userData.displayName) ||
        user.email ||
        "Unknown";

  const memberFacingReplyBrand = memberFacingReplyBrandForReporterKind(reporterKind);

  const batch = db.batch();

  batch.set(ticketRef, {
    id: ticketId,
    creatorId: ticketCreatorId,
    creatorHandle: ticketCreatorHandle,
    creatorDisplayName: ticketCreatorDisplayName,
    reporterUid: user.uid,
    reporterEmail: user.email || null,
    reporterName,
    reporterRole: (typeof userData.role === "string" && userData.role) || "User",
    reporterKind,
    memberFacingReplyBrand,
    status: "open",
    page: page || null,
    url: url || null,
    userAgent: userAgent || null,
    preview,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
    lastMessagePreview: preview,
    messageCount: 1,
    inboxBucket: bucket,
  });

  batch.set(ticketRef.collection("messages").doc(), {
    senderKind: reporterKind,
    senderUid: user.uid,
    senderName: reporterName,
    content: storedBodyWithAttachments,
    createdAt: now,
  });

  // Mirror every report into the reporter's support thread collection for in-app tracking.
  batch.set(db.collection("users").doc(user.uid).collection("support_threads").doc(ticketId), {
    title: threadTitle,
    inboxBucket: bucket,
    status: "open",
    createdAt: now,
    updatedAt: now,
    lastMessage: trimmedUserMessage,
    creatorId: ticketCreatorId,
    creatorDisplayName: ticketCreatorDisplayName,
    memberFacingReplyBrand,
  });
  batch.set(
    db.collection("users").doc(user.uid).collection("support_threads").doc(ticketId).collection("messages").doc(),
    {
      senderType: "fan",
      content: storedBodyWithAttachments,
      createdAt: now,
    }
  );

  // Keep creator-scoped support view in sync for creator-context reports.
  if (isCreatorReporter) {
    batch.set(db.collection("creators").doc(user.uid).collection("support_tickets").doc(ticketId), {
      ticketId,
      creatorId: user.uid,
      creatorHandle,
      creatorDisplayName,
      reporterUid: user.uid,
      reporterEmail: user.email || null,
      reporterName,
      reporterKind,
      status: "open",
      preview,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
    });
  }

  // Raise an admin alert so support reports are visible in Admin alerts feed.
  batch.set(db.collection("admin_alerts").doc(), {
    type: "support_ticket_created",
    severity: "warning",
    title: "New support ticket",
    message: `${bucket === "contact" ? "Contact" : reporterKind === "creator" ? "Creator" : "Fan"} ticket from ${reporterName}`,
    ticketId,
    reporterUid: user.uid,
    reporterEmail: user.email || null,
    reporterKind,
    creatorId: ticketCreatorId,
    read: false,
    createdAt: new Date(),
  });

  await batch.commit();

  void pushForAdminAlert({
    type: "support_ticket_created",
    title: "New support ticket",
    message: `${bucket === "contact" ? "Contact" : reporterKind === "creator" ? "Creator" : "Fan"} ticket from ${reporterName}`,
  }).catch((e) => console.warn("reportProblem admin push:", e));

  void sendSupportTicketAcknowledgmentEmail({
    to: user.email,
    reporterName,
    ticketId,
    memberFacingBrand: memberFacingReplyBrand,
  });

  res.status(200).json({ success: true });
}

export default withErrorHandling(handler);


