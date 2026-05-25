/** Daily.co platform free tier — participant-minutes per billing cycle. */
export const DAILY_FREE_TIER_MINUTES = 10_000;

/** Daily.co billing cycles start on this day of each month (your account: 1st). */
export const DAILY_BILLING_CYCLE_START_DAY = 1;

/** Aligns with US-based Daily.co monthly billing (cycle resets on the 1st). */
export const DAILY_BILLING_TIMEZONE = "America/New_York";

const DAILY_COST_PER_PARTICIPANT_MINUTE = 0.004;

export function dailyBillingCycleMonthKey(date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: DAILY_BILLING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

/** UTC instants for billing cycle window (`[startMs, endMs)` per `YYYY-MM` key). */
export function dailyBillingCycleBounds(monthKey: string): { startMs: number; endMs: number } {
  const [yRaw, mRaw] = monthKey.split("-");
  const year = Number(yRaw);
  const month = Number(mRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return dailyBillingCycleBounds(dailyBillingCycleMonthKey(new Date()));
  }
  const startMs = Date.UTC(year, month - 1, DAILY_BILLING_CYCLE_START_DAY, 0, 0, 0, 0);
  const endMs =
    month === 12
      ? Date.UTC(year + 1, 0, DAILY_BILLING_CYCLE_START_DAY, 0, 0, 0, 0)
      : Date.UTC(year, month, DAILY_BILLING_CYCLE_START_DAY, 0, 0, 0, 0);
  return { startMs, endMs };
}

const UTC_DATE_FMT: Intl.DateTimeFormatOptions = {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
};

export function dailyBillingCycleLabel(monthKey: string): string {
  const [yRaw, mRaw] = monthKey.split("-");
  const year = Number(yRaw);
  const month = Number(mRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthKey;
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return `${start.toLocaleDateString("en-US", UTC_DATE_FMT)} – ${end.toLocaleDateString("en-US", UTC_DATE_FMT)}`;
}

/** Next cycle start (e.g. June 1, 2026 when current key is 2026-05). */
export function dailyBillingCycleResetsOnLabel(monthKey: string): string {
  const [yRaw, mRaw] = monthKey.split("-");
  const year = Number(yRaw);
  const month = Number(mRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return "";
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const reset = new Date(Date.UTC(nextYear, nextMonth - 1, DAILY_BILLING_CYCLE_START_DAY));
  return reset.toLocaleDateString("en-US", UTC_DATE_FMT);
}

/** Minutes already used this cycle per Daily.co dashboard before in-app tracking (env-configured). */
function dailyCycleBaselineMonthMatches(monthKey: string): boolean {
  const baselineMonth = (process.env.DAILY_CO_CYCLE_BASELINE_MONTH || "").trim();
  return baselineMonth === monthKey;
}

export function dailyCycleBaselineMinutes(monthKey: string): number {
  const raw = (process.env.DAILY_CO_CYCLE_BASELINE_MINUTES || "").trim();
  const n = Number.parseInt(raw, 10);
  if (!dailyCycleBaselineMonthMatches(monthKey) || !Number.isFinite(n) || n < 0) return 0;
  return n;
}

/** Sessions already used this cycle per Daily.co dashboard before in-app tracking (env-configured). */
export function dailyCycleBaselineSessions(monthKey: string): number {
  const raw = (process.env.DAILY_CO_CYCLE_BASELINE_SESSIONS || "").trim();
  const n = Number.parseInt(raw, 10);
  if (!dailyCycleBaselineMonthMatches(monthKey) || !Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function effectiveParticipantMinutes(monthKey: string, trackedMinutes: number): number {
  return Math.max(0, Math.round(trackedMinutes)) + dailyCycleBaselineMinutes(monthKey);
}

export function effectiveTotalSessions(monthKey: string, trackedSessions: number): number {
  return Math.max(0, Math.round(trackedSessions)) + dailyCycleBaselineSessions(monthKey);
}

export function estimatedDailyCostUsd(effectiveParticipantMinutesTotal: number): number {
  const billable = Math.max(0, effectiveParticipantMinutesTotal - DAILY_FREE_TIER_MINUTES);
  return billable * DAILY_COST_PER_PARTICIPANT_MINUTE;
}

export function freeTierStatus(effectiveParticipantMinutesTotal: number): {
  freeMinutesRemaining: number;
  isOverFreeTier: boolean;
} {
  const remaining = Math.max(0, DAILY_FREE_TIER_MINUTES - effectiveParticipantMinutesTotal);
  return {
    freeMinutesRemaining: remaining,
    isOverFreeTier: effectiveParticipantMinutesTotal >= DAILY_FREE_TIER_MINUTES,
  };
}

/** Cost for adding `newParticipantMinutes` given tracked-only total so far (baseline included in threshold). */
export function marginalCostForNewParticipantMinutes(
  monthKey: string,
  trackedMinutesSoFar: number,
  newParticipantMinutes: number,
): number {
  const baseline = dailyCycleBaselineMinutes(monthKey);
  const before = trackedMinutesSoFar + baseline;
  const after = before + newParticipantMinutes;
  const billableBefore = Math.max(0, before - DAILY_FREE_TIER_MINUTES);
  const billableAfter = Math.max(0, after - DAILY_FREE_TIER_MINUTES);
  return (billableAfter - billableBefore) * DAILY_COST_PER_PARTICIPANT_MINUTE;
}
