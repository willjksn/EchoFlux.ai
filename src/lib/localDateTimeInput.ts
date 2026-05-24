/** Date/time helpers for `<input type="date|time|datetime-local">` (always local, never UTC ISO date). */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** `YYYY-MM-DD` in the user's local timezone. */
export function localDateInputValue(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** `HH:mm` in the user's local timezone. */
export function localTimeInputValue(d: Date = new Date()): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Value for `<input type="datetime-local">`. */
export function localDatetimeLocalInputValue(d: Date = new Date()): string {
  return `${localDateInputValue(d)}T${localTimeInputValue(d)}`;
}

/** Earliest selectable schedule time (default +1 minute from now). */
export function minScheduleDatetimeLocalInput(bufferMinutes = 1): string {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + bufferMinutes);
  return localDatetimeLocalInputValue(d);
}

/** True if `date` is at least `bufferMinutes` in the future. */
export function isScheduleTimeInFuture(date: Date, bufferMinutes = 1): boolean {
  if (!Number.isFinite(date.getTime())) return false;
  return date.getTime() >= Date.now() + bufferMinutes * 60_000;
}

/** Calendar `YYYY-MM-DD` label from a scheduled instant (local date, not UTC). */
export function localCalendarDateFromDate(d: Date): string {
  return localDateInputValue(d);
}
