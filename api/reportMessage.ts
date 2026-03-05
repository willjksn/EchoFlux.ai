import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { FAN_DM_THREADS, FAN_DM_MESSAGES, REPORTS_COLLECTION } from "./_fanDmHelpers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const ok = await enforceRateLimit({
    req,
    res,
    keyPrefix: "reportMessage",
    limit: 10,
    windowMs: 60 * 60 * 1000,
    identifier: decoded.uid,
  });
  if (!ok) return;

  const body = (req.body || {}) as Record<string, unknown>;
  const threadId = body.threadId as string;
  const messageId = body.messageId as string;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "Inappropriate content";
  if (!threadId || !messageId) {
    return res.status(400).json({ error: "threadId and messageId are required" });
  }

  try {
    const db = getAdminDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    const threadSnap = await db.collection(FAN_DM_THREADS).doc(threadId).get();
    if (!threadSnap.exists) {
      return res.status(404).json({ error: "Thread not found" });
    }
    const thread = threadSnap.data() as { creatorId: string; fanId: string };
    const uid = decoded.uid;
    if (thread.creatorId !== uid && thread.fanId !== uid) {
      return res.status(403).json({ error: "Not a participant" });
    }

    const msgRef = db.collection(FAN_DM_THREADS).doc(threadId).collection(FAN_DM_MESSAGES).doc(messageId);
    const msgSnap = await msgRef.get();
    if (!msgSnap.exists) {
      return res.status(404).json({ error: "Message not found" });
    }

    const now = new Date().toISOString();
    const reportRef = db.collection(REPORTS_COLLECTION).doc();
    await reportRef.set({
      creatorId: thread.creatorId,
      fanId: thread.fanId,
      threadId,
      messageId,
      reporterId: uid,
      reason,
      status: "pending",
      createdAt: now,
    });

    await msgRef.update({ reported: true, reportId: reportRef.id });

    return res.status(201).json({ success: true, reportId: reportRef.id });
  } catch (e: unknown) {
    console.error("reportMessage error:", e);
    return res.status(500).json({
      error: "Failed to submit report",
      details: process.env.NODE_ENV === "development" ? (e as Error)?.message : undefined,
    });
  }
}
