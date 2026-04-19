import React from 'react';
import { Page } from '../types';
import { DashboardIcon, SettingsIcon, LogoIcon, ComposeIcon, AdminIcon, CalendarIcon, TargetIcon, SparklesIcon, ImageIcon, HeartIcon, GlobeIcon } from './icons/UIIcons';
import { useAppContext } from './AppContext';
import { hasFanHubStudioRouteAccess, hasPremiumStudioRouteAccess } from '../src/utils/planAccess';
import { useFanHubCreatorNotificationsUnread } from '../src/hooks/useFanHubCreatorNotificationsUnread';

interface NavItemProps {
  page: Page;
  icon: React.ReactNode;
  label: string;
  tourId?: string;
  /** Fan Hub: unread in-app notifications while creator is elsewhere in EchoFlux */
  badgeCount?: number;
}

const NavItem: React.FC<NavItemProps> = ({ page, icon, label, tourId, badgeCount }) => {
  const { activePage, setActivePage, setIsSidebarOpen } = useAppContext();
  const showBadge = typeof badgeCount === 'number' && badgeCount > 0;
  const badgeLabel =
    badgeCount != null && badgeCount > 9 ? '9+' : badgeCount != null && badgeCount > 0 ? String(badgeCount) : '';

  return (
    <li id={tourId}>
      <button
        type="button"
        onClick={() => {
          setActivePage(page);
          setIsSidebarOpen(false);
        }}
        className={`w-full text-left flex items-center gap-2 p-3 my-1 rounded-lg transition-colors ${
          activePage === page
            ? 'bg-primary-500 text-white'
            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
        }`}
        aria-label={showBadge ? `${label}, ${badgeCount} unread Fan Hub notifications` : undefined}
      >
        <span className="shrink-0">{icon}</span>
        <span className="ml-1 font-medium flex-1 min-w-0">{label}</span>
        {showBadge ? (
          <span
            className={`shrink-0 min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-bold leading-none flex items-center justify-center bg-red-500 text-white shadow-sm ${
              activePage === page ? 'ring-2 ring-white/90' : ''
            }`}
            aria-hidden
          >
            {badgeLabel}
          </span>
        ) : null}
      </button>
    </li>
  );
};

