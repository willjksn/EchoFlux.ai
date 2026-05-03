import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { FAN_DM_THREADS, FAN_DM_MESSAGES } from "./_fanDmHelpers.js";
import { markCreatorMessagesReadByFan } from "./_fanDmReadReceipts.js";

const MSG_MARK_READ_CAP = 500;

/**
 * Fan-only: persists read receipts for creator-sent messages after the fan has opened the thread.
 * Call after `GET /api/fanDmMessages` (mark-read was removed from that path for latency).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const rlOk = await enforceRateLimit({
    req,
    res,
    keyPrefix: "fanDmMarkRead",
    limit: 60,
    windowMs: 60_000,
    identifier: decoded.uid,
  });
  if (!rlOk) return;

  let threadId = "";
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    threadId = String(body.threadId || "").trim();
  } catch {
    threadId = "";
  }
  if (!threadId) {
    return res.status(400).json({ error: "threadId is required" });
  }

  try {
    const db = getAdminDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    const threadSnap = await db.collection(FAN_DM_THREADS).doc(threadId).get();
    if (!threadSnap.exists) {
      return res.status(404).json({ error: "Thread not found" });
    }
    const thread = threadSnap.data() as { creatorId: string; fanId: string };
    if (decoded.uid !== thread.fanId) {
      return res.status(403).json({ error: "Only the fan can mark creator messages read" });
    }

    const base = db.collection(FAN_DM_THREADS).doc(threadId).collection(FAN_DM_MESSAGES);
    let messagesSnap;
    try {
      messagesSnap = await base.orderBy("createdAt", "desc").limit(MSG_MARK_READ_CAP).get();
    } catch (e) {
      console.warn("fanDmMarkRead: ordered query failed, falling back", e);
      messagesSnap = await base.limit(MSG_MARK_READ_CAP).get();
    }

    await markCreatorMessagesReadByFan(db, thread, decoded.uid, messagesSnap);
    return res.status(200).json({ ok: true });
  } catch (e: unknown) {
    console.error("fanDmMarkRead error:", e);
    return res.status(500).json({
      error: "Failed to mark messages read",
      details: process.env.NODE_ENV === "development" ? (e as Error)?.message : undefined,
    });
  }
}
