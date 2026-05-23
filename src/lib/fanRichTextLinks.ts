/** Build `[label](url)` for Fan Hub captions, comments, and DMs. */
export function formatFanMarkdownLink(label: string, url: string): string | null {
  const display = label.trim().replace(/[\[\]]/g, "");
  let href = url.trim();
  if (!display || !href) return null;
  if (!/^https?:\/\//i.test(href) && !/^www\./i.test(href)) {
    href = `https://${href.replace(/^\/+/, "")}`;
  }
  if (/^www\./i.test(href)) href = `https://${href}`;
  try {
    const parsed = new URL(href);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return `[${display}](${parsed.href})`;
  } catch {
    return null;
  }
}
