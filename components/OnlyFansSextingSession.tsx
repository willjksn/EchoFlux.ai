"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAppContext } from './AppContext';
import { ECHOFLUX_ELITE_MONTHLY_USD } from '../constants';
import { hasEliteAccess } from '../src/utils/planAccess';
import { auth, db } from '../firebaseConfig';
import { doc, getDoc, collection, getDocs, addDoc, Timestamp, updateDoc, serverTimestamp } from 'firebase/firestore';
import {
  formatFanDisplayLabel,
  formatFanPlainMoniker,
  fanHubListLabel,
  safeUsernameForHandle,
} from '../src/lib/fanHubDisplay';
import { authUidFromFanDocId, parseCompoundFanDocumentId } from '../src/lib/compoundFanDocId';
import { fanDmMarkReadAfterOpen } from '../src/lib/fanDmMarkReadClient';

function usernameFromFanDoc(fd: Record<string, unknown>): string | null {
  const keys = ['username', 'memberUsername', 'handle', 'instagram_handle', 'instagramHandle'] as const;
  for (const k of keys) {
    const v = fd[k];
    if (typeof v === 'string' && v.trim()) {
      return safeUsernameForHandle(v.replace(/^@/, ''));
    }
  }
  return null;
}

type SessionStatus = 'setup' | 'active' | 'paused' | 'ended';
type DurationPreset = '3' | '5' | '10' | '15' | 'custom';

interface Message {
    id: string;
  senderId: string;
  text: string;
    timestamp: Date;
  imageUrls?: string[];
  videoUrls?: string[];
}

interface FanOption {
  uid: string;
  displayName?: string;
  /** Global member handle from users/{uid}.username when set */
  username?: string;
  email?: string;
  memberId?: string;
  /** Resolved list row (never truncated UID — see load fans effect) */
  listLabel: string;
}

interface SextingContextMessage {
  role: 'user' | 'assistant';
  content: string;
}

const TONES = ['Soft', 'Teasing', 'Playful', 'Bold'] as const;
const SPICINESS_LABELS = ['Mild', 'Mild', 'Mild', 'Medium', 'Medium', 'Medium', 'Spicy', 'Spicy', 'Extra Spicy', 'Extra Spicy'] as const;

