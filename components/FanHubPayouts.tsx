import React, { useState, useEffect, useCallback, useMemo } from "react";
import { doc, updateDoc, deleteField } from "firebase/firestore";
import { useAppContext } from "./AppContext";
import { auth, db } from "../firebaseConfig";
import { resolveApiUrl } from "../src/lib/resolveApiUrl";

/** Stripe Docs — linked from Payouts so creators know what fans may see. */
const STRIPE_DOCS_STATEMENT_DESCRIPTORS =
  "https://docs.stripe.com/get-started/account/statement-descriptors";

export interface StripeConnectStatus {
  stripeConnectAccountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  isPlatformOwner?: boolean;
  /** True when Stripe returns missing/inaccessible account for the saved ID (e.g. deleted in Stripe). */
  reconnectRequired?: boolean;
}

interface StripeBalanceEntry {
  currency: string;
  amountCents: number;
}

interface StripeConnectBalance {
  available: StripeBalanceEntry[];
  pending: StripeBalanceEntry[];
}

interface StripePayoutRecord {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  arrivalDate: number | null;
  createdAt: number;
  method: string | null;
}

interface StripeMonthlyPayoutSummary {
  month: string;
  label: string;
  totalCents: number;
  currency: string;
  count: number;
  payouts: StripePayoutRecord[];
}

interface StripePayoutHistory {
  recent: StripePayoutRecord[];
  monthly: StripeMonthlyPayoutSummary[];
  canManualPayout: boolean;
}

function formatCents(cents: number, currency = "usd"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return "$" + (cents / 100).toFixed(2);
  }
}

function sumBalanceCents(entries: StripeBalanceEntry[], currency = "usd"): number {
  return entries
    .filter((entry) => entry.currency.toLowerCase() === currency.toLowerCase())
    .reduce((sum, entry) => sum + entry.amountCents, 0);
}

function formatPayoutStatus(status: string): string {
  switch (status) {
    case "paid":
      return "Paid";
    case "pending":
      return "Pending";
    case "in_transit":
      return "In transit";
    case "canceled":
      return "Canceled";
    case "failed":
      return "Failed";
    default:
      return status.replace(/_/g, " ");
  }
}

