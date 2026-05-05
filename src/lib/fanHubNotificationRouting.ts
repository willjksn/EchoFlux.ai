/** sessionStorage: Fan Hub tab/thread after navigating from EchoFlux header (Firestore bell). */
export const FAN_HUB_DEEPLINK_STORAGE_KEY = 'echoflux:fanhub-deeplink';

export function resolveFanHubNotificationTarget(
  type: string,
  data: Record<string, string>
): { tab: string; threadId?: string; postId?: string } {
  const t = (type || '').trim();
  const d = data;
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
  if (t === 'purchase_confirmed' || t === 'content_unlocked' || t === 'creator_new_purchase') {
    return { tab: 'purchases' };
  }
  if (t === 'new_member') {
    return { tab: 'fans' };
  }
  if (d.threadId?.trim()) {
    return { tab: 'messages', threadId: d.threadId.trim() };
  }
  return { tab: 'messages' };
}
