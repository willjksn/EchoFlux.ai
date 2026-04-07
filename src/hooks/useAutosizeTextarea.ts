import { useCallback, useLayoutEffect, useRef } from "react";

type Options = {
  /** Max height in px before scroll */
  maxHeight?: number;
  minHeight?: number;
};

/**
 * Stormij-style mobile-friendly composer: textarea grows with content up to maxHeight.
 */
export function useAutosizeTextarea(value: string, options: Options = {}) {
  const { maxHeight = 160, minHeight = 40 } = options;
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Important for mobile keyboards: avoid collapsing to 0px on every keystroke,
    // which can cause viewport jump/scroll jitter on iOS/Android browsers.
    el.style.height = "auto";
    const next = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight);
    const nextHeight = `${next}px`;
    if (el.style.height !== nextHeight) {
      el.style.height = nextHeight;
    }
    const nextOverflow = el.scrollHeight > maxHeight ? "auto" : "hidden";
    if (el.style.overflowY !== nextOverflow) {
      el.style.overflowY = nextOverflow;
    }
  }, [maxHeight, minHeight]);

  useLayoutEffect(() => {
    resize();
  }, [value, resize]);

  return { ref, resize };
}
