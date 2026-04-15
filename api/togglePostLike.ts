import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { DocumentReference } from "firebase-admin/firestore";
import { getVerifyAuth, withErrorHandling } from "./_errorHandler.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { applyBrowserApiCors } from "./_browserApiCors.js";

/** Toggle current user's like on a fan hub post (mirrors stored in creators/.../fanPosts, users/.../posts, creators/.../posts). */
async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (applyBrowserApiCors(req, res)) return;

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let tokenUser: { uid: string } | null;
  try {
    const verifyAuth = await getVerifyAuth();
    tokenUser = await verifyAuth(req);
  } catch (authError: unknown) {
    const msg = authError instanceof Error ? authError.message : "Auth error";
    res.status(200).json({ success: false, error: "Authentication error", note: msg });
    return;
  }
  if (!tokenUser?.uid) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const ok = await enforceRateLimit({
    req,
    res,
    keyPrefix: "togglePostLike",
    limit: 120,
    windowMs: 60_000,
    identifier: tokenUser.uid,
  });
  if (!ok) return;

  const { creatorId, postId } = (req.body as Record<string, unknown>) || {};
  const creatorIdStr = String(creatorId ?? "").trim();
  const postIdStr = String(postId ?? "").trim();
  if (!creatorIdStr || !postIdStr) {
    res.status(400).json({ error: "Missing creatorId or postId" });
    return;
  }

  const db = getAdminDb();
  const candidateRefs: DocumentReference[] = [
    db.collection("creators").doc(creatorIdStr).collection("fanPosts").doc(postIdStr),
    db.collection("users").doc(creatorIdStr).collection("posts").doc(postIdStr),
    db.collection("creators").doc(creatorIdStr).collection("posts").doc(postIdStr),
  ];

  const existingRefs: DocumentReference[] = [];
  for (const ref of candidateRefs) {
    const snap = await ref.get();
    if (snap.exists) existingRefs.push(ref);
  }

  if (existingRefs.length === 0) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  const uid = tokenUser.uid;
  let nextLikedBy: string[] = [];
  let likedAfter = false;

  await db.runTransaction(async (tx) => {
    const snaps = await Promise.all(existingRefs.map((r) => tx.get(r)));
    let baseLikedBy: string[] = [];
    for (let i = 0; i < snaps.length; i++) {
      if (!snaps[i].exists) continue;
      const data = snaps[i].data() || {};
      const raw = Array.isArray(data.likedBy) ? (data.likedBy as unknown[]) : [];
      baseLikedBy = raw.map((v) => String(v));
      break;
    }
    const has = baseLikedBy.includes(uid);
    nextLikedBy = has ? baseLikedBy.filter((x) => x !== uid) : [...baseLikedBy, uid];
    likedAfter = !has;
    const likeCount = nextLikedBy.length;

    for (let i = 0; i < existingRefs.length; i++) {
      if (snaps[i].exists) {
        tx.update(existingRefs[i], { likedBy: nextLikedBy, likeCount });
      }
    }
  });

  const rootPostRef = db.collection("posts").doc(postIdStr);
  const rootSnap = await rootPostRef.get();
  if (rootSnap.exists) {
    await rootPostRef.update({ likedBy: nextLikedBy, likeCount: nextLikedBy.length });
  }

  res.status(200).json({
    success: true,
    likedBy: nextLikedBy,
    likeCount: nextLikedBy.length,
    liked: likedAfter,
  });
}

export default withErrorHandling(handler);
