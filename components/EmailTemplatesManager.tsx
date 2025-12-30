import React, { useEffect, useMemo, useState } from 'react';
import { auth } from '../firebaseConfig';
import { useAppContext } from './AppContext';

type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  text: string;
  html?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

function stripHtmlToText(html: string): string {
  // Minimal HTML->text fallback (good enough for admin convenience)
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const EmailTemplatesManager: React.FC = () => {
  const { showToast } = useAppContext();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [html, setHtml] = useState<string>('');
  const [useHtml, setUseHtml] = useState(false);

  const resetEditor = () => {
    setEditing(null);
    setName('');
    setSubject('');
    setText('');
    setHtml('');
    setUseHtml(false);
  };

  const openNew = () => {
    resetEditor();
    setIsEditorOpen(true);
  };

  const openEdit = (t: EmailTemplate) => {
    setEditing(t);
    setName(t.name || '');
    setSubject(t.subject || '');
    setText(t.text || '');
    setHtml(typeof t.html === 'string' ? t.html : '');
    setUseHtml(!!t.html);
    setIsEditorOpen(true);
  };

  const load = async () => {
    setIsLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error('Not authenticated');
      const resp = await fetch('/api/listEmailTemplates', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'Failed to load templates');
      setTemplates((data.templates || []) as EmailTemplate[]);
    } catch (e: any) {
      showToast(e?.message || 'Failed to load templates', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(() => {
    return [...templates].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }, [templates]);

  const onUpload = async (file: File) => {
    const content = await file.text();
    const lower = file.name.toLowerCase();

    if (lower.endsWith('.html') || lower.endsWith('.htm')) {
      setUseHtml(true);
      setHtml(content);
      if (!text.trim()) setText(stripHtmlToText(content));
    } else {
      // Treat everything else as plain text
      setText(content);
      // If user wants HTML too, keep existing html
    }

    if (!name.trim()) {
      const base = file.name.replace(/\.[^.]+$/, '');
      setName(base.slice(0, 120));
    }
  };

  const save = async () => {
    if (!name.trim() || !subject.trim() || !text.trim()) {
      showToast('Name, subject, and text are required.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error('Not authenticated');

      const resp = await fetch('/api/saveEmailTemplate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: editing?.id,
          name: name.trim(),
          subject: subject.trim(),
          text,
          html: useHtml && html.trim() ? html : undefined,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'Failed to save template');

      showToast('Template saved.', 'success');
      setIsEditorOpen(false);
      resetEditor();
      await load();
    } catch (e: any) {
      showToast(e?.message || 'Failed to save template', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const del = async (id: string) => {
    if (!window.confirm('Delete this template? This cannot be undone.')) return;
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error('Not authenticated');
      const resp = await fetch('/api/deleteEmailTemplate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'Failed to delete template');
      showToast('Template deleted.', 'success');
      await load();
    } catch (e: any) {
      showToast(e?.message || 'Failed to delete template', 'error');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Email Templates</h2>
          <p className="text-gray-600 dark:text-gray-400">Upload, edit, and reuse email templates (plain text + optional HTML).</p>
        </div>
        <button
          onClick={openNew}
          className="px-4 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700"
        >
          New Template
        </button>
      </div>

      {isLoading ? (
        <div className="text-gray-500 dark:text-gray-400">Loading…</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Subject</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Updated</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                      No templates yet.
                    </td>
                  </tr>
                ) : (
                  sorted.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{t.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">{t.subject}</td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {t.updatedAt ? new Date(t.updatedAt).toLocaleString() : '—'}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex gap-3">
                          <button
                            onClick={() => openEdit(t)}
                            className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => del(t.id)}
                            className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editing ? 'Edit Template' : 'New Template'}
              </h3>
              <button
                onClick={() => {
                  setIsEditorOpen(false);
                  resetEditor();
                }}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template Name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    placeholder="e.g. Welcome / Upgrade / Newsletter #1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Upload (.txt or .html)</label>
                  <input
                    type="file"
                    accept=".txt,.text,.md,.html,.htm"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onUpload(f).catch(() => {});
                      e.currentTarget.value = '';
                    }}
                    className="w-full text-sm text-gray-700 dark:text-gray-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  placeholder="Subject line (supports {name})"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Plain Text (required)</label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={10}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono text-sm"
                  placeholder="Plain text body (supports {name})"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={useHtml}
                  onChange={(e) => setUseHtml(e.target.checked)}
                  className="h-4 w-4"
                  id="useHtml"
                />
                <label htmlFor="useHtml" className="text-sm text-gray-700 dark:text-gray-300">
                  Include HTML version (optional)
                </label>
              </div>

              {useHtml && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">HTML</label>
                  <textarea
                    value={html}
                    onChange={(e) => setHtml(e.target.value)}
                    rows={10}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono text-sm"
                    placeholder="<p>HTML body (supports {name})</p>"
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => {
                    setIsEditorOpen(false);
                    resetEditor();
                  }}
                  className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={isSaving}
                  className="px-6 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {isSaving ? 'Saving…' : 'Save Template'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


