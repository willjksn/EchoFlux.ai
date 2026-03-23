import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { FAN_DM_THREADS, getThreadId, isFanBlocked } from "./_fanDmHelpers.js";

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

    return res.status(200).json({ threadId, creatorId, fanId });
  } catch (e: unknown) {
    console.error("fanDmEnsureThread error:", e);
    return res.status(500).json({
      error: "Failed to open conversation",
      details: process.env.NODE_ENV === "development" ? (e as Error)?.message : undefined,
    });
  }
}
