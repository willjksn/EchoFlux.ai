/**
 * How a feed comment author appears in the UI.
 * - Fans: prefer stored member @handle (`username`) when it looks like a handle.
 * - Creator / AI replies: use display name (no @).
 */
export function feedCommentAuthorLabel(c: {
  username?: string;
  author?: string;
  isCreatorReply?: boolean;
}): string {
  if (c.isCreatorReply) {
    const n = String(c.author ?? c.username ?? "Creator").trim();
    return n || "Creator";
  }
  const raw = String(c.username ?? "").trim();
  if (raw && /^[a-z0-9_]{2,32}$/i.test(raw)) {
    return `@${raw.toLowerCase()}`;
  }
  const fallback = raw || String(c.author ?? "user").trim();
  return fallback || "user";
}

/** First letter for comment avatar (strips leading @). */
export function feedCommentAuthorInitial(label: string): string {
  const s = label.replace(/^@/, "").trim();
  return (s.charAt(0) || "?").toUpperCase();
}
