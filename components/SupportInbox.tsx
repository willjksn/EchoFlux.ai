import React, { useEffect, useMemo, useState } from "react";
import { auth } from "../firebaseConfig";
import { useAppContext } from "./AppContext";

type InboxSource = "feedback" | "contact";
type AdminStatus = "open" | "done";

type InboxItem = {
  id: string;
  source: InboxSource;
  createdAt: string;
  updatedAt?: string | null;
  uid?: string | null;
  email?: string | null;
  name?: string | null;
  category?: string;
  text?: string;
  adminStatus?: AdminStatus | string;
  respondedAt?: string | null;
};

export const SupportInbox: React.FC = () => {
  const { showToast } = useAppContext();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"open" | "done" | "all">("open");
  const [selected, setSelected] = useState<InboxItem | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const isDev = typeof import.meta !== "undefined" ? import.meta.env.DEV : false;
  const mockAdmin = typeof import.meta !== "undefined" ? import.meta.env.VITE_MOCK_ADMIN === "1" : false;

  const filtered = useMemo(() => {
    if (statusFilter === "all") return items;
    return items.filter((i) => (i.adminStatus || "open") === statusFilter);
  }, [items, statusFilter]);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
        if (!token) throw new Error("Not authenticated");

        const resp = await fetch("/api/adminGetSupportInbox?limit=300", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          // In dev/mock mode without backend, fail softly and show empty inbox
          if (isDev || mockAdmin) {
            setItems([]);
            setSelectedKeys(new Set());
            return;
          }
          throw new Error(data?.error || "Failed to load inbox");
        }
        setItems(Array.isArray(data?.items) ? (data.items as InboxItem[]) : []);
        setSelectedKeys(new Set());
      } catch (e: any) {
        showToast(e?.message || "Failed to load inbox", "error");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [showToast]);

  const updateStatus = async (item: InboxItem, next: AdminStatus) => {
    setIsUpdating(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error("Not authenticated");
      const resp = await fetch("/api/adminUpdateSupportInboxItem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          source: item.source,
          id: item.id,
          adminStatus: next,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || "Failed to update status");
      setItems((prev) => prev.map((p) => (p.id === item.id && p.source === item.source ? { ...p, adminStatus: next } : p)));
      setSelected((prev) => (prev && prev.id === item.id && prev.source === item.source ? { ...prev, adminStatus: next } : prev));
    } catch (e: any) {
      showToast(e?.message || "Failed to update", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  const stats = useMemo(() => {
    const open = items.filter((i) => (i.adminStatus || "open") === "open").length;
    const done = items.filter((i) => (i.adminStatus || "open") === "done").length;
    return { open, done, total: items.length };
  }, [items]);

  const keyOf = (i: InboxItem) => `${i.source}:${i.id}`;

  const toggleSelected = (item: InboxItem) => {
    const key = keyOf(item);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const allKeys = filtered.map(keyOf);
      const allSelected = allKeys.length > 0 && allKeys.every((k) => next.has(k));
      if (allSelected) {
        allKeys.forEach((k) => next.delete(k));
      } else {
        allKeys.forEach((k) => next.add(k));
      }
      return next;
    });
  };

  const deleteSelected = async () => {
    if (selectedKeys.size === 0) {
      showToast("Select at least one item to delete.", "error");
      return;
    }
    if (!window.confirm(`Delete ${selectedKeys.size} item(s)? This cannot be undone.`)) return;

    setIsDeleting(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error("Not authenticated");

      const itemsToDelete = Array.from(selectedKeys).map((k) => {
        const [source, id] = k.split(":");
        return { source, id };
      });

      const resp = await fetch("/api/adminDeleteSupportInboxItems", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ items: itemsToDelete }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || "Failed to delete");

      setItems((prev) => prev.filter((i) => !selectedKeys.has(keyOf(i))));
      setSelectedKeys(new Set());
      showToast(`Deleted ${itemsToDelete.length} item(s).`, "success");
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
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">Inbox</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Actionable messages from feedback submissions and the contact form.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStatusFilter("open")}
            className={`px-3 py-2 rounded-md text-sm font-semibold ${
              statusFilter === "open" ? "bg-primary-600 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
            }`}
          >
            Open ({stats.open})
          </button>
          <button
            onClick={() => setStatusFilter("done")}
            className={`px-3 py-2 rounded-md text-sm font-semibold ${
              statusFilter === "done" ? "bg-primary-600 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
            }`}
          >
            Done ({stats.done})
          </button>
          <button
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-2 rounded-md text-sm font-semibold ${
              statusFilter === "all" ? "bg-primary-600 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
            }`}
          >
            All ({stats.total})
          </button>
          {selectedKeys.size > 0 && (
            <button
              onClick={deleteSelected}
              disabled={isDeleting}
              className="px-3 py-2 rounded-md text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isDeleting ? "Deleting…" : `Delete (${selectedKeys.size})`}
            </button>
          )}
        </div>
      </div>

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
                      checked={filtered.length > 0 && filtered.every((i) => selectedKeys.has(keyOf(i)))}
                      onChange={selectAllFiltered}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">When</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">From</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Preview</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                      No items.
                    </td>
                  </tr>
                ) : (
                  filtered.map((i) => (
                    <tr
                      key={`${i.source}:${i.id}`}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                      onClick={() => setSelected(i)}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedKeys.has(keyOf(i))}
                          onChange={() => toggleSelected(i)}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200 whitespace-nowrap">
                        {i.createdAt ? new Date(i.createdAt).toLocaleString() : ""}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                        <span className="px-2 py-1 rounded-full text-xs bg-gray-100 dark:bg-gray-700">
                          {i.source === "feedback" ? "Feedback" : "Contact"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                        <div className="font-semibold">{i.name || "Unknown"}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{i.email || ""}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                        {(i.text || "").slice(0, 120)}
                        {(i.text || "").length > 120 ? "…" : ""}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            (i.adminStatus || "open") === "open"
                              ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200"
                              : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200"
                          }`}
                        >
                          {(i.adminStatus || "open") === "open" ? "Open" : "Done"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => {
          if (e.target === e.currentTarget) setSelected(null);
        }}>
          <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex items-start justify-between gap-4">
              <div>
                <h4 className="text-lg font-bold text-gray-900 dark:text-white">
                  {selected.source === "feedback" ? "Feedback submission" : "Contact message"}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {selected.createdAt ? new Date(selected.createdAt).toLocaleString() : ""}
                </p>
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
              <div className="text-sm text-gray-700 dark:text-gray-200">
                <div className="font-semibold">{selected.name || "Unknown"}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{selected.email || ""}</div>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4">
                <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">{selected.text || ""}</pre>
              </div>
            </div>

            <div className="p-5 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Status: {(selected.adminStatus || "open") === "open" ? "Open" : "Done"}
              </div>
              <div className="flex items-center gap-2">
                {(selected.adminStatus || "open") === "open" ? (
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => updateStatus(selected, "done")}
                    className="px-4 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    Mark done
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => updateStatus(selected, "open")}
                    className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    Reopen
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


