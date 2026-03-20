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
    el.style.height = "0px";
    const next = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [maxHeight, minHeight]);

  useLayoutEffect(() => {
    resize();
  }, [value, resize]);

  return { ref, resize };
}
