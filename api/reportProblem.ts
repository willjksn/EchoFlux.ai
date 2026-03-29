import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { getVerifyAuth, withErrorHandling } from "./_errorHandler.js";

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

  const { message, page, url, userAgent } = (req.body || {}) as {
    message?: string;
    page?: string;
    url?: string;
    userAgent?: string;
  };

  if (!message || !String(message).trim()) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  const db = getAdminDb();
  const now = new Date().toISOString();

  await db.collection("user_problem_reports").add({
    userId: user.uid,
    email: user.email || null,
    message: String(message).trim(),
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
  const trimmedMessage = String(message).trim();
  const preview = trimmedMessage.slice(0, 180);

  const ticketRef = db.collection("support_tickets").doc();
  const ticketId = ticketRef.id;
  const reporterKind = isCreatorReporter ? "creator" : "fan";
  const reporterName =
    (typeof userData.name === "string" && userData.name) ||
    (typeof userData.displayName === "string" && userData.displayName) ||
    user.email ||
    "Unknown";

  const batch = db.batch();

  batch.set(ticketRef, {
    id: ticketId,
    creatorId: isCreatorReporter ? user.uid : null,
    creatorHandle,
    creatorDisplayName,
    reporterUid: user.uid,
    reporterEmail: user.email || null,
    reporterName,
    reporterRole: (typeof userData.role === "string" && userData.role) || "User",
    reporterKind,
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
  });

  batch.set(ticketRef.collection("messages").doc(), {
    senderKind: reporterKind,
    senderUid: user.uid,
    senderName: reporterName,
    content: trimmedMessage,
    createdAt: now,
  });

  // Mirror every report into the reporter's support thread collection for in-app tracking.
  batch.set(db.collection("users").doc(user.uid).collection("support_threads").doc(ticketId), {
    title: preview || "Problem report",
    status: "open",
    createdAt: now,
    updatedAt: now,
    lastMessage: trimmedMessage,
    creatorId: isCreatorReporter ? user.uid : null,
    creatorDisplayName,
  });
  batch.set(
    db.collection("users").doc(user.uid).collection("support_threads").doc(ticketId).collection("messages").doc(),
    {
      senderType: "fan",
      content: trimmedMessage,
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
    message: `${reporterKind === "creator" ? "Creator" : "Fan"} report from ${reporterName}`,
    ticketId,
    reporterUid: user.uid,
    reporterEmail: user.email || null,
    reporterKind,
    creatorId: isCreatorReporter ? user.uid : null,
    read: false,
    createdAt: new Date(),
  });

  await batch.commit();

  res.status(200).json({ success: true });
}

export default withErrorHandling(handler);


