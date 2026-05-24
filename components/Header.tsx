
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { SunIcon, MoonIcon, BellIcon, MenuIcon, LogoutIcon, ChatIcon, BriefcaseIcon, WarningIcon } from './icons/UIIcons';
import { Client } from '../types';
import type { Notification as AppNotification } from '../types';
import { useAppContext } from './AppContext';
import { auth } from '../firebaseConfig';
import { OFFLINE_MODE, ECHOFLUX_APP_ACCENT_HEX } from '../constants';
import { ReportProblemModal } from './ReportProblemModal';
import { FanHubHelpChooserModal } from './FanHubHelpChooserModal';
import { ShareReviewModal } from './ShareReviewModal';
import { getAvatarCropStyle } from '../src/lib/avatarCrop';
import { resolveApiUrl } from '../src/lib/resolveApiUrl';
import { dismissUsageNotificationId,
  dismissUsageNotificationIds,
} from '../src/utils/usageNotificationDismissals';
import { hasPlatformAdminAccess } from '../src/lib/platformAdminAccess';
import {
  clearPushDeclined,
  isBrowserPushEnabled,
  isWebPushSupported,
  PUSH_STATE_EVENT,
  registerWebPush,
} from '../src/lib/fanPushNotifications';

function shouldPersistBellDismissal(messageId?: string): boolean {
  return (
    !!messageId &&
    (messageId.startsWith('usage-') ||
      messageId === 'trial-ending' ||
      messageId === 'echoflux-billing')
  );
}

interface HeaderProps {
  pageTitle: string;
}

