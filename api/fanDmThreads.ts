import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { FAN_DM_THREADS, getThreadId } from "./_fanDmHelpers.js";

type ThreadDoc = {
  creatorId: string;
  fanId: string;
  lastMessageAt: string;
  lastMessagePreview?: string;
  createdAt: string;
  updatedAt: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const as = (req.query.as as string) || "fan"; // "fan" | "creator"
  const uid = decoded.uid;

  try {
    const db = getAdminDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    const col = db.collection(FAN_DM_THREADS);
    const field = as === "creator" ? "creatorId" : "fanId";
    const snap = await col
      .where(field, "==", uid)
      .orderBy("lastMessageAt", "desc")
      .limit(100)
      .get();

    const threads: Array<ThreadDoc & { id: string; otherPartyDisplayName?: string; otherPartyAvatar?: string }> = [];
    for (const d of snap.docs) {
      const data = d.data() as ThreadDoc;
      const thread = { id: d.id, ...data };
      const otherId = as === "creator" ? data.fanId : data.creatorId;
      try {
        if (as === "fan") {
          const creatorSnap = await db.collection("creators").doc(data.creatorId).get();
          if (creatorSnap.exists) {
            const c = creatorSnap.data() as { displayName?: string; avatar?: string };
            thread.otherPartyDisplayName = c?.displayName || "Creator";
            thread.otherPartyAvatar = c?.avatar;
          } else {
            thread.otherPartyDisplayName = "Creator";
          }
        } else {
          const userSnap = await db.collection("users").doc(data.fanId).get();
          if (userSnap.exists) {
            const u = userSnap.data() as { name?: string; displayName?: string; avatar?: string };
            thread.otherPartyDisplayName = u?.displayName || u?.name || "Fan";
            thread.otherPartyAvatar = u?.avatar;
          } else {
            thread.otherPartyDisplayName = "Fan";
          }
        }
      } catch {
        thread.otherPartyDisplayName = as === "creator" ? "Fan" : "Creator";
      }
      threads.push(thread);
    }

    return res.status(200).json({ threads });
  } catch (e: unknown) {
    console.error("fanDmThreads list error:", e);
    return res.status(500).json({
      error: "Failed to list threads",
      details: process.env.NODE_ENV === "development" ? (e as Error)?.message : undefined,
    });
  }
}
