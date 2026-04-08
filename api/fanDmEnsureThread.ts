import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { FAN_DM_THREADS, getThreadId, isFanBlocked } from "./_fanDmHelpers.js";
import { sendFanNotification } from "./_fanNotifications.js";

/** Creator-only: create fanDmThreads row if missing so Messages UI can load the thread. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const fanId = typeof body.fanId === "string" ? body.fanId.trim() : "";
  const notifyFan = body.notifyFan !== false;
  const startSession = body.startSession === true;
  const requestedDurationMinutes =
    typeof body.durationMinutes === "number" && Number.isFinite(body.durationMinutes)
      ? Math.max(1, Math.min(180, Math.round(body.durationMinutes)))
      : 15;
  const chatType = typeof body.chatType === "string" ? body.chatType.trim() : "";
  if (!fanId) {
    return res.status(400).json({ error: "fanId is required" });
  }

  const creatorId = decoded.uid;

  try {
    const db = getAdminDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    if (await isFanBlocked(db, creatorId, fanId)) {
      return res.status(403).json({ error: "This member is blocked" });
    }

    const threadId = getThreadId(creatorId, fanId);
    const threadRef = db.collection(FAN_DM_THREADS).doc(threadId);
    const snap = await threadRef.get();
    const now = new Date().toISOString();
    let sessionId: string | null = null;

    if (!snap.exists) {
      await threadRef.set({
        creatorId,
        fanId,
        lastMessageAt: now,
        lastMessagePreview: "",
        fanHasSentMessage: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (startSession) {
      const sessionRef = db.collection("chatSessions").doc();
      sessionId = sessionRef.id;
      await sessionRef.set({
        creatorId,
        fanId,
        memberId: fanId,
        threadId,
        status: "active",
        durationMinutes: requestedDurationMinutes,
        chatType: chatType || "Custom",
        startedAt: now,
        scheduledStart: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (notifyFan) {
      try {
        if (startSession) {
          await sendFanNotification({
            fanId,
            type: "session_starting",
            title: "Chat session started",
            body: "Your creator started a live chat session with you.",
            data: {
              threadId,
              creatorId,
              fanId,
              ...(sessionId ? { sessionId } : {}),
            },
          });
        } else if (!snap.exists) {
          await sendFanNotification({
            fanId,
            type: "new_message",
            title: "New message from creator",
            body: "A creator started a conversation with you.",
            data: {
              threadId,
              creatorId,
              fanId,
            },
          });
        }
      } catch (notifyErr) {
        console.error("fanDmEnsureThread notify error:", notifyErr);
      }
    }

    return res.status(200).json({ threadId, creatorId, fanId, sessionId });
  } catch (e: unknown) {
    console.error("fanDmEnsureThread error:", e);
    return res.status(500).json({
      error: "Failed to open conversation",
      details: process.env.NODE_ENV === "development" ? (e as Error)?.message : undefined,
    });
  }
}