export const Header: React.FC<HeaderProps> = ({ pageTitle }) => {
  const {
    isDarkMode, toggleTheme, setIsSidebarOpen, handleLogout, setActivePage,
    user, clients, selectedClient, setSelectedClient, notifications,
    setNotifications, activePage, showToast,
  } = useAppContext();

  if (!user) {
    return null;
  }

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isClientSwitcherOpen, setIsClientSwitcherOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [creatorHelpFlow, setCreatorHelpFlow] = useState<'closed' | 'chooser' | 'report' | 'contact'>('closed');
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(() => isBrowserPushEnabled());
  const [pushLoading, setPushLoading] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  );

  const syncPushState = useCallback(() => {
    setPushEnabled(isBrowserPushEnabled());
    if (typeof Notification !== 'undefined') {
      setPushPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    void isWebPushSupported().then(setPushSupported);
    syncPushState();
  }, [user.id, syncPushState]);

  useEffect(() => {
    const onPushState = () => syncPushState();
    window.addEventListener(PUSH_STATE_EVENT, onPushState);
    return () => window.removeEventListener(PUSH_STATE_EVENT, onPushState);
  }, [syncPushState]);

  const showHeaderPushOptIn =
    pushSupported &&
    !pushEnabled &&
    pushPermission !== 'denied' &&
    !!import.meta.env.VITE_FIREBASE_VAPID_KEY;

  const handleEnableHeaderPush = async () => {
    if (pushLoading) return;
    setPushLoading(true);
    clearPushDeclined();
    try {
      const token = await registerWebPush({ force: true });
      if (typeof Notification !== 'undefined') setPushPermission(Notification.permission);
      if (token) {
        setPushEnabled(true);
        showToast?.('Push notifications enabled', 'success');
      } else if (Notification.permission === 'denied') {
        showToast?.('Notifications blocked in browser settings', 'error');
      } else {
        showToast?.('Could not enable push notifications', 'error');
      }
      syncPushState();
    } catch (e) {
      console.error('[Header] push opt-in', e);
      const msg = e instanceof Error ? e.message : 'Could not enable push notifications';
      showToast?.(msg, 'error');
      syncPushState();
    } finally {
      setPushLoading(false);
    }
  };

  const profileRef = useRef<HTMLDivElement>(null);
  const clientSwitcherRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  
  // Social inbox removed; show usage, announcements, and IT support ticket admin alerts.
  const isPlatformAdmin = hasPlatformAdminAccess(user);
  const visibleNotifications = useMemo(() => {
    return notifications.filter(
      (n) =>
        n.messageId?.startsWith("usage-") ||
        n.messageId === "echoflux-billing" ||
        n.messageId?.startsWith("announcement-") ||
        (isPlatformAdmin && n.messageId?.startsWith("admin-"))
    );
  }, [notifications, isPlatformAdmin]);

  const hasUnreadNotifications = useMemo(() => visibleNotifications.some(n => !n.read), [visibleNotifications]);
  const unreadVisibleCount = useMemo(
    () => visibleNotifications.reduce((acc, n) => acc + (n.read ? 0 : 1), 0),
    [visibleNotifications]
  );
  const unreadBellBadge = unreadVisibleCount > 99 ? "99+" : String(Math.max(0, unreadVisibleCount));
  const showShareReviewInMenu = activePage !== 'fanHub';

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
    syncPushState();
    setIsNotificationsOpen((prev) => !prev);
  };

  const visibleNotificationIds = useMemo(
    () => new Set(visibleNotifications.map((n) => n.id)),
    [visibleNotifications]
  );

  const adminAlertDocId = useCallback((notificationId: string) => {
    return notificationId.startsWith("admin-") ? notificationId.slice("admin-".length) : null;
  }, []);

  const markAdminAlertsReadRemote = useCallback(
    async (docIds: string[]) => {
      if (!docIds.length) return;
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(resolveApiUrl("/api/markAdminAlertRead"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ alertIds: docIds }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Could not dismiss admin alert");
      }
    },
    []
  );

  const dismissReminder = useCallback(
    async (id: string, e?: React.MouseEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
      const row = notifications.find((n) => n.id === id);
      if (row && shouldPersistBellDismissal(row.messageId)) {
        dismissUsageNotificationId(user.id, id);
      }
      const docId = adminAlertDocId(id);
      if (docId) {
        try {
          await markAdminAlertsReadRemote([docId]);
        } catch (err) {
          showToast(err instanceof Error ? err.message : "Could not dismiss alert", "error");
          return;
        }
      }
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    },
    [adminAlertDocId, markAdminAlertsReadRemote, notifications, setNotifications, showToast, user.id]
  );

  const clearAllVisibleReminders = useCallback(() => {
    const adminIds = visibleNotifications
      .map((n) => adminAlertDocId(n.id))
      .filter((x): x is string => Boolean(x));
    const usageIds = visibleNotifications
      .filter((n) => shouldPersistBellDismissal(n.messageId))
      .map((n) => n.id);
    if (usageIds.length) dismissUsageNotificationIds(user.id, usageIds);
    void (async () => {
      if (adminIds.length) {
        try {
          await markAdminAlertsReadRemote(adminIds);
        } catch (err) {
          showToast(err instanceof Error ? err.message : "Could not clear admin alerts", "error");
          return;
        }
      }
      setNotifications((prev) => prev.filter((n) => !visibleNotificationIds.has(n.id)));
      setIsNotificationsOpen(false);
    })();
  }, [
    adminAlertDocId,
    markAdminAlertsReadRemote,
    setNotifications,
    showToast,
    user.id,
    visibleNotificationIds,
    visibleNotifications,
  ]);

  const clearReadVisibleReminders = useCallback(() => {
    setNotifications((prev) =>
      prev.filter((n) => !(visibleNotificationIds.has(n.id) && n.read))
    );
  }, [setNotifications, visibleNotificationIds]);

  /** Row tap: mark read and close only — no surprise navigation (pricing/admin/dashboard). */
  const handleReminderRowActivate = useCallback(
    (notification: AppNotification) => {
      if (shouldPersistBellDismissal(notification.messageId)) {
        dismissUsageNotificationId(user.id, notification.id);
      }
      const docId = adminAlertDocId(notification.id);
      if (docId) {
        void (async () => {
          try {
            await markAdminAlertsReadRemote([docId]);
          } catch {
            /* snapshot may still update; avoid toast noise on double-tap */
          }
        })();
      }
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
      );
      setIsNotificationsOpen(false);
    },
    [adminAlertDocId, markAdminAlertsReadRemote, setNotifications, user.id]
  );

  const openPricingFromReminder = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setActivePage('pricing');
      setIsNotificationsOpen(false);
    },
    [setActivePage]
  );

  const handleMarkAllAsRead = useCallback(() => {
    const adminIds = isPlatformAdmin
      ? notifications.map((n) => adminAlertDocId(n.id)).filter((x): x is string => Boolean(x))
      : [];
    const usageIds = notifications.filter((n) => shouldPersistBellDismissal(n.messageId)).map((n) => n.id);
    if (usageIds.length) dismissUsageNotificationIds(user.id, usageIds);
    void (async () => {
      if (adminIds.length) {
        try {
          await markAdminAlertsReadRemote(adminIds);
        } catch (err) {
          showToast(err instanceof Error ? err.message : "Could not mark admin alerts read", "error");
        }
      }
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    })();
  }, [notifications, isPlatformAdmin, adminAlertDocId, markAdminAlertsReadRemote, showToast, setNotifications, user.id]);

  const ClientSwitcher: React.FC = () => {
    // Hide agency/client switching for now; leave available only for Admin
    if (user.role !== 'Admin' && !hasPlatformAdminAccess(user)) {
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
      <FanHubHelpChooserModal
        variant="creatorApp"
        isOpen={creatorHelpFlow === 'chooser'}
        onClose={() => setCreatorHelpFlow('closed')}
        fanBrand="EchoFlux"
        creatorDisplayName=""
        primaryColor={ECHOFLUX_APP_ACCENT_HEX}
        onChooseReport={() => setCreatorHelpFlow('report')}
        onChooseContact={() => setCreatorHelpFlow('contact')}
      />
      <ReportProblemModal
        isOpen={creatorHelpFlow === 'report'}
        onClose={() => setCreatorHelpFlow('closed')}
        onBack={() => setCreatorHelpFlow('chooser')}
        layout="contactPage"
        showDiagnosticsUi={false}
        mode="platform"
        platformInboxBucket="it_support"
        supportName="EchoFlux"
        panelSupportEmail="contact@echoflux.ai"
        pageLabelForReporting="EchoFlux creator app"
        contactEmail="contact@echoflux.ai"
      />
      <ReportProblemModal
        isOpen={creatorHelpFlow === 'contact'}
        onClose={() => setCreatorHelpFlow('closed')}
        onBack={() => setCreatorHelpFlow('chooser')}
        layout="contactPage"
        showDiagnosticsUi={false}
        mode="platform"
        platformInboxBucket="contact"
        supportName="EchoFlux"
        panelSupportEmail="contact@echoflux.ai"
        pageLabelForReporting="EchoFlux creator app"
        contactEmail="contact@echoflux.ai"
      />
      {showShareReviewInMenu ? (
        <ShareReviewModal isOpen={isReviewOpen} onClose={() => setIsReviewOpen(false)} />
      ) : null}
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
            id="tour-step-theme-toggle"
            onClick={toggleTheme}
            className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            aria-label="Toggle theme"
          >
            {isDarkMode ? <SunIcon /> : <MoonIcon />}
          </button>
          <div className="relative" ref={notificationsRef}>
            <button
              onClick={handleToggleNotifications}
              className="relative p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none"
              aria-label={
                OFFLINE_MODE
                  ? unreadVisibleCount > 0
                    ? `Reminders, ${unreadVisibleCount} unread`
                    : "Reminders"
                  : unreadVisibleCount > 0
                    ? `Account and usage alerts, ${unreadVisibleCount} unread`
                    : "Account and usage alerts"
              }
            >
              <BellIcon />
              {unreadVisibleCount > 0 ? (
                <span
                  className="absolute -top-0.5 -right-0.5 flex min-h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold tabular-nums leading-none text-white ring-2 ring-white dark:ring-gray-800"
                  aria-hidden
                >
                  {unreadBellBadge}
                </span>
              ) : null}
            </button>
            {isNotificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-lg ring-1 ring-black ring-opacity-5 z-20 flex flex-col">
                    <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                          {OFFLINE_MODE ? 'Reminders' : 'Account & usage'}
                        </h3>
                        {visibleNotifications.length > 0 ? (
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            {hasUnreadNotifications ? (
                              <button
                                type="button"
                                onClick={handleMarkAllAsRead}
                                className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
                              >
                                Mark all read
                              </button>
                            ) : null}
                            {visibleNotifications.some((n) => n.read) ? (
                              <button
                                type="button"
                                onClick={clearReadVisibleReminders}
                                className="text-xs font-medium rounded-md border border-gray-200 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/80"
                              >
                                Clear read
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={clearAllVisibleReminders}
                              className="text-xs font-medium rounded-md border border-gray-200 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/80"
                            >
                              Clear all
                            </button>
                          </div>
                        ) : null}
                    </div>
                    {showHeaderPushOptIn ? (
                      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-indigo-50/80 dark:bg-indigo-950/30">
                        <p className="text-xs text-gray-700 dark:text-gray-300 mb-2">
                          Get browser notifications for Fan Hub activity, account alerts
                          {isPlatformAdmin ? ', and admin alerts' : ''}. Manage anytime in Settings.
                        </p>
                        <button
                          type="button"
                          onClick={() => void handleEnableHeaderPush()}
                          disabled={pushLoading}
                          className="w-full text-xs font-semibold rounded-lg px-3 py-2 text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60"
                        >
                          {pushLoading ? 'Enabling…' : 'Enable push notifications'}
                        </button>
                      </div>
                    ) : null}
                    <div className="py-1 max-h-80 overflow-y-auto">
                        {visibleNotifications.length > 0 ? visibleNotifications.map(notification => {
                            const isUsageNotification = notification.messageId?.startsWith('usage-');
                            const isItTicketNotification = notification.messageId === 'admin-support_ticket_created';
                            return (
                                <div
                                  key={notification.id}
                                  className="flex items-stretch border-b border-gray-100 dark:border-gray-700/80 last:border-b-0"
                                >
                                  <div className="min-w-0 flex-1 px-4 py-3 hover:bg-gray-100/80 dark:hover:bg-gray-700/50 transition-colors">
                                    <button
                                      type="button"
                                      onClick={() => handleReminderRowActivate(notification)}
                                      className="w-full min-w-0 text-left hover:opacity-90 transition-opacity"
                                    >
                                      <div className="flex min-w-0 items-start">
                                        <div className="flex-shrink-0 mt-1">
                                          <div className="relative">
                                            <div className={`p-2 rounded-full ${!notification.read ? (isUsageNotification ? 'bg-yellow-100 dark:bg-yellow-900/50' : isItTicketNotification ? 'bg-amber-100 dark:bg-amber-900/40' : 'bg-primary-100 dark:bg-primary-900/50') : 'bg-gray-100 dark:bg-gray-700'}`}>
                                                {isUsageNotification ? <WarningIcon className="w-5 h-5 text-yellow-600 dark:text-yellow-400" /> : isItTicketNotification ? <WarningIcon className="w-5 h-5 text-amber-700 dark:text-amber-300" /> : <ChatIcon />}
                                            </div>
                                            {!notification.read && <span className="absolute top-0 right-0 h-2 w-2 bg-blue-500 rounded-full"></span>}
                                          </div>
                                        </div>
                                        <div className="ml-3 min-w-0 flex-1">
                                            <p className={`text-sm font-medium [overflow-wrap:anywhere] ${!notification.read ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}>{notification.text}</p>
                                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{notification.timestamp}</p>
                                        </div>
                                      </div>
                                    </button>
                                    {isUsageNotification ? (
                                      <button
                                        type="button"
                                        onClick={openPricingFromReminder}
                                        className="mt-2 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
                                      >
                                        View plans & billing
                                      </button>
                                    ) : null}
                                  </div>
                                  <button
                                    type="button"
                                    aria-label={`Dismiss: ${notification.text?.slice(0, 40) || 'notification'}`}
                                    title="Dismiss"
                                    onClick={(e) => dismissReminder(notification.id, e)}
                                    className="shrink-0 px-3 text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-gray-200 border-l border-gray-200 dark:border-gray-700"
                                  >
                                    <span className="text-lg leading-none" aria-hidden>×</span>
                                  </button>
                                </div>
                            );
                        }) : (
                           <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-6">
                             {OFFLINE_MODE ? "No reminders yet." : "You're all caught up!"}
                           </p> 
                        )}
                    </div>
                </div>
            )}
          </div>
          <div id="tour-step-5-profile-avatar" className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex-shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-gray-100 dark:ring-offset-gray-800 ring-primary-500 focus:outline-none focus-visible:ring-primary-500"
            >
              <div className="h-10 w-10 overflow-hidden rounded-full">
                <img
                  className="h-full w-full select-none pointer-events-none"
                  style={getAvatarCropStyle(user.avatarObjectPosition)}
                  src={user.avatar}
                  alt="User"
                  draggable={false}
                />
              </div>
            </button>
            {isProfileOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg py-1 ring-1 ring-black ring-opacity-5 z-50">
                    <button onClick={() => { setActivePage('profile'); setIsProfileOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">Your Profile</button>
                    <button
                        type="button"
                        onClick={() => {
                          setCreatorHelpFlow('chooser');
                          setIsProfileOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                        Get in touch
                    </button>
                    {showShareReviewInMenu ? (
                      <button
                          onClick={() => { setIsReviewOpen(true); setIsProfileOpen(false); }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                          Share a Review
                      </button>
                    ) : null}
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