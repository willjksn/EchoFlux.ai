import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { FAN_DM_THREADS, FAN_DM_MESSAGES } from "./_fanDmHelpers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const threadId = req.query.threadId as string;
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
    const uid = decoded.uid;
    if (thread.creatorId !== uid && thread.fanId !== uid) {
      return res.status(403).json({ error: "Not a participant" });
    }

    const messagesSnap = await db
      .collection(FAN_DM_THREADS)
      .doc(threadId)
      .collection(FAN_DM_MESSAGES)
      .orderBy("createdAt", "asc")
      .limit(500)
      .get();

    const messages = messagesSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        threadId,
        senderId: data.senderId,
        content: data.content,
        createdAt: data.createdAt,
        reported: data.reported,
        reportId: data.reportId,
      };
    });

    return res.status(200).json({ messages, creatorId: thread.creatorId, fanId: thread.fanId });
  } catch (e: unknown) {
    console.error("fanDmMessages error:", e);
    return res.status(500).json({
      error: "Failed to load messages",
      details: process.env.NODE_ENV === "development" ? (e as Error)?.message : undefined,
    });
  }
}
