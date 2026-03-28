import React, { useMemo, useState } from "react";
import { auth } from "../firebaseConfig";
import { useAppContext } from "./AppContext";

type TicketStatus = "open" | "done";
type ReporterKind = "fan" | "creator";

type ITTicket = {
  id: string;
  creatorId: string | null;
  creatorHandle: string | null;
  creatorDisplayName: string | null;
  reporterUid: string | null;
  reporterEmail: string | null;
  reporterName: string | null;
  reporterKind: ReporterKind;
  reporterRole: string;
  status: TicketStatus;
  preview: string;
  createdAt: string | null;
  updatedAt: string | null;
  lastMessageAt: string | null;
  messageCount: number;
};

export const AdminITSupportPanel: React.FC = () => {
  const { showToast } = useAppContext();
  const [tickets, setTickets] = useState<ITTicket[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | TicketStatus>("open");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadTickets = async () => {
    setIsLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      if (!token) throw new Error("Not authenticated");
      const qs = new URLSearchParams();
      qs.set("limit", "400");
      qs.set("status", statusFilter);
      const res = await fetch(`/api/adminListSupportTickets?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to load IT support tickets");
      setTickets(Array.isArray(data?.items) ? (data.items as ITTicket[]) : []);
    } catch (error: any) {
      showToast(error?.message || "Failed to load IT support tickets", "error");
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    void loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const byCreator = useMemo(() => {
    const groups = new Map<string, { label: string; items: ITTicket[] }>();
    for (const t of tickets) {
      const key = t.creatorId || "unassigned";
      const label =
        t.creatorDisplayName ||
        (t.creatorHandle ? `@${t.creatorHandle.replace(/^@/, "")}` : "Unassigned / Platform level");
      const entry = groups.get(key) || { label, items: [] };
      entry.items.push(t);
      groups.set(key, entry);
    }
    return Array.from(groups.entries()).map(([key, value]) => ({ key, ...value }));
  }, [tickets]);

  const updateStatus = async (ticketId: string, status: TicketStatus) => {
    setUpdatingId(ticketId);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      if (!token) throw new Error("Not authenticated");
      const res = await fetch("/api/adminUpdateSupportTicket", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ticketId, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to update ticket");
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, status } : t)));
    } catch (error: any) {
      showToast(error?.message || "Failed to update ticket", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">IT Support</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Fan and creator problem reports, grouped by creator.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter("open")}
            className={`px-3 py-2 rounded-md text-sm font-semibold ${
              statusFilter === "open"
                ? "bg-primary-600 text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            }`}
          >
            Open
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("done")}
            className={`px-3 py-2 rounded-md text-sm font-semibold ${
              statusFilter === "done"
                ? "bg-primary-600 text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            }`}
          >
            Done
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-2 rounded-md text-sm font-semibold ${
              statusFilter === "all"
                ? "bg-primary-600 text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => void loadTickets()}
            className="px-3 py-2 rounded-md text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
          >
            Refresh
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading tickets…</div>
      ) : byCreator.length === 0 ? (
        <div className="text-sm text-gray-500 dark:text-gray-400">No support tickets found.</div>
      ) : (
        <div className="space-y-4">
          {byCreator.map((group) => (
            <div key={group.key} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-semibold text-gray-900 dark:text-white">{group.label}</h4>
                  <span className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                    {group.items.length} ticket{group.items.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {group.items.map((t) => (
                  <div key={t.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full ${
                            t.reporterKind === "creator"
                              ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-200"
                              : "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200"
                          }`}
                        >
                          {t.reporterKind === "creator" ? "Creator issue" : "Fan issue"}
                        </span>
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full ${
                            t.status === "open"
                              ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200"
                              : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200"
                          }`}
                        >
                          {t.status === "open" ? "Open" : "Done"}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {t.updatedAt ? new Date(t.updatedAt).toLocaleString() : ""}
                      </div>
                    </div>
                    <div className="mt-1 text-sm text-gray-900 dark:text-gray-100">{t.preview}</div>
                    <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                      From: {t.reporterName || "Unknown"} {t.reporterEmail ? `(${t.reporterEmail})` : ""}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {t.status === "open" ? (
                        <button
                          type="button"
                          disabled={updatingId === t.id}
                          onClick={() => void updateStatus(t.id, "done")}
                          className="px-3 py-1.5 rounded-md text-xs font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                        >
                          Mark done
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={updatingId === t.id}
                          onClick={() => void updateStatus(t.id, "open")}
                          className="px-3 py-1.5 rounded-md text-xs font-semibold bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 disabled:opacity-50"
                        >
                          Reopen
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

