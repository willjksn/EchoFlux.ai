import React from 'react';
import { Page } from '../types';
import { DashboardIcon, AnalyticsIcon, SettingsIcon, LogoIcon, ComposeIcon, TrendingIcon, TeamIcon, RocketIcon, BriefcaseIcon, AdminIcon, AutomationIcon, CalendarIcon, KanbanIcon, GlobeIcon, TargetIcon, SparklesIcon, ImageIcon, ChatIcon } from './icons/UIIcons';
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
        onClick={() => {
          // If clicking Inbox, set localStorage flag and navigate to dashboard
          if (page === 'inbox') {
            localStorage.setItem('dashboardViewMode', 'Inbox');
            setActivePage('dashboard');
          } else {
            setActivePage(page);
          }
          setIsSidebarOpen(false);
        }}
        className={`w-full text-left flex items-center p-3 my-1 rounded-lg transition-colors ${
          (page === 'inbox' && activePage === 'dashboard' && localStorage.getItem('dashboardViewMode') === 'Inbox') ||
          (page !== 'inbox' && activePage === page && !(page === 'dashboard' && localStorage.getItem('dashboardViewMode') === 'Inbox'))
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
    { page: 'inbox', icon: <ChatIcon />, label: 'Inbox' },
    { page: 'compose', icon: <ComposeIcon />, label: 'Compose', tourId: 'tour-step-3-compose-nav' },
    { page: 'mediaLibrary', icon: <ImageIcon />, label: 'Media Library' },
    { page: 'automation', icon: <AutomationIcon />, label: 'Automation' },
    { page: 'strategy', icon: <TargetIcon />, label: 'Strategy' },
    { page: 'ads', icon: <SparklesIcon />, label: 'Ad Generator' },
    { page: 'opportunities', icon: <TrendingIcon />, label: 'Opportunities', tourId: 'tour-step-opportunities-nav' },
    { page: 'calendar', icon: <CalendarIcon />, label: 'Calendar' },
    { page: 'approvals', icon: <KanbanIcon />, label: 'Workflow' },
    { page: 'bio', icon: <GlobeIcon />, label: 'Link in Bio' },
    { page: 'analytics', icon: <AnalyticsIcon />, label: 'Analytics', tourId: 'tour-step-2-analytics-nav' },
    { page: 'team', icon: <TeamIcon />, label: 'Team', tourId: 'tour-step-team-nav' },
    { page: 'clients', icon: <BriefcaseIcon />, label: 'Clients', tourId: 'tour-step-clients-nav' },
    { page: 'settings', icon: <SettingsIcon />, label: 'Settings' },
    { page: 'admin', icon: <AdminIcon />, label: 'Admin' },
  ];

  const navItems = allNavItems.filter(item => {
      if (user.role === 'Admin') {
          return true;
      }
      switch (item.page) {
          case 'analytics':
          case 'automation':
          case 'calendar':
          case 'bio':
          case 'strategy':
              return user.plan !== 'Free';
          case 'opportunities':
              // Opportunities/Trends: Creator feature, also available to Agency (Business or Creator) since they manage creators
              if (user.userType === 'Business' && user.plan !== 'Agency') {
                  return false;
              }
              // Creator users OR Agency plan: Pro, Elite, Agency plans
              return ['Pro', 'Elite', 'Agency'].includes(user.plan);
          case 'ads':
              // Available on Pro, Elite, Growth, Starter, and Agency plans
              // NOT available on Free plan
              const userPlan = user.plan || 'Free';
              return userPlan !== 'Free' && ['Pro', 'Elite', 'Growth', 'Starter', 'Agency'].includes(userPlan);
          case 'approvals':
              return ['Elite', 'Agency'].includes(user.plan);
          case 'team':
              // STRICT CHECK: Only Agency Plan for Business users
              return user.plan === 'Agency' && user.userType === 'Business';
          case 'clients':
              // STRICT CHECK: Only Agency Plan
              return user.plan === 'Agency';
          case 'admin':
              return false;
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
          <div className="flex items-center text-primary-600 dark:text-primary-400">
            <LogoIcon />
            <span className="ml-2 text-xl font-bold">EngageSuite.ai</span>
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