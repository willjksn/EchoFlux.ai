/**
 * Fan Notification System
 * 
 * Handles notifications to fans for:
 * - Video chat requests accepted/starting
 * - New messages from creators
 * - Session reminders
 * - Purchase confirmations
 */

import { getAdminDb } from './_firebaseAdmin.js';

export type FanNotificationType = 
  | 'video_chat_accepted'
  | 'video_chat_starting'
  | 'video_chat_reminder'
  | 'new_message'
  | 'session_starting'
  | 'session_reminder'
  | 'live_session_scheduled'
  | 'purchase_confirmed'
  | 'content_unlocked';

export interface FanNotification {
  id?: string;
  fanId: string;
  type: FanNotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
  read: boolean;
  createdAt: string;
  expiresAt?: string;
}

/**
 * Send a notification to a fan
 * Stores in Firestore and can trigger push/email
 */
/**
 * In-app bell for creators (Fan Hub): `users/{creatorId}/notifications`
 * Same field shape as fan rows so `FanHubNotificationBell` can render and orderBy createdAt.
 */
export async function sendCreatorHubNotification(params: {
  creatorId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<string> {
  const db = getAdminDb();
  const now = new Date();
  const notification = {
    fanId: '',
    type: params.type,
    title: params.title,
    body: params.body,
    data: params.data || {},
    read: false,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const coll = db.collection('users').doc(params.creatorId).collection('notifications');
  const docRef = coll.doc();
  await docRef.set({ ...notification, id: docRef.id });
  return docRef.id;
}

export async function sendFanNotification(params: {
  fanId: string;
  type: FanNotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
  sendPush?: boolean;
  sendEmail?: boolean;
}): Promise<string> {
  const db = getAdminDb();
  const now = new Date();
  
  // Store notification in Firestore
  const notification: Omit<FanNotification, 'id'> = {
    fanId: params.fanId,
    type: params.type,
    title: params.title,
    body: params.body,
    data: params.data,
    read: false,
    createdAt: now.toISOString(),
    // Notifications expire after 30 days
    expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };

  const docRef = await db.collection('fan_notifications').add(notification);

  // Also add to user's personal notification subcollection for faster queries
  await db.collection('users').doc(params.fanId)
    .collection('notifications').doc(docRef.id).set(notification);

  // TODO: Send push notification if user has enabled
  if (params.sendPush) {
    await sendPushNotification(params.fanId, params.title, params.body, params.data);
  }

  // TODO: Send email notification if user has enabled
  if (params.sendEmail) {
    await sendEmailNotification(params.fanId, params.type, params.title, params.body);
  }

  return docRef.id;
}

/**
 * Get unread notifications for a fan
 */
export async function getFanNotifications(fanId: string, limit: number = 20): Promise<FanNotification[]> {
  const db = getAdminDb();
  
  const snapshot = await db.collection('users').doc(fanId)
    .collection('notifications')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data() as Omit<FanNotification, 'id'>,
  }));
}

/**
 * Mark notification as read
 */
export async function markNotificationRead(fanId: string, notificationId: string): Promise<void> {
  const db = getAdminDb();
  
  await db.collection('users').doc(fanId)
    .collection('notifications').doc(notificationId)
    .update({ read: true });
}

/**
 * Mark all notifications as read
 */
