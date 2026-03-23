/**
 * Shared "Send To" helpers for Premium Studio outputs.
 * Writes to: Compose drafts (posts), Calendar (scheduled post + event), Fan Hub Feed (drops), Fan Hub Messages (campaigns).
 */

import { doc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { Post, CalendarEvent } from '../../types';
import type { Platform } from '../../types';

export type SendToDraftPayload = {
  content: string;
  mediaUrls?: string[];
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  platforms?: Platform[];
  author?: { name: string; avatar: string };
};

export type SendToScheduledPayload = {
  content: string;
  mediaUrls?: string[];
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  platforms?: Platform[];
  scheduledDate: string; // ISO date or datetime
  title?: string;
  author?: { name: string; avatar: string };
};

export type DropVisibility = 'free' | 'subscriber' | 'locked';

export type SendToDropPayload = {
  content: string;
  mediaUrls?: string[];
  mediaUrl?: string;
  mediaType?: "image" | "video";
  visibility: DropVisibility;
  lockedPrice?: number; // required when visibility === 'locked'
  /** When locked + multiple media: public teaser index (same as Fan Hub Posts composer). */
  previewMediaIndex?: number;
  title?: string;
};

export type SendToMessageCampaignPayload = {
  name?: string;
  messages: string[]; // sequence of messages to send
};

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function safeAuthor(author?: { name: string; avatar: string }): { name: string; avatar: string } {
  return author && author.name
    ? { name: author.name, avatar: author.avatar || '' }
    : { name: 'Creator', avatar: '' };
}

/** Write a draft post to users/{userId}/posts. Appears in Compose drafts. */
export async function sendToDraft(
  db: Firestore,
  userId: string,
  payload: SendToDraftPayload
): Promise<{ postId: string }> {
  const postId = `draft-${generateId()}`;
  const platforms = payload.platforms && payload.platforms.length > 0 ? payload.platforms : (['Instagram'] as Platform[]);
  const post: Post = {
    id: postId,
    content: payload.content,
    mediaUrl: payload.mediaUrl ?? payload.mediaUrls?.[0],
    mediaUrls: payload.mediaUrls ?? (payload.mediaUrl ? [payload.mediaUrl] : undefined),
    mediaType: payload.mediaType,
    platforms,
    status: 'Draft',
    author: safeAuthor(payload.author),
    comments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await setDoc(doc(db, 'users', userId, 'posts', postId), post);
  return { postId };
}

/** Write a scheduled post to users/{userId}/posts and a calendar event to users/{userId}/calendar_events. */
export async function sendToScheduledPost(
  db: Firestore,
  userId: string,
  payload: SendToScheduledPayload
): Promise<{ postId: string; eventId: string }> {
  const postId = `scheduled-${generateId()}`;
  const platforms = payload.platforms && payload.platforms.length > 0 ? payload.platforms : (['Instagram'] as Platform[]);
  const post: Post = {
    id: postId,
    content: payload.content,
    mediaUrl: payload.mediaUrl ?? payload.mediaUrls?.[0],
    mediaUrls: payload.mediaUrls ?? (payload.mediaUrl ? [payload.mediaUrl] : undefined),
    mediaType: payload.mediaType,
    platforms,
    status: 'Scheduled',
    author: safeAuthor(payload.author),
    scheduledDate: payload.scheduledDate,
    comments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await setDoc(doc(db, 'users', userId, 'posts', postId), post);

  const eventId = `post-${postId}-${platforms[0]}-0`;
  const dateStr = payload.scheduledDate.slice(0, 10);
  const calEvent: CalendarEvent = {
    id: eventId,
    title: payload.title || 'Scheduled post',
    date: dateStr,
    type: 'Post',
    platform: platforms[0],
    status: 'Scheduled',
  };
  await setDoc(doc(db, 'users', userId, 'calendar_events', eventId), calEvent);

  return { postId, eventId };
}

/**
 * Fan Hub “drop” → same collection as Fan Hub Posts (`creators/{userId}/fanPosts`).
 * (Legacy `users/.../onlyfans_feed` is no longer written — member feed reads `fanPosts`.)
 */
export async function sendToDrop(
  db: Firestore,
  userId: string,
  payload: SendToDropPayload
): Promise<{ dropId: string }> {
  if (payload.visibility === "locked" && (payload.lockedPrice == null || payload.lockedPrice < 0)) {
    throw new Error("lockedPrice is required when visibility is locked");
  }
  const mediaUrls =
    payload.mediaUrls && payload.mediaUrls.length > 0
      ? payload.mediaUrls
      : payload.mediaUrl
        ? [payload.mediaUrl]
        : [];
  const mediaTypes: ("image" | "video")[] = mediaUrls.map((_, i) =>
    i === 0 && payload.mediaType === "video" ? "video" : "image"
  );

  let lockedContent: { enabled: true; priceCents: number; previewMediaIndex?: number } | undefined;
  if (payload.visibility === "locked") {
    const priceCents = Math.round((payload.lockedPrice ?? 0) * 100);
    lockedContent = {
      enabled: true,
      priceCents,
      ...(mediaUrls.length > 1 && typeof payload.previewMediaIndex === "number"
        ? {
            previewMediaIndex: Math.max(
              0,
              Math.min(mediaUrls.length - 1, Math.floor(payload.previewMediaIndex))
            ),
          }
        : {}),
    };
  }

  const postData: Record<string, unknown> = {
    creatorId: userId,
    body: payload.content,
    mediaUrls,
    mediaTypes,
    likeCount: 0,
    likedBy: [],
    comments: [],
    status: "published",
    hideLikeCounts: false,
    hideComments: false,
    hideLikes: false,
    showTipButton: true,
    dropVisibility: payload.visibility,
    title: payload.title ?? "",
    createdAt: serverTimestamp(),
    publishedAt: serverTimestamp(),
    ...(lockedContent ? { lockedContent } : {}),
  };

  const ref = await addDoc(collection(db, "creators", userId, "fanPosts"), postData);
  return { dropId: ref.id };
}

/** Write a message campaign (sequence) to Fan Hub Messages: users/{userId}/onlyfans_message_campaigns. */
export async function sendToMessageCampaign(
  db: Firestore,
  userId: string,
  payload: SendToMessageCampaignPayload
): Promise<{ campaignId: string }> {
  const name = payload.name?.trim() || `Campaign ${new Date().toLocaleDateString()}`;
  const ref = await addDoc(collection(db, 'users', userId, 'onlyfans_message_campaigns'), {
    name,
    messages: payload.messages || [],
    status: 'ready',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { campaignId: ref.id };
}
