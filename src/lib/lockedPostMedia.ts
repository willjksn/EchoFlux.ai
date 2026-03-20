/**
 * Locked / PPV feed posts: which media slots are public vs locked (Stormij-style preview index).
 */

export type LockedPostContent = {
  enabled: boolean;
  priceCents: number;
  /** Index into mediaUrls that stays visible as a teaser when multi-image; default 0 */
  previewMediaIndex?: number;
};

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
