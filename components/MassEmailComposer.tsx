import React, { useEffect, useState } from 'react';
import { auth } from '../firebaseConfig';
import { useAppContext } from './AppContext';
import { XIcon } from './icons/UIIcons';

interface MassEmailComposerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MassEmailComposer: React.FC<MassEmailComposerProps> = ({ isOpen, onClose }) => {
  const { showToast } = useAppContext();
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [html, setHtml] = useState('');
  const [useHtml, setUseHtml] = useState(false);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; subject: string; text: string; html?: string | null }>>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [filterBy, setFilterBy] = useState<{
    plan?: 'Free' | 'Pro' | 'Elite';
    hasCompletedOnboarding?: boolean;
  }>({});
  const [results, setResults] = useState<{
    total: number;
    sent: number;
    failed: number;
  } | null>(null);

  if (!isOpen) return null;

  useEffect(() => {
    if (!isOpen) return;

    const loadTemplates = async () => {
      setIsLoadingTemplates(true);
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
        if (!token) return;
        const resp = await fetch('/api/listEmailTemplates', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await resp.json().catch(() => ({}));
        if (resp.ok) {
          setTemplates((data.templates || []) as any);
        }
      } finally {
        setIsLoadingTemplates(false);
      }
    };

    loadTemplates();
  }, [isOpen]);

  const handleSend = async () => {
    if (!subject.trim() || !text.trim()) {
      showToast('Subject and message are required', 'error');
      return;
    }

    setIsSending(true);
    setResults(null);

    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error('Not authenticated');

      const resp = await fetch('/api/sendMassEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          subject: subject.trim(),
          text: text.trim(),
          html: useHtml && html.trim() ? html.trim() : undefined,
          templateId: selectedTemplateId || undefined,
          filterBy: Object.keys(filterBy).length > 0 ? filterBy : undefined,
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'Failed to send mass email');

      setResults({
        total: data.total || 0,
        sent: data.sent || 0,
        failed: data.failed || 0,
      });

      if (data.sent > 0) {
        showToast(`Mass email sent to ${data.sent} user${data.sent === 1 ? '' : 's'}${data.failed > 0 ? ` (${data.failed} failed)` : ''}`, data.failed > 0 ? 'error' : 'success');
      } else {
        showToast('No emails were sent', 'error');
      }
    } catch (e: any) {
      showToast(e?.message || 'Failed to send mass email', 'error');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Send Mass Email</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <XIcon />
          </button>
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* Templates */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Template (Optional)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                <option value="">(No template)</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!selectedTemplateId || isLoadingTemplates}
                onClick={() => {
                  const t = templates.find((x) => x.id === selectedTemplateId);
                  if (!t) return;
                  setSubject(t.subject || '');
                  setText(t.text || '');
                  if (t.html) {
                    setUseHtml(true);
                    setHtml(t.html || '');
                  } else {
                    setUseHtml(false);
                    setHtml('');
                  }
                  showToast(`Loaded template: ${t.name}`, 'success');
                }}
                className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-50"
              >
                {isLoadingTemplates ? 'Loading…' : 'Load'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedTemplateId('');
                }}
                className="px-4 py-2 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                Clear
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Templates are managed in Admin → Email Templates. This composer supports both plain text and HTML.
            </p>
          </div>

          {/* Filters */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Filters (Optional)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Plan
                </label>
                <select
                  value={filterBy.plan || ''}
                  onChange={(e) =>
                    setFilterBy({ ...filterBy, plan: e.target.value as any || undefined })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  <option value="">All Plans</option>
                  <option value="Free">Free</option>
                  <option value="Pro">Pro</option>
                  <option value="Elite">Elite</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Onboarding Status
                </label>
                <select
                  value={filterBy.hasCompletedOnboarding === undefined ? '' : filterBy.hasCompletedOnboarding ? 'true' : 'false'}
                  onChange={(e) =>
                    setFilterBy({
                      ...filterBy,
                      hasCompletedOnboarding: e.target.value === '' ? undefined : e.target.value === 'true',
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  <option value="">All Users</option>
                  <option value="true">Completed Onboarding</option>
                  <option value="false">Not Completed</option>
                </select>
              </div>
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Subject <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject line"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Use {'{name}'} to personalize (e.g., "Hi {name}, welcome!")
            </p>
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Message <span className="text-red-500">*</span>
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter your email message here (plain text)..."
              rows={12}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono text-sm"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Use {'{name}'} to personalize. Plain text only.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={useHtml}
              onChange={(e) => setUseHtml(e.target.checked)}
              className="h-4 w-4"
              id="useHtmlMass"
            />
            <label htmlFor="useHtmlMass" className="text-sm text-gray-700 dark:text-gray-300">
              Include HTML version (optional)
            </label>
          </div>

          {useHtml && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                HTML (optional)
              </label>
              <textarea
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                placeholder="<p>HTML version here...</p>"
                rows={10}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono text-sm"
              />
            </div>
          )}

          {/* Results */}
          {results && (
            <div className={`p-4 rounded-lg ${
              results.failed === 0
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
            }`}>
              <div className="font-semibold text-gray-900 dark:text-white mb-2">Results</div>
              <div className="text-sm text-gray-700 dark:text-gray-300">
                <div>Total recipients: {results.total}</div>
                <div className="text-green-600 dark:text-green-400">Sent: {results.sent}</div>
                {results.failed > 0 && (
                  <div className="text-red-600 dark:text-red-400">Failed: {results.failed}</div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={isSending || !subject.trim() || !text.trim()}
              className="px-6 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSending ? 'Sending...' : 'Send Email'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
