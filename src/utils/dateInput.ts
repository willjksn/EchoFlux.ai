function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Convert a `<input type="date" />` value (YYYY-MM-DD) into an ISO string that represents
 * the END of that day in the user's LOCAL timezone.
 *
 * Why: `new Date('YYYY-MM-DD').toISOString()` is treated as UTC midnight, which then
 * displays as the previous day in many US timezones when rendered with `toLocaleDateString()`.
 */
export function dateInputToIsoEndOfDay(dateInput: string): string | null {
  if (!dateInput || typeof dateInput !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const dt = new Date(year, month - 1, day, 23, 59, 59, 999);
  if (!Number.isFinite(dt.getTime())) return null;
  return dt.toISOString();
}

/**
 * Convert an ISO date string into a `<input type="date" />` value (YYYY-MM-DD) in LOCAL time.
 */
export function isoToDateInputLocal(iso: string): string {
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return "";
  const y = dt.getFullYear();
  const m = dt.getMonth() + 1;
  const d = dt.getDate();
  return `${y}-${pad2(m)}-${pad2(d)}`;
}


