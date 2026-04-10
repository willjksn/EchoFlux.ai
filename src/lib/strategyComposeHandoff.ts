/**
 * Plan My Week → Write Captions: normalize text and Instagram format for handoff.
 */

export function stripStrategyFormatPrefix(text: string): string {
  if (!text || typeof text !== "string") return "";
  return text.replace(/^\s*(reel|post|story)\s*[:—–-]\s*/i, "").trim();
}

export function instagramPostTypeFromStrategyFormat(
  format: string | undefined
): "Post" | "Reel" | "Story" | undefined {
  const f = String(format || "").trim();
  if (f === "Reel" || f === "Post" || f === "Story") return f;
  return undefined;
}

/** What to Post / API uses lowercase format ids (reel, story, carousel, …). */
export function instagramPostTypeFromContentFormat(
  format: string | undefined
): "Post" | "Reel" | "Story" | undefined {
  const direct = instagramPostTypeFromStrategyFormat(format);
  if (direct) return direct;
  const low = String(format || "").trim().toLowerCase();
  if (low === "reel") return "Reel";
  if (low === "story") return "Story";
  if (
    low === "carousel" ||
    low === "photo" ||
    low === "video" ||
    low === "text" ||
    low === "poll" ||
    low === "tweet" ||
    low === "thread" ||
    low === "post"
  ) {
    return "Post";
  }
  return undefined;
}
