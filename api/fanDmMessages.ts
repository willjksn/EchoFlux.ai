import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { QuerySnapshot } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { FAN_DM_THREADS, FAN_DM_MESSAGES } from "./_fanDmHelpers.js";
import { resolveFanPartyDisplayLabel, resolveCreatorPartyDisplayLabel } from "./_fanDmLabels.js";
import { firestoreDataToMessageAttachmentFields } from "../src/lib/fanDmAttachments.js";

/** Smaller default = fewer Firestore docs per open (cost). */
const MSG_LIMIT_DEFAULT = 50;
const MSG_LIMIT_MAX = 200;

async function loadMessagesSnapshot(
  threadId: string,
  limitNum: number,
  beforeIso?: string
): Promise<{ snap: QuerySnapshot; usedOrderBy: boolean }> {
  const db = getAdminDb();
  if (!db) throw new Error("Database unavailable");
  const base = db.collection(FAN_DM_THREADS).doc(threadId).collection(FAN_DM_MESSAGES);
  const beforeMs = beforeIso ? Date.parse(beforeIso) : NaN;
  const hasBefore = Number.isFinite(beforeMs);

  try {
    if (hasBefore) {
      const cutoff = Timestamp.fromMillis(beforeMs);
      const snap = await base.where("createdAt", "<", cutoff).orderBy("createdAt", "desc").limit(limitNum).get();
      return { snap, usedOrderBy: true };
    }
    const snap = await base.orderBy("createdAt", "desc").limit(limitNum).get();
    return { snap, usedOrderBy: true };
  } catch (e) {
    console.warn("fanDmMessages: ordered query failed, falling back", e);
    if (hasBefore) {
      const snap = await base.limit(limitNum).get();
      return { snap, usedOrderBy: false };
    }
    const snap = await base.limit(limitNum).get();
    return { snap, usedOrderBy: false };
  }
}

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

  const beforeCreatedAt =
    typeof req.query.beforeCreatedAt === "string" ? req.query.beforeCreatedAt.trim() : "";

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

    const limitNum = Math.min(
      Math.max(parseInt(String(req.query.limit || String(MSG_LIMIT_DEFAULT)), 10) || MSG_LIMIT_DEFAULT, 1),
      MSG_LIMIT_MAX
    );
    const { snap: messagesSnap, usedOrderBy } = await loadMessagesSnapshot(
      threadId,
      limitNum,
      beforeCreatedAt || undefined
    );

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

    const isFanViewer = uid === thread.fanId;

    const labelsPromise =
      beforeCreatedAt || !isFanViewer
        ? Promise.resolve<{ fan: string; creator: string } | null>(null)
        : Promise.all([
            resolveFanPartyDisplayLabel(db, thread.creatorId, thread.fanId),
            resolveCreatorPartyDisplayLabel(db, thread.creatorId),
          ]).then(([fan, creator]) => ({ fan, creator }));

    const labels = await labelsPromise;

    if (uid === thread.creatorId && !beforeCreatedAt) {
      void db
        .collection(FAN_DM_THREADS)
        .doc(threadId)
        .update({
          creatorMarkedUnread: false,
          updatedAt: new Date().toISOString(),
        })
        .catch((clearErr) => {
          console.warn("fanDmMessages: could not clear creatorMarkedUnread", clearErr);
        });
    }

    const docOrder = usedOrderBy ? [...messagesSnap.docs].reverse() : messagesSnap.docs;

    const messages = docOrder
      .map((d) => {
        const data = d.data();
        const createdAt = parseCreated(data.createdAt);
        const fromCreator = data.senderId === thread.creatorId;
        const read = data.read === true || (isFanViewer && fromCreator);
        const att = firestoreDataToMessageAttachmentFields(data as Record<string, unknown>);
        return {
          id: d.id,
          threadId,
          senderId: data.senderId,
          content: data.content,
          createdAt,
          read,
          ...att,
          reported: data.reported,
          reportId: data.reportId,
          _sort: createdAt || d.id,
        };
      })
      .sort((a, b) => a._sort.localeCompare(b._sort))
      .map(({ _sort: _s, ...m }) => m);

    const hasMoreOlder = messagesSnap.docs.length === limitNum;

    return res.status(200).json({
      messages,
      creatorId: thread.creatorId,
      fanId: thread.fanId,
      hasMoreOlder,
      ...(labels ? { labels } : {}),
    });
  } catch (e: unknown) {
    console.error("fanDmMessages error:", e);
    return res.status(500).json({
      error: "Failed to load messages",
      details: process.env.NODE_ENV === "development" ? (e as Error)?.message : undefined,
    });
  }
}
