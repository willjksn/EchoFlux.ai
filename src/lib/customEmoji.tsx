import React from "react";
import type { Emoji } from "../../components/emojiData";

const SJ_HEART_TOKEN = ":sjheart:";
const SJ_HEART_URL = "/emojis/sj-heart-emoji-128.png";

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

export function renderTextWithCustomEmoji(
  text: string | null | undefined,
  ctx?: SjHeartEmojiAccessContext
): React.ReactNode {
  const value = text ?? "";
  if (!value.includes(SJ_HEART_TOKEN)) return value;
  if (!canUseSjHeartEmoji(ctx ?? {})) return value;

  const parts = value.split(SJ_HEART_TOKEN);
  const nodes: React.ReactNode[] = [];

  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i]) nodes.push(parts[i]);
    if (i < parts.length - 1) {
      nodes.push(
        <img
          key={`sjheart-${i}`}
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
