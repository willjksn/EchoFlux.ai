import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";

function stringParam(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function normalizeStringArray(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    : [];
}

async function hasUnlockedPost(
  db: Firestore,
  creatorId: string,
  fanId: string,
  postId: string,
): Promise<boolean> {
  const grantSnap = await db
    .collection("creatorEntitlements")
    .doc(creatorId)
    .collection("grants")
    .doc(fanId)
    .get();
  const grant = grantSnap.data() as { unlockedFanPostIds?: unknown } | undefined;
  const unlocked = normalizeStringArray(grant?.unlockedFanPostIds);
  if (unlocked.includes(postId)) return true;

  const orderSnap = await db
    .collection("orders")
    .where("creatorId", "==", creatorId)
    .where("fanId", "==", fanId)
    .where("postId", "==", postId)
    .where("type", "==", "post_unlock")
    .limit(1)
    .get()
    .catch(() => null);
  if (!orderSnap || orderSnap.empty) return false;
  const status = String(orderSnap.docs[0].data().status || "paid").trim().toLowerCase();
  return status !== "refunded";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const creatorId = stringParam(req.query.creatorId);
  const postId = stringParam(req.query.postId);
  if (!creatorId || !postId) {
    return res.status(400).json({ error: "creatorId and postId are required" });
  }

  try {
    const db = getAdminDb();
    if (!db) return res.status(500).json({ error: "Database unavailable" });

    const postRef = db.collection("creators").doc(creatorId).collection("fanPosts").doc(postId);
    const postSnap = await postRef.get();
    if (!postSnap.exists) {
      return res.status(404).json({ error: "Post not found" });
    }
    const post = postSnap.data() as Record<string, unknown>;
    const locked = post.lockedContent as { enabled?: boolean } | undefined;
    const isCreator = decoded.uid === creatorId;
    const canView = isCreator || !locked?.enabled || (await hasUnlockedPost(db, creatorId, decoded.uid, postId));
    if (!canView) {
      return res.status(403).json({ error: "Post is locked" });
    }

    const privateSnap = await db
      .collection("creators")
      .doc(creatorId)
      .collection("fanPostPrivateMedia")
      .doc(postId)
      .get();
    const source = privateSnap.exists ? privateSnap.data() : post;
    const mediaUrls = normalizeStringArray(source?.mediaUrls);
    const mediaTypes = normalizeStringArray(source?.mediaTypes);

    return res.status(200).json({ postId, mediaUrls, mediaTypes });
  } catch (error) {
    console.error("fanPostMedia error:", error);
    return res.status(500).json({ error: "Failed to load post media" });
  }
}
