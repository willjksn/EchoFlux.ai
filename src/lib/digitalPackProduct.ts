import type { TreatProduct, TreatProductType } from "../../types";

export type DigitalPackMediaKind = "image" | "video" | "audio";

export interface DigitalPackMediaItem {
  type: DigitalPackMediaKind;
  url: string;
  sortOrder?: number;
}

/** Max sharp preview images fans see before purchase (like feed unlock preview index). */
export const MAX_DIGITAL_PACK_PREVIEW_IMAGES = 2;

/** CSS blur on non-preview slots when showing real URLs (creator preview / entitled fan). */
export const DIGITAL_PACK_LOCKED_BLUR_PX = 18;

export const PROTECTED_PACK_MEDIA_URL_PREFIX = "protected://digital-pack-media/";

const MEDIA_KINDS = new Set<DigitalPackMediaKind>(["image", "video", "audio"]);

export function isDigitalPackProductType(type: TreatProductType | string | undefined): boolean {
  return type === "bundle";
}

export function protectedPackMediaPlaceholder(slotIndex: number): string {
  const i = Number.isFinite(slotIndex) ? Math.max(0, Math.floor(slotIndex)) : 0;
  return `${PROTECTED_PACK_MEDIA_URL_PREFIX}${i}`;
}

export function isProtectedPackMediaUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && url.startsWith(PROTECTED_PACK_MEDIA_URL_PREFIX);
}

export function parseDigitalPackMediaItems(raw: unknown): DigitalPackMediaItem[] {
  if (!Array.isArray(raw)) return [];
  const out: DigitalPackMediaItem[] = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const typeRaw = typeof o.type === "string" ? o.type.trim().toLowerCase() : "";
    if (!MEDIA_KINDS.has(typeRaw as DigitalPackMediaKind)) continue;
    const url = typeof o.url === "string" ? o.url.trim() : "";
    if (!url) continue;
    const sortOrder =
      typeof o.sortOrder === "number" && Number.isFinite(o.sortOrder)
        ? Math.floor(o.sortOrder)
        : i;
    out.push({ type: typeRaw as DigitalPackMediaKind, url, sortOrder });
  }
  out.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return out;
}

export function parsePreviewMediaIndices(raw: unknown, itemCount: number): number[] {
  if (!Array.isArray(raw) || itemCount <= 0) return [];
  const out: number[] = [];
  for (const v of raw) {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (!Number.isFinite(n)) continue;
    const i = Math.floor(n);
    if (i < 0 || i >= itemCount || out.includes(i)) continue;
    out.push(i);
    if (out.length >= MAX_DIGITAL_PACK_PREVIEW_IMAGES) break;
  }
  return out;
}

/** Only image slots can be sharp previews; max 2. */
export function normalizePackPreviewIndices(
  indices: number[],
  items: DigitalPackMediaItem[]
): number[] {
  const imageSlots = new Set(
    items.map((item, i) => (item.type === "image" ? i : -1)).filter((i) => i >= 0)
  );
  const out: number[] = [];
  for (const i of indices) {
    if (!imageSlots.has(i) || out.includes(i)) continue;
    out.push(i);
    if (out.length >= MAX_DIGITAL_PACK_PREVIEW_IMAGES) break;
  }
  return out;
}

export function defaultPackPreviewIndices(items: DigitalPackMediaItem[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < items.length && out.length < MAX_DIGITAL_PACK_PREVIEW_IMAGES; i++) {
    if (items[i]?.type === "image") out.push(i);
  }
  return out;
}

export function isPackMediaSlotPreview(
  slotIndex: number,
  previewIndices: number[],
  viewerHasFullAccess: boolean
): boolean {
  if (viewerHasFullAccess) return true;
  return previewIndices.includes(slotIndex);
}

/** Storefront / public API: preview slots keep real URLs; everything else is opaque. */
export function packMediaForStorefront(
  items: DigitalPackMediaItem[],
  previewIndices: number[],
  viewerHasFullAccess: boolean
): DigitalPackMediaItem[] {
  if (viewerHasFullAccess) return items;
  return items.map((item, index) =>
    isPackMediaSlotPreview(index, previewIndices, false)
      ? item
      : { ...item, url: protectedPackMediaPlaceholder(index) }
  );
}

export function derivePackCoverImageUrl(
  items: DigitalPackMediaItem[],
  previewIndices: number[],
  existingImageUrl?: string
): string | undefined {
  const trimmed = existingImageUrl?.trim();
  if (trimmed) return trimmed;
  for (const i of previewIndices) {
    const item = items[i];
    if (item?.type === "image" && item.url) return item.url;
  }
  const firstImage = items.find((item) => item.type === "image");
  return firstImage?.url;
}

