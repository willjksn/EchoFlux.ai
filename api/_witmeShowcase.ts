export type WitmeShowcaseCreator = {
  name: string;
  handle: string;
  pageSlug: string;
  imageUrl: string;
  mediaKind: "image" | "video";
  mediaObjectPosition: string;
  mediaScale: number;
  descriptor: string;
  tags: string[];
  spotlight: string;
  linkLive: boolean;
  isFeatured: boolean;
  featuredMediaFit: "cover" | "contain";
};

export const WITME_DEFAULT_FEATURED_CREATOR: WitmeShowcaseCreator = {
  name: "Stormi J",
  handle: "@stormijxo",
  pageSlug: "stormijxo",
  descriptor: "Quiet confidence. Real moments. Closer access.",
  tags: ["Memberships", "Store", "Messages"],
  imageUrl: "https://witme.io/witme-og.png",
  mediaKind: "image",
  mediaObjectPosition: "50% 50%",
  mediaScale: 1,
  spotlight: "Live creator page on WitMe",
  linkLive: true,
  isFeatured: true,
  featuredMediaFit: "cover",
};

export const DEFAULT_SHOWCASE_CREATORS: WitmeShowcaseCreator[] = [WITME_DEFAULT_FEATURED_CREATOR];

function sanitizeString(value: unknown, max = 300): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

/** Showcase media must be https; blocks javascript:/data: and credential URLs. */
function sanitizeShowcaseImageUrl(value: unknown, max = 4096): string {
  const s = typeof value === "string" ? value.trim().slice(0, max) : "";
  if (!s) return "";
  const head = s.slice(0, 48).toLowerCase();
  if (head.includes("javascript:") || head.startsWith("data:") || head.includes("vbscript:")) {
    return "";
  }
  if (!s.startsWith("https://")) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") return "";
    if (u.username !== "" || u.password !== "") return "";
    return s;
  } catch {
    return "";
  }
}

function normalizePageSlug(value: unknown): string {
  const s = sanitizeString(value, 80).toLowerCase().replace(/^@+/, "");
  return s.replace(/[^a-z0-9_-]/g, "").slice(0, 40);
}

function slugFromHandleDisplay(handle: unknown): string {
  return normalizePageSlug(handle);
}

/** Map one Firestore/API object to a showcase row (may be filtered downstream). */
function parseWitmeShowcaseRow(r: Record<string, unknown>): WitmeShowcaseCreator {
  const name = sanitizeString(r.name, 80);
  const handle = sanitizeString(r.handle, 80);
  let pageSlug = normalizePageSlug(r.pageSlug);
  if (!pageSlug) pageSlug = slugFromHandleDisplay(handle);
  const imageUrl = sanitizeShowcaseImageUrl(r.imageUrl, 4096);
  const mediaKind: "image" | "video" = r.mediaKind === "video" ? "video" : "image";
  const mediaObjectPosition = sanitizeMediaObjectPosition(r.mediaObjectPosition);
  const mediaScale = sanitizeMediaScale(r.mediaScale);
  const descriptor = sanitizeString(r.descriptor, 220);
  const spotlight = sanitizeString(r.spotlight, 220);
  const tags = (Array.isArray(r.tags) ? r.tags : [])
    .map((t) => sanitizeString(t, 40))
    .filter(Boolean)
    .slice(0, 8);
  let linkLive = r.linkLive === true;
  if (linkLive && !pageSlug) linkLive = false;
  const isFeatured = r.isFeatured === true;
  const fitRaw = sanitizeString(r.featuredMediaFit, 12).toLowerCase();
  const featuredMediaFit: "cover" | "contain" = fitRaw === "contain" ? "contain" : "cover";
  return {
    name,
    handle,
    pageSlug,
    imageUrl,
    mediaKind,
    mediaObjectPosition,
    mediaScale,
    descriptor,
    tags,
    spotlight,
    linkLive,
    isFeatured,
    featuredMediaFit,
  };
}

function sanitizeMediaObjectPosition(value: unknown): string {
  const s = sanitizeString(value, 48).trim();
  if (!s) return "50% 50%";
  if (s === "center") return "50% 50%";
  if (/^[\d.]+%\s+[\d.]+%$/.test(s)) return s;
  if (/^(top|bottom|left|right|center)(\s+(top|bottom|left|right|center))?$/i.test(s)) {
    return s.replace(/\s+/g, " ").toLowerCase();
  }
  return "50% 50%";
}

function sanitizeMediaScale(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? parseFloat(value) : NaN;
  if (!Number.isFinite(n)) return 1;
  return Math.max(0.5, Math.min(2.5, n));
}

/**
 * @param hasShowcaseKey - false when `showcaseCreators` was absent on the stored document (migrate old Witme config).
 */
export function sanitizeShowcaseCreators(input: unknown, hasShowcaseKey: boolean): WitmeShowcaseCreator[] {
  const raw = Array.isArray(input) ? input : [];
  const rows: WitmeShowcaseCreator[] = raw
    .map((row) => parseWitmeShowcaseRow((row && typeof row === "object" ? row : {}) as Record<string, unknown>))
    .filter((c) => c.name && c.imageUrl)
    .slice(0, 24);

  if (!hasShowcaseKey && rows.length === 0) return [...DEFAULT_SHOWCASE_CREATORS];
  return rows;
}

/** Homepage hero collage / “What you’ll find” strip — independent media from Discover/Featured; only https media required. */
export function sanitizeHomeVisualCreators(input: unknown, max: number): WitmeShowcaseCreator[] {
  const raw = Array.isArray(input) ? input : [];
  return raw
    .map((row) => parseWitmeShowcaseRow((row && typeof row === "object" ? row : {}) as Record<string, unknown>))
    .map((c) => ({
      ...c,
      name: c.name.trim() ? c.name : "Creator",
      isFeatured: false,
      featuredMediaFit: "cover" as const,
    }))
    .filter((c) => c.imageUrl)
    .slice(0, max);
}
