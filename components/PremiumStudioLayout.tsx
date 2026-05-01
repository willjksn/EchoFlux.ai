import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTabFromUrl } from '../src/hooks/useTabFromUrl';
import { useCreatorFanHubTheme } from '../src/hooks/useCreatorFanHubTheme';
import { useUI } from './contexts/UIContext';
import { auth } from '../firebaseConfig';
import { STUDIO_TAB_IDS, FAN_HUB_TAB_IDS, STUDIO_TAB_LABELS, FAN_HUB_TAB_LABELS } from '../constants';
import { FanHubNotificationBell, type FanHubNotificationNavigatePayload } from './FanHubNotificationBell';
import {
  FAN_HUB_DEEPLINK_STORAGE_KEY,
  resolveFanHubNotificationTarget,
} from '../src/lib/fanHubNotificationRouting';
import {
  useUnreadNewMessageNotificationCount,
  clearNewMessageNotificationBadge,
} from './useUnreadNewMessageNotifications';
import { useCreatorLiveChatSessionsCount } from './useCreatorLiveChatSessionsCount';

const FAN_HUB_PREVIEW_THEME_STORAGE_KEY = 'echoflux:fanhub-preview-theme';
const FAN_HUB_PREVIEW_THEME_EVENT = 'echoflux:fanhub-preview-theme-changed';

/** Use storefront background luminance — not EchoFlux app dark mode — so Fan Hub tabs match My Page colors. */
function fanHubThemeBackgroundIsDark(backgroundHex: string): boolean {
  const h = backgroundHex.trim();
  const m = /^#([a-fA-F0-9]{6})$/i.exec(h);
  if (!m) return false;
  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return l < 0.45;
}

/** Pending selection when jumping from Messages (or elsewhere) to Fans tab. */
export type PendingFansTabSelection = {
  fanId: string;
  /** Thread display name — used if preference doc id ever diverges from uid. */
  displayLabel?: string;
};

export type PremiumStudioTabContextValue = {
  tab: string;
  setTab: (tab: string) => void;
  /** Fan Hub: open Fans tab and select this fan (matches Fans page fan card). */
  pendingFansTabSelection: PendingFansTabSelection | null;
  clearPendingFansTabSelection: () => void;
  openFanInFansTab: (fanId: string, displayLabel?: string) => void;
  /** Fan Hub Messages: after switching to Messages, select this thread id (from notification `data.threadId`). */
  pendingMessagesThreadId: string | null;
  clearPendingMessagesThreadId: () => void;
  openMessagesForThread: (threadId: string) => void;
  /** Fan Hub Posts: scroll feed to this post id (from post like/comment notifications). */
  pendingFeedPostId: string | null;
  clearPendingFeedPostId: () => void;
  /**
   * Fan Hub only: same --fan-* tokens as the outer shell (includes preview theme).
   * Apply on tab content wrappers so nested UI (e.g. Chat Session) isn’t stuck on CSS fallbacks.
   */
  fanHubCssVarBridge: React.CSSProperties | null;
};

const PremiumStudioTabContext = createContext<PremiumStudioTabContextValue | null>(null);
export const usePremiumStudioTab = () => useContext(PremiumStudioTabContext);

/** Legacy alias for Fan Hub tab when using unified layout */
export const useFanHubTab = () => usePremiumStudioTab();

interface PremiumStudioLayoutProps {
  children: React.ReactNode;
  /** When 'fanHub', show only Fan Hub tabs (/fan-hub?tab=...). When 'studio' or omitted, show only Premium Studio tabs (/studio?tab=...). */
  section?: 'studio' | 'fanHub';
}

