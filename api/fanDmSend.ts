import type { VercelRequest, VercelResponse } from "@vercel/node";
import { tryGetAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { enforceRateLimit } from "./_rateLimit.js";
import {
  FAN_DM_THREADS,
  FAN_DM_MESSAGES,
  getThreadId,
  isFanBlocked,
} from "./_fanDmHelpers.js";
import {
  parseIncomingFanDmAttachments,
  previewTextForFanDmAttachments,
} from "../src/lib/fanDmAttachments.js";
import {
  resolveMemberHubNewMessagePushLink,
  sendCreatorHubNotification,
  sendFanNotification,
} from "./_fanNotifications.js";
import { hasLiveChatSessionForDmThread } from "./_chatSessionDmNotifyGuard.js";
import { fanHasActiveHubMembershipForCreator } from "./_fanHubMemberAccess.js";

/** Vercel usually parses JSON; some proxies / versions may leave a string or Buffer. */
function parseFanDmRequestBody(req: VercelRequest): Record<string, unknown> {
  const b = req.body as unknown;
  if (b == null || b === "") return {};
  if (typeof b === "string") {
    try {
      const parsed = JSON.parse(b) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(b)) {
    try {
      const parsed = JSON.parse(b.toString("utf8")) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }
  if (typeof b === "object" && !Array.isArray(b)) return b as Record<string, unknown>;
  return {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
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

  const body = parseFanDmRequestBody(req);
  const creatorId = body.creatorId as string;
  const fanId = body.fanId as string;
  const threadIdParam = body.threadId as string | undefined;
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const attachmentList = parseIncomingFanDmAttachments(body);
  if (!content && attachmentList.length === 0) {
    const hadAttachmentsKey = Object.prototype.hasOwnProperty.call(body, "attachments");
    return res.status(400).json({
      error: "content or at least one attachment is required",
      ...(hadAttachmentsKey
        ? {
            code: "ATTACHMENTS_UNREADABLE",
            hint: "The server could not read any valid items from `attachments`. Each entry needs { url, type } where type is image|video|audio.",
          }
        : {}),
    });
  }

  let creatorIdFinal: string;
  let fanIdFinal: string;
  let threadId: string;

  if (threadIdParam) {
    threadId = threadIdParam;
    const db = tryGetAdminDb();
    if (!db) {
      return res.status(503).json({
        error: "Database unavailable",
        code: "FIREBASE_ADMIN_NOT_CONFIGURED",
        hint:
          "Firebase Admin failed to initialize. In Vercel → Project → Settings → Environment Variables, set FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 or FIREBASE_ADMIN_KEY for the environment you deployed (Production vs Preview), then redeploy.",
      });
    }
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
    if (uid === t.creatorId) {
      const bodyCreator = typeof body.creatorId === "string" ? body.creatorId.trim() : "";
      if (bodyCreator && bodyCreator !== t.creatorId) {
        return res.status(400).json({ error: "creatorId does not match this thread" });
      }
      const bodyFan = typeof body.fanId === "string" ? body.fanId.trim() : "";
      if (bodyFan && bodyFan !== t.fanId) {
        return res.status(400).json({ error: "fanId does not match this thread" });
      }
    }
    // Doc id must always match embedded participants (one thread per creator–fan pair).
    if (getThreadId(t.creatorId, t.fanId) !== threadId) {
      return res.status(400).json({ error: "Invalid thread record" });
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

  if (getThreadId(creatorIdFinal, fanIdFinal) !== threadId) {
    return res.status(400).json({ error: "Thread ID does not match creator and fan" });
  }

  try {
    const db = tryGetAdminDb();
    if (!db) {
      return res.status(503).json({
        error: "Database unavailable",
        code: "FIREBASE_ADMIN_NOT_CONFIGURED",
        hint:
          "Firebase Admin failed to initialize. In Vercel → Project → Settings → Environment Variables, set FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 or FIREBASE_ADMIN_KEY for the environment you deployed (Production vs Preview), then redeploy.",
      });
    }

    // Ban check: if fan is sending to creator, ensure fan is not blocked
    if (uid === fanIdFinal && (await isFanBlocked(db, creatorIdFinal, fanIdFinal))) {
      return res.status(403).json({ error: "You cannot message this creator" });
    }

    if (uid === fanIdFinal) {
      const hasMembership = await fanHasActiveHubMembershipForCreator(db, creatorIdFinal, fanIdFinal);
      if (!hasMembership) {
        return res.status(403).json({
          error: "Your membership has ended. Resubscribe on this creator's page to send messages.",
          code: "MEMBERSHIP_EXPIRED",
        });
      }
    }

    const now = new Date().toISOString();
    const threadRef = db.collection(FAN_DM_THREADS).doc(threadId);
    const threadSnap = await threadRef.get();
    const fanHasSentMessage = uid === fanIdFinal;

    const previewText = previewTextForFanDmAttachments(content, attachmentList);

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
      const existing = threadSnap.data() as { creatorId?: string; fanId?: string } | undefined;
      if (existing?.creatorId !== creatorIdFinal || existing?.fanId !== fanIdFinal) {
        return res.status(409).json({ error: "Thread participants do not match this conversation" });
      }
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
    if (attachmentList.length === 1) {
      msgPayload.attachmentUrl = attachmentList[0].url;
      msgPayload.attachmentType = attachmentList[0].type;
    } else if (attachmentList.length > 1) {
      msgPayload.attachments = attachmentList;
    }
    await msgRef.set(msgPayload);

    const recipientId = uid === fanIdFinal ? creatorIdFinal : fanIdFinal;
    const threadAfter = (await threadRef.get()).data() as { creatorInboxMuted?: boolean } | undefined;
    const creatorMutedThisThread =
      recipientId === creatorIdFinal && threadAfter?.creatorInboxMuted === true;

    const skipNotifyForLiveSession = await hasLiveChatSessionForDmThread(db, creatorIdFinal, threadId);

    try {
      if (!creatorMutedThisThread && !skipNotifyForLiveSession) {
        const notifyTitle =
          uid === fanIdFinal ? "New message from a fan" : "New reply from creator";
        const notifyBody = (content || previewText).slice(0, 200);
        const notifyData = {
          threadId,
          creatorId: creatorIdFinal,
          fanId: fanIdFinal,
        };

        if (recipientId === creatorIdFinal) {
          await sendCreatorHubNotification({
            creatorId: creatorIdFinal,
            type: "new_message",
            title: notifyTitle,
            body: notifyBody,
            data: notifyData,
          });
        } else {
          const pushUrl = await resolveMemberHubNewMessagePushLink(creatorIdFinal, threadId);
          await sendFanNotification({
            fanId: recipientId,
            type: "new_message",
            title: notifyTitle,
            body: notifyBody,
            data: pushUrl ? { ...notifyData, url: pushUrl } : notifyData,
          });
        }
      }
    } catch (notifyErr) {
      console.error("fanDmSend: notification failed (message still sent)", notifyErr);
    }

    const responseAttachments =
      attachmentList.length === 1
        ? { attachmentUrl: attachmentList[0].url, attachmentType: attachmentList[0].type }
        : attachmentList.length > 1
          ? { attachments: attachmentList }
          : {};

    return res.status(201).json({
      message: {
        id: msgRef.id,
        threadId,
        senderId: uid,
        content: content || "",
        createdAt: now,
        read: false,
        ...responseAttachments,
      },
    });
  } catch (e: unknown) {
    console.error("fanDmSend error:", e);
    return res.status(500).json({
      error: "Failed to send message",
      details: process.env.NODE_ENV === "development" ? (e as Error)?.message : undefined,
    });
  }
  } catch (fatal: unknown) {
    console.error("fanDmSend uncaught:", fatal);
    if (!res.headersSent) {
      return res.status(500).json({
        error: "Failed to process request",
        code: "UNHANDLED",
        hint:
          "See Vercel → this project → Logs. Typical causes: Firestore error during thread load, rate limiter failure, or an unexpected exception. Confirm FIREBASE_* env vars on this deployment.",
        details:
          process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV === "development"
            ? fatal instanceof Error
              ? fatal.message
              : String(fatal)
            : undefined,
      });
    }
  }
}
