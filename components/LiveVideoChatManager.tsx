import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAppContext } from "./AppContext";
import { auth, db } from "../firebaseConfig";
import { collection, query, onSnapshot, orderBy, getDocs, getDoc, doc } from "firebase/firestore";
import type { LiveVideoChatSession } from "../types";
import VideoCallRoom from "./VideoCallRoom";
import {
  formatFanDisplayLabel,
  formatFanPlainMoniker,
  type FanDisplayInput,
} from "../src/lib/fanHubDisplay";

// Fan option for instant call picker — label matches User Management / DM directory (@username when set)
interface FanOption {
  id: string;
  email: string | null;
  /** Primary line: @handle, display name, or email local part (via fanHub rules) */
  listLabel: string;
  /** For Daily / API fanDisplayName — no leading @ */
  plainMoniker: string;
}

// Icons for dropdown
const SearchIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

const VideoIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <circle cx="12" cy="12" r="10" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const XIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const UserIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const formatTime = (isoString: string) => {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString();
};

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  accepted: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  active: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400 animate-pulse",
  completed: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
  declined: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  expired: "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-500",
  cancelled: "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-500",
};

interface LiveVideoChatManagerProps {
  creatorId: string;
  compact?: boolean;
}

interface QuotaStatus {
  monthlyMinutesLimit: number;
  minutesUsedThisMonth: number;
  bonusMinutes: number;
}

const PhoneIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
  </svg>
);

