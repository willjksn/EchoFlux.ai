import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { enforceRateLimit } from "./_rateLimit.js";
import {
  FAN_DM_THREADS,
  FAN_DM_MESSAGES,
  getThreadId,
  isFanBlocked,
} from "./_fanDmHelpers.js";
import { sendFanNotification } from "./_fanNotifications.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const uid = decoded.uid;
  const ok = await enforceRateLimit({
    req,
    res,
    keyPrefix: "fanDmSend",
    limit: 30,
    windowMs: 60 * 1000,
    identifier: uid,
  });
  if (!ok) return;

  const body = (req.body || {}) as Record<string, unknown>;
  const creatorId = body.creatorId as string;
  const fanId = body.fanId as string;
  const threadIdParam = body.threadId as string | undefined;
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const attachmentUrl = typeof body.attachmentUrl === "string" ? body.attachmentUrl.trim() : "";
  const attachmentTypeRaw = body.attachmentType;
  const attachmentType =
    attachmentTypeRaw === "image" || attachmentTypeRaw === "video" || attachmentTypeRaw === "audio"
      ? attachmentTypeRaw
      : undefined;
  if (!content && !attachmentUrl) {
    return res.status(400).json({ error: "content or attachmentUrl is required" });
  }

  let creatorIdFinal: string;
  let fanIdFinal: string;
  let threadId: string;

  if (threadIdParam) {
    threadId = threadIdParam;
    const db = getAdminDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });
    const threadSnap = await db.collection(FAN_DM_THREADS).doc(threadId).get();
    if (!threadSnap.exists) {
      return res.status(404).json({ error: "Thread not found" });
    }
    const t = threadSnap.data() as { creatorId: string; fanId: string };
    creatorIdFinal = t.creatorId;
    fanIdFinal = t.fanId;
    if (uid !== t.creatorId && uid !== t.fanId) {
      return res.status(403).json({ error: "Not a participant" });
    }
    // Fans must pass creatorId matching the thread. Otherwise a stale threadId from another
    // creator's storefront could deliver messages to the wrong inbox.
    if (uid === t.fanId) {
      const bodyCreator = typeof body.creatorId === "string" ? body.creatorId.trim() : "";
      if (!bodyCreator || bodyCreator !== t.creatorId) {
        return res.status(400).json({
          error: "creatorId must match the creator you are messaging",
          code: "CREATOR_THREAD_MISMATCH",
        });
      }
    }
    if (uid === t.creatorId && typeof body.fanId === "string" && body.fanId.trim() && body.fanId.trim() !== t.fanId) {
      return res.status(400).json({ error: "fanId does not match this thread" });
    }
  } else if (creatorId && fanId) {
    creatorIdFinal = creatorId;
    fanIdFinal = fanId;
    threadId = getThreadId(creatorId, fanId);
    if (uid !== creatorId && uid !== fanId) {
      return res.status(403).json({ error: "Not a participant" });
    }
  } else {
    return res.status(400).json({ error: "threadId or (creatorId and fanId) is required" });
  }

  try {
    const db = getAdminDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    // Ban check: if fan is sending to creator, ensure fan is not blocked
    if (uid === fanIdFinal && (await isFanBlocked(db, creatorIdFinal, fanIdFinal))) {
      return res.status(403).json({ error: "You cannot message this creator" });
    }

    const now = new Date().toISOString();
    const threadRef = db.collection(FAN_DM_THREADS).doc(threadId);
    const threadSnap = await threadRef.get();
    const fanHasSentMessage = uid === fanIdFinal;

    const previewText =
      content.slice(0, 100) ||
      (attachmentType === "image"
        ? "📷 Photo"
        : attachmentType === "video"
          ? "🎬 Video"
          : attachmentType === "audio"
            ? "🎤 Voice message"
            : attachmentUrl
              ? "Attachment"
              : "");

    if (!threadSnap.exists) {
      await threadRef.set({
        creatorId: creatorIdFinal,
        fanId: fanIdFinal,
        lastMessageAt: now,
        lastMessagePreview: previewText,
        fanHasSentMessage,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      const update: Record<string, unknown> = {
        lastMessageAt: now,
        lastMessagePreview: previewText,
        updatedAt: now,
      };
      if (fanHasSentMessage) update.fanHasSentMessage = true;
      await threadRef.update(update);
    }

    const msgRef = threadRef.collection(FAN_DM_MESSAGES).doc();
    const msgPayload: Record<string, unknown> = {
      senderId: uid,
      content: content || "",
      createdAt: now,
      read: false,
    };
    if (attachmentUrl) msgPayload.attachmentUrl = attachmentUrl;
    if (attachmentType) msgPayload.attachmentType = attachmentType;
    await msgRef.set(msgPayload);

    const recipientId = uid === fanIdFinal ? creatorIdFinal : fanIdFinal;
    const threadAfter = (await threadRef.get()).data() as { creatorInboxMuted?: boolean } | undefined;
    const creatorMutedThisThread =
      recipientId === creatorIdFinal && threadAfter?.creatorInboxMuted === true;

    try {
      if (!creatorMutedThisThread) {
        await sendFanNotification({
          fanId: recipientId,
          type: "new_message",
          title: uid === fanIdFinal ? "New message from a fan" : "New reply from creator",
          body: (content || previewText).slice(0, 200),
          data: {
            threadId,
            creatorId: creatorIdFinal,
            fanId: fanIdFinal,
          },
        });
      }
    } catch (notifyErr) {
      console.error("fanDmSend: notification failed (message still sent)", notifyErr);
    }

    return res.status(201).json({
      message: {
        id: msgRef.id,
        threadId,
        senderId: uid,
        content: content || "",
        createdAt: now,
        read: false,
        ...(attachmentUrl ? { attachmentUrl, attachmentType } : {}),
      },
    });
  } catch (e: unknown) {
    console.error("fanDmSend error:", e);
    return res.status(500).json({
      error: "Failed to send message",
      details: process.env.NODE_ENV === "development" ? (e as Error)?.message : undefined,
    });
  }
}
