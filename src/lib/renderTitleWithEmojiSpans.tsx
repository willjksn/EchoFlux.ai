import React from "react";

/**
 * Split title into text vs emoji runs using Unicode regex so emoji spans always get
 * emoji-capable fonts (Segmenter-only paths omitted — avoids prod inconsistencies).
 */
function splitTitleIntoTextAndEmojiSpans(title: string, emojiSpanClassName: string): React.ReactNode {
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
  return splitTitleIntoTextAndEmojiSpans(title, emojiSpanClassName);
}