export const Sidebar: React.FC = () => {
  const { user, isSidebarOpen, setIsSidebarOpen, activePage, setActivePage } = useAppContext();

  if (!user) {
    return null;
  }

  const isBusiness = user.userType === 'Business';
  const autopilotLabel = isBusiness ? 'Marketing Manager' : 'AI Autopilot';

  // Premium Studio: Pro/CreatorPro -> upgrade screen; Elite/CreatorElite/OFS/Agency -> full studio. Fan Hub: all paid creator tiers above.
  const hasFanHubAccess = hasFanHubStudioRouteAccess(user);
  const hasPremiumStudioAccess = hasPremiumStudioRouteAccess(user);
  const trackFanHubSidebarBadge = hasFanHubAccess || hasPremiumStudioAccess;
  const fanHubUnreadCount = useFanHubCreatorNotificationsUnread(trackFanHubSidebarBadge);
  /** Always mirror the Fan Hub bell on the nav row, including while Fan Hub is open (selected). */
  const fanHubSidebarBadge = trackFanHubSidebarBadge ? fanHubUnreadCount : 0;

  const allNavItems: (Omit<NavItemProps, 'page' | 'label'> & { page: Page | 'admin', label: string })[] = [
    // MAIN
    { page: 'dashboard', icon: <DashboardIcon />, label: 'Dashboard', tourId: 'tour-step-1-dashboard' },
    { page: 'strategy', icon: <TargetIcon />, label: 'What to Post' },
    { page: 'compose', icon: <ComposeIcon />, label: 'Create Post', tourId: 'tour-step-3-compose-nav' },
    { page: 'calendar', icon: <CalendarIcon />, label: 'Calendar' },
    { page: 'mediaLibrary', icon: <ImageIcon />, label: 'Vault' },
    ...(hasFanHubAccess ? [{ page: (hasPremiumStudioAccess ? 'onlyfansStudio' : 'premiumStudioUpgrade') as Page, icon: <SparklesIcon />, label: 'Premium Studio' }] : []),
    ...((hasFanHubAccess || hasPremiumStudioAccess) ? [{ page: 'fanHub' as Page, icon: <HeartIcon />, label: 'Fan Hub', tourId: 'tour-step-fanhub-nav' }] : []),
    { page: 'witmePage', icon: <GlobeIcon />, label: 'Witme Page' },
    { page: 'settings', icon: <SettingsIcon />, label: 'Settings' },
    { page: 'admin', icon: <AdminIcon />, label: 'Admin' },
  ];

  const navItems = allNavItems.filter(item => {
      if (user.plan === 'Caption') return item.page === 'compose' || item.page === 'settings';
      if (user.plan === 'OnlyFansStudio') return item.page === 'onlyfansStudio' || item.page === 'fanHub';
      switch (item.page) {
          case 'dashboard':
          case 'strategy':
          case 'compose':
          case 'settings':
          case 'mediaLibrary':
              return true;
          case 'admin':
              return user.role === 'Admin';
          case 'calendar':
              return hasFanHubStudioRouteAccess(user);
          case 'onlyfansStudio':
              return hasPremiumStudioAccess;
          case 'premiumStudioUpgrade':
              return hasFanHubAccess && !hasPremiumStudioAccess;
          case 'fanHub':
              return hasFanHubAccess || hasPremiumStudioAccess;
          case 'witmePage':
              return user.role === 'Admin';
          default:
              return false;
      }
  }) as NavItemProps[];


  const secondaryNavItems: Array<{ page: Page; label: string }> = [
      { page: 'about', label: 'About Us' },
      { page: 'contact', label: 'Contact Us' },
      { page: 'faq', label: 'FAQs' },
      { page: 'terms', label: 'Terms of Service' },
      { page: 'privacy', label: 'Privacy Policy' },
  ];

  return (
    <>
      <div className={`fixed inset-0 z-20 bg-black bg-opacity-50 transition-opacity lg:hidden ${isSidebarOpen ? 'block' : 'hidden'}`} onClick={() => setIsSidebarOpen(false)}></div>
      <aside className={`fixed top-0 left-0 z-30 w-64 h-full bg-white dark:bg-gray-800 shadow-xl transition-transform transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:inset-0 flex flex-col`}>
        <div className="flex items-center justify-center h-20 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center">
            <LogoIcon />
            <span className="ml-2 text-xl font-bold" style={{ color: '#2563eb' }}>EchoFlux.ai</span>
          </div>
        </div>
        <nav className="p-4 flex-grow overflow-y-auto custom-scrollbar">
          <ul>
            {navItems.map((item) => (
              <NavItem
                key={item.page}
                {...item}
                badgeCount={item.page === 'fanHub' ? fanHubSidebarBadge : undefined}
              />
            ))}
          </ul>
        </nav>
        <div className="p-2.5 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 bg-gray-50 dark:bg-gray-900/50">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 justify-center text-[10px] text-gray-500 dark:text-gray-400">
            {secondaryNavItems.map((item, idx) => (
              <React.Fragment key={item.page}>
                <button
                  type="button"
                  onClick={() => {
                    setActivePage(item.page);
                    setIsSidebarOpen(false);
                  }}
                  className={`hover:text-primary-600 dark:hover:text-primary-400 transition-colors ${
                    activePage === item.page ? 'text-primary-600 dark:text-primary-400 font-semibold' : ''
                  }`}
                >
                  {item.label}
                </button>
                {idx < secondaryNavItems.length - 1 && (
                  <span className="text-gray-300 dark:text-gray-600 select-none">•</span>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
};