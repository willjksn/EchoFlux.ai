/**
 * Classify Fan Hub store product IDs for scheduling / notifications.
 * "Joint" sessions need both parties at a specific time (notify on schedule).
 * Async treats (voice note, custom video, etc.) should not ping the fan on schedule.
 */

export type JointSessionKind = "video_call" | "chat_session";

/** Live 1:1 video or timed chat — fan + creator should be notified when a time is set. */
export function isJointLiveSessionProductId(productId: string | null | undefined): boolean {
  const id = (productId ?? "").trim().toLowerCase();
  if (!id) return false;
  if (id.startsWith("live_video_")) return true;
  if (id.startsWith("live_chat_")) return true;
  if (id === "chat_session") return true;
  return false;
}

export function jointSessionKindFromProductId(productId: string | null | undefined): JointSessionKind {
  const id = (productId ?? "").trim().toLowerCase();
  if (id.startsWith("live_video_")) return "video_call";
  return "chat_session";
}