export async function markAllNotificationsRead(fanId: string): Promise<void> {
  const db = getAdminDb();
  
  const snapshot = await db.collection('users').doc(fanId)
    .collection('notifications')
    .where('read', '==', false)
    .get();

  const batch = db.batch();
  snapshot.docs.forEach(doc => {
    batch.update(doc.ref, { read: true });
  });
  
  await batch.commit();
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(fanId: string): Promise<number> {
  const db = getAdminDb();
  
  const snapshot = await db.collection('users').doc(fanId)
    .collection('notifications')
    .where('read', '==', false)
    .count()
    .get();

  return snapshot.data().count;
}

/**
 * Send push notification (placeholder - implement with FCM or similar)
 */
async function sendPushNotification(
  fanId: string, 
  title: string, 
  body: string, 
  data?: Record<string, string>
): Promise<void> {
  const db = getAdminDb();
  
  // Get user's FCM tokens
  const userDoc = await db.collection('users').doc(fanId).get();
  const userData = userDoc.data();
  
  if (!userData?.fcmTokens || !Array.isArray(userData.fcmTokens)) {
    return;
  }

  // TODO: Implement actual FCM push notification
  // For now, just log
  console.log(`[Push] Would send to ${fanId}: ${title} - ${body}`, data);
}

/**
 * Send email notification (placeholder - implement with email service)
 */
async function sendEmailNotification(
  fanId: string,
  type: FanNotificationType,
  title: string,
  body: string
): Promise<void> {
  const db = getAdminDb();
  
  // Get user's email
  const userDoc = await db.collection('users').doc(fanId).get();
  const userData = userDoc.data();
  
  if (!userData?.email) {
    return;
  }

  // Check if user has email notifications enabled
  if (userData.emailNotifications === false) {
    return;
  }

  // TODO: Implement actual email sending
  // For now, just log
  console.log(`[Email] Would send to ${userData.email}: ${title} - ${body}`);
}

/**
 * Schedule a reminder notification
 */
export async function scheduleReminder(params: {
  fanId: string;
  type: 'video_chat_reminder' | 'session_reminder';
  title: string;
  body: string;
  data?: Record<string, string>;
  scheduledFor: Date;
}): Promise<string> {
  const db = getAdminDb();
  
  const reminder = {
    fanId: params.fanId,
    type: params.type,
    title: params.title,
    body: params.body,
    data: params.data,
    scheduledFor: params.scheduledFor.toISOString(),
    sent: false,
    createdAt: new Date().toISOString(),
  };

  const docRef = await db.collection('scheduled_notifications').add(reminder);
  return docRef.id;
}

/**
 * Upsert the fan's "5 minutes before session start" reminder for a scheduled joint order.
 * Deterministic doc id so rescheduling replaces the same pending reminder.
 */
export async function upsertOrderSessionFiveMinuteReminder(params: {
  orderId: string;
  fanId: string;
  jointKind: 'video_call' | 'chat_session';
  sessionStart: Date;
  itemName: string;
  whenLabel: string;
  creatorId: string;
}): Promise<void> {
  const db = getAdminDb();
  const docId = `order_${params.orderId}_session_5min_reminder`;
  const ref = db.collection('scheduled_notifications').doc(docId);
  const reminderAt = new Date(params.sessionStart.getTime() - 5 * 60 * 1000);
  const now = new Date();

  if (reminderAt.getTime() <= now.getTime()) {
    await ref.delete().catch(() => undefined);
    return;
  }

  const isVideo = params.jointKind === 'video_call';
  const snap = await ref.get();
  const payload: Record<string, unknown> = {
    fanId: params.fanId,
    type: isVideo ? 'video_chat_reminder' : 'session_reminder',
    title: isVideo ? 'Video call in 5 minutes' : 'Chat session in 5 minutes',
    body: `Your ${params.itemName} starts at ${params.whenLabel}. Open your member hub to join.`,
    data: {
      orderId: params.orderId,
      creatorId: params.creatorId,
      jointKind: params.jointKind,
      destination: isVideo ? 'videoChats' : 'sessions',
    },
    scheduledFor: reminderAt.toISOString(),
    sent: false,
    updatedAt: now.toISOString(),
  };
  if (!snap.exists) {
    payload.createdAt = now.toISOString();
  }
  await ref.set(payload, { merge: true });
}

/**
 * Process scheduled reminders (called by cron job)
 */
export async function processScheduledReminders(): Promise<number> {
  const db = getAdminDb();
  const now = new Date();
  
  const snapshot = await db.collection('scheduled_notifications')
    .where('sent', '==', false)
    .where('scheduledFor', '<=', now.toISOString())
    .limit(100)
    .get();

  let processed = 0;
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    
    try {
      await sendFanNotification({
        fanId: data.fanId,
        type: data.type,
        title: data.title,
        body: data.body,
        data: data.data,
        sendPush: true,
      });
      
      await doc.ref.update({ sent: true, sentAt: now.toISOString() });
      processed++;
    } catch (error) {
      console.error(`Failed to send scheduled notification ${doc.id}:`, error);
    }
  }
  
  return processed;
}
