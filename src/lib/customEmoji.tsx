import React from "react";
import type { Emoji } from "../../components/emojiData";

const SJ_HEART_TOKEN = ":sjheart:";
const SJ_HEART_URL = "/emojis/sj-heart-emoji-128.png";
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAILING_URL_PUNCT = /[.,!?;:)\]}>]+$/;

/** Storefront handle allowed to use / display the custom SJ heart emoji. */
export const SJ_HEART_CREATOR_HANDLE = "stormijxo";

export function normalizeCreatorHandle(handle: string | undefined | null): string {
  return String(handle ?? "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();
}

export type SjHeartEmojiAccessContext = {
  creatorHandle?: string | null;
  viewerIsAdmin?: boolean;
};

/** Picker + rendering: platform Admin, or the designated creator handle. */
export function canUseSjHeartEmoji(ctx: SjHeartEmojiAccessContext): boolean {
  if (ctx.viewerIsAdmin) return true;
  return normalizeCreatorHandle(ctx.creatorHandle) === SJ_HEART_CREATOR_HANDLE;
}

export function filterEmojisForSjHeartAccess(emojis: readonly Emoji[], allowSjHeart: boolean): Emoji[] {
  if (allowSjHeart) return [...emojis];
  return emojis.filter((e) => e.insertText !== SJ_HEART_TOKEN);
}

type TextSegment = { kind: "text"; value: string };
type UrlSegment = { kind: "url"; href: string; display: string };
type RichTextSegment = TextSegment | UrlSegment;

function trimUrlMatch(raw: string): { href: string; display: string } | null {
  let display = raw;
  while (TRAILING_URL_PUNCT.test(display) && display.length > 4) {
    display = display.replace(TRAILING_URL_PUNCT, "");
  }
  const href = display.startsWith("www.") ? `https://${display}` : display;
  if (!/^https?:\/\//i.test(href)) return null;
  try {
    const parsed = new URL(href);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return { href: parsed.href, display };
  } catch {
    return null;
  }
}

function splitTextByUrls(text: string): RichTextSegment[] {
  if (!/(?:https?:\/\/|www\.)/i.test(text)) {
    return [{ kind: "text", value: text }];
  }

  const segments: RichTextSegment[] = [];
  let lastIndex = 0;
  const re = new RegExp(URL_PATTERN.source, URL_PATTERN.flags);
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const raw = match[0];
    const start = match.index;
    if (start > lastIndex) {
      segments.push({ kind: "text", value: text.slice(lastIndex, start) });
    }
    const trimmed = trimUrlMatch(raw);
    if (trimmed) {
      segments.push({ kind: "url", href: trimmed.href, display: trimmed.display });
      const leftover = raw.slice(trimmed.display.length);
      if (leftover) segments.push({ kind: "text", value: leftover });
    } else {
      segments.push({ kind: "text", value: raw });
    }
    lastIndex = start + raw.length;
  }

  if (lastIndex < text.length) {
    segments.push({ kind: "text", value: text.slice(lastIndex) });
  }

  return segments.length ? segments : [{ kind: "text", value: text }];
}

function renderSjHeartEmojiInText(
  text: string,
  ctx: SjHeartEmojiAccessContext | undefined,
  keyPrefix: string
): React.ReactNode {
  if (!text) return null;
  if (!text.includes(SJ_HEART_TOKEN) || !canUseSjHeartEmoji(ctx ?? {})) return text;

  const parts = text.split(SJ_HEART_TOKEN);
  const nodes: React.ReactNode[] = [];

  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i]) nodes.push(parts[i]);
    if (i < parts.length - 1) {
      nodes.push(
        <img
          key={`${keyPrefix}-sjheart-${i}`}
          src={SJ_HEART_URL}
          alt="SJ heart"
          className="inline-block mx-[0.04em]"
          style={{
            width: "1.18em",
            height: "1.18em",
            objectFit: "contain",
            verticalAlign: "middle",
            position: "relative",
            top: "-0.14em",
          }}
          loading="lazy"
        />
      );
    }
  }

  return nodes;
}

export function renderTextWithCustomEmoji(
  text: string | null | undefined,
  ctx?: SjHeartEmojiAccessContext
): React.ReactNode {
  const value = text ?? "";
  if (!value) return value;

  const hasUrl = /(?:https?:\/\/|www\.)/i.test(value);
  const hasEmoji = value.includes(SJ_HEART_TOKEN) && canUseSjHeartEmoji(ctx ?? {});

  if (!hasUrl && !hasEmoji) return value;

  if (!hasUrl) {
    return renderSjHeartEmojiInText(value, ctx, "root");
  }

  const segments = splitTextByUrls(value);
  const nodes: React.ReactNode[] = [];

  segments.forEach((seg, i) => {
    if (seg.kind === "url") {
      nodes.push(
        <a
          key={`url-${i}`}
          href={seg.href}
          target="_blank"
          rel="noopener noreferrer"
          className="fan-rich-text-link"
        >
          {seg.display}
        </a>
      );
      return;
    }

    const rendered = renderSjHeartEmojiInText(seg.value, ctx, `t-${i}`);
    if (rendered == null || rendered === "") return;
    if (typeof rendered === "string") {
      nodes.push(rendered);
      return;
    }
    nodes.push(<React.Fragment key={`txt-${i}`}>{rendered}</React.Fragment>);
  });

  return nodes.length === 1 ? nodes[0] : nodes;
}
