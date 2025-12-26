
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { SunIcon, MoonIcon, BellIcon, MenuIcon, LogoutIcon, ChatIcon, BriefcaseIcon, WarningIcon } from './icons/UIIcons';
import { Client, Notification } from '../types';
import { useAppContext } from './AppContext';
import { OFFLINE_MODE } from '../constants';

interface HeaderProps {
  pageTitle: string;
}

export const Header: React.FC<HeaderProps> = ({ pageTitle }) => {
  const {
    isDarkMode, toggleTheme, setIsSidebarOpen, handleLogout, setActivePage,
    user, clients, selectedClient, setSelectedClient, notifications,
    setNotifications, navigateToDashboardWithFilter
  } = useAppContext();

  if (!user) {
    return null;
  }

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isClientSwitcherOpen, setIsClientSwitcherOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const profileRef = useRef<HTMLDivElement>(null);
  const clientSwitcherRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  
  // In offline/studio mode we don't support inbox/DM/comment notifications yet.
  // Keep the bell usable by showing only usage/system alerts (messageId starts with 'usage-').
  const visibleNotifications = useMemo(() => {
    if (!OFFLINE_MODE) return notifications;
    return notifications.filter(n =>
      n.messageId?.startsWith('usage-') || n.messageId?.startsWith('announcement-')
    );
  }, [notifications]);

  const hasUnreadNotifications = useMemo(() => visibleNotifications.some(n => !n.read), [visibleNotifications]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (clientSwitcherRef.current && !clientSwitcherRef.current.contains(event.target as Node)) {
        setIsClientSwitcherOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClientSelect = (client: Client | null) => {
    console.log('handleClientSelect called:', client?.name || 'Main Account');
    setSelectedClient(client);
    setIsClientSwitcherOpen(false);
    // Force dashboard refresh when switching accounts
    if (client) {
      console.log('Switching to client account:', client.name);
    } else {
      console.log('Switching to main account');
    }
  };
  
  const handleToggleNotifications = () => {
    setIsNotificationsOpen(prev => !prev);
  };

  const handleNotificationClick = (notification: Notification) => {
    // Handle usage limit notifications differently
    if (notification.messageId?.startsWith('usage-')) {
      // Navigate to pricing page for usage limit notifications
      setActivePage('pricing');
      
      // Mark notification as read
      setNotifications(prevNotifications => 
        prevNotifications.map(n => 
          n.id === notification.id ? { ...n, read: true } : n
        )
      );
      
      setIsNotificationsOpen(false);
      return;
    }

    // Announcement reminders (offline/studio friendly)
    if (notification.messageId?.startsWith('announcement-')) {
      setNotifications(prevNotifications => 
        prevNotifications.map(n => 
          n.id === notification.id ? { ...n, read: true } : n
        )
      );
      setIsNotificationsOpen(false);
      return;
    }
    
    // In offline/studio mode, suppress DM/comment navigation (feature not available)
    if (OFFLINE_MODE) {
      setNotifications(prevNotifications => 
        prevNotifications.map(n => 
          n.id === notification.id ? { ...n, read: true } : n
        )
      );
      setIsNotificationsOpen(false);
      return;
    }

    // Handle regular message notifications (DMs/comments)
    setSelectedClient(null); // Switch to main account to ensure message is visible
    navigateToDashboardWithFilter(
      { platform: 'All', messageType: 'All', sentiment: 'All' }, 
      notification.messageId
    );
    
    // Mark only the clicked notification as read
    setNotifications(prevNotifications => 
      prevNotifications.map(n => 
        n.id === notification.id ? { ...n, read: true } : n
      )
    );

    setIsNotificationsOpen(false);
  };

  const handleMarkAllAsRead = () => {
    setNotifications(prevNotifications => 
      prevNotifications.map(n => ({ ...n, read: true }))
    );
  };

  const ClientSwitcher: React.FC = () => {
    // Hide agency/client switching for now; leave available only for Admin
    if (user.role !== 'Admin') {
      return null;
    }

    return (
      <div id="tour-step-4-client-switcher" className="relative" ref={clientSwitcherRef}>
        <button onClick={() => setIsClientSwitcherOpen(!isClientSwitcherOpen)} className="flex items-center text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white p-2 rounded-md bg-gray-100 dark:bg-gray-700">
           <img src={selectedClient?.avatar || user.avatar} alt="Client" className="w-6 h-6 rounded-full mr-2" />
           <span className="max-w-[100px] truncate">{selectedClient?.name || 'Main Account'}</span>
           <svg className={`w-5 h-5 ml-1 transition-transform ${isClientSwitcherOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
        </button>
        {isClientSwitcherOpen && (
          <div className="absolute left-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-md shadow-lg py-1 ring-1 ring-black ring-opacity-5 z-10">
              <div className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Switch Account
              </div>
              <button onClick={() => handleClientSelect(null)} className="w-full text-left flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                <img src={user.avatar} alt="Main Account" className="w-6 h-6 rounded-full mr-2" />
                Main Account
              </button>
              {clients.length > 0 && <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>}
              <div className="max-h-60 overflow-y-auto">
                  {clients.map(client => (
                    <button key={client.id} onClick={() => handleClientSelect(client)} className="w-full text-left flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                       <img src={client.avatar} alt={client.name} className="w-6 h-6 rounded-full mr-2" />
                      {client.name}
                    </button>
                  ))}
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
              <button onClick={() => { setActivePage('clients'); setIsClientSwitcherOpen(false); }} className="w-full text-left flex items-center px-4 py-2 text-sm text-primary-600 dark:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium">
                   <span className="mr-2"><BriefcaseIcon /></span>
                   <span>Manage Clients</span>
              </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <header className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between p-4 h-20">
        <div className="flex items-center space-x-4">
            <button
                onClick={() => setIsSidebarOpen(prev => !prev)}
                className="lg:hidden text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            >
                <MenuIcon />
            </button>
            <div className="flex items-center gap-4">
              <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white whitespace-nowrap overflow-hidden text-ellipsis">{pageTitle.split(':')[0]}</h1>
              {/* Client switcher hidden while agency features are paused */}
            </div>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            aria-label="Toggle theme"
          >
            {isDarkMode ? <SunIcon /> : <MoonIcon />}
          </button>
          <div className="relative" ref={notificationsRef}>
            <button onClick={handleToggleNotifications} className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none" aria-label="Notifications">
              <BellIcon />
              {hasUnreadNotifications && <span className="absolute top-0 right-0 h-2.5 w-2.5 bg-red-500 rounded-full border-2 border-white dark:border-gray-800"></span>}
            </button>
            {isNotificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-lg ring-1 ring-black ring-opacity-5 z-20 flex flex-col">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {OFFLINE_MODE ? 'Reminders' : 'Notifications'}
                        </h3>
                    </div>
                    <div className="py-1 max-h-80 overflow-y-auto">
                        {visibleNotifications.length > 0 ? visibleNotifications.map(notification => {
                            const isUsageNotification = notification.messageId?.startsWith('usage-');
                            return (
                                <button key={notification.id} onClick={() => handleNotificationClick(notification)} className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                    <div className="flex items-start">
                                        <div className="flex-shrink-0 mt-1">
                                          <div className="relative">
                                            <div className={`p-2 rounded-full ${!notification.read ? (isUsageNotification ? 'bg-yellow-100 dark:bg-yellow-900/50' : 'bg-primary-100 dark:bg-primary-900/50') : 'bg-gray-100 dark:bg-gray-700'}`}>
                                                {isUsageNotification ? <WarningIcon className="w-5 h-5 text-yellow-600 dark:text-yellow-400" /> : <ChatIcon />}
                                            </div>
                                            {!notification.read && <span className="absolute top-0 right-0 h-2 w-2 bg-blue-500 rounded-full"></span>}
                                          </div>
                                        </div>
                                        <div className="ml-3 w-0 flex-1">
                                            <p className={`text-sm font-medium ${!notification.read ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}>{notification.text}</p>
                                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{notification.timestamp}</p>
                                        </div>
                                    </div>
                                </button>
                            );
                        }) : (
                           <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-6">
                             {OFFLINE_MODE ? "No reminders yet." : "You're all caught up!"}
                           </p> 
                        )}
                    </div>
                    {hasUnreadNotifications && (
                      <div className="p-2 border-t border-gray-200 dark:border-gray-700">
                          <button
                              onClick={handleMarkAllAsRead}
                              className="w-full text-center text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md py-1.5 transition-colors"
                          >
                              Mark all as read
                          </button>
                      </div>
                    )}
                </div>
            )}
          </div>
          <div id="tour-step-5-profile-avatar" className="relative" ref={profileRef}>
            <button onClick={() => setIsProfileOpen(!isProfileOpen)} className="flex-shrink-0">
              <img
                className="h-10 w-10 rounded-full ring-2 ring-offset-2 ring-offset-gray-100 dark:ring-offset-gray-800 ring-primary-500"
                src={user.avatar}
                alt="User"
              />
            </button>
            {isProfileOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg py-1 ring-1 ring-black ring-opacity-5 z-50">
                    <button onClick={() => { setActivePage('profile'); setIsProfileOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">Your Profile</button>
                    <button 
                        onClick={handleLogout}
                        className="w-full text-left flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                        <LogoutIcon />
                        <span className="ml-2">Sign out</span>
                    </button>
                </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};