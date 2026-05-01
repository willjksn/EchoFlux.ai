import React, { createContext, useContext } from 'react';
import { useTabFromUrl } from '../src/hooks/useTabFromUrl';
import { STUDIO_TAB_IDS, FAN_HUB_TAB_IDS, STUDIO_TAB_LABELS, FAN_HUB_TAB_LABELS } from '../constants';

const FanHubTabContext = createContext<{ tab: string; setTab: (tab: string) => void } | null>(null);
export const useFanHubTab = () => useContext(FanHubTabContext);

interface StudioFanHubLayoutProps {
  mode: 'studio' | 'fanHub';
  children: React.ReactNode;
}

export const StudioFanHubLayout: React.FC<StudioFanHubLayoutProps> = ({ mode, children }) => {
  const pathPrefix = mode === 'studio' ? '/studio' : '/fan-hub';
  const tabIds = mode === 'studio' ? [...STUDIO_TAB_IDS] : [...FAN_HUB_TAB_IDS];
  const defaultTab = mode === 'studio' ? 'ideas' : 'myPage';
  const labels = mode === 'studio' ? STUDIO_TAB_LABELS : FAN_HUB_TAB_LABELS;

  const [tab, setTab] = useTabFromUrl(pathPrefix, tabIds, defaultTab);

  const fanHubTabValue = mode === 'fanHub' ? { tab, setTab } : null;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-4 flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700 pb-2">
        {tabIds.map((id) => (
          <button
            key={id}
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
      {fanHubTabValue ? (
        <FanHubTabContext.Provider value={fanHubTabValue}>
          {children}
        </FanHubTabContext.Provider>
      ) : (
        children
      )}
    </div>
  );
};
