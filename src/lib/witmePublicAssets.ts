/** Root-relative WitMe marketing assets (Vite `public/`). Use for `<img src>` so dev / staging load from the current origin. */
export const WITME_OG_IMAGE_PATH = "/witme-og.png";
export const WITME_DISCOVER_OG_IMAGE_PATH = "/witme-og-discover.png";

const WITME_STATIC_OG_PATHS = new Set(
  [WITME_OG_IMAGE_PATH, WITME_DISCOVER_OG_IMAGE_PATH].map((p) => p.toLowerCase()),
);

/**
 * When the CMS or defaults still point at `https://witme.io/witme-og*.png` but the app is served from
 * localhost or another host, load the file from the current origin instead (served from `public/`).
 */
export function witmeCoerceShowcaseImageUrl(url: string): string {
  const t = url.trim();
  if (!t || typeof window === "undefined") return t;
  try {
    const u = new URL(t, window.location.href);
    if (u.hostname.toLowerCase() !== "witme.io") return t;
    const pathLower = `${u.pathname}`.toLowerCase();
    if (!WITME_STATIC_OG_PATHS.has(pathLower)) return t;
    return `${u.pathname}${u.search}`;
  } catch {
    return t;
  }
}
