import React from 'react';
import { Page } from '../types';
import { DashboardIcon, AnalyticsIcon, SettingsIcon, LogoIcon, ComposeIcon, TrendingIcon, TeamIcon, RocketIcon, InfoIcon, MailIcon, BriefcaseIcon, QuestionIcon, AdminIcon, LockIcon, AutomationIcon, CalendarIcon, KanbanIcon, GlobeIcon, TargetIcon } from './icons/UIIcons';
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
  const { user, isSidebarOpen, setIsSidebarOpen } = useAppContext();

  if (!user) {
    return null;
  }

  const isBusiness = user.userType === 'Business';
  const autopilotLabel = isBusiness ? 'Marketing Manager' : 'AI Autopilot';

  const allNavItems: (Omit<NavItemProps, 'page' | 'label'> & { page: Page | 'admin', label: string })[] = [
    { page: 'dashboard', icon: <DashboardIcon />, label: 'Dashboard' },
    { page: 'compose', icon: <ComposeIcon />, label: 'Compose', tourId: 'tour-step-3-compose-nav' },
    { page: 'automation', icon: <AutomationIcon />, label: 'Automation' },
    { page: 'autopilot', icon: <RocketIcon />, label: autopilotLabel, tourId: 'tour-step-autopilot-nav' },
    { page: 'strategy', icon: <TargetIcon />, label: 'Strategy' },
    { page: 'opportunities', icon: <TrendingIcon />, label: 'Opportunities', tourId: 'tour-step-opportunities-nav' },
    { page: 'calendar', icon: <CalendarIcon />, label: 'Calendar' },
    { page: 'approvals', icon: <KanbanIcon />, label: 'Approvals' },
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
              // Opportunities/Trends: Creator-only feature (not for Business users)
              if (user.userType === 'Business') {
                  return false;
              }
              // Creator users: Pro, Elite, Agency plans
              return ['Pro', 'Elite', 'Agency'].includes(user.plan);
          case 'autopilot':
              // Marketing Manager for Business: All Business plans (Starter, Growth, Agency)
              // AI Autopilot for Creators: Pro and Elite plans
              if (user.userType === 'Business') {
                  return ['Starter', 'Growth', 'Agency'].includes(user.plan);
              }
              // Creator users: Pro, Elite (and Agency for creators if they have it)
              return ['Pro', 'Elite', 'Agency'].includes(user.plan);
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


  const secondaryNavItems: NavItemProps[] = [
      { page: 'about', icon: <InfoIcon />, label: 'About Us' },
      { page: 'contact', icon: <MailIcon />, label: 'Contact Us' },
      { page: 'faq', icon: <QuestionIcon />, label: 'FAQs' },
      { page: 'terms', icon: <InfoIcon />, label: 'Terms of Service' },
      { page: 'privacy', icon: <LockIcon />, label: 'Privacy Policy' },
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
        <nav className="p-4 flex-grow overflow-y-auto">
          <ul>
            {navItems.map(item => <NavItem key={item.page} {...item} />)}
          </ul>
        </nav>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
            <ul>
                {secondaryNavItems.map(item => <NavItem key={item.page} {...item} />)}
            </ul>
        </div>
      </aside>
    </>
  );
};