import React, { useState, useEffect, useCallback, useRef, Fragment, useMemo } from "react";
import { useAppContext } from "./AppContext";
import { auth, db } from "../firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import type { FanDmThread, FanDmMessage } from "../types";
import VideoCallRoom from "./VideoCallRoom";
import { useAutosizeTextarea } from "../src/hooks/useAutosizeTextarea";
import {
  formatDmShortTime,
  formatDmDayCalendarKey,
  formatDmDateDividerLabel,
  formatDmBubbleAuthorLine,
  formatDmRelativeShort,
  formatCreatorDmBubblePrimaryLine,
  formatCreatorDmBubbleSecondaryLine,
} from "../src/lib/fanHubDisplay";
import { uploadFanDmAttachment, type DmAttachmentKind } from "../src/lib/dmMediaUpload";
import {
  AUDIO_RECORDER_TIMESLICE_MS,
  createAudioMediaRecorder,
  effectiveBlobType,
  fileExtensionForAudioMime,
  normalizeVoiceRecordingFileType,
  stopMediaRecorderSafe,
} from "../src/lib/browserMediaRecording";
import { AudioLevelMeter } from "./AudioLevelMeter";
import { RecordingDurationLabel } from "./RecordingDurationLabel";
import { DmAudioPlayer } from "./DmAudioPlayer";
import { inferIsAudioFromUrl } from "../src/lib/mediaUrlInfer";
import { usePremiumStudioTab } from "./PremiumStudioLayout";

const VideoIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

const TrashThreadIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const TrashMessageIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const MailboxIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);

const PhotoIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const MicIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const MoreVerticalIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="12" cy="5" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="12" cy="19" r="1.5" />
  </svg>
);

/** Horizontal ⋮ for thread row (per Instagram-style inbox). */
const MoreHorizontalIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="5" cy="12" r="1.75" />
    <circle cx="12" cy="12" r="1.75" />
    <circle cx="19" cy="12" r="1.75" />
  </svg>
);

function sortCreatorDmThreads(list: FanDmThread[]): FanDmThread[] {
  return [...list].sort((a, b) => {
    const pA = a.creatorInboxPinned ? 1 : 0;
    const pB = b.creatorInboxPinned ? 1 : 0;
    if (pA !== pB) return pB - pA;
    const tA = a.lastMessageAt || "";
    const tB = b.lastMessageAt || "";
    return tB.localeCompare(tA);
  });
}

const MenuIconMarkUnread = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
    <circle cx="18" cy="8" r="2.5" fill="currentColor" stroke="none" />
  </svg>
);

const MenuIconPin = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M12 17v5M9 22h6M5 9a7 7 0 0 1 14 0c0 4-3 6-7 6s-7-2-7-6z" />
  </svg>
);

const MenuIconMute = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M18 8.5A6.5 6.5 0 0 1 9.5 17" />
    <path d="M6 10H4v4h2l4 3V7L6 10z" />
    <line x1="2" y1="2" x2="22" y2="22" strokeLinecap="round" />
  </svg>
);

