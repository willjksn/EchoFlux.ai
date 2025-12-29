import React, { useEffect, useMemo, useState } from 'react';
import { Announcement, Plan } from '../types';
import { useAppContext } from './AppContext';
import { auth } from '../firebaseConfig';

const PLAN_OPTIONS: Plan[] = ['Free', 'Pro', 'Elite', 'Agency', 'Starter', 'Growth', 'Caption', 'OnlyFansStudio'];

type RewardType = 'extra_generations' | 'free_month' | 'storage_boost';

export const AdminAnnouncementsPanel: React.FC = () => {
  const { user, showToast } = useAppContext();
  const [isLoading, setIsLoading] = useState(true);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<Announcement['type']>('info');
  const [isActive, setIsActive] = useState(true);
  const [isBanner, setIsBanner] = useState(true);
  const [isPublic, setIsPublic] = useState(true);
  const [targetPlans, setTargetPlans] = useState<Plan[]>([]);
  // Store as ISO for backend; use datetime-local inputs for admin convenience.
  const [startsAtIso, setStartsAtIso] = useState<string>('');
  const [endsAtIso, setEndsAtIso] = useState<string>('');
  const [actionLabel, setActionLabel] = useState<string>('');
  const [actionPage, setActionPage] = useState<string>('pricing');

  const [bulkPlans, setBulkPlans] = useState<Plan[]>(['Pro']);
  const [bulkRewardType, setBulkRewardType] = useState<RewardType>('storage_boost');
  const [bulkRewardAmount, setBulkRewardAmount] = useState<number>(5);
  const [bulkReason, setBulkReason] = useState<string>('');
  const [isBulkGranting, setIsBulkGranting] = useState(false);

  const [cohortAnnouncementId, setCohortAnnouncementId] = useState<string>('');
  const [cohortUpgradedToPlans, setCohortUpgradedToPlans] = useState<Plan[]>(['Pro', 'Elite']);
  const [cohortRewardType, setCohortRewardType] = useState<RewardType>('storage_boost');
  const [cohortRewardAmount, setCohortRewardAmount] = useState<number>(5);
  const [cohortReason, setCohortReason] = useState<string>('');
  const [isCohortGranting, setIsCohortGranting] = useState(false);

  const canUse = user?.role === 'Admin';

  const isoToLocalInput = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    // YYYY-MM-DDTHH:mm in local time
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const localInputToIso = (local: string) => {
    if (!local) return '';
    // Date(...) interprets datetime-local as local timezone
    const d = new Date(local);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString();
  };

  const resetEditor = () => {
    setEditing(null);
    setTitle('');
    setBody('');
    setType('info');
    setIsActive(true);
    setIsBanner(true);
    setIsPublic(true);
    setTargetPlans([]);
    setStartsAtIso('');
    setEndsAtIso('');
    setActionLabel('');
    setActionPage('pricing');
  };

  const openCreate = () => {
    resetEditor();
    setIsEditorOpen(true);
  };

  const openEdit = (a: Announcement) => {
    setEditing(a);
    setTitle(a.title || '');
    setBody(a.body || '');
    setType(a.type || 'info');
    setIsActive(Boolean(a.isActive));
    setIsBanner(Boolean(a.isBanner));
    setIsPublic(Boolean(a.isPublic));
    setTargetPlans(Array.isArray(a.targetPlans) ? a.targetPlans : []);
    setStartsAtIso(a.startsAt || '');
    setEndsAtIso(a.endsAt || '');
    setActionLabel(a.actionLabel || '');
    setActionPage(a.actionPage || 'pricing');
    setIsEditorOpen(true);
  };

  const fetchAll = async () => {
    if (!canUse) return;
    setIsLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken(true);
      const res = await fetch('/api/adminListAnnouncements', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load announcements');
      setAnnouncements(Array.isArray(data?.announcements) ? data.announcements : []);
    } catch (err: any) {
      showToast(err?.message || 'Failed to load announcements', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUse]);

  const save = async () => {
    try {
      const token = await auth.currentUser?.getIdToken(true);
      const res = await fetch('/api/adminUpsertAnnouncement', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: editing?.id,
          title,
          body,
          type,
          isActive,
          isBanner,
          isPublic,
          targetPlans,
          startsAt: startsAtIso || null,
          endsAt: endsAtIso || null,
          actionLabel: actionLabel || null,
          actionPage: actionLabel ? actionPage : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || data?.message || 'Failed to save');
      showToast('Announcement saved', 'success');
      setIsEditorOpen(false);
      resetEditor();
      fetchAll();
    } catch (err: any) {
      showToast(err?.message || 'Failed to save announcement', 'error');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this announcement?')) return;
    try {
      const token = await auth.currentUser?.getIdToken(true);
      const res = await fetch('/api/adminDeleteAnnouncement', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to delete');
      showToast('Announcement deleted', 'success');
      fetchAll();
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete', 'error');
    }
  };

  const toggleFlag = async (a: Announcement, patch: Partial<Announcement>) => {
    try {
      const token = await auth.currentUser?.getIdToken(true);
      const res = await fetch('/api/adminUpsertAnnouncement', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...a, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to update');
      fetchAll();
    } catch (err: any) {
      showToast(err?.message || 'Failed to update announcement', 'error');
    }
  };

  const activeCount = useMemo(() => announcements.filter(a => a.isActive).length, [announcements]);

  const runBulkGrant = async () => {
    if (bulkPlans.length === 0) {
      showToast('Select at least one target plan', 'error');
      return;
    }
    if (!bulkRewardAmount || bulkRewardAmount <= 0) {
      showToast('Enter a valid amount', 'error');
      return;
    }
    setIsBulkGranting(true);
    try {
      const token = await auth.currentUser?.getIdToken(true);
      const res = await fetch('/api/adminBulkGrantReward', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetPlans: bulkPlans,
          rewardType: bulkRewardType,
          rewardAmount: bulkRewardAmount,
          reason: bulkReason || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || data?.message || 'Bulk grant failed');
      showToast(`Bulk grant applied to ${data.updatedCount || 0} users`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Bulk grant failed', 'error');
    } finally {
      setIsBulkGranting(false);
    }
  };

  const runCohortGrant = async () => {
    if (!cohortAnnouncementId) {
      showToast('Select an announcement', 'error');
      return;
    }
    if (cohortUpgradedToPlans.length === 0) {
      showToast('Select at least one upgraded-to plan', 'error');
      return;
    }
    if (!cohortRewardAmount || cohortRewardAmount <= 0) {
      showToast('Enter a valid amount', 'error');
      return;
    }
    setIsCohortGranting(true);
    try {
      const token = await auth.currentUser?.getIdToken(true);
      const res = await fetch('/api/adminGrantPromoCohort', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          announcementId: cohortAnnouncementId,
          upgradedToPlans: cohortUpgradedToPlans,
          rewardType: cohortRewardType,
          rewardAmount: cohortRewardAmount,
          reason: cohortReason || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || data?.message || 'Cohort grant failed');
      showToast(`Cohort grant: ${data.granted || 0} granted (${data.skippedAlreadyGranted || 0} already granted)`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Cohort grant failed', 'error');
    } finally {
      setIsCohortGranting(false);
    }
  };

  if (!canUse) {
    return (
      <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-md">
        <p className="text-sm text-gray-500 dark:text-gray-400">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Announcements</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Create global banners and reminders (shown to users in the header).
            </p>
          </div>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
          >
            Create
          </button>
        </div>

        <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          Active: <span className="font-semibold">{activeCount}</span> / {announcements.length}
        </div>

        <div className="mt-4 divide-y divide-gray-200 dark:divide-gray-700">
          {isLoading ? (
            <div className="py-6 text-sm text-gray-500 dark:text-gray-400">Loading…</div>
          ) : announcements.length === 0 ? (
            <div className="py-6 text-sm text-gray-500 dark:text-gray-400">No announcements yet.</div>
          ) : (
            announcements.map(a => (
              <div key={a.id} className="py-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900 dark:text-white truncate">{a.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      a.type === 'warning' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200'
                      : a.type === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                    }`}>
                      {a.type}
                    </span>
                    {a.isActive ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
                        Active
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                        Inactive
                      </span>
                    )}
                    {a.isBanner && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200">
                        Banner
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">
                    {a.body}
                  </p>
                  <div className="text-xs text-gray-400 mt-1">
                    {Array.isArray(a.targetPlans) && a.targetPlans.length > 0 ? `Plans: ${a.targetPlans.join(', ')}` : 'All plans'}
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => toggleFlag(a, { isActive: !a.isActive })}
                    className="px-3 py-1.5 text-sm rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
                  >
                    {a.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    onClick={() => toggleFlag(a, { isBanner: !a.isBanner })}
                    className="px-3 py-1.5 text-sm rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
                  >
                    {a.isBanner ? 'Unbanner' : 'Make Banner'}
                  </button>
                  <button
                    onClick={() => openEdit(a)}
                    className="px-3 py-1.5 text-sm rounded-md bg-primary-600 text-white hover:bg-primary-700"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(a.id)}
                    className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">Bulk Grants</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Grant extra generations, free months, or storage boosts to all users on specific plans.
        </p>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Target Plans</label>
            <div className="grid grid-cols-2 gap-2">
              {PLAN_OPTIONS.filter(p => ['Free', 'Pro', 'Elite', 'OnlyFansStudio'].includes(p)).map(p => (
                <label key={p} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={bulkPlans.includes(p)}
                    onChange={(e) => {
                      setBulkPlans(prev => e.target.checked ? Array.from(new Set([...prev, p])) : prev.filter(x => x !== p));
                    }}
                  />
                  {p}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Reward</label>
            <select
              value={bulkRewardType}
              onChange={(e) => setBulkRewardType(e.target.value as RewardType)}
              className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
            >
              <option value="storage_boost">Storage Boost (GB)</option>
              <option value="extra_generations">Extra AI Generations</option>
              <option value="free_month">Free Month(s)</option>
            </select>

            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Amount</label>
              <input
                type="number"
                min={1}
                value={bulkRewardAmount}
                onChange={(e) => setBulkRewardAmount(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
              />
            </div>
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Reason (optional)</label>
          <input
            value={bulkReason}
            onChange={(e) => setBulkReason(e.target.value)}
            className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
            placeholder="e.g., Launch promo, goodwill credit, early access users"
          />
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={runBulkGrant}
            disabled={isBulkGranting}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
          >
            {isBulkGranting ? 'Applying…' : 'Apply Bulk Grant'}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">Promo Cohort Grants (upgraded during window)</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Grant rewards only to users who upgraded during an announcement’s start/end window (based on recorded plan-change events).
        </p>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Announcement</label>
            <select
              value={cohortAnnouncementId}
              onChange={(e) => setCohortAnnouncementId(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
            >
              <option value="">Select…</option>
              {announcements.map(a => (
                <option key={a.id} value={a.id}>
                  {a.title} {a.startsAt ? `(starts ${new Date(a.startsAt).toLocaleString()})` : ''} {a.endsAt ? `(ends ${new Date(a.endsAt).toLocaleString()})` : ''}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Uses the announcement’s <strong>Starts At</strong> and <strong>Ends At</strong>. If Ends At is blank, “now” is used.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Eligible upgraded-to plans</label>
            <div className="grid grid-cols-2 gap-2">
              {(['Pro', 'Elite', 'OnlyFansStudio'] as Plan[]).map(p => (
                <label key={p} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={cohortUpgradedToPlans.includes(p)}
                    onChange={(e) => {
                      setCohortUpgradedToPlans(prev => e.target.checked ? Array.from(new Set([...prev, p])) : prev.filter(x => x !== p));
                    }}
                  />
                  {p}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Reward</label>
            <select
              value={cohortRewardType}
              onChange={(e) => setCohortRewardType(e.target.value as RewardType)}
              className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
            >
              <option value="storage_boost">Storage Boost (GB)</option>
              <option value="extra_generations">Extra AI Generations</option>
              <option value="free_month">Free Month(s)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Amount</label>
            <input
              type="number"
              min={1}
              value={cohortRewardAmount}
              onChange={(e) => setCohortRewardAmount(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Reason (optional)</label>
          <input
            value={cohortReason}
            onChange={(e) => setCohortReason(e.target.value)}
            className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
            placeholder="e.g., Holiday promo cohort reward"
          />
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={runCohortGrant}
            disabled={isCohortGranting}
            className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50"
          >
            {isCohortGranting ? 'Granting…' : 'Grant Cohort Reward'}
          </button>
        </div>
      </div>

      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {editing ? 'Edit Announcement' : 'Create Announcement'}
              </h3>
              <button
                onClick={() => { setIsEditorOpen(false); resetEditor(); }}
                className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <svg className="w-5 h-5 text-gray-500 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Body</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as Announcement['type'])}
                    className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                  >
                    <option value="info">Info</option>
                    <option value="success">Success</option>
                    <option value="warning">Warning</option>
                  </select>
                </div>

                <div className="flex items-center gap-4 pt-7">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                    Active
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input type="checkbox" checked={isBanner} onChange={(e) => setIsBanner(e.target.checked)} />
                    Banner
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                    Public
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Target Plans (optional)</label>
                <div className="grid grid-cols-2 gap-2">
                  {PLAN_OPTIONS.filter(p => ['Free', 'Pro', 'Elite', 'OnlyFansStudio'].includes(p)).map(p => (
                    <label key={p} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={targetPlans.includes(p)}
                        onChange={(e) => {
                          setTargetPlans(prev => e.target.checked ? Array.from(new Set([...prev, p])) : prev.filter(x => x !== p));
                        }}
                      />
                      {p}
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Leave empty to show to all plans.</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  <strong>Public</strong> shows on the landing page too (unauthenticated). Target plans apply only after login.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Starts At (optional)</label>
                  <input
                    type="datetime-local"
                    value={isoToLocalInput(startsAtIso)}
                    onChange={(e) => setStartsAtIso(localInputToIso(e.target.value))}
                    className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Ends At (optional)</label>
                  <input
                    type="datetime-local"
                    value={isoToLocalInput(endsAtIso)}
                    onChange={(e) => setEndsAtIso(localInputToIso(e.target.value))}
                    className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Uses your browser’s local time (recommended: set your system to Eastern Time). Stored internally as UTC ISO.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Action Label (optional)</label>
                  <input
                    value={actionLabel}
                    onChange={(e) => setActionLabel(e.target.value)}
                    placeholder="Upgrade now"
                    className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Action Page</label>
                  <select
                    value={actionPage}
                    onChange={(e) => setActionPage(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                  >
                    <option value="pricing">Pricing</option>
                    <option value="strategy">Strategy</option>
                    <option value="compose">Compose</option>
                    <option value="onlyfansStudio">OnlyFans Studio</option>
                    <option value="settings">Settings</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Action Page is the in-app destination when the banner button is clicked (e.g. <strong>Settings</strong> opens the Settings page).
                  </p>
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  onClick={() => { setIsEditorOpen(false); resetEditor(); }}
                  className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={!title.trim() || !body.trim()}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


