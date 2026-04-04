import React, { useState } from "react";
import type { User } from "../types";

type Props = {
  user: User;
  onLogout: () => void;
  onRefreshAccess: () => Promise<void>;
};

/**
 * Shown on echoflux.ai (etc.) when the user is signed in but does not have the `creatorApp` Auth claim.
 * Fans and imported member accounts use the creator's storefront URL instead.
 */
export const FanOnlyEchoFluxShell: React.FC<Props> = ({ user, onLogout, onRefreshAccess }) => {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const handleRefresh = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await onRefreshAccess();
      setMsg("Access refreshed. If you are a creator, try again; otherwise use your creator’s page link.");
    } catch {
      setMsg("Could not refresh. Try again or sign out.");
    } finally {
      setBusy(false);
    }
  };

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