function normalizeChatText(input: string): string {
  const trimmed = (input || '').trim();
  if (!trimmed) return '';
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [
    trimmed,
    codeBlockMatch?.[1]?.trim() || '',
    trimmed.replace(/\\"/g, '"'),
    (codeBlockMatch?.[1]?.trim() || '').replace(/\\"/g, '"'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as { primary_reply?: unknown };
      if (typeof parsed?.primary_reply === 'string' && parsed.primary_reply.trim()) {
        return parsed.primary_reply.trim();
      }
    } catch {
      // ignore
    }
    const quoted = candidate.match(/"primary_reply"\s*:\s*("(?:\\.|[^"\\])*")/i);
    if (quoted?.[1]) {
      try {
        const value = JSON.parse(quoted[1]);
        if (typeof value === 'string' && value.trim()) return value.trim();
      } catch {
        // ignore
      }
    }
  }
  if (trimmed.includes('primary_reply')) return '';
  return trimmed;
}

function messagesToContext(messages: Message[], adminUid: string): SextingContextMessage[] {
  return messages.map((m) => ({
    role: m.senderId === adminUid ? 'assistant' : 'user',
    content: normalizeChatText(m.text || '') || '(media)',
  }));
}

function toneUiToApiParam(toneLabel: string): string {
  const toneId = toneLabel.toLowerCase();
  if (toneId === 'teasing') return 'tease';
  if (toneId === 'playful' || toneId === 'intimate' || toneId === 'sweet' || toneId === 'soft' || toneId === 'bold') {
    return toneId;
  }
  return 'playful';
}

/** Shared body for /api/generateSextingSuggestion (manual suggestions + AI chat bot). */
function buildStudioSextingRequestBody(
  recentMessages: SextingContextMessage[],
  opts: {
    fanName?: string;
    useCreatorPersonality: boolean;
    creatorPersonality: string;
    toneLabel: string;
    customChatTypeValue: string;
    contentSpiciness: number;
    numSuggestions: number;
  }
): Record<string, unknown> {
  return {
    recentMessages,
    fanName: opts.fanName,
    creatorPersona: opts.useCreatorPersonality ? opts.creatorPersonality : undefined,
    useCreatorPersonality: opts.useCreatorPersonality,
    tone: toneUiToApiParam(opts.toneLabel),
    chatType: opts.customChatTypeValue.trim() || 'Custom',
    spiciness: opts.contentSpiciness,
    numSuggestions: opts.numSuggestions,
  };
}

function SparklesIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// Fan Dropdown Component
interface FanDropdownProps {
  fans: FanOption[];
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  loading?: boolean;
  placeholder?: string;
}

function getDisplay(fan: FanOption): string {
  return fan.listLabel;
}

function matchFan(fan: FanOption, q: string): boolean {
  if (!q.trim()) return true;
  const lower = q.trim().toLowerCase();
  const display = getDisplay(fan).toLowerCase();
  const email = (fan.email ?? '').toLowerCase();
  const un = (fan.username ?? '').toLowerCase();
  const uid = fan.uid.toLowerCase();
  return display.includes(lower) || email.includes(lower) || uid.includes(lower) || un.includes(lower);
}

function FanDropdown({ fans, selectedUid, onSelect, loading, placeholder = 'Select Fan' }: FanDropdownProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setSearchQuery('');
      searchInputRef.current?.focus();
    }
  }, [open]);

  const filteredFans = searchQuery.trim() ? fans.filter((f) => matchFan(f, searchQuery)) : fans;
  const selectedFan = fans.find((f) => f.uid === selectedUid);
  const displayValue = selectedFan ? getDisplay(selectedFan) : '';

  return (
    <div className="chat-session-fan-dropdown" ref={ref}>
      <button
        type="button"
        className="chat-session-fan-trigger"
        onClick={() => setOpen((o) => !o)}
        disabled={loading}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="chat-session-fan-trigger-icon">
          <UsersIcon />
        </span>
        <span className="chat-session-fan-trigger-text">
          {loading ? 'Loading…' : displayValue || placeholder}
        </span>
        <span className="chat-session-fan-trigger-chevron">
          <ChevronDownIcon />
        </span>
      </button>
      {open && (
        <div className="chat-session-fan-list-wrap">
          <div className="chat-session-fan-search">
            <span className="chat-session-fan-search-icon" aria-hidden>
              <SearchIcon />
            </span>
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or email…"
              className="chat-session-fan-search-input"
              aria-label="Search fans"
              autoComplete="off"
            />
          </div>
          <ul className="chat-session-fan-list" role="listbox">
            <li role="option">
              <button
                type="button"
                className={`chat-session-role-btn ${selectedUid === null ? 'active' : ''}`}
                onClick={() => { onSelect(null); setOpen(false); }}
              >
                No fan selected
              </button>
            </li>
            {filteredFans.map((fan) => (
              <li key={fan.uid} role="option">
                <button
                  type="button"
                  className={`chat-session-role-btn ${selectedUid === fan.uid ? 'active' : ''}`}
                  onClick={() => { onSelect(fan.uid); setOpen(false); }}
                >
                  {getDisplay(fan)}
                </button>
              </li>
            ))}
            {searchQuery.trim() && filteredFans.length === 0 && (
              <li className="chat-session-fan-list-empty" role="option">
                No fans match "{searchQuery.trim()}"
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// Session End Modal
interface SessionEndModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  fanName?: string;
}

function SessionEndModal({ open, onClose, onConfirm, fanName }: SessionEndModalProps) {
  if (!open) return null;
  return (
    <div className="chat-session-modal-overlay" role="dialog" aria-modal="true">
      <div className="chat-session-modal">
        <h3 className="chat-session-modal-title">End chat session?</h3>
        <p className="chat-session-modal-text">
          {fanName ? `This will end the session with ${fanName}.` : 'This will end the current chat session.'}
        </p>
        <div className="chat-session-modal-actions">
          <button type="button" className="chat-session-modal-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="chat-session-modal-btn primary" onClick={onConfirm}>
            End session
          </button>
        </div>
      </div>
    </div>
  );
}

// AI Suggestions Panel
interface AISuggestionsPanelProps {
  suggestions: string[];
  onUseSuggestion: (text: string) => void;
  onRequestSuggestions: () => void;
  loading: boolean;
  disabled?: boolean;
}

function AISuggestionsPanel({ suggestions, onUseSuggestion, onRequestSuggestions, loading, disabled }: AISuggestionsPanelProps) {
  return (
    <div className="chat-session-ai-cards-wrap">
      <button
        type="button"
        className="chat-session-suggest-reply-btn"
        onClick={onRequestSuggestions}
        disabled={disabled || loading}
        title="Get reply ideas (works with AI Chat Bot on or off)"
      >
        <SparklesIcon /> {loading ? 'Generating…' : 'Suggest reply'}
      </button>
      {suggestions.length > 0 && (
        <div className="chat-session-suggestion-cards">
          {suggestions.map((text, i) => (
            <div key={i} className="chat-session-suggestion-card">
              <p className="chat-session-suggestion-card-text">{text}</p>
              <p className="chat-session-suggestion-card-confidence">Confidence: 85%</p>
              <div className="chat-session-suggestion-card-actions">
                <button type="button" className="chat-session-card-link" onClick={() => onUseSuggestion(text)}>
                  Use
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Main Component
export const OnlyFansSextingSession: React.FC = () => {
  const { user, showToast, openPaymentModal } = useAppContext();
  const adminUid = user?.id || '';
  const adminEmail = user?.email || null;
  const canUseChatBot = hasEliteAccess(user);

  // Fans
  const [fans, setFans] = useState<FanOption[]>([]);
  const [fansLoading, setFansLoading] = useState(false);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  // Setup state
  const [useCreatorPersonality, setUseCreatorPersonality] = useState(false);
  const [creatorPersonality, setCreatorPersonality] = useState('');
  const [customChatTypeValue, setCustomChatTypeValue] = useState('');
  const [tone, setTone] = useState<string>('Teasing');
  const [contentSpiciness, setContentSpiciness] = useState(3);
  const [durationPreset, setDurationPreset] = useState<DurationPreset>('15');
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(15);
  const [customDurationMinutes, setCustomDurationMinutes] = useState(20);
  const [customDurationInput, setCustomDurationInput] = useState('20');

  // Session state
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionPaused, setSessionPaused] = useState(false);
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [myMessageInput, setMyMessageInput] = useState('');
  const [sessionEndModalOpen, setSessionEndModalOpen] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeChatSessionId, setActiveChatSessionId] = useState<string | null>(null);

  // AI
  const [chatBotEnabled, setChatBotEnabled] = useState(false);
  const [chatBotReplying, setChatBotReplying] = useState(false);
  const [autoSuggestions, setAutoSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  // Refs
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesScrollContainerRef = useRef<HTMLDivElement>(null);
  const sendInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const lastFetchedMessageCountRef = useRef(0);
  /** Which fan DM message id we last auto-replied to (avoid double-send; length-based ref broke on fetch lag). */
  const lastChatBotRepliedFanMessageIdRef = useRef<string | null>(null);
  const chatBotInFlightRef = useRef(false);

  const selectedFan = fans.find((f) => f.uid === selectedUid);
  const recentMessages = messagesToContext(messages, adminUid);

  const creatorChatLabel = useMemo(() => {
    const n = user?.name?.trim();
    if (n) return n;
    const local = user?.email?.split('@')[0]?.trim();
    if (local) return local;
    return 'You';
  }, [user?.name, user?.email]);

  const fanChatLabel = useMemo(() => {
    if (!selectedFan) return 'Member';
    const fromList = selectedFan.listLabel?.trim();
    if (fromList) return fromList;
    return (
      formatFanDisplayLabel(
        {
          username: selectedFan.username ?? null,
          displayName: selectedFan.displayName ?? null,
          email: selectedFan.email || null,
        },
        { fallback: 'Member' }
      ) || 'Member'
    );
  }, [selectedFan]);

  const messageSenderLabel = useCallback(
    (senderId: string) => (senderId === adminUid ? creatorChatLabel : fanChatLabel),
    [adminUid, creatorChatLabel, fanChatLabel]
  );

  // Load fans — same enrichment as Fans tab (users + creators/.../fans + fanHubListLabel; no UID truncation)
  useEffect(() => {
    if (!adminUid) return;
    setFansLoading(true);
    Promise.all([
      getDocs(collection(db, 'users', adminUid, 'onlyfans_fan_preferences')).catch(() => null),
      getDocs(collection(db, 'creators', adminUid, 'fans')).catch(() => null),
      getDocs(collection(db, 'creatorSubscribers', adminUid, 'subscribers')).catch(() => null),
    ])
      .then(async ([prefsSnap, fansSnap, subscribersSnap]) => {
        const UID_RE = /^[A-Za-z0-9]{20,36}$/;
        type Row = {
          key: string;
          originalIds: Set<string>;
          displayName: string | null;
          email: string | null;
          username: string | undefined;
          prefName: string | null;
        };
        const rowMap = new Map<string, Row>();

        const canonicalKeyForId = (rawId: string): string => {
          const authUid = authUidFromFanDocId(rawId);
          if (UID_RE.test(authUid)) return authUid;
          return rawId;
        };
        const upsert = (rawId: string, patch: Partial<Omit<Row, 'key' | 'originalIds'>>) => {
          const key = canonicalKeyForId(rawId);
          const existing = rowMap.get(key) || {
            key,
            originalIds: new Set<string>(),
            displayName: null,
            email: null,
            username: undefined,
            prefName: null,
          };
          existing.originalIds.add(rawId);
          if (patch.displayName && !existing.displayName) existing.displayName = patch.displayName;
          if (patch.email && !existing.email) existing.email = patch.email.toLowerCase();
          if (patch.username && !existing.username) existing.username = patch.username;
          if (patch.prefName && !existing.prefName) existing.prefName = patch.prefName;
          rowMap.set(key, existing);
        };

        prefsSnap?.docs.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          upsert(d.id, {
            displayName:
              typeof data.displayName === 'string' && data.displayName.trim() ? data.displayName.trim() : null,
            email: typeof data.email === 'string' && data.email.trim() ? data.email.trim() : null,
            prefName: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : null,
          });
        });

        fansSnap?.docs.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          const fromFan = usernameFromFanDoc(data);
          const compound = parseCompoundFanDocumentId(d.id);
          upsert(d.id, {
            username: fromFan || undefined,
            displayName:
              typeof data.displayName === 'string' && data.displayName.trim() ? data.displayName.trim() : null,
            email:
              (typeof data.email === 'string' && data.email.trim() ? data.email.trim() : null) ||
              compound.emailFromId ||
              null,
          });
        });

        subscribersSnap?.docs.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          upsert(d.id, {
            displayName:
              typeof data.fanName === 'string' && data.fanName.trim() ? data.fanName.trim() : null,
            email:
              typeof data.fanEmail === 'string' && data.fanEmail.trim()
                ? data.fanEmail.trim()
                : null,
          });
        });

        const rows = Array.from(rowMap.values());
        const CHUNK = 25;
        for (let i = 0; i < rows.length; i += CHUNK) {
          const chunk = rows.slice(i, i + CHUNK);
          await Promise.all(
            chunk.map(async (row) => {
              if (!UID_RE.test(row.key)) return;
              try {
                const uSnap = await getDoc(doc(db, 'users', row.key));
                if (!uSnap.exists()) return;
                const ud = uSnap.data() as Record<string, unknown>;
                const uu =
                  typeof ud.username === 'string' && ud.username.trim()
                    ? safeUsernameForHandle(ud.username) ?? undefined
                    : undefined;
                if (uu && !row.username) row.username = uu;
                if (!row.displayName && typeof ud.displayName === 'string' && ud.displayName.trim()) {
                  row.displayName = ud.displayName.trim();
                }
                if (!row.email && typeof ud.email === 'string' && ud.email.trim()) {
                  row.email = ud.email.trim().toLowerCase();
                }
              } catch {
                /* ignore */
              }
            })
          );
        }

        const list: FanOption[] = rows
          .map((row) => ({
            uid: row.key,
            displayName: row.displayName ?? undefined,
            username: row.username,
            email: row.email ?? '',
            memberId: row.key,
            listLabel: fanHubListLabel(row.username ?? null, row.displayName, row.email, row.prefName),
          }))
          .sort((a, b) => a.listLabel.localeCompare(b.listLabel));

        setFans(list);
      })
      .catch(() => setFans([]))
      .finally(() => setFansLoading(false));
  }, [adminUid]);

  // Load creator personality
  useEffect(() => {
    if (!adminUid) return;
    getDoc(doc(db, 'users', adminUid))
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setCreatorPersonality(data.aiPersonality || '');
        }
      })
      .catch(() => {});
  }, [adminUid]);

  // Timer
  useEffect(() => {
    if (!sessionStarted || sessionPaused || timeRemainingSeconds <= 0) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      return;
    }
    timerIntervalRef.current = setInterval(() => {
      setTimeRemainingSeconds((prev) => {
        if (prev <= 1) {
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [sessionStarted, sessionPaused, timeRemainingSeconds]);

  // Keep the newest message in view without scrollIntoView (that can scroll the page / outer layout).
  useEffect(() => {
    const el = messagesScrollContainerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getToken = useCallback(async () => {
    return auth.currentUser ? await auth.currentUser.getIdToken(true) : '';
  }, []);

  const fetchSessionMessages = useCallback(async () => {
    if (!sessionStarted || !activeThreadId) return;
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/fanDmMessages?threadId=${encodeURIComponent(activeThreadId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({} as { messages?: Array<Record<string, unknown>> }));
      if (!res.ok) return;
      const rows = Array.isArray((data as { messages?: Array<Record<string, unknown>> }).messages)
        ? (data as { messages: Array<Record<string, unknown>> }).messages
        : [];
      const responseFanId =
        typeof (data as { fanId?: unknown }).fanId === 'string'
          ? (data as { fanId: string }).fanId.trim()
          : undefined;
      void fanDmMarkReadAfterOpen({
        threadId: activeThreadId,
        responseFanId,
        authUid: auth.currentUser?.uid ?? null,
        getIdToken: () => getToken().then((t) => t || null),
      });
      const mapped: Message[] = rows.map((m) => ({
        id: typeof m.id === 'string' ? m.id : `msg-${Date.now()}`,
        senderId: typeof m.senderId === 'string' ? m.senderId : '',
        text: typeof m.content === 'string' ? m.content : '',
        timestamp: new Date(typeof m.createdAt === 'string' ? m.createdAt : Date.now()),
      }));
      setMessages(mapped);
    } catch {
      // silent polling failure
    }
  }, [sessionStarted, activeThreadId, getToken]);

  const endActiveSessionOnServer = useCallback(async () => {
    if (!activeChatSessionId) return;
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/chatSession', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'end', sessionId: activeChatSessionId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(data.error || 'Could not end chat session.');
      }
    } catch (e) {
      showToast?.(e instanceof Error ? e.message : 'Could not end chat session.', 'error');
    }
  }, [activeChatSessionId, getToken, showToast]);

  // Auto-end when timer hits 0
  useEffect(() => {
    if (!sessionStarted || timeRemainingSeconds !== 0) return;
    void endActiveSessionOnServer();
    setChatBotEnabled(false);
    setSessionStarted(false);
    setSessionPaused(false);
    setActiveThreadId(null);
    setActiveChatSessionId(null);
    lastChatBotRepliedFanMessageIdRef.current = null;
    chatBotInFlightRef.current = false;
    showToast?.('Session ended — time is up!', 'success');
  }, [sessionStarted, timeRemainingSeconds, showToast, endActiveSessionOnServer]);

  const handleStartSession = useCallback(async () => {
    if (!selectedUid) return;
    const mins =
      durationPreset === 'custom'
        ? Math.max(1, Math.min(180, Number(customDurationInput) || customDurationMinutes || 1))
        : sessionDurationMinutes;
    try {
      const token = await getToken();
      if (!token) {
        showToast?.('Please sign in again before starting a session.', 'error');
        return;
      }
      const res = await fetch('/api/fanDmEnsureThread', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fanId: selectedUid,
          startSession: true,
          durationMinutes: mins,
          chatType: customChatTypeValue.trim() || 'Custom',
          notifyFan: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || 'Could not start chat session.');
      }
      setActiveThreadId(
        typeof (data as { threadId?: unknown }).threadId === 'string' ? String((data as { threadId: string }).threadId) : null
      );
      setActiveChatSessionId(
        typeof (data as { sessionId?: unknown }).sessionId === 'string' ? String((data as { sessionId: string }).sessionId) : null
      );
    } catch (e) {
      showToast?.(e instanceof Error ? e.message : 'Could not start chat session.', 'error');
      return;
    }

    const totalSeconds = Math.max(1, mins) * 60;
    setTimeRemainingSeconds(totalSeconds);
    setSessionStarted(true);
    setSessionPaused(false);
    setMessages([]);
    lastFetchedMessageCountRef.current = 0;
    lastChatBotRepliedFanMessageIdRef.current = null;
    setAutoSuggestions([]);
    showToast?.('Session started!', 'success');
  }, [selectedUid, durationPreset, customDurationInput, customDurationMinutes, sessionDurationMinutes, showToast, getToken, customChatTypeValue]);

  const handleEndSession = useCallback(() => {
    void endActiveSessionOnServer();
    setSessionEndModalOpen(false);
    setChatBotEnabled(false);
    setSessionStarted(false);
    setSessionPaused(false);
    setActiveThreadId(null);
    setActiveChatSessionId(null);
    setMessages([]);
    setAutoSuggestions([]);
    lastChatBotRepliedFanMessageIdRef.current = null;
    chatBotInFlightRef.current = false;
    showToast?.('Session ended', 'success');
  }, [showToast, endActiveSessionOnServer]);

  const handleSendMyMessage = useCallback(async () => {
    const text = myMessageInput.trim();
    if (!text || !sessionStarted || !activeThreadId || !selectedUid) return;
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/fanDmSend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          creatorId: adminUid,
          fanId: selectedUid,
          threadId: activeThreadId,
          content: text,
        }),
      });
      const data = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) throw new Error(data.error || 'Could not send message.');
      setMyMessageInput('');
      setAutoSuggestions([]);
      await fetchSessionMessages();
    } catch (e) {
      showToast?.(e instanceof Error ? e.message : 'Could not send message.', 'error');
    }
  }, [myMessageInput, sessionStarted, activeThreadId, selectedUid, getToken, adminUid, fetchSessionMessages, showToast]);

  const handleUseSuggestion = useCallback((text: string) => {
    setMyMessageInput(text);
    sendInputRef.current?.focus();
  }, []);

  const handleRequestSuggestions = useCallback(async () => {
    if (!sessionStarted || recentMessages.length === 0) return;
    const last = recentMessages[recentMessages.length - 1];
    if (last.role !== 'user') return;

    setSuggestionsLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const response = await fetch('/api/generateSextingSuggestion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(
          buildStudioSextingRequestBody(recentMessages, {
            fanName: formatFanPlainMoniker(selectedFan ?? {}) || undefined,
            useCreatorPersonality,
            creatorPersonality,
            toneLabel: tone,
            customChatTypeValue,
            contentSpiciness,
            numSuggestions: 6,
          })
        ),
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success !== false && Array.isArray(data.suggestions) && data.suggestions.length) {
        setAutoSuggestions(data.suggestions.map((s: string) => normalizeChatText(s)).filter(Boolean));
      }
    } catch {
      // ignore
    } finally {
      setSuggestionsLoading(false);
    }
  }, [
    sessionStarted,
    recentMessages,
    tone,
    selectedFan,
    useCreatorPersonality,
    creatorPersonality,
    contentSpiciness,
    customChatTypeValue,
    getToken,
  ]);

  // Chatbot auto-reply (Elite only) — API expects legacy fields OR `recentMessages` (mapped server-side).
  useEffect(() => {
    if (!canUseChatBot || !chatBotEnabled || !sessionStarted || sessionPaused) return;
    if (!activeThreadId || !selectedUid || chatBotInFlightRef.current) return;

    const lastFanMsg = [...messages]
      .reverse()
      .find((m) => m.senderId === selectedUid && normalizeChatText(m.text));
    if (!lastFanMsg) return;
    if (lastChatBotRepliedFanMessageIdRef.current === lastFanMsg.id) return;

    const recentForApi = messagesToContext(messages, adminUid);
    if (recentForApi.length === 0) return;
    const lastCtx = recentForApi[recentForApi.length - 1];
    if (lastCtx.role !== 'user') return;

    chatBotInFlightRef.current = true;
    setChatBotReplying(true);

    const fanMsgId = lastFanMsg.id;

    getToken()
      .then((token) => {
        if (!token) return null;
        return fetch('/api/generateSextingSuggestion', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(
            buildStudioSextingRequestBody(recentForApi, {
              fanName: formatFanPlainMoniker(selectedFan ?? {}) || undefined,
              useCreatorPersonality,
              creatorPersonality,
              toneLabel: tone,
              customChatTypeValue,
              contentSpiciness,
              numSuggestions: 1,
            })
          ),
        }).then(async (r) => {
          const data = await r.json().catch(() => ({}));
          return { ok: r.ok, data };
        });
      })
      .then(async (result) => {
        if (!result || !result.ok || result.data?.success === false) return;
        const d = result.data as { suggestions?: string[]; suggestion?: string };
        const raw =
          Array.isArray(d.suggestions) && d.suggestions[0]?.trim()
            ? d.suggestions[0]
            : typeof d.suggestion === 'string'
              ? d.suggestion
              : '';
        const aiText = normalizeChatText(raw);
        if (!aiText || !activeThreadId || !selectedUid) return;
        const token = await getToken();
        if (!token) return;
        const sendRes = await fetch('/api/fanDmSend', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            creatorId: adminUid,
            fanId: selectedUid,
            threadId: activeThreadId,
            content: aiText,
          }),
        });
        if (!sendRes.ok) return;
        lastChatBotRepliedFanMessageIdRef.current = fanMsgId;
        await fetchSessionMessages();
      })
      .catch(() => {})
      .finally(() => {
        chatBotInFlightRef.current = false;
        setChatBotReplying(false);
      });
  }, [
    canUseChatBot,
    chatBotEnabled,
    sessionStarted,
    sessionPaused,
    messages,
    selectedUid,
    adminUid,
    tone,
    selectedFan,
    useCreatorPersonality,
    creatorPersonality,
    contentSpiciness,
    customChatTypeValue,
    getToken,
    activeThreadId,
    fetchSessionMessages,
  ]);

  useEffect(() => {
    if (!sessionStarted || !activeThreadId) return;
    void fetchSessionMessages();
    const id = window.setInterval(() => {
      void fetchSessionMessages();
    }, 2000);
    return () => window.clearInterval(id);
  }, [sessionStarted, activeThreadId, fetchSessionMessages]);

  // Active Session View
  if (sessionStarted) {
        return (
      <>
        <div className="chat-session-active-wrap stormij-theme">
          {/* Header */}
          <header className="chat-session-active-header">
            <div className="chat-session-active-header-left">
              <h2 className="chat-session-active-title">Active Session</h2>
              <p className="chat-session-active-subtitle">
                {(customChatTypeValue.trim() || 'Custom')} — {tone} — {sessionPaused ? 'paused' : 'active'}
              </p>
                        </div>
            <div className="chat-session-active-header-actions">
              <span className="chat-session-timer-display" aria-live="polite">
                {formatTime(timeRemainingSeconds)}
              </span>
                            <button
                type="button"
                className={`chat-session-ai-chatbot-btn ${chatBotEnabled ? 'active' : ''} ${!canUseChatBot ? 'chat-session-ai-chatbot-btn--locked' : ''}`}
                onClick={() => {
                  if (!canUseChatBot) {
                    openPaymentModal?.({ name: 'Elite', price: ECHOFLUX_ELITE_MONTHLY_USD, cycle: 'monthly' });
                    showToast('AI Chat Bot is an Elite feature. Upgrade to unlock.', 'info');
                    return;
                  }
                  setChatBotEnabled((on) => !on);
                }}
                title={!canUseChatBot ? 'Elite only — upgrade to use AI Chat Bot' : chatBotEnabled ? 'AI Chat Bot is on — auto-replying to fan' : 'Turn on AI Chat Bot to auto-reply'}
                aria-pressed={chatBotEnabled}
                disabled={!canUseChatBot && undefined}
              >
                {chatBotReplying ? '…' : '🤖'} AI Chat Bot {!canUseChatBot ? '(Elite)' : chatBotEnabled ? 'On' : 'Off'}
                            </button>
                            <button
                type="button"
                className="chat-session-pause-btn"
                onClick={() => setSessionPaused((p) => !p)}
                            >
                {sessionPaused ? '▶ Resume' : 'II Pause'}
                            </button>
                            <button
                type="button"
                className="chat-session-end-btn"
                onClick={() => setSessionEndModalOpen(true)}
                            >
                ■ End Session
                            </button>
                        </div>
          </header>

          {/* Main Layout */}
          <div className="chat-session-active-layout">
            {/* Conversation Panel */}
            <div className="chat-session-conversation-panel">
              <h3 className="chat-session-panel-title">Conversation</h3>
              <div
                ref={messagesScrollContainerRef}
                className="chat-session-messages-wrap chat-session-messages-wrap-active"
              >
                {messages.length === 0 ? (
                  <p className="chat-session-empty-msg">No messages yet. Start the conversation!</p>
                ) : (
                  messages.map((m) => {
                    const isYou = m.senderId === adminUid;
        return (
                      <div key={m.id} className={isYou ? 'chat-session-msg-you' : 'chat-session-msg-fan'}>
                        <span className="chat-session-msg-label">{messageSenderLabel(m.senderId)}</span>
                        {normalizeChatText(m.text) && <p className="chat-session-msg-text">{normalizeChatText(m.text)}</p>}
                        </div>
                    );
                  })
                )}
              </div>

              {/* Send Row */}
              <div className="chat-session-send-row">
                <div className="chat-session-send-input-wrap">
                  <input
                    ref={sendInputRef}
                    type="text"
                    className="chat-session-input chat-session-send-input"
                    placeholder="Type your message..."
                    value={myMessageInput}
                    onChange={(e) => setMyMessageInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMyMessage()}
                    aria-label="Type your message"
                  />
                  <button type="button" className="chat-session-emoji-trigger" aria-label="Add emoji">
                    😀
                            </button>
                        </div>
                <button type="button" className="chat-session-send-btn" onClick={handleSendMyMessage}>
                  Send
                </button>
                </div>

              {/* Media Row */}
              <div className="chat-session-media-row">
                <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} />
                <input ref={videoInputRef} type="file" accept="video/*" style={{ display: 'none' }} />
                <button type="button" className="chat-session-media-btn" onClick={() => imageInputRef.current?.click()}>
                  Add image
                </button>
                <button type="button" className="chat-session-media-btn" onClick={() => videoInputRef.current?.click()}>
                  Add video
                </button>
                <button type="button" className="chat-session-media-btn">
                  Media from library
                </button>
                        </div>

              <button type="button" className="chat-session-back-btn" onClick={() => setSessionEndModalOpen(true)}>
                ← Back to setup
                            </button>
                    </div>

                    {/* AI Suggestions Panel */}
            <div className="chat-session-suggestions-panel">
              <h3 className="chat-session-panel-title">AI Suggestions</h3>
              <AISuggestionsPanel
                suggestions={autoSuggestions}
                onUseSuggestion={handleUseSuggestion}
                onRequestSuggestions={handleRequestSuggestions}
                loading={suggestionsLoading}
                disabled={false}
              />
                        </div>
                            </div>
        </div>
        <SessionEndModal
          open={sessionEndModalOpen}
          onClose={() => setSessionEndModalOpen(false)}
          onConfirm={handleEndSession}
          fanName={selectedFan?.listLabel || undefined}
        />
      </>
    );
  }

  // Setup View
  return (
    <div className="chat-session-assistant-panel stormij-theme">
      <div className="chat-session-assistant-inner">
        {/* Fan Dropdown */}
        <FanDropdown
          fans={fans}
          selectedUid={selectedUid}
          onSelect={setSelectedUid}
          loading={fansLoading}
          placeholder="Select Fan"
        />

        {/* Personality + Duration Row */}
        <div className="chat-session-personality-wrap">
          <div className="chat-session-personality-duration-row">
            <button
              type="button"
              className={`chat-session-personality-btn ${useCreatorPersonality ? 'active' : ''}`}
              onClick={() => setUseCreatorPersonality((on) => !on)}
              aria-pressed={useCreatorPersonality}
            >
              <span className="chat-session-personality-icon"><SparklesIcon /></span>
              Personality: {useCreatorPersonality ? 'On' : 'Off'}
            </button>
            <div className="chat-session-duration-wrap">
              <label className="chat-session-label">Session duration</label>
              <div className="chat-session-duration-row">
                {(['3', '5', '10', '15'] as const).map((m) => (
                                                <button
                    key={m}
                    type="button"
                    className={`chat-session-duration-btn ${durationPreset === m ? 'active' : ''}`}
                    onClick={() => {
                      setDurationPreset(m);
                      setSessionDurationMinutes(Number(m));
                    }}
                  >
                    {`${m} min`}
                                                </button>
                ))}
                                                <button
                  type="button"
                  className={`chat-session-duration-btn ${durationPreset === 'custom' ? 'active' : ''}`}
                  onClick={() => setDurationPreset('custom')}
                >
                  Custom
                                                </button>
                                            </div>
              {durationPreset === 'custom' && (
                <div className="chat-session-custom-duration">
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={customDurationInput}
                    onChange={(e) => setCustomDurationInput(e.target.value)}
                    onBlur={() => {
                      const next = Math.max(1, Math.min(180, Number(customDurationInput) || customDurationMinutes || 1));
                      setCustomDurationMinutes(next);
                      setCustomDurationInput(String(next));
                    }}
                    className="chat-session-input chat-session-duration-input"
                  />
                  <span className="chat-session-duration-unit">min</span>
                            </div>
                        )}
                    </div>
                </div>
          {useCreatorPersonality && creatorPersonality && (
            <div className="chat-session-personality-content">
              <label className="chat-session-label">Creator personality (from Profile &amp; AI)</label>
              <div className="chat-session-personality-preview">
                {creatorPersonality || 'No personality set. Add one under Settings → Profile & AI for consistent voice across chat, captions, and prompts.'}
                            </div>
                        </div>
                    )}
                </div>

        {/* Chat Type (custom only) */}
        <label className="chat-session-label">Chat Type</label>
        <div className="chat-session-custom-chat-type">
          <input
            type="text"
            className="chat-session-input"
            placeholder="Enter custom chat type..."
            value={customChatTypeValue}
            onChange={(e) => setCustomChatTypeValue(e.target.value)}
            aria-label="Custom chat type"
          />
        </div>

                {/* Tone */}
        <label className="chat-session-label">Tone</label>
        <div className="chat-session-tone-row">
          {TONES.map((t) => (
                            <button
                                key={t}
              type="button"
              className={`chat-session-role-btn ${tone === t ? 'active' : ''}`}
                                onClick={() => setTone(t)}
                            >
                                {t}
                            </button>
                        ))}
                    </div>

        {/* Content Spiciness Slider */}
        <div className="chat-session-spiciness-wrap">
          <div className="flex items-center justify-between mb-2">
            <span className="chat-session-spiciness-title">
              <span>🌶️</span>
              Content Spiciness: {SPICINESS_LABELS[contentSpiciness - 1]}
            </span>
            <span className="chat-session-spiciness-value">{contentSpiciness}/10</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            value={contentSpiciness}
            onChange={(e) => setContentSpiciness(Number(e.target.value))}
          />
          <p className="chat-session-spiciness-hint">Adjust how bold the AI chat responses are</p>
        </div>

        {/* Start Button */}
                <button
          type="button"
          className="chat-session-start-btn"
          onClick={handleStartSession}
          disabled={!selectedUid}
          title={!selectedUid ? 'Select a fan to start' : 'Start chat session'}
        >
          <span className="chat-session-start-icon"><PlayIcon /></span>
                    Start Session
                </button>
            </div>
        </div>
    );
};
