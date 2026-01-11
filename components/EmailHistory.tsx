import React, { useState, useEffect } from 'react';
import { auth } from '../firebaseConfig';
import { useAppContext } from './AppContext';

type EmailHistoryEntry = {
  id: string;
  sentAt: string;
  sentBy: string | null;
  to: string;
  subject: string;
  body: string;
  html?: string;
  status: 'sent' | 'failed';
  provider: string | null;
  error?: string;
  category: 'waitlist' | 'mass' | 'scheduled' | 'template' | 'other';
  metadata?: any;
};

export const EmailHistory: React.FC = () => {
  const { showToast } = useAppContext();
  const [history, setHistory] = useState<EmailHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<'all' | 'waitlist' | 'mass' | 'scheduled' | 'template' | 'other'>('all');
  const [selectedEmail, setSelectedEmail] = useState<EmailHistoryEntry | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const loadHistory = async () => {
      setIsLoading(true);
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
        if (!token) throw new Error('Not authenticated');

        const categoryParam = activeCategory === 'all' ? '' : `&category=${activeCategory}`;
        const resp = await fetch(`/api/getEmailHistory?limit=500${categoryParam}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data?.error || 'Failed to load email history');
        setHistory((data.history || []) as EmailHistoryEntry[]);
      } catch (e: any) {
        showToast(e?.message || 'Failed to load email history', 'error');
      } finally {
        setIsLoading(false);
      }
    };
    loadHistory();
  }, [activeCategory, showToast]);

  const stats = {
    total: history.length,
    sent: history.filter((h) => h.status === 'sent').length,
    failed: history.filter((h) => h.status === 'failed').length,
    waitlist: history.filter((h) => h.category === 'waitlist').length,
    mass: history.filter((h) => h.category === 'mass').length,
    scheduled: history.filter((h) => h.category === 'scheduled').length,
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === history.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(history.map(h => h.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) {
      showToast('Please select at least one email to delete', 'error');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} email(s)? This action cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error('Not authenticated');

      const response = await fetch('/api/deleteEmailHistory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to delete emails');

      // Remove deleted emails from local state
      const deletedCount = selectedIds.size;
      setHistory(prev => prev.filter(h => !selectedIds.has(h.id)));
      setSelectedIds(new Set());
      showToast(`Successfully deleted ${deletedCount} email(s)`, 'success');
    } catch (e: any) {
      console.error('Failed to delete emails:', e);
      showToast(e?.message || 'Failed to delete emails', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Email History</h2>
        <p className="text-gray-600 dark:text-gray-400">View all sent emails across all categories</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500 dark:text-gray-400">Total</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500 dark:text-gray-400">Sent</div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.sent}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500 dark:text-gray-400">Failed</div>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.failed}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500 dark:text-gray-400">Categories</div>
          <div className="text-sm font-semibold text-gray-900 dark:text-white">
            W:{stats.waitlist} M:{stats.mass} S:{stats.scheduled}
          </div>
        </div>
      </div>

      {/* Category Tabs and Delete Button */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-700 pb-2">
        <div className="flex flex-wrap gap-2">
          {(['all', 'waitlist', 'mass', 'scheduled', 'template', 'other'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-md transition-colors capitalize ${
                activeCategory === cat
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        {selectedIds.size > 0 && (
          <button
            onClick={handleDeleteSelected}
            disabled={isDeleting}
            className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isDeleting ? 'Deleting...' : `Delete ${selectedIds.size} Selected`}
          </button>
        )}
      </div>

      {/* History Table */}
      {isLoading ? (
        <div className="text-gray-500 dark:text-gray-400">Loading…</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    <input
                      type="checkbox"
                      checked={history.length > 0 && selectedIds.size === history.length}
                      onChange={handleSelectAll}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Sent At</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">To</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Subject</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Provider</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                      No email history found.
                    </td>
                  </tr>
                ) : (
                  history.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(entry.id)}
                          onChange={() => handleToggleSelect(entry.id)}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                        {new Date(entry.sentAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{entry.to}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{entry.subject}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 capitalize">
                          {entry.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            entry.status === 'sent'
                              ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                              : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                          }`}
                        >
                          {entry.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{entry.provider || 'N/A'}</td>
                      <td className="px-6 py-4 text-sm">
                        <button
                          onClick={() => setSelectedEmail(entry)}
                          className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Email Detail Modal */}
      {selectedEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Email Details</h3>
              <button
                onClick={() => setSelectedEmail(null)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400">To</div>
                <div className="text-gray-900 dark:text-white">{selectedEmail.to}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Subject</div>
                <div className="text-gray-900 dark:text-white">{selectedEmail.subject}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Sent At</div>
                <div className="text-gray-900 dark:text-white">{new Date(selectedEmail.sentAt).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</div>
                <div className="text-gray-900 dark:text-white">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      selectedEmail.status === 'sent'
                        ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                        : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                    }`}
                  >
                    {selectedEmail.status}
                  </span>
                </div>
              </div>
              {selectedEmail.error && (
                <div>
                  <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Error</div>
                  <div className="text-red-600 dark:text-red-400">{selectedEmail.error}</div>
                </div>
              )}
              <div>
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Body</div>
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-sans">
                    {selectedEmail.body}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

