/** sessionStorage: Fan Hub tab/thread after navigating from EchoFlux header (Firestore bell). */
export const FAN_HUB_DEEPLINK_STORAGE_KEY = 'echoflux:fanhub-deeplink';

/** Persist Fan Hub push / notification URL params before auth redirects strip the path. */
export function captureFanHubPushDeeplinkFromUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    const path = window.location.pathname || '';
    if (path !== '/fan-hub') return;
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab')?.trim() || '';
    const threadId = params.get('threadId')?.trim() || '';
    const postId = params.get('postId')?.trim() || '';
    const fanId = params.get('fanId')?.trim() || '';
    const orderId = params.get('orderId')?.trim() || '';
    if (!tab && !threadId && !postId && !fanId && !orderId) return;
    sessionStorage.setItem(
      FAN_HUB_DEEPLINK_STORAGE_KEY,
      JSON.stringify({
        tab: tab || undefined,
        threadId: threadId || undefined,
        postId: postId || undefined,
        fanId: fanId || undefined,
        orderId: orderId || undefined,
      }),
    );
  } catch {
    /* ignore */
  }
}

export type FanHubNotificationTarget = {
  tab: string;
  threadId?: string;
  postId?: string;
  orderId?: string;
};

export function resolveFanHubNotificationTarget(
  type: string,
  data: Record<string, string>
): FanHubNotificationTarget {
  const t = (type || '').trim();
  const d = data;
  const orderId = d.orderId?.trim() || undefined;
  const destination = d.destination?.trim().toLowerCase();
  if (t === 'post_liked' || t === 'post_comment') {
    const postId = d.postId?.trim();
    return postId ? { tab: 'posts', postId } : { tab: 'posts' };
  }
  if (t === 'new_message' && d.threadId?.trim()) {
    return { tab: 'messages', threadId: d.threadId.trim() };
  }
  if (t === 'video_chat_accepted' || t === 'video_chat_starting' || t === 'video_chat_reminder') {
    return { tab: 'videoChats' };
  }
  if (t === 'session_starting' || t === 'session_reminder') {
    return { tab: 'sessions' };
  }
  if (t === 'live_session_scheduled') {
    return d.jointKind === 'video_call' ? { tab: 'videoChats' } : { tab: 'sessions' };
  }
  if (
    t === 'purchase_confirmed' ||
    t === 'creator_gift_granted' ||
    t === 'content_unlocked' ||
    t === 'creator_new_purchase' ||
    destination === 'purchases'
  ) {
    return { tab: 'purchases', orderId };
  }
  if (t === 'new_member') {
    return { tab: 'fans' };
  }
  if (d.threadId?.trim()) {
    return { tab: 'messages', threadId: d.threadId.trim() };
  }
  return { tab: 'messages' };
}
