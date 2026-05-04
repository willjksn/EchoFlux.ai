import { inferIsVideoFromUrl } from "./mediaUrlInfer";
import { isMediaSlotLocked, type LockedPostContent } from "./lockedPostMedia";

/** Index of the media slot used as the feed/grid cover (matches {@link getFeedGridCoverMedia}). */
export function getFeedGridCoverSlotIndex(post: {
  mediaUrls: string[];
  mediaTypes?: ("image" | "video")[];
}): number {
  const urls = post.mediaUrls || [];
  const types = post.mediaTypes || [];
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i];
    if (typeof u !== "string" || !u.trim()) continue;
    const declared = types[i];
    const isVid = declared === "video" || inferIsVideoFromUrl(u);
    if (!isVid) return i;
  }
  return 0;
}

/**
 * True when the grid/list cover tile corresponds to a locked slot for viewers without unlock
 * (no hover preview / no real media on that tile).
 */
export function isFeedGridCoverLockedForViewer(
  post: {
    mediaUrls: string[];
    mediaTypes?: ("image" | "video")[];
    lockedContent?: LockedPostContent;
  },
  viewerHasEntitlement: boolean,
): boolean {
  if (viewerHasEntitlement || !post.lockedContent?.enabled) return false;
  const urls = post.mediaUrls || [];
  const n = urls.length;
  if (n <= 0) return false;
  const slot = getFeedGridCoverSlotIndex(post);
  return isMediaSlotLocked(post.lockedContent, slot, n);
}

/** First image in the carousel (good grid thumbnail); else first item — often video. */
export function getFeedGridCoverMedia(post: {
  mediaUrls: string[];
  mediaTypes?: ("image" | "video")[];
}): { url: string; isVideo: boolean } {
  const urls = post.mediaUrls || [];
  const types = post.mediaTypes || [];
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i];
    if (typeof u !== "string" || !u.trim()) continue;
    const declared = types[i];
    const isVid = declared === "video" || inferIsVideoFromUrl(u);
    if (!isVid) {
      return { url: u.trim(), isVideo: false };
    }
  }
  const first = urls.find((u) => typeof u === "string" && u.trim());
  if (!first) return { url: "", isVideo: false };
  const trimmed = first.trim();
  return {
    url: trimmed,
    isVideo: types[0] === "video" || inferIsVideoFromUrl(trimmed),
  };
}
