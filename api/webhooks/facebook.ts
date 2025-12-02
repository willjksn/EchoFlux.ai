// api/webhooks/facebook.ts
// Facebook webhook handler for real-time messages and comments

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "../_firebaseAdmin.js";
import crypto from "crypto";

/**
 * Verify Facebook webhook signature
 */
function verifyFacebookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  const expectedSignature = "sha256=" + hmac.digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Process Facebook webhook event
 */
async function processFacebookEvent(event: any, db: any) {
  const { object, entry } = event;

  if (object !== "page" && object !== "instagram") {
    return { processed: false, reason: "Not a Facebook/Instagram event" };
  }

  let processed = 0;

  for (const entryItem of entry || []) {
    const { id: pageId, messaging, comments, feed } = entryItem;

    // Find user by Facebook page ID
    const usersSnapshot = await db
      .collection("users")
      .where("socialAccounts.Facebook.accountId", "==", pageId)
      .limit(1)
      .get();

    if (usersSnapshot.empty) {
      console.warn(`No user found for Facebook page ID: ${pageId}`);
      continue;
    }

    const userId = usersSnapshot.docs[0].id;

    // Process messages (DMs)
    if (messaging && Array.isArray(messaging)) {
      for (const message of messaging) {
        if (message.message) {
          await saveMessage(userId, "Facebook", "DM", message, db);
          processed++;
        }
      }
    }

    // Process comments
    if (comments && Array.isArray(comments)) {
      for (const comment of comments) {
        await saveComment(userId, "Facebook", comment, db);
        processed++;
      }
    }

    // Process feed events (mentions, etc.)
    if (feed && Array.isArray(feed)) {
      for (const feedItem of feed) {
        if (feedItem.item === "comment") {
          await saveComment(userId, "Facebook", feedItem, db);
          processed++;
        }
      }
    }
  }

  return { processed, success: true };
}

/**
 * Save DM to Firestore
 */
async function saveMessage(
  userId: string,
  platform: string,
  type: "DM" | "Comment",
  messageData: any,
  db: any
) {
  const messageId = messageData.message?.mid || messageData.id || `msg_${Date.now()}`;
  const senderId = messageData.sender?.id || messageData.from?.id;
  const content = messageData.message?.text || messageData.text || "";

  const message = {
    id: messageId,
    platform,
    type,
    user: {
      name: messageData.sender?.name || "Unknown",
      avatar: messageData.sender?.profile_pic || "",
      id: senderId,
    },
    content,
    timestamp: new Date(messageData.timestamp || Date.now()).toISOString(),
    sentiment: "Neutral",
    isRead: false,
    isFlagged: false,
    isFavorite: false,
    createdAt: new Date().toISOString(),
  };

  await db
    .collection("users")
    .doc(userId)
    .collection("messages")
    .doc(messageId)
    .set(message, { merge: true });

  // Trigger notification
  await triggerNotification(userId, platform, type, message, db);
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
  const postId = commentData.post_id || commentData.parent_id;

  const comment = {
    id: commentId,
    platform,
    type: "Comment" as const,
    user: {
      name: commentData.from?.name || "Unknown",
      avatar: commentData.from?.picture?.data?.url || "",
      id: commentData.from?.id,
    },
    content: commentData.message || commentData.text || "",
    timestamp: new Date(commentData.created_time || Date.now()).toISOString(),
    sentiment: "Neutral",
    isRead: false,
    isFlagged: false,
    isFavorite: false,
    postId,
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
 * Trigger notification for new message/comment
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
    type: type === "DM" ? "newMessage" : "newComment",
    platform,
    title: type === "DM" ? "New DM" : "New Comment",
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
 * Webhook verification (GET request from Facebook)
 */
export async function handleVerification(req: VercelRequest, res: VercelResponse) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const verifyToken = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    console.log("Facebook webhook verified");
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
    // Verify webhook signature
    const signature = req.headers["x-hub-signature-256"] as string;
    const webhookSecret = process.env.FACEBOOK_WEBHOOK_SECRET;

    if (webhookSecret && signature) {
      const payload = JSON.stringify(req.body);
      const isValid = verifyFacebookSignature(payload, signature, webhookSecret);

      if (!isValid) {
        console.error("Invalid Facebook webhook signature");
        return res.status(401).json({ error: "Invalid signature" });
      }
    }

    // Process webhook event
    const db = getAdminDb();
    const result = await processFacebookEvent(req.body, db);

    // Always return 200 to acknowledge receipt
    return res.status(200).json({
      success: true,
      processed: result.processed || 0,
    });
  } catch (error: any) {
    console.error("Facebook webhook error:", error);
    // Still return 200 to prevent Facebook from retrying
    return res.status(200).json({
      success: false,
      error: error?.message || String(error),
    });
  }
}

