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
import { resolveCreatorFanHubPushLink, sendUserWebPush } from './_userWebPush.js';

export type FanNotificationType = 
  | 'video_chat_accepted'
  | 'video_chat_starting'
  | 'video_chat_reminder'
  | 'new_message'
  | 'new_post'
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
  sendPush?: boolean;
}): Promise<string> {
  const db = getAdminDb();
  const now = new Date();
  const data = params.data || {};
  const notification = {
    fanId: '',
    type: params.type,
    title: params.title,
    body: params.body,
    data,
    read: false,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const coll = db.collection('users').doc(params.creatorId).collection('notifications');
  const docRef = coll.doc();
  await docRef.set({ ...notification, id: docRef.id });

  if (params.sendPush !== false) {
    try {
      await sendUserWebPush({
        userId: params.creatorId,
        title: params.title,
        body: params.body,
        data: { ...data, type: params.type },
        link: resolveCreatorFanHubPushLink(params.type, data),
      });
    } catch (e) {
      console.warn('sendCreatorHubNotification push failed:', params.creatorId, e);
    }
  }

  return docRef.id;
}

/** Display label for a fan/member in creator + admin notifications. */
export async function resolveFanHubMemberDisplayLabel(params: {
  creatorId: string;
  fanId: string;
  displayNameHint?: string | null;
}): Promise<string> {
  const db = getAdminDb();
  let label = (typeof params.displayNameHint === "string" && params.displayNameHint.trim()) || "";
  if (!label) {
    try {
      const fd = (
        await db.collection("creators").doc(params.creatorId).collection("fans").doc(params.fanId).get()
      ).data() as { displayName?: string; username?: string } | undefined;
      const dn = typeof fd?.displayName === "string" ? fd.displayName.trim() : "";
      const un = typeof fd?.username === "string" ? fd.username.trim() : "";
      label = dn || (un ? (un.startsWith("@") ? un : `@${un}`) : "");
    } catch {
      /* ignore */
    }
  }
  if (!label) {
    try {
      const u = (await db.collection("users").doc(params.fanId).get()).data() as
        | { displayName?: string; username?: string }
        | undefined;
      const dn = typeof u?.displayName === "string" ? u.displayName.trim() : "";
      const un = typeof u?.username === "string" ? u.username.trim() : "";
      label = dn || (un ? (un.startsWith("@") ? un : `@${un}`) : "");
    } catch {
      /* ignore */
    }
  }
  return label || "A fan";
}

/** Creator Fan Hub bell: someone became a paying member or joined free (first successful membership write). */
export async function notifyCreatorNewFanMemberJoined(params: {
  creatorId: string;
  fanId: string;
  /** From checkout / auth when fan doc may not exist yet */
  displayNameHint?: string | null;
}): Promise<void> {
  const who = await resolveFanHubMemberDisplayLabel(params);
  await sendCreatorHubNotification({
    creatorId: params.creatorId,
    type: 'new_member',
    title: 'New member',
    body: `${who} joined your fan page.`,
    data: { fanId: params.fanId, creatorId: params.creatorId },
  });
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

  const shouldPush = params.sendPush !== false;
  if (shouldPush) {
    await sendPushNotification(params.fanId, params.title, params.body, {
      ...(params.data || {}),
      type: params.type,
    });
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

const MEMBER_HUB_ORIGIN = "https://witme.io";

/** `creatorHandles/{handle}` stores `{ creatorId }` — handle is the document id, not a field. */
export async function resolveCreatorHandleById(creatorId: string): Promise<string | null> {
  const cid = creatorId.trim();
  if (!cid) return null;
  const db = getAdminDb();

  try {
    const snap = await db.collection("creatorHandles").where("creatorId", "==", cid).limit(1).get();
    if (!snap.empty) {
      const handle = snap.docs[0].id.trim().replace(/^@/, "").toLowerCase();
      if (handle) return handle;
    }
  } catch {
    /* ignore */
  }

  try {
    const creatorSnap = await db.collection("creators").doc(cid).get();
    const raw =
      typeof creatorSnap.data()?.handle === "string" ? creatorSnap.data()!.handle.trim() : "";
    const handle = raw.replace(/^@/, "").toLowerCase();
    if (handle) return handle;
  } catch {
    /* ignore */
  }

  return null;
}

export async function resolveMemberHubNewMessagePushLink(
  creatorId: string,
  threadId: string,
): Promise<string | undefined> {
  const handle = await resolveCreatorHandleById(creatorId);
  if (!handle) return undefined;
  const base = `${MEMBER_HUB_ORIGIN}/${encodeURIComponent(handle)}`;
  const tid = threadId.trim();
  return tid ? `${base}/messages?threadId=${encodeURIComponent(tid)}` : `${base}/messages`;
}

function resolveMemberHubPushLink(
  creatorHandle: string,
  type: string,
  data?: Record<string, string>,
): string {
  const clean = encodeURIComponent(creatorHandle.replace(/^@/, "").toLowerCase());
  const base = `${MEMBER_HUB_ORIGIN}/${clean}`;
  if (type === "new_message") {
    const threadId = data?.threadId?.trim();
    return threadId
      ? `${base}/messages?threadId=${encodeURIComponent(threadId)}`
      : `${base}/messages`;
  }
  if (type === "new_post") return `${base}/feed`;
  if (type === "purchase_confirmed" || type === "content_unlocked" || type === "live_session_scheduled") {
    const orderId = data?.orderId?.trim();
    return orderId ? `${base}/purchases?orderId=${encodeURIComponent(orderId)}` : `${base}/purchases`;
  }
  return `${base}/feed`;
}

/**
 * Send push notification (placeholder - implement with FCM or similar)
 */
async function resolveRecipientPushLink(
  userId: string,
  type: string,
  data?: Record<string, string>,
): Promise<string | undefined> {
  if (typeof data?.url === "string" && data.url.trim()) {
    return data.url.trim();
  }

  const db = getAdminDb();
  const creatorSnap = await db.collection("creators").doc(userId).get();
  if (creatorSnap.exists) {
    return resolveCreatorFanHubPushLink(type, data);
  }

  const creatorId = data?.creatorId?.trim();
  if (!creatorId) return undefined;

  try {
    const handle = await resolveCreatorHandleById(creatorId);
    if (!handle) return undefined;
    return resolveMemberHubPushLink(handle, type, data);
  } catch {
    return undefined;
  }
}

async function sendPushNotification(
  userId: string, 
  title: string, 
  body: string, 
  data?: Record<string, string>
): Promise<void> {
  const type = typeof data?.type === "string" ? data.type : "";
  const link = await resolveRecipientPushLink(userId, type, data);

  await sendUserWebPush({
    userId,
    title,
    body,
    data,
    link,
  });
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

function orderSessionFiveMinuteReminderDocIds(orderId: string): { fan: string; creator: string } {
  const base = `order_${orderId}_session_5min_reminder`;
  return { fan: base, creator: `${base}_creator` };
}

/** Remove pending fan + creator session reminders when an order is unscheduled or finished. */
export async function deleteOrderSessionFiveMinuteReminders(orderId: string): Promise<void> {
  const db = getAdminDb();
  const ids = orderSessionFiveMinuteReminderDocIds(orderId);
  await Promise.all([
    db.collection('scheduled_notifications').doc(ids.fan).delete().catch(() => undefined),
    db.collection('scheduled_notifications').doc(ids.creator).delete().catch(() => undefined),
  ]);
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
  const docId = orderSessionFiveMinuteReminderDocIds(params.orderId).fan;
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
 * Upsert the creator's "5 minutes before session start" reminder for a scheduled joint order.
 */
export async function upsertCreatorOrderSessionFiveMinuteReminder(params: {
  orderId: string;
  creatorId: string;
  fanId?: string;
  jointKind: 'video_call' | 'chat_session';
  sessionStart: Date;
  itemName: string;
  whenLabel: string;
}): Promise<void> {
  const db = getAdminDb();
  const docId = orderSessionFiveMinuteReminderDocIds(params.orderId).creator;
  const ref = db.collection('scheduled_notifications').doc(docId);
  const reminderAt = new Date(params.sessionStart.getTime() - 5 * 60 * 1000);
  const now = new Date();

  if (reminderAt.getTime() <= now.getTime()) {
    await ref.delete().catch(() => undefined);
    return;
  }

  let fanLabel = 'a fan';
  const fanId = typeof params.fanId === 'string' ? params.fanId.trim() : '';
  if (fanId && !fanId.startsWith('guest_')) {
    try {
      fanLabel = await resolveFanHubMemberDisplayLabel({
        creatorId: params.creatorId,
        fanId,
      });
    } catch {
      /* keep default */
    }
  }

  const isVideo = params.jointKind === 'video_call';
  const snap = await ref.get();
  const payload: Record<string, unknown> = {
    creatorId: params.creatorId,
    type: isVideo ? 'video_chat_reminder' : 'session_reminder',
    title: isVideo ? 'Video call in 5 minutes' : 'Chat session in 5 minutes',
    body: `${params.itemName} with ${fanLabel} starts at ${params.whenLabel}. Open Fan Hub to join.`,
    data: {
      orderId: params.orderId,
      fanId,
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
    const creatorId = typeof data.creatorId === 'string' ? data.creatorId.trim() : '';
    const fanId = typeof data.fanId === 'string' ? data.fanId.trim() : '';
    const typeRaw = typeof data.type === 'string' ? data.type : 'session_reminder';
    const fanReminderTypes = new Set<FanNotificationType>(['video_chat_reminder', 'session_reminder']);
    const type = fanReminderTypes.has(typeRaw as FanNotificationType)
      ? (typeRaw as FanNotificationType)
      : 'session_reminder';
    const title = typeof data.title === 'string' ? data.title : 'Session reminder';
    const body = typeof data.body === 'string' ? data.body : '';
    const notifyData =
      data.data && typeof data.data === 'object' && !Array.isArray(data.data)
        ? (data.data as Record<string, string>)
        : undefined;

    try {
      if (creatorId) {
        await sendCreatorHubNotification({
          creatorId,
          type,
          title,
          body,
          data: notifyData,
          sendPush: true,
        });
      } else if (fanId) {
        await sendFanNotification({
          fanId,
          type,
          title,
          body,
          data: notifyData,
          sendPush: true,
        });
      } else {
        console.warn(`Scheduled notification ${doc.id} has no creatorId or fanId`);
        continue;
      }

      await doc.ref.update({ sent: true, sentAt: now.toISOString() });
      processed++;
    } catch (error) {
      console.error(`Failed to send scheduled notification ${doc.id}:`, error);
    }
  }
  
  return processed;
}
