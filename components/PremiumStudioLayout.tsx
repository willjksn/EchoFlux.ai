import React, { createContext, useContext } from 'react';
import { useTabFromUrl } from '../src/hooks/useTabFromUrl';
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

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-4 flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700 pb-2">
        {tabIds.map((id) => (
          <button
            key={id}
            id={isFanHub && id === 'myPage' ? 'tour-step-fanhub-mypage' : undefined}
            type="button"
            onClick={() => setTab(id)}
            className={`px-3 py-2 rounded-t-md text-sm font-medium transition-colors ${
              tab === id
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {labels[id as keyof typeof labels]}
          </button>
        ))}
      </div>
      <PremiumStudioTabContext.Provider value={{ tab, setTab }}>
        {children}
      </PremiumStudioTabContext.Provider>
    </div>
  );
};

/** Legacy layout: still supports studio | fanHub mode for backward compat (e.g. direct /fan links). Prefer PremiumStudioLayout with section prop. */
export const StudioFanHubLayout: React.FC<{ mode: 'studio' | 'fanHub'; children: React.ReactNode }> = ({ mode, children }) => (
  <PremiumStudioLayout section={mode}>{children}</PremiumStudioLayout>
);
