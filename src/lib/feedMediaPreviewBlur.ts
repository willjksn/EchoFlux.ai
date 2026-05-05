import type { CSSProperties } from "react";
import { isMediaSlotLocked, isProtectedLockedMediaUrl, type LockedPostContent } from "./lockedPostMedia";

export const MEDIA_PREVIEW_BLUR_MAX_PX = 24;

export function normalizeMediaPreviewBlurPx(raw: unknown): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MEDIA_PREVIEW_BLUR_MAX_PX, Math.round(n));
}

export function mediaPreviewBlurFilterStyle(px: number): CSSProperties | undefined {
  if (px <= 0) return undefined;
  return { filter: `blur(${px}px)` };
}

/**
 * Feed carousel blur for images/videos.
 *
 * - After a fan unlocks paywalled media, blur is cleared (sharp full unlock).
 * - While paywall teaser is active (`lockedTeaserCfg?.enabled`), only visible preview slots
 *   are blurred (same rules as before). Single-media locked posts often use placeholders.
 * - With no paywall (or fan does not see a teaser), the same blur applies to every slide.
 */
export function feedSlideMediaBlurStyle(
  mediaPreviewBlurPx: unknown,
  lockedTeaserCfg: LockedPostContent | undefined,
  viewerUnlockedPaywalledPost: boolean,
  slideIndex: number,
  urls: string[],
): CSSProperties | undefined {
  const blurPx = normalizeMediaPreviewBlurPx(mediaPreviewBlurPx);
  const n = urls.length;
  if (blurPx <= 0 || n <= 0) return undefined;
  if (viewerUnlockedPaywalledPost) return undefined;

  if (lockedTeaserCfg?.enabled) {
    const url = urls[slideIndex] ?? "";
    const protectedPh = isProtectedLockedMediaUrl(url);
    const lockedCur =
      isMediaSlotLocked(lockedTeaserCfg, slideIndex, n) ||
      (!!lockedTeaserCfg.enabled && protectedPh);
    if (protectedPh || lockedCur) return undefined;
    return mediaPreviewBlurFilterStyle(blurPx);
  }

  return mediaPreviewBlurFilterStyle(blurPx);
}
