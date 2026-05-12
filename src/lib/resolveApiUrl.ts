import { getConfiguredCustomStorefrontHosts, normalizeHostname } from "./storefrontCustomDomain";

/** Where browser `/api/*` lives when the SPA is not deployed on that same origin. */
const CANONICAL_ECHOFLUX_API_ORIGIN = "https://echoflux.ai";

function witmeHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  return h === "witme.io" || h.endsWith(".witme.io");
}

/** Firebase-hosted witme with no `/api` must call echoflux.ai (CORS required). Witme domains on Vercel with `/api` can set this true to skip cross-origin entirely. */
function witmeUsesSameOriginApi(): boolean {
  const v =
    typeof import.meta.env.VITE_WITME_USE_SAME_ORIGIN_API === "string"
      ? import.meta.env.VITE_WITME_USE_SAME_ORIGIN_API.trim().toLowerCase()
      : "";
  return v === "1" || v === "true" || v === "yes";
}

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

  /** Same Vercel project may serve witme.io + echoflux.ai; witme hosts can hit `/api` on the current origin and avoid locked-media CORS. */
  if (witmeHostname(h) && witmeUsesSameOriginApi()) {
    return "";
  }

  const useCanonical =
    h.endsWith(".web.app") ||
    h.endsWith(".firebaseapp.com") ||
    witmeHostname(h) ||
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

/**
 * Shown when `/api/*` returns 404 — usually local Vite with no `DEV_API_PROXY`, or a deployment
 * missing that serverless route. Not for end-user production copy; dev-oriented.
 */
export const DEV_API_404_USER_HINT =
  "If you’re on localhost: set DEV_API_PROXY in .env.local to your Vercel app URL, or run npm run dev:vercel. See docs/LOCAL_DEV.md.";
