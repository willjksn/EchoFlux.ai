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
      
      // Check if Stripe Connect is not set up on the platform
      if (data.setupRequired) {
        showToast?.("Stripe Connect is not yet enabled for this platform. Please contact support.", "error");
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
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-2">How it works</h4>
              <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
                <li>• Click the button below to start Stripe Connect setup</li>
                <li>• You'll be taken to Stripe to create or connect your account</li>
                <li>• Complete the verification steps (takes 5-10 minutes)</li>
                <li>• Once approved, fans can purchase from your page</li>
                <li>• Payouts go directly to your bank account</li>
              </ul>
              <p className="text-xs text-blue-600 dark:text-blue-500 mt-2">
                A 10% platform fee is deducted from each transaction.
              </p>
            </div>
            <button
              type="button"
              onClick={handleConnect}
              disabled={connecting}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
            >
              {connecting ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Connecting…
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/>
                  </svg>
                  Connect with Stripe
                </>
              )}
            </button>
          </div>
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
