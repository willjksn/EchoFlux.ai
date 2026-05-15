/**
 * Sends a configurable automated DM when a fan first becomes a member (paid checkout or free join).
 * At most one automated welcome per creator–fan thread (see automatedMemberWelcomeSentAt on fanDmThreads).
 */
import type { Firestore } from "firebase-admin/firestore";
import {
  FAN_DM_THREADS,
  FAN_DM_MESSAGES,
  getThreadId,
  isFanBlocked,
} from "./_fanDmHelpers.js";
import {
  DM_MAX_ATTACHMENTS_PER_MESSAGE,
  previewTextForFanDmAttachments,
  type DmAttachmentItem,
} from "../src/lib/fanDmAttachments.js";
import { sendFanNotification } from "./_fanNotifications.js";

export type AutomatedMemberWelcomeSource = "paid_subscription" | "free_membership";

type MemberWelcomeFirestoreBlock = {
  enabled?: boolean;
  text?: string;
  attachments?: unknown;
};

async function hasActiveOrPausedChatSessionForThread(
  db: Firestore,
  creatorId: string,
  threadId: string,
): Promise<boolean> {
  const snap = await db
    .collection("chatSessions")
    .where("creatorId", "==", creatorId)
    .where("threadId", "==", threadId)
    .limit(40)
    .get();
  let live = false;
  snap.forEach((d) => {
    const st = (d.data() as { status?: string }).status;
    if (st === "active" || st === "paused") live = true;
  });
  return live;
}

function normalizeWelcomeAttachments(raw: unknown): DmAttachmentItem[] {
  if (!Array.isArray(raw)) return [];
  const out: DmAttachmentItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const url =
      typeof o.url === "string"
        ? o.url.trim()
        : typeof o.attachmentUrl === "string"
          ? o.attachmentUrl.trim()
          : "";
    const typeRaw =
      typeof o.type === "string"
        ? o.type.trim().toLowerCase()
        : typeof o.attachmentType === "string"
          ? String(o.attachmentType).trim().toLowerCase()
          : "";
    const type =
      typeRaw === "image" || typeRaw === "video" || typeRaw === "audio"
        ? (typeRaw as DmAttachmentItem["type"])
        : null;
    if (!url || !type) continue;
    out.push({ url, type });
    if (out.length >= DM_MAX_ATTACHMENTS_PER_MESSAGE) break;
  }
  return out;
}

/** Read welcome automation from creators/{creatorId}.monetization.memberWelcomeDm */
export function extractMemberWelcomeFromCreatorData(data: Record<string, unknown> | undefined): {
  enabled: boolean;
  content: string;
  attachments: DmAttachmentItem[];
} | null {
  const monetization = data?.monetization as { memberWelcomeDm?: MemberWelcomeFirestoreBlock } | undefined;
  const block = monetization?.memberWelcomeDm;
  if (!block || block.enabled !== true) return null;
  const content = typeof block.text === "string" ? block.text.trim() : "";
  const attachments = normalizeWelcomeAttachments(block.attachments);
  if (!content && attachments.length === 0) return null;
  return { enabled: true, content, attachments };
}

/**
 * Send automated welcome DM if configured. Safe to call on webhook retries.
 * Skips if this fan was already sent an automated welcome on this thread.
 */
export async function maybeSendAutomatedMemberWelcomeDm(
  db: Firestore,
  creatorId: string,
  fanId: string,
  nowIso: string,
  opts: {
    source: AutomatedMemberWelcomeSource;
  },
): Promise<void> {
  if (!creatorId || !fanId) return;

  const creatorSnap = await db.collection("creators").doc(creatorId).get();
  const welcome = extractMemberWelcomeFromCreatorData(
    creatorSnap.exists ? (creatorSnap.data() as Record<string, unknown>) : undefined,
  );
  if (!welcome) return;

  if (await isFanBlocked(db, creatorId, fanId)) {
    console.log(`member welcome: skip (fan blocked) creator=${creatorId} fan=${fanId}`);
    return;
  }

  const threadId = getThreadId(creatorId, fanId);

  await db.runTransaction(async (t) => {
    const threadRef = db.collection(FAN_DM_THREADS).doc(threadId);
    const threadSnap = await t.get(threadRef);
    if (!threadSnap.exists) {
      throw new Error(`member welcome: thread missing ${threadId}`);
    }
    const threadData = threadSnap.data() as {
      creatorId?: string;
      fanId?: string;
      automatedMemberWelcomeSentAt?: string;
    };
    if (threadData?.creatorId !== creatorId || threadData?.fanId !== fanId) {
      throw new Error("member welcome: thread participants mismatch");
    }
    const prior =
      typeof threadData.automatedMemberWelcomeSentAt === "string" ? threadData.automatedMemberWelcomeSentAt.trim() : "";
    if (prior.length > 0) {
      return;
    }

    const previewText = previewTextForFanDmAttachments(welcome.content, welcome.attachments);
    const msgRef = threadRef.collection(FAN_DM_MESSAGES).doc();

    const msgPayload: Record<string, unknown> = {
      senderId: creatorId,
      content: welcome.content || "",
      createdAt: nowIso,
      read: false,
      automatedMemberWelcome: true,
      automatedMemberWelcomeSource: opts.source,
    };
    if (welcome.attachments.length === 1) {
      msgPayload.attachmentUrl = welcome.attachments[0].url;
      msgPayload.attachmentType = welcome.attachments[0].type;
    } else if (welcome.attachments.length > 1) {
      msgPayload.attachments = welcome.attachments;
    }

    t.set(msgRef, msgPayload);
    t.set(
      threadRef,
      {
        lastMessageAt: nowIso,
        lastMessagePreview: previewText,
        updatedAt: nowIso,
        automatedMemberWelcomeSentAt: nowIso,
      },
      { merge: true },
    );
  });

  const skipNotifyForLiveSession = await hasActiveOrPausedChatSessionForThread(db, creatorId, threadId);

  try {
    if (!skipNotifyForLiveSession) {
      const previewText = previewTextForFanDmAttachments(welcome.content, welcome.attachments);
      await sendFanNotification({
        fanId,
        type: "new_message",
        title: "New message from creator",
        body: (welcome.content || previewText).slice(0, 200),
        data: {
          threadId,
          creatorId,
          fanId,
        },
      });
    }
  } catch (e) {
    console.warn("member welcome: notification failed (message still sent)", e);
  }
}
