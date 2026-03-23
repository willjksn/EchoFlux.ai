/**
 * Infer media kind from URLs (Firebase download URLs often omit clear extensions before query params).
 */

export function inferIsVideoFromUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== "string") return false;
  try {
    const decoded = decodeURIComponent(url);
    return /\.(mp4|webm|mov|m4v|ogg|mkv|quicktime)(\?|#|&|$)/i.test(decoded);
  } catch {
    return /\.(mp4|webm|mov|m4v|ogg|mkv)(\?|#|&|$)/i.test(url);
  }
}

export function inferIsAudioFromUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== "string") return false;
  try {
    const decoded = decodeURIComponent(url);
    return /\.(webm|ogg|mp3|m4a|aac|wav|opus|flac)(\?|#|&|$)/i.test(decoded);
  } catch {
    return /\.(webm|ogg|mp3|m4a|aac|wav)(\?|#|&|$)/i.test(url);
  }
}

/** Align mediaTypes array length with mediaUrls; fill gaps using URL sniffing. */
export function normalizePostMediaTypes(
  mediaUrls: string[],
  rawTypes?: (string | undefined)[] | null
): ("image" | "video")[] {
  return mediaUrls.map((url, i) => {
    const t = rawTypes?.[i];
    if (t === "video" || inferIsVideoFromUrl(url)) return "video";
    return "image";
  });
}

/** For <source type="..."> so browsers pick the right decoder for DM / vault audio. */
export function audioMimeTypeHintForUrl(url: string): string {
  try {
    const raw = url.split("?")[0] || url;
    const path = decodeURIComponent(raw);
    if (/\.webm$/i.test(path)) return "audio/webm";
    if (/\.m4a$/i.test(path)) return "audio/mp4";
    if (/\.mp4$/i.test(path)) return "audio/mp4";
    if (/\.mp3$/i.test(path)) return "audio/mpeg";
    if (/\.ogg$/i.test(path)) return "audio/ogg";
    if (/\.wav$/i.test(path)) return "audio/wav";
    // Firebase Storage: .../o/users%2F...%2Fvoice_123.webm — extension is inside encoded segment
    const m = path.match(/\/o\/([^/]+)$/);
    if (m) {
      const objectPath = decodeURIComponent(m[1]);
      if (/\.webm$/i.test(objectPath)) return "audio/webm";
      if (/\.m4a$/i.test(objectPath)) return "audio/mp4";
      if (/\.mp3$/i.test(objectPath)) return "audio/mpeg";
      if (/\.ogg$/i.test(objectPath)) return "audio/ogg";
    }
  } catch {
    /* ignore */
  }
  return "audio/webm";
}
