import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { FAN_DM_MESSAGES, FAN_DM_THREADS, getThreadId } from "./_fanDmHelpers.js";

const CHUNK = 400;

/**
 * Creator-only: remove a fan/member from Fan Hub — DM thread (all messages),
 * live video chat sessions for this fan, fan card (creators/fans + preferences),
 * entitlements/subscriber rows, legacy fanUsers by email.
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
  const fanId = typeof body.fanId === "string" ? body.fanId.trim() : "";
  const fanEmail = typeof body.fanEmail === "string" ? body.fanEmail.trim().toLowerCase() : "";
  if (!fanId) {
    return res.status(400).json({ error: "fanId is required" });
  }

  const creatorId = decoded.uid;

  try {
    const db = getAdminDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    const threadId = getThreadId(creatorId, fanId);
    const threadRef = db.collection(FAN_DM_THREADS).doc(threadId);
    const threadSnap = await threadRef.get();
    if (threadSnap.exists) {
      const t = threadSnap.data() as { creatorId?: string; fanId?: string };
      if (t.creatorId !== creatorId) {
        return res.status(403).json({ error: "Not authorized to remove this member" });
      }
      for (;;) {
        const snap = await threadRef.collection(FAN_DM_MESSAGES).limit(CHUNK).get();
        if (snap.empty) break;
        const batch = db.batch();
        for (const d of snap.docs) batch.delete(d.ref);
        await batch.commit();
      }
      await threadRef.delete();
    }

    const lvSnap = await db
      .collection("creators")
      .doc(creatorId)
      .collection("liveVideoChats")
      .where("fanId", "==", fanId)
      .limit(500)
      .get();
    for (const d of lvSnap.docs) {
      await d.ref.delete();
    }

    await db.collection("creators").doc(creatorId).collection("fans").doc(fanId).delete().catch(() => {});
    await db
      .collection("users")
      .doc(creatorId)
      .collection("onlyfans_fan_preferences")
      .doc(fanId)
      .delete()
      .catch(() => {});

    await db.collection("creatorEntitlements").doc(creatorId).collection("grants").doc(fanId).delete().catch(() => {});
    await db.collection("creatorSubscribers").doc(creatorId).collection("subscribers").doc(fanId).delete().catch(() => {});

    if (fanEmail) {
      const fuSnap = await db
        .collection("creators")
        .doc(creatorId)
        .collection("fanUsers")
        .where("email", "==", fanEmail)
        .limit(50)
        .get();
      for (const d of fuSnap.docs) {
        await d.ref.delete();
      }
    }

    return res.status(200).json({ success: true });
  } catch (e: unknown) {
    console.error("deleteFanHubMember error:", e);
    return res.status(500).json({
      error: "Failed to remove member",
      details: process.env.NODE_ENV === "development" ? (e as Error)?.message : undefined,
    });
  }
}
