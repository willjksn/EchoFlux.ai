/**
 * Snapshots/restores scroll positions along the ancestor chain + window when feed carousel
 * slide changes — avoids the main column jumping to keep the focused post in view.
 */

export type FanFeedScrollSnap = { el: HTMLElement | Document; top: number; left: number };

export function captureFanFeedCarouselScrollSnaps(root: HTMLElement | null): FanFeedScrollSnap[] {
  if (typeof document === "undefined" || typeof window === "undefined") return [];
  const out: FanFeedScrollSnap[] = [];
  let el: HTMLElement | null = root;
  while (el) {
    const st = getComputedStyle(el);
    const oy = st.overflowY;
    const ox = st.overflowX;
    const yScroll =
      (oy === "auto" || oy === "scroll" || oy === "overlay") && el.scrollHeight > el.clientHeight + 1;
    const xScroll =
      (ox === "auto" || ox === "scroll" || ox === "overlay") && el.scrollWidth > el.clientWidth + 1;
    if (yScroll || xScroll) {
      out.push({ el, top: el.scrollTop, left: el.scrollLeft });
    }
    el = el.parentElement;
  }
  out.push({ el: document.documentElement, top: window.scrollY, left: window.scrollX });
  return out;
}

export function restoreFanFeedCarouselScrollSnaps(snaps: FanFeedScrollSnap[]) {
  for (let i = snaps.length - 1; i >= 0; i--) {
    const { el, top, left } = snaps[i];
    if (el === document.documentElement) {
      window.scrollTo(left, top);
    } else {
      (el as HTMLElement).scrollTop = top;
      (el as HTMLElement).scrollLeft = left;
    }
  }
}