function formatPayoutDate(unixSeconds: number | null): string {
  if (!unixSeconds) return "—";
  try {
    return new Date(unixSeconds * 1000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

/** Matches api/stripeConnectPayouts.ts — history from here through current month, newest first. */
const PAYOUT_HISTORY_START_MONTH = "2026-03";

const PayoutMonthChevron = ({ open }: { open?: boolean }) => (
  <svg
    className={`w-4 h-4 shrink-0 text-gray-500 dark:text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden
  >
    <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function MonthPayoutDetails({ month }: { month: StripeMonthlyPayoutSummary }) {
  const [expanded, setExpanded] = useState(month.count > 0);
  const summaryRight =
    month.count > 0
      ? `${formatCents(month.totalCents, month.currency)} · ${month.count} payout${month.count === 1 ? "" : "s"}`
      : "No payouts";

  return (
    <details
      open={expanded}
      onToggle={(e) => setExpanded((e.currentTarget as HTMLDetailsElement).open)}
      className="rounded-lg border border-gray-100 dark:border-gray-700 overflow-hidden"
    >
      <summary
        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900/40 text-sm cursor-pointer list-none [&::-webkit-details-marker]:hidden"
        aria-label={`${expanded ? "Collapse" : "Expand"} ${month.label} payouts`}
      >
        <span className="flex items-center gap-2 min-w-0">
          <PayoutMonthChevron open={expanded} />
          <span className="font-medium text-gray-900 dark:text-white">{month.label}</span>
        </span>
        <span className="tabular-nums text-gray-700 dark:text-gray-300">{summaryRight}</span>
      </summary>
      {month.payouts.length > 0 ? (
        <ul className="m-0 p-0 list-none divide-y divide-gray-100 dark:divide-gray-700">
          {month.payouts.map((payout) => (
            <li
              key={payout.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
            >
              <span className="tabular-nums text-gray-800 dark:text-gray-200">
                {formatCents(payout.amountCents, payout.currency)}
              </span>
              <span className="text-gray-500 dark:text-gray-400">
                {formatPayoutDate(payout.arrivalDate ?? payout.createdAt)} · {formatPayoutStatus(payout.status)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}

function StripeBalanceCard({
  balance,
  loading,
  error,
  isPlatformOwner,
  onRefresh,
  onRequestPayout,
  payoutRequesting,
  availableUsdCents,
}: {
  balance: StripeConnectBalance | null;
  loading: boolean;
  error: string | null;
  isPlatformOwner: boolean;
  onRefresh: () => void;
  onRequestPayout?: () => void;
  payoutRequesting?: boolean;
  availableUsdCents: number;
}) {
  const availableUsd = sumBalanceCents(balance?.available ?? [], "usd");
  const pendingUsd = sumBalanceCents(balance?.pending ?? [], "usd");
  const otherCurrencies = new Set<string>();
  for (const entry of [...(balance?.available ?? []), ...(balance?.pending ?? [])]) {
    if (entry.currency.toLowerCase() !== "usd") otherCurrencies.add(entry.currency.toLowerCase());
  }

  return (
    <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white m-0 mb-1">
            Stripe balance
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 m-0">
            {isPlatformOwner
              ? "Main EchoFlux Stripe account. Request a payout when you want funds sent to your bank."
              : "Your connected Express account. Stripe sends payouts to your bank on its usual schedule."}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="text-sm font-medium text-indigo-600 dark:text-indigo-400 underline underline-offset-2 hover:no-underline disabled:opacity-50"
        >
          Refresh balance
        </button>
      </div>

      {loading && !balance ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 m-0">Loading balance…</p>
      ) : error ? (
        <p className="text-sm text-amber-700 dark:text-amber-300 m-0">{error}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 m-0 mb-1">
                Available
              </p>
              <p className="text-2xl font-semibold tabular-nums text-gray-900 dark:text-white m-0">
                {formatCents(availableUsd)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 m-0 mt-1">
                {isPlatformOwner
                  ? "Available to pay out to your bank"
                  : "Ready for Stripe&apos;s next automatic payout"}
              </p>
            </div>
            <div className="rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 m-0 mb-1">
                Pending
              </p>
              <p className="text-2xl font-semibold tabular-nums text-gray-900 dark:text-white m-0">
                {formatCents(pendingUsd)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 m-0 mt-1">
                Still clearing before it becomes available
              </p>
            </div>
          </div>
          {otherCurrencies.size > 0 && (
            <ul className="mt-3 mb-0 p-0 list-none text-xs text-gray-600 dark:text-gray-300 space-y-1">
              {[...otherCurrencies].map((currency) => (
                <li key={currency}>
                  {currency.toUpperCase()}: {formatCents(sumBalanceCents(balance?.available ?? [], currency), currency)}{" "}
                  available, {formatCents(sumBalanceCents(balance?.pending ?? [], currency), currency)} pending
                </li>
              ))}
            </ul>
          )}
          {isPlatformOwner && onRequestPayout && (
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <button
                type="button"
                onClick={onRequestPayout}
                disabled={payoutRequesting || availableUsdCents < 100}
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 disabled:opacity-50"
              >
                {payoutRequesting ? "Sending payout…" : "Pay out available balance"}
              </button>
              {availableUsdCents > 0 && availableUsdCents < 100 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 mb-0">
                  Minimum payout is $1.00.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StripePayoutHistoryCard({
  history,
  loading,
  error,
  isPlatformOwner,
  onRefresh,
}: {
  history: StripePayoutHistory | null;
  loading: boolean;
  error: string | null;
  isPlatformOwner: boolean;
  onRefresh: () => void;
}) {
  const monthly = useMemo(
    () =>
      [...(history?.monthly ?? [])]
        .filter((m) => m.month >= PAYOUT_HISTORY_START_MONTH)
        .sort((a, b) => b.month.localeCompare(a.month)),
    [history?.monthly]
  );
  return (
    <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white m-0 mb-1">
            Payout history
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 m-0">
            {isPlatformOwner
              ? "Expand a month to see transfers from your main Stripe account to your bank."
              : "Expand a month to see automatic payouts from your connected Stripe account."}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="text-sm font-medium text-indigo-600 dark:text-indigo-400 underline underline-offset-2 hover:no-underline disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {loading && !history ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 m-0">Loading payout history…</p>
      ) : error ? (
        <p className="text-sm text-amber-700 dark:text-amber-300 m-0">{error}</p>
      ) : monthly.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 m-0">No payouts since March 2026 yet.</p>
      ) : (
        <div className="space-y-2">
          {monthly.map((month) => (
            <MonthPayoutDetails key={month.month} month={month} />
          ))}
        </div>
      )}
    </div>
  );
}

export const FanHubPayouts: React.FC = () => {
  const { showToast } = useAppContext();
  const [status, setStatus] = useState<StripeConnectStatus | null>(null);
  const [balance, setBalance] = useState<StripeConnectBalance | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [payoutHistory, setPayoutHistory] = useState<StripePayoutHistory | null>(null);
  const [payoutHistoryLoading, setPayoutHistoryLoading] = useState(false);
  const [payoutHistoryError, setPayoutHistoryError] = useState<string | null>(null);
  const [payoutRequesting, setPayoutRequesting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [openingDashboard, setOpeningDashboard] = useState(false);
  const [resetting, setResetting] = useState(false);

  const fetchBalance = useCallback(async () => {
    setBalanceLoading(true);
    setBalanceError(null);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch(resolveApiUrl("/api/stripeConnectBalance"), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBalance(null);
        setBalanceError(
          typeof data.message === "string" && data.message.trim()
            ? data.message
            : "Could not load Stripe balance.",
        );
        return;
      }
      setBalance({
        available: Array.isArray(data.available) ? data.available : [],
        pending: Array.isArray(data.pending) ? data.pending : [],
      });
    } catch {
      setBalance(null);
      setBalanceError("Could not load Stripe balance.");
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  const fetchPayoutHistory = useCallback(async () => {
    setPayoutHistoryLoading(true);
    setPayoutHistoryError(null);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch(resolveApiUrl("/api/stripeConnectPayouts"), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPayoutHistory(null);
        setPayoutHistoryError(
          typeof data.message === "string" && data.message.trim()
            ? data.message
            : "Could not load payout history.",
        );
        return;
      }
      setPayoutHistory({
        recent: Array.isArray(data.recent) ? data.recent : [],
        monthly: Array.isArray(data.monthly) ? data.monthly : [],
        canManualPayout: !!data.canManualPayout,
      });
    } catch {
      setPayoutHistory(null);
      setPayoutHistoryError("Could not load payout history.");
    } finally {
      setPayoutHistoryLoading(false);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch(resolveApiUrl("/api/stripeConnectStatus"), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      setStatus({
        stripeConnectAccountId: data.stripeConnectAccountId ?? null,
        chargesEnabled: !!data.chargesEnabled,
        payoutsEnabled: !!data.payoutsEnabled,
        detailsSubmitted: !!data.detailsSubmitted,
        isPlatformOwner: !!data.isPlatformOwner,
        reconnectRequired: !!data.reconnectRequired,
      });
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!status) return;
    const isPlatformOwner = status.isPlatformOwner === true;
    const hasAccount = !!status.stripeConnectAccountId;
    if (isPlatformOwner || (hasAccount && !status.reconnectRequired)) {
      void fetchBalance();
      void fetchPayoutHistory();
    }
  }, [status, fetchBalance, fetchPayoutHistory]);

  /** After Stripe Connect return/refresh URLs, re-fetch and clean query so status updates to green. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    if (p.get("connect") !== "return" && p.get("connect") !== "refresh") return;
    void fetchStatus();
    void fetchBalance();
    void fetchPayoutHistory();
    p.delete("connect");
    const qs = p.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [fetchStatus, fetchBalance, fetchPayoutHistory]);

  const handleRequestPayout = async () => {
    const availableUsd = sumBalanceCents(balance?.available ?? [], "usd");
    if (availableUsd < 100) {
      showToast?.("Available balance is below the $1.00 minimum payout.", "error");
      return;
    }
    if (
      !window.confirm(
        `Pay out ${formatCents(availableUsd)} to your bank? This uses your full available Stripe balance.`,
      )
    ) {
      return;
    }
    setPayoutRequesting(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch(resolveApiUrl("/api/stripeConnectPayouts"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast?.(
          typeof data.message === "string" && data.message.trim()
            ? data.message
            : "Could not create payout.",
          "error",
        );
        return;
      }
      showToast?.("Payout initiated. It may take a few business days to reach your bank.", "success");
      await fetchBalance();
      await fetchPayoutHistory();
    } catch {
      showToast?.("Could not create payout.", "error");
    } finally {
      setPayoutRequesting(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch(resolveApiUrl("/api/stripeConnectOnboard"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (data.url) {
        window.location.href = data.url;
        return;
      }

      if (data.setupRequired) {
        const friendly =
          typeof data.message === "string" && data.message.trim()
            ? data.message
            : "Stripe Connect is not enabled for this Stripe account yet. In the Dashboard open Products → Connect (or Settings → Connect) and complete setup, then try again.";
        showToast?.(friendly, "error");
        if (typeof data.stripeRawMessage === "string" && data.stripeRawMessage.trim()) {
          console.error("[stripeConnectOnboard] Stripe said:", data.stripeRawMessage, "code:", data.stripeCode);
        }
        return;
      }

      const detail =
        typeof data.message === "string" && data.message.trim()
          ? data.message
          : typeof data.error === "string" && data.error.trim()
            ? data.error
            : "Failed to start Connect onboarding";
      showToast?.(detail, "error");
      if (typeof data.stripeRawMessage === "string" && data.stripeRawMessage.trim()) {
        console.error("[stripeConnectOnboard] Stripe said:", data.stripeRawMessage, "code:", data.stripeCode);
      }
    } catch {
      showToast?.("Failed to start Connect", "error");
    } finally {
      setConnecting(false);
    }
  };

  const handleResetSavedAccount = async () => {
    if (
      !window.confirm(
        "Remove the saved Stripe Connect account from EchoFlux? Use this if the account was deleted in Stripe or you want a fresh connection. Fan checkout will not work until you connect again.",
      )
    ) {
      return;
    }
    setResetting(true);
    try {
      const user = auth.currentUser;
      if (!user?.uid) {
        showToast?.("Sign in to reset Connect.", "error");
        return;
      }
      const uid = user.uid;
      const token = await user.getIdToken();
      const res = await fetch(resolveApiUrl("/api/stripeConnectReset"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        showToast?.("Saved Stripe account cleared. You can connect again.", "success");
        await fetchStatus();
        return;
      }

      // Local Vite often proxies /api to an older deploy without this route — Firestore rules allow the owner to clear these fields.
      if (res.status === 404) {
        try {
          await updateDoc(doc(db, "creators", uid), {
            stripeConnectAccountId: deleteField(),
            stripeAccountId: deleteField(),
            connectedStripeAccountId: deleteField(),
            "stripe.connectAccountId": deleteField(),
            updatedAt: new Date().toISOString(),
          });
          showToast?.("Saved Stripe account cleared. You can connect again.", "success");
          await fetchStatus();
          return;
        } catch (e) {
          console.error("stripeConnectReset Firestore fallback:", e);
          showToast?.(
            "Could not reach the reset API (404). Deploy the latest app or run npm run dev:vercel, or try again after a moment.",
            "error",
          );
          return;
        }
      }

      showToast?.(
        typeof data.message === "string" ? data.message : data.error || "Could not reset Connect",
        "error",
      );
    } catch {
      showToast?.("Could not reset Connect", "error");
    } finally {
      setResetting(false);
    }
  };

  const handleOpenStripeDashboard = async () => {
    setOpeningDashboard(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch(resolveApiUrl("/api/stripeConnectDashboard"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      showToast?.(
        typeof data.message === "string" && data.message.trim()
          ? data.message
          : typeof data.error === "string" && data.error.trim()
            ? data.error
            : "Could not open Stripe account settings",
        "error",
      );
    } catch {
      showToast?.("Could not open Stripe account settings", "error");
    } finally {
      setOpeningDashboard(false);
    }
  };

  if (loading) {
    return (
      <div className="py-8 text-center text-gray-500 dark:text-gray-400">
        Loading payout settings…
      </div>
    );
  }

  const isPlatformOwner = status?.isPlatformOwner === true;
  const hasAccount = !!status?.stripeConnectAccountId;
  const canCharge = status?.chargesEnabled === true;
  const canPayout = status?.payoutsEnabled === true;
  const paymentsReady = !isPlatformOwner && canCharge && canPayout;
  const needsOnboarding = hasAccount && !status?.detailsSubmitted;
  const partialReview =
    hasAccount && status?.detailsSubmitted && (!canCharge || !canPayout);

  const needsStart = !hasAccount;
  const connectLabel = connecting
    ? "Opening Stripe…"
    : needsStart
      ? "Connect Stripe"
      : "Continue Stripe setup";
  const showBalance = isPlatformOwner || (hasAccount && !status?.reconnectRequired);
  const availableUsdCents = sumBalanceCents(balance?.available ?? [], "usd");

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Payouts</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        {isPlatformOwner
          ? "As a platform owner, payments go directly to the main EchoFlux account."
          : "Connect Stripe so subscriptions, tips, and store purchases can reach your bank. Without this, checkout may fail or be blocked for your page."}
      </p>

      {showBalance && (
        <StripeBalanceCard
          balance={balance}
          loading={balanceLoading}
          error={balanceError}
          isPlatformOwner={isPlatformOwner}
          onRefresh={() => void fetchBalance()}
          onRequestPayout={isPlatformOwner ? () => void handleRequestPayout() : undefined}
          payoutRequesting={payoutRequesting}
          availableUsdCents={availableUsdCents}
        />
      )}

      {showBalance && (
        <StripePayoutHistoryCard
          history={payoutHistory}
          loading={payoutHistoryLoading}
          error={payoutHistoryError}
          isPlatformOwner={isPlatformOwner}
          onRefresh={() => void fetchPayoutHistory()}
        />
      )}

      {/* —— Creators: green when fully active —— */}
      {!isPlatformOwner && paymentsReady && (
        <div
          className="mb-6 rounded-xl border-2 border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-950/35 px-4 py-5 shadow-sm"
          role="status"
          aria-label="Stripe Connect complete"
        >
          <div className="flex items-start gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500 text-white"
              aria-hidden
            >
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-green-950 dark:text-green-100 m-0 mb-1">
                You&apos;re ready to get paid
              </h3>
              <p className="text-sm text-green-900/90 dark:text-green-200/90 m-0 mb-3">
                Stripe shows <strong>charges</strong> and <strong>payouts</strong> active. Fans can subscribe, tip, and buy from your store.
              </p>
              <p className="text-xs text-green-900/85 dark:text-green-200/80 m-0 mb-3 leading-relaxed">
                Tip: what fans see on statements is usually your Stripe <strong>statement descriptor</strong> or public
                charge name. In the Stripe Dashboard, keep it aligned with your EchoFlux <strong>@handle</strong> or
                brand so payments are easy to recognize.{" "}
                <a
                  href={STRIPE_DOCS_STATEMENT_DESCRIPTORS}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-green-800 dark:text-green-200 underline underline-offset-2 hover:text-green-950 dark:hover:text-green-50"
                >
                  Learn more (Stripe)
                </a>
              </p>
              <ul className="text-sm text-green-900 dark:text-green-100 space-y-1.5 m-0 mb-4 list-none p-0">
                <li className="flex items-center gap-2 font-medium">
                  <span className="text-green-600 dark:text-green-400">✓</span>
                  Charges enabled — you can accept payments
                </li>
                <li className="flex items-center gap-2 font-medium">
                  <span className="text-green-600 dark:text-green-400">✓</span>
                  Payouts enabled — money can reach your bank
                </li>
              </ul>
              <button
                type="button"
                onClick={() => void fetchStatus()}
                className="text-sm font-medium text-green-800 dark:text-green-200 underline underline-offset-2 hover:no-underline"
              >
                Refresh status
              </button>
            </div>
          </div>
        </div>
      )}

      {/* —— Creators: amber until charges + payouts both on —— */}
      {!isPlatformOwner && !paymentsReady && (
        <div
          className="mb-6 rounded-xl border-2 border-amber-300 dark:border-amber-600/80 bg-amber-50 dark:bg-amber-950/40 px-4 py-5 shadow-sm"
          role="region"
          aria-label="Stripe Connect onboarding"
        >
          <h3 className="text-base font-semibold text-amber-950 dark:text-amber-100 m-0 mb-2">
            Get paid by fans
          </h3>
          <p className="text-sm text-amber-900/90 dark:text-amber-200/90 m-0 mb-3">
            Connect <strong>Stripe</strong> so subscriptions, tips, and store purchases reach your account. This page will turn{" "}
            <strong className="text-green-700 dark:text-green-400">green</strong> when both charges and payouts are active.
          </p>
          <ol className="text-sm text-amber-950/85 dark:text-amber-100/85 list-decimal list-inside space-y-1 mb-4 m-0">
            <li>
              Click <strong>{needsStart ? "Connect Stripe" : "Continue Stripe setup"}</strong> and complete Stripe&apos;s steps (identity + bank).
            </li>
            <li>Return to this <strong>Payouts</strong> tab after Stripe redirects you back.</li>
            <li>Use <strong>Refresh status</strong> if you just finished and don&apos;t see green yet.</li>
          </ol>
          <p className="text-xs text-amber-800 dark:text-amber-300/90 m-0 mb-4">
            A 10% platform fee is deducted from each fan transaction. Stripe also charges processing fees.
          </p>
          <p className="text-xs text-amber-800/80 dark:text-amber-300/80 m-0 mb-4">
            If Stripe shows a sign-in to Express instead of setup steps, open the link in a private/incognito window, or sign in with the same email as your EchoFlux account.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleConnect()}
              disabled={connecting}
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500 disabled:opacity-60 fh-btn"
            >
              {connectLabel}
            </button>
            <button
              type="button"
              onClick={() => void fetchStatus()}
              disabled={loading}
              className="text-sm font-medium text-amber-900 dark:text-amber-200 underline underline-offset-2 disabled:opacity-50"
            >
              Refresh status
            </button>
          </div>
          {needsOnboarding && (
            <p className="text-xs mt-3 mb-0 text-amber-800 dark:text-amber-300/80">
              Stripe still needs more information — use Continue Stripe setup to finish.
            </p>
          )}
          {partialReview && !needsOnboarding && (
            <p className="text-xs mt-3 mb-0 text-amber-800 dark:text-amber-300/80">
              Stripe may be reviewing your account. Check back soon or refresh status.
            </p>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        {isPlatformOwner && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="font-medium">Platform Owner Account</span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              All payments from fans go directly to the EchoFlux Stripe account. No additional setup required.
            </p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <span>✓</span>
                <span>Payments enabled — you can accept payments</span>
              </li>
              <li className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <span>✓</span>
                <span>Payouts enabled — funds go to main account</span>
              </li>
              <li className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <span>✓</span>
                <span>No platform fee — 100% of revenue retained</span>
              </li>
            </ul>
          </div>
        )}

        {!isPlatformOwner && hasAccount && (
          <>
            {status?.reconnectRequired && (
              <p className="text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg p-3 m-0">
                Stripe no longer recognizes this saved account (it may have been deleted). Remove it below, then use{" "}
                <strong>Connect Stripe</strong> to link a new account.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 text-gray-700 dark:text-gray-300">
              <span className="font-medium">Stripe account</span>
              <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                {status!.stripeConnectAccountId!.slice(0, 14)}…
              </span>
            </div>
            <ul className="space-y-2 text-sm border-t border-gray-100 dark:border-gray-700 pt-4">
              <li className="flex items-center gap-2">
                <span
                  className={
                    canCharge ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"
                  }
                >
                  {canCharge ? "✓" : "○"}
                </span>
                <span>
                  {canCharge
                    ? "Charges enabled — you can accept payments"
                    : "Charges not yet enabled — complete onboarding in Stripe"}
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span
                  className={
                    canPayout ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"
                  }
                >
                  {canPayout ? "✓" : "○"}
                </span>
                <span>
                  {canPayout
                    ? "Payouts enabled — you can receive payouts"
                    : "Payouts not yet enabled — complete verification in Stripe"}
                </span>
              </li>
            </ul>
            {!status?.reconnectRequired && (
              <div className="rounded-lg border border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/70 dark:bg-indigo-950/25 p-3">
                <p className="text-sm font-semibold text-indigo-950 dark:text-indigo-100 m-0 mb-1">
                  Manage your Stripe account
                </p>
                <p className="text-xs text-indigo-900/85 dark:text-indigo-200/80 m-0 leading-relaxed">
                  Open Stripe to update payout details, business name, tax info, and statement details fans may see on
                  checkout or card statements.
                </p>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {!status?.reconnectRequired && (
                <button
                  type="button"
                  onClick={() => void handleOpenStripeDashboard()}
                  disabled={openingDashboard || connecting || resetting}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 disabled:opacity-50 text-sm font-semibold"
                >
                  {openingDashboard ? "Opening Stripe…" : "Manage Stripe account"}
                </button>
              )}
              {!paymentsReady && (
                <button
                  type="button"
                  onClick={() => void handleConnect()}
                  disabled={connecting || openingDashboard}
                  className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  {connecting ? "Opening…" : "Open Stripe to complete setup"}
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleResetSavedAccount()}
                disabled={resetting || connecting || openingDashboard}
                className="px-4 py-2 rounded-lg border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 text-sm"
              >
                {resetting ? "Removing…" : "Remove saved account & start over"}
              </button>
            </div>
          </>
        )}

        {!isPlatformOwner && !hasAccount && (
          <p className="text-sm text-gray-500 dark:text-gray-400 m-0">
            After you connect, your Stripe account ID will appear here with live status from Stripe.
          </p>
        )}
      </div>
    </div>
  );
};
