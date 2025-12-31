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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [approveEmail, setApproveEmail] = useState<string | null>(null);
  const [approveName, setApproveName] = useState<string | null>(null);
  const [approvePlan, setApprovePlan] = useState<'Free' | 'Pro' | 'Elite'>('Free');
  const [approveExpiresAt, setApproveExpiresAt] = useState<string>(''); // YYYY-MM-DD
  const [isApproving, setIsApproving] = useState(false);
  const [emailPreview, setEmailPreview] = useState<string | null>(null);
  const [approveSubject, setApproveSubject] = useState<string>("You've Been Selected for Early Testing — EchoFlux.ai");
  const [approveBody, setApproveBody] = useState<string>(
    [
      'Hi {name},',
      '',
      "Thanks for signing up — we'd love to bring you into the EchoFlux.ai early testing group 🎉",
      '',
      'Your Invite Code: {inviteCode}',
      'Plan: {plan}{expiresAt}',
      '',
      'How to get started:',
      '1) Go to https://echoflux.ai',
      '2) Click \"Sign in\" → \"Sign Up\" (or \"Continue with Google\")',
      '3) Enter the invite code when prompted',
      '4) Complete onboarding',
      '',
      'If you have issues, reply to this email.',
      '',
      '— The EchoFlux Team',
    ].join('\n')
  );

  const [rejectEmail, setRejectEmail] = useState<string | null>(null);
  const [rejectName, setRejectName] = useState<string | null>(null);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectSubject, setRejectSubject] = useState<string>('EchoFlux.ai waitlist update');
  const [rejectBody, setRejectBody] = useState<string>(
    [
      'Hi {name},',
      '',
      'Thanks for joining the EchoFlux.ai testing waitlist.',
      '',
      'At the moment, we’re onboarding a small group of early testers and we can’t invite everyone right away.',
      'We’ll keep your request on file, and we’ll reach out if a spot opens up.',
      '',
      '— The EchoFlux Team',
    ].join('\n')
  );

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

  useEffect(() => {
    // Clear selection when switching tabs/status or refreshing list.
    setSelectedIds(new Set());
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
          name: approveName,
          grantPlan: approvePlan,
          expiresAt: approveExpiresAt ? dateInputToIsoEndOfDay(approveExpiresAt) : null,
          subjectOverride: approveSubject,
          textOverride: approveBody,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'Failed to approve');
      if (data.emailPreview) setEmailPreview(data.emailPreview);
      if (data.emailSent) {
        showToast('Approved + email sent.', 'success');
        setApproveEmail(null);
        setApproveName(null);
      } else {
        const provider = data?.emailProvider ? String(data.emailProvider).toUpperCase() : 'EMAIL';
        const msg = data?.emailError?.message || data?.emailError || 'Email failed to send';
        showToast(`Approved, but ${provider} delivery failed: ${msg}. Copy the email preview below.`, 'error');
      }
      await load();
    } catch (e: any) {
      showToast(e?.message || 'Failed to approve', 'error');
    } finally {
      setIsApproving(false);
    }
  };

  const openReject = (email: string, name?: string | null) => {
    setRejectEmail(email);
    setRejectName(name || null);
    setEmailPreview(null);
  };

  const reject = async () => {
    if (!rejectEmail) return;
    setIsRejecting(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error('Not authenticated');
      const resp = await fetch('/api/adminRejectWaitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: rejectEmail,
          name: rejectName,
          subjectOverride: rejectSubject,
          textOverride: rejectBody,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'Failed to reject');
      if (data.emailPreview) setEmailPreview(data.emailPreview);
      if (data.emailSent) {
        showToast('Rejected + email sent.', 'success');
        setRejectEmail(null);
        setRejectName(null);
      } else {
        const provider = data?.emailProvider ? String(data.emailProvider).toUpperCase() : 'EMAIL';
        const msg = data?.emailError?.message || data?.emailError || 'Email failed to send';
        showToast(`Rejected, but ${provider} delivery failed: ${msg}. Copy the email preview below.`, 'error');
      }
      await load();
    } catch (e: any) {
      showToast(e?.message || 'Failed to reject', 'error');
    } finally {
      setIsRejecting(false);
    }
  };

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(items.map((it) => it.id)));
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} waitlist entr${selectedIds.size === 1 ? 'y' : 'ies'}? This cannot be undone.`)) return;

    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error('Not authenticated');
      const resp = await fetch('/api/adminDeleteWaitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'Failed to delete');
      showToast(`Deleted ${data?.deleted ?? selectedIds.size} entr${(data?.deleted ?? selectedIds.size) === 1 ? 'y' : 'ies'}.`, 'success');
      setSelectedIds(new Set());
      await load();
    } catch (e: any) {
      showToast(e?.message || 'Failed to delete', 'error');
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

      {(status === 'approved' || status === 'rejected') && items.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Selected: <span className="font-semibold">{selectedIds.size}</span>
          </div>
          <button
            onClick={deleteSelected}
            disabled={selectedIds.size === 0}
            className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Delete selected
          </button>
        </div>
      )}

      {emailPreview && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="font-semibold text-yellow-900 dark:text-yellow-100">Email preview (not sent)</div>
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
                  {(status === 'approved' || status === 'rejected') && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      <input
                        type="checkbox"
                        checked={items.length > 0 && selectedIds.size === items.length}
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                      />
                    </th>
                  )}
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
                    <td colSpan={(status === 'approved' || status === 'rejected') ? 6 : 5} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                      No items.
                    </td>
                  </tr>
                ) : (
                  items.map((it) => (
                    <tr key={it.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      {(status === 'approved' || status === 'rejected') && (
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(it.id)}
                            onChange={(e) => toggleSelected(it.id, e.target.checked)}
                          />
                        </td>
                      )}
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
                                setApproveName(it.name || null);
                                setApprovePlan('Free');
                                setApproveExpiresAt('');
                              }}
                              className="text-primary-600 hover:text-primary-700"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => openReject(it.email, it.name || null)}
                              className="text-red-600 hover:text-red-700"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={async () => {
                              if (!window.confirm(`Delete ${it.email}? This cannot be undone.`)) return;
                              try {
                                const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
                                if (!token) throw new Error('Not authenticated');
                                const resp = await fetch('/api/adminDeleteWaitlist', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                  body: JSON.stringify({ ids: [it.id] }),
                                });
                                const data = await resp.json().catch(() => ({}));
                                if (!resp.ok) throw new Error(data?.error || 'Failed to delete');
                                showToast('Deleted.', 'success');
                                await load();
                              } catch (e: any) {
                                showToast(e?.message || 'Failed to delete', 'error');
                              }
                            }}
                            className="text-red-600 hover:text-red-700"
                          >
                            Delete
                          </button>
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
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
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

              <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <div className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Email (editable)</div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Placeholders supported: {'{name}'}, {'{inviteCode}'}, {'{plan}'}, {'{expiresAt}'}.
                </p>
                <div className="space-y-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
                    <input
                      value={approveSubject}
                      onChange={(e) => setApproveSubject(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Body (plain text)</label>
                    <textarea
                      value={approveBody}
                      onChange={(e) => setApproveBody(e.target.value)}
                      rows={12}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono text-sm"
                    />
                  </div>
                </div>
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

      {/* Reject Modal */}
      {rejectEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Reject</h3>
              <button onClick={() => setRejectEmail(null)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400">
                Close
              </button>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">{rejectEmail}</div>

            <div className="mt-4 space-y-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Placeholders supported: {'{name}'}.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
                <input
                  value={rejectSubject}
                  onChange={(e) => setRejectSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Body (plain text)</label>
                <textarea
                  value={rejectBody}
                  onChange={(e) => setRejectBody(e.target.value)}
                  rows={10}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono text-sm"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setRejectEmail(null)}
                className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={reject}
                disabled={isRejecting}
                className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isRejecting ? 'Rejecting…' : 'Reject + email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


