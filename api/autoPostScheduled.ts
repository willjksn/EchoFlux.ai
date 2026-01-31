import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireCronAuth } from "./_cronAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { publishXPost } from "./platforms/x/publish.js";

/**
 * Auto-post scheduled posts that are ready to publish
 * This endpoint should be called by a cron job (e.g., Vercel Cron) every 5-15 minutes
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Allow GET for cron jobs, POST for manual triggers
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    // This endpoint is triggered by Vercel Cron. Allow manual smoke tests via CRON_SECRET too.
    if (!requireCronAuth(req)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    
    const now = new Date();
    const db = getAdminDb();

    let totalProcessed = 0;
    let totalPosted = 0;
    const errors: string[] = [];

    const scheduledPostsSnapshot = await db
      .collectionGroup("posts")
      .where("status", "==", "Scheduled")
      .get();

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
      if (!platforms.includes("X")) {
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

