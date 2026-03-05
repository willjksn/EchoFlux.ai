import React, { useState, useEffect } from "react";
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

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
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
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
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
      showToast?.(data.message || "Failed to start Connect onboarding", "error");
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
  const needsOnboarding = hasAccount && !status?.detailsSubmitted;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        Payouts
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        {isPlatformOwner 
          ? "As a platform owner, payments go directly to the main EchoFlux account."
          : "Connect Stripe to receive payments from subscriptions and one-time purchases."
        }
      </p>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        {/* Platform Owner - no Stripe Connect needed */}
        {isPlatformOwner && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
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
        
        {/* Regular Creator - needs Stripe Connect */}
        {!isPlatformOwner && !hasAccount && (
          <>
            <p className="text-gray-600 dark:text-gray-300">
              Connect your Stripe account to accept payments and receive payouts.
            </p>
            <button
              type="button"
              onClick={handleConnect}
              disabled={connecting}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {connecting ? "Connecting…" : "Connect Stripe"}
            </button>
          </>
        )}

        {!isPlatformOwner && hasAccount && (
          <>
            <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
              <span className="font-medium">Stripe:</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Connected ({status.stripeConnectAccountId?.slice(0, 12)}…)
              </span>
            </div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <span
                  className={
                    canCharge
                      ? "text-green-600 dark:text-green-400"
                      : "text-amber-600 dark:text-amber-400"
                  }
                >
                  {canCharge ? "✓" : "○"}
                </span>
                <span>
                  {canCharge
                    ? "Charges enabled — you can accept payments"
                    : "Charges not yet enabled — complete onboarding"}
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span
                  className={
                    canPayout
                      ? "text-green-600 dark:text-green-400"
                      : "text-amber-600 dark:text-amber-400"
                  }
                >
                  {canPayout ? "✓" : "○"}
                </span>
                <span>
                  {canPayout
                    ? "Payouts enabled — you can receive payouts"
                    : "Payouts not yet enabled — complete verification"}
                </span>
              </li>
            </ul>
            {(needsOnboarding || !canCharge || !canPayout) && (
              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                {connecting ? "Opening…" : "Complete setup in Stripe"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
