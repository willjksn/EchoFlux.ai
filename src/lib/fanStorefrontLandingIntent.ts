/**
 * One-shot "show public landing" for signed-in members (My Page Live, legacy `/p` migration).
 * Keeps the visible URL clean (no persistent `?landing=1`) via sessionStorage keyed by host + path.
 */

export const FAN_STOREFRONT_PUBLIC_LANDING_SESSION_KEY = "fanStorefrontPublicLanding:v1";

function intentKey(hostname: string, pathname: string): string {
  const p = pathname.replace(/\/+$/, "") || "/";
  return `${hostname.toLowerCase()}:${p}`;
}

export function peekFanStorefrontPublicLandingIntent(hostname: string, pathname: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(FAN_STOREFRONT_PUBLIC_LANDING_SESSION_KEY) === intentKey(hostname, pathname);
  } catch {
    return false;
  }
}

export function consumeFanStorefrontPublicLandingIntent(hostname: string, pathname: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const key = intentKey(hostname, pathname);
    if (sessionStorage.getItem(FAN_STOREFRONT_PUBLIC_LANDING_SESSION_KEY) !== key) return false;
    sessionStorage.removeItem(FAN_STOREFRONT_PUBLIC_LANDING_SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}

export function primeFanStorefrontPublicLandingIntent(hostname: string, pathname: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(FAN_STOREFRONT_PUBLIC_LANDING_SESSION_KEY, intentKey(hostname, pathname));
  } catch {
    /* ignore */
  }
}

export function primeFanStorefrontPublicLandingIntentFromAbsoluteUrl(absoluteUrl: string): void {
  try {
    const u = new URL(absoluteUrl);
    const p = u.pathname.replace(/\/+$/, "") || "/";
    primeFanStorefrontPublicLandingIntent(u.hostname, p);
  } catch {
    /* ignore */
  }
}

export function primeFanStorefrontPublicLandingIntentForNormalizedPath(nextPathname: string): void {
  if (typeof window === "undefined") return;
  const path = nextPathname.replace(/\/+$/, "") || "/";
  primeFanStorefrontPublicLandingIntent(window.location.hostname, path);
}

export function stripFanStorefrontLandingQueryParam(): boolean {
  if (typeof window === "undefined") return false;
  const p = new URLSearchParams(window.location.search);
  if (p.get("landing") !== "1") return false;
  p.delete("landing");
  const qs = p.toString();
  const hash = window.location.hash || "";
  window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : "") + hash);
  return true;
}
