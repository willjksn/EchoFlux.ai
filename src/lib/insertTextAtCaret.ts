export type TextCaretRange = { start: number; end: number };

/** Insert text at the current caret/selection in a text field; restores focus and caret after update. */
export function insertTextAtCaret(
  value: string,
  insert: string,
  el: HTMLTextAreaElement | HTMLInputElement | null | undefined,
  onValue: (next: string) => void,
  maxLength?: number,
  savedCaret?: TextCaretRange | null
): void {
  if (!insert) return;
  if (!el) {
    const next = maxLength != null ? (value + insert).slice(0, maxLength) : value + insert;
    onValue(next);
    return;
  }
  const focused = typeof document !== "undefined" && document.activeElement === el;
  const start = focused
    ? (el.selectionStart ?? value.length)
    : (savedCaret?.start ?? el.selectionStart ?? value.length);
  const end = focused
    ? (el.selectionEnd ?? value.length)
    : (savedCaret?.end ?? el.selectionEnd ?? value.length);
  let next = value.slice(0, start) + insert + value.slice(end);
  if (maxLength != null) next = next.slice(0, maxLength);
  onValue(next);
  const cursor = Math.min(start + insert.length, next.length);
  window.requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(cursor, cursor);
  });
}
