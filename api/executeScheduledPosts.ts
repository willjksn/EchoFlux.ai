// api/executeScheduledPosts.ts
// Cron job endpoint to check and execute scheduled posts

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDbFunction, withErrorHandling } from "./_errorHandler.js";

/**
 * Execute scheduled posts that are due to be published
 * This endpoint should be called by a cron job every minute
 */
async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify cron secret if set
  const cronSecret = req.headers['x-cron-secret'] || req.query.secret;
  const expectedSecret = process.env.CRON_SECRET;
  
  if (expectedSecret && cronSecret !== expectedSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const getAdminDb = await getAdminDbFunction();
    const adminDb = await getAdminDb();

    const now = new Date();
    // Check posts scheduled in the last 2 minutes (to account for cron timing)
    const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
    const twoMinutesFromNow = new Date(now.getTime() + 2 * 60 * 1000);

    // Query all users' posts collection
    const usersSnapshot = await adminDb.collection('users').get();
    const executedPosts: string[] = [];
    const failedPosts: Array<{ postId: string; error: string }> = [];

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const postsRef = adminDb.collection('users').doc(userId).collection('posts');

      // Find posts that are scheduled, have autoPost enabled, and are due
      const scheduledPostsQuery = postsRef
        .where('status', '==', 'Scheduled')
        .where('autoPost', '==', true)
        .where('scheduledDate', '>=', twoMinutesAgo.toISOString())
        .where('scheduledDate', '<=', twoMinutesFromNow.toISOString());

      const scheduledPostsSnapshot = await scheduledPostsQuery.get();

      for (const postDoc of scheduledPostsSnapshot.docs) {
        const post = postDoc.data();
        const scheduledDate = new Date(post.scheduledDate);

        // Only execute if the scheduled time has passed
        if (scheduledDate <= now) {
          try {
            // Post to each platform
            for (const platform of post.platforms || []) {
              try {
                const postResponse = await fetch(`${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/postToSocial`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-Cron-Request': 'true',
                    'X-User-Id': userId,
                  },
                  body: JSON.stringify({
                    userId: userId,
                    platform: platform,
                    content: post.content,
                    mediaUrl: post.mediaUrl,
                    mediaType: post.mediaType,
                  }),
                });

                if (!postResponse.ok) {
                  const errorData = await postResponse.json();
                  throw new Error(errorData.error || `Failed to post to ${platform}`);
                }

                const result = await postResponse.json();
                console.log(`Posted to ${platform} for user ${userId}:`, result.postId);

              } catch (platformError: any) {
                console.error(`Failed to post to ${platform} for post ${post.id}:`, platformError);
                failedPosts.push({
                  postId: post.id,
                  error: `${platform}: ${platformError.message}`
                });
              }
            }

            // Update post status to Published
            await postDoc.ref.update({
              status: 'Published',
              publishedAt: new Date().toISOString(),
            });

            executedPosts.push(post.id);

          } catch (error: any) {
            console.error(`Failed to execute post ${post.id}:`, error);
            failedPosts.push({
              postId: post.id,
              error: error.message || 'Unknown error'
            });

            // Update post status to indicate failure
            await postDoc.ref.update({
              status: 'Failed',
              error: error.message,
            });
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      executed: executedPosts.length,
      failed: failedPosts.length,
      executedPosts,
      failedPosts,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error("Error executing scheduled posts:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to execute scheduled posts"
    });
  }
}

export default withErrorHandling(handler);

