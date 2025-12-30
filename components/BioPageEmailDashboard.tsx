import React, { useEffect, useState } from 'react';
import { auth } from '../firebaseConfig';
import { useAppContext } from './AppContext';

type Subscriber = {
  id: string;
  email: string;
  creatorId: string;
  subscribedAt: string;
  source?: string;
};

export const BioPageEmailDashboard: React.FC = () => {
  const { showToast } = useAppContext();
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCreator, setSelectedCreator] = useState<string>('all');

  const loadSubscribers = async () => {
    setIsLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error('Not authenticated');
      
      const url = selectedCreator === 'all' 
        ? '/api/getBioPageSubscribers'
        : `/api/getBioPageSubscribers?creatorId=${selectedCreator}`;
      
      const resp = await fetch(url, {
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
    loadSubscribers();
  }, [selectedCreator]);

  const exportCSV = () => {
    if (subscribers.length === 0) {
      showToast('No subscribers to export', 'error');
      return;
    }

    const headers = ['Email', 'Creator ID', 'Subscribed At', 'Source'];
    const rows = subscribers.map(s => [
      s.email,
      s.creatorId,
      new Date(s.subscribedAt).toLocaleString(),
      s.source || 'N/A'
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bio-page-subscribers-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Bio Page Email Subscribers</h2>
          <p className="text-gray-600 dark:text-gray-400">View and export email subscribers from bio pages</p>
        </div>
        <div className="flex gap-2">
          <select
            value={selectedCreator}
            onChange={(e) => setSelectedCreator(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="all">All Creators</option>
            {/* TODO: Add creator list */}
          </select>
          <button
            onClick={exportCSV}
            disabled={subscribers.length === 0}
            className="px-4 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export CSV
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Creator ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Subscribed</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {subscribers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                      No subscribers found.
                    </td>
                  </tr>
                ) : (
                  subscribers.map((sub) => (
                    <tr key={sub.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{sub.email}</td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{sub.creatorId}</td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {new Date(sub.subscribedAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{sub.source || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {subscribers.length > 0 && (
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Total: <span className="font-semibold">{subscribers.length}</span> subscriber{subscribers.length === 1 ? '' : 's'}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

