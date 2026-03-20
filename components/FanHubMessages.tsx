import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAppContext } from "./AppContext";
import { auth } from "../firebaseConfig";
import type { FanDmThread, FanDmMessage } from "../types";
import VideoCallRoom from "./VideoCallRoom";
import { useAutosizeTextarea } from "../src/hooks/useAutosizeTextarea";
import { formatDmShortTime } from "../src/lib/fanHubDisplay";

const VideoIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

export const FanHubMessages: React.FC = () => {
  const { user, showToast } = useAppContext();
  const creatorId = user?.id;
  const [threads, setThreads] = useState<FanDmThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedThread, setSelectedThread] = useState<FanDmThread | null>(null);
  const [messages, setMessages] = useState<FanDmMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [blockingFanId, setBlockingFanId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const { ref: replyTextareaRef } = useAutosizeTextarea(reply);

  // Instant video call state
  const [startingVideo, setStartingVideo] = useState(false);
  const [activeVideoSession, setActiveVideoSession] = useState<{ sessionId: string; creatorId: string } | null>(null);

  const fetchThreads = useCallback(async () => {
    if (!creatorId) return;
    setLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const res = await fetch("/api/fanDmThreads?as=creator", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      setThreads(Array.isArray(data.threads) ? data.threads : []);
      if (!selectedThread && data.threads?.length) {
        setSelectedThread(data.threads[0]);
      }
    } catch {
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, [creatorId]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  const fetchMessagesForThread = useCallback(
    async (thread: FanDmThread): Promise<FanDmMessage[]> => {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const res = await fetch(
        `/api/fanDmMessages?threadId=${encodeURIComponent(thread.id)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      const data = await res.json().catch(() => ({}));
      return Array.isArray(data.messages) ? data.messages : [];
    },
    []
  );

  useEffect(() => {
    if (!selectedThread || !creatorId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setMessagesLoading(true);
    fetchMessagesForThread(selectedThread).then((list) => {
      if (!cancelled) setMessages(list);
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
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
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
      const next = await fetchMessagesForThread(selectedThread);
      setMessages(next);
      requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }));
      showToast?.("Sent", "success");
    } catch (e) {
      setReply(content);
      showToast?.(e instanceof Error ? e.message : "Failed to send", "error");
    } finally {
      setSending(false);
    }
  };

  const handleReport = async (messageId: string) => {
    if (!selectedThread) return;
    setReportingId(messageId);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const res = await fetch("/api/reportMessage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          threadId: selectedThread.id,
          messageId,
          reason: "Reported by creator",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to report");
      }
      showToast?.("Report submitted for review", "success");
    } catch (e) {
      showToast?.(e instanceof Error ? e.message : "Failed to report", "error");
    } finally {
      setReportingId(null);
    }
  };

  const handleBlockFan = async (fanId: string) => {
    if (!window.confirm("Block this fan? They will no longer be able to message or purchase.")) return;
    setBlockingFanId(fanId);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
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
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
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

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Messages</h1>
      <div className="flex gap-6 flex-col sm:flex-row">
        <div className="w-full sm:w-72 flex-shrink-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
          {loading ? (
            <p className="p-4 text-gray-500 dark:text-gray-400 text-sm">Loading...</p>
          ) : threads.length === 0 ? (
            <p className="p-4 text-gray-500 dark:text-gray-400 text-sm">No conversations yet.</p>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {threads.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedThread(t)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition ${
                      selectedThread?.id === t.id ? "bg-primary-50 dark:bg-primary-900/20" : ""
                    }`}
                  >
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {t.otherPartyDisplayName || "Fan"}
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
                  {selectedThread.otherPartyDisplayName || "Fan"}
                </p>
                <div className="flex items-center gap-3">
                  {/* Start Video Call Button */}
                  <button
                    type="button"
                    onClick={() => handleStartInstantVideo(selectedThread.fanId, selectedThread.otherPartyDisplayName || "Fan")}
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
                  <p className="text-sm text-gray-500">Loading...</p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.senderId === creatorId ? "justify-end" : "justify-start"}`}
                    >
                      <div className="flex flex-col max-w-[80%]">
                        <span
                          className={`inline-block px-3 py-2 rounded-lg text-sm ${
                            m.senderId === creatorId
                              ? "bg-primary-600 text-white"
                              : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white"
                          }`}
                        >
                          {m.content}
                        </span>
                        {formatDmShortTime(m.createdAt) && (
                          <span
                            className={`text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 px-1 ${
                              m.senderId === creatorId ? "self-end" : "self-start"
                            }`}
                          >
                            {formatDmShortTime(m.createdAt)}
                          </span>
                        )}
                        {m.senderId !== creatorId && (
                          <button
                            type="button"
                            onClick={() => handleReport(m.id)}
                            disabled={!!reportingId || !!m.reported}
                            className="text-xs text-amber-600 dark:text-amber-400 hover:underline mt-1 self-start disabled:opacity-50"
                          >
                            {m.reported ? "Reported" : reportingId === m.id ? "Reporting…" : "Report"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))
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
                  className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
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
