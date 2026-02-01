import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireCronAuth } from "./_cronAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { publishXPost } from "./platforms/x/publish.js";

/**
 * Auto-post scheduled posts that are ready to publish
 * Cron every 15 min. Admins can trigger manually with ?debug=1 for details.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const isCronAuth = requireCronAuth(req);
  let isAdminAuth = false;
  if (!isCronAuth) {
    const user = await verifyAuth(req);
    if (user) {
      const db = getAdminDb();
      const userDoc = await db.collection("users").doc(user.uid).get();
      if (userDoc.data()?.role === "Admin") isAdminAuth = true;
    }
  }
  if (!isCronAuth && !isAdminAuth) {
    return res.status(401).json({ error: "Unauthorized. Use CRON_SECRET or Admin auth." });
  }

  const debug = req.query.debug === "1" || req.query.debug === "true";

  try {
    const now = new Date();
    const db = getAdminDb();

    let totalProcessed = 0;
    let totalPosted = 0;
    const errors: string[] = [];

    let scheduledPostsSnapshot;
    try {
      scheduledPostsSnapshot = await db
        .collectionGroup("posts")
        .where("status", "==", "Scheduled")
        .get();
    } catch (queryError: any) {
      const msg = queryError?.message || String(queryError);
      const needsIndex = msg.includes("index") || msg.includes("Index");
      console.error("Auto-post Firestore query failed:", queryError);
      return res.status(500).json({
        error: "Query failed",
        message: msg,
        hint: needsIndex ? "Run: firebase deploy --only firestore:indexes" : undefined,
      });
    }

    for (const doc of scheduledPostsSnapshot.docs) {
      const post = doc.data();
      const scheduledDate = post.scheduledDate ? new Date(post.scheduledDate) : null;
      if (!scheduledDate || scheduledDate > now) {
        continue;
      }

      const pathParts = doc.ref.path.split("/");
      const userIdIndex = pathParts.indexOf("users") + 1;
      const userId = pathParts[userIdIndex];
      if (!userId) {
        continue;
      }

      totalProcessed++;

      const platforms: string[] = Array.isArray(post.platforms) ? post.platforms : [];
      const hasX = platforms.some((p) => p === "X" || p === "Twitter");
      if (!hasX) {
        continue;
      }

      try {
        const socialAccountRef = db
          .collection("users")
          .doc(userId)
          .collection("social_accounts")
          .doc("x");

        const socialAccountDoc = await socialAccountRef.get();
        if (!socialAccountDoc.exists) {
          errors.push(`X account not connected for user ${userId}`);
          continue;
        }

        const socialAccount = socialAccountDoc.data();
        if (!socialAccount?.connected || !socialAccount?.accessToken) {
          errors.push(`X account missing token for user ${userId}`);
          continue;
        }

        const result = await publishXPost({
          userId,
          db,
          socialAccount,
          socialAccountRef,
          text: post.content || "",
          mediaUrl: post.mediaUrl,
          mediaUrls: post.mediaUrls,
          mediaType: post.mediaType,
        });

        await doc.ref.update({
          status: "Published",
          publishedAt: now.toISOString(),
          updatedAt: now.toISOString(),
          scheduledDate: post.scheduledDate || now.toISOString(),
          lastPublishResult: {
            platform: "X",
            tweetId: result.tweetId,
            mediaSkipped: result.mediaSkipped || false,
            mediaError: result.mediaError || null,
          },
        });

        totalPosted++;
      } catch (error: any) {
        console.error("Failed to auto-post scheduled X post:", error);
        errors.push(`Post ${doc.id}: ${error?.message || String(error)}`);
      }
    }

    res.status(200).json({
      success: true,
      message: "Auto-post service completed",
      processed: totalProcessed,
      posted: totalPosted,
      totalScheduledInDb: scheduledPostsSnapshot.docs.length,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: now.toISOString(),
    });
  } catch (error: any) {
    console.error("Auto-post error:", error);
    res.status(500).json({
      error: "Failed to process scheduled posts",
      message: error?.message || String(error)
    });
    return;
  }
}

