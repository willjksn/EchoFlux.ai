import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { FAN_DM_THREADS } from "./_fanDmHelpers.js";
import { resolveFanPartyDisplayLabel } from "./_fanDmLabels.js";
import { buildCreatorImageUrlSet, fanAvatarUrlOrUndefined } from "../src/lib/fanAvatar.js";

type ThreadDoc = {
  creatorId: string;
  fanId: string;
  lastMessageAt: string;
  lastMessagePreview?: string;
  fanHasSentMessage?: boolean;
  creatorInboxPinned?: boolean;
  creatorInboxPinnedAt?: string;
  creatorInboxMuted?: boolean;
  creatorMarkedUnread?: boolean;
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

  const rlOk = await enforceRateLimit({
    req,
    res,
    keyPrefix: "fanDmThreads",
    limit: 60,
    windowMs: 60_000,
    identifier: decoded.uid,
  });
  if (!rlOk) return;

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

    let creatorInboxImageUrls = new Set<string>();
    if (as === "creator") {
      const [creatorUserSnap, creatorDocSnap] = await Promise.all([
        db.collection("users").doc(uid).get(),
        db.collection("creators").doc(uid).get(),
      ]);
      creatorInboxImageUrls = buildCreatorImageUrlSet(
        creatorUserSnap.exists ? (creatorUserSnap.data() as Record<string, unknown>) : undefined,
        creatorDocSnap.exists ? (creatorDocSnap.data() as Record<string, unknown>) : undefined
      );
    }

    /** Enrich all threads in parallel — sequential awaits were very slow for large inboxes. */
    const threads: Array<ThreadDoc & { id: string }> = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data() as ThreadDoc;
        const thread: ThreadDoc & { id: string } = { id: d.id, ...data };
        try {
          if (as === "fan") {
            const [creatorSnap, creatorUserSnap] = await Promise.all([
              db.collection("creators").doc(data.creatorId).get(),
              db.collection("users").doc(data.creatorId).get(),
            ]);
            if (creatorSnap.exists) {
              const c = creatorSnap.data() as { displayName?: string; avatar?: string; avatarUrl?: string; handle?: string };
              const creatorUser = creatorUserSnap.exists
                ? (creatorUserSnap.data() as { displayName?: string; username?: string; photoURL?: string; avatar?: string })
                : null;
              const fallbackHandle =
                typeof c?.handle === "string" && c.handle.trim()
                  ? `@${c.handle.replace(/^@/, "").trim().toLowerCase()}`
                  : "";
              thread.otherPartyDisplayName =
                c?.displayName?.trim() ||
                creatorUser?.displayName?.trim() ||
                (creatorUser?.username ? `@${creatorUser.username.replace(/^@/, "").trim().toLowerCase()}` : "") ||
                fallbackHandle ||
                "Creator";
              thread.otherPartyAvatar =
                c?.avatar || c?.avatarUrl || creatorUser?.photoURL || creatorUser?.avatar;
            } else {
              const creatorUser = creatorUserSnap.exists
                ? (creatorUserSnap.data() as { displayName?: string; username?: string; photoURL?: string; avatar?: string })
                : null;
              thread.otherPartyDisplayName =
                creatorUser?.displayName?.trim() ||
                (creatorUser?.username ? `@${creatorUser.username.replace(/^@/, "").trim().toLowerCase()}` : "") ||
                "Creator";
              thread.otherPartyAvatar = creatorUser?.photoURL || creatorUser?.avatar;
            }
          } else {
            const [fanLabel, userSnap] = await Promise.all([
              resolveFanPartyDisplayLabel(db, data.creatorId, data.fanId).catch(() => "Member"),
              db.collection("users").doc(data.fanId).get(),
            ]);
            thread.otherPartyDisplayName = fanLabel;
            if (userSnap.exists) {
              const u = userSnap.data() as {
                avatar?: string;
                photoURL?: string;
                photoUrl?: string;
                avatarUrl?: string;
              };
              const rawAvatar =
                (typeof u.avatarUrl === "string" && u.avatarUrl.trim()) ||
                (typeof u.photoURL === "string" && u.photoURL.trim()) ||
                (typeof u.photoUrl === "string" && u.photoUrl.trim()) ||
                (typeof u.avatar === "string" && u.avatar.trim()) ||
                "";
              thread.otherPartyAvatar =
                rawAvatar
                  ? fanAvatarUrlOrUndefined(rawAvatar, {
                      fanAuthUid: data.fanId,
                      creatorId: data.creatorId,
                      creatorImageUrls: creatorInboxImageUrls,
                    })
                  : undefined;
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
