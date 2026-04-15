import { getConfiguredCustomStorefrontHosts, normalizeHostname } from "./storefrontCustomDomain";

/** Where browser `/api/*` lives when the SPA is not deployed on that same origin. */
const CANONICAL_ECHOFLUX_API_ORIGIN = "https://echoflux.ai";

/**
 * Prefix for browser `fetch` to Vercel `/api/*` when the static app is not same-origin
 * (e.g. Firebase Hosting + API on Vercel). Leave unset when the UI is deployed on Vercel
 * with the same origin as `/api` (e.g. **echoflux.ai** when DNS points at Vercel).
 *
 * Set `VITE_API_BASE_URL` at build time to override (any host).
 *
 * In production, if unset, we send `/api` to **echoflux.ai** when the page is on:
 * - Firebase default hosts (`*.web.app`, `*.firebaseapp.com`)
 * - **witme.io** (including paths like `/stormijxo` — only the hostname matters)
 * - Hostnames in **VITE_CUSTOM_STOREFRONT_HOSTS** (e.g. apex custom domains that serve the SPA
 *   but do not run serverless `/api` on the same host)
 */
function productionApiBase(): string {
  const raw =
    typeof import.meta.env.VITE_API_BASE_URL === "string" ? import.meta.env.VITE_API_BASE_URL.trim() : "";
  if (raw) return raw.replace(/\/$/, "");
  if (!import.meta.env.PROD || typeof window === "undefined") return "";
  const h = window.location.hostname.toLowerCase();
  const normalized = normalizeHostname(h);
  const customHosts = getConfiguredCustomStorefrontHosts();
  const useCanonical =
    h.endsWith(".web.app") ||
    h.endsWith(".firebaseapp.com") ||
    h === "witme.io" ||
    h.endsWith(".witme.io") ||
    customHosts.includes(normalized);
  if (useCanonical) return CANONICAL_ECHOFLUX_API_ORIGIN;
  return "";
}

export function resolveApiUrl(path: string): string {
  const base = productionApiBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!base) return p;
  return `${base}${p}`;
}
