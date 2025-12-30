import React, { useEffect, useState } from 'react';
import { auth } from '../firebaseConfig';
import { useAppContext } from './AppContext';
import { dateInputToIsoEndOfDay } from '../src/utils/dateInput';

type WaitlistItem = {
  id: string;
  email: string;
  name?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  createdAt?: string;
  updatedAt?: string;
  inviteCode?: string;
  grantPlan?: 'Free' | 'Pro' | 'Elite';
  expiresAt?: string | null;
  emailStatus?: string;
  lastEmailedAt?: string;
};

export const WaitlistManager: React.FC = () => {
  const { showToast } = useAppContext();
  const [items, setItems] = useState<WaitlistItem[]>([]);
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [isLoading, setIsLoading] = useState(true);

  const [approveEmail, setApproveEmail] = useState<string | null>(null);
  const [approvePlan, setApprovePlan] = useState<'Free' | 'Pro' | 'Elite'>('Free');
  const [approveExpiresAt, setApproveExpiresAt] = useState<string>(''); // YYYY-MM-DD
  const [isApproving, setIsApproving] = useState(false);
  const [emailPreview, setEmailPreview] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error('Not authenticated');
      const resp = await fetch(`/api/adminListWaitlist?status=${status}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'Failed to load waitlist');
      setItems((data.items || []) as WaitlistItem[]);
    } catch (e: any) {
      showToast(e?.message || 'Failed to load waitlist', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const approve = async () => {
    if (!approveEmail) return;
    setIsApproving(true);
    setEmailPreview(null);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error('Not authenticated');
      const resp = await fetch('/api/adminApproveWaitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: approveEmail,
          grantPlan: approvePlan,
          expiresAt: approveExpiresAt ? dateInputToIsoEndOfDay(approveExpiresAt) : null,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'Failed to approve');
      if (data.emailPreview) setEmailPreview(data.emailPreview);
      showToast(data.emailSent ? 'Approved + email sent.' : 'Approved. SMTP not configured — copy the email preview.', data.emailSent ? 'success' : 'error');
      setApproveEmail(null);
      await load();
    } catch (e: any) {
      showToast(e?.message || 'Failed to approve', 'error');
    } finally {
      setIsApproving(false);
    }
  };

  const reject = async (email: string) => {
    if (!window.confirm(`Reject ${email}?`)) return;
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error('Not authenticated');
      const resp = await fetch('/api/adminRejectWaitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'Failed to reject');
      showToast('Rejected.', 'success');
      await load();
    } catch (e: any) {
      showToast(e?.message || 'Failed to reject', 'error');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Waitlist</h2>
        <p className="text-gray-600 dark:text-gray-400">Review requests and grant access by emailing an invite.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['pending', 'approved', 'rejected'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-4 py-2 rounded-md transition-colors ${
              status === s ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {emailPreview && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="font-semibold text-yellow-900 dark:text-yellow-100">Email preview (SMTP not configured)</div>
          <pre className="mt-2 text-xs whitespace-pre-wrap text-yellow-900 dark:text-yellow-100">{emailPreview}</pre>
        </div>
      )}

      {isLoading ? (
        <div className="text-gray-500 dark:text-gray-400">Loading…</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Created</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Invite</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                      No items.
                    </td>
                  </tr>
                ) : (
                  items.map((it) => (
                    <tr key={it.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{it.email}</td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{it.name || '—'}</td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {it.createdAt ? new Date(it.createdAt).toLocaleString() : '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {it.inviteCode ? `${it.inviteCode} (${it.grantPlan || '—'})` : '—'}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {status === 'pending' ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setApproveEmail(it.email);
                                setApprovePlan('Free');
                                setApproveExpiresAt('');
                              }}
                              className="text-primary-600 hover:text-primary-700"
                            >
                              Approve
                            </button>
                            <button onClick={() => reject(it.email)} className="text-red-600 hover:text-red-700">
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Approve Modal */}
      {approveEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Approve</h3>
              <button onClick={() => setApproveEmail(null)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400">
                Close
              </button>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">{approveEmail}</div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Grant plan</label>
                <select
                  value={approvePlan}
                  onChange={(e) => setApprovePlan(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  <option value="Free">Free</option>
                  <option value="Pro">Pro</option>
                  <option value="Elite">Elite</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Expiration date (optional)</label>
                <input
                  type="date"
                  value={approveExpiresAt}
                  onChange={(e) => setApproveExpiresAt(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setApproveEmail(null)}
                className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={approve}
                disabled={isApproving}
                className="px-4 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {isApproving ? 'Approving…' : 'Approve + email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


