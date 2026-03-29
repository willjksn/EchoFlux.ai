import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTabFromUrl } from '../src/hooks/useTabFromUrl';
import { useCreatorFanHubTheme } from '../src/hooks/useCreatorFanHubTheme';
import { useUI } from './contexts/UIContext';
import { auth } from '../firebaseConfig';
import { STUDIO_TAB_IDS, FAN_HUB_TAB_IDS, STUDIO_TAB_LABELS, FAN_HUB_TAB_LABELS } from '../constants';
import { FanHubNotificationBell } from './FanHubNotificationBell';
import {
  useUnreadNewMessageNotificationCount,
  clearNewMessageNotificationBadge,
} from './useUnreadNewMessageNotifications';

const FAN_HUB_PREVIEW_THEME_STORAGE_KEY = 'echoflux:fanhub-preview-theme';
const FAN_HUB_PREVIEW_THEME_EVENT = 'echoflux:fanhub-preview-theme-changed';

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
  /** When 'fanHub', show only Fan Hub tabs (/fan?tab=...). When 'studio' or omitted, show only Premium Studio tabs (/studio?tab=...). */
  section?: 'studio' | 'fanHub';
}

/** Layout with tabs: Premium Studio (ideas, drops, etc.) or Fan Hub (myPage, feed, etc.) depending on section. */
export const PremiumStudioLayout: React.FC<PremiumStudioLayoutProps> = ({ children, section = 'studio' }) => {
  const isFanHub = section === 'fanHub';
  const tabIds = isFanHub ? [...FAN_HUB_TAB_IDS] : [...STUDIO_TAB_IDS];
  const pathPrefix = isFanHub ? '/fan' : '/studio';
  const defaultTab = isFanHub ? 'myPage' : 'ideas';
  const labels = isFanHub ? FAN_HUB_TAB_LABELS : STUDIO_TAB_LABELS;

  const [tab, setTab] = useTabFromUrl(pathPrefix, tabIds, defaultTab);
  const [pendingFansTabSelection, setPendingFansTabSelection] = useState<PendingFansTabSelection | null>(null);
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
  const { isDarkMode } = useUI();
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
    if (isDarkMode) {
      const bg2 = '#111827';
      const ink = '#f1f5f9';
      const muted = '#94a3b8';
      const edge = '#334155';
      return {
        ...baseTokens,
        '--fan-bg': bg2,
        '--fan-text': ink,
        '--fan-text-muted': muted,
        '--fan-border': edge,
      };
    }
    return {
      ...baseTokens,
      '--fan-bg': background,
      '--fan-text': text,
      '--fan-text-muted': textMuted,
      '--fan-border': border,
    };
  }, [isFanHub, effectiveFanTheme, isDarkMode]);

  const fanHubShellStyle = useMemo((): React.CSSProperties => {
    if (!isFanHub || !fanHubCssVarBridge) return {};
    const { background, text, fontFamily } = effectiveFanTheme;
    if (isDarkMode) {
      const bg = '#0f172a';
      const bg2 = '#111827';
      const ink = '#f1f5f9';
      return {
        ...fanHubCssVarBridge,
        background: `linear-gradient(180deg, ${bg} 0%, ${bg2} 40%, ${bg2} 100%)`,
        color: ink,
        ...(fontFamily ? { fontFamily } : {}),
      };
    }
    return {
      ...fanHubCssVarBridge,
      background,
      color: text,
      ...(fontFamily ? { fontFamily } : {}),
    };
  }, [isFanHub, isDarkMode, effectiveFanTheme, fanHubCssVarBridge]);

  const inner = (
    <>
      <div
        className={`mb-4 flex flex-wrap items-center justify-between gap-2 pb-2 ${
          isFanHub ? 'border-b' : 'border-b border-gray-200 dark:border-gray-700'
        }`}
        style={
          isFanHub
            ? { borderColor: isDarkMode ? `${effectiveFanTheme.primary}40` : `${effectiveFanTheme.primary}33` }
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
                    : isDarkMode
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
                {isFanHub && id === 'messages' && unreadMessagesTabCount > 0 ? (
                  <span
                    className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-none inline-flex items-center justify-center text-white"
                    style={{ backgroundColor: effectiveFanTheme.primary }}
                    aria-label={`${unreadMessagesTabCount} unread messages`}
                  >
                    {unreadMessagesTabCount > 9 ? '9+' : unreadMessagesTabCount}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
        {isFanHub ? (
          <FanHubNotificationBell
            accentColor={effectiveFanTheme.primary}
            iconColor={isDarkMode ? '#e2e8f0' : effectiveFanTheme.text}
            className="shrink-0"
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
          fanHubCssVarBridge: isFanHub ? fanHubCssVarBridge : null,
        }}
      >
        {children}
      </PremiumStudioTabContext.Provider>
    </>
  );

  if (isFanHub) {
    return (
      <div
        className="stormij-theme -m-6 min-h-full p-6 rounded-xl shadow-sm border border-black/5 dark:border-slate-600/60"
        style={{
          ...fanHubShellStyle,
          borderColor: isDarkMode
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
