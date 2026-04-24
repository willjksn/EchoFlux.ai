/**
 * Locked / PPV feed posts: which media slots are public vs locked (Stormij-style preview index).
 */

export type LockedPostContent = {
  enabled: boolean;
  priceCents: number;
  /** Index into mediaUrls that stays visible as a teaser when multi-image; default 0 */
  previewMediaIndex?: number;
};

export const PROTECTED_LOCKED_MEDIA_URL_PREFIX = "protected://fan-post-media/";

export function protectedLockedMediaPlaceholder(slotIndex: number): string {
  const i = Number.isFinite(slotIndex) ? Math.max(0, Math.floor(slotIndex)) : 0;
  return `${PROTECTED_LOCKED_MEDIA_URL_PREFIX}${i}`;
}

export function isProtectedLockedMediaUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && url.startsWith(PROTECTED_LOCKED_MEDIA_URL_PREFIX);
}

export function parseLockedContent(raw: unknown): LockedPostContent | undefined {
  if (raw == null || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (!o.enabled) return undefined;
  const priceCents = typeof o.priceCents === "number" && Number.isFinite(o.priceCents) ? o.priceCents : 0;
  const previewMediaIndex =
    typeof o.previewMediaIndex === "number" && Number.isFinite(o.previewMediaIndex)
      ? Math.max(0, Math.floor(o.previewMediaIndex))
      : 0;
  return { enabled: true, priceCents, previewMediaIndex };
}

export function normalizePreviewMediaIndex(index: number, mediaCount: number): number {
  if (mediaCount <= 0) return 0;
  const n = Number.isFinite(index) ? Math.floor(index) : 0;
  return Math.max(0, Math.min(mediaCount - 1, n));
}

/**
 * When locked: multi-image → only preview index is public; single image → fully locked overlay.
 * When not locked: nothing locked.
 */
export function isMediaSlotLocked(
  locked: LockedPostContent | undefined,
  slotIndex: number,
  mediaCount: number
): boolean {
  if (!locked?.enabled || mediaCount <= 0) return false;
  if (mediaCount === 1) return true;
  const preview = normalizePreviewMediaIndex(locked.previewMediaIndex ?? 0, mediaCount);
  return slotIndex !== preview;
}

/**
 * Public post docs cannot carry full paid media URLs. Keep carousel shape, but replace
 * locked slots with opaque placeholders; entitled fans resolve real URLs via an API.
 */
export function publicMediaUrlsForLockedPost(
  mediaUrls: string[],
  locked: LockedPostContent | undefined,
): string[] {
  if (!locked?.enabled) return mediaUrls;
  return mediaUrls.map((url, index) =>
    isMediaSlotLocked(locked, index, mediaUrls.length)
      ? protectedLockedMediaPlaceholder(index)
      : url
  );
}