/** Layout with tabs: Premium Studio (ideas, drops, etc.) or Fan Hub (myPage, feed, etc.) depending on section. */
export const PremiumStudioLayout: React.FC<PremiumStudioLayoutProps> = ({ children, section = 'studio' }) => {
  const isFanHub = section === 'fanHub';
  const tabIds = isFanHub ? [...FAN_HUB_TAB_IDS] : [...STUDIO_TAB_IDS];
  const pathPrefix = isFanHub ? '/fan-hub' : '/studio';
  const defaultTab = isFanHub ? 'myPage' : 'ideas';
  const labels = isFanHub ? FAN_HUB_TAB_LABELS : STUDIO_TAB_LABELS;

  const [tab, setTab] = useTabFromUrl(pathPrefix, tabIds, defaultTab);
  const [pendingFansTabSelection, setPendingFansTabSelection] = useState<PendingFansTabSelection | null>(null);
  const [pendingMessagesThreadId, setPendingMessagesThreadId] = useState<string | null>(null);
  const clearPendingMessagesThreadId = useCallback(() => setPendingMessagesThreadId(null), []);
  const [pendingFeedPostId, setPendingFeedPostId] = useState<string | null>(null);
  const clearPendingFeedPostId = useCallback(() => setPendingFeedPostId(null), []);
  const openMessagesForThread = useCallback(
    (threadId: string) => {
      if (!isFanHub) return;
      const id = threadId.trim();
      if (!id) return;
      setPendingMessagesThreadId(id);
      setTab('messages');
    },
    [isFanHub, setTab]
  );
  const clearPendingFansTabSelection = useCallback(() => setPendingFansTabSelection(null), []);
  const openFanInFansTab = useCallback(
    (fanId: string, displayLabel?: string) => {
      if (!isFanHub) return;
      const id = fanId.trim();
      if (!id) return;
      setPendingFansTabSelection({
        fanId: id,
        displayLabel: displayLabel?.trim() || undefined,
      });
      setTab('fans');
    },
    [isFanHub, setTab]
  );

  const unreadMessagesTabCount = useUnreadNewMessageNotificationCount(isFanHub ? null : false);
  const liveChatSessionsCount = useCreatorLiveChatSessionsCount(Boolean(isFanHub));
  /** Live premium chat uses the same thread — suppress message tab noise + bell (server also skips new_message notify). */
  const suppressFanHubDmNotifications = isFanHub && liveChatSessionsCount > 0;
  const messagesTabBadgeCount = suppressFanHubDmNotifications ? 0 : unreadMessagesTabCount;

  const handleFanHubNotificationNavigate = useCallback(
    (payload: FanHubNotificationNavigatePayload) => {
      if (!isFanHub) return;
      const { tab, threadId, postId } = resolveFanHubNotificationTarget(payload.type, payload.data);
      if (threadId) {
        openMessagesForThread(threadId);
      } else {
        if (postId) setPendingFeedPostId(postId);
        setTab(tab);
      }
    },
    [isFanHub, openMessagesForThread, setTab]
  );

  /** Apply Fan Hub tab/thread after navigating from EchoFlux header Firestore bell. */
  useEffect(() => {
    if (!isFanHub) return;
    try {
      const raw = sessionStorage.getItem(FAN_HUB_DEEPLINK_STORAGE_KEY);
      if (!raw) return;
      sessionStorage.removeItem(FAN_HUB_DEEPLINK_STORAGE_KEY);
      const parsed = JSON.parse(raw) as { tab?: string; threadId?: string; postId?: string };
      const tabId = typeof parsed.tab === 'string' ? parsed.tab.trim() : '';
      const threadId = typeof parsed.threadId === 'string' ? parsed.threadId.trim() : '';
      const postId = typeof parsed.postId === 'string' ? parsed.postId.trim() : '';
      if (threadId) {
        setPendingMessagesThreadId(threadId);
        setTab('messages');
      } else if (tabId && (FAN_HUB_TAB_IDS as readonly string[]).includes(tabId)) {
        setTab(tabId);
        if (postId) setPendingFeedPostId(postId);
      }
    } catch {
      try {
        sessionStorage.removeItem(FAN_HUB_DEEPLINK_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [isFanHub, setTab, setPendingMessagesThreadId]);

  /** Sync dm_muted_threads mirror so message badges respect conversations muted before this feature. */
  useEffect(() => {
    if (!isFanHub) return;
    const u = auth.currentUser;
    if (!u) return;
    void (async () => {
      try {
        const token = await u.getIdToken();
        await fetch('/api/fanDmMutedThreadsSync', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        /* ignore */
      }
    })();
  }, [isFanHub]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!isFanHub || tab !== 'messages' || !uid) return;
    void clearNewMessageNotificationBadge(uid, null);
  }, [isFanHub, tab]);

  const creatorId = isFanHub ? auth.currentUser?.uid : undefined;
  const fanTheme = useCreatorFanHubTheme(creatorId);
  const [previewTheme, setPreviewTheme] = useState<Partial<typeof fanTheme> | null>(null);
  const { showToast } = useUI();
  useEffect(() => {
    if (!isFanHub || typeof window === 'undefined') {
      setPreviewTheme(null);
      return;
    }
    const hydrate = () => {
      try {
        const raw = window.sessionStorage.getItem(FAN_HUB_PREVIEW_THEME_STORAGE_KEY);
        if (!raw) {
          setPreviewTheme(null);
          return;
        }
        const parsed = JSON.parse(raw) as Partial<typeof fanTheme>;
        setPreviewTheme(parsed && typeof parsed === 'object' ? parsed : null);
      } catch {
        setPreviewTheme(null);
      }
    };
    hydrate();
    window.addEventListener(FAN_HUB_PREVIEW_THEME_EVENT, hydrate);
    return () => window.removeEventListener(FAN_HUB_PREVIEW_THEME_EVENT, hydrate);
  }, [isFanHub]);
  const effectiveFanTheme = useMemo(
    () => ({ ...fanTheme, ...(previewTheme ?? {}) }),
    [fanTheme, previewTheme]
  );

  const fanHubSurfaceIsDark = useMemo(
    () => fanHubThemeBackgroundIsDark(effectiveFanTheme.background),
    [effectiveFanTheme.background]
  );

  const fanHubCssVarBridge = useMemo((): React.CSSProperties | null => {
    if (!isFanHub) return null;
    const { primary, background, text, textMuted, border, accentHover, fontFamily } = effectiveFanTheme;
    const sans = fontFamily ? ({ '--fan-sans': fontFamily } as React.CSSProperties) : {};
    const baseTokens = {
      '--fan-primary': primary,
      '--fan-accent-soft': `color-mix(in srgb, ${primary} 14%, transparent)`,
      '--fan-accent-hover': accentHover,
      ...sans,
    } as React.CSSProperties;
    return {
      ...baseTokens,
      '--fan-bg': background,
      '--fan-text': text,
      '--fan-text-muted': textMuted,
      '--fan-border': border,
    } as React.CSSProperties;
  }, [isFanHub, effectiveFanTheme]);

  const fanHubShellStyle = useMemo((): React.CSSProperties => {
    if (!isFanHub || !fanHubCssVarBridge) return {};
    const { background, text, fontFamily } = effectiveFanTheme;
    return {
      ...fanHubCssVarBridge,
      background,
      /** Dark storefront: keep explicit shell text. Light storefront: color comes from `.stormij-theme--light` in CSS so `html.dark` + Tailwind `dark:bg-gray-*` panels do not inherit dark `--fan-text` on charcoal. */
      ...(fanHubSurfaceIsDark ? { color: text } : {}),
      ...(fontFamily ? { fontFamily } : {}),
    };
  }, [isFanHub, effectiveFanTheme, fanHubCssVarBridge, fanHubSurfaceIsDark]);

  const inner = (
    <>
      <div
        className={`mb-4 flex flex-wrap items-center justify-between gap-2 pb-2 ${
          isFanHub ? 'border-b' : 'border-b border-gray-200 dark:border-gray-700'
        }`}
        style={
          isFanHub
            ? {
                borderColor: fanHubSurfaceIsDark
                  ? `${effectiveFanTheme.primary}40`
                  : `${effectiveFanTheme.primary}33`,
              }
            : undefined
        }
      >
        <div className="flex flex-wrap gap-1 min-w-0 flex-1">
          {tabIds.map((id) => (
            <button
              key={id}
              id={isFanHub && id === 'myPage' ? 'tour-step-fanhub-mypage' : undefined}
              type="button"
              onClick={() => setTab(id)}
              className={`px-3 py-2 rounded-t-md text-sm font-medium transition-colors ${
                tab === id
                  ? isFanHub
                    ? 'text-white shadow-sm'
                    : 'bg-primary-600 text-white'
                  : isFanHub
                    ? 'hover:opacity-95'
                    : 'bg-gray-100 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
              style={
                isFanHub
                  ? tab === id
                    ? { backgroundColor: effectiveFanTheme.primary, color: '#fff' }
                    : fanHubSurfaceIsDark
                      ? {
                          backgroundColor: `color-mix(in srgb, ${effectiveFanTheme.primary} 12%, #1e293b)`,
                          color: '#e2e8f0',
                          border: `1px solid color-mix(in srgb, ${effectiveFanTheme.primary} 28%, #334155)`,
                        }
                      : {
                          backgroundColor: `color-mix(in srgb, ${effectiveFanTheme.primary} 10%, ${effectiveFanTheme.background})`,
                          color: effectiveFanTheme.text,
                          border: `1px solid color-mix(in srgb, ${effectiveFanTheme.primary} 22%, ${effectiveFanTheme.border})`,
                        }
                  : undefined
              }
            >
              <span className="inline-flex items-center gap-1.5">
                {labels[id as keyof typeof labels]}
                {isFanHub && id === 'messages' && messagesTabBadgeCount > 0 ? (
                  <span
                    className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-none inline-flex items-center justify-center text-white"
                    style={{ backgroundColor: effectiveFanTheme.primary }}
                    aria-label={`${messagesTabBadgeCount} unread messages`}
                  >
                    {messagesTabBadgeCount > 9 ? '9+' : messagesTabBadgeCount}
                  </span>
                ) : null}
                {isFanHub && id === 'sessions' && liveChatSessionsCount > 0 ? (
                  <span
                    className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-none inline-flex items-center justify-center text-white ring-1 ring-white/35"
                    style={{ backgroundColor: effectiveFanTheme.primary }}
                    aria-label={`${liveChatSessionsCount} live chat session${liveChatSessionsCount === 1 ? '' : 's'}`}
                    title="Live premium chat session running — open Chat Session"
                  >
                    {liveChatSessionsCount > 9 ? '9+' : liveChatSessionsCount}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
        {isFanHub ? (
          <FanHubNotificationBell
            accentColor={effectiveFanTheme.primary}
            iconColor={fanHubSurfaceIsDark ? '#e2e8f0' : effectiveFanTheme.text}
            className="shrink-0"
            onNavigate={handleFanHubNotificationNavigate}
            hidden={suppressFanHubDmNotifications}
            showToast={showToast}
          />
        ) : null}
      </div>
      <PremiumStudioTabContext.Provider
        value={{
          tab,
          setTab,
          pendingFansTabSelection: isFanHub ? pendingFansTabSelection : null,
          clearPendingFansTabSelection: isFanHub ? clearPendingFansTabSelection : () => {},
          openFanInFansTab,
          pendingMessagesThreadId: isFanHub ? pendingMessagesThreadId : null,
          clearPendingMessagesThreadId: isFanHub ? clearPendingMessagesThreadId : () => {},
          openMessagesForThread: isFanHub ? openMessagesForThread : () => {},
          pendingFeedPostId: isFanHub ? pendingFeedPostId : null,
          clearPendingFeedPostId: isFanHub ? clearPendingFeedPostId : () => {},
          fanHubCssVarBridge: isFanHub ? fanHubCssVarBridge : null,
        }}
      >
        {children}
      </PremiumStudioTabContext.Provider>
    </>
  );

  if (isFanHub) {
    const fanHubThemeClass =
      !fanHubSurfaceIsDark ? 'stormij-theme stormij-theme--light' : 'stormij-theme';
    return (
      <div
        className={`${fanHubThemeClass} -m-6 min-h-full p-6 rounded-xl shadow-sm border border-black/5 dark:border-slate-600/60`}
        style={{
          ...fanHubShellStyle,
          borderColor: fanHubSurfaceIsDark
            ? `color-mix(in srgb, ${effectiveFanTheme.primary} 32%, #334155)`
            : `${effectiveFanTheme.primary}22`,
        }}
      >
        <div className="max-w-7xl mx-auto">{inner}</div>
      </div>
    );
  }

  return <div className="max-w-7xl mx-auto">{inner}</div>;
};

/** Legacy layout: still supports studio | fanHub mode for backward compat (e.g. direct /fan links). Prefer PremiumStudioLayout with section prop. */
export const StudioFanHubLayout: React.FC<{ mode: 'studio' | 'fanHub'; children: React.ReactNode }> = ({ mode, children }) => (
  <PremiumStudioLayout section={mode}>{children}</PremiumStudioLayout>
);
