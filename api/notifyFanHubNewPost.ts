import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { withErrorHandling } from "./_errorHandler.js";
import { notifyCreatorMembersNewPost } from "./_notifyCreatorNewPost.js";

/**
 * Creator-only: notify members (in-app + push) after a Fan Hub post is published.
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const rlOk = await enforceRateLimit({
    req,
    res,
    keyPrefix: "notifyFanHubNewPost",
    limit: 20,
    windowMs: 60_000,
    identifier: decoded.uid,
  });
  if (!rlOk) return;

  const postId = typeof req.body?.postId === "string" ? req.body.postId.trim() : "";
  if (!postId) {
    res.status(400).json({ error: "postId is required" });
    return;
  }

  const creatorId = decoded.uid;
  const db = getAdminDb();
  const postSnap = await db.collection("creators").doc(creatorId).collection("fanPosts").doc(postId).get();
  if (!postSnap.exists) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  const post = postSnap.data() as Record<string, unknown>;
  const bodyPreview = typeof post.body === "string" ? post.body : "";

  let memberHubUrl: string | undefined;
  try {
    const handleSnap = await db.collection("creatorHandles").doc(creatorId).get();
    const handle = typeof handleSnap.data()?.handle === "string" ? handleSnap.data()!.handle.trim() : "";
    if (handle) {
      memberHubUrl = `https://witme.io/${encodeURIComponent(handle.replace(/^@/, ""))}/feed`;
    }
  } catch {
    /* optional */
  }

  const result = await notifyCreatorMembersNewPost({
    creatorId,
    postId,
    bodyPreview,
    memberHubUrl,
  });

  res.status(200).json({ ok: true, ...result });
}

export default withErrorHandling(handler);
