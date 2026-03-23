import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { FAN_DM_THREADS, FAN_DM_MESSAGES } from "./_fanDmHelpers.js";

const CHUNK = 400;

/**
 * Creator-only: delete a DM thread and all messages under fanDmThreads/{threadId}/messages.
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
  if (!threadId) {
    return res.status(400).json({ error: "threadId is required" });
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
      return res.status(403).json({ error: "Only the creator can delete this conversation" });
    }

    let deletedMessages = 0;
    for (;;) {
      const snap = await threadRef.collection(FAN_DM_MESSAGES).limit(CHUNK).get();
      if (snap.empty) break;
      const batch = db.batch();
      for (const d of snap.docs) {
        batch.delete(d.ref);
        deletedMessages++;
      }
      await batch.commit();
    }

    await threadRef.delete();
    return res.status(200).json({ success: true, deletedMessages });
  } catch (e: unknown) {
    console.error("deleteFanDmThread error:", e);
    return res.status(500).json({
      error: "Failed to delete conversation",
      details: process.env.NODE_ENV === "development" ? (e as Error)?.message : undefined,
    });
  }
}
