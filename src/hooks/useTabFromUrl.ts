import { useState, useEffect, useCallback } from 'react';

/**
 * Syncs internal tab state with URL query param for deep linking.
 * Use on /studio and /fan-hub pages. Supports back/forward via popstate.
 * @param pathPrefix - e.g. '/studio' or '/fan-hub'
 * @param validTabs - allowed tab id values
 * @param defaultTab - when no ?tab= or invalid
 */
export function useTabFromUrl(
  pathPrefix: string,
  validTabs: readonly string[],
  defaultTab: string
): [string, (tab: string) => void] {
  const parseTab = useCallback(() => {
    if (typeof window === 'undefined') return defaultTab;
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tab');
    if (t && validTabs.includes(t)) return t;
    return defaultTab;
  }, [defaultTab, validTabs]);

  const [tab, setTabState] = useState<string>(parseTab);

  const setTab = useCallback(
    (newTab: string) => {
      if (!validTabs.includes(newTab)) return;
      setTabState(newTab);
      const url = `${pathPrefix}?tab=${encodeURIComponent(newTab)}`;
      window.history.pushState({}, '', url);
    },
    [pathPrefix, validTabs]
  );

  // Initial read from URL (e.g. deep link)
  useEffect(() => {
    setTabState(parseTab());
  }, [pathPrefix, parseTab]);

  // Back/forward: sync tab from URL
  useEffect(() => {
    const onPopState = () => setTabState(parseTab());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [parseTab]);

  const normalizedTab = validTabs.includes(tab) ? tab : parseTab();

  return [normalizedTab, setTab];
}
