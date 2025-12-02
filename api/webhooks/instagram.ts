// api/webhooks/instagram.ts
// Instagram webhook handler for real-time DM and comment notifications

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "../_firebaseAdmin.js";
import crypto from "crypto";

/**
 * Verify Instagram webhook signature
 */
function verifyInstagramSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  const expectedSignature = hmac.digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Process Instagram webhook event
 */
async function processInstagramEvent(event: any, db: any) {
  const { object, entry } = event;

  if (object !== "instagram") {
    return { processed: false, reason: "Not an Instagram event" };
  }

  let processed = 0;

  for (const entryItem of entry || []) {
    const { id: pageId, messaging, comments } = entryItem;

    // Find user by Instagram page ID
    const usersSnapshot = await db
      .collection("users")
      .where("socialAccounts.Instagram.accountId", "==", pageId)
      .limit(1)
      .get();

    if (usersSnapshot.empty) {
      console.warn(`No user found for Instagram page ID: ${pageId}`);
      continue;
    }

    const userId = usersSnapshot.docs[0].id;

    // Process DMs (messaging events)
    if (messaging && Array.isArray(messaging)) {
      for (const message of messaging) {
        if (message.message) {
          await saveMessage(userId, "Instagram", "DM", message, db);
          processed++;
        }
      }
    }

    // Process comments
    if (comments && Array.isArray(comments)) {
      for (const comment of comments) {
        await saveComment(userId, "Instagram", comment, db);
        processed++;
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
    sentiment: "Neutral", // Will be analyzed by AI later
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
  const postId = commentData.media_id || commentData.post_id;

  const comment = {
    id: commentId,
    platform,
    type: "Comment" as const,
    user: {
      name: commentData.from?.username || "Unknown",
      avatar: commentData.from?.profile_picture_url || "",
      id: commentData.from?.id,
    },
    content: commentData.text || "",
    timestamp: new Date(commentData.timestamp || Date.now()).toISOString(),
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
  // Create notification document
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

  // Update user's unread count (if needed)
  // This could trigger a real-time update via Firestore listeners
}

/**
 * Webhook verification (GET request from Instagram)
 */
export async function handleVerification(req: VercelRequest, res: VercelResponse) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const verifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    console.log("Instagram webhook verified");
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
    const webhookSecret = process.env.INSTAGRAM_WEBHOOK_SECRET;

    if (webhookSecret && signature) {
      const payload = JSON.stringify(req.body);
      const isValid = verifyInstagramSignature(payload, signature, webhookSecret);

      if (!isValid) {
        console.error("Invalid Instagram webhook signature");
        return res.status(401).json({ error: "Invalid signature" });
      }
    }

    // Process webhook event
    const db = getAdminDb();
    const result = await processInstagramEvent(req.body, db);

    // Always return 200 to acknowledge receipt
    return res.status(200).json({
      success: true,
      processed: result.processed || 0,
    });
  } catch (error: any) {
    console.error("Instagram webhook error:", error);
    // Still return 200 to prevent Instagram from retrying
    return res.status(200).json({
      success: false,
      error: error?.message || String(error),
    });
  }
}

