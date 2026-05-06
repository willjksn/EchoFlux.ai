import React from "react";

function isEmojiGrapheme(g: string): boolean {
  const s = g.normalize("NFC");
  if (!s) return false;
  return /\p{Extended_Pictographic}/u.test(s) || /\p{Regional_Indicator}/u.test(s);
}

/**
 * Renders title text with emoji graphemes wrapped in spans so CSS can apply
 * emoji-capable fonts / neutral tracking without changing the surrounding typeface.
 */
export function renderTitleWithEmojiSpans(
  title: string,
  emojiSpanClassName: string
): React.ReactNode {
  if (!title) return null;
  if (typeof Intl === "undefined" || !("Segmenter" in Intl)) {
    return title;
  }

  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const out: React.ReactNode[] = [];
  let textBuf = "";
  let emojiKey = 0;

  const flushText = () => {
    if (textBuf.length > 0) {
      out.push(textBuf);
      textBuf = "";
    }
  };

  for (const { segment } of segmenter.segment(title)) {
    if (isEmojiGrapheme(segment)) {
      flushText();
      out.push(
        <span key={`emoji-${emojiKey++}`} className={emojiSpanClassName}>
          {segment}
        </span>
      );
    } else {
      textBuf += segment;
    }
  }
  flushText();

  if (out.length === 0) return null;
  if (out.length === 1) return out[0];
  return <>{out}</>;
}
