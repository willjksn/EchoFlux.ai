import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Allows browser `fetch` from SPA origins that are not the same deployment as `/api`
 * (e.g. Firebase Hosting `*.web.app` → Vercel API on echoflux.ai or *.vercel.app).
 * Comma-separated extra origins: BROWSER_API_CORS_ORIGINS=https://app.example.com
 */
function extraAllowedOrigins(): string[] {
  const raw = process.env.BROWSER_API_CORS_ORIGINS || "";
  return raw
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

/** Same list as client `VITE_CUSTOM_STOREFRONT_HOSTS` — allow browser API from custom apex domains. */
function customStorefrontHostnames(): string[] {
  const raw = process.env.VITE_CUSTOM_STOREFRONT_HOSTS || "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase().replace(/^www\./, ""))
    .filter(Boolean);
}

/** Exported for endpoints that need the same origin list without full OPTIONS handling (e.g. GET-only image proxy). */
export function isBrowserApiAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h === "127.0.0.1") return true;
    const hn = h.replace(/^www\./, "");
    if (hn === "echoflux.ai") return true;
    if (h.endsWith(".vercel.app")) return true;
    if (h.endsWith(".web.app") || h.endsWith(".firebaseapp.com")) return true;
    if (hn === "witme.io" || hn.endsWith(".witme.io")) return true;
    if (extraAllowedOrigins().includes(origin)) return true;
    if (customStorefrontHostnames().includes(hn)) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Handles CORS preflight and sets ACAO for allowed origins. Call at the top of the handler.
 * @returns true if the response was fully handled (OPTIONS), so the handler should return immediately.
 */
export function applyBrowserApiCors(req: VercelRequest, res: VercelResponse): boolean {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
  if (req.method === "OPTIONS") {
    if (!isBrowserApiAllowedOrigin(origin)) {
      res.status(403).end();
      return true;
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "86400");
    res.setHeader("Vary", "Origin");
    res.status(204).end();
    return true;
  }
  if (isBrowserApiAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  return false;
}
