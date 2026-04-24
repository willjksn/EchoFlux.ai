import { useEffect } from "react";
import { WITME_OG_IMAGE_PATH } from "../../src/lib/witmePublicAssets";
import { applyWitmeTabIcons } from "../../src/lib/witmeTabIcons";

function resolveOgAbsoluteUrl(path: string, origin: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${p}`;
}

/** Absolute image URL for og/twitter meta (crawlers require absolute). */
function resolveOgImageUrl(imageUrl: string | undefined, origin: string): string {
  const raw = (imageUrl?.trim() || WITME_OG_IMAGE_PATH).trim();
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const u = new URL(raw);
      const pathLower = u.pathname.toLowerCase();
      if (
        u.hostname.toLowerCase() === "witme.io" &&
        (pathLower === "/witme-og.png" || pathLower === "/witme-og-discover.png")
      ) {
        return `${origin}${u.pathname}${u.search}`;
      }
      return raw;
    } catch {
      return raw;
    }
  }
  return resolveOgAbsoluteUrl(raw, origin);
}

const upsertMetaTag = (selector: string, attrs: Record<string, string>, content: string) => {
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    Object.entries(attrs).forEach(([k, v]) => el!.setAttribute(k, v));
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
};

export function useWitmeSeo(opts: {
  title: string;
  description: string;
  path: string;
  imageUrl?: string;
  enabled?: boolean;
}): void {
  useEffect(() => {
    if (opts.enabled === false) return;
    if (typeof document === "undefined") return;
    const origin = window.location?.origin || "https://witme.io";
    const absoluteUrl = resolveOgAbsoluteUrl(opts.path, origin);
    const ogImage = resolveOgImageUrl(opts.imageUrl, origin);

    document.title = opts.title;
    upsertMetaTag('meta[name="description"]', { name: "description" }, opts.description);
    upsertMetaTag('meta[property="og:title"]', { property: "og:title" }, opts.title);
    upsertMetaTag('meta[property="og:description"]', { property: "og:description" }, opts.description);
    upsertMetaTag('meta[property="og:type"]', { property: "og:type" }, "website");
    upsertMetaTag('meta[property="og:url"]', { property: "og:url" }, absoluteUrl);
    upsertMetaTag('meta[property="og:image"]', { property: "og:image" }, ogImage);
    upsertMetaTag('meta[name="twitter:card"]', { name: "twitter:card" }, "summary_large_image");
    upsertMetaTag('meta[name="twitter:title"]', { name: "twitter:title" }, opts.title);
    upsertMetaTag('meta[name="twitter:description"]', { name: "twitter:description" }, opts.description);
    upsertMetaTag('meta[name="twitter:image"]', { name: "twitter:image" }, ogImage);
    applyWitmeTabIcons();

    let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", absoluteUrl);
  }, [opts.description, opts.enabled, opts.imageUrl, opts.path, opts.title]);
}
