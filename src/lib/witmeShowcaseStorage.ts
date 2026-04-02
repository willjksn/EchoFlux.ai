/**
 * Witme showcase media lives in Firebase Storage under `witme_showcase/{uid}/…`.
 * Only delete objects the signed-in user owns (path prefix), never Unsplash or legacy flat paths from the client.
 */

/** Object path for `ref(storage, path)` from a v0 download URL, or null if not this bucket / host. */
export function firebaseStorageObjectPathFromDownloadUrl(
  imageUrl: string,
  expectedBucket: string
): string | null {
  if (!imageUrl.trim() || !expectedBucket) return null;
  try {
    const u = new URL(imageUrl.trim());
    if (u.hostname !== "firebasestorage.googleapis.com") return null;
    const m = u.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (!m) return null;
    const bucket = decodeURIComponent(m[1]);
    if (bucket !== expectedBucket) return null;
    return decodeURIComponent(m[2].replace(/\+/g, "%20"));
  } catch {
    return null;
  }
}

export function isOwnedWitmeShowcaseObjectPath(objectPath: string, ownerUid: string): boolean {
  if (!objectPath || !ownerUid) return false;
  return objectPath.startsWith(`witme_showcase/${ownerUid}/`);
}

export function isOwnedWitmeShowcaseDownloadUrl(
  imageUrl: string,
  ownerUid: string,
  expectedBucket: string
): boolean {
  const path = firebaseStorageObjectPathFromDownloadUrl(imageUrl, expectedBucket);
  if (!path) return false;
  return isOwnedWitmeShowcaseObjectPath(path, ownerUid);
}

function urlCounts(urls: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const raw of urls) {
    const u = raw.trim();
    if (!u) continue;
    m.set(u, (m.get(u) ?? 0) + 1);
  }
  return m;
}

/**
 * URLs that appeared in the last-saved draft but are no longer referenced (handles duplicate rows with the same URL).
 */
export function showcaseStorageUrlsToMaybeDelete(prevUrls: string[], nextUrls: string[]): string[] {
  const prevM = urlCounts(prevUrls);
  const nextM = urlCounts(nextUrls);
  const out: string[] = [];
  for (const [url, prevCount] of prevM) {
    const nextCount = nextM.get(url) ?? 0;
    if (prevCount > 0 && nextCount === 0) {
      out.push(url);
    }
  }
  return out;
}
