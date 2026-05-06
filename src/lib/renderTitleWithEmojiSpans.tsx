import React from "react";

function isEmojiGrapheme(g: string): boolean {
  const s = g.normalize("NFC");
  if (!s) return false;
  return /\p{Extended_Pictographic}/u.test(s) || /\p{Regional_Indicator}/u.test(s);
}

/** When `Intl.Segmenter` is missing, still wrap common emoji clusters for emoji-capable font CSS. */
function renderTitleWithEmojiSpansRegexFallback(
  title: string,
  emojiSpanClassName: string
): React.ReactNode {
  const pattern =
    /\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200d\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*|\p{Regional_Indicator}\p{Regional_Indicator}/gu;
  const out: React.ReactNode[] = [];
  let lastIndex = 0;
  let emojiKey = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(title)) !== null) {
    if (m.index > lastIndex) {
      out.push(title.slice(lastIndex, m.index));
    }
    out.push(
      <span key={`emoji-${emojiKey++}`} className={emojiSpanClassName}>
        {m[0]}
      </span>
    );
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < title.length) {
    out.push(title.slice(lastIndex));
  }
  if (out.length === 0) return null;
  if (out.length === 1) return out[0];
  return <>{out}</>;
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
    return renderTitleWithEmojiSpansRegexFallback(title, emojiSpanClassName);
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
