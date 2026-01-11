import React from 'react';
import { Page } from '../types';
import { DashboardIcon, AnalyticsIcon, SettingsIcon, LogoIcon, ComposeIcon, TrendingIcon, TeamIcon, RocketIcon, BriefcaseIcon, AdminIcon, AutomationIcon, CalendarIcon, KanbanIcon, GlobeIcon, TargetIcon, SparklesIcon, ImageIcon, ChatIcon } from './icons/UIIcons';
import { OFFLINE_MODE } from '../constants';
import { useAppContext } from './AppContext';

interface NavItemProps {
  page: Page;
  icon: React.ReactNode;
  label: string;
  tourId?: string;
}

const NavItem: React.FC<NavItemProps> = ({ page, icon, label, tourId }) => {
  const { activePage, setActivePage, setIsSidebarOpen } = useAppContext();
  
  return (
    <li id={tourId}>
      <button
        type="button"
        onClick={() => {
          setActivePage(page);
          setIsSidebarOpen(false);
        }}
        className={`w-full text-left flex items-center p-3 my-1 rounded-lg transition-colors ${
          activePage === page
            ? 'bg-primary-500 text-white'
            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
        }`}
      >
        {icon}
        <span className="ml-3 font-medium">{label}</span>
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

  const allNavItems: (Omit<NavItemProps, 'page' | 'label'> & { page: Page | 'admin', label: string })[] = [
    { page: 'dashboard', icon: <DashboardIcon />, label: 'Dashboard' },
  // Inbox hidden in studio/offline mode (can be re-enabled later)
  { page: 'inbox', icon: <ChatIcon />, label: 'Inbox' },
    { page: 'compose', icon: <ComposeIcon />, label: 'Compose', tourId: 'tour-step-3-compose-nav' },
    { page: 'automation', icon: <AutomationIcon />, label: 'Automation' },
    { page: 'mediaLibrary', icon: <ImageIcon />, label: 'Media Library' },
    { page: 'approvals', icon: <KanbanIcon />, label: 'Approvals' },
    { page: 'calendar', icon: <CalendarIcon />, label: 'Calendar' },
    { page: 'strategy', icon: <TargetIcon />, label: 'Strategy' },
    { page: 'analytics', icon: <AnalyticsIcon />, label: 'Analytics', tourId: 'tour-step-2-analytics-nav' },
    { page: 'opportunities', icon: <TrendingIcon />, label: 'Opportunities', tourId: 'tour-step-opportunities-nav' },
    { page: 'ads', icon: <SparklesIcon />, label: 'Ad Generator' },
    { page: 'team', icon: <TeamIcon />, label: 'Team', tourId: 'tour-step-team-nav' },
    { page: 'clients', icon: <BriefcaseIcon />, label: 'Clients', tourId: 'tour-step-clients-nav' },
    { page: 'bio', icon: <GlobeIcon />, label: 'Link in Bio' },
    { page: 'onlyfansStudio', icon: <SparklesIcon />, label: 'Premium Content Studio' },
    { page: 'emailCenter', icon: <ComposeIcon />, label: 'Email Center' },
    { page: 'settings', icon: <SettingsIcon />, label: 'Settings' },
    { page: 'admin', icon: <AdminIcon />, label: 'Admin' },
  ];

  const navItems = allNavItems.filter(item => {
      // Caption plan: Only Compose and Settings
      if (user.plan === 'Caption') {
          return item.page === 'compose' || item.page === 'settings';
      }
      
      // OnlyFans Studio plan: Only OnlyFans Studio (Settings are within OnlyFans Studio)
      if (user.plan === 'OnlyFansStudio') {
          return item.page === 'onlyfansStudio';
      }
      
      switch (item.page) {
          case 'analytics':
              // Hide Analytics in offline studio mode (depends on live social data)
              return false;
          case 'automation':
              // Hide Automation in offline mode until social connections are working
              if (OFFLINE_MODE) {
                  return false;
              }
              return user.plan !== 'Free';
          case 'calendar':
              return user.plan !== 'Free';
          case 'bio':
              // All plans can access Link-in-Bio (Free: 1 link, Pro: 5, Elite: unlimited)
              return true;
          case 'strategy':
              // Free plan gets basic strategy (Gemini only, no live research)
              return true; // All plans can access Strategy
          case 'opportunities':
              // Opportunities/Trends: Creator feature, also available to Agency (Business or Creator) since they manage creators
              if (user.userType === 'Business' && user.plan !== 'Agency') {
                  return false;
              }
              // Creator users OR Agency plan: Pro, Elite, Agency plans
              return ['Pro', 'Elite', 'Agency'].includes(user.plan);
          case 'ads':
              // Hide Ad Generator for now while focusing on studio mode
              return false;
          case 'approvals':
              return ['Elite', 'Agency'].includes(user.plan);
          case 'inbox':
              // Hide Inbox entirely for now (offline studio mode)
              return false;
          case 'team':
          case 'clients':
              // Hide team/clients for now (creator focus); admins handled above
              return false;
          case 'onlyfansStudio':
              // Premium Content Studio: allow OnlyFansStudio/Elite/Agency plans and Admin override
              return ['OnlyFansStudio', 'Elite', 'Agency'].includes(user.plan) || user.role === 'Admin';
          case 'emailCenter':
              // Email Center is exposed for Admin users
              return user.role === 'Admin';
          case 'admin':
              // Admin page is only visible to Admin users
              return user.role === 'Admin';
          default:
              return true; 
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
            {navItems.map(item => <NavItem key={item.page} {...item} />)}
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