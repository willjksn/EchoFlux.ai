import React, { useEffect, useMemo, useState } from 'react';
import { auth } from '../firebaseConfig';
import { useAppContext } from './AppContext';

type Subscriber = { id: string; email: string; capturedAt: string };

export const BioPageSubscribersPanel: React.FC = () => {
  const { showToast } = useAppContext();
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    setIsLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error('Not authenticated');

      const resp = await fetch('/api/getMyBioPageSubscribers', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'Failed to load subscribers');
      setSubscribers((data.subscribers || []) as Subscriber[]);
    } catch (e: any) {
      showToast(e?.message || 'Failed to load subscribers', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(() => {
    return [...subscribers].sort((a, b) => String(b.capturedAt || '').localeCompare(String(a.capturedAt || '')));
  }, [subscribers]);

  const exportCsv = () => {
    const rows = [['email', 'capturedAt'], ...sorted.map((s) => [s.email, s.capturedAt])];
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bio-page-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Subscribers</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">View and export emails collected from your bio page.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="px-3 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            Refresh
          </button>
          <button
            onClick={exportCsv}
            disabled={sorted.length === 0}
            className="px-3 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-gray-500 dark:text-gray-400">Loading…</div>
      ) : (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Captured</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-4 text-center text-gray-500 dark:text-gray-400">
                      No subscribers yet.
                    </td>
                  </tr>
                ) : (
                  sorted.map((s) => (
                    <tr key={s.id} className="hover:bg-white dark:hover:bg-gray-800">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{s.email}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {s.capturedAt ? new Date(s.capturedAt).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};


