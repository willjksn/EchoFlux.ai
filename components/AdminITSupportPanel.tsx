import React, { useCallback, useMemo, useState } from "react";
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

type TicketMessageRow = {
  id: string;
  senderKind: string;
  senderName: string;
  content: string;
  createdAt: string | null;
};

function buildTicketEmailHeader(ticket: ITTicket, messages: TicketMessageRow[]): string {
  const creatorLine =
    ticket.creatorDisplayName ||
    (ticket.creatorHandle ? `@${ticket.creatorHandle.replace(/^@/, "")}` : "Platform / unassigned");
  const thread =
    messages.length > 0
      ? messages
          .map((m) => {
            const who = m.senderName?.trim() || (m.senderKind === "fan" ? "Reporter" : m.senderKind || "User");
            return `${who}: ${m.content}`;
          })
          .join("\n\n")
      : ticket.preview || "(no thread text)";
  return (
    `EchoFlux support — Ticket ${ticket.id}\n` +
    `Creator / storefront: ${creatorLine}\n` +
    `Reporter: ${ticket.reporterName || "Unknown"} (${ticket.reporterKind})\n` +
    `Opened: ${ticket.createdAt ? new Date(ticket.createdAt).toLocaleString() : "—"}\n\n` +
    `--- Their report / thread ---\n${thread}\n\n` +
    `--- Your reply ---\n`
  );
}

export const AdminITSupportPanel: React.FC = () => {
  const { showToast } = useAppContext();
  const [tickets, setTickets] = useState<ITTicket[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | TicketStatus>("open");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [emailTicket, setEmailTicket] = useState<ITTicket | null>(null);
  const [emailMessages, setEmailMessages] = useState<TicketMessageRow[]>([]);
  const [emailDetailLoading, setEmailDetailLoading] = useState(false);
  const [emailBody, setEmailBody] = useState("");
  const [emailAiLoading, setEmailAiLoading] = useState(false);
  const [emailSending, setEmailSending] = useState(false);

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

  const openEmailModal = useCallback(
    async (t: ITTicket) => {
      setEmailTicket(t);
      setEmailBody("");
      setEmailMessages([]);
      setEmailDetailLoading(true);
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
        if (!token) throw new Error("Not authenticated");
        const res = await fetch(`/api/adminSupportTicketEmailAssist?ticketId=${encodeURIComponent(t.id)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error || "Failed to load ticket");
        const msgs = Array.isArray((data as { messages?: TicketMessageRow[] }).messages)
          ? (data as { messages: TicketMessageRow[] }).messages
          : [];
        setEmailMessages(msgs);
      } catch (e: unknown) {
        showToast(e instanceof Error ? e.message : "Failed to load ticket thread", "error");
        setEmailTicket(null);
      } finally {
        setEmailDetailLoading(false);
      }
    },
    [showToast]
  );

  const closeEmailModal = useCallback(() => {
    setEmailTicket(null);
    setEmailMessages([]);
    setEmailBody("");
    setEmailDetailLoading(false);
    setEmailAiLoading(false);
    setEmailSending(false);
  }, []);

  const generateEmailDraft = useCallback(async () => {
    if (!emailTicket) return;
    setEmailAiLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      if (!token) throw new Error("Not authenticated");
      const res = await fetch("/api/adminSupportTicketEmailAssist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ticketId: emailTicket.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !(data as { success?: boolean }).success) {
        throw new Error((data as { error?: string }).error || "Could not generate draft");
      }
      const draft = (data as { suggestedBody?: string }).suggestedBody?.trim() || "";
      if (!draft) throw new Error("Empty draft from AI");
      setEmailBody(draft);
      showToast("Draft inserted — review before sending.", "success");
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "AI draft failed", "error");
    } finally {
      setEmailAiLoading(false);
    }
  }, [emailTicket, showToast]);

  const sendSupportEmail = useCallback(async () => {
    if (!emailTicket) return;
    const reply = emailBody.trim();
    if (!reply) {
      showToast("Write a reply before sending.", "error");
      return;
    }
    setEmailSending(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      if (!token) throw new Error("Not authenticated");
      const res = await fetch("/api/adminSendSupportTicketEmail", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ticketId: emailTicket.id, replyText: reply }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const d = data as { error?: string; details?: string };
        const base = d.error || "Failed to send email";
        throw new Error(d.details ? `${base}: ${d.details}` : base);
      }
      if (!(data as { success?: boolean }).success) {
        const d = data as { error?: string; details?: string };
        const base = d.error || "Failed to send email";
        throw new Error(d.details ? `${base}: ${d.details}` : base);
      }
      showToast("Email sent. It appears in Email Center → History.", "success");
      closeEmailModal();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to send email";
      showToast(msg, "error");
    } finally {
      setEmailSending(false);
    }
  }, [emailTicket, emailBody, showToast, closeEmailModal]);

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
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void openEmailModal(t)}
                        className="px-3 py-1.5 rounded-md text-xs font-semibold bg-sky-600 text-white hover:bg-sky-700 shadow-sm"
                      >
                        Email reporter
                      </button>
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

      {emailTicket && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="it-email-modal-title"
        >
          <div className="w-full max-w-lg rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl max-h-[90vh] flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2">
              <h4 id="it-email-modal-title" className="font-semibold text-gray-900 dark:text-white">
                Email reporter
              </h4>
              <button
                type="button"
                onClick={closeEmailModal}
                className="text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Close
              </button>
            </div>
            <div className="px-4 py-3 space-y-3 overflow-y-auto flex-1 text-sm">
              {emailDetailLoading ? (
                <p className="text-gray-500 dark:text-gray-400">Loading thread…</p>
              ) : (
                <>
                  <div className="text-gray-700 dark:text-gray-300">
                    <span className="text-gray-500 dark:text-gray-400">To:</span>{" "}
                    {emailTicket.reporterEmail || (
                      <span className="text-amber-600 dark:text-amber-400">No email — cannot use mail client</span>
                    )}
                  </div>
                  <div className="text-gray-700 dark:text-gray-300">
                    <span className="text-gray-500 dark:text-gray-400">Subject:</span> Re: EchoFlux support (ticket{" "}
                    {emailTicket.id.slice(0, 8)}…)
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                      Ticket context (included above your reply in the email)
                    </p>
                    <pre className="text-[11px] leading-relaxed whitespace-pre-wrap rounded-lg bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 p-2 max-h-32 overflow-y-auto text-gray-800 dark:text-gray-200">
                      {buildTicketEmailHeader(emailTicket, emailMessages).replace(/\n--- Your reply ---\n$/, "")}
                    </pre>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={emailAiLoading || emailDetailLoading}
                      onClick={() => void generateEmailDraft()}
                      className="px-3 py-1.5 rounded-md text-xs font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
                    >
                      {emailAiLoading ? "Generating…" : "AI draft reply"}
                    </button>
                  </div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400" htmlFor="it-email-body">
                    Your reply (body)
                  </label>
                  <textarea
                    id="it-email-body"
                    rows={8}
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    placeholder="Write your resolution here, or click AI draft reply…"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 p-2 text-sm"
                  />
                </>
              )}
            </div>
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeEmailModal}
                className="px-3 py-2 rounded-md text-sm bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  !emailTicket.reporterEmail?.trim() ||
                  emailDetailLoading ||
                  emailSending ||
                  !emailBody.trim()
                }
                onClick={() => void sendSupportEmail()}
                className="px-3 py-2 rounded-md text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {emailSending ? "Sending…" : "Send email"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

