import React, { createContext, useContext, useMemo } from 'react';
import { useTabFromUrl } from '../src/hooks/useTabFromUrl';
import { useCreatorFanHubTheme } from '../src/hooks/useCreatorFanHubTheme';
import { auth } from '../firebaseConfig';
import { STUDIO_TAB_IDS, FAN_HUB_TAB_IDS, STUDIO_TAB_LABELS, FAN_HUB_TAB_LABELS } from '../constants';

const PremiumStudioTabContext = createContext<{ tab: string; setTab: (tab: string) => void } | null>(null);
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

  const creatorId = isFanHub ? auth.currentUser?.uid : undefined;
  const fanTheme = useCreatorFanHubTheme(creatorId);

  const fanHubShellStyle = useMemo((): React.CSSProperties => {
    if (!isFanHub) return {};
    const { primary, background, text, textMuted, border, accentHover, fontFamily } = fanTheme;
    return {
      '--fan-primary': primary,
      '--fan-bg': background,
      '--fan-text': text,
      '--fan-text-muted': textMuted,
      '--fan-border': border,
      '--fan-accent-hover': accentHover,
      background,
      color: text,
      ...(fontFamily ? ({ fontFamily, '--fan-sans': fontFamily } as React.CSSProperties) : {}),
    };
  }, [isFanHub, fanTheme]);

  const inner = (
    <>
      <div
        className={`mb-4 flex flex-wrap gap-1 pb-2 ${
          isFanHub ? 'border-b' : 'border-b border-gray-200 dark:border-gray-700'
        }`}
        style={
          isFanHub
            ? { borderColor: `${fanTheme.primary}33` }
            : undefined
        }
      >
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
                  ? { backgroundColor: fanTheme.primary, color: '#fff' }
                  : {
                      backgroundColor: `color-mix(in srgb, ${fanTheme.primary} 10%, ${fanTheme.background})`,
                      color: fanTheme.text,
                      border: `1px solid color-mix(in srgb, ${fanTheme.primary} 22%, ${fanTheme.border})`,
                    }
                : undefined
            }
          >
            {labels[id as keyof typeof labels]}
          </button>
        ))}
      </div>
      <PremiumStudioTabContext.Provider value={{ tab, setTab }}>
        {children}
      </PremiumStudioTabContext.Provider>
    </>
  );

  if (isFanHub) {
    return (
      <div
        className="stormij-theme -m-6 min-h-full p-6 rounded-xl shadow-sm border border-black/5"
        style={{
          ...fanHubShellStyle,
          borderColor: `${fanTheme.primary}22`,
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
