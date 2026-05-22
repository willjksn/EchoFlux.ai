import React, { useState } from "react";
import type { User } from "../types";
import { isEchoFluxPaidSubscriptionLapsed } from "../src/lib/echoFluxSubscriptionAccess";
import {
  canOpenCreatorBillingPortal,
  openCreatorBillingPortal,
} from "../src/lib/openCreatorBillingPortal";

type Props = {
  user: User;
  onLogout: () => void;
  onRefreshAccess: () => Promise<void>;
  onGoToPricing?: () => void;
};

/**
 * Shown on echoflux.ai (etc.) when the user is signed in but does not have the `creatorApp` Auth claim.
 * Fans and imported member accounts use the creator's storefront URL instead.
 */
export const FanOnlyEchoFluxShell: React.FC<Props> = ({
  user,
  onLogout,
  onRefreshAccess,
  onGoToPricing,
}) => {
  const [busy, setBusy] = useState(false);
  const [billingPortalLoading, setBillingPortalLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const showBillingPortal = canOpenCreatorBillingPortal(user);

  const subscriptionLapsed = isEchoFluxPaidSubscriptionLapsed({
    plan: user?.plan,
    subscriptionStatus: user?.subscriptionStatus,
    cancelAtPeriodEnd: user?.cancelAtPeriodEnd,
    subscriptionEndDate: user?.subscriptionEndDate,
    subscriptionCurrentPeriodEnd: user?.subscriptionCurrentPeriodEnd,
    stripeSubscriptionId: user?.stripeSubscriptionId,
    hasCompletedOnboarding: user?.hasCompletedOnboarding,
  });

  const statusLabel = (user?.subscriptionStatus || "").replace(/_/g, " ").trim();

  const handleOpenBillingPortal = async () => {
    setBillingPortalLoading(true);
    setMsg(null);
    try {
      await openCreatorBillingPortal({ returnUrl: window.location.origin });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not open billing portal");
      setBillingPortalLoading(false);
    }
  };

  const handleRefresh = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await onRefreshAccess();
      setMsg(
        subscriptionLapsed
          ? "Access refreshed. If your payment is fixed, try again — otherwise update billing below."
          : "Access refreshed. If you are a creator, try again; otherwise use your creator’s page link."
      );
    } catch {
      setMsg("Could not refresh. Try again or sign out.");
    } finally {
      setBusy(false);
    }
  };

  if (subscriptionLapsed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
        <div className="max-w-md w-full rounded-xl border border-amber-200 dark:border-amber-800/60 bg-white dark:bg-gray-800 shadow-lg p-8 text-center">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Subscription inactive
          </h1>
          <p className="text-gray-600 dark:text-gray-300 text-sm mb-4">
            Your EchoFlux plan ({user?.plan || "paid"}) is not active
            {statusLabel ? ` (${statusLabel})` : ""}. Update your payment or resubscribe to use the creator
            dashboard, Fan Hub studio, and WitMe tools.
          </p>
          {user?.email ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 break-all">Signed in as {user.email}</p>
          ) : null}
          {msg ? <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">{msg}</p> : null}
          <div className="flex flex-col gap-3">
            {showBillingPortal ? (
              <button
                type="button"
                onClick={() => void handleOpenBillingPortal()}
                disabled={billingPortalLoading}
                className="w-full py-2.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
              >
                {billingPortalLoading ? "Opening Stripe…" : "Update payment method in Stripe"}
              </button>
            ) : null}
            {onGoToPricing ? (
              <button
                type="button"
                onClick={onGoToPricing}
                className={`w-full py-2.5 rounded-lg text-sm font-medium ${
                  showBillingPortal
                    ? "border border-primary-600 text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-950/40"
                    : "bg-primary-600 text-white hover:bg-primary-700"
                }`}
              >
                View plans &amp; resubscribe
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={busy}
              className="w-full py-2.5 rounded-lg border border-primary-600 text-primary-700 dark:text-primary-300 text-sm font-medium hover:bg-primary-50 dark:hover:bg-primary-950/40 disabled:opacity-50"
            >
              {busy ? "Checking…" : "I updated payment — refresh access"}
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="w-full py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg p-8 text-center">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Member sign-in</h1>
        <p className="text-gray-600 dark:text-gray-300 text-sm mb-6">
          This account is for accessing a creator’s page (subscriptions, messages, purchases). The EchoFlux creator
          dashboard is only for creators with an active EchoFlux workspace.
        </p>
        {user?.email ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 break-all">Signed in as {user.email}</p>
        ) : null}
        {msg ? <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">{msg}</p> : null}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={busy}
            className="w-full py-2.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
          >
            {busy ? "Checking…" : "I’m a creator — refresh access"}
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};
