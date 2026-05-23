import type { CustomSocialLink, SocialLinkConfig, StorefrontSocialLinks } from "../../types";

export type StorefrontSocialLinkSurface = "landing" | "memberHub";

export type ResolvedStorefrontSocialLink = {
  key: string;
  url: string;
  name?: string;
};

function hasUrl(raw?: string): boolean {
  return typeof raw === "string" && raw.trim() !== "";
}

export function normalizeStorefrontSocialUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed) || trimmed.startsWith("//")) return trimmed;
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

function isVisibleOnSurface(
  cfg: { url?: string; show?: boolean; showInMemberHub?: boolean } | undefined,
  surface: StorefrontSocialLinkSurface
): boolean {
  if (!cfg || !hasUrl(cfg.url)) return false;
  if (surface === "landing") return cfg.show !== false;
  return cfg.showInMemberHub === true;
}

function pushIfVisible(
  out: ResolvedStorefrontSocialLink[],
  key: string,
  cfg: SocialLinkConfig | undefined,
  surface: StorefrontSocialLinkSurface,
  name?: string
) {
  if (!isVisibleOnSurface(cfg, surface)) return;
  const normalized = normalizeStorefrontSocialUrl(cfg!.url);
  if (!normalized) return;
  out.push({ key, url: normalized, name });
}

export function getResolvedStorefrontSocialLinks(
  socialLinks: StorefrontSocialLinks | undefined,
  surface: StorefrontSocialLinkSurface
): ResolvedStorefrontSocialLink[] {
  if (!socialLinks) return [];
  const links: ResolvedStorefrontSocialLink[] = [];

  pushIfVisible(links, "instagram", socialLinks.instagram, surface);
  pushIfVisible(links, "x", socialLinks.x, surface);
  pushIfVisible(links, "tiktok", socialLinks.tiktok, surface);
  pushIfVisible(links, "youtube", socialLinks.youtube, surface);
  pushIfVisible(links, "facebook", socialLinks.facebook, surface);
  pushIfVisible(links, "amazon", socialLinks.amazon, surface);

  const legacyTwitter = (
    socialLinks as StorefrontSocialLinks & { twitter?: SocialLinkConfig }
  ).twitter;
  if (!links.some((l) => l.key === "x")) {
    pushIfVisible(links, "x", legacyTwitter, surface);
  }

  if (Array.isArray(socialLinks.custom)) {
    socialLinks.custom.forEach((custom, index) => {
      if (!isVisibleOnSurface(custom, surface)) return;
      const normalized = normalizeStorefrontSocialUrl(custom.url);
      if (!normalized) return;
      links.push({
        key: `custom-${index}`,
        url: normalized,
        name: custom.name?.trim() || "Link",
      });
    });
  }

  return links;
}

export function hasStorefrontSocialLinksOnSurface(
  socialLinks: StorefrontSocialLinks | undefined,
  surface: StorefrontSocialLinkSurface
): boolean {
  return getResolvedStorefrontSocialLinks(socialLinks, surface).length > 0;
}
