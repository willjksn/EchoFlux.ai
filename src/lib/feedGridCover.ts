import { inferIsVideoFromUrl } from "./mediaUrlInfer";

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
