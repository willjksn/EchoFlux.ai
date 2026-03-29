"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAppContext } from './AppContext';
import { hasEliteAccess } from '../src/utils/planAccess';
import { auth, db } from '../firebaseConfig';
import { doc, getDoc, collection, getDocs, addDoc, Timestamp, updateDoc, serverTimestamp } from 'firebase/firestore';
import {
  formatFanDisplayLabel,
  formatFanPlainMoniker,
  fanHubListLabel,
  safeUsernameForHandle,
} from '../src/lib/fanHubDisplay';

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
type DurationPreset = '15' | '30' | '45' | '60' | 'custom';

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

const ROLEPLAY_TYPES = ['GFE', 'Dominant', 'Teacher', 'Boss', 'Fitness', 'Soft', 'Nurse', 'Celebrity'] as const;
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
        title={disabled ? 'AI Chat Bot is on — turn it off to use suggestions' : undefined}
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
  const [roleplayType, setRoleplayType] = useState<string>('GFE');
  const [customChatTypeValue, setCustomChatTypeValue] = useState('');
  const [tone, setTone] = useState<string>('Teasing');
  const [contentSpiciness, setContentSpiciness] = useState(3);
  const [durationPreset, setDurationPreset] = useState<DurationPreset>('30');
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(30);
  const [customDurationMinutes, setCustomDurationMinutes] = useState(20);

  // Session state
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionPaused, setSessionPaused] = useState(false);
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [myMessageInput, setMyMessageInput] = useState('');
  const [sessionEndModalOpen, setSessionEndModalOpen] = useState(false);

  // AI
  const [chatBotEnabled, setChatBotEnabled] = useState(false);
  const [chatBotReplying, setChatBotReplying] = useState(false);
  const [autoSuggestions, setAutoSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  // Refs
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sendInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const lastFetchedMessageCountRef = useRef(0);
  const lastChatBotRepliedCountRef = useRef(0);

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
    getDocs(collection(db, 'users', adminUid, 'onlyfans_fan_preferences'))
      .then(async (snap) => {
        const docs = snap.docs;
        const CHUNK = 25;
        const list: FanOption[] = [];
        for (let i = 0; i < docs.length; i += CHUNK) {
          const chunk = docs.slice(i, i + CHUNK);
          const part = await Promise.all(
            chunk.map(async (d) => {
              const data = d.data();
              const fanId = d.id;
              let username: string | undefined;
              let displayName: string | null =
                typeof data.displayName === 'string' && data.displayName.trim()
                  ? data.displayName.trim()
                  : null;
              let email: string | null = typeof data.email === 'string' ? data.email : null;
              const prefName = typeof data.name === 'string' ? data.name : null;

              try {
                const [uSnap, fSnap] = await Promise.all([
                  getDoc(doc(db, 'users', fanId)),
                  getDoc(doc(db, 'creators', adminUid, 'fans', fanId)),
                ]);
                if (fSnap.exists()) {
                  const fd = fSnap.data() as Record<string, unknown>;
                  const fromFan = usernameFromFanDoc(fd);
                  if (fromFan) username = fromFan;
                  if (!displayName && typeof fd.displayName === 'string' && fd.displayName.trim()) {
                    displayName = fd.displayName.trim();
                  }
                  if (!email && typeof fd.email === 'string' && fd.email) email = fd.email;
                }
                if (uSnap.exists()) {
                  const ud = uSnap.data() as Record<string, unknown>;
                  const uu =
                    typeof ud.username === 'string' && ud.username.trim()
                      ? safeUsernameForHandle(ud.username) ?? undefined
                      : undefined;
                  if (uu) username = uu;
                  if (!displayName && typeof ud.displayName === 'string' && ud.displayName.trim()) {
                    displayName = ud.displayName.trim();
                  }
                  if (!email && typeof ud.email === 'string' && ud.email) email = ud.email;
                }
              } catch {
                /* ignore */
              }

              const listLabel = fanHubListLabel(username ?? null, displayName, email, prefName);

              return {
                uid: fanId,
                displayName: displayName ?? undefined,
                username,
                email: email ?? '',
                memberId: fanId,
                listLabel,
              };
            })
          );
          list.push(...part);
        }
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

  // Auto-end when timer hits 0
  useEffect(() => {
    if (!sessionStarted || timeRemainingSeconds !== 0) return;
    setChatBotEnabled(false);
    setSessionStarted(false);
    setSessionPaused(false);
    showToast?.('Session ended — time is up!', 'success');
  }, [sessionStarted, timeRemainingSeconds, showToast]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getToken = useCallback(async () => {
    return auth.currentUser ? await auth.currentUser.getIdToken(true) : '';
  }, []);

  const handleStartSession = useCallback(() => {
    if (!selectedUid) return;
    const mins = durationPreset === 'custom' ? customDurationMinutes : sessionDurationMinutes;
    const totalSeconds = Math.max(1, mins) * 60;
    setTimeRemainingSeconds(totalSeconds);
    setSessionStarted(true);
    setSessionPaused(false);
    setMessages([]);
    lastFetchedMessageCountRef.current = 0;
    lastChatBotRepliedCountRef.current = 0;
    setAutoSuggestions([]);
    showToast?.('Session started!', 'success');
  }, [selectedUid, durationPreset, customDurationMinutes, sessionDurationMinutes, showToast]);

  const handleEndSession = useCallback(() => {
    setSessionEndModalOpen(false);
    setChatBotEnabled(false);
    setSessionStarted(false);
    setSessionPaused(false);
    setMessages([]);
    setAutoSuggestions([]);
    showToast?.('Session ended', 'success');
  }, [showToast]);

  const handleSendMyMessage = useCallback(async () => {
    const text = myMessageInput.trim();
    if (!text || !sessionStarted) return;

        const newMessage: Message = {
            id: `msg-${Date.now()}`,
      senderId: adminUid,
      text,
            timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setMyMessageInput('');
    setAutoSuggestions([]);
  }, [myMessageInput, sessionStarted, adminUid]);

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

      const toneId = tone.toLowerCase();
      const toneParam = toneId === 'teasing' ? 'tease' : toneId === 'playful' || toneId === 'intimate' || toneId === 'sweet' ? toneId : 'playful';

      const response = await fetch('/api/generateSextingSuggestion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          recentMessages,
          fanName: formatFanPlainMoniker(selectedFan ?? {}) || undefined,
          creatorPersona: useCreatorPersonality ? creatorPersonality : undefined,
          tone: toneParam,
          numSuggestions: 6,
          spiciness: contentSpiciness,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok && data.suggestions?.length) {
        setAutoSuggestions(data.suggestions.map((s: string) => normalizeChatText(s)).filter(Boolean));
      }
    } catch {
      // ignore
    } finally {
      setSuggestionsLoading(false);
    }
  }, [sessionStarted, recentMessages, tone, selectedFan, useCreatorPersonality, creatorPersonality, contentSpiciness, getToken]);

  // Chatbot auto-reply (Elite only)
  useEffect(() => {
    if (!canUseChatBot || !chatBotEnabled || !sessionStarted || sessionPaused || recentMessages.length === 0 || chatBotReplying) return;
    const last = recentMessages[recentMessages.length - 1];
    if (last.role !== 'user') return;
    if (recentMessages.length <= lastChatBotRepliedCountRef.current) return;
    lastChatBotRepliedCountRef.current = recentMessages.length;

    setChatBotReplying(true);
    const toneId = tone.toLowerCase();
    const toneParam = toneId === 'teasing' ? 'tease' : toneId === 'playful' || toneId === 'intimate' || toneId === 'sweet' ? toneId : 'playful';

    getToken()
      .then((token) => {
        if (!token) return null;
        return fetch('/api/generateSextingSuggestion', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            recentMessages,
            fanName: formatFanPlainMoniker(selectedFan ?? {}) || undefined,
            creatorPersona: useCreatorPersonality ? creatorPersonality : undefined,
            tone: toneParam,
            numSuggestions: 1,
            spiciness: contentSpiciness,
          }),
        }).then((r) => r.json());
      })
      .then((data) => {
        if (data?.suggestion?.trim()) {
          const newMessage: Message = {
            id: `msg-${Date.now()}`,
            senderId: adminUid,
            text: normalizeChatText(data.suggestion),
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, newMessage]);
        }
      })
      .catch(() => {})
      .finally(() => setChatBotReplying(false));
  }, [canUseChatBot, chatBotEnabled, sessionStarted, sessionPaused, recentMessages, tone, selectedFan, useCreatorPersonality, creatorPersonality, contentSpiciness, getToken, adminUid, chatBotReplying]);

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
                {roleplayType === 'GFE' ? 'GFE (Girlfriend Experience)' : roleplayType === 'Custom' && customChatTypeValue.trim() ? customChatTypeValue.trim() : roleplayType} — {tone} — {sessionPaused ? 'paused' : 'active'}
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
                    openPaymentModal?.({ name: 'Elite', price: 79, cycle: 'monthly' });
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
              <div className="chat-session-messages-wrap chat-session-messages-wrap-active">
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
                <div ref={messagesEndRef} />
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

              <button type="button" className="chat-session-back-btn" onClick={() => setSessionStarted(false)}>
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
                disabled={chatBotEnabled}
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
                {(['15', '30', '45', '60'] as const).map((m) => (
                                                <button
                    key={m}
                    type="button"
                    className={`chat-session-duration-btn ${durationPreset === m ? 'active' : ''}`}
                    onClick={() => {
                      setDurationPreset(m);
                      setSessionDurationMinutes(Number(m));
                    }}
                  >
                    {m === '60' ? '1 hr' : `${m} min`}
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
                    value={customDurationMinutes}
                    onChange={(e) => setCustomDurationMinutes(Math.max(1, Math.min(180, Number(e.target.value) || 1)))}
                    className="chat-session-input chat-session-duration-input"
                  />
                  <span className="chat-session-duration-unit">min</span>
                            </div>
                        )}
                    </div>
                </div>
          {useCreatorPersonality && creatorPersonality && (
            <div className="chat-session-personality-content">
              <label className="chat-session-label">Creator personality (from AI Training)</label>
              <div className="chat-session-personality-preview">
                {creatorPersonality || 'No personality set. Add one in AI Training for consistent voice across chat, captions, and prompts.'}
                            </div>
                        </div>
                    )}
                </div>

        {/* Chat Type */}
        <label className="chat-session-label">Chat Type</label>
        <div className="chat-session-role-grid">
          {ROLEPLAY_TYPES.map((r) => (
                    <button
              key={r}
              type="button"
              className={`chat-session-role-btn ${roleplayType === r ? 'active' : ''}`}
              onClick={() => setRoleplayType(r)}
            >
              {r}
                            </button>
                        ))}
                    <button
            type="button"
            className={`chat-session-role-btn chat-session-role-btn-custom ${roleplayType === 'Custom' ? 'active' : ''}`}
                        onClick={() => setRoleplayType('Custom')}
                    >
                        Custom
                    </button>
        </div>
                    {roleplayType === 'Custom' && (
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
        )}

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
