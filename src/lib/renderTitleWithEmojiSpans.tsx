import React from "react";

export type RenderTitleWithEmojiSpansOptions = {
  /** Wrap plain-text runs with this class so the parent can stay `font-style: normal` (emoji stays upright). */
  textClassName?: string;
};

/**
 * Split title into text vs emoji runs using Unicode regex so emoji spans always get
 * emoji-capable fonts (consistent across browsers).
 */
function splitTitleIntoTextAndEmojiSpans(
  title: string,
  emojiSpanClassName: string,
  opts?: RenderTitleWithEmojiSpansOptions
): React.ReactNode {
  const pattern =
    /\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200d\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*|\p{Regional_Indicator}\p{Regional_Indicator}/gu;
  const out: React.ReactNode[] = [];
  let lastIndex = 0;
  let emojiKey = 0;
  let textKey = 0;
  let m: RegExpExecArray | null;
  const pushText = (slice: string) => {
    if (!slice) return;
    if (opts?.textClassName) {
      out.push(
        <span key={`t-${textKey++}`} className={opts.textClassName}>
          {slice}
        </span>
      );
    } else {
      out.push(slice);
    }
  };

  while ((m = pattern.exec(title)) !== null) {
    if (m.index > lastIndex) {
      pushText(title.slice(lastIndex, m.index));
    }
    out.push(
      <span key={`emoji-${emojiKey++}`} className={emojiSpanClassName}>
        {m[0]}
      </span>
    );
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < title.length) {
    pushText(title.slice(lastIndex));
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
  emojiSpanClassName: string,
  opts?: RenderTitleWithEmojiSpansOptions
): React.ReactNode {
  if (!title) return null;
  return splitTitleIntoTextAndEmojiSpans(title, emojiSpanClassName, opts);
}
