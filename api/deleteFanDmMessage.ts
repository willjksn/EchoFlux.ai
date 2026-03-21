import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { DocumentReference } from "firebase-admin/firestore";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { FAN_DM_THREADS, FAN_DM_MESSAGES } from "./_fanDmHelpers.js";

function parseCreated(rawCreated: unknown): string {
  if (rawCreated && typeof (rawCreated as { toDate?: () => Date }).toDate === "function") {
    return (rawCreated as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof rawCreated === "string" || typeof rawCreated === "number") {
    const d = new Date(rawCreated);
    return Number.isFinite(d.getTime()) ? d.toISOString() : "";
  }
  return "";
}

/** Recompute thread lastMessageAt / preview from up to 500 messages (no orderBy — legacy rows). */
async function syncThreadPreviewFromMessages(threadRef: DocumentReference): Promise<void> {
  const snap = await threadRef.collection(FAN_DM_MESSAGES).limit(500).get();
  const now = new Date().toISOString();
  if (snap.empty) {
    await threadRef.update({
      lastMessageAt: now,
      lastMessagePreview: "",
      updatedAt: now,
    });
    return;
  }
  const rows = snap.docs.map((d) => {
    const data = d.data();
    const createdAt = parseCreated(data.createdAt);
    const content = String(data.content ?? "").trim();
    return {
      sortKey: createdAt || d.id,
      createdAt: createdAt || now,
      preview: content.slice(0, 200),
    };
  });
  rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const last = rows[rows.length - 1]!;
  await threadRef.update({
    lastMessageAt: last.createdAt,
    lastMessagePreview: last.preview || null,
    updatedAt: now,
  });
}

/**
 * Creator-only: delete one message and refresh thread preview fields.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const threadId = typeof body.threadId === "string" ? body.threadId.trim() : "";
  const messageId = typeof body.messageId === "string" ? body.messageId.trim() : "";
  if (!threadId || !messageId) {
    return res.status(400).json({ error: "threadId and messageId are required" });
  }

  try {
    const db = getAdminDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    const threadRef = db.collection(FAN_DM_THREADS).doc(threadId);
    const threadSnap = await threadRef.get();
    if (!threadSnap.exists) {
      return res.status(404).json({ error: "Thread not found" });
    }
    const thread = threadSnap.data() as { creatorId: string; fanId: string };
    if (thread.creatorId !== decoded.uid) {
      return res.status(403).json({ error: "Only the creator can delete messages" });
    }

    const msgRef = threadRef.collection(FAN_DM_MESSAGES).doc(messageId);
    const msgSnap = await msgRef.get();
    if (!msgSnap.exists) {
      return res.status(404).json({ error: "Message not found" });
    }

    await msgRef.delete();
    await syncThreadPreviewFromMessages(threadRef);

    return res.status(200).json({ success: true });
  } catch (e: unknown) {
    console.error("deleteFanDmMessage error:", e);
    return res.status(500).json({
      error: "Failed to delete message",
      details: process.env.NODE_ENV === "development" ? (e as Error)?.message : undefined,
    });
  }
}
