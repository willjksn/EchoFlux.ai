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
  const preview = String(message).trim().slice(0, 180);

  await db.collection("support_tickets").add({
    creatorId: isCreatorReporter ? user.uid : null,
    creatorHandle,
    creatorDisplayName,
    reporterUid: user.uid,
    reporterEmail: user.email || null,
    reporterName:
      (typeof userData.name === "string" && userData.name) ||
      (typeof userData.displayName === "string" && userData.displayName) ||
      user.email ||
      "Unknown",
    reporterRole: (typeof userData.role === "string" && userData.role) || "User",
    reporterKind: isCreatorReporter ? "creator" : "fan",
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

  res.status(200).json({ success: true });
}

export default withErrorHandling(handler);


