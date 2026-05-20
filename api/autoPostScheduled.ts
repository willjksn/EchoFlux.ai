import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireCronAuth } from "./_cronAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { hasPlatformAdminAccess } from "./_platformAdminAccess.js";
import { verifyAuth } from "./verifyAuth.js";
import { publishXPost } from "./platforms/x/publish.js";
import {
  publishInstagramContent,
  refreshInstagramAccessToken,
} from "./platforms/instagram/publish.js";
import { publishFacebookContent } from "./platforms/facebook/publish.js";

type PublishResult = {
  platform: string;
  success: boolean;
  id?: string;
  error?: string;
  mediaSkipped?: boolean;
};

function instagramMediaTypeFromPost(post: Record<string, unknown>): "IMAGE" | "REELS" | "VIDEO" {
  if (post.mediaType === "video") {
    return post.instagramPostType === "Reel" ? "REELS" : "VIDEO";
  }
  return "IMAGE";
}

function normalizePlatforms(platforms: unknown): string[] {
  return Array.isArray(platforms) ? platforms.map((p) => String(p)) : [];
}

function hasPlatform(platforms: string[], name: string): boolean {
  return platforms.some((p) => p === name || (name === "X" && p === "Twitter"));
}

async function publishScheduledToX(
  userId: string,
  db: ReturnType<typeof getAdminDb>,
  post: Record<string, unknown>,
): Promise<PublishResult> {
  const socialAccountRef = db.collection("users").doc(userId).collection("social_accounts").doc("x");
  const socialAccountDoc = await socialAccountRef.get();
  if (!socialAccountDoc.exists) {
    return { platform: "X", success: false, error: "X account not connected" };
  }
  const socialAccount = socialAccountDoc.data();
  if (!socialAccount?.connected || !socialAccount?.accessToken) {
    return { platform: "X", success: false, error: "X account missing token" };
  }

  const result = await publishXPost({
    userId,
    db,
    socialAccount: socialAccount as any,
    socialAccountRef,
    text: String(post.content || ""),
    mediaUrl: post.mediaUrl as string | undefined,
    mediaUrls: post.mediaUrls as string[] | undefined,
    mediaType: post.mediaType as "image" | "video" | undefined,
  });

  return {
    platform: "X",
    success: true,
    id: result.tweetId,
    mediaSkipped: result.mediaSkipped,
    error: result.mediaError,
  };
}

async function publishScheduledToInstagram(
  userId: string,
  db: ReturnType<typeof getAdminDb>,
  post: Record<string, unknown>,
): Promise<PublishResult> {
  const mediaUrl = post.mediaUrl as string | undefined;
  const mediaUrls = post.mediaUrls as string[] | undefined;
  const primaryUrl = mediaUrl || (Array.isArray(mediaUrls) && mediaUrls.length > 0 ? mediaUrls[0] : undefined);
  if (!primaryUrl) {
    return { platform: "Instagram", success: false, error: "Instagram requires media" };
  }

  const socialAccountRef = db
    .collection("users")
    .doc(userId)
    .collection("social_accounts")
    .doc("instagram");
  const socialAccountDoc = await socialAccountRef.get();
  if (!socialAccountDoc.exists) {
    return { platform: "Instagram", success: false, error: "Instagram account not connected" };
  }
  const socialAccount = socialAccountDoc.data();
  if (!socialAccount?.connected || !socialAccount?.accessToken || !socialAccount?.accountId) {
    return { platform: "Instagram", success: false, error: "Instagram account not properly connected" };
  }

  let accessToken = String(socialAccount.accessToken);
  const refreshed = await refreshInstagramAccessToken(userId, db);
  if (refreshed) accessToken = refreshed;

  const mediaType = instagramMediaTypeFromPost(post);
  const additionalUrls =
    Array.isArray(mediaUrls) && mediaUrls.length > 1 ? mediaUrls.slice(1) : undefined;

  const result = await publishInstagramContent(
    String(socialAccount.accountId),
    accessToken,
    primaryUrl,
    String(post.content || ""),
    mediaType,
    undefined,
    additionalUrls,
  );

  return {
    platform: "Instagram",
    success: true,
    id: result.mediaId || result.containerId,
  };
}

