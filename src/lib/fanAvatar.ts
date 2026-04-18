/**
 * Prevent fan/member rows from showing the creator's profile or storefront images
 * when bad data copies the same URLs onto `creators/.../fans` or preferences.
 */

function normalizeImageUrlForCompare(url: string): string {
  const t = url.trim();
  if (!t) return t;
  try {
    const u = new URL(t);
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return t;
  }
}

function addUrlToSet(s: Set<string>, raw: unknown): void {
  if (typeof raw !== "string" || !raw.trim()) return;
  const t = raw.trim();
  s.add(t);
  s.add(normalizeImageUrlForCompare(t));
}

/**
 * Collect comparable image URLs from creator `users/{uid}` and `creators/{uid}` docs.
 */
export function buildCreatorImageUrlSet(
  userData: Record<string, unknown> | undefined,
  creatorData: Record<string, unknown> | undefined
): Set<string> {
  const s = new Set<string>();
  const scan = (d: Record<string, unknown> | undefined) => {
    if (!d) return;
    for (const k of [
      "avatar",
      "photoURL",
      "photoUrl",
      "avatarUrl",
      "imageUrl",
      "profileImageUrl",
      "profilePhotoUrl",
      "logo",
      "logoUrl",
    ]) {
      addUrlToSet(s, d[k]);
    }
  };
  scan(userData);
  scan(creatorData);
  return s;
}

function urlMatchesCreatorImages(url: string, creatorUrls: Set<string>): boolean {
  const t = url.trim();
  if (!t) return false;
  if (creatorUrls.has(t)) return true;
  return creatorUrls.has(normalizeImageUrlForCompare(t));
}

/**
 * Returns `undefined` when the URL is empty, belongs to the creator, or matches a known creator image.
 */
export function fanAvatarUrlOrUndefined(
  raw: string | null | undefined,
  opts: { fanAuthUid: string; creatorId: string; creatorImageUrls: Set<string> }
): string | undefined {
  const url = typeof raw === "string" ? raw.trim() : "";
  if (!url) return undefined;
  const fanUid = String(opts.fanAuthUid || "").trim();
  const cid = String(opts.creatorId || "").trim();
  if (fanUid && cid && fanUid === cid) return undefined;
  if (urlMatchesCreatorImages(url, opts.creatorImageUrls)) return undefined;
  return url;
}
