import { getAdminDb } from "./_firebaseAdmin.js";
import { sendFcmMulticast } from "./_fcmPush.js";

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || "https://echoflux.ai").replace(/\/$/, "");

/** Mirror `resolveFanHubNotificationTarget` for FCM deep links (creator Fan Hub). */
export function resolveCreatorFanHubPushLink(type: string, data?: Record<string, string>): string {
  const t = (type || "").trim();
  const d = data || {};
  const params = new URLSearchParams();

  if (t === "post_liked" || t === "post_comment") {
    params.set("tab", "posts");
    const postId = d.postId?.trim();
    if (postId) params.set("postId", postId);
  } else if (t === "new_message" && d.threadId?.trim()) {
    params.set("tab", "messages");
    params.set("threadId", d.threadId.trim());
  } else if (t === "video_chat_accepted" || t === "video_chat_starting" || t === "video_chat_reminder") {
    params.set("tab", "videoChats");
  } else if (t === "session_starting" || t === "session_reminder") {
    params.set("tab", "sessions");
  } else if (t === "live_session_scheduled") {
    params.set("tab", d.jointKind === "video_call" ? "videoChats" : "sessions");
  } else if (
    t === "purchase_confirmed" ||
    t === "creator_gift_granted" ||
    t === "content_unlocked" ||
    t === "creator_new_purchase"
  ) {
    params.set("tab", "purchases");
    const orderId = d.orderId?.trim();
    if (orderId) params.set("orderId", orderId);
  } else if (t === "new_member") {
    params.set("tab", "fans");
    const fanId = d.fanId?.trim();
    if (fanId) params.set("fanId", fanId);
  } else if (d.threadId?.trim()) {
    params.set("tab", "messages");
    params.set("threadId", d.threadId.trim());
  } else if (t === "new_post") {
    params.set("tab", "feed");
    const postId = d.postId?.trim();
    if (postId) params.set("postId", postId);
  } else {
    params.set("tab", "messages");
  }

  const qs = params.toString();
  return qs ? `${APP_ORIGIN}/fan-hub?${qs}` : `${APP_ORIGIN}/fan-hub`;
}

export function resolveAdminDashboardPushLink(): string {
  return `${APP_ORIGIN}/admin`;
}

/**
 * Web push to a single user (`users/{uid}.fcmTokens`). Used for creators, members, and admins.
 */
export async function sendUserWebPush(params: {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  link?: string;
}): Promise<void> {
  const userId = params.userId.trim();
  if (!userId) return;

  const db = getAdminDb();
  const userDoc = await db.collection("users").doc(userId).get();
  const userData = userDoc.data();

  if (userData?.pushNotificationsEnabled === false) return;

  const tokens = Array.isArray(userData?.fcmTokens)
    ? (userData!.fcmTokens as string[]).filter((t) => typeof t === "string" && t.trim())
    : [];
  if (tokens.length === 0) {
    console.warn("sendUserWebPush: no fcmTokens for user", userId, { type: params.data?.type });
    return;
  }

  const tokenOwners = new Map<string, string>();
  tokens.forEach((t) => tokenOwners.set(t, userId));

  const data: Record<string, string> = { ...(params.data || {}) };
  if (params.link && !data.url) data.url = params.link;

  await sendFcmMulticast({
    tokens,
    tokenOwners,
    title: params.title,
    body: params.body,
    data,
    link: params.link,
  });
}

let adminUidCache: { fetchedAt: number; uids: string[] } | null = null;
const ADMIN_UID_CACHE_MS = 5 * 60 * 1000;

async function listPlatformAdminUids(): Promise<string[]> {
  const now = Date.now();
  if (adminUidCache && now - adminUidCache.fetchedAt < ADMIN_UID_CACHE_MS) {
    return adminUidCache.uids;
  }
  const db = getAdminDb();
  const snap = await db.collection("users").where("role", "==", "Admin").limit(25).get();
  const uids = snap.docs.map((d) => d.id);
  adminUidCache = { fetchedAt: now, uids };
  return uids;
}

/** Push to every platform Admin with registered device tokens. */
export async function sendPlatformAdminWebPush(params: {
  title: string;
  body: string;
  data?: Record<string, string>;
  link?: string;
}): Promise<void> {
  const adminIds = await listPlatformAdminUids();
  if (adminIds.length === 0) return;
  const link = params.link || resolveAdminDashboardPushLink();
  await Promise.all(
    adminIds.map((userId) =>
      sendUserWebPush({
        userId,
        title: params.title,
        body: params.body,
        data: params.data,
        link,
      }).catch((e) => {
        console.warn("sendPlatformAdminWebPush failed:", userId, e);
      }),
    ),
  );
}

/** Fire-and-forget web push after an `admin_alerts` row is written. */
export async function pushForAdminAlert(alert: {
  title?: string;
  message?: string;
  type?: string;
}): Promise<void> {
  const title = (alert.title || "EchoFlux admin alert").trim();
  const body = (alert.message || "").trim();
  if (!body) return;
  await sendPlatformAdminWebPush({
    title,
    body,
    data: alert.type ? { type: alert.type } : undefined,
    link: resolveAdminDashboardPushLink(),
  });
}
