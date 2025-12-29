import React, { useState } from 'react';
import { auth } from '../firebaseConfig';
import { useAppContext } from './AppContext';

export const InviteRequiredPage: React.FC = () => {
  const { showToast } = useAppContext();
  const [inviteCode, setInviteCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const redeem = async () => {
    if (!inviteCode.trim()) {
      showToast('Invite code is required.', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) {
        showToast('Please sign in again.', 'error');
        return;
      }

      const resp = await fetch('/api/redeemInviteCode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ inviteCode: inviteCode.trim() }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.success) {
        showToast(data?.error || 'Failed to redeem invite code.', 'error');
        return;
      }

      showToast('Access granted. Reloading…', 'success');
      window.location.reload();
    } finally {
      setIsSubmitting(false);
    }
  };

  const signOut = async () => {
    try {
      await auth.signOut();
    } catch {}
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Invite Required</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          This app is currently invite-only. Enter an invite code to continue.
        </p>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Invite Code</label>
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 9))}
            placeholder="XXXX-XXXX"
            className="w-full px-3 py-2 border rounded-md bg-white text-gray-900 dark:bg-gray-900 dark:text-white border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={redeem}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Verifying…' : 'Continue'}
          </button>
          <button
            onClick={signOut}
            className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};


