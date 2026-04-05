/**
 * Pick the latest access-end instant from Firestore member/fan docs (commit f0e2a71 parity).
 * Fixes cases where one field is stale (e.g. canceled_at) while billing period end is still future.
 */
import { Timestamp } from "firebase/firestore";

/** Parse Firestore Timestamp, Date, unix seconds/ms, ISO string, or plain { seconds } / { toDate }. */
export function parseDateLike(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Timestamp) {
    try {
      const d = value.toDate();
      return Number.isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    const asNum = Number(value);
    if (!Number.isNaN(asNum)) {
      const ms = asNum < 1e12 ? asNum * 1000 : asNum;
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "object") {
    const o = value as {
      toDate?: () => Date;
      _seconds?: number;
      seconds?: number;
    };
    if (typeof o.toDate === "function") {
      try {
        const d = o.toDate();
        return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
      } catch {
        /* ignore */
      }
    }
    const sec =
      typeof o.seconds === "number" ? o.seconds : typeof o._seconds === "number" ? o._seconds : null;
    if (sec != null && Number.isFinite(sec)) {
      const d = new Date(sec * 1000);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

const ACCESS_END_KEYS = [
  "access_ends_at",
  "accessEndsAt",
  "current_period_end",
  "currentPeriodEnd",
  /** Echo creators fans subdoc + Stripe webhook */
  "subscriptionCurrentPeriodEnd",
  "subscription_current_period_end",
] as const;

/**
 * Latest non-null date among known fields on a doc (or merged view).
 */
export function pickLatestMemberAccessEnd(d: Record<string, unknown>): Date | null {
  let best: Date | null = null;
  for (const key of ACCESS_END_KEYS) {
    const parsed = parseDateLike(d[key]);
    if (!parsed) continue;
    if (!best || parsed.getTime() > best.getTime()) best = parsed;
  }
  return best;
}

/**
 * Remaining access line: `29 days left (until Apr 18, 2026)` when still entitled;
 * cancelled with no end date → `Cancelled — end date not on file`.
 */
export function formatRemainingAccessForFanRow(input: {
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  accessEnd: Date | null;
}): string {
  const st = (input.subscriptionStatus || "").toLowerCase();
  const now = Date.now();
  const endMs =
    input.accessEnd && Number.isFinite(input.accessEnd.getTime())
      ? input.accessEnd.getTime()
      : null;

  const untilPhrase = (): string | null => {
    if (endMs == null || endMs <= now) return null;
    const dateStr = new Date(endMs).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const days = Math.ceil((endMs - now) / (24 * 60 * 60 * 1000));
    const daysPart = days === 1 ? "1 day left" : `${days} days left`;
    return `${daysPart} (until ${dateStr})`;
  };

  if (st === "past_due") return "Past Due";

  if (st === "free") return "Active";

  if (st === "canceled" || st === "cancelled") {
    const u = untilPhrase();
    if (u) return u;
    if (endMs != null && endMs <= now) return "Expired";
    return "Cancelled — end date not on file";
  }

  if (st === "active" || st === "trialing") {
    if (input.cancelAtPeriodEnd) {
      const u = untilPhrase();
      if (u) return u;
      return "Cancelled — end date not on file";
    }
    return "Active";
  }

  return "—";
}
