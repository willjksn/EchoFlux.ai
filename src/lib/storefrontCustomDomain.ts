/**
 * Custom domains (e.g. stormijxo.com) that serve the fan storefront without a /{handle} path.
 *
 * Configure in Vercel (and .env.local for dev):
 *   VITE_CUSTOM_STOREFRONT_HOSTS=stormijxo.com,www.stormijxo.com
 *
 * Hostnames are normalized (lowercase; leading `www.` stripped for matching).
 */

export function getConfiguredCustomStorefrontHosts(): string[] {
  const raw =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_CUSTOM_STOREFRONT_HOSTS;
  const s = typeof raw === "string" ? raw : "";
  return s
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/^www\./, ""))
    .filter(Boolean);
}

export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^www\./, "");
}

export function isConfiguredCustomStorefrontHost(hostname: string): boolean {
  return getConfiguredCustomStorefrontHosts().includes(normalizeHostname(hostname));
}

/**
 * True when this path on this host should render the fan storefront (custom domain only).
 * - `/`, `/terms`, `/privacy`
 * - `/{handle}` where handle matches My Page slug `[a-z0-9_]+`
 */
export function isCustomDomainStorefrontPath(pathname: string, hostname: string): boolean {
  if (!isConfiguredCustomStorefrontHost(hostname)) return false;
  const np = pathname.replace(/\/+$/, "") || "/";
  if (np === "/" || np === "/terms" || np === "/privacy") return true;
  const m = pathname.match(/^\/([^/]+)\/?$/);
  if (!m) return false;
  const seg = m[1];
  if (seg === "api" || seg.includes(".")) return false;
  return /^[a-z0-9_]+$/i.test(seg);
}
