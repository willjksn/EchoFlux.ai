/**
 * Browser tab / PWA icons: witme.io fan surfaces use Witme artwork; EchoFlux studio uses /logo.svg.
 */

/** Bump ?v when replacing `public/witme-favicon.png` so clients drop stale cache. */
const WITME_TAB_ICON = "/witme-favicon.png?v=3";
const ECHOFLUX_ICON_SVG = "/logo.svg";
const ECHOFLUX_ICON_PNG = "/logo.png";

/** True for witme.io and *.witme.io (fan site deployment). */
export function isWitmePublicSiteHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  return h === "witme.io" || h.endsWith(".witme.io");
}

function upsertLinkTag(selector: string, attrs: Record<string, string>, href: string): void {
  if (typeof document === "undefined") return;
  let el = document.head.querySelector(selector) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    Object.entries(attrs).forEach(([k, v]) => el!.setAttribute(k, v));
    document.head.appendChild(el);
  }
  Object.entries(attrs).forEach(([k, v]) => el!.setAttribute(k, v));
  el.setAttribute("href", href);
}

/**
 * Prefer Witme favicon in the tab (overrides primary SVG shortcut from index.html, which would
 * otherwise keep the EchoFlux mark on witme.io creator URLs).
 */
export function applyWitmeTabIcons(): void {
  if (typeof document === "undefined") return;
  const svgIcon = document.head.querySelector('link[rel="icon"][type="image/svg+xml"]') as HTMLLinkElement | null;
  if (svgIcon) {
    svgIcon.setAttribute("href", WITME_TAB_ICON);
    svgIcon.setAttribute("type", "image/png");
  }
  upsertLinkTag(
    'link[rel="icon"][type="image/png"][sizes="32x32"]',
    { rel: "icon", type: "image/png", sizes: "32x32" },
    WITME_TAB_ICON,
  );
  upsertLinkTag(
    'link[rel="icon"][type="image/png"][sizes="192x192"]',
    { rel: "icon", type: "image/png", sizes: "192x192" },
    WITME_TAB_ICON,
  );
  upsertLinkTag('link[rel="apple-touch-icon"]', { rel: "apple-touch-icon" }, WITME_TAB_ICON);
}

/** Restore defaults from index.html when leaving witme fan context for EchoFlux (or other hosts). */
export function restoreEchoFluxTabIcons(): void {
  if (typeof document === "undefined") return;
  const firstIcon = document.head.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
  if (firstIcon) {
    firstIcon.setAttribute("href", ECHOFLUX_ICON_SVG);
    firstIcon.setAttribute("type", "image/svg+xml");
  }
  upsertLinkTag(
    'link[rel="icon"][type="image/png"][sizes="32x32"]',
    { rel: "icon", type: "image/png", sizes: "32x32" },
    ECHOFLUX_ICON_PNG,
  );
  upsertLinkTag(
    'link[rel="icon"][type="image/png"][sizes="192x192"]',
    { rel: "icon", type: "image/png", sizes: "192x192" },
    ECHOFLUX_ICON_PNG,
  );
  upsertLinkTag('link[rel="apple-touch-icon"]', { rel: "apple-touch-icon" }, ECHOFLUX_ICON_PNG);
}
