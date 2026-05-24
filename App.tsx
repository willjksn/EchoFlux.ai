import React, { useState, useEffect, useLayoutEffect, useRef, lazy, Suspense } from 'react';
import { useAppContext } from './components/AppContext';
import { AuthProvider } from './components/contexts/AuthContext';
import { UIProvider } from './components/contexts/UIContext';
import { DataProvider } from './components/contexts/DataContext';

import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Analytics } from './components/Analytics';
import { Settings } from './components/Settings';
import { LandingPage } from './components/LandingPage';
import { LoginModal } from './components/LoginModal';
import { Team } from './components/Team';
import { Opportunities } from './components/Opportunities';
import { Profile } from './components/Profile';
import { About } from './components/About';
import { Contact } from './components/Contact';
import { Clients } from './components/Clients';
import { FAQ } from './components/FAQ';
import { Terms } from './components/Terms';
import { Privacy } from './components/Privacy';
import { DataDeletion } from './components/DataDeletion';
import Automation from './components/Automation';
import { EmailCenterPage } from './components/EmailCenterPage';
import { CreatorOnboardingModal } from './components/CreatorOnboardingModal';
import { PlanSelectorModal } from './components/PlanSelectorModal';
import { MaintenancePage } from './components/MaintenancePage';
import { isMaintenanceMode, getAllowedEmail, canBypassMaintenance } from './src/utils/maintenance';
import { hasFanHubStudioRouteAccess, hasPremiumStudioRouteAccess } from './src/utils/planAccess';
import { PlanHub } from './components/PlanHub';
import { LegacyPremiumStudioRedirect } from './components/LegacyPremiumStudioRedirect';
import { InteractiveTour } from './components/InteractiveTour';
import { PaymentModal } from './components/PaymentModal';
import { Toast } from './components/Toast';
import { UnifiedAssistant } from './components/UnifiedAssistant';
import { AnnouncementBanner } from './components/AnnouncementBanner';
import { PublicAnnouncementBanner } from './components/PublicAnnouncementBanner';
import { Page, UserType, Plan, User } from './types';
import { Pricing } from './components/Pricing';
import { CRMSidebar } from './components/CRMSidebar';
import { AdGenerator } from './components/AdGenerator';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FanOnlyEchoFluxShell } from './components/FanOnlyEchoFluxShell';
import { WitmeCreatorsApplyPage } from './components/WitmeCreatorsApplyPage';
import { WitmeDiscoverPage, WitmeHomepage } from './components/WitmeHomepage';
import {
  KNOWN_APP_ROUTES,
  ECHOFLUX_CREATOR_ELITE_INVITE_USD,
  ECHOFLUX_CREATOR_PRO_INVITE_USD,
  ECHOFLUX_ELITE_MONTHLY_USD,
  ECHOFLUX_PRO_MONTHLY_USD,
  echofluxEffectiveMonthlyWhenAnnualUsd,
} from './constants';
import { isCustomDomainStorefrontPath, isCanonicalSaaSAppHostname } from './src/lib/storefrontCustomDomain';
import { useOAuthReturnHandler } from './src/hooks/useOAuthReturnHandler';
import { ResetPassword } from './components/ResetPassword';
import { InviteRequiredPage } from './components/InviteRequiredPage';
import { isInviteOnlyMode } from './src/utils/inviteOnly';
import { PremiumStudioLayout } from './components/PremiumStudioLayout';
import {
  hasRegisteredPushToken,
  listenForForegroundPush,
  syncWebPushForCurrentUser,
} from './src/lib/fanPushNotifications';
import { captureFanHubPushDeeplinkFromUrl } from './src/lib/fanHubNotificationRouting';

