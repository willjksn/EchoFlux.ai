/**
 * Custom domains (e.g. stormijxo.com) that serve the fan storefront without a /{handle} path.
 *
 * Configure in Vercel (and .env.local for dev):
 *   VITE_CUSTOM_STOREFRONT_HOSTS=stormijxo.com,www.stormijxo.com
 *
 * Hostnames are normalized (lowercase; leading `www.` stripped for matching).
 *
 * **Never** list **echoflux.ai** here — if it were included, `/` on the main app would be routed to
 * FanStorefrontView and appear stuck on “Loading…”. We always strip canonical SaaS hosts from the
 * effective list even if misconfigured in env.
 */

/** Creator shell at `/` — not fan-only custom-root storefront routing. */
const CANONICAL_SAAS_APP_HOSTNAMES = new Set(["echoflux.ai"]);

export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^www\./, "");
}

export function isCanonicalSaaSAppHostname(hostname: string): boolean {
  return CANONICAL_SAAS_APP_HOSTNAMES.has(normalizeHostname(hostname));
}

export function getConfiguredCustomStorefrontHosts(): string[] {
  const raw =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_CUSTOM_STOREFRONT_HOSTS;
  const s = typeof raw === "string" ? raw : "";
  return s
    .split(",")
    .map((h) => normalizeHostname(h))
    .filter(Boolean)
    .filter((h) => !isCanonicalSaaSAppHostname(h));
}

export function isConfiguredCustomStorefrontHost(hostname: string): boolean {
  return getConfiguredCustomStorefrontHosts().includes(normalizeHostname(hostname));
}

/** Member hub path segments on custom domains — align with FanStorefrontView / App.tsx */
const CUSTOM_SF_MEMBER_SEGS =
  /^(?:feed|home|store|treats|purchases|tip|messages|profile|saved|about)$/i;

/**
 * True when this path on this host should render the fan storefront (custom domain only).
 * - `/`, `/p` (public landing for signed-in members), `/terms`, `/privacy`
 * - `/{memberTab}` at root hub (e.g. `/messages`, `/store`)
 * - `/{handle}` where handle matches My Page slug `[a-z0-9_]+`
 * - `/{handle}/{memberTab}` or `/{handle}/terms|privacy|p`
 */
export function isCustomDomainStorefrontPath(pathname: string, hostname: string): boolean {
  if (!isConfiguredCustomStorefrontHost(hostname)) return false;
  const np = pathname.replace(/\/+$/, "") || "/";
  if (np === "/" || np === "/terms" || np === "/privacy") return true;
  const parts = np.slice(1).split("/").filter(Boolean);
  if (parts.length === 1) {
    const seg = parts[0];
    if (seg === "api" || seg.includes(".")) return false;
    if (seg === "terms" || seg === "privacy") return true;
    if (CUSTOM_SF_MEMBER_SEGS.test(seg)) return true;
    return /^[a-z0-9_]+$/i.test(seg);
  }
  if (parts.length === 2) {
    const a = parts[0];
    const b = parts[1];
    if (a === "api" || a.includes(".")) return false;
    if (!/^[a-z0-9_]+$/i.test(a)) return false;
    if (b === "terms" || b === "privacy" || b.toLowerCase() === "p") return true;
    return CUSTOM_SF_MEMBER_SEGS.test(b);
  }
  return false;
}
