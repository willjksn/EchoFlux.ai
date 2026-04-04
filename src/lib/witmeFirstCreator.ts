/** First live creator on witme.io — used for homepage CTAs and featured block. */
export const WITME_FIRST_CREATOR_SLUG = "stormijxo";

/** Appends `?witmePreview=1` when that flag is on (local / staging preview). */
export function witmePublicHref(path: string): string {
  if (typeof window === "undefined") return path;
  const suffix = new URLSearchParams(window.location.search).get("witmePreview") === "1" ? "?witmePreview=1" : "";
  return `${path}${suffix}`;
}
