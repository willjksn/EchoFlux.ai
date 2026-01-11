import React, { useEffect, useMemo, useState } from "react";
import { auth } from "../firebaseConfig";
import { useAppContext } from "./AppContext";

type EmailHistoryEntry = {
  id: string;
  sentAt: string;
  to: string;
  subject: string;
  body: string;
  status: "sent" | "failed" | string;
  provider?: string | null;
  category?: string;
  error?: string;
  metadata?: any;
};

export const EmailOutbox: React.FC<{ status: "sent" | "failed" }> = ({ status }) => {
  const { showToast } = useAppContext();
  const [history, setHistory] = useState<EmailHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<EmailHistoryEntry | null>(null);
  const [q, setQ] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
        if (!token) throw new Error("Not authenticated");
        const resp = await fetch(`/api/getEmailHistory?limit=500`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data?.error || "Failed to load email history");
        const all = Array.isArray(data?.history) ? (data.history as EmailHistoryEntry[]) : [];
        setHistory(all);
        setSelectedIds(new Set());
      } catch (e: any) {
        showToast(e?.message || "Failed to load emails", "error");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [showToast]);

  const filtered = useMemo(() => {
    const base = history.filter((h) => h.status === status);
    const query = q.trim().toLowerCase();
    if (!query) return base;
    return base.filter((h) => {
      const to = (h.to || "").toLowerCase();
      const subject = (h.subject || "").toLowerCase();
      const cat = (h.category || "").toLowerCase();
      return to.includes(query) || subject.includes(query) || cat.includes(query);
    });
  }, [history, status, q]);

  const title = status === "sent" ? "Sent" : "Failed";

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allIds = filtered.map((e) => e.id);
      const allSelected = allIds.length > 0 && allIds.every((id) => next.has(id));
      if (allSelected) allIds.forEach((id) => next.delete(id));
      else allIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) {
      showToast("Select at least one email to delete.", "error");
      return;
    }
    if (!window.confirm(`Delete ${selectedIds.size} email(s)? This cannot be undone.`)) return;
    setIsDeleting(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error("Not authenticated");
      const resp = await fetch("/api/deleteEmailHistory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || "Failed to delete emails");
      setHistory((prev) => prev.filter((e) => !selectedIds.has(e.id)));
      setSelectedIds(new Set());
      showToast(`Deleted ${selectedIds.size} email(s).`, "success");
    } catch (e: any) {
      showToast(e?.message || "Failed to delete", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {status === "sent"
              ? "Emails successfully sent by EchoFlux."
              : "Emails that failed to send (inspect error and retry from the appropriate tool)."}
          </p>
        </div>
        <div className="w-full max-w-sm">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search to/subject/category…"
            className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
          />
        </div>
      </div>
      {selectedIds.size > 0 && (
        <div className="flex justify-end">
          <button
            onClick={deleteSelected}
            disabled={isDeleting}
            className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 font-semibold"
          >
            {isDeleting ? "Deleting…" : `Delete selected (${selectedIds.size})`}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="text-gray-500 dark:text-gray-400">Loading…</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every((e) => selectedIds.has(e.id))}
                      onChange={selectAll}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Sent</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">To</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Subject</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Provider</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                      No emails.
                    </td>
                  </tr>
                ) : (
                  filtered.map((e) => (
                    <tr
                      key={e.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                      onClick={() => setSelected(e)}
                    >
                      <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(e.id)}
                          onChange={() => toggleSelected(e.id)}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200 whitespace-nowrap">
                        {e.sentAt ? new Date(e.sentAt).toLocaleString() : ""}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{e.to}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{e.subject}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{e.category || "—"}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{e.provider || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(ev) => {
          if (ev.target === ev.currentTarget) setSelected(null);
        }}>
          <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex items-start justify-between gap-4">
              <div>
                <h4 className="text-lg font-bold text-gray-900 dark:text-white">{selected.subject}</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  To: {selected.to} • {selected.sentAt ? new Date(selected.sentAt).toLocaleString() : ""}
                </p>
                {status === "failed" && selected.error && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-300">Error: {selected.error}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
              >
                Close
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4">
                <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">{selected.body}</pre>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(selected.body || "");
                      showToast("Copied email body.", "success");
                    } catch {
                      showToast("Could not copy.", "error");
                    }
                  }}
                  className="px-4 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700"
                >
                  Copy body
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


