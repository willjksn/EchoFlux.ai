import React, { useMemo } from 'react';
import { useAppContext } from './AppContext';

export const AnnouncementBanner: React.FC = () => {
  const { announcements, dismissAnnouncement, setActivePage } = useAppContext();

  const banner = useMemo(() => {
    return announcements.find(a => a.isActive && a.isBanner) || null;
  }, [announcements]);

  if (!banner) return null;

  const colors =
    banner.type === 'warning'
      ? 'bg-yellow-50 border-yellow-200 text-yellow-900 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-100'
      : banner.type === 'success'
        ? 'bg-green-50 border-green-200 text-green-900 dark:bg-green-900/20 dark:border-green-800 dark:text-green-100'
        : 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-100';

  return (
    <div className={`border-b ${colors}`}>
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-start gap-3">
        <div className="flex-1">
          <div className="font-semibold">{banner.title}</div>
          <div className="text-sm opacity-90 mt-0.5">{banner.body}</div>
        </div>

        {banner.actionLabel && banner.actionPage && (
          <button
            onClick={() => setActivePage(banner.actionPage!)}
            className="shrink-0 px-3 py-1.5 rounded-md text-sm font-semibold bg-white/70 hover:bg-white dark:bg-gray-800/60 dark:hover:bg-gray-800 border border-black/10 dark:border-white/10"
          >
            {banner.actionLabel}
          </button>
        )}

        <button
          onClick={() => dismissAnnouncement(banner.id)}
          className="shrink-0 p-2 rounded-md hover:bg-black/5 dark:hover:bg-white/10"
          aria-label="Dismiss announcement"
          title="Dismiss"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};


