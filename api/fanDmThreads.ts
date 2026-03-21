import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { FAN_DM_THREADS } from "./_fanDmHelpers.js";
import { resolveFanPartyDisplayLabel } from "./_fanDmLabels.js";

type ThreadDoc = {
  creatorId: string;
  fanId: string;
  lastMessageAt: string;
  lastMessagePreview?: string;
  fanHasSentMessage?: boolean;
  createdAt: string;
  updatedAt: string;
  otherPartyDisplayName?: string;
  otherPartyAvatar?: string;
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

    /** Enrich all threads in parallel — sequential awaits were very slow for large inboxes. */
    const threads: Array<ThreadDoc & { id: string }> = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data() as ThreadDoc;
        const thread: ThreadDoc & { id: string } = { id: d.id, ...data };
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
            const [fanLabel, userSnap] = await Promise.all([
              resolveFanPartyDisplayLabel(db, data.creatorId, data.fanId).catch(() => "Member"),
              db.collection("users").doc(data.fanId).get(),
            ]);
            thread.otherPartyDisplayName = fanLabel;
            if (userSnap.exists) {
              const u = userSnap.data() as { avatar?: string };
              thread.otherPartyAvatar = u?.avatar;
            }
          }
        } catch {
          thread.otherPartyDisplayName = as === "creator" ? "Member" : "Creator";
        }
        return thread;
      })
    );

    return res.status(200).json({ threads });
  } catch (e: unknown) {
    console.error("fanDmThreads list error:", e);
    const msg = (e as Error)?.message || String(e);
    const missingAdmin =
      msg.includes("FIREBASE_SERVICE_ACCOUNT_KEY_BASE64") ||
      msg.includes("FIREBASE_ADMIN_KEY") ||
      msg.includes("Firebase Admin");
    return res.status(500).json({
      error: "Failed to list threads",
      details: process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV === "development" ? msg : undefined,
      hint: missingAdmin
        ? "Add FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 (or FIREBASE_ADMIN_KEY) to Vercel → Environment Variables for Preview, then redeploy. See docs/LOCAL_DEV.md"
        : msg.includes("index") || msg.includes("FAILED_PRECONDITION")
          ? "Deploy Firestore indexes (firebase deploy --only firestore:indexes) if this mentions a missing composite index."
          : undefined,
    });
  }
}