async function publishScheduledToFacebook(
  userId: string,
  db: ReturnType<typeof getAdminDb>,
  post: Record<string, unknown>,
): Promise<PublishResult> {
  const mediaUrl = post.mediaUrl as string | undefined;
  const mediaUrls = post.mediaUrls as string[] | undefined;
  const fbMediaType =
    post.mediaType === "video" ? "video" : post.mediaType === "image" ? "image" : undefined;

  const result = await publishFacebookContent({
    userId,
    db,
    caption: String(post.content || ""),
    mediaUrl,
    mediaUrls,
    mediaType: fbMediaType,
  });

  return { platform: "Facebook", success: true, id: result.postId };
}

/**
 * Auto-post scheduled posts that are ready to publish (X, Instagram, Facebook).
 * Cron every 15 min. Admins can trigger manually with ?debug=1 for details.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<VercelResponse | void> {
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
      if (hasPlatformAdminAccess(userDoc.data() as Record<string, unknown> | undefined)) {
        isAdminAuth = true;
      }
    }
  }
  if (!isCronAuth && !isAdminAuth) {
    return res.status(401).json({ error: "Unauthorized. Use CRON_SECRET or Admin auth." });
  }

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

    const windowMs = 15 * 60 * 1000;
    const windowStart = now.getTime() - windowMs;

    for (const doc of scheduledPostsSnapshot.docs) {
      const post = doc.data() as Record<string, unknown>;
      const scheduledDate = post.scheduledDate ? new Date(String(post.scheduledDate)) : null;
      if (!scheduledDate || !scheduledDate.getTime()) continue;
      const t = scheduledDate.getTime();
      if (t > now.getTime() || t < windowStart) continue;

      const pathParts = doc.ref.path.split("/");
      const userIdIndex = pathParts.indexOf("users") + 1;
      const userId = pathParts[userIdIndex];
      if (!userId) continue;

      if (post.autoPublishAtSchedule !== true) continue;

      totalProcessed++;

      const platforms = normalizePlatforms(post.platforms);
      const targets: Array<"X" | "Instagram" | "Facebook"> = [];
      if (hasPlatform(platforms, "X")) targets.push("X");
      if (hasPlatform(platforms, "Instagram")) targets.push("Instagram");
      if (hasPlatform(platforms, "Facebook")) targets.push("Facebook");

      if (targets.length === 0) {
        errors.push(`Post ${doc.id}: no auto-publish platforms selected`);
        continue;
      }

      const results: PublishResult[] = [];

      for (const target of targets) {
        try {
          if (target === "X") {
            results.push(await publishScheduledToX(userId, db, post));
          } else if (target === "Instagram") {
            results.push(await publishScheduledToInstagram(userId, db, post));
          } else if (target === "Facebook") {
            results.push(await publishScheduledToFacebook(userId, db, post));
          }
        } catch (error: any) {
          const message = error?.message || String(error);
          console.error(`Failed to auto-post ${target}:`, error);
          results.push({ platform: target, success: false, error: message });
          errors.push(`Post ${doc.id} (${target}): ${message}`);
        }
      }

      const succeeded = results.filter((r) => r.success);
      const allSucceeded = succeeded.length === targets.length;

      if (succeeded.length > 0) {
        await doc.ref.update({
          status: allSucceeded ? "Published" : "Scheduled",
          publishedAt: allSucceeded ? now.toISOString() : post.publishedAt || null,
          updatedAt: now.toISOString(),
          scheduledDate: post.scheduledDate || now.toISOString(),
          lastPublishResults: results,
        });
        if (allSucceeded) totalPosted++;
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
      message: error?.message || String(error),
    });
  }
}
