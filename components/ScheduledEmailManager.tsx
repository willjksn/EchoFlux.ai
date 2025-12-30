import React, { useEffect, useMemo, useState } from 'react';
import { auth } from '../firebaseConfig';
import { useAppContext } from './AppContext';

type EmailTemplate = { id: string; name: string; subject: string; text: string; html?: string | null };

type ScheduledEmail = {
  id: string;
  name: string;
  sendAt: string;
  subject: string;
  text: string;
  html?: string | null;
  templateId?: string | null;
  filterBy?: any;
  status: 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';
  createdAt?: string;
  updatedAt?: string;
  recipientCount?: number;
  sentCount?: number;
  failedCount?: number;
  error?: string;
};

export const ScheduledEmailManager: React.FC = () => {
  const { showToast } = useAppContext();
  const [items, setItems] = useState<ScheduledEmail[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [name, setName] = useState('');
  const [sendAtLocal, setSendAtLocal] = useState(''); // datetime-local string
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [useHtml, setUseHtml] = useState(false);
  const [html, setHtml] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [filterBy, setFilterBy] = useState<{ plan?: 'Free' | 'Pro' | 'Elite'; hasCompletedOnboarding?: boolean }>({});

  const load = async () => {
    setIsLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error('Not authenticated');

      const [schedResp, tplResp] = await Promise.all([
        fetch('/api/listScheduledEmails', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/listEmailTemplates', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const schedData = await schedResp.json().catch(() => ({}));
      const tplData = await tplResp.json().catch(() => ({}));

      if (!schedResp.ok) throw new Error(schedData?.error || 'Failed to load scheduled emails');
      if (tplResp.ok) setTemplates((tplData.templates || []) as EmailTemplate[]);

      setItems((schedData.items || []) as ScheduledEmail[]);
    } catch (e: any) {
      showToast(e?.message || 'Failed to load scheduled emails', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => (b.sendAt || '').localeCompare(a.sendAt || ''));
  }, [items]);

  const create = async () => {
    if (!name.trim()) return showToast('Name is required', 'error');
    if (!sendAtLocal) return showToast('Send date/time is required', 'error');
    if (!subject.trim()) return showToast('Subject is required', 'error');
    if (!text.trim()) return showToast('Text body is required', 'error');

    // Convert local datetime to ISO
    const sendAtIso = new Date(sendAtLocal).toISOString();

    setIsSaving(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error('Not authenticated');

      const resp = await fetch('/api/createScheduledEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: name.trim(),
          sendAt: sendAtIso,
          subject: subject.trim(),
          text,
          html: useHtml && html.trim() ? html : undefined,
          templateId: selectedTemplateId || undefined,
          filterBy: Object.keys(filterBy).length ? filterBy : undefined,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'Failed to schedule email');

      showToast('Email scheduled.', 'success');
      setName('');
      setSendAtLocal('');
      setSubject('');
      setText('');
      setUseHtml(false);
      setHtml('');
      setSelectedTemplateId('');
      setFilterBy({});
      await load();
    } catch (e: any) {
      showToast(e?.message || 'Failed to schedule email', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const cancel = async (id: string) => {
    if (!window.confirm('Cancel this scheduled email?')) return;
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error('Not authenticated');
      const resp = await fetch('/api/cancelScheduledEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'Failed to cancel scheduled email');
      showToast('Scheduled email cancelled.', 'success');
      await load();
    } catch (e: any) {
      showToast(e?.message || 'Failed to cancel scheduled email', 'error');
    }
  };

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Scheduled Emails</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Schedule emails to send at a specific time. (Cron runs separately; we’ll wire it in when you’re ready to redeploy.)
        </p>
      </div>

      {/* Create form */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Campaign Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              placeholder="e.g. January Newsletter"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Send At</label>
            <input
              type="datetime-local"
              value={sendAtLocal}
              onChange={(e) => setSendAtLocal(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Uses your local timezone. We store as ISO for sending.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template (optional)</label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            >
              <option value="">(No template)</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              disabled={!selectedTemplateId}
              onClick={() => {
                if (!selectedTemplate) return;
                setSubject(selectedTemplate.subject || '');
                setText(selectedTemplate.text || '');
                if (selectedTemplate.html) {
                  setUseHtml(true);
                  setHtml(selectedTemplate.html || '');
                } else {
                  setUseHtml(false);
                  setHtml('');
                }
                showToast(`Loaded template: ${selectedTemplate.name}`, 'success');
              }}
              className="w-full px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-50"
            >
              Load template
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Filter: Plan</label>
            <select
              value={filterBy.plan || ''}
              onChange={(e) => setFilterBy({ ...filterBy, plan: (e.target.value as any) || undefined })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            >
              <option value="">All Plans</option>
              <option value="Free">Free</option>
              <option value="Pro">Pro</option>
              <option value="Elite">Elite</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Filter: Onboarding</label>
            <select
              value={filterBy.hasCompletedOnboarding === undefined ? '' : filterBy.hasCompletedOnboarding ? 'true' : 'false'}
              onChange={(e) =>
                setFilterBy({
                  ...filterBy,
                  hasCompletedOnboarding: e.target.value === '' ? undefined : e.target.value === 'true',
                })
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            >
              <option value="">All Users</option>
              <option value="true">Completed Onboarding</option>
              <option value="false">Not Completed</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            placeholder="Subject (supports {name})"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Plain Text</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-mono text-sm"
            placeholder="Text body (supports {name})"
          />
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" checked={useHtml} onChange={(e) => setUseHtml(e.target.checked)} className="h-4 w-4" id="schedUseHtml" />
          <label htmlFor="schedUseHtml" className="text-sm text-gray-700 dark:text-gray-300">Include HTML version (optional)</label>
        </div>

        {useHtml && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">HTML</label>
            <textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={10}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-mono text-sm"
              placeholder="<p>HTML body (supports {name})</p>"
            />
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={create}
            disabled={isSaving}
            className="px-6 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {isSaving ? 'Scheduling…' : 'Schedule Email'}
          </button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-gray-500 dark:text-gray-400">Loading…</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Send At</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Results</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">No scheduled emails.</td>
                  </tr>
                ) : (
                  sorted.map((it) => (
                    <tr key={it.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{new Date(it.sendAt).toLocaleString()}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{it.name}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 capitalize">
                          {it.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {typeof it.sentCount === 'number' ? (
                          <span>Sent {it.sentCount}/{it.recipientCount ?? it.sentCount + (it.failedCount ?? 0)}{it.failedCount ? ` (failed ${it.failedCount})` : ''}</span>
                        ) : (
                          <span>—</span>
                        )}
                        {it.error ? <div className="text-xs text-red-600 dark:text-red-400 mt-1">{it.error}</div> : null}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {it.status === 'scheduled' ? (
                          <button onClick={() => cancel(it.id)} className="text-red-600 hover:text-red-700">Cancel</button>
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
    </div>
  );
};


