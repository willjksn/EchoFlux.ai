/** Witme homepage / discover showcase — managed via Admin Witme Page control panel. */

export type WitmeShowcaseCreator = {
  name: string;
  /** Shown on cards, e.g. @stormijxo */
  handle: string;
  /** URL path when `linkLive` (e.g. stormijxo → /stormijxo). */
  pageSlug: string;
  /** Image or video URL (same field for both). */
  imageUrl: string;
  /** `video` = looped muted autoplay on the landing page; `image` = still image. */
  mediaKind: "image" | "video";
  /** CSS object-position for cover crop (e.g. `50% 25%`). Drag-adjust in Witme admin. */
  mediaObjectPosition: string;
  /** Zoom multiplier for hero / strip collage media (1 = default). Clamped server-side. */
  mediaScale: number;
  descriptor: string;
  tags: string[];
  /** Short line for spotlight / admin tooling */
  spotlight: string;
  /** If true, “View page” links to /{pageSlug}. If false, decorative only (no storefront link). */
  linkLive: boolean;
  /** When true (and linkLive + slug), shown in the homepage Featured section. Multiple → compact grid; one → large spotlight. */
  isFeatured: boolean;
  /** How media is fit in the homepage Featured block only (Discover / other surfaces stay cover). */
  featuredMediaFit: "cover" | "contain";
};

/**
 * Default shipped showcase: one live creator only (no placeholder directory rows).
 * Hero / featured imagery: brand OG asset until admin sets creator media in Witme Page manager.
 */
export const WITME_DEFAULT_FEATURED_CREATOR: WitmeShowcaseCreator = {
  name: "Stormi J",
  handle: "@stormijxo",
  pageSlug: "stormijxo",
  descriptor: "Quiet confidence. Real moments. Closer access.",
  tags: ["Memberships", "Store", "Messages"],
  imageUrl: "/witme-og.png",
  mediaKind: "image",
  mediaObjectPosition: "50% 50%",
  mediaScale: 1,
  spotlight: "Live creator page on WitMe",
  linkLive: true,
  isFeatured: true,
  featuredMediaFit: "cover",
};

export const DEFAULT_SHOWCASE_CREATORS: WitmeShowcaseCreator[] = [WITME_DEFAULT_FEATURED_CREATOR];

export function witmeCreatorPagePath(pageSlug: string): string {
  const s = pageSlug.trim().toLowerCase().replace(/^\/+/, "");
  return s ? `/${s}` : "";
}
