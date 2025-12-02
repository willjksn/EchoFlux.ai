// api/webhooks/youtube.ts
// YouTube webhook handler for real-time comment notifications

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "../_firebaseAdmin.js";
import crypto from "crypto";

/**
 * Verify YouTube webhook signature (PubSubHubbub)
 */
function verifyYouTubeSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac("sha1", secret);
  hmac.update(payload);
  const expectedSignature = hmac.digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Process YouTube webhook event
 */
async function processYouTubeEvent(event: any, db: any) {
  // YouTube PubSubHubbub sends Atom feed
  if (event.feed && event.feed.entry) {
    let processed = 0;

    for (const entry of event.feed.entry) {
      const videoId = extractVideoId(entry.link?.[0]?.href);
      const commentId = entry.id;

      if (!videoId || !commentId) {
        continue;
      }

      // Find user by YouTube channel ID
      const channelId = extractChannelId(entry);
      if (!channelId) {
        continue;
      }

      const usersSnapshot = await db
        .collection("users")
        .where("socialAccounts.YouTube.accountId", "==", channelId)
        .limit(1)
        .get();

      if (usersSnapshot.empty) {
        console.warn(`No user found for YouTube channel ID: ${channelId}`);
        continue;
      }

      const userId = usersSnapshot.docs[0].id;

      // Save comment
      await saveComment(userId, "YouTube", {
        id: commentId,
        videoId,
        content: entry.content?.[0]?._ || entry.content?.[0] || "",
        author: entry.author?.[0]?.name || "Unknown",
        authorId: entry.author?.[0]?.uri || "",
        published: entry.published || new Date().toISOString(),
        updated: entry.updated || new Date().toISOString(),
      }, db);

      processed++;
    }

    return { processed, success: true };
  }

  return { processed: 0, success: false, reason: "Invalid event format" };
}

/**
 * Extract video ID from YouTube URL
 */
function extractVideoId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/[?&]v=([^&]+)/);
  return match ? match[1] : null;
}

/**
 * Extract channel ID from entry
 */
function extractChannelId(entry: any): string | null {
  // Try various fields where channel ID might be
  return (
    entry["yt:channelId"]?.[0] ||
    entry.author?.[0]?.yt_userid?.[0] ||
    null
  );
}

/**
 * Save comment to Firestore
 */
async function saveComment(
  userId: string,
  platform: string,
  commentData: any,
  db: any
) {
  const commentId = commentData.id || `comment_${Date.now()}`;

  const comment = {
    id: commentId,
    platform,
    type: "Comment" as const,
    user: {
      name: commentData.author || "Unknown",
      avatar: "",
      id: commentData.authorId || "",
    },
    content: commentData.content || "",
    timestamp: commentData.published || new Date().toISOString(),
    sentiment: "Neutral",
    isRead: false,
    isFlagged: false,
    isFavorite: false,
    postId: commentData.videoId,
    createdAt: new Date().toISOString(),
  };

  await db
    .collection("users")
    .doc(userId)
    .collection("messages")
    .doc(commentId)
    .set(comment, { merge: true });

  // Trigger notification
  await triggerNotification(userId, platform, "Comment", comment, db);
}

/**
 * Trigger notification for new comment
 */
async function triggerNotification(
  userId: string,
  platform: string,
  type: "DM" | "Comment",
  message: any,
  db: any
) {
  const notification = {
    id: `notif_${Date.now()}`,
    userId,
    type: "newComment",
    platform,
    title: "New Comment",
    message: `${message.user.name}: ${message.content.substring(0, 50)}...`,
    data: message,
    read: false,
    createdAt: new Date().toISOString(),
  };

  await db
    .collection("users")
    .doc(userId)
    .collection("notifications")
    .add(notification);
}

/**
 * Webhook verification (GET request from YouTube PubSubHubbub)
 */
export async function handleVerification(req: VercelRequest, res: VercelResponse) {
  const mode = req.query["hub.mode"];
  const challenge = req.query["hub.challenge"];
  const topic = req.query["hub.topic"];

  if (mode === "subscribe" && challenge) {
    console.log("YouTube webhook verified for topic:", topic);
    return res.status(200).send(challenge);
  } else {
    return res.status(403).json({ error: "Verification failed" });
  }
}

/**
 * Main webhook handler
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle verification (GET request)
  if (req.method === "GET") {
    return handleVerification(req, res);
  }

  // Handle webhook events (POST request)
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Verify webhook signature (if secret is configured)
    const signature = req.headers["x-hub-signature"] as string;
    const webhookSecret = process.env.YOUTUBE_WEBHOOK_SECRET;

    if (webhookSecret && signature) {
      const payload = JSON.stringify(req.body);
      const isValid = verifyYouTubeSignature(payload, signature, webhookSecret);

      if (!isValid) {
        console.error("Invalid YouTube webhook signature");
        return res.status(401).json({ error: "Invalid signature" });
      }
    }

    // Process webhook event
    const db = getAdminDb();
    const result = await processYouTubeEvent(req.body, db);

    // Always return 200 to acknowledge receipt
    return res.status(200).json({
      success: true,
      processed: result.processed || 0,
    });
  } catch (error: any) {
    console.error("YouTube webhook error:", error);
    // Still return 200 to prevent YouTube from retrying
    return res.status(200).json({
      success: false,
      error: error?.message || String(error),
    });
  }
}