// Lazy load heavy components for code splitting
const OnlyFansStudio = lazy(() => import('./components/OnlyFansStudio').then(module => ({ default: module.OnlyFansStudio })));
const Autopilot = lazy(() => import('./components/Autopilot'));
const Dashboard = lazy(() => import('./components/Dashboard').then((m) => ({ default: m.Dashboard })));
const AdminDashboard = lazy(() => import('./components/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));
const FanStorefrontView = lazy(() =>
  import('./components/FanStorefrontView').then((m) => ({ default: m.FanStorefrontView }))
);
const PremiumStudioUpgrade = lazy(() =>
  import('./components/PremiumStudioUpgrade').then((m) => ({ default: m.PremiumStudioUpgrade }))
);
const WitmePageManager = lazy(() => import('./components/WitmePageManager'));
const Compose = lazy(() => import('./components/Compose').then((m) => ({ default: m.Compose })));
const Calendar = lazy(() => import('./components/Calendar').then((m) => ({ default: m.Calendar })));
const MediaLibrary = lazy(() => import('./components/MediaLibrary'));

const RouteChunkFallback: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div className="min-h-[50vh] flex items-center justify-center p-8 bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300">
    <div className="text-center">
      <div
        className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
        role="status"
        aria-label={label}
      />
      <p className="text-sm">{label}</p>
    </div>
  </div>
);

const LazyBoundary: React.FC<{ label?: string; children: React.ReactNode }> = ({ label, children }) => (
  <Suspense fallback={<RouteChunkFallback label={label} />}>{children}</Suspense>
);

function hasTrustedStaffAdminShell(user: Partial<User> | null | undefined): boolean {
    if (!user) return false;
    if ((user as { role?: string }).role === 'Admin') return true;
    const f = (user as User).staffRoleFlags;
    return !!(f?.contentAudit || f?.legalDisclosureReserve);
}

function hasInviteModeStaffBypass(user: Partial<User> | null | undefined): boolean {
    return hasTrustedStaffAdminShell(user);
}

const pageTitles: Record<Page, string> = {
    dashboard: 'Dashboard',
    analytics: "What's Working",
    settings: 'Settings',
    compose: 'Create Post',
    calendar: 'My Schedule',
    approvals: 'Approval Workflow',
    team: 'Team Management',
    opportunities: 'Find Trends',
    profile: 'Your Profile',
    about: 'About Us',
    contact: 'Contact Us',
    pricing: 'Pricing',
    clients: 'Client Management',
    faq: 'FAQs',
    terms: 'Terms of Service',
    privacy: 'Privacy Policy',
    dataDeletion: 'Data Deletion',
    admin: 'Admin Dashboard',
    automation: 'Automation',
    bio: 'Bio Link Page',
    strategy: 'Plan',
    "creator-os": 'Plan',
    ads: 'Ad Ideas',
    mediaLibrary: 'My Vault',
    autopilot: 'AI Autopilot',
    onlyfansStudio: 'Premium Content Studio',
    emailCenter: 'Email Center',
    premiumStudioUpgrade: 'Unlock Premium Studio',
    fanHub: 'Fan Hub',
    witmePage: 'Witme Page',
};

const GUEST_STANDALONE_PATH_TO_PAGE: Partial<Record<string, Page>> = {
    '/privacy': 'privacy',
    '/terms': 'terms',
    '/faq': 'faq',
    '/data-deletion': 'dataDeletion',
    '/pricing': 'pricing',
};

function guestStandalonePageFromPath(): Page | null {
    if (typeof window === 'undefined') return null;
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    return GUEST_STANDALONE_PATH_TO_PAGE[path] ?? null;
}

type GuestStandaloneShellProps = {
    page: Page;
    onHome: () => void;
    onSignIn: () => void;
    onGetStarted: () => void;
    onNavigateRequest: (page: Page) => void;
    loginModal?: React.ReactNode;
};

const GuestStandaloneShell: React.FC<GuestStandaloneShellProps> = ({
    page,
    onHome,
    onSignIn,
    onGetStarted,
    onNavigateRequest,
    loginModal,
}) => {
    const main =
        page === 'privacy' ? (
            <Privacy />
        ) : page === 'terms' ? (
            <Terms />
        ) : page === 'faq' ? (
            <FAQ />
        ) : page === 'dataDeletion' ? (
            <DataDeletion />
        ) : (
            <Pricing onGetStartedClick={onGetStarted} onNavigateRequest={onNavigateRequest} />
        );

    return (
        <>
            <PublicAnnouncementBanner />
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
                <header className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 sm:px-6 py-4 shrink-0">
                    <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
                        <button
                            type="button"
                            onClick={onHome}
                            className="text-lg font-bold text-primary-600 hover:text-primary-700 dark:text-primary-400"
                        >
                            EchoFlux.ai
                        </button>
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={onSignIn}
                                className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                            >
                                Sign in
                            </button>
                            <button
                                type="button"
                                onClick={onGetStarted}
                                className="text-sm font-medium px-3 py-2 rounded-md bg-primary-600 text-white hover:bg-primary-700"
                            >
                                Get Started
                            </button>
                        </div>
                    </div>
                </header>
                <main className="flex-1 p-4 sm:p-6">{main}</main>
            </div>
            {loginModal}
        </>
    );
};

const MainContent: React.FC = () => {
    // Hooks must be called unconditionally - cannot be in try-catch
    const context = useAppContext();
    const user = context?.user;
    const activePage = context?.activePage || 'dashboard';
    // Check if context is available
    if (!context) {
        return (
            <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-full flex items-center justify-center">
                <div className="text-center">
                    <p className="text-red-600 dark:text-red-400 mb-2">An error occurred loading the page.</p>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">AppContext is not available</p>
                    <button 
                        onClick={() => window.location.reload()} 
                        className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                    >
                        Reload Page
                    </button>
                </div>
            </div>
        );
    }

    try {
        switch (activePage) {
            case 'dashboard':
                return (
                    <LazyBoundary label="Loading dashboard…">
                        <Dashboard />
                    </LazyBoundary>
                );
            case 'analytics': return (
                <ErrorBoundary>
                    <Analytics />
                </ErrorBoundary>
            );
            case 'settings': return <Settings />;
            case 'compose':
                return (
                    <LazyBoundary label="Loading Compose…">
                        <Compose />
                    </LazyBoundary>
                );
            // URL syncs to /create-post/drafts; prop ensures Approvals shows on first paint
            case 'approvals':
                return (
                    <LazyBoundary label="Loading approvals…">
                        <Compose approvalsWorkflow />
                    </LazyBoundary>
                );
            case 'calendar':
                return (
                    <LazyBoundary label="Loading calendar…">
                        <Calendar />
                    </LazyBoundary>
                );
            case 'team': return <Team />;
            case 'opportunities':
                return <PlanHub />;
            case 'profile': return <Profile />;
            case 'about': return <About />;
            case 'contact': return <Contact />;
            case 'pricing': return <Pricing />;
            case 'clients': return <Clients />;
            case 'faq': return <FAQ />;
            case 'terms': return <Terms />;
            case 'privacy': return <Privacy />;
            case 'dataDeletion': return <DataDeletion />;
            case 'admin':
                return (
                    <LazyBoundary label={hasTrustedStaffAdminShell(user) ? 'Loading admin…' : 'Loading dashboard…'}>
                        {hasTrustedStaffAdminShell(user) ? <AdminDashboard /> : <Dashboard />}
                    </LazyBoundary>
                );
            case 'automation': return <Automation />;
            case 'bio': {
                const hasAccess = hasFanHubStudioRouteAccess(user);
                if (!hasAccess) {
                    return (
                        <LazyBoundary label="Loading…">
                            <PremiumStudioUpgrade />
                        </LazyBoundary>
                    );
                }
                // Only set default URL if no tab param already present
                if (typeof window !== 'undefined' && !window.location.search.includes('tab=')) {
                    window.history.replaceState({}, '', '/fan-hub?tab=myPage');
                }
                return (
                    <LazyBoundary label="Loading Fan Hub…">
                        <PremiumStudioLayout section="fanHub">
                            <OnlyFansStudio mode="fanHub" />
                        </PremiumStudioLayout>
                    </LazyBoundary>
                );
            }
            case 'strategy':
            case 'creator-os':
                return <PlanHub />;
            case 'ads': return <AdGenerator />;
            case 'mediaLibrary':
                return (
                    <LazyBoundary label="Loading vault…">
                        <MediaLibrary />
                    </LazyBoundary>
                );
            case 'autopilot': return (
                <Suspense fallback={<div className="p-6 text-center text-gray-500 dark:text-gray-400">Loading Autopilot...</div>}>
                    <Autopilot />
                </Suspense>
            );
            case 'onlyfansStudio':
                return <LegacyPremiumStudioRedirect />;
            case 'emailCenter': return <EmailCenterPage />;
            case 'premiumStudioUpgrade':
                return (
                    <LazyBoundary label="Loading…">
                        <PremiumStudioUpgrade />
                    </LazyBoundary>
                );
            case 'witmePage':
                return (
                    <LazyBoundary label="Loading…">
                        {user?.role === 'Admin' ? <WitmePageManager /> : <Dashboard />}
                    </LazyBoundary>
                );
            case 'fanHub': {
                const hasAccess = hasFanHubStudioRouteAccess(user);
                if (!hasAccess) {
                    return (
                        <LazyBoundary label="Loading…">
                            <PremiumStudioUpgrade />
                        </LazyBoundary>
                    );
                }
                // Only set default URL if no tab param already present
                if (typeof window !== 'undefined' && !window.location.search.includes('tab=')) {
                    window.history.replaceState({}, '', '/fan-hub?tab=myPage');
                }
                return (
                    <LazyBoundary label="Loading Fan Hub…">
                        <PremiumStudioLayout section="fanHub">
                            <OnlyFansStudio mode="fanHub" />
                        </PremiumStudioLayout>
                    </LazyBoundary>
                );
            }
            default:
                return (
                    <LazyBoundary label="Loading dashboard…">
                        <Dashboard />
                    </LazyBoundary>
                );
        }
    } catch (error: any) {
        console.error('Error rendering MainContent:', error);
        return (
            <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-full flex items-center justify-center">
                <div className="text-center">
                    <p className="text-red-600 dark:text-red-400 mb-2">An error occurred loading the page.</p>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">{error?.message || 'Unknown error'}</p>
                    <button 
                        onClick={() => window.location.reload()} 
                        className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                    >
                        Reload Page
                    </button>
                </div>
            </div>
        );
    }
}

const AppContent: React.FC = () => {
    const appContext = useAppContext();
    // Check if this is a public bio page route (e.g., /username, /u/username, or /link/username for backward compatibility)
    // This should be checked BEFORE authentication to allow public access
    const pathname = window.location.pathname;
    
    // If path matches a known app route, let the rest of App handle activePage routing.
    // Otherwise treat as fan storefront: /{handle} (single segment), /{handle}/terms, /{handle}/privacy, or legacy /u/ or /link/ path.
    const normalizedPath = pathname.replace(/\/+$/, '') || '/';
    const isKnownAppRoute = (KNOWN_APP_ROUTES as readonly string[]).includes(normalizedPath);
    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    const isWitmeHost = /^([a-z0-9-]+\.)*witme\.io$/i.test(hostname);
    const isWitmePreview = (() => {
        if (typeof window === 'undefined') return false;
        return new URLSearchParams(window.location.search).get('witmePreview') === '1';
    })();
    const isWitmeRootPath = (isWitmeHost || isWitmePreview) && normalizedPath === '/';
    const isWitmeDiscoverPath = (isWitmeHost || isWitmePreview) && normalizedPath === '/discover';
    const isCreatorsApplyPath = normalizedPath === '/creators/apply';
    const isWitmeSurface = isWitmeRootPath || isWitmeDiscoverPath || isCreatorsApplyPath;
    /** stormijxo.com → /, /terms, /privacy, /{handle} (see storefrontCustomDomain + creatorDomains map) */
    const isCustomDomainSf =
        typeof window !== 'undefined' && isCustomDomainStorefrontPath(pathname, hostname);
    const np = pathname.replace(/\/+$/, '') || '/';
    // Member hub second segment (path-based tabs); keep list in sync with FanStorefrontView member URLs
    const isStorefrontMemberSubpathPlain =
        /^\/[^/]+\/(?:terms|privacy|p|feed|home|store|treats|purchases|tip|messages|profile|saved|about)$/i.test(np);
    const isStorefrontLegacyMemberSubpath =
        /^\/(?:u|link)\/[^/]+\/(?:terms|privacy|p|feed|home|store|treats|purchases|tip|messages|profile|saved|about)$/i.test(
            np
        );
    const isStorefrontPath =
        !pathname.startsWith('/api') &&
        !pathname.includes('.') &&
        (isCustomDomainSf ||
            ((!isKnownAppRoute && /^\/[^/]+$/.test(np)) ||
                /^\/(?:u|link)\/[^/]+$/.test(np) ||
                isStorefrontMemberSubpathPlain ||
                isStorefrontLegacyMemberSubpath));

    /**
     * These routes used to return before the hooks below, which broke the Rules of Hooks when
     * navigating (e.g. witme.io/ → witme.io/handle). Hooks always run; effects no-op via guards.
     */
    const fanOnlyEarlyExitShell = isStorefrontPath || isWitmeDiscoverPath || isCreatorsApplyPath;
    const echofluxUrlSyncSuppressed = isWitmeSurface || isStorefrontPath;

    /**
     * Fans should use the canonical public storefront host (usually witme.io). EchoFlux apex still
     * serves /{handle} for legacy links; optionally redirect so creator pages are never “sticky” under echoflux.ai.
     * Set `VITE_FAN_STOREFRONT_PUBLIC_ORIGIN=https://witme.io` on the echoflux.ai build.
     */
    useLayoutEffect(() => {
        if (typeof window === 'undefined') return;
        const rawEnv = import.meta.env.VITE_FAN_STOREFRONT_PUBLIC_ORIGIN;
        const raw = typeof rawEnv === 'string' ? rawEnv.trim() : '';
        if (!raw || !/^https:\/\//i.test(raw)) return;
        if (!import.meta.env.PROD) return;
        if (!isCanonicalSaaSAppHostname(window.location.hostname)) return;
        if (!isStorefrontPath) return;
        let canon: URL;
        try {
            canon = new URL(raw);
        } catch {
            return;
        }
        if (window.location.origin === canon.origin) return;
        window.location.replace(
            `${canon.origin}${pathname}${window.location.search}${window.location.hash}`,
        );
    }, [isStorefrontPath, pathname]);

    // Check maintenance mode FIRST - before any other logic
    const maintenanceEnabled = isMaintenanceMode();
    const allowedEmail = getAllowedEmail();

    const { isAuthenticated, isAuthLoading, user, setUser, activePage, setActivePage, startTour, isTourActive, toast, showToast, isCRMOpen, setPricingView, handleLogout, selectedPlan, setSelectedPlan, openPaymentModal, isPaymentModalOpen, socialAccounts, creatorAppAccess, refreshCreatorAppAccess } = appContext;

    /** Keep Fan Hub push deep links before auth guards rewrite `/fan-hub` → `/`. */
    useLayoutEffect(() => {
        captureFanHubPushDeeplinkFromUrl();
    }, []);

    useOAuthReturnHandler({ showToast, socialAccounts, isAuthLoading, skip: fanOnlyEarlyExitShell });
    
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
    const [loginModalInitialView, setLoginModalInitialView] = useState<'login' | 'signup'>('login');
    const [onboardingStep, setOnboardingStep] = useState<'plan-selector' | 'creator' | 'none'>('none');
    const [bypassMaintenance, setBypassMaintenance] = useState(false);
    const [isFinalizingCheckout, setIsFinalizingCheckout] = useState(false);
    const [showCheckoutTransition, setShowCheckoutTransition] = useState(false);
    const loginFromQueryHandled = useRef(false);

    // Fan storefront "Log in" / "Sign up" → /?login=1 or /?signup=1 — open modal once auth is ready
    useEffect(() => {
        if (fanOnlyEarlyExitShell) return;
        if (typeof window === 'undefined') return;
        if (isAuthLoading) return;
        const params = new URLSearchParams(window.location.search);
        const stripLoginSignupParams = () => {
            let changed = false;
            if (params.has('login')) {
                params.delete('login');
                changed = true;
            }
            if (params.has('signup')) {
                params.delete('signup');
                changed = true;
            }
            if (!changed) return;
            const q = params.toString();
            window.history.replaceState({}, '', q ? `${window.location.pathname}?${q}` : window.location.pathname);
        };
        if (isAuthenticated) {
            stripLoginSignupParams();
            return;
        }
        if (loginFromQueryHandled.current) return;
        const login = params.get('login');
        const signup = params.get('signup');
        if (login === '1' || login === 'true') {
            loginFromQueryHandled.current = true;
            setLoginModalInitialView('login');
            setIsLoginModalOpen(true);
            params.delete('login');
            const q = params.toString();
            window.history.replaceState({}, '', q ? `${window.location.pathname}?${q}` : window.location.pathname);
        } else if (signup === '1' || signup === 'true') {
            loginFromQueryHandled.current = true;
            setLoginModalInitialView('signup');
            setIsLoginModalOpen(true);
            params.delete('signup');
            const q = params.toString();
            window.history.replaceState({}, '', q ? `${window.location.pathname}?${q}` : window.location.pathname);
        }
    }, [isAuthLoading, isAuthenticated]);

    // Check for checkout transition loading overlay
    useEffect(() => {
        if (fanOnlyEarlyExitShell) return;
        // Show loading overlay if we're in a checkout transition
        const checkoutTransition = typeof window !== 'undefined' ? localStorage.getItem('checkoutTransition') : null;
        if (checkoutTransition === 'true') {
            setShowCheckoutTransition(true);
            // Clear the flag once payment modal opens (handled in paymentAttempt logic)
            // Also clear it after a timeout as fallback
            const timeout = setTimeout(() => {
                try {
                    localStorage.removeItem('checkoutTransition');
                } catch {}
                setShowCheckoutTransition(false);
            }, 5000);
            return () => clearTimeout(timeout);
        }
    }, []);

    // Clear checkout transition flag when payment modal opens
    useEffect(() => {
        if (fanOnlyEarlyExitShell) return;
        if (isPaymentModalOpen && showCheckoutTransition) {
            try {
                localStorage.removeItem('checkoutTransition');
            } catch {}
            setShowCheckoutTransition(false);
        }
    }, [isPaymentModalOpen, showCheckoutTransition]);

    // Auto-bypass maintenance for whitelisted users
    useEffect(() => {
        if (fanOnlyEarlyExitShell) return;
        if (isAuthenticated && user) {
            const canBypass = canBypassMaintenance(user.email);
            if (canBypass) {
                setBypassMaintenance(true);
            }
        }
    }, [isAuthenticated, user]);

    // Safety: if a user becomes unauthenticated while on an authenticated route (e.g. sign out, token expiry),
    // ensure the browser URL doesn't stay stuck on /dashboard while we render the public landing UI.
    useEffect(() => {
        if (echofluxUrlSyncSuppressed) return;
        if (typeof window === 'undefined') return;
        if (isAuthLoading) return;
        if (isAuthenticated) return;

        const path = window.location.pathname || '/';
        if (path === '/fan-hub') {
            captureFanHubPushDeeplinkFromUrl();
        }
        const isProtectedRoute = path === '/dashboard' ||
            path === '/analytics' ||
            path === '/settings' ||
            path === '/create-post' ||
            path === '/create-post/drafts' ||
            path === '/write-captions' ||
            path === '/compose' ||
            path === '/compose/drafts' ||
            path === '/drafts' ||
            path === '/my-schedule' ||
            path === '/calendar' ||
            path === '/drafts' ||
            path === '/approvals' ||
            path === '/team' ||
            path === '/find-trends' ||
            path === '/opportunities' ||
            path === '/profile' ||
            path === '/clients' ||
            path === '/admin' ||
            path === '/automation' ||
            path === '/bio-link-page' ||
            path === '/bio' ||
            path === '/plan' ||
            path === '/what-to-post' ||
            path === '/plan-my-week' ||
            path === '/strategy' ||
            path === '/creator-os' ||
            path === '/ads' ||
            path === '/my-vault' ||
            path === '/mediaLibrary' ||
            path === '/autopilot' ||
            path === '/email-center' ||
            path === '/emailCenter' ||
            path === '/premium-content-studio' ||
            path === '/premiumcontentstudio' ||
            path === '/onlyfansStudio' ||
            path === '/premium-studio-upgrade' ||
            path === '/studio' ||
            path === '/fan' ||
            path === '/fan-hub' ||
            path === '/witme-page';

        if (isProtectedRoute) {
            window.history.replaceState({}, '', '/');
        }
    }, [isAuthenticated, isAuthLoading, echofluxUrlSyncSuppressed]);

    // If invite-granted access expired, route user to Pricing to upgrade (Stripe flow remains unchanged).
    const hasShownExpiredToastRef = useRef(false);
    useEffect(() => {
        if (fanOnlyEarlyExitShell) return;
        if (!isAuthenticated || !user) {
            hasShownExpiredToastRef.current = false;
            return;
        }
        const status = (user as any)?.subscriptionStatus as string | undefined;
        if (status === 'invite_grant_expired') {
            if (!hasShownExpiredToastRef.current) {
                hasShownExpiredToastRef.current = true;
                showToast('Your access has expired. Please upgrade to continue.', 'error');
            }
            setActivePage('pricing');
        } else {
            hasShownExpiredToastRef.current = false;
        }
    }, [isAuthenticated, user, showToast, setActivePage]);

    // Sync URL with active page for direct access (e.g., /privacy, /terms)
    // Only sync from URL to activePage on initial load or browser navigation (back/forward)
    // NOTE: For authenticated users, UIContext handles URL syncing, so we only do this for unauthenticated users
    useEffect(() => {
        if (echofluxUrlSyncSuppressed) return;
        // Skip URL syncing for authenticated users - UIContext handles it
        if (isAuthenticated) return;
        
        const syncUrlToPage = () => {
            const path = window.location.pathname;
            const hash = window.location.hash.replace('#', '');
            
            // Map URL paths to pages (public pages accessible to all)
            const urlToPage: Record<string, Page> = {
                '/privacy': 'privacy',
                '/terms': 'terms',
                '/data-deletion': 'dataDeletion',
                '/pricing': 'pricing',
                '/faq': 'faq',
                '/about': 'about',
                '/contact': 'contact',
            };

            // Check if URL path matches a page
            // When not authenticated, about/contact are handled by LandingPage modals, so skip URL routing for them
            if (path !== '/' && urlToPage[path]) {
                if (path === '/about' || path === '/contact') {
                    // Don't set activePage for about/contact when not authenticated - they're modals
                    return;
                }
                const pageFromUrl = urlToPage[path];
                setActivePage(pageFromUrl);
            } else if (hash && urlToPage[`/${hash}`]) {
                // Support hash-based routing too
                if (hash === 'about' || hash === 'contact') {
                    // Don't set activePage for about/contact when not authenticated - they're modals
                    return;
                }
                const pageFromHash = urlToPage[`/${hash}`];
                setActivePage(pageFromHash);
            }
        };

        // Initial load: sync URL to activePage (only once on mount or when auth changes)
        syncUrlToPage();

        // Listen for browser back/forward navigation
        window.addEventListener('popstate', syncUrlToPage);

        return () => {
            window.removeEventListener('popstate', syncUrlToPage);
        };
    }, [isAuthenticated, setActivePage, echofluxUrlSyncSuppressed]); // Only run when auth state changes, not when activePage changes

    // Update URL when page changes (for privacy policy, terms, etc.)
    // NOTE: For authenticated users, UIContext handles URL syncing, so we only do this for unauthenticated users
    // or for pages that UIContext doesn't handle (public pages)
    useEffect(() => {
        if (echofluxUrlSyncSuppressed) return;
        // Skip URL syncing for authenticated users - UIContext handles it
        if (isAuthenticated) return;
        
        const pageToPath: Partial<Record<Page, string>> = {
            privacy: '/privacy',
            terms: '/terms',
            dataDeletion: '/data-deletion',
            about: '/about',
            contact: '/contact',
            pricing: '/pricing',
            faq: '/faq',
        };

        const path = pageToPath[activePage];
        if (path && window.location.pathname !== path) {
            window.history.pushState({}, '', path);
        }
    }, [activePage, isAuthenticated, echofluxUrlSyncSuppressed]);

    useEffect(() => {
        if (echofluxUrlSyncSuppressed) return;
        // Capture referral code from URL (e.g., ?ref=CODE)
        const urlParams = new URLSearchParams(window.location.search);
        const referralCode = urlParams.get('ref');
        if (referralCode) {
            // Store referral code in localStorage for later use during signup/checkout
            try {
                localStorage.setItem('referralCode', referralCode.toUpperCase());
            } catch (e) {
                console.error('Failed to store referral code:', e);
            }
        }

        // Check for payment success or cancellation redirect from Stripe
        const paymentSuccess = urlParams.get('payment');
        const paymentCanceled = urlParams.get('canceled');
        const sessionId = urlParams.get('session_id');
        
        if (paymentSuccess === 'success' && sessionId) {
            // Persist session ID so we can finalize even if auth/user loads after redirect.
            try {
                localStorage.setItem('postCheckoutSessionId', sessionId);
            } catch {}

            // Clean URL
            window.history.replaceState({}, '', window.location.pathname);
        } else if (paymentCanceled === 'true') {
            // Payment was canceled - clean URL
            window.history.replaceState({}, '', window.location.pathname);
            
            // Check if account was created but user is not authenticated
            const paymentAttemptStr = localStorage.getItem('paymentAttempt');
            if (paymentAttemptStr) {
                try {
                    const paymentAttempt = JSON.parse(paymentAttemptStr);
                    if (paymentAttempt.accountCreated && !isAuthenticated) {
                        // Account exists but user not logged in - show helpful message
                        showToast(
                            'Your account was created but payment was canceled. Please sign in to complete your plan selection.',
                            'info'
                        );
                        // Open login modal
                        setLoginModalInitialView('login');
                        setIsLoginModalOpen(true);
                    }
                } catch (e) {
                    console.error('Error parsing payment attempt:', e);
                }
            }
        }

        // Check for pending signup - if user is not authenticated but has pending signup, show plan selector
        const pendingSignup = localStorage.getItem('pendingSignup');
        if (!isAuthenticated && pendingSignup) {
            // User has filled signup form but hasn't created account yet - show plan selector
            setOnboardingStep('plan-selector');
            return;
        }

        if (isAuthenticated && user) {
            // If user has completed onboarding, they're done
            if (user.hasCompletedOnboarding) {
                setOnboardingStep('none');
                return;
            }
            
            // All users are Creators now - auto-set if missing
            if (!user.userType) {
                setUser({ ...user, userType: 'Creator' });
            }
            
            // If we just returned from Stripe, suppress plan selector until we finalize the session.
            // This prevents showing "Confirm plan" with Free selected while the plan is being applied.
            const postCheckoutSessionId = (() => {
                try { return localStorage.getItem('postCheckoutSessionId'); } catch { return null; }
            })();
            if (postCheckoutSessionId) {
                setOnboardingStep('none');
                return;
            }

            const subStatus = (user as { subscriptionStatus?: string }).subscriptionStatus;
            const inviteGrantPlan = (user as { inviteGrantPlan?: string }).inviteGrantPlan;
            if (subStatus === 'creator_invite_pending' && inviteGrantPlan === 'CreatorChoice') {
                setOnboardingStep('plan-selector');
                return;
            }

            // If the user just created an account during plan selection (pendingSignup flow),
            // resume checkout automatically (so we don't drop back to the landing page).
            try {
                const attemptRaw = localStorage.getItem('paymentAttempt');
                const attempt = attemptRaw ? JSON.parse(attemptRaw) : null;
                const attemptTs = typeof attempt?.timestamp === 'number' ? attempt.timestamp : null;
                const promptedAt = (() => {
                    const v = localStorage.getItem('paymentAttemptPromptedAt');
                    const n = v ? Number(v) : NaN;
                    return Number.isFinite(n) ? n : null;
                })();
                const alreadyPromptedForThisAttempt = !!attemptTs && !!promptedAt && attemptTs === promptedAt;

                if (
                    !alreadyPromptedForThisAttempt &&
                    attempt?.accountCreated &&
                    attempt?.resumeCheckout &&
                    (attempt?.plan === 'Pro' ||
                        attempt?.plan === 'Elite' ||
                        attempt?.plan === 'CreatorPro' ||
                        attempt?.plan === 'CreatorElite')
                ) {
                    const cycle = (attempt?.billingCycle === 'annually' ? 'annually' : 'monthly') as 'monthly' | 'annually';
                    const planName = attempt.plan as Plan;
                    const planData =
                        planName === 'Pro'
                            ? {
                                name: 'Pro' as const,
                                price:
                                    cycle === 'annually'
                                        ? echofluxEffectiveMonthlyWhenAnnualUsd(ECHOFLUX_PRO_MONTHLY_USD)
                                        : ECHOFLUX_PRO_MONTHLY_USD,
                                cycle,
                              }
                            : planName === 'CreatorPro'
                              ? {
                                    name: 'CreatorPro' as const,
                                    price: ECHOFLUX_CREATOR_PRO_INVITE_USD,
                                    cycle: 'monthly' as const,
                                  }
                              : planName === 'CreatorElite'
                                ? {
                                    name: 'CreatorElite' as const,
                                    price: ECHOFLUX_CREATOR_ELITE_INVITE_USD,
                                    cycle: 'monthly' as const,
                                  }
                                : {
                                    name: 'Elite' as const,
                                    price:
                                        cycle === 'annually'
                                            ? echofluxEffectiveMonthlyWhenAnnualUsd(ECHOFLUX_ELITE_MONTHLY_USD)
                                            : ECHOFLUX_ELITE_MONTHLY_USD,
                                    cycle,
                                  };

                    // Mark that we're prompting for this attempt
                    if (attemptTs) {
                        localStorage.setItem('paymentAttemptPromptedAt', String(attemptTs));
                    } else {
                        // Backward compatibility: if timestamp missing, fall back to simple flag.
                        localStorage.setItem('paymentAttemptPrompted', 'true');
                    }
                    
                    setOnboardingStep('none');
                    
                    // Use setTimeout to ensure openPaymentModal is ready and UI is rendered
                    setTimeout(() => {
                        const openModal = openPaymentModal;
                        if (openModal && typeof openModal === 'function') {
                            openModal(planData);
                            // Clear checkout transition flag after modal opens
                            try {
                                localStorage.removeItem('checkoutTransition');
                            } catch {}
                        } else {
                            // Retry once more if openPaymentModal wasn't ready
                            setTimeout(() => {
                                const retryOpenModal = openPaymentModal;
                                if (retryOpenModal && typeof retryOpenModal === 'function') {
                                    retryOpenModal(planData);
                                    try {
                                        localStorage.removeItem('checkoutTransition');
                                    } catch {}
                                }
                            }, 200);
                        }
                    }, 200);
                    
                    return;
                }
            } catch {}

            // New signup flow: Show plan selector first for users who haven't completed onboarding
            // Exception: If they already have a paid plan (Pro/Elite), they've already selected,
            // so proceed directly to onboarding
            // If plan is null, payment was canceled - show plan selector
            // BUT: Don't show plan selector if we're resuming a checkout (paymentAttempt exists or checkoutTransition is active)
            const hasActiveCheckoutResume = (() => {
                try {
                    const attemptRaw = localStorage.getItem('paymentAttempt');
                    const attempt = attemptRaw ? JSON.parse(attemptRaw) : null;
                    const checkoutTransition = localStorage.getItem('checkoutTransition');
                    return (
                        (attempt?.accountCreated &&
                            attempt?.resumeCheckout &&
                            (attempt?.plan === 'Pro' ||
                                attempt?.plan === 'Elite' ||
                                attempt?.plan === 'CreatorPro' ||
                                attempt?.plan === 'CreatorElite')) ||
                        checkoutTransition === 'true'
                    );
                } catch {
                    return false;
                }
            })();
            
            if ((!user.plan || user.plan === 'Free') && !hasActiveCheckoutResume) {
                setOnboardingStep('plan-selector');
                return;
            }
            const hasPaidPlan =
                user.plan === 'Pro' ||
                user.plan === 'Elite' ||
                user.plan === 'CreatorPro' ||
                user.plan === 'CreatorElite' ||
                user.plan === 'Agency';
            
            // If user has a pre-selected plan from landing page, handle it
            if (selectedPlan) {
                const igp = (user as { inviteGrantPlan?: string }).inviteGrantPlan;
                const isInviteGranted =
                    (user as { subscriptionStatus?: string }).subscriptionStatus === 'invite_grant' ||
                    igp === 'Pro' ||
                    igp === 'Elite';

                // If the user has invite-granted access, never override it based on a landing-page selection.
                if (isInviteGranted) {
                    setSelectedPlan(null);
                    setOnboardingStep('creator');
                    return;
                }

                if (selectedPlan === 'Free') {
                    // Free plan - proceed to onboarding.
                    // IMPORTANT: Do not write plan='Free' here, because it can accidentally overwrite an invite-granted Pro/Elite
                    // if the invite redemption completes slightly after the landing selection is set.
                    setSelectedPlan(null); // Clear selected plan
                    setOnboardingStep('creator');
                } else if (selectedPlan === 'Pro' || selectedPlan === 'Elite') {
                    // Paid plan - open payment modal instead of plan selector
                    const planData = selectedPlan === 'Pro'
                        ? { name: 'Pro', price: ECHOFLUX_PRO_MONTHLY_USD, cycle: 'monthly' as const }
                        : { name: 'Elite', price: ECHOFLUX_ELITE_MONTHLY_USD, cycle: 'monthly' as const };
                    openPaymentModal(planData);
                    setSelectedPlan(null); // Clear selected plan
                    // Don't set onboarding step yet - wait for payment to complete
                    return;
                }
            } else {
                // For authenticated users, proceed directly to onboarding.
                // We only use the plan selector during the unauthenticated signup flow (pendingSignup).
                setOnboardingStep('creator');
            }
        } else if (!isAuthenticated) {
            // Not authenticated and no pending signup - clear onboarding
            setOnboardingStep('none');
        }
    }, [isAuthenticated, user, setUser, selectedPlan, openPaymentModal, echofluxUrlSyncSuppressed]);

    useEffect(() => {
        if (fanOnlyEarlyExitShell) return;
        // Finalize Stripe checkout after redirect:
        // - works even if auth/user becomes available after redirect
        // - applies the correct plan immediately (no "Free confirm" modal)
        const postCheckoutSessionId = (() => {
            try { return localStorage.getItem('postCheckoutSessionId'); } catch { return null; }
        })();

        if (!postCheckoutSessionId) return;
        if (!isAuthenticated || !user) return;
        if (isFinalizingCheckout) return;

        // Prevent runaway loops (which can hammer Firebase token refresh and trip auth quota limits).
        // We retry a few times with exponential backoff; 401/403 are treated as terminal.
        const MAX_FINALIZE_ATTEMPTS = 5;
        const attemptCount = (() => {
            try {
                const n = Number(localStorage.getItem('postCheckoutFinalizeAttemptCount') || '0');
                return Number.isFinite(n) ? n : 0;
            } catch {
                return 0;
            }
        })();
        const nextAttemptAt = (() => {
            try {
                const n = Number(localStorage.getItem('postCheckoutFinalizeNextAttemptAt') || '0');
                return Number.isFinite(n) ? n : 0;
            } catch {
                return 0;
            }
        })();
        const nowMs = Date.now();
        if (nextAttemptAt && nowMs < nextAttemptAt) return;
        if (attemptCount >= MAX_FINALIZE_ATTEMPTS) {
            try {
                localStorage.removeItem('postCheckoutSessionId');
                localStorage.removeItem('postCheckoutFinalizeAttemptCount');
                localStorage.removeItem('postCheckoutFinalizeNextAttemptAt');
            } catch {}
            showToast('We couldn’t finalize your subscription automatically. Please restart checkout from the Pricing page.', 'error');
            return;
        }

        const finalize = async () => {
            setIsFinalizingCheckout(true);
            let backoffRecorded = false;
            const recordBackoff = () => {
                if (backoffRecorded) return;
                backoffRecorded = true;
                try {
                    const current = Number(localStorage.getItem('postCheckoutFinalizeAttemptCount') || '0');
                    const currentCount = Number.isFinite(current) ? current : 0;
                    const nextCount = currentCount + 1;
                    const backoffMs = Math.min(30000, 1000 * Math.pow(2, Math.max(0, nextCount - 1))); // 1s,2s,4s,8s,16s,30s...
                    localStorage.setItem('postCheckoutFinalizeAttemptCount', String(nextCount));
                    localStorage.setItem('postCheckoutFinalizeNextAttemptAt', String(Date.now() + backoffMs));
                } catch {}
            };
            try {
                // Get auth token for API call
                const { auth: fbAuth } = await import('./firebaseConfig');
                // Do NOT force refresh (`true`) here — on repeated failures that can quickly hit Firebase Auth quotas.
                const token = fbAuth.currentUser ? await fbAuth.currentUser.getIdToken() : null;
                if (!token) throw new Error('Not authenticated');

                // Verify and apply plan immediately (server-side)
                const resp = await fetch('/api/verifyCheckoutSession', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ sessionId: postCheckoutSessionId }),
                });

                if (!resp.ok) {
                    let msg = 'Failed to verify checkout';
                    let code: string | null = null;
                    try {
                        const j = await resp.json();
                        msg = j?.message || j?.error || msg;
                        code = j?.code || null;
                    } catch {}

                    // Terminal cases: stop retrying (prevents endless 401/403 spam).
                    if (resp.status === 401) {
                        try {
                            localStorage.removeItem('postCheckoutSessionId');
                            localStorage.removeItem('postCheckoutFinalizeAttemptCount');
                            localStorage.removeItem('postCheckoutFinalizeNextAttemptAt');
                        } catch {}
                        showToast('Please sign in again to finalize your subscription.', 'error');
                        return;
                    }
                    if (resp.status === 403) {
                        try {
                            localStorage.removeItem('postCheckoutSessionId');
                            localStorage.removeItem('postCheckoutFinalizeAttemptCount');
                            localStorage.removeItem('postCheckoutFinalizeNextAttemptAt');
                        } catch {}
                        showToast(
                            msg || 'This checkout session belongs to a different account. Please sign in with the correct account and try again.',
                            'error'
                        );
                        return;
                    }

                    // Retryable cases: record backoff so we don’t hammer the API/Firebase.
                    recordBackoff();

                    // If Stripe says the session isn’t complete yet, avoid a scary error toast.
                    if (resp.status === 409 || code === 'CHECKOUT_NOT_COMPLETE') {
                        showToast('Finalizing your subscription… please wait a moment.', 'info');
                        return;
                    }

                    throw new Error(msg);
                }

                // Refresh user data from Firestore so UI has the updated plan
                const { doc, getDoc } = await import('firebase/firestore');
                const { db } = await import('./firebaseConfig');
                const userRef = doc(db, 'users', user.id);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    const updatedUser = userSnap.data() as typeof user;
                    await setUser(updatedUser);
                }

                // Clear only after successful verification so this is safe/reversible.
                try {
                    localStorage.removeItem('postCheckoutSessionId');
                    localStorage.removeItem('paymentAttempt');
                    localStorage.removeItem('paymentAttemptPrompted');
                    localStorage.removeItem('paymentAttemptPromptedAt');
                    localStorage.removeItem('pendingSignup');
                    localStorage.removeItem('postCheckoutFinalizeAttemptCount');
                    localStorage.removeItem('postCheckoutFinalizeNextAttemptAt');
                } catch {}

                // Start onboarding on the dashboard for the paid plan the user chose.
                setOnboardingStep('creator');
            } catch (err: any) {
                console.error('Failed to finalize checkout session:', err);
                // Keep postCheckoutSessionId so we can retry later, but rate-limited by the backoff above.
                recordBackoff();
                showToast('We’re finalizing your subscription. If this doesn’t complete shortly, refresh the page.', 'error');
            } finally {
                setIsFinalizingCheckout(false);
            }
        };

        finalize();
    }, [isAuthenticated, user, isFinalizingCheckout, setUser, showToast]);

    const handleOnboardingComplete = async (opts?: { openFanHub?: boolean }) => {
        // Merge only onboarding completion — do not spread `user` from this closure or we can
        // overwrite niche/audience/creator fields the modal just wrote with stale state.
        if (user) {
            await setUser({ id: user.id, hasCompletedOnboarding: true });
        }
        setOnboardingStep('none');
        try {
            localStorage.setItem('settingsActiveTab', 'ai-training');
        } catch {}
        if (opts?.openFanHub) {
            setActivePage('fanHub');
        } else {
            setActivePage('settings');
        }
        setTimeout(() => startTour(), 600);
    };
    
    // Removed handleUserTypeSelected - all users are Creators now

    const handlePlanSelected = async (plan: Plan) => {
        // Plan is already saved in PlanSelectorModal
        // Ensure userType is set to Creator (all users are Creators)
        if (user && user.userType !== 'Creator') {
            await setUser({ ...user, userType: 'Creator' });
        }
        
        // For paid plans during signup, payment modal is opened in PlanSelectorModal
        // Just close the plan selector - don't start onboarding yet
        if (plan === 'Pro' || plan === 'Elite' || plan === 'CreatorPro' || plan === 'CreatorElite') {
            setOnboardingStep('none');
            return;
        }
        
        // For Free plan, proceed to onboarding
        setOnboardingStep('creator');
    };

    const handlePlanCancel = async () => {
        // Cancel signup process: sign out user and close modal
        // This will take them back to the landing page (user becomes null, so landing page shows)
        await handleLogout();
        setOnboardingStep('none');
    };

    const handleNavigateRequest = (page: Page) => {
        // Public pages that can be accessed when not authenticated
        // Note: 'about' and 'contact' are handled by LandingPage modals when not authenticated
        const publicPages: Page[] = ['pricing', 'faq', 'terms', 'privacy', 'dataDeletion'];
        
        if (isAuthenticated) {
            setActivePage(page);
        } else if (publicPages.includes(page)) {
            // For public pages, set the active page even if not authenticated
            setActivePage(page);
        } else if (page === 'about' || page === 'contact') {
            // About and Contact are shown in modals on landing page, don't navigate
            // The LandingPage component handles these via setLegalModal
            return;
        } else {
            setIsLoginModalOpen(true);
        }
    }

    // Auto-bypass maintenance for whitelisted users (must happen before maintenance check)
    useEffect(() => {
        if (fanOnlyEarlyExitShell) return;
        if (isAuthenticated && user) {
            const userCanBypass = canBypassMaintenance(user.email);
            if (userCanBypass && !bypassMaintenance) {
                setBypassMaintenance(true);
            }
        }
    }, [isAuthenticated, user, bypassMaintenance]);

    /** EchoFlux: register this device's push token for the signed-in creator/admin account. */
    useEffect(() => {
        if (fanOnlyEarlyExitShell || !isAuthenticated || !user) return;
        if (!import.meta.env.VITE_FIREBASE_VAPID_KEY) return;
        void syncWebPushForCurrentUser();
    }, [fanOnlyEarlyExitShell, isAuthenticated, user?.id]);

    /** Foreground push toasts when browser notifications are already enabled. */
    useEffect(() => {
        if (fanOnlyEarlyExitShell || !isAuthenticated || !user) return;
        if (!hasRegisteredPushToken()) return;
        const unsubForeground = listenForForegroundPush((title, body) => {
            showToast?.(`${title}${body ? `: ${body}` : ''}`, 'info');
        });
        return () => {
            unsubForeground?.();
        };
    }, [fanOnlyEarlyExitShell, isAuthenticated, user?.id, showToast]);

    if (isWitmeDiscoverPath) {
        return <WitmeDiscoverPage />;
    }

    if (isCreatorsApplyPath) {
        return <WitmeCreatorsApplyPage />;
    }

    if (isStorefrontPath) {
        return (
            <LazyBoundary label="Loading…">
                <FanStorefrontView />
            </LazyBoundary>
        );
    }

    // Calculate if user can bypass maintenance
    // If user is authenticated and whitelisted, they can bypass
    const canBypass = isAuthenticated && user && canBypassMaintenance(user.email);
    
    // Debug maintenance mode - only log in development or when maintenance is actually enabled
    if (import.meta.env.DEV || maintenanceEnabled) {
        console.log('🔧 Maintenance Mode Check', { 
            maintenanceEnabled, 
            envValue: import.meta.env.VITE_MAINTENANCE_MODE,
            envType: typeof import.meta.env.VITE_MAINTENANCE_MODE,
            bypassMaintenance, 
            canBypass, 
            isAuthenticated, 
            userEmail: user?.email,
        allowedEmail,
        willShowMaintenance: maintenanceEnabled && !canBypass && !bypassMaintenance
        });
    }
    
    // CRITICAL: Show maintenance page if enabled and user can't bypass
    // This MUST happen BEFORE any other rendering logic, including auth loading and landing page
    // This blocks ALL access including login when maintenance is enabled
    if (maintenanceEnabled) {
        // Only allow bypass if user is explicitly whitelisted and has bypassed
        if (!canBypass && !bypassMaintenance) {
            console.log('🔧 Showing Maintenance Page - blocking ALL access');
            return (
                <MaintenancePage 
                    allowedEmail={allowedEmail}
                    onBypass={allowedEmail ? () => setBypassMaintenance(true) : undefined}
                />
            );
        }
        // If maintenance is enabled but user can bypass, continue normally
        console.log('🔧 Maintenance Mode Active but user can bypass');
    }

    // Check for Firebase password reset actions BEFORE auth checks.
    // Important: Firebase may redirect back to:
    // - /reset-password?mode=resetPassword&oobCode=...
    // - /reset-password/#mode=resetPassword&oobCode=...
    // - /?mode=resetPassword&oobCode=...   (depending on template / config)
    // and users may already be logged in, so we must force-show the reset UI.
    if (typeof window !== 'undefined') {
        const normalizedPath = window.location.pathname.replace(/\/+$/, '');
        const searchParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));

        const mode = searchParams.get('mode') || hashParams.get('mode');
        const oobCode = searchParams.get('oobCode') || hashParams.get('oobCode');

        const isResetPasswordAction =
            (normalizedPath === '/reset-password') ||
            (mode === 'resetPassword' && !!oobCode);

        if (isResetPasswordAction) {
            return <ResetPassword />;
        }
    }

    // witme.io root is the fan-facing trust/discovery destination layer.
    if (isWitmeRootPath) {
        return <WitmeHomepage />;
    }

    // Debug logging
    if (process.env.NODE_ENV === 'development') {
        console.log('AppContent render:', { isAuthLoading, isAuthenticated, hasUser: !!user, activePage, maintenanceEnabled, bypassMaintenance, canBypass });
    }

    const guestPageFromPath = guestStandalonePageFromPath();
    const guestLoginModal =
        isLoginModalOpen ? (
            <LoginModal
                isOpen={isLoginModalOpen}
                onClose={() => {
                    setIsLoginModalOpen(false);
                    if (!isAuthenticated) {
                        setSelectedPlan(null);
                    }
                }}
                initialView={loginModalInitialView}
                selectedPlan={selectedPlan || undefined}
            />
        ) : null;
    const guestShellProps = {
        onHome: () => {
            try {
                window.history.replaceState({}, '', '/');
            } catch {
                /* ignore */
            }
            setActivePage('dashboard');
        },
        onSignIn: () => {
            setLoginModalInitialView('login');
            setIsLoginModalOpen(true);
        },
        onGetStarted: () => {
            setLoginModalInitialView('signup');
            setIsLoginModalOpen(true);
        },
        onNavigateRequest: handleNavigateRequest,
        loginModal: guestLoginModal,
    };

    if (isAuthLoading) {
        if (guestPageFromPath) {
            return <GuestStandaloneShell page={guestPageFromPath} {...guestShellProps} />;
        }
        return <div className="h-screen w-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900"><p className="text-gray-500 dark:text-gray-400">Loading...</p></div>;
    }

    // Check for pending signup - if exists, show plan selector instead of landing page
    const pendingSignup = typeof window !== 'undefined' ? localStorage.getItem('pendingSignup') : null;
    
    // Show landing page/login only if maintenance is NOT enabled OR user can bypass
    if (!isAuthenticated) {
        // If there's a pending signup, show plan selector modal
        if (pendingSignup && onboardingStep === 'plan-selector') {
            return (
                <>
                    <PublicAnnouncementBanner />
                    <LandingPage 
                        onLoginClick={() => {
                            setLoginModalInitialView('login');
                            setIsLoginModalOpen(true);
                        }}
                        onGetStartedClick={() => {
                            setLoginModalInitialView('signup');
                            setIsLoginModalOpen(true);
                        }}
                        onNavigateRequest={handleNavigateRequest} 
                    />
                    <PlanSelectorModal userType="Creator" onSelect={handlePlanSelected} onCancel={handlePlanCancel} />
                    {isLoginModalOpen && (
                        <LoginModal 
                            isOpen={isLoginModalOpen} 
                            onClose={() => {
                                setIsLoginModalOpen(false);
                                // Clear selected plan when closing modal if user didn't sign up
                                if (!isAuthenticated) {
                                    setSelectedPlan(null);
                                }
                            }}
                            initialView={loginModalInitialView}
                            selectedPlan={selectedPlan || undefined}
                        />
                    )}
                </>
            );
        }

        /** Guest deep links (/privacy, /terms, …): URL sync sets `activePage` but landing-only branch hid these pages. */
        const standaloneGuestPages: readonly Page[] = ['privacy', 'terms', 'faq', 'dataDeletion', 'pricing'];
        const guestPage = standaloneGuestPages.includes(activePage)
            ? activePage
            : guestPageFromPath;
        if (guestPage && standaloneGuestPages.includes(guestPage)) {
            return <GuestStandaloneShell page={guestPage} {...guestShellProps} />;
        }

        return (
            <>
                <PublicAnnouncementBanner />
                <LandingPage 
                    onLoginClick={() => {
                        setLoginModalInitialView('login');
                        setIsLoginModalOpen(true);
                    }}
                    onGetStartedClick={() => {
                        setLoginModalInitialView('signup');
                        setIsLoginModalOpen(true);
                    }}
                    onNavigateRequest={handleNavigateRequest} 
                />
                {isLoginModalOpen && (
                    <LoginModal 
                        isOpen={isLoginModalOpen} 
                        onClose={() => {
                            setIsLoginModalOpen(false);
                            // Clear selected plan when closing modal if user didn't sign up
                            if (!isAuthenticated) {
                                setSelectedPlan(null);
                            }
                        }}
                        initialView={loginModalInitialView}
                        selectedPlan={selectedPlan || undefined}
                    />
                )}
            </>
        );
    }
    
    const pageTitle = pageTitles[activePage] || 'Dashboard';
    
    // Show loading state if user is not yet loaded (but authenticated)
    if (!user && isAuthenticated) {
        console.warn('User is authenticated but user object is null - waiting for user data...');
        return <div className="h-screen w-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900"><p className="text-gray-500 dark:text-gray-400">Loading user data...</p></div>;
    }

    // Invite-only mode gate: allow only Admins and users who have redeemed an invite.
    if (isAuthenticated && user) {
        const inviteOnly = isInviteOnlyMode();
        const isAdminInvite = (user as { role?: string })?.role === 'Admin';
        const inviteStaffBypass = hasInviteModeStaffBypass(user);
        const invitedWithCode = (user as { invitedWithCode?: string })?.invitedWithCode;
        if (inviteOnly && !isAdminInvite && !inviteStaffBypass && !invitedWithCode) {
            return <InviteRequiredPage />;
        }
    }

    // Safety check - if user is still null after being authenticated, show error
    if (!user) {
        console.error('User is null but authenticated - this should not happen');
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
                <div className="text-center">
                    <p className="text-red-600 dark:text-red-400 mb-2">Failed to load user data.</p>
                    <button 
                        onClick={() => window.location.reload()} 
                        className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                    >
                        Reload Page
                    </button>
                </div>
            </div>
        );
    }

    const isAdminUser = (user as { role?: string }).role === 'Admin';
    const trustedStaffEchoShell = !!(user.staffRoleFlags?.contentAudit || user.staffRoleFlags?.legalDisclosureReserve);
    if (!creatorAppAccess && !isAdminUser && !trustedStaffEchoShell) {
        if (activePage === 'pricing') {
            return (
                <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
                    <Pricing
                        onBack={() => setActivePage('dashboard')}
                        backLabel="Back"
                    />
                </div>
            );
        }
        return (
            <FanOnlyEchoFluxShell
                user={user}
                onLogout={handleLogout}
                onRefreshAccess={refreshCreatorAppAccess}
                onGoToPricing={() => {
                    setPricingView('Creator');
                    setActivePage('pricing');
                }}
            />
        );
    }

    return (
        <div className="flex h-screen bg-gray-100 dark:bg-gray-900 font-sans w-full overflow-x-hidden">
            {/* Loading overlay during checkout transition to prevent flash */}
            {showCheckoutTransition && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-90 backdrop-blur-sm">
                    <div className="text-center">
                        <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent mb-4"></div>
                        <p className="text-white text-lg font-medium">Setting up your account...</p>
                        <p className="text-white/70 text-sm mt-2">Redirecting to secure checkout</p>
                    </div>
                </div>
            )}
            {onboardingStep === 'plan-selector' && (
                <PlanSelectorModal
                    userType="Creator"
                    variant={
                        (user as { subscriptionStatus?: string }).subscriptionStatus === 'creator_invite_pending' &&
                        (user as { inviteGrantPlan?: string }).inviteGrantPlan === 'CreatorChoice'
                            ? 'creatorInvite'
                            : 'default'
                    }
                    onSelect={handlePlanSelected}
                    onCancel={handlePlanCancel}
                />
            )}
            {onboardingStep === 'creator' && <CreatorOnboardingModal onComplete={handleOnboardingComplete} />}

            {isTourActive && <InteractiveTour />}
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden relative min-w-0 w-full">
                <AnnouncementBanner />
                <Header pageTitle={pageTitle} />
                <main
                    className={`flex-1 min-w-0 overflow-x-hidden overflow-y-auto custom-scrollbar dark:custom-scrollbar ${
                        activePage === 'fanHub' ? 'px-0 py-4 lg:p-6' : 'p-6'
                    }`}
                >
                    <MainContent />
                </main>
                {isCRMOpen && <CRMSidebar />}
            </div>
            <PaymentModal />
            {toast && <Toast message={toast.message} type={toast.type} />}
            <UnifiedAssistant />
        </div>
    );
}

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AuthProvider>
          <UIProvider>
              <DataProvider>
                  <AppContent />
              </DataProvider>
          </UIProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
};

export default App;