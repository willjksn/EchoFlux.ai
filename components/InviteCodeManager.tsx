import React, { useState, useEffect } from 'react';
import { useAppContext } from './AppContext';
import { auth } from '../firebaseConfig';

interface InviteCode {
  code: string;
  createdAt: string;
  createdBy: string;
  grantPlan: 'Free' | 'Pro' | 'Elite' | null;
  used: boolean;
  usedCount: number;
  maxUses: number;
  usedBy: string | null;
  usedAt: string | null;
  expiresAt: string | null;
  isExpired: boolean;
  isFullyUsed: boolean;
}

interface InviteStats {
  total: number;
  used: number;
  available: number;
  expired: number;
}

export const InviteCodeManager: React.FC = () => {
  const { showToast } = useAppContext();
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [stats, setStats] = useState<InviteStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateCount, setGenerateCount] = useState(1);
  const [generateGrantPlan, setGenerateGrantPlan] = useState<'Free' | 'Pro' | 'Elite'>('Free');
  const [generateMaxUses, setGenerateMaxUses] = useState(1);
  const [generateExpiresAt, setGenerateExpiresAt] = useState<string>(''); // YYYY-MM-DD

  const [editingInvite, setEditingInvite] = useState<InviteCode | null>(null);
  const [editGrantPlan, setEditGrantPlan] = useState<'Free' | 'Pro' | 'Elite'>('Free');
  const [editMaxUses, setEditMaxUses] = useState<number>(1);
  const [editExpiresAt, setEditExpiresAt] = useState<string>(''); // YYYY-MM-DD
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const fetchInvites = async () => {
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) {
        showToast('Not authenticated', 'error');
        return;
      }

      const resp = await fetch('/api/listInviteCodes', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!resp.ok) {
        throw new Error('Failed to fetch invite codes');
      }

      const data = await resp.json();
      setInvites(data.invites || []);
      setStats(data.stats || null);
    } catch (error: any) {
      console.error('Error fetching invite codes:', error);
      showToast('Failed to load invite codes', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInvites();
  }, []);

  const handleGenerate = async () => {
    if (generateCount < 1 || generateCount > 100) {
      showToast('Count must be between 1 and 100', 'error');
      return;
    }

    setIsGenerating(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) {
        showToast('Not authenticated', 'error');
        return;
      }

      const resp = await fetch('/api/generateInviteCode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          count: generateCount,
          grantPlan: generateGrantPlan,
          maxUses: generateMaxUses,
          expiresAt: generateExpiresAt ? new Date(generateExpiresAt).toISOString() : null,
        }),
      });

      if (!resp.ok) {
        const error = await resp.json();
        throw new Error(error.message || 'Failed to generate invite codes');
      }

      const data = await resp.json();
      showToast(`Generated ${data.count} invite code${data.count > 1 ? 's' : ''}`, 'success');
      
      // Reset form
      setGenerateCount(1);
      setGenerateGrantPlan('Free');
      setGenerateMaxUses(1);
      setGenerateExpiresAt('');
      
      // Refresh list
      await fetchInvites();
    } catch (error: any) {
      console.error('Error generating invite codes:', error);
      showToast(error.message || 'Failed to generate invite codes', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('Copied to clipboard!', 'success');
  };

  const openEdit = (invite: InviteCode) => {
    setEditingInvite(invite);
    setEditGrantPlan(
      (invite.grantPlan === 'Elite'
        ? 'Elite'
        : invite.grantPlan === 'Pro'
          ? 'Pro'
          : 'Free') as 'Free' | 'Pro' | 'Elite'
    );
    setEditMaxUses(invite.maxUses || 1);
    setEditExpiresAt(invite.expiresAt ? invite.expiresAt.slice(0, 10) : '');
  };

  const saveEdit = async () => {
    if (!editingInvite) return;
    setIsSavingEdit(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) {
        showToast('Not authenticated', 'error');
        return;
      }

      const resp = await fetch('/api/updateInviteCode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          code: editingInvite.code,
          grantPlan: editGrantPlan,
          maxUses: editMaxUses,
          expiresAt: editExpiresAt ? new Date(editExpiresAt).toISOString() : null,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.success) {
        throw new Error(data?.message || data?.error || 'Failed to update invite code');
      }
      showToast('Invite code updated', 'success');
      setEditingInvite(null);
      await fetchInvites();
    } catch (e: any) {
      showToast(e?.message || 'Failed to update invite code', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const deleteInvite = async (code: string) => {
    if (!window.confirm(`Delete invite code ${code}? This cannot be undone.`)) return;
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) {
        showToast('Not authenticated', 'error');
        return;
      }
      const resp = await fetch('/api/deleteInviteCode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ code }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.success) {
        throw new Error(data?.message || data?.error || 'Failed to delete invite code');
      }
      showToast('Invite code deleted', 'success');
      await fetchInvites();
    } catch (e: any) {
      showToast(e?.message || 'Failed to delete invite code', 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <p className="text-gray-500 dark:text-gray-400">Loading invite codes...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Invite Code Manager</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Generate and manage invite codes for controlled access
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <p className="text-sm text-gray-500 dark:text-gray-400">Total</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <p className="text-sm text-gray-500 dark:text-gray-400">Available</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.available}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <p className="text-sm text-gray-500 dark:text-gray-400">Used</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.used}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <p className="text-sm text-gray-500 dark:text-gray-400">Expired</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.expired}</p>
          </div>
        </div>
      )}

      {/* Generate Form */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Generate Invite Codes</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Count
            </label>
            <input
              type="number"
              min="1"
              max="100"
              value={generateCount}
              onChange={(e) => setGenerateCount(parseInt(e.target.value) || 1)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Grant Plan
            </label>
            <select
              value={generateGrantPlan}
              onChange={(e) => setGenerateGrantPlan(e.target.value as 'Free' | 'Pro' | 'Elite')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="Free">Free</option>
              <option value="Pro">Pro</option>
              <option value="Elite">Elite</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Max Uses
            </label>
            <input
              type="number"
              min="1"
              max="100"
              value={generateMaxUses}
              onChange={(e) => setGenerateMaxUses(parseInt(e.target.value) || 1)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Expiration Date
            </label>
            <input
              type="date"
              value={generateExpiresAt}
              onChange={(e) => setGenerateExpiresAt(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </div>
      </div>

      {/* Invite Codes List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">All Invite Codes</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Code</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Plan</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Uses</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Created</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Expires</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {invites.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                    No invite codes yet. Generate some to get started.
                  </td>
                </tr>
              ) : (
                invites.map((invite) => (
                  <tr key={invite.code} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <code className="text-sm font-mono text-gray-900 dark:text-white">{invite.code}</code>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {invite.grantPlan || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {invite.isFullyUsed ? (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200">
                          Used
                        </span>
                      ) : invite.isExpired ? (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200">
                          Expired
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200">
                          Available
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {invite.usedCount} / {invite.maxUses}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {new Date(invite.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {invite.expiresAt ? new Date(invite.expiresAt).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => copyToClipboard(invite.code)}
                        className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                      >
                        Copy
                      </button>
                      <span className="mx-2 text-gray-300 dark:text-gray-600">|</span>
                      <button
                        onClick={() => openEdit(invite)}
                        className="text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                      >
                        Edit
                      </button>
                      <span className="mx-2 text-gray-300 dark:text-gray-600">|</span>
                      <button
                        onClick={() => deleteInvite(invite.code)}
                        className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editingInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Edit Invite Code</h3>
              <button
                onClick={() => setEditingInvite(null)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Close
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Code</p>
                <code className="text-sm font-mono text-gray-900 dark:text-white">{editingInvite.code}</code>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Grant Plan
                </label>
                <select
                  value={editGrantPlan}
                  onChange={(e) => setEditGrantPlan(e.target.value as 'Free' | 'Pro' | 'Elite')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="Free">Free</option>
                  <option value="Pro">Pro</option>
                  <option value="Elite">Elite</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Max Uses
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={editMaxUses}
                  onChange={(e) => setEditMaxUses(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Expiration Date (optional)
                </label>
                <input
                  type="date"
                  value={editExpiresAt}
                  onChange={(e) => setEditExpiresAt(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Leave blank for no expiration.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setEditingInvite(null)}
                className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={isSavingEdit}
                className="px-4 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {isSavingEdit ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

