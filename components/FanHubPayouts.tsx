import React, { useState, useEffect, useCallback } from "react";
import { useAppContext } from "./AppContext";
import { auth } from "../firebaseConfig";

export interface StripeConnectStatus {
  stripeConnectAccountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  isPlatformOwner?: boolean;
}

export const FanHubPayouts: React.FC = () => {
  const { showToast } = useAppContext();
  const [status, setStatus] = useState<StripeConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch("/api/stripeConnectStatus", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      setStatus({
        stripeConnectAccountId: data.stripeConnectAccountId ?? null,
        chargesEnabled: !!data.chargesEnabled,
        payoutsEnabled: !!data.payoutsEnabled,
        detailsSubmitted: !!data.detailsSubmitted,
        isPlatformOwner: !!data.isPlatformOwner,
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

  /** After Stripe Connect return/refresh URLs, re-fetch and clean query so status updates to green. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    if (p.get("connect") !== "return" && p.get("connect") !== "refresh") return;
    void fetchStatus();
    p.delete("connect");
    const qs = p.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [fetchStatus]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch("/api/stripeConnectOnboard", {
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
        showToast?.(
          typeof data.message === "string" && data.message.trim()
            ? data.message
            : "Stripe Connect is not enabled for this Stripe account yet. In the Dashboard open Products → Connect (or Settings → Connect) and complete setup, then try again.",
          "error",
        );
        return;
      }

      const detail =
        typeof data.message === "string" && data.message.trim()
          ? data.message
          : typeof data.error === "string" && data.error.trim()
            ? data.error
            : "Failed to start Connect onboarding";
      showToast?.(detail, "error");
    } catch {
      showToast?.("Failed to start Connect", "error");
    } finally {
      setConnecting(false);
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

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Payouts</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        {isPlatformOwner
          ? "As a platform owner, payments go directly to the main EchoFlux account."
          : "Connect Stripe so subscriptions, tips, and store purchases can reach your bank. Without this, checkout may fail or be blocked for your page."}
      </p>

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
            <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
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
            {!paymentsReady && (
              <button
                type="button"
                onClick={() => void handleConnect()}
                disabled={connecting}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                {connecting ? "Opening…" : "Open Stripe to complete setup"}
              </button>
            )}
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
