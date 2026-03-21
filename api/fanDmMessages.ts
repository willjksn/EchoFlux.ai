import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { FAN_DM_THREADS, FAN_DM_MESSAGES } from "./_fanDmHelpers.js";
import { resolveFanPartyDisplayLabel, resolveCreatorPartyDisplayLabel } from "./_fanDmLabels.js";

const BATCH_SIZE = 400;

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

    // Avoid orderBy("createdAt"): Firestore drops docs missing that field (some migrated Stormij rows).
    const messagesSnap = await db
      .collection(FAN_DM_THREADS)
      .doc(threadId)
      .collection(FAN_DM_MESSAGES)
      .limit(500)
      .get();

    const parseCreated = (rawCreated: unknown): string => {
      if (rawCreated && typeof (rawCreated as { toDate?: () => Date }).toDate === "function") {
        return (rawCreated as { toDate: () => Date }).toDate().toISOString();
      }
      if (typeof rawCreated === "string" || typeof rawCreated === "number") {
        const d = new Date(rawCreated);
        return Number.isFinite(d.getTime()) ? d.toISOString() : "";
      }
      return "";
    };

    /**
     * Read receipts are for the creator only: when the fan opens the thread, mark creator-sent
     * messages as read (Stormij-style). Creator opening the thread does not mark fan messages.
     */
    const toMarkRead: QueryDocumentSnapshot[] = [];
    if (uid === thread.fanId) {
      for (const d of messagesSnap.docs) {
        const data = d.data();
        if (data.read === true) continue;
        if (data.senderId === thread.creatorId) toMarkRead.push(d);
      }
    }

    const markedIds = new Set<string>();
    for (let i = 0; i < toMarkRead.length; i += BATCH_SIZE) {
      const chunk = toMarkRead.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      for (const d of chunk) {
        batch.update(d.ref, { read: true });
        markedIds.add(d.id);
      }
      await batch.commit();
    }

    const [fanLabel, creatorLabel] = await Promise.all([
      resolveFanPartyDisplayLabel(db, thread.creatorId, thread.fanId),
      resolveCreatorPartyDisplayLabel(db, thread.creatorId),
    ]);

    const messages = messagesSnap.docs
      .map((d) => {
        const data = d.data();
        const createdAt = parseCreated(data.createdAt);
        const read = data.read === true || markedIds.has(d.id);
        return {
          id: d.id,
          threadId,
          senderId: data.senderId,
          content: data.content,
          createdAt,
          read,
          reported: data.reported,
          reportId: data.reportId,
          _sort: createdAt || d.id,
        };
      })
      .sort((a, b) => a._sort.localeCompare(b._sort))
      .map(({ _sort: _s, ...m }) => m);

    return res.status(200).json({
      messages,
      creatorId: thread.creatorId,
      fanId: thread.fanId,
      labels: { fan: fanLabel, creator: creatorLabel },
    });
  } catch (e: unknown) {
    console.error("fanDmMessages error:", e);
    return res.status(500).json({
      error: "Failed to load messages",
      details: process.env.NODE_ENV === "development" ? (e as Error)?.message : undefined,
    });
  }
}