export const LiveVideoChatManager: React.FC<LiveVideoChatManagerProps> = ({
  creatorId,
  compact = false,
}) => {
  const { user, showToast } = useAppContext();
  const [sessions, setSessions] = useState<LiveVideoChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<LiveVideoChatSession | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "active" | "completed">("all");
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  
  // Instant call modal state
  const [showInstantCallModal, setShowInstantCallModal] = useState(false);
  const [instantCallFanId, setInstantCallFanId] = useState("");
  const [instantCallFanName, setInstantCallFanName] = useState("");
  const [instantCallDuration, setInstantCallDuration] = useState(15);
  const [startingInstantCall, setStartingInstantCall] = useState(false);
  
  // Fan selector state
  const [fans, setFans] = useState<FanOption[]>([]);
  const [fansLoading, setFansLoading] = useState(false);
  const [fanDropdownOpen, setFanDropdownOpen] = useState(false);
  const [fanSearchQuery, setFanSearchQuery] = useState("");
  const fanDropdownRef = useRef<HTMLDivElement>(null);
  const fanSearchInputRef = useRef<HTMLInputElement>(null);

  // Fetch quota status
  useEffect(() => {
    const fetchQuota = async () => {
      if (!creatorId) return;
      try {
        const token = await auth.currentUser?.getIdToken(true);
        if (!token) return;
        
        const res = await fetch(`/api/videoUsageStats?creatorId=${creatorId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (res.ok) {
          const data = await res.json();
          setQuota(data.quota);
        }
      } catch (e) {
        console.error("Failed to fetch quota:", e);
      }
    };
    
    fetchQuota();
  }, [creatorId]);

  // Load fans from creators/{id}/fans and merge users/{fanId} so @username shows (same rules as DM member list)
  useEffect(() => {
    if (!creatorId || !db) return;
    setFansLoading(true);

    const mergeFanAndUser = (f: Record<string, unknown>): FanDisplayInput => ({
      username:
        (typeof f.username === "string" && f.username.trim() ? f.username : undefined) ?? undefined,
      displayName:
        (typeof f.displayName === "string" && f.displayName.trim() ? f.displayName : undefined) ??
        (typeof f.fanName === "string" && f.fanName.trim() ? f.fanName : undefined),
      name: typeof f.name === "string" && f.name.trim() ? f.name : undefined,
      email: typeof f.email === "string" && f.email.trim() ? f.email : undefined,
    });

    getDocs(collection(db, "creators", creatorId, "fans"))
      .then(async (snap) => {
        const list: FanOption[] = await Promise.all(
          snap.docs.map(async (d) => {
            const fanId = d.id;
            const f = d.data() as Record<string, unknown>;
            let merged: FanDisplayInput = mergeFanAndUser(f);
            try {
              const uSnap = await getDoc(doc(db, "users", fanId));
              if (uSnap.exists()) {
                const u = uSnap.data() as Record<string, unknown>;
                merged = {
                  username:
                    (typeof u.username === "string" && u.username.trim() ? u.username : merged.username) ??
                    merged.username,
                  displayName:
                    (typeof u.displayName === "string" && u.displayName.trim()
                      ? u.displayName
                      : merged.displayName) ?? merged.displayName,
                  name:
                    (typeof u.name === "string" && u.name.trim() ? u.name : merged.name) ?? merged.name,
                  email:
                    (typeof u.email === "string" && u.email.trim() ? u.email : merged.email) ??
                    merged.email,
                };
              }
            } catch {
              /* ignore user doc read errors */
            }
            const listLabel = formatFanDisplayLabel(merged, { fallback: "Member" });
            const plainMoniker =
              formatFanPlainMoniker(merged) ??
              (listLabel.startsWith("@") ? listLabel.slice(1) : listLabel);
            return {
              id: fanId,
              email: merged.email ?? null,
              listLabel,
              plainMoniker,
            };
          })
        );
        list.sort((a, b) => a.listLabel.localeCompare(b.listLabel, undefined, { sensitivity: "base" }));
        setFans(list);
      })
      .catch((e) => {
        console.error("Failed to load fans:", e);
        setFans([]);
      })
      .finally(() => setFansLoading(false));
  }, [creatorId]);

  // Close fan dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (fanDropdownRef.current && !fanDropdownRef.current.contains(e.target as Node)) {
        setFanDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (fanDropdownOpen) {
      setFanSearchQuery("");
      fanSearchInputRef.current?.focus();
    }
  }, [fanDropdownOpen]);

  // Subscribe to live video chat sessions
  useEffect(() => {
    if (!creatorId || !db) {
      setLoading(false);
      return;
    }

    const sessionsRef = collection(db, "creators", creatorId, "liveVideoChats");
    const q = query(sessionsRef, orderBy("requestedAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const sessionList: LiveVideoChatSession[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          sessionList.push({
            id: doc.id,
            creatorId: data.creatorId,
            fanId: data.fanId,
            fanEmail: data.fanEmail,
            fanDisplayName: data.fanDisplayName,
            productId: data.productId,
            durationMinutes: data.durationMinutes || 10,
            minutesUsed: data.minutesUsed || 0,
            amountPaidCents: data.amountPaidCents || 0,
            creatorEarningsCents: data.creatorEarningsCents || 0,
            status: data.status || "pending",
            roomUrl: data.roomUrl,
            roomName: data.roomName,
            fanNote: data.fanNote,
            requestedAt: data.requestedAt,
            acceptedAt: data.acceptedAt,
            startedAt: data.startedAt,
            endedAt: data.endedAt,
            scheduledFor: data.scheduledFor,
          });
        });
        setSessions(sessionList);
        setLoading(false);
      },
      (error) => {
        console.error("Error listening to sessions:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [creatorId]);

  const handleAccept = useCallback(async (session: LiveVideoChatSession) => {
    setActionLoading(session.id);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      if (!token) throw new Error("Please sign in");

      const res = await fetch("/api/liveVideoChat?action=accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId: session.id, creatorId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to accept");
      }

      showToast?.("Video chat accepted! Ready to join.", "success");
    } catch (e) {
      console.error("Failed to accept:", e);
      showToast?.(e instanceof Error ? e.message : "Failed to accept", "error");
    } finally {
      setActionLoading(null);
    }
  }, [creatorId, showToast]);

  const handleDecline = useCallback(async (session: LiveVideoChatSession) => {
    if (!window.confirm("Decline this video chat request? The fan will be notified.")) return;

    setActionLoading(session.id);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      if (!token) throw new Error("Please sign in");

      const res = await fetch("/api/liveVideoChat?action=decline", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId: session.id, creatorId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to decline");
      }

      showToast?.("Request declined", "info");
    } catch (e) {
      console.error("Failed to decline:", e);
      showToast?.(e instanceof Error ? e.message : "Failed to decline", "error");
    } finally {
      setActionLoading(null);
    }
  }, [creatorId, showToast]);

  const handleJoinCall = useCallback((session: LiveVideoChatSession) => {
    setActiveSession(session);
  }, []);

  const handleLeaveCall = useCallback(() => {
    setActiveSession(null);
  }, []);

  // Select a fan from dropdown
  const handleSelectFan = useCallback((fan: FanOption | null) => {
    if (fan) {
      setInstantCallFanId(fan.id);
      setInstantCallFanName(fan.plainMoniker || fan.email || fan.id);
    } else {
      setInstantCallFanId("");
      setInstantCallFanName("");
    }
    setFanDropdownOpen(false);
  }, []);

  // Filter fans based on search
  const filteredFans = fanSearchQuery.trim()
    ? fans.filter((f) => {
        const q = fanSearchQuery.toLowerCase();
        return (
          f.listLabel.toLowerCase().includes(q) ||
          (f.email?.toLowerCase().includes(q) ?? false) ||
          f.plainMoniker.toLowerCase().includes(q) ||
          f.id.toLowerCase().includes(q)
        );
      })
    : fans;

  // Get selected fan display
  const selectedFan = fans.find((f) => f.id === instantCallFanId);
  const selectedFanDisplay = selectedFan
    ? selectedFan.listLabel || selectedFan.email || selectedFan.id
    : "";

  // Start instant video call
  const handleStartInstantCall = useCallback(async () => {
    if (!instantCallFanId.trim()) {
      showToast?.("Please select a fan", "error");
      return;
    }

    setStartingInstantCall(true);
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
          fanId: instantCallFanId.trim(),
          fanDisplayName: instantCallFanName.trim() || instantCallFanId.trim(),
          durationMinutes: instantCallDuration,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || "Failed to start video call");
      }

      // Find the new session and join it
      const newSession: LiveVideoChatSession = {
        id: (data as { sessionId: string }).sessionId,
        creatorId,
        fanId: instantCallFanId.trim(),
        fanDisplayName: instantCallFanName.trim() || undefined,
        productId: "instant_call",
        durationMinutes: instantCallDuration,
        minutesUsed: 0,
        amountPaidCents: 0,
        creatorEarningsCents: 0,
        status: "accepted",
        roomUrl: (data as { roomUrl?: string }).roomUrl,
        roomName: (data as { roomName?: string }).roomName,
        requestedAt: new Date().toISOString(),
        acceptedAt: new Date().toISOString(),
      };

      setShowInstantCallModal(false);
      setInstantCallFanId("");
      setInstantCallFanName("");
      setActiveSession(newSession);
      showToast?.("Video call started! Waiting for fan to join...", "success");
    } catch (e) {
      console.error("Failed to start instant video:", e);
      showToast?.(e instanceof Error ? e.message : "Failed to start video call", "error");
    } finally {
      setStartingInstantCall(false);
    }
  }, [creatorId, instantCallFanId, instantCallFanName, instantCallDuration, showToast]);

  const filteredSessions = sessions.filter((s) => {
    if (filter === "all") return true;
    if (filter === "pending") return s.status === "pending";
    if (filter === "active") return s.status === "accepted" || s.status === "active";
    if (filter === "completed") return s.status === "completed" || s.status === "declined" || s.status === "cancelled";
    return true;
  });

  const pendingCount = sessions.filter((s) => s.status === "pending").length;
  const activeCount = sessions.filter((s) => s.status === "accepted" || s.status === "active").length;

  // Show video call room if session is active
  if (activeSession) {
    return (
      <VideoCallRoom
        sessionId={activeSession.id}
        creatorId={creatorId}
        onLeave={handleLeaveCall}
        onSessionEnd={(minutesUsed) => {
          showToast?.(`Session ended. ${minutesUsed} minutes used.`, "success");
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-500 dark:text-gray-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto mb-2"></div>
        Loading video chat requests...
      </div>
    );
  }

  // Compact view for dashboard widget
  if (compact) {
    const recentPending = sessions.filter((s) => s.status === "pending").slice(0, 3);
    
    if (recentPending.length === 0) {
      return null;
    }

    return (
      <div className="bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl p-4 text-white">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <VideoIcon />
            <span className="font-semibold">Video Chat Requests</span>
          </div>
          <span className="bg-white/20 px-2 py-1 rounded-full text-sm">
            {pendingCount} pending
          </span>
        </div>
        
        <div className="space-y-2">
          {recentPending.map((session) => (
            <div key={session.id} className="bg-white/10 rounded-lg p-3 flex items-center justify-between">
              <div>
                <p className="font-medium">{session.fanDisplayName || "Fan"}</p>
                <p className="text-sm text-white/70">{session.durationMinutes}min · {formatPrice(session.amountPaidCents)}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleDecline(session)}
                  disabled={actionLoading === session.id}
                  className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition"
                >
                  <XIcon />
                </button>
                <button
                  onClick={() => handleAccept(session)}
                  disabled={actionLoading === session.id}
                  className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition"
                >
                  <CheckIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Calculate quota info
  const totalAvailable = quota ? quota.monthlyMinutesLimit + quota.bonusMinutes : 500;
  const remaining = quota ? totalAvailable - quota.minutesUsedThisMonth : 500;
  const usagePercent = quota && totalAvailable > 0 ? Math.min(100, (quota.minutesUsedThisMonth / totalAvailable) * 100) : 0;
  const isUnlimited = quota?.monthlyMinutesLimit === -1;

  // Full view
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white">
              <VideoIcon />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Live Video Chats</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {pendingCount} pending · {activeCount} ready
              </p>
            </div>
          </div>

          {/* Quota Display */}
          {quota && !isUnlimited && (
            <div className="text-right">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {remaining} min remaining
              </p>
              <div className="w-32 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden mt-1">
                <div 
                  className={`h-full rounded-full transition-all ${
                    usagePercent > 90 ? 'bg-red-500' : 
                    usagePercent > 70 ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {quota.minutesUsedThisMonth} / {totalAvailable} min used
              </p>
            </div>
          )}
          {isUnlimited && (
            <span className="text-sm text-green-600 dark:text-green-400 font-medium">
              ∞ Unlimited
            </span>
          )}
        </div>

        {/* Filters and Instant Call Button */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-2">
            {(["all", "pending", "active", "completed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  filter === f
                    ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {f === "pending" && pendingCount > 0 && (
                  <span className="ml-1.5 bg-indigo-500 text-white px-1.5 py-0.5 rounded-full text-xs">
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>
          
          {/* Start Instant Call Button */}
          <button
            onClick={() => setShowInstantCallModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-sm font-medium hover:from-indigo-600 hover:to-violet-600 transition shadow-md"
          >
            <PhoneIcon />
            <span>Start Instant Call</span>
          </button>
        </div>
      </div>

      {/* Sessions List */}
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {filteredSessions.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <VideoIcon />
            <p className="mt-2">No video chat requests yet</p>
            <p className="text-sm">Fans can request live video calls from your store.</p>
          </div>
        ) : (
          filteredSessions.map((session) => (
            <div key={session.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-500 dark:text-gray-400">
                    <UserIcon />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900 dark:text-white">
                        {session.fanDisplayName || session.fanEmail || "Anonymous Fan"}
                      </h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[session.status]}`}>
                        {session.status === "active" ? "🔴 LIVE" : session.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <ClockIcon />
                        {session.durationMinutes}min
                      </span>
                      <span className="font-medium text-green-600 dark:text-green-400">
                        {formatPrice(session.creatorEarningsCents)}
                      </span>
                      <span>{formatTime(session.requestedAt)}</span>
                    </div>
                    {session.fanNote && (
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg p-2">
                        "{session.fanNote}"
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {session.status === "pending" && (
                    <>
                      <button
                        onClick={() => handleDecline(session)}
                        disabled={actionLoading === session.id}
                        className="px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition disabled:opacity-50"
                      >
                        Decline
                      </button>
                      <button
                        onClick={() => handleAccept(session)}
                        disabled={actionLoading === session.id}
                        className="px-3 py-2 text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 rounded-lg transition disabled:opacity-50"
                      >
                        {actionLoading === session.id ? "..." : "Accept"}
                      </button>
                    </>
                  )}
                  {(session.status === "accepted" || session.status === "active") && (
                    <button
                      onClick={() => handleJoinCall(session)}
                      className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition flex items-center gap-2"
                    >
                      <VideoIcon />
                      {session.status === "active" ? "Rejoin Call" : "Start Call"}
                    </button>
                  )}
                  {session.status === "completed" && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {session.minutesUsed}min used
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Instant Call Modal */}
      {showInstantCallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white">
                    <VideoIcon />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    Start Instant Video Call
                  </h3>
                </div>
                <button
                  onClick={() => setShowInstantCallModal(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <XIcon />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Fan Search Input with Autocomplete */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Search Fan *
                </label>
                <div className="relative" ref={fanDropdownRef}>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <SearchIcon />
                    </span>
                    <input
                      ref={fanSearchInputRef}
                      type="text"
                      value={fanSearchQuery}
                      onChange={(e) => {
                        setFanSearchQuery(e.target.value);
                        setFanDropdownOpen(true);
                        // Clear selection if user is typing a new search
                        if (selectedFan && e.target.value !== selectedFanDisplay) {
                          setInstantCallFanId("");
                          setInstantCallFanName("");
                        }
                      }}
                      onFocus={() => setFanDropdownOpen(true)}
                      placeholder={fansLoading ? "Loading fans..." : "Start typing fan name or email..."}
                      disabled={fansLoading}
                      className="w-full pl-10 pr-10 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                      autoComplete="off"
                    />
                    {fanSearchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setFanSearchQuery("");
                          setInstantCallFanId("");
                          setInstantCallFanName("");
                          fanSearchInputRef.current?.focus();
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <XIcon />
                      </button>
                    )}
                  </div>

                  {/* Autocomplete dropdown - shows when typing */}
                  {fanDropdownOpen && fanSearchQuery.trim() && (
                    <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg overflow-hidden">
                      <ul className="max-h-48 overflow-y-auto">
                        {filteredFans.length === 0 ? (
                          <li className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                            No fans found matching "{fanSearchQuery}"
                          </li>
                        ) : (
                          filteredFans.slice(0, 10).map((fan) => (
                            <li key={fan.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  handleSelectFan(fan);
                                  setFanSearchQuery(fan.listLabel || fan.email || fan.id);
                                }}
                                className="w-full text-left px-4 py-3 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition flex items-center gap-3"
                              >
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-violet-100 dark:from-indigo-900/30 dark:to-violet-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 flex-shrink-0 font-semibold">
                                  {(fan.listLabel || fan.email || "?")[0].toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                    {fan.listLabel}
                                  </p>
                                  {fan.email && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                      {fan.email}
                                    </p>
                                  )}
                                </div>
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* Selected Fan Card */}
              {selectedFan && (
                <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-900/20 dark:to-violet-900/20 border border-indigo-200 dark:border-indigo-800">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white text-xl font-bold shadow-lg">
                      {(selectedFan.listLabel || selectedFan.email || "?")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-bold text-gray-900 dark:text-white truncate">
                        {selectedFan.listLabel}
                      </p>
                      {selectedFan.email && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                          {selectedFan.email}
                        </p>
                      )}
                      <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1 flex items-center gap-1">
                        <CheckIcon />
                        Ready for video call
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setInstantCallFanId("");
                        setInstantCallFanName("");
                        setFanSearchQuery("");
                        fanSearchInputRef.current?.focus();
                      }}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1"
                      title="Change fan"
                    >
                      <XIcon />
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Duration
                </label>
                <select
                  value={instantCallDuration}
                  onChange={(e) => setInstantCallDuration(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value={5}>5 minutes</option>
                  <option value={10}>10 minutes</option>
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>60 minutes</option>
                </select>
              </div>

              {quota && !quota.monthlyMinutesLimit && (
                <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 p-3 rounded-lg">
                  ⚡ This will use {instantCallDuration} minutes from your quota.
                  You have <strong>{Math.max(0, quota.monthlyMinutesLimit + quota.bonusMinutes - quota.minutesUsedThisMonth)}</strong> minutes remaining.
                </p>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
              <button
                onClick={() => setShowInstantCallModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleStartInstantCall}
                disabled={startingInstantCall || !instantCallFanId.trim()}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg hover:from-indigo-600 hover:to-violet-600 transition font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {startingInstantCall ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <VideoIcon />
                    Start Call
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveVideoChatManager;
