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
  /** Some flows mirror creator-style naming on fan docs */
  "subscriptionEndDate",
] as const;

const PAST_DUE_ACCESS_END_KEYS = [
  "pastDueAccessEndsAt",
  "past_due_access_ends_at",
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

export function pickPastDueAccessEnd(d: Record<string, unknown>): Date | null {
  for (const key of PAST_DUE_ACCESS_END_KEYS) {
    const parsed = parseDateLike(d[key]);
    if (parsed) return parsed;
  }
  return null;
}

function formatShortAccessDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Remaining access line: `29 days left (until Apr 18, 2026)` when still entitled;
 * cancelled/expired with known period end shows that date; otherwise falls back to `canceledAt` from webhooks.
 */
export function formatRemainingAccessForFanRow(input: {
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  accessEnd: Date | null;
  /** Fan doc `canceledAt` when subscription ended but `subscriptionCurrentPeriodEnd` was never stored */
  canceledAt?: Date | null;
  pastDueAccessEndsAt?: Date | null;
  /**
   * Fan doc missing `subscriptionStatus` but orders / Stripe show a current paying member
   * (User Management plan badge uses the same inference).
   */
  treatAsActiveMember?: boolean;
}): string {
  const st = (input.subscriptionStatus || "").toLowerCase();
  const inferActive =
    input.treatAsActiveMember === true &&
    st !== "canceled" &&
    st !== "cancelled" &&
    st !== "past_due" &&
    st !== "expired" &&
    st !== "unpaid" &&
    st !== "incomplete_expired";
  const now = Date.now();
  const endMs =
    input.accessEnd && Number.isFinite(input.accessEnd.getTime())
      ? input.accessEnd.getTime()
      : null;
  const canceledAtMs =
    input.canceledAt && Number.isFinite(input.canceledAt.getTime())
      ? input.canceledAt.getTime()
      : null;

  const untilPhrase = (): string | null => {
    if (endMs == null || endMs <= now) return null;
    const dateStr = formatShortAccessDate(endMs);
    const days = Math.ceil((endMs - now) / (24 * 60 * 60 * 1000));
    const daysPart = days === 1 ? "1 day left" : `${days} days left`;
    return `${daysPart} (until ${dateStr})`;
  };

  if (st === "past_due") {
    const pastDueEndMs =
      input.pastDueAccessEndsAt && Number.isFinite(input.pastDueAccessEndsAt.getTime())
        ? input.pastDueAccessEndsAt.getTime()
        : null;
    if (pastDueEndMs != null && pastDueEndMs > now) {
      return `Past Due — access until ${formatShortAccessDate(pastDueEndMs)}`;
    }
    return "Past Due — access restricted";
  }

  if (st === "free") return "Active";

  if (st === "canceled" || st === "cancelled") {
    const u = untilPhrase();
    if (u) return u;
    if (endMs != null && endMs <= now) {
      return `Expired on ${formatShortAccessDate(endMs)}`;
    }
    if (canceledAtMs != null) {
      return `Cancelled (recorded ${formatShortAccessDate(canceledAtMs)})`;
    }
    return "Cancelled — billing period end not recorded";
  }

  if (st === "active" || st === "trialing" || inferActive) {
    /** Period ended but Stripe/Firestore still say active until webhooks reconcile. */
    if (endMs != null && endMs <= now) {
      return `Expired on ${formatShortAccessDate(endMs)}`;
    }
    if (input.cancelAtPeriodEnd) {
      const u = untilPhrase();
      if (u) return u;
      if (canceledAtMs != null) {
        return `Cancelling — period end not synced (updated ${formatShortAccessDate(canceledAtMs)})`;
      }
      return "Cancelling — period end not synced";
    }
    return "Active";
  }

  return "—";
}

/**
 * Rank mirrored subscription status when merging duplicate `creators/.../fans/*` docs:
 * prefer rows that still reflect Stripe “still entitled” states over stale `canceled` copies.
 */
export function subscriptionStatusRankForFanMirror(st: string | null | undefined): number {
  const t = String(st || "").toLowerCase();
  if (t === "active" || t === "trialing") return 3;
  if (t === "past_due") return 2;
  return 1;
}

function subscriptionStatusFromFanMirrorRow(fd: Record<string, unknown>): string | null {
  const s = fd.subscriptionStatus ?? fd.subscription_status;
  return typeof s === "string" && s.trim() ? s.trim() : null;
}

function cancelAtPeriodEndFromFanMirrorRow(d: Record<string, unknown>): boolean {
  const raw = d.cancelAtPeriodEnd ?? d.cancel_at_period_end;
  if (raw === true) return true;
  if (raw === false || raw == null) return false;
  if (typeof raw === "string") {
    const t = raw.trim().toLowerCase();
    return t === "true" || t === "1" || t === "yes";
  }
  if (typeof raw === "number") return raw === 1;
  return false;
}

/**
 * Merge duplicate Fan Hub mirror docs (same person, different doc ids). Access continues until the
 * latest known billing period end; status prefers active/trialing over canceled so scheduled cancels
 * are not treated as ended early when one row is stale.
 */
export function mergeFanHubFanMirrorRowsForAccess(rows: Record<string, unknown>[]): {
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  accessEnd: Date | null;
  canceledAt: Date | null;
  pastDueAccessEndsAt: Date | null;
} {
  if (rows.length === 0) {
    return {
      subscriptionStatus: null,
      cancelAtPeriodEnd: false,
      accessEnd: null,
      canceledAt: null,
      pastDueAccessEndsAt: null,
    };
  }

  let mergedStatus: string | null = null;
  let mergedCancelAtPeriodEnd = false;
  let mergedCanceledAt: Date | null = null;
  let mergedPastDueAccessEndsAt: Date | null = null;

  for (const fd of rows) {
    const st = subscriptionStatusFromFanMirrorRow(fd);
    if (subscriptionStatusRankForFanMirror(st) > subscriptionStatusRankForFanMirror(mergedStatus)) {
      mergedStatus = st;
    }
    if (cancelAtPeriodEndFromFanMirrorRow(fd)) mergedCancelAtPeriodEnd = true;
    const ca = parseDateLike(fd.canceledAt);
    if (ca && (!mergedCanceledAt || ca.getTime() > mergedCanceledAt.getTime())) mergedCanceledAt = ca;
    const pd = pickPastDueAccessEnd(fd);
    if (pd && (!mergedPastDueAccessEndsAt || pd.getTime() < mergedPastDueAccessEndsAt.getTime())) {
      mergedPastDueAccessEndsAt = pd;
    }
  }

  const mergedRank = subscriptionStatusRankForFanMirror(mergedStatus);

  let mergedAccessEnd: Date | null = null;
  for (const fd of rows) {
    if (subscriptionStatusRankForFanMirror(subscriptionStatusFromFanMirrorRow(fd)) !== mergedRank) continue;
    const end = pickLatestMemberAccessEnd(fd);
    if (end && (!mergedAccessEnd || end.getTime() > mergedAccessEnd.getTime())) mergedAccessEnd = end;
  }

  /** Scheduled cancel: period end may live only on `creatorSubscribers` mirror, not on stale `fans` rows. */
  if (mergedAccessEnd == null && mergedCancelAtPeriodEnd && mergedRank >= 3) {
    for (const fd of rows) {
      const end = pickLatestMemberAccessEnd(fd);
      if (end && (!mergedAccessEnd || end.getTime() > mergedAccessEnd.getTime())) mergedAccessEnd = end;
    }
  }

  /** When the winning rows never mirrored period end, fall back only for terminal statuses (not active/trialing). */
  if (mergedAccessEnd == null) {
    const stLow = String(mergedStatus || "").toLowerCase();
    const terminal =
      stLow === "canceled" ||
      stLow === "cancelled" ||
      stLow === "expired" ||
      stLow === "unpaid" ||
      stLow === "incomplete_expired";
    if (terminal) {
      for (const fd of rows) {
        const end = pickLatestMemberAccessEnd(fd);
        if (end && (!mergedAccessEnd || end.getTime() > mergedAccessEnd.getTime())) mergedAccessEnd = end;
      }
    }
  }

  return {
    subscriptionStatus: mergedStatus,
    cancelAtPeriodEnd: mergedCancelAtPeriodEnd,
    accessEnd: mergedAccessEnd,
    canceledAt: mergedCanceledAt,
    pastDueAccessEndsAt: mergedPastDueAccessEndsAt,
  };
}

/**
 * True when Stripe-mirrored fan doc shows paid access has ended (aligns with User Management “Expired on …”).
 * Used for UI such as greyed fan cards; does not delete or hide the fan record.
 *
 * `canceled` / `cancelled`: expiry follows **billing period end** only. If period end is missing on the
 * doc, we do **not** infer access ended from `canceledAt` (that timestamp is often cancel-at-period-end
 * bookkeeping, not when paid access stops).
 */
export function isHubMembershipAccessExpired(input: {
  subscriptionStatus: string | null | undefined;
  cancelAtPeriodEnd: boolean;
  accessEnd: Date | null;
  /** Fan doc `canceledAt` from webhooks when period end is missing or stale */
  canceledAt?: Date | null;
  pastDueAccessEndsAt?: Date | null;
}): boolean {
  const st = String(input.subscriptionStatus || "").toLowerCase();
  const now = Date.now();
  const endMs =
    input.accessEnd && Number.isFinite(input.accessEnd.getTime())
      ? input.accessEnd.getTime()
      : null;

  if (st === "expired" || st === "unpaid" || st === "incomplete_expired") return true;

  if (st === "past_due") {
    const pastDueEndMs =
      input.pastDueAccessEndsAt && Number.isFinite(input.pastDueAccessEndsAt.getTime())
        ? input.pastDueAccessEndsAt.getTime()
        : null;
    return pastDueEndMs != null ? pastDueEndMs <= now : true;
  }

  if (st === "canceled" || st === "cancelled") {
    if (endMs != null) return endMs <= now;
    return false;
  }
  if (st === "active" || st === "trialing") {
    /** Period end in the past ends paid access even if cancel_at_period_end never synced. */
    if (endMs != null && endMs <= now) return true;
    return false;
  }
  /** No explicit status but a mirrored period end exists and has passed (partial webhook / CRM data). */
  if (!st && endMs != null && endMs <= now) return true;
  return false;
}

/** True while paid/free Fan Hub membership still includes hub + fan→creator messaging. */
export function hasActiveFanHubMembershipAccess(input: {
  subscriptionStatus: string | null | undefined;
  cancelAtPeriodEnd?: boolean;
  accessEnd?: Date | null;
  canceledAt?: Date | null;
  pastDueAccessEndsAt?: Date | null;
}): boolean {
  const st = String(input.subscriptionStatus || "").toLowerCase();
  if (st === "free") return true;
  return !isHubMembershipAccessExpired({
    subscriptionStatus: input.subscriptionStatus,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd === true,
    accessEnd: input.accessEnd ?? null,
    canceledAt: input.canceledAt ?? null,
    pastDueAccessEndsAt: input.pastDueAccessEndsAt ?? null,
  });
}
