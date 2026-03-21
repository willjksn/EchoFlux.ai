import React, { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { useAppContext } from "./AppContext";
import { auth } from "../firebaseConfig";
import type { FanDmThread, FanDmMessage } from "../types";
import VideoCallRoom from "./VideoCallRoom";
import { useAutosizeTextarea } from "../src/hooks/useAutosizeTextarea";
import {
  formatDmBubbleDateTime,
  formatDmDayCalendarKey,
  formatDmDateDividerLabel,
  formatCreatorOutgoingDmBadge,
  formatDmBubbleAuthorLine,
} from "../src/lib/fanHubDisplay";

const VideoIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

/** Vite’s /api proxy often returns plain text on 502 — res.json() hides the real message. */
async function parseApiBody(res: Response): Promise<{ json: Record<string, unknown>; plainTextHint: string | null }> {
  const text = await res.text();
  if (!text.trim()) return { json: {}, plainTextHint: res.statusText || null };
  try {
    return { json: JSON.parse(text) as Record<string, unknown>, plainTextHint: null };
  } catch {
    return { json: {}, plainTextHint: text.slice(0, 500) };
  }
}

const DEV_PROXY_BANNER_KEY = "fanhub-messages-dev-proxy-dismiss";

export const FanHubMessages: React.FC = () => {
  const { user, showToast } = useAppContext();
  const creatorId = user?.id;
  const [threads, setThreads] = useState<FanDmThread[]>([]);
  /** When thread list API fails, empty threads looked like “no conversations”. */
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedThread, setSelectedThread] = useState<FanDmThread | null>(null);
  const [messages, setMessages] = useState<FanDmMessage[]>([]);
  /** Resolved from GET /api/fanDmMessages (users + creators/.../fans merge). */
  const [messageLabels, setMessageLabels] = useState<{ fan: string; creator: string } | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  /** Set when /api/fanDmMessages fails (otherwise empty array looked like “no messages”). */
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [blockingFanId, setBlockingFanId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const { ref: replyTextareaRef } = useAutosizeTextarea(reply);

  // Instant video call state
  const [startingVideo, setStartingVideo] = useState(false);
  const [activeVideoSession, setActiveVideoSession] = useState<{ sessionId: string; creatorId: string } | null>(null);
  const [showDevProxyBanner, setShowDevProxyBanner] = useState(() => {
    if (!import.meta.env.DEV) return false;
    try {
      return sessionStorage.getItem(DEV_PROXY_BANNER_KEY) !== "1";
    } catch {
      return true;
    }
  });

  const fetchThreads = useCallback(async () => {
    if (!creatorId) return;
    setLoading(true);
    setThreadsError(null);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch("/api/fanDmThreads?as=creator", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const { json: data, plainTextHint } = await parseApiBody(res);
      if (!res.ok) {
        const err =
          (data.error as string) ||
          plainTextHint ||
          res.statusText ||
          `HTTP ${res.status}`;
        console.error("fanDmThreads:", res.status, err);
        setThreads([]);
        setThreadsError(err);
        showToast?.(err === "Unauthorized" ? "Sign in again to load messages." : `Messages list failed (${res.status})`, "error");
        return;
      }
      setThreads(Array.isArray(data.threads) ? data.threads : []);
      setThreadsError(null);
    } catch (e) {
      setThreads([]);
      const msg = e instanceof Error ? e.message : "Network error";
      setThreadsError(msg);
      showToast?.("Could not load conversations.", "error");
    } finally {
      setLoading(false);
    }
  }, [creatorId, showToast]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  /** Keep selection in sync when threads load/refresh (avoids stale closure missing first-thread select). */
  useEffect(() => {
    setSelectedThread((prev) => {
      if (threads.length === 0) return null;
      if (prev && threads.some((t) => t.id === prev.id)) return prev;
      return threads[0];
    });
  }, [threads]);

  const fetchMessagesForThread = useCallback(
    async (
      thread: FanDmThread
    ): Promise<{
      messages: FanDmMessage[];
      error: string | null;
      labels: { fan: string; creator: string } | null;
    }> => {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      try {
        const res = await fetch(
          `/api/fanDmMessages?threadId=${encodeURIComponent(thread.id)}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        );
        const { json: data, plainTextHint } = await parseApiBody(res);
        if (!res.ok) {
          const err =
            (data.error as string) ||
            (typeof data.details === "string" ? data.details : null) ||
            plainTextHint ||
            `HTTP ${res.status}`;
          return { messages: [], error: err, labels: null };
        }
        const rawLabels = data.labels as { fan?: unknown; creator?: unknown } | undefined;
        const labels =
          rawLabels &&
          typeof rawLabels.fan === "string" &&
          typeof rawLabels.creator === "string"
            ? { fan: rawLabels.fan, creator: rawLabels.creator }
            : null;
        return {
          messages: Array.isArray(data.messages) ? (data.messages as FanDmMessage[]) : [],
          error: null,
          labels,
        };
      } catch (e) {
        return {
          messages: [],
          error: e instanceof Error ? e.message : "Network error",
          labels: null,
        };
      }
    },
    []
  );

  useEffect(() => {
    if (!selectedThread || !creatorId) {
      setMessages([]);
      setMessagesError(null);
      setMessageLabels(null);
      return;
    }
    let cancelled = false;
    setMessagesLoading(true);
    setMessagesError(null);
    fetchMessagesForThread(selectedThread).then(({ messages: list, error, labels }) => {
      if (!cancelled) {
        setMessages(list);
        setMessagesError(error);
        setMessageLabels(labels);
      }
    }).finally(() => {
      if (!cancelled) setMessagesLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedThread?.id, creatorId, fetchMessagesForThread]);

  useEffect(() => {
    if (messagesLoading) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, messagesLoading, selectedThread?.id]);

  const sendReply = async () => {
    if (!selectedThread || !reply.trim() || !creatorId) return;
    const content = reply.trim();
    setSending(true);
    setReply("");
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch("/api/fanDmSend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          threadId: selectedThread.id,
          content,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Failed to send");
      const { messages: next, error: loadErr, labels: nextLabels } = await fetchMessagesForThread(selectedThread);
      setMessages(next);
      setMessagesError(loadErr);
      setMessageLabels(nextLabels);
      requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }));
      showToast?.("Sent", "success");
    } catch (e) {
      setReply(content);
      showToast?.(e instanceof Error ? e.message : "Failed to send", "error");
    } finally {
      setSending(false);
    }
  };

  const handleBlockFan = async (fanId: string) => {
    if (!window.confirm("Block this fan? They will no longer be able to message or purchase.")) return;
    setBlockingFanId(fanId);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch("/api/blockFan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ fanId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to block");
      }
      showToast?.("Fan blocked", "success");
      setSelectedThread(null);
      fetchThreads();
    } catch (e) {
      showToast?.(e instanceof Error ? e.message : "Failed to block", "error");
    } finally {
      setBlockingFanId(null);
    }
  };

  // Start instant video call with fan
  const handleStartInstantVideo = async (fanId: string, fanDisplayName: string) => {
    if (!creatorId) return;
    
    const durationMinutes = 15; // Default to 15 minutes for instant calls
    
    if (!window.confirm(`Start instant ${durationMinutes}-minute video call with ${fanDisplayName || 'this fan'}? This will use minutes from your quota.`)) {
      return;
    }
    
    setStartingVideo(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error("Please sign in");

      const res = await fetch("/api/liveVideoChat?action=instant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          creatorId,
          fanId,
          fanDisplayName,
          durationMinutes,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || "Failed to start video call");
      }

      // Open video room
      setActiveVideoSession({
        sessionId: (data as { sessionId: string }).sessionId,
        creatorId,
      });
      showToast?.("Video call started! Waiting for fan to join...", "success");
    } catch (e) {
      console.error("Failed to start instant video:", e);
      showToast?.(e instanceof Error ? e.message : "Failed to start video call", "error");
    } finally {
      setStartingVideo(false);
    }
  };

  if (!creatorId) {
    return (
      <div className="p-6 text-center text-gray-500 dark:text-gray-400">
        Sign in to view messages.
      </div>
    );
  }

  // Show video call room if active
  if (activeVideoSession) {
    return (
      <VideoCallRoom
        sessionId={activeVideoSession.sessionId}
        creatorId={activeVideoSession.creatorId}
        onLeave={() => setActiveVideoSession(null)}
        onSessionEnd={(minutesUsed) => {
          showToast?.(`Video call ended. ${minutesUsed} minutes used.`, "success");
          setActiveVideoSession(null);
        }}
      />
    );
  }

  const fanBubbleLine = formatDmBubbleAuthorLine(
    messageLabels?.fan || selectedThread?.otherPartyDisplayName || "Member"
  );
  const creatorBubbleBadge = formatCreatorOutgoingDmBadge(user?.username, user?.name);

  return (
    <div className="max-w-4xl mx-auto p-6 stormij-theme fh-messages-hub">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Messages</h1>
      {import.meta.env.DEV && showDevProxyBanner ? (
        <div className="mb-4 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 px-4 py-3 text-sm text-sky-950 dark:text-sky-100">
          <div className="flex justify-between gap-2 items-start">
            <div>
              <p className="font-semibold">Localhost: Messages need a real `/api` backend</p>
              <p className="mt-1 text-xs opacity-90 leading-relaxed">
                Plain <code className="px-1 rounded bg-black/10 dark:bg-white/10">npm run dev</code> does not run Vercel functions. Create{" "}
                <code className="px-1 rounded bg-black/10 dark:bg-white/10">.env.local</code> in the project root with:
              </p>
              <pre className="mt-2 text-[11px] bg-black/5 dark:bg-white/10 p-2 rounded overflow-x-auto">
                DEV_API_PROXY=https://YOUR-APP.vercel.app
              </pre>
              <p className="mt-2 text-xs opacity-90">
                No trailing slash. Restart the dev server. In the terminal you should see{" "}
                <code className="px-1 rounded bg-black/10 dark:bg-white/10">[vite] API proxy active</code>. See{" "}
                <code className="px-1 rounded bg-black/10 dark:bg-white/10">docs/LOCAL_DEV.md</code>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                try {
                  sessionStorage.setItem(DEV_PROXY_BANNER_KEY, "1");
                } catch {
                  /* ignore */
                }
                setShowDevProxyBanner(false);
              }}
              className="text-xs shrink-0 text-sky-700 dark:text-sky-300 hover:underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      <div className="flex gap-6 flex-col sm:flex-row">
        <div className="w-full sm:w-72 flex-shrink-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
          {loading ? (
            <p className="p-4 text-gray-500 dark:text-gray-400 text-sm">Loading...</p>
          ) : threadsError ? (
            <div className="p-4 text-sm space-y-2">
              <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-amber-900 dark:text-amber-100">
                <p className="font-medium">Conversations couldn’t load</p>
                <p className="mt-1 text-xs opacity-90 break-words">{threadsError}</p>
                {import.meta.env.DEV ? (
                  <p className="mt-2 text-xs opacity-80">
                    Local dev: set{" "}
                    <code className="px-1 rounded bg-black/10 dark:bg-white/10">DEV_API_PROXY=https://your-app.vercel.app</code> in{" "}
                    <code className="px-1 rounded bg-black/10 dark:bg-white/10">.env.local</code> and restart — see{" "}
                    <code className="px-1 rounded bg-black/10 dark:bg-white/10">docs/LOCAL_DEV.md</code>.
                  </p>
                ) : (
                  threadsError.includes("Database unavailable") || threadsError.includes("500") ? (
                    <p className="mt-2 text-xs opacity-80">
                      If this persists on the live site, check Vercel env{" "}
                      <code className="px-1 rounded bg-black/10 dark:bg-white/10">FIREBASE_SERVICE_ACCOUNT_KEY_BASE64</code> and function logs.
                    </p>
                  ) : null
                )}
              </div>
              <button
                type="button"
                onClick={() => void fetchThreads()}
                className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
              >
                Retry
              </button>
            </div>
          ) : threads.length === 0 ? (
            <div className="p-4 text-gray-500 dark:text-gray-400 text-sm space-y-2">
              <p>No conversations yet.</p>
              <p className="text-xs leading-relaxed opacity-90">
                Threads show up here after a fan sends a message from your storefront, or after you migrate/sync DMs.
                Stormij keeps DMs under <code className="text-[11px] bg-gray-100 dark:bg-gray-900 px-1 rounded">conversations</code>; Fan Hub reads{" "}
                <code className="text-[11px] bg-gray-100 dark:bg-gray-900 px-1 rounded">fanDmThreads</code>. Run{" "}
                <code className="text-[11px] bg-gray-100 dark:bg-gray-900 px-1 rounded">npm run sync:fan-dm-threads -- --creator-id=YOUR_UID</code>
                {" "}(add <code className="text-[11px] bg-gray-100 dark:bg-gray-900 px-1 rounded">--source=root</code> if chats are still at the root{" "}
                <code className="text-[11px] bg-gray-100 dark:bg-gray-900 px-1 rounded">conversations</code> collection). On localhost, set{" "}
                <code className="text-[11px] bg-gray-100 dark:bg-gray-900 px-1 rounded">DEV_API_PROXY</code> in{" "}
                <code className="text-[11px] bg-gray-100 dark:bg-gray-900 px-1 rounded">.env.local</code> so{" "}
                <code className="text-[11px] bg-gray-100 dark:bg-gray-900 px-1 rounded">/api/*</code> works.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {threads.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedThread(t)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition ${
                      selectedThread?.id === t.id ? "fh-selected-soft" : ""
                    }`}
                  >
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {t.otherPartyDisplayName || "Member"}
                    </p>
                    {t.lastMessagePreview && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        {t.lastMessagePreview}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden flex flex-col min-h-[320px]">
          {!selectedThread ? (
            <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">
              Select a conversation
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <p className="font-semibold text-gray-900 dark:text-white">
                  {selectedThread.otherPartyDisplayName || "Member"}
                </p>
                <div className="flex items-center gap-3">
                  {/* Start Video Call Button */}
                  <button
                    type="button"
                    onClick={() =>
                      handleStartInstantVideo(selectedThread.fanId, selectedThread.otherPartyDisplayName || "Member")
                    }
                    disabled={startingVideo}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white text-sm font-medium hover:from-fuchsia-600 hover:to-pink-600 disabled:opacity-50 transition"
                    title="Start instant video call"
                  >
                    <VideoIcon />
                    <span>{startingVideo ? "Starting..." : "Video"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBlockFan(selectedThread.fanId)}
                    disabled={!!blockingFanId}
                    className="text-sm text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                  >
                    {blockingFanId === selectedThread.fanId ? "Blocking…" : "Block fan"}
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {messagesLoading ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Loading messages…</p>
                ) : messagesError ? (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
                    <p className="font-medium">Messages couldn’t load</p>
                    <p className="mt-1 text-xs opacity-90">{messagesError}</p>
                    {import.meta.env.DEV && (
                      <p className="mt-2 text-xs opacity-80">
                        Local dev: add{" "}
                        <code className="px-1 rounded bg-black/10 dark:bg-white/10">DEV_API_PROXY=https://your-app.vercel.app</code> to{" "}
                        <code className="px-1 rounded bg-black/10 dark:bg-white/10">.env.local</code> — see{" "}
                        <code className="px-1 rounded bg-black/10 dark:bg-white/10">docs/LOCAL_DEV.md</code>.
                      </p>
                    )}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center min-h-[180px] text-center px-4 text-gray-500 dark:text-gray-400 text-sm">
                    <p>No messages in this conversation yet.</p>
                    <p className="mt-2 text-xs max-w-sm">
                      Send a reply below, or if history is missing after a migration, confirm threads and messages exist in Firestore under{" "}
                      <code className="text-[11px] bg-gray-100 dark:bg-gray-800 px-1 rounded">fanDmThreads</code>.
                    </p>
                  </div>
                ) : (
                  messages.map((m, i) => {
                    const isMe = m.senderId === creatorId;
                    const prev = messages[i - 1];
                    const showDayDivider =
                      !prev || formatDmDayCalendarKey(prev.createdAt) !== formatDmDayCalendarKey(m.createdAt);
                    const dividerLabel = formatDmDateDividerLabel(m.createdAt);
                    const dateTimeStr = formatDmBubbleDateTime(m.createdAt);
                    return (
                      <Fragment key={m.id}>
                        {showDayDivider && dividerLabel ? (
                          <div className="fh-dm-date-divider" role="separator">
                            <span className="fh-dm-date-divider__line" aria-hidden />
                            <span className="fh-dm-date-divider__label">{dividerLabel}</span>
                            <span className="fh-dm-date-divider__line" aria-hidden />
                          </div>
                        ) : null}
                        <div className={`fh-dm-row ${isMe ? "fh-dm-row--me" : "fh-dm-row--them"}`}>
                          <div className="flex flex-col items-stretch max-w-[85%] sm:max-w-[80%]">
                            <div className={`fh-dm-bubble ${isMe ? "fh-dm-bubble--me" : "fh-dm-bubble--them"}`}>
                              <div className="fh-dm-bubble__head">
                                {isMe ? creatorBubbleBadge : fanBubbleLine}
                              </div>
                              <div className="fh-dm-bubble__body">
                                {m.content?.trim() ? (
                                  m.content
                                ) : (
                                  <span className="italic opacity-70">(empty message)</span>
                                )}
                              </div>
                              {dateTimeStr ? (
                                <div className={`fh-dm-bubble__foot ${isMe ? "fh-dm-bubble__foot--me" : ""}`}>
                                  {dateTimeStr}
                                  {isMe ? (
                                    m.read ? (
                                      <span className="fh-dm-bubble__receipt" title="Fan has seen this message">
                                        {" "}
                                        · Read
                                      </span>
                                    ) : (
                                      <span
                                        className="fh-dm-bubble__receipt fh-dm-bubble__receipt--unread"
                                        title="Fan has not opened this thread since you sent this"
                                      >
                                        {" "}
                                        · Unread
                                      </span>
                                    )
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </Fragment>
                    );
                  })
                )}
                <div ref={messagesEndRef} aria-hidden />
              </div>
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2 items-end">
                <textarea
                  ref={replyTextareaRef}
                  rows={1}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendReply();
                    }
                  }}
                  placeholder="Reply… (Shift+Enter for newline)"
                  className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm resize-none min-h-[40px] max-h-[160px] leading-snug"
                />
                <button
                  type="button"
                  onClick={sendReply}
                  disabled={sending || !reply.trim()}
                  className="px-4 py-2 fh-btn text-sm font-medium disabled:opacity-50"
                >
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
