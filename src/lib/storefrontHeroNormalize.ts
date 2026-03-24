/**
 * Shared hero normalization for storefront preview and getCreatorByHandle (API).
 * Keep in sync with StorefrontPreview hero handling.
 */

export type NormalizedHeroItem = {
  url: string;
  size?: "small" | "medium" | "large" | "fullBackground";
  backgroundPosition?: string;
  objectPosition?: string;
  landingAvatarLeft?: string;
  landingAvatarBottom?: string;
};

const SIZE_SET = new Set(["small", "medium", "large", "fullBackground"]);

export function normalizeHeroMediaForStorefront(
  heroMediaRaw: unknown,
  heroImageRaw: unknown,
  heroImageUrlRaw?: unknown
): NormalizedHeroItem[] {
  const heroImageStr =
    (typeof heroImageRaw === "string" && heroImageRaw.trim()) ||
    (typeof heroImageUrlRaw === "string" && heroImageUrlRaw.trim()) ||
    "";

  const out: NormalizedHeroItem[] = [];

  if (Array.isArray(heroMediaRaw)) {
    for (const raw of heroMediaRaw) {
      if (!raw || typeof raw !== "object") continue;
      const o = raw as Record<string, unknown>;
      const url =
        (typeof o.url === "string" && o.url.trim()) ||
        (typeof o.src === "string" && o.src.trim()) ||
        (typeof o.imageUrl === "string" && o.imageUrl.trim()) ||
        "";
      if (!url) continue;

      const item: NormalizedHeroItem = { url };
      const size = o.size;
      if (typeof size === "string" && SIZE_SET.has(size)) {
        item.size = size as NormalizedHeroItem["size"];
      }
      if (typeof o.backgroundPosition === "string") item.backgroundPosition = o.backgroundPosition;
      if (typeof o.objectPosition === "string") item.objectPosition = o.objectPosition;
      if (typeof o.landingAvatarLeft === "string") item.landingAvatarLeft = o.landingAvatarLeft;
      if (typeof o.landingAvatarBottom === "string") item.landingAvatarBottom = o.landingAvatarBottom;
      out.push(item);
    }
  }

  if (out.length === 0 && heroImageStr) {
    out.push({ url: heroImageStr, size: "medium" });
  }

  return out;
}
