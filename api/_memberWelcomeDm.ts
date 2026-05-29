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
import { hasLiveChatSessionForDmThread } from "./_chatSessionDmNotifyGuard.js";

export type AutomatedMemberWelcomeSource = "paid_subscription" | "free_membership";

type MemberWelcomeFirestoreBlock = {
  enabled?: boolean;
  text?: string;
  attachments?: unknown;
  /** Default true: replace {{name}} with fan first name when sending. */
  includeMemberFirstName?: boolean;
};

/** Strip `{{name}}` and tidy punctuation/spacing (when welcome is sent without personalization). */
export function stripWelcomeNamePlaceholder(content: string): string {
  let s = content.replace(/\{\{\s*name\s*\}\}/gi, "").trim();
  s = s.replace(/^[,\u2014\u2013\-–:\s]+/, "");
  s = s.replace(/\s{2,}/g, " ");
  return s.trim();
}

function firstWelcomeNameToken(raw: string | undefined): string | null {
  const s = raw?.trim();
  if (!s || s.toLowerCase() === "member") return null;
  const token = (s.split(/\s+/)[0] ?? "").replace(/^@/, "").trim();
  if (!token || token.includes("@")) return null;
  return token.slice(0, 60) || null;
}

async function resolveFanFirstNameForWelcome(db: Firestore, creatorId: string, fanId: string): Promise<string | null> {
  const [userSnap, fanSnap] = await Promise.all([
    db.collection("users").doc(fanId).get(),
    db.collection("creators").doc(creatorId).collection("fans").doc(fanId).get(),
  ]);
  const u = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};
  const f = fanSnap.exists ? (fanSnap.data() as Record<string, unknown>) : {};
  const fromName =
    firstWelcomeNameToken(typeof u.name === "string" ? u.name : undefined) ??
    firstWelcomeNameToken(typeof f.name === "string" ? f.name : undefined);
  if (fromName) return fromName;
  const fromDn =
    firstWelcomeNameToken(typeof u.displayName === "string" ? u.displayName : undefined) ??
    firstWelcomeNameToken(typeof f.displayName === "string" ? f.displayName : undefined);
  if (fromDn && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromDn)) return fromDn;
  const uname = typeof u.username === "string" ? u.username.trim().replace(/^@/, "") : "";
  if (uname && !uname.includes("@")) return firstWelcomeNameToken(uname);
  return null;
}

export function finalizeAutomatedWelcomeText(template: string, includeMemberFirstName: boolean, firstName: string | null): string {
  if (!includeMemberFirstName) return stripWelcomeNamePlaceholder(template);
  const fn = firstName?.trim();
  if (!fn) return stripWelcomeNamePlaceholder(template);
  return template.replace(/\{\{\s*name\s*\}\}/gi, fn);
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
  includeMemberFirstName: boolean;
} | null {
  const monetization = data?.monetization as { memberWelcomeDm?: MemberWelcomeFirestoreBlock } | undefined;
  const block = monetization?.memberWelcomeDm;
  if (!block || block.enabled !== true) return null;
  const content = typeof block.text === "string" ? block.text.trim() : "";
  const attachments = normalizeWelcomeAttachments(block.attachments);
  const includeMemberFirstName = block.includeMemberFirstName !== false;
  if (!content && attachments.length === 0) return null;
  return { enabled: true, content, attachments, includeMemberFirstName };
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

  const firstName = welcome.includeMemberFirstName ? await resolveFanFirstNameForWelcome(db, creatorId, fanId) : null;
  const resolvedContent = finalizeAutomatedWelcomeText(welcome.content, welcome.includeMemberFirstName, firstName);

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

    const previewText = previewTextForFanDmAttachments(resolvedContent, welcome.attachments);
    const msgRef = threadRef.collection(FAN_DM_MESSAGES).doc();

    const msgPayload: Record<string, unknown> = {
      senderId: creatorId,
      content: resolvedContent || "",
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

  const skipNotifyForLiveSession = await hasLiveChatSessionForDmThread(db, creatorId, threadId);

  try {
    if (!skipNotifyForLiveSession) {
      const previewText = previewTextForFanDmAttachments(resolvedContent, welcome.attachments);
      await sendFanNotification({
        fanId,
        type: "new_message",
        title: "New message from creator",
        body: (resolvedContent || previewText).slice(0, 200),
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
