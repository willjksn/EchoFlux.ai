/**
 * Browser tab title for fan storefront routes (witme.io/handle, custom domains, etc.).
 * Avoids showing "EchoFlux.ai" to fans — override with VITE_FAN_FACING_SITE_TITLE if needed.
 */
const RAW = import.meta.env.VITE_FAN_FACING_SITE_TITLE as string | undefined;

export function getFanFacingSiteTitle(): string {
  const t = typeof RAW === "string" ? RAW.trim() : "";
  return t || "witme.io";
}

/** e.g. `Stormij · witme.io` */
export function formatFanStorefrontDocumentTitle(displayName: string | undefined, handle: string | undefined): string {
  const brand = getFanFacingSiteTitle();
  const name = (displayName && displayName.trim()) || (handle && handle.trim()) || "";
  if (name) return `${name} · ${brand}`;
  return brand;
}
