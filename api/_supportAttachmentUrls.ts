/**
 * Client uploads to `users/{uid}/support_ticket/...` and passes download URLs.
 * Reject anything that does not clearly belong to this user’s storage path.
 */
export function sanitizeSupportAttachmentUrlsForUid(raw: unknown, uid: string): string[] {
  if (!uid || typeof uid !== "string") return [];
  if (!Array.isArray(raw)) return [];
  const prefix = encodeURIComponent(`users/${uid}/`);
  const out: string[] = [];
  for (const item of raw) {
    if (out.length >= 5) break;
    if (typeof item !== "string") continue;
    const u = item.trim();
    if (!u.startsWith("https://")) continue;
    if (!u.includes(prefix)) continue;
    try {
      const parsed = new URL(u);
      if (parsed.protocol !== "https:") continue;
      out.push(u);
    } catch {
      /* skip malformed */
    }
  }
  return out;
}

export function appendAttachmentsToMessageBody(body: string, urls: string[]): string {
  if (!urls.length) return body;
  const lines = urls.map((url, i) => `${i + 1}. ${url}`).join("\n");
  return `${body}\n\n---\nAttachments:\n${lines}`;
}
