import React, { useCallback, useEffect, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { ECHOFLUX_APP_ACCENT_HEX } from "../constants";

export type SupportThreadRow = {
  id: string;
  title: string;
  status: "open" | "closed";
  createdAt?: string;
  updatedAt?: string;
  lastMessage?: string;
  /** Server-set: label for staff replies in this thread (e.g. witme.io vs EchoFlux). */
  memberFacingReplyBrand?: string;
};

export type SupportMessageRow = {
  id: string;
  senderType: "fan" | "support";
  content: string;
  createdAt?: string;
};

/** Firestore uses `done` on IT tickets; UI uses closed vs open. */
export function supportThreadUiStatusFromFirestore(data: Record<string, unknown>): "open" | "closed" {
  const raw = typeof data.status === "string" ? data.status.trim().toLowerCase() : "";
  if (raw === "closed" || raw === "done") return "closed";
  return "open";
}

export interface SupportThreadsPanelProps {
  /** Theme accent (fan hub = creator primary; creator app = EchoFlux blue). */
  accentHex?: string;
  /** When set (e.g. after submitting a ticket), selects this thread. */
  selectThreadId?: string | null;
  showToast: (message: string, type: "success" | "error" | "info") => void;
  /** Optional Help / Get in touch control */
  onOpenHelp?: () => void;
  helpButtonLabel?: string;
  heading?: string;
  description?: React.ReactNode;
  emptyStateHint?: React.ReactNode;
  replyPlaceholder?: string;
  youLabel?: string;
  /** Used when a thread has no stored `memberFacingReplyBrand` (older tickets). */
  supportLabel?: string;
  /** Fan profile stats card — notified when thread list updates */
  onThreadsChange?: (threads: SupportThreadRow[]) => void;
}

export const SupportThreadsPanel: React.FC<SupportThreadsPanelProps> = ({
  accentHex = ECHOFLUX_APP_ACCENT_HEX,
  selectThreadId,
  showToast,
  onOpenHelp,
  helpButtonLabel = "Help",
  heading = "Support threads",
  description,
  emptyStateHint,
  replyPlaceholder = "Reply to EchoFlux support…",
  youLabel = "You",
  supportLabel = "EchoFlux",
  onThreadsChange,
}) => {
  const [supportThreads, setSupportThreads] = useState<SupportThreadRow[]>([]);
  const [supportThreadId, setSupportThreadId] = useState<string | null>(null);
  const [supportMessages, setSupportMessages] = useState<SupportMessageRow[]>([]);
  const [supportReplyDraft, setSupportReplyDraft] = useState("");
  const [supportSending, setSupportSending] = useState(false);

  useEffect(() => {
    if (!auth.currentUser?.uid || !db) {
      setSupportThreads([]);
      setSupportThreadId(null);
      onThreadsChange?.([]);
      return;
    }
    const uid = auth.currentUser.uid;
    const q = query(
      collection(db, "users", uid, "support_threads"),
      orderBy("updatedAt", "desc"),
      limit(25),
    );
    return onSnapshot(
      q,
      (snap) => {
        const next: SupportThreadRow[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            title: typeof data.title === "string" && data.title.trim() ? data.title.trim() : "Problem report",
            status: supportThreadUiStatusFromFirestore(data),
            createdAt: typeof data.createdAt === "string" ? data.createdAt : undefined,
            updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : undefined,
            lastMessage: typeof data.lastMessage === "string" ? data.lastMessage : undefined,
            memberFacingReplyBrand:
              typeof data.memberFacingReplyBrand === "string" && data.memberFacingReplyBrand.trim()
                ? data.memberFacingReplyBrand.trim()
                : undefined,
          };
        });
        setSupportThreads(next);
        setSupportThreadId((prev) => prev ?? next[0]?.id ?? null);
        onThreadsChange?.(next);
      },
      () => {
        setSupportThreads([]);
        onThreadsChange?.([]);
      },
    );
  }, [onThreadsChange]);

  useEffect(() => {
    if (selectThreadId && typeof selectThreadId === "string") {
      setSupportThreadId(selectThreadId);
    }
  }, [selectThreadId]);

  useEffect(() => {
    if (!auth.currentUser?.uid || !supportThreadId || !db) {
      setSupportMessages([]);
      return;
    }
    const uid = auth.currentUser.uid;
    const q = query(
      collection(db, "users", uid, "support_threads", supportThreadId, "messages"),
      orderBy("createdAt", "asc"),
      limit(200),
    );
    return onSnapshot(
      q,
      (snap) => {
        const msgs: SupportMessageRow[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const createdAt =
            typeof data.createdAt === "string"
              ? data.createdAt
              : data.createdAt && typeof (data.createdAt as { toDate?: () => Date }).toDate === "function"
                ? (data.createdAt as { toDate: () => Date }).toDate().toISOString()
                : undefined;
          return {
            id: d.id,
            senderType: data.senderType === "support" ? "support" : "fan",
            content: typeof data.content === "string" ? data.content : "",
            createdAt,
          };
        });
        setSupportMessages(msgs);
      },
      () => setSupportMessages([]),
    );
  }, [supportThreadId]);

  const sendSupportReply = useCallback(async () => {
    const content = supportReplyDraft.trim();
    if (!content || !auth.currentUser?.uid || !supportThreadId) return;
    setSupportSending(true);
    try {
      const token = await auth.currentUser.getIdToken(true);
      const res = await fetch("/api/supportTicketReply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ticketId: supportThreadId, content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Failed to send support reply");
      setSupportReplyDraft("");
      showToast("Reply sent to support.", "success");
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "Failed to send support reply", "error");
    } finally {
      setSupportSending(false);
    }
  }, [showToast, supportReplyDraft, supportThreadId]);

  const getSupportMessageMainText = useCallback((content: string): string => {
    const [main] = content.split("\n\n---\n");
    return (main || content).trim();
  }, []);

  const getSupportMessageDiagnostics = useCallback((content: string): string | null => {
    const parts = content.split("\n\n---\n");
    if (parts.length < 2) return null;
    const diagnostics = parts.slice(1).join("\n\n---\n").trim();
    return diagnostics || null;
  }, []);

  const accentStroke = (pct: number) => `color-mix(in srgb, ${accentHex} ${pct}%, transparent)`;
  const accentFill = (pct: number, onto: string) => `color-mix(in srgb, ${accentHex} ${pct}%, ${onto})`;

  const activeThread = supportThreadId ? supportThreads.find((t) => t.id === supportThreadId) : undefined;
  const resolvedSupportLabel =
    activeThread?.memberFacingReplyBrand?.trim() || supportLabel;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-xl font-bold mb-0 text-gray-900 dark:text-white">{heading}</h3>
        {onOpenHelp ? (
          <button
            type="button"
            className="px-4 py-2 rounded-lg text-sm font-semibold border transition-colors shrink-0"
            style={{
              color: accentHex,
              borderColor: accentStroke(40),
              backgroundColor: accentFill(14, "rgb(243 244 246)"),
            }}
            onClick={onOpenHelp}
          >
            {helpButtonLabel}
          </button>
        ) : null}
      </div>
      {description ? <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">{description}</div> : null}

      {supportThreads.length === 0 ? (
        <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/60 p-4 text-sm text-gray-700 dark:text-gray-300">
          {emptyStateHint ?? (
            <>
              No threads yet. Use <strong className="font-semibold">{helpButtonLabel}</strong> to contact support.
            </>
          )}
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-4">
          <div
            className="rounded-xl border bg-white dark:bg-gray-800 p-2 shadow-sm"
            style={{ borderColor: accentStroke(24) }}
          >
            <div className="space-y-2 max-h-[280px] overflow-auto">
              {supportThreads.map((thread) => {
                const active = supportThreadId === thread.id;
                const preview = getSupportMessageMainText(thread.lastMessage || "");
                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => setSupportThreadId(thread.id)}
                    className="w-full text-left rounded-lg border px-3 py-2 transition-colors"
                    style={{
                      borderColor: active ? accentStroke(58) : accentStroke(20),
                      backgroundColor: active ? accentFill(12, "rgb(255 255 255)") : "transparent",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold m-0 truncate text-gray-900 dark:text-white">{thread.title}</p>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full border shrink-0"
                        style={{
                          borderColor:
                            thread.status === "closed"
                              ? "color-mix(in srgb, #64748b 45%, transparent)"
                              : "color-mix(in srgb, #059669 45%, transparent)",
                          color: thread.status === "closed" ? "#64748b" : "#059669",
                          backgroundColor:
                            thread.status === "closed"
                              ? "color-mix(in srgb, #64748b 10%, transparent)"
                              : "color-mix(in srgb, #059669 10%, transparent)",
                        }}
                      >
                        {thread.status === "closed" ? "Closed" : "Open"}
                      </span>
                    </div>
                    {preview ? (
                      <p className="text-xs m-0 mt-1 opacity-85 line-clamp-2 text-gray-600 dark:text-gray-400">{preview}</p>
                    ) : null}
                    <p className="text-[11px] m-0 mt-1 opacity-75 text-gray-500 dark:text-gray-500">
                      {thread.updatedAt ? new Date(thread.updatedAt).toLocaleString() : "No date"}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="rounded-xl border bg-white dark:bg-gray-800 shadow-sm" style={{ borderColor: accentStroke(24) }}>
            <div className="p-3 space-y-2 max-h-[280px] overflow-auto">
              {supportMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="rounded-lg border px-3 py-2"
                  style={{
                    borderColor:
                      msg.senderType === "support"
                        ? "color-mix(in srgb, #475569 32%, transparent)"
                        : accentStroke(30),
                    backgroundColor:
                      msg.senderType === "support"
                        ? "color-mix(in srgb, #475569 8%, white)"
                        : accentFill(10, "rgb(255 255 255)"),
                  }}
                >
                  <p className="text-xs font-semibold m-0 text-gray-800 dark:text-gray-200">
                    {msg.senderType === "support" ? resolvedSupportLabel : youLabel}
                  </p>
                  <p className="text-sm whitespace-pre-wrap m-0 mt-1 text-gray-800 dark:text-gray-200">
                    {getSupportMessageMainText(msg.content)}
                  </p>
                  {getSupportMessageDiagnostics(msg.content) ? (
                    <details className="mt-1">
                      <summary className="text-[11px] cursor-pointer opacity-80 text-gray-600 dark:text-gray-400">
                        Diagnostics
                      </summary>
                      <pre className="text-[11px] whitespace-pre-wrap mt-1 opacity-80 text-gray-600 dark:text-gray-400">
                        {getSupportMessageDiagnostics(msg.content)}
                      </pre>
                    </details>
                  ) : null}
                  <p className="text-[11px] opacity-75 m-0 mt-1 text-gray-500 dark:text-gray-500">
                    {msg.createdAt ? new Date(msg.createdAt).toLocaleString() : ""}
                  </p>
                </div>
              ))}
              {supportThreadId && supportMessages.length === 0 ? (
                <p className="text-sm opacity-75 text-gray-600 dark:text-gray-400">No messages in this thread yet.</p>
              ) : null}
            </div>
            {supportThreadId ? (
              <div className="p-3 pt-0 flex gap-2 border-t border-gray-200 dark:border-gray-700">
                <textarea
                  rows={2}
                  value={supportReplyDraft}
                  onChange={(e) => setSupportReplyDraft(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  style={{ borderColor: accentStroke(18) }}
                  placeholder={replyPlaceholder}
                />
                <button
                  type="button"
                  className="self-end shrink-0 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: accentHex }}
                  disabled={supportSending || !supportReplyDraft.trim()}
                  onClick={() => void sendSupportReply()}
                >
                  {supportSending ? "Sending…" : "Send"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
