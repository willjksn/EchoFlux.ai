import React, { useState, useEffect, useCallback } from "react";
import { doc, updateDoc, deleteField } from "firebase/firestore";
import { useAppContext } from "./AppContext";
import { auth, db } from "../firebaseConfig";
import { resolveApiUrl } from "../src/lib/resolveApiUrl";

/** Stripe Docs — linked from Payouts so creators know what to enter and what fans see. */
const STRIPE_DOCS_STATEMENT_DESCRIPTORS =
  "https://docs.stripe.com/get-started/account/statement-descriptors";
const STRIPE_DOCS_CONNECT_ONBOARDING = "https://docs.stripe.com/connect/onboarding";

export interface StripeConnectStatus {
  stripeConnectAccountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  isPlatformOwner?: boolean;
  /** True when Stripe returns missing/inaccessible account for the saved ID (e.g. deleted in Stripe). */
  reconnectRequired?: boolean;
}

export const FanHubPayouts: React.FC = () => {
  const { showToast } = useAppContext();
  const [status, setStatus] = useState<StripeConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [resetting, setResetting] = useState(false);

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
          <div
            className="mb-4 rounded-lg border border-amber-200/90 dark:border-amber-800/70 bg-white/70 dark:bg-gray-950/40 px-3 py-2.5"
            role="note"
          >
            <p className="text-xs font-semibold text-amber-950 dark:text-amber-100 m-0 mb-1.5">
              Legal name vs. what fans see on their card
            </p>
            <p className="text-xs text-amber-900/90 dark:text-amber-200/85 m-0 leading-relaxed">
              Enter your <strong>real legal name</strong> wherever Stripe asks for identity or tax details—that is
              required for verification. The line fans see on bank or card statements usually comes from your{" "}
              <strong>statement descriptor</strong> or <strong>public business / charge description</strong> in Stripe,
              which you can set during onboarding or later in the Stripe Dashboard; use something that matches your
              EchoFlux <strong>@handle</strong> or stage name so charges look familiar. If you pick{" "}
              <strong>Individual</strong>, you may not see a separate “DBA” step—that is common; business or sole
              proprietor accounts often surface a trade or business name. Follow Stripe’s in-flow labels for where to
              set the customer-facing name.
            </p>
            <p className="text-xs text-amber-900/90 dark:text-amber-200/85 m-0 mt-2 leading-relaxed">
              <span className="font-semibold text-amber-950 dark:text-amber-100">Learn more:</span>{" "}
              <a
                href={STRIPE_DOCS_CONNECT_ONBOARDING}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-amber-900 dark:text-amber-200 underline underline-offset-2 hover:text-amber-950 dark:hover:text-amber-50"
              >
                Connect onboarding (what to expect)
              </a>
              {" · "}
              <a
                href={STRIPE_DOCS_STATEMENT_DESCRIPTORS}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-amber-900 dark:text-amber-200 underline underline-offset-2 hover:text-amber-950 dark:hover:text-amber-50"
              >
                Statement descriptors (what fans see)
              </a>
            </p>
          </div>
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
            <div className="flex flex-wrap items-center gap-2">
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
              <button
                type="button"
                onClick={() => void handleResetSavedAccount()}
                disabled={resetting || connecting}
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