type MemberRow = { fanId: string; label: string };

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
  const premiumTab = usePremiumStudioTab();
  /** Must match message `senderId` from API (Firebase Auth uid). */
  const creatorId = auth.currentUser?.uid ?? user?.id;
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
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const { ref: replyTextareaRef } = useAutosizeTextarea(reply);
  const [threadSearchQuery, setThreadSearchQuery] = useState("");
  const [listTab, setListTab] = useState<"all" | "requests">("all");
  const [showNewDmModal, setShowNewDmModal] = useState(false);
  const [newDmSearch, setNewDmSearch] = useState("");
  const [newDmMembers, setNewDmMembers] = useState<MemberRow[]>([]);
  const [newDmLoading, setNewDmLoading] = useState(false);
  const [ensuringThreadFanId, setEnsuringThreadFanId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceMeterStream, setVoiceMeterStream] = useState<MediaStream | null>(null);
  const [voiceMeterKey, setVoiceMeterKey] = useState(0);
  const [threadRowMenuOpenId, setThreadRowMenuOpenId] = useState<string | null>(null);
  const [inboxActionThreadId, setInboxActionThreadId] = useState<string | null>(null);
  /** Firestore `creators/{id}` — Auth `user` often lacks displayName for bubble headers. */
  const [creatorBubbleProfile, setCreatorBubbleProfile] = useState<{
    displayName?: string;
    handle?: string;
  } | null>(null);

  useEffect(() => {
    if (!creatorId) {
      setCreatorBubbleProfile(null);
      return;
    }
    let cancelled = false;
    getDoc(doc(db, "creators", creatorId))
      .then((snap) => {
        if (cancelled || !snap.exists()) return;
        const d = snap.data() as Record<string, unknown>;
        setCreatorBubbleProfile({
          displayName: typeof d.displayName === "string" ? d.displayName : undefined,
          handle: typeof d.handle === "string" ? d.handle : undefined,
        });
      })
      .catch(() => {
        if (!cancelled) setCreatorBubbleProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [creatorId]);

  const filteredThreads = useMemo(() => {
    let t = threads;
    if (listTab === "requests") t = t.filter((x) => x.fanHasSentMessage === true);
    const q = threadSearchQuery.trim().toLowerCase();
    if (q) {
      t = t.filter(
        (x) =>
          (x.otherPartyDisplayName || "").toLowerCase().includes(q) ||
          (x.lastMessagePreview || "").toLowerCase().includes(q) ||
          x.fanId.toLowerCase().includes(q)
      );
    }
    return t;
  }, [threads, listTab, threadSearchQuery]);

  const sortedFilteredThreads = useMemo(
    () => sortCreatorDmThreads(filteredThreads),
    [filteredThreads]
  );

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

  const fetchThreads = useCallback(async (): Promise<FanDmThread[] | null> => {
    if (!creatorId) return null;
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
        return null;
      }
      const list = Array.isArray(data.threads) ? (data.threads as FanDmThread[]) : [];
      setThreads(list);
      setThreadsError(null);
      return list;
    } catch (e) {
      setThreads([]);
      const msg = e instanceof Error ? e.message : "Network error";
      setThreadsError(msg);
      showToast?.("Could not load conversations.", "error");
      return null;
    } finally {
      setLoading(false);
    }
  }, [creatorId, showToast]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  /** Keep selection in sync when threads load/refresh; merge row so pin/mute/unread stay current. */
  useEffect(() => {
    setSelectedThread((prev) => {
      if (threads.length === 0) return null;
      if (prev) {
        const fresh = threads.find((t) => t.id === prev.id);
        if (fresh) return fresh;
      }
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
            : null; // creator inbox: API omits labels (uses thread list + profile)
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

  const fetchMemberDirectory = useCallback(
    async (q: string) => {
      if (!creatorId) return;
      setNewDmLoading(true);
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
        const url =
          q.trim() === ""
            ? "/api/fanDmMemberDirectory"
            : `/api/fanDmMemberDirectory?q=${encodeURIComponent(q.trim())}`;
        const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const { json: data } = await parseApiBody(res);
        if (!res.ok) {
          setNewDmMembers([]);
          return;
        }
        setNewDmMembers(Array.isArray(data.members) ? (data.members as MemberRow[]) : []);
      } catch {
        setNewDmMembers([]);
      } finally {
        setNewDmLoading(false);
      }
    },
    [creatorId]
  );

  useEffect(() => {
    if (!showNewDmModal) return;
    const delay = newDmSearch.trim() === "" ? 0 : 320;
    const t = window.setTimeout(() => {
      void fetchMemberDirectory(newDmSearch);
    }, delay);
    return () => window.clearTimeout(t);
  }, [showNewDmModal, newDmSearch, fetchMemberDirectory]);

  useEffect(() => {
    return () => {
      const r = mediaRecorderRef.current;
      if (r && r.state !== "inactive") {
        r.onstop = null;
        r.stop();
      }
    };
  }, []);

  useEffect(() => {
    if (!threadRowMenuOpenId) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (typeof t?.closest === "function" && t.closest(".fh-dm-thread-menu-root")) return;
      setThreadRowMenuOpenId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setThreadRowMenuOpenId(null);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [threadRowMenuOpenId]);

  useEffect(() => {
    if (messagesLoading) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, messagesLoading, selectedThread?.id]);

  const sendDmWithPayload = async (
    content: string,
    attachmentUrl?: string,
    attachmentType?: DmAttachmentKind
  ) => {
    if (!selectedThread || !creatorId) return;
    if (!content.trim() && !attachmentUrl) return;
    setSending(true);
    const prevReply = reply;
    setReply("");
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const body: Record<string, string> = {
        threadId: selectedThread.id,
        content: content.trim(),
      };
      if (attachmentUrl) {
        body.attachmentUrl = attachmentUrl;
        if (attachmentType) body.attachmentType = attachmentType;
      }
      const res = await fetch("/api/fanDmSend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Failed to send");
      const { messages: next, error: loadErr, labels: nextLabels } = await fetchMessagesForThread(selectedThread);
      setMessages(next);
      setMessagesError(loadErr);
      setMessageLabels(nextLabels);
      void fetchThreads();
      requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }));
      showToast?.("Sent", "success");
    } catch (e) {
      setReply(prevReply);
      showToast?.(e instanceof Error ? e.message : "Failed to send", "error");
    } finally {
      setSending(false);
    }
  };

  const sendReply = async () => {
    if (!selectedThread || !reply.trim() || !creatorId) return;
    await sendDmWithPayload(reply.trim());
  };

  const onFileSelected: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !creatorId || !selectedThread) return;
    const caption = reply.trim();
    try {
      const { url, attachmentType } = await uploadFanDmAttachment(creatorId, file);
      await sendDmWithPayload(caption, url, attachmentType);
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : "Upload failed", "error");
    }
  };

  const stopRecordingAndSend = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === "inactive") {
      setIsRecordingVoice(false);
      setVoiceMeterStream(null);
      return;
    }
    stopMediaRecorderSafe(rec);
  }, []);

  const startVoiceRecording = async () => {
    if (!creatorId || !selectedThread || isRecordingVoice) return;
    let stream: MediaStream | null = null;
    try {
      try {
        const permissionStatus = await navigator.permissions.query({ name: "microphone" as PermissionName });
        if (permissionStatus.state === "denied") {
          showToast?.("Microphone access was denied. Enable it in browser settings.", "error");
          return;
        }
      } catch {
        /* permissions.query unsupported */
      }

      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setVoiceMeterStream(stream);
      setVoiceMeterKey((k) => k + 1);
      const rec = createAudioMediaRecorder(stream);
      const requestedMime = rec.mimeType || undefined;
      mediaChunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size) mediaChunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        setVoiceMeterStream(null);
        stream.getTracks().forEach((t) => t.stop());
        setIsRecordingVoice(false);
        mediaRecorderRef.current = null;
        const chunks = mediaChunksRef.current;
        mediaChunksRef.current = [];
        if (!chunks.length || !creatorId || !selectedThread) return;
        const blobType = effectiveBlobType(rec, requestedMime);
        const blob = new Blob(chunks, { type: blobType });
        if (blob.size < 256) {
          showToast?.("Recording was too short or empty. Try again.", "error");
          return;
        }
        const fileType = normalizeVoiceRecordingFileType(blobType);
        const ext = fileExtensionForAudioMime(fileType);
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: fileType });
        try {
          const { url } = await uploadFanDmAttachment(creatorId, file);
          await sendDmWithPayload("", url, "audio");
        } catch (err) {
          showToast?.(err instanceof Error ? err.message : "Voice send failed", "error");
        }
      };
      mediaRecorderRef.current = rec;
      rec.start(AUDIO_RECORDER_TIMESLICE_MS);
      setIsRecordingVoice(true);
    } catch {
      setVoiceMeterStream(null);
      showToast?.("Microphone permission denied or unavailable.", "error");
    }
  };

  const toggleVoiceRecording = () => {
    if (isRecordingVoice) stopRecordingAndSend();
    else void startVoiceRecording();
  };

  const openFanOnFansTab = async () => {
    if (!selectedThread) return;
    const fanId = selectedThread.fanId;
    const displayLabel = selectedThread.otherPartyDisplayName?.trim() || undefined;
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (token) {
        await fetch("/api/fanDmSyncFanPreference", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ fanId }),
        });
      }
    } catch {
      /* still open Fans tab — OnlyFansFans may match by label */
    }
    premiumTab?.openFanInFansTab(fanId, displayLabel);
  };

  const startConversationWithMember = async (fanId: string) => {
    if (!creatorId) return;
    setEnsuringThreadFanId(fanId);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch("/api/fanDmEnsureThread", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ fanId }),
      });
      const { json: data } = await parseApiBody(res);
      if (!res.ok) throw new Error((data.error as string) || "Failed to open conversation");
      setShowNewDmModal(false);
      const list = await fetchThreads();
      const t = list?.find((x) => x.fanId === fanId);
      if (t) setSelectedThread(t);
      showToast?.("Conversation opened", "success");
    } catch (e) {
      showToast?.(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setEnsuringThreadFanId(null);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!selectedThread) return;
    if (!window.confirm("Delete this message? This cannot be undone.")) return;
    setDeletingMessageId(messageId);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch("/api/deleteFanDmMessage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ threadId: selectedThread.id, messageId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Failed to delete message");
      showToast?.("Message deleted", "success");
      const { messages: next, error: loadErr, labels: nextLabels } = await fetchMessagesForThread(selectedThread);
      setMessages(next);
      setMessagesError(loadErr);
      setMessageLabels(nextLabels);
      void fetchThreads();
    } catch (e) {
      showToast?.(e instanceof Error ? e.message : "Failed to delete", "error");
    } finally {
      setDeletingMessageId(null);
    }
  };

  const callThreadInboxAction = async (
    thread: FanDmThread,
    action: "pin" | "unpin" | "mute" | "unmute" | "mark_unread"
  ) => {
    setInboxActionThreadId(thread.id);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch("/api/fanDmThreadCreatorInbox", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ threadId: thread.id, action }),
      });
      const { json } = await parseApiBody(res);
      if (!res.ok) throw new Error((json.error as string) || "Update failed");
      setThreadRowMenuOpenId(null);
      await fetchThreads();
      showToast?.(
        action === "pin"
          ? "Pinned to top"
          : action === "unpin"
            ? "Unpinned"
            : action === "mute"
              ? "Muted"
              : action === "unmute"
                ? "Unmuted"
                : "Marked as unread",
        "success"
      );
    } catch (e) {
      showToast?.(e instanceof Error ? e.message : "Could not update", "error");
    } finally {
      setInboxActionThreadId(null);
    }
  };

  const handleDeleteThread = async (thread: FanDmThread) => {
    if (
      !window.confirm(
        `Delete conversation with ${thread.otherPartyDisplayName || "this member"}? All messages will be removed. This cannot be undone.`
      )
    ) {
      return;
    }
    setDeletingThreadId(thread.id);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch("/api/deleteFanDmThread", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ threadId: thread.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Failed to delete");
      showToast?.("Conversation deleted", "success");
      if (selectedThread?.id === thread.id) {
        setSelectedThread(null);
        setMessages([]);
        setMessageLabels(null);
      }
      void fetchThreads();
    } catch (e) {
      showToast?.(e instanceof Error ? e.message : "Failed to delete", "error");
    } finally {
      setDeletingThreadId(null);
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

  const fanBubbleHead = formatDmBubbleAuthorLine(
    messageLabels?.fan || selectedThread?.otherPartyDisplayName || "Member"
  );
  const creatorDisplayName = creatorBubbleProfile?.displayName ?? user?.name;
  const creatorHandle = creatorBubbleProfile?.handle ?? user?.username;
  const creatorPrimary = formatCreatorDmBubblePrimaryLine(creatorDisplayName, creatorHandle);
  const creatorSecondary = formatCreatorDmBubbleSecondaryLine(creatorDisplayName, creatorHandle);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 stormij-theme fh-messages-hub">
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
      <div className="flex gap-4 sm:gap-6 flex-col lg:flex-row">
        <div className="w-full lg:w-80 flex-shrink-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden lg:max-h-[min(85vh,720px)] lg:flex lg:flex-col">
          <div className="fh-dm-sidebar-header">
            <h2>Chat</h2>
            <button
              type="button"
              className="fh-dm-sidebar-icon-btn"
              title="New message"
              aria-label="Start a new direct message"
              onClick={() => {
                setNewDmSearch("");
                setShowNewDmModal(true);
              }}
            >
              <MailboxIcon />
            </button>
          </div>
          <input
            type="search"
            className="fh-dm-sidebar-search"
            placeholder="Search"
            value={threadSearchQuery}
            onChange={(e) => setThreadSearchQuery(e.target.value)}
            aria-label="Search conversations"
          />
          <div className="fh-dm-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={listTab === "all"}
              className={`fh-dm-tab ${listTab === "all" ? "fh-dm-tab--active" : ""}`}
              onClick={() => setListTab("all")}
            >
              All
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={listTab === "requests"}
              className={`fh-dm-tab ${listTab === "requests" ? "fh-dm-tab--active" : ""}`}
              onClick={() => setListTab("requests")}
            >
              Requests
            </button>
          </div>
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
            <div className="p-4 text-gray-500 dark:text-gray-400 text-sm">
              <p>No conversations yet.</p>
            </div>
          ) : filteredThreads.length === 0 ? (
            <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
              No threads match your search or tab.
            </p>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-700 lg:flex-1 lg:overflow-y-auto min-h-0">
              {sortedFilteredThreads.map((t) => (
                <li
                  key={t.id}
                  className={`fh-dm-thread-row fh-dm-thread-row-wrap ${
                    t.creatorMarkedUnread ? "fh-dm-thread-row--unread" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setThreadRowMenuOpenId(null);
                      setSelectedThread(t);
                    }}
                    className={`fh-dm-thread-row__main hover:bg-gray-50 dark:hover:bg-gray-700/50 transition ${
                      selectedThread?.id === t.id ? "fh-selected-soft" : ""
                    }`}
                  >
                    <div className="fh-dm-thread-row__top">
                      <span className="flex items-center gap-1.5 min-w-0">
                        {t.creatorMarkedUnread ? (
                          <span className="fh-dm-thread-unread-dot" aria-hidden />
                        ) : null}
                        <p className="font-medium text-gray-900 dark:text-white truncate">
                          {t.otherPartyDisplayName || "Member"}
                        </p>
                        {t.creatorInboxPinned ? (
                          <span className="text-[10px] font-bold text-pink-600 shrink-0" title="Pinned">
                            PIN
                          </span>
                        ) : null}
                        {t.creatorInboxMuted ? (
                          <span className="text-[10px] font-semibold text-gray-400 shrink-0" title="Muted">
                            MUTED
                          </span>
                        ) : null}
                      </span>
                      {t.lastMessageAt ? (
                        <span className="fh-dm-thread-row__time">{formatDmRelativeShort(t.lastMessageAt)}</span>
                      ) : null}
                    </div>
                    {t.lastMessagePreview ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-0.5 text-left">
                        {t.lastMessagePreview}
                      </p>
                    ) : null}
                  </button>
                  <div className="fh-dm-thread-menu-root fh-dm-thread-menu-anchor">
                    <button
                      type="button"
                      className="fh-dm-thread-menu-trigger"
                      aria-expanded={threadRowMenuOpenId === t.id}
                      aria-haspopup="menu"
                      aria-label={`More options for ${t.otherPartyDisplayName || "member"}`}
                      disabled={!!inboxActionThreadId && inboxActionThreadId === t.id}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setThreadRowMenuOpenId((prev) => (prev === t.id ? null : t.id));
                      }}
                    >
                      <MoreHorizontalIcon />
                    </button>
                    {threadRowMenuOpenId === t.id ? (
                      <div className="fh-dm-thread-menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          className="fh-dm-thread-menu__item"
                          disabled={!!inboxActionThreadId}
                          onClick={(e) => {
                            e.stopPropagation();
                            void callThreadInboxAction(t, "mark_unread");
                          }}
                        >
                          <span>Mark as unread</span>
                          <MenuIconMarkUnread />
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="fh-dm-thread-menu__item"
                          disabled={!!inboxActionThreadId}
                          onClick={(e) => {
                            e.stopPropagation();
                            void callThreadInboxAction(t, t.creatorInboxPinned ? "unpin" : "pin");
                          }}
                        >
                          <span>{t.creatorInboxPinned ? "Unpin" : "Pin"}</span>
                          <MenuIconPin />
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="fh-dm-thread-menu__item"
                          disabled={!!inboxActionThreadId}
                          onClick={(e) => {
                            e.stopPropagation();
                            void callThreadInboxAction(t, t.creatorInboxMuted ? "unmute" : "mute");
                          }}
                        >
                          <span>{t.creatorInboxMuted ? "Unmute" : "Mute"}</span>
                          <MenuIconMute />
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="fh-dm-thread-menu__item fh-dm-thread-menu__item--danger"
                          disabled={deletingThreadId === t.id || !!inboxActionThreadId}
                          onClick={(e) => {
                            e.stopPropagation();
                            setThreadRowMenuOpenId(null);
                            void handleDeleteThread(t);
                          }}
                        >
                          <span>Delete</span>
                          <TrashThreadIcon />
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex-1 min-w-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden flex flex-col min-h-[min(70vh,560px)] lg:max-h-[min(85vh,720px)]">
          {!selectedThread ? (
            <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">
              Select a conversation
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2">
                <p className="font-semibold text-gray-900 dark:text-white truncate min-w-0">
                  {selectedThread.otherPartyDisplayName || "Member"}
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void openFanOnFansTab()}
                    className="fh-dm-sidebar-icon-btn"
                    title="Open fan card on Fans tab"
                    aria-label="Open full fan card on Fans tab"
                  >
                    <MoreVerticalIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleStartInstantVideo(selectedThread.fanId, selectedThread.otherPartyDisplayName || "Member")
                    }
                    disabled={startingVideo}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-primary-600 to-primary-700 text-white text-sm font-medium hover:from-primary-700 hover:to-primary-800 disabled:opacity-50 transition"
                    title="Start instant video call"
                  >
                    <VideoIcon />
                    <span className="hidden sm:inline">{startingVideo ? "Starting..." : "Video"}</span>
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 min-w-0 flex flex-col">
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
                    <p className="mt-2 text-xs max-w-sm opacity-90">Send a reply below.</p>
                  </div>
                ) : (
                  messages.map((m, i) => {
                    /** Migrated Stormij rows may use a legacy creator uid in `senderId`; treat “not fan” as creator outbound. */
                    const isFromFan =
                      !!selectedThread?.fanId && m.senderId === selectedThread.fanId;
                    const isMe = selectedThread
                      ? !isFromFan
                      : Boolean(creatorId && m.senderId === creatorId);
                    const prev = messages[i - 1];
                    const showDayDivider =
                      !prev || formatDmDayCalendarKey(prev.createdAt) !== formatDmDayCalendarKey(m.createdAt);
                    const dividerLabel = formatDmDateDividerLabel(m.createdAt);
                    const timeStr = formatDmShortTime(m.createdAt);
                    return (
                      <Fragment key={m.id}>
                        {showDayDivider && dividerLabel ? (
                          <div className="fh-dm-date-divider" role="separator">
                            <span className="fh-dm-date-divider__line" aria-hidden />
                            <span className="fh-dm-date-divider__label">{dividerLabel}</span>
                            <span className="fh-dm-date-divider__line" aria-hidden />
                          </div>
                        ) : null}
                        <div
                          className={`fh-dm-chat-row ${isMe ? "fh-dm-chat-row--out" : "fh-dm-chat-row--in"}`}
                        >
                          <div
                            className={`fh-dm-bubble-wrap ${isMe ? "fh-dm-bubble-wrap--out" : "fh-dm-bubble-wrap--in"}`}
                          >
                            <div
                              className={`fh-dm-bubble ${isMe ? "fh-dm-bubble--me" : "fh-dm-bubble--them"}`}
                            >
                              <button
                                type="button"
                                className={`fh-dm-bubble__delete ${isMe ? "fh-dm-bubble__delete--me" : ""}`}
                                aria-label="Delete message"
                                title="Delete message"
                                disabled={deletingMessageId === m.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleDeleteMessage(m.id);
                                }}
                              >
                                <TrashMessageIcon />
                              </button>
                              {isMe ? (
                                <div className="fh-dm-bubble__head-stack">
                                  <div className="fh-dm-bubble__head fh-dm-bubble__head--primary">{creatorPrimary}</div>
                                  {creatorSecondary ? (
                                    <div className="fh-dm-bubble__head fh-dm-bubble__head--secondary">{creatorSecondary}</div>
                                  ) : null}
                                </div>
                              ) : (
                                <div className="fh-dm-bubble__head fh-dm-bubble__head--primary">{fanBubbleHead}</div>
                              )}
                              <div className="fh-dm-bubble__body">
                                {m.attachmentUrl && m.attachmentType === "image" ? (
                                  <div className="fh-dm-attachment">
                                    <img src={m.attachmentUrl} alt="" loading="lazy" />
                                  </div>
                                ) : null}
                                {m.attachmentUrl && m.attachmentType === "video" ? (
                                  <div className="fh-dm-attachment">
                                    <video src={m.attachmentUrl} controls playsInline />
                                  </div>
                                ) : null}
                                {m.attachmentUrl &&
                                (m.attachmentType === "audio" ||
                                  (inferIsAudioFromUrl(m.attachmentUrl) &&
                                    m.attachmentType !== "image" &&
                                    m.attachmentType !== "video")) ? (
                                  <div className="fh-dm-attachment">
                                    <DmAudioPlayer src={m.attachmentUrl} className="w-full max-w-sm" />
                                  </div>
                                ) : null}
                                {m.content?.trim() ? m.content : null}
                                {!m.content?.trim() && !m.attachmentUrl ? (
                                  <span className="italic opacity-70">(empty message)</span>
                                ) : null}
                              </div>
                              {isMe && timeStr ? (
                                <div className="fh-dm-bubble__foot fh-dm-bubble__foot--me">
                                  {timeStr}
                                  {m.read ? (
                                    <span className="fh-dm-bubble__receipt" title="Fan has seen this message">
                                      {" "}
                                      — Read
                                    </span>
                                  ) : (
                                    <span
                                      className="fh-dm-bubble__receipt fh-dm-bubble__receipt--unread"
                                      title="Fan has not opened this thread since you sent this"
                                    >
                                      {" "}
                                      — Unread
                                    </span>
                                  )}
                                </div>
                              ) : null}
                            </div>
                            {!isMe && timeStr ? (
                              <div className="fh-dm-meta-below">{timeStr}</div>
                            ) : null}
                          </div>
                        </div>
                      </Fragment>
                    );
                  })
                )}
                <div ref={messagesEndRef} aria-hidden />
              </div>
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
                {isRecordingVoice && voiceMeterStream ? (
                  <div className="space-y-1 w-full max-w-md">
                    <RecordingDurationLabel active={isRecordingVoice} />
                    <AudioLevelMeter key={`dm-creator-voice-${voiceMeterKey}`} stream={voiceMeterStream} className="w-full max-w-md" />
                  </div>
                ) : null}
                <div className="flex gap-2 items-end">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={onFileSelected}
                />
                <div className="fh-dm-compose-actions">
                  <button
                    type="button"
                    className="fh-dm-compose-icon"
                    title="Photo or video"
                    aria-label="Upload photo or video"
                    disabled={sending || !selectedThread}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <PhotoIcon />
                  </button>
                  <button
                    type="button"
                    className={`fh-dm-compose-icon ${isRecordingVoice ? "fh-dm-compose-icon--recording" : ""}`}
                    title={isRecordingVoice ? "Stop and send voice" : "Record voice message"}
                    aria-label={isRecordingVoice ? "Stop recording" : "Record voice message"}
                    disabled={sending || !selectedThread}
                    onClick={() => toggleVoiceRecording()}
                  >
                    <MicIcon />
                  </button>
                </div>
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
                  placeholder="Message"
                  className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm resize-none min-h-[40px] max-h-[160px] leading-snug"
                />
                <button
                  type="button"
                  onClick={sendReply}
                  disabled={sending || !reply.trim()}
                  className="px-4 py-2 fh-btn text-sm font-medium disabled:opacity-50 shrink-0"
                >
                  {sending ? "Sending…" : "Send"}
                </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showNewDmModal ? (
        <div
          className="fh-dm-modal-overlay"
          role="dialog"
          aria-modal
          aria-labelledby="fh-new-dm-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowNewDmModal(false);
          }}
        >
          <div className="fh-dm-modal">
            <div className="fh-dm-modal__head">
              <span id="fh-new-dm-title">New message</span>
              <button
                type="button"
                className="fh-dm-modal__close"
                aria-label="Close"
                onClick={() => setShowNewDmModal(false)}
              >
                ×
              </button>
            </div>
            <div className="fh-dm-modal__body">
              <input
                type="search"
                className="fh-dm-sidebar-search w-full mb-3"
                placeholder="Search members"
                value={newDmSearch}
                onChange={(e) => setNewDmSearch(e.target.value)}
                aria-label="Search members"
              />
              {newDmLoading ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading members…</p>
              ) : newDmMembers.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No members found. Fans appear here after they join or are in your list.
                </p>
              ) : (
                <ul className="divide-y divide-gray-200 dark:divide-gray-600 max-h-[min(50vh,360px)] overflow-y-auto">
                  {newDmMembers.map((m) => (
                    <li key={m.fanId}>
                      <button
                        type="button"
                        className="w-full text-left py-2.5 px-1 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded text-gray-900 dark:text-white text-sm"
                        disabled={!!ensuringThreadFanId}
                        onClick={() => void startConversationWithMember(m.fanId)}
                      >
                        <span className="font-medium">{m.label}</span>
                        {ensuringThreadFanId === m.fanId ? (
                          <span className="ml-2 text-xs text-gray-500">Opening…</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
};