export function parseTreatProductPackFields(
  raw: Record<string, unknown> | undefined
): Pick<TreatProduct, "teaserItems" | "salesVoiceTeaserUrl" | "fulfillmentItems" | "previewMediaIndices"> {
  if (!raw) return {};
  let fulfillmentItems = parseDigitalPackMediaItems(raw.fulfillmentItems);
  const legacyTeasers = parseDigitalPackMediaItems(raw.teaserItems);
  if (fulfillmentItems.length === 0 && legacyTeasers.length > 0) {
    fulfillmentItems = legacyTeasers;
  }
  let previewMediaIndices = normalizePackPreviewIndices(
    parsePreviewMediaIndices(raw.previewMediaIndices, fulfillmentItems.length),
    fulfillmentItems
  );
  if (previewMediaIndices.length === 0 && fulfillmentItems.length > 0) {
    previewMediaIndices = defaultPackPreviewIndices(fulfillmentItems);
  }
  const salesVoiceTeaserUrl =
    typeof raw.salesVoiceTeaserUrl === "string" && raw.salesVoiceTeaserUrl.trim()
      ? raw.salesVoiceTeaserUrl.trim()
      : undefined;
  return {
    ...(fulfillmentItems.length > 0 ? { fulfillmentItems } : {}),
    ...(previewMediaIndices.length > 0 ? { previewMediaIndices } : {}),
    ...(salesVoiceTeaserUrl ? { salesVoiceTeaserUrl } : {}),
  };
}

export function productHasDigitalPackFulfillment(
  type: TreatProductType | string | undefined,
  fulfillmentItems: DigitalPackMediaItem[] | undefined
): boolean {
  return isDigitalPackProductType(type) && Array.isArray(fulfillmentItems) && fulfillmentItems.length > 0;
}

export function sanitizeTreatProductForPublicView<T extends TreatProduct>(
  product: T,
  options: { isCreator: boolean; fanHasPurchased?: boolean }
): T {
  const { isCreator, fanHasPurchased = false } = options;
  if (isCreator) return product;
  if (!isDigitalPackProductType(product.type)) return product;

  const items = parseDigitalPackMediaItems(product.fulfillmentItems);
  if (items.length === 0) {
    const { fulfillmentItems: _f, teaserItems: _t, ...rest } = product;
    return rest as T;
  }

  const previewMediaIndices = normalizePackPreviewIndices(
    product.previewMediaIndices ?? defaultPackPreviewIndices(items),
    items
  );
  const viewerHasFullAccess = fanHasPurchased;
  const storefrontMedia = packMediaForStorefront(items, previewMediaIndices, viewerHasFullAccess);
  const { teaserItems: _legacy, fulfillmentItems: _full, ...rest } = product;

  return {
    ...rest,
    fulfillmentItems: storefrontMedia,
    previewMediaIndices,
    imageUrl: derivePackCoverImageUrl(items, previewMediaIndices, product.imageUrl),
  } as T;
}

export function buildDigitalPackOrderDeliveryPatch(
  productData: Record<string, unknown>,
  nowIso: string
): Record<string, unknown> | null {
  const type = typeof productData.type === "string" ? productData.type : "";
  const fulfillmentItems = parseDigitalPackMediaItems(productData.fulfillmentItems);
  if (!productHasDigitalPackFulfillment(type, fulfillmentItems)) return null;

  const first = fulfillmentItems[0];
  const deliveryType = first?.type ?? null;
  const deliveryUrl = first?.url ?? null;

  return {
    digitalPackFulfillment: true,
    deliveryItems: fulfillmentItems,
    deliveryStatus: "delivered",
    scheduleStatus: "completed",
    deliveryType,
    deliveryUrl,
    deliveredAt: nowIso,
    deliveredBy: "system",
  };
}

export function orderHasAutoDigitalPackFulfillment(data: Record<string, unknown>): boolean {
  if (data.digitalPackFulfillment === true) return true;
  const items = parseDigitalPackMediaItems(data.deliveryItems);
  return items.length > 0 && data.deliveryStatus === "delivered" && data.scheduleStatus === "completed";
}

export function togglePackPreviewIndex(
  current: number[],
  slotIndex: number,
  items: DigitalPackMediaItem[]
): number[] {
  if (items[slotIndex]?.type !== "image") return current;
  const normalized = normalizePackPreviewIndices(current, items);
  if (normalized.includes(slotIndex)) {
    return normalized.filter((i) => i !== slotIndex);
  }
  if (normalized.length >= MAX_DIGITAL_PACK_PREVIEW_IMAGES) {
    return [...normalized.slice(1), slotIndex];
  }
  return [...normalized, slotIndex];
}
