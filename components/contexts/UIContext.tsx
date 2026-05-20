
import React, { createContext, useState, useEffect, useCallback, useContext, ReactNode } from 'react';
import { Page, DashboardNavState, TourStep, PaymentPlan, Toast, ComposeContextData, Plan } from '../../types';
import { useAuth } from './AuthContext';
import { getTourStepsForPlan } from '../../constants';
import { setComposeStrategyHandoffActive } from '../../src/lib/composeStrategyHandoff';

interface UIContextType {
    isDarkMode: boolean;
    toggleTheme: () => void;
    activePage: Page;
    setActivePage: (page: Page) => void;
    isSidebarOpen: boolean;
    setIsSidebarOpen: (isOpen: boolean) => void;
    
    // Navigation
    dashboardNavState: DashboardNavState | null;
    navigateToDashboardWithFilter: (filters: Partial<any>, highlightId?: string) => void;
    clearDashboardNavState: () => void;
    composeContext: ComposeContextData | null;
    setComposeContext: (data: ComposeContextData) => void;
    clearComposeContext: () => void;
    
    // Tour
    isTourActive: boolean;
    tourStep: number;
    tourSteps: TourStep[];
    startTour: () => void;
    nextTourStep: () => void;
    endTour: () => void;

    // Modals
    isPaymentModalOpen: boolean;
    paymentPlan: PaymentPlan | null;
    openPaymentModal: (plan: PaymentPlan) => void;
    closePaymentModal: () => void;
    isCRMOpen: boolean;
    activeCRMProfileId: string | null;
    openCRM: (user: { name: string; avatar: string }) => void;
    closeCRM: () => void;

    // Feedback
    toast: Toast | null;
    showToast: (message: string, type: 'success' | 'error' | 'info') => void;
    
    // Pricing
    pricingView: 'Creator' | 'Business' | null;
    setPricingView: (view: 'Creator' | 'Business' | null) => void;
    
    // Selected plan from landing page (for signup flow)
    selectedPlan: Plan | null;
    setSelectedPlan: (plan: Plan | null) => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

/** Query keys we must keep when syncing path (OAuth/Stripe return URLs land on `/` then become `/dashboard`). */
const RETURN_PARAM_KEYS = new Set([
  'oauth_success',
  'error',
  'connected',
  'platform',
  'message',
  'details',
  'type',
  'account',
  'ig_accounts',
  'reason',
  'session_id',
  'payment',
  'canceled',
]);

const isWitmeSurfacePath = (path: string): boolean => {
  const p = (path || '/').split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  return p === '/' || p === '/discover';
};

const isWitmePreviewMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname || '';
  const isWitmeHost = /^([a-z0-9-]+\.)*witme\.io$/i.test(host);
  if (isWitmeHost) return true;

  try {
    const fromQuery = new URLSearchParams(window.location.search).get('witmePreview') === '1';
    if (fromQuery) {
      window.sessionStorage.setItem('witmePreview', '1');
      return true;
    }
    return window.sessionStorage.getItem('witmePreview') === '1';
  } catch {
    return false;
  }
};

function mergePathPreservingReturnParams(targetPath: string): string {
  if (typeof window === 'undefined') return targetPath;
  const search = window.location.search;
  if (!search || search.length <= 1) return targetPath;
  const incoming = new URLSearchParams(search);
  const keep = new URLSearchParams();
  for (const [k, v] of incoming.entries()) {
    if (RETURN_PARAM_KEYS.has(k)) keep.append(k, v);
  }
  if (keep.toString() === '') return targetPath;
  const u = new URL(targetPath, window.location.origin);
  for (const [k, v] of keep.entries()) {
    u.searchParams.append(k, v);
  }
  return u.pathname + u.search;
}

export const UIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    
    const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            const savedTheme = localStorage.getItem('theme');
            // Default to light mode if no preference is saved
            return savedTheme ? savedTheme === 'dark' : false;
        }
        return false;
    });
    
    const [activePageState, setActivePageState] = useState<Page>('dashboard');

    // Allow Strategy → Compose handoff to survive React Strict Mode remounts (see composeStrategyHandoff.ts).
    // Treat approvals (drafts) as the same shell as compose so switching tabs does not drop the handoff.
    useEffect(() => {
        if (activePageState !== 'compose' && activePageState !== 'approvals') {
            setComposeStrategyHandoffActive(false);
        }
    }, [activePageState]);

    const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
    
    const [dashboardNavState, setDashboardNavState] = useState<DashboardNavState | null>(null);
    const [composeContext, setComposeContextState] = useState<ComposeContextData | null>(null);
    
    const [isTourActive, setIsTourActive] = useState<boolean>(false);
    const [tourStep, setTourStep] = useState<number>(0);
    const [tourSteps, setTourSteps] = useState<TourStep[]>([]);
    
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [paymentPlan, setPaymentPlan] = useState<PaymentPlan | null>(null);
    const [toast, setToast] = useState<Toast | null>(null);
    
    const [isCRMOpen, setIsCRMOpen] = useState(false);
    const [activeCRMProfileId, setActiveCRMProfileId] = useState<string | null>(null);
    const [pendingCRMUser, setPendingCRMUser] = useState<{ name: string; avatar: string } | null>(null);
    const [pricingView, setPricingView] = useState<'Creator' | 'Business' | null>(null);
    const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

    useEffect(() => {
        // Ensure the class is present on mount based on state
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    }, [isDarkMode]);

    const toggleTheme = () => setIsDarkMode(prev => !prev);

    /*--------------------------------------------------------------------
      ROUTING: Persist current page across refresh
    --------------------------------------------------------------------*/
    const LAST_ACTIVE_PAGE_KEY = 'lastActivePage';

    const normalizePath = (p: string) => (p || '/').split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';

    // Keep this list aligned with App.tsx `knownRoutes` to avoid bio-page collisions.
    const pageToPath: Partial<Record<Page, string>> = {
        dashboard: '/dashboard',
        analytics: '/analytics',
        settings: '/settings',
        compose: '/create-post',
        calendar: '/my-schedule',
        approvals: '/create-post/drafts',
        team: '/team',
        opportunities: '/plan',
        profile: '/profile',
        about: '/about',
        contact: '/contact',
        pricing: '/pricing',
        clients: '/clients',
        faq: '/faq',
        terms: '/terms',
        privacy: '/privacy',
        dataDeletion: '/data-deletion',
        admin: '/admin',
        automation: '/automation',
        bio: '/bio-link-page',
        strategy: '/plan',
        "creator-os": '/plan',
        ads: '/ads',
        mediaLibrary: '/my-vault',
        autopilot: '/autopilot',
        onlyfansStudio: '/studio',
        emailCenter: '/email-center',
        premiumStudioUpgrade: '/premium-studio-upgrade',
        fanHub: '/fan-hub',
        witmePage: '/witme-page',
    };

    const pathToPage: Record<string, Page> = Object.entries(pageToPath).reduce((acc, [page, path]) => {
        if (path) acc[normalizePath(path)] = page as Page;
        return acc;
    }, {} as Record<string, Page>);
    // Accept legacy routes for backward compatibility (case variants)
    pathToPage['/onlyfansstudio'] = 'onlyfansStudio';
    pathToPage['/onlyfansStudio'] = 'onlyfansStudio';
    // Legacy approvals route
    pathToPage['/approvals'] = 'approvals';
    // Legacy trends route - redirect to strategy (What to Post)
    pathToPage['/opportunities'] = 'strategy';
    pathToPage['/find-trends'] = 'strategy';
    pathToPage['/compose'] = 'compose';
    pathToPage['/create-post'] = 'compose';
    pathToPage['/compose/drafts'] = 'compose';
    pathToPage['/create-post/drafts'] = 'compose';
    pathToPage['/drafts'] = 'compose';
    pathToPage['/write-captions'] = 'compose';
    // Legacy strategy route
    pathToPage['/what-to-post'] = 'strategy';
    pathToPage['/plan-my-week'] = 'strategy';
    pathToPage['/strategy'] = 'strategy';
    pathToPage['/creator-os'] = 'creator-os';
    // Legacy schedule route
    pathToPage['/calendar'] = 'calendar';
    // Legacy media library route
    pathToPage['/mediaLibrary'] = 'mediaLibrary';
    pathToPage['/bio'] = 'fanHub';
    pathToPage['/bio-link-page'] = 'fanHub';
    // Legacy studio route
    pathToPage['/premiumcontentstudio'] = 'onlyfansStudio';
    pathToPage['/emailCenter'] = 'emailCenter';
    pathToPage['/premium-studio-upgrade'] = 'premiumStudioUpgrade';
    pathToPage['/studio'] = 'onlyfansStudio';
    pathToPage['/fan'] = 'fanHub';
    pathToPage['/fan-hub'] = 'fanHub';
    pathToPage['/witme-page'] = 'witmePage';
    // Legacy
    pathToPage['/premium-content-studio'] = 'onlyfansStudio';
    pathToPage['/data-deletion'] = 'dataDeletion';
    pathToPage['/datadeletion'] = 'dataDeletion';

    const isRoutableAppPath = (path: string) => {
        const p = normalizePath(path);
        if (p === '/') return true;
        if (pathToPage[p]) return true;
        // Create Post sub-routes
        if (p === '/compose/drafts' || p === '/create-post/drafts') return true;
        return false;
    };

    // Wrapper so all navigation goes through a single place.
    const setActivePage = (page: Page) => {
        setActivePageState(page);
    };

    // Initialize active page from URL (or last saved page) after auth resolves.
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const currentPath = normalizePath(window.location.pathname);
        if (isWitmePreviewMode() && isWitmeSurfacePath(currentPath)) return;

        // Never hijack public bio pages (e.g. /username) or special flows (e.g. /reset-password).
        if (!isRoutableAppPath(currentPath)) return;
        if (currentPath === '/reset-password') return;

        // If URL explicitly maps to a page, honor it.
        const fromUrl = pathToPage[currentPath];
        if (fromUrl) {
            setActivePageState(fromUrl);
            // Legacy bio routes: canonicalize to Fan Hub (same surface as My Page / Purchases)
            if (currentPath === '/bio' || currentPath === '/bio-link-page') {
                const params =
                    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
                if (!params.get('tab')) params.set('tab', 'myPage');
                const target = `/fan-hub?${params.toString()}`;
                if (typeof window !== 'undefined' && window.history.replaceState) {
                    window.history.replaceState({}, '', target);
                }
            }
            // Legacy Premium Studio → Fan Hub or Settings (sidebar entry removed).
            if (currentPath === '/studio') {
                const params =
                    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
                const tab = params.get('tab');
                const target =
                    tab === 'persona'
                        ? '/settings'
                        : tab === 'dmSession'
                          ? '/fan-hub?tab=messages'
                          : tab === 'drops'
                            ? '/fan-hub?tab=posts&postsPanel=drops'
                            : '/fan-hub?tab=posts&postsPanel=ideas';
                if (tab === 'persona') {
                    try {
                        localStorage.setItem('settingsActiveTab', 'ai-training');
                        localStorage.setItem('openCreatorIdentityBuilder', '1');
                    } catch {
                        /* ignore */
                    }
                    setActivePageState('settings');
                } else {
                    setActivePageState('fanHub');
                }
                if (typeof window !== 'undefined' && window.history.replaceState) {
                    window.history.replaceState({}, '', target);
                }
                return;
            }
            // Fan Hub route: default tab myPage if missing and canonicalize legacy /fan to /fan-hub.
            if (currentPath === '/fan' || currentPath === '/fan-hub') {
                const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
                if (!params.get('tab')) params.set('tab', 'myPage');
                const target = `/fan-hub?${params.toString()}`;
                if (typeof window !== 'undefined' && window.history.replaceState) {
                    window.history.replaceState({}, '', target);
                }
            }
            return;
        }

        // If user is authenticated and URL is '/', restore last page.
        if (user?.id && currentPath === '/') {
            try {
                const saved = localStorage.getItem(LAST_ACTIVE_PAGE_KEY) as Page | null;
                if (saved) {
                    setActivePageState(saved);
                }
            } catch {}
        }
    }, [user?.id]);

    // Persist page + keep URL in sync so refresh stays on current page.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!user?.id) return; // only do this for authenticated app navigation

        const currentPath = normalizePath(window.location.pathname);
        if (isWitmePreviewMode() && isWitmeSurfacePath(currentPath)) return;
        // Avoid rewriting public bio pages / special flows.
        if (!isRoutableAppPath(currentPath) || currentPath === '/reset-password') return;

        try {
            localStorage.setItem(LAST_ACTIVE_PAGE_KEY, activePageState);
        } catch {}

        // Retired: never push /studio from last-active-page restore.
        if (activePageState === 'onlyfansStudio' || activePageState === 'premiumStudioUpgrade') {
            setActivePageState('fanHub');
            return;
        }

        const targetPath = activePageState === 'bio'
            ? '/fan-hub?tab=myPage'
            : activePageState === 'fanHub'
            ? '/fan-hub?tab=myPage'
            : pageToPath[activePageState];
        if (!targetPath) return;

        // Create Post owns its main and drafts paths; canonicalize legacy /compose on the next nav.
        if (activePageState === 'compose' && (currentPath === '/create-post' || currentPath === '/create-post/drafts')) return;

        const targetPathNormalized = normalizePath(targetPath);
        // When already on Fan Hub, don't overwrite URL so tab changes from the layout are preserved.
        if (activePageState === 'fanHub' && currentPath === '/fan-hub') return;
        // Bio page resolves to Fan Hub; preserve ?tab= the same way.
        if (activePageState === 'bio' && currentPath === '/fan-hub') return;
        if (activePageState === 'strategy' && currentPath === '/plan') return;
        if (activePageState === 'creator-os' && currentPath === '/plan') {
            const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
            if (params.get('tab') === 'money-flow') return;
        }

        const pathToPush =
            activePageState === 'bio' || activePageState === 'fanHub'
                ? '/fan-hub?tab=myPage'
                : activePageState === 'creator-os'
                ? '/plan?tab=money-flow'
                : targetPath;
        if (currentPath !== targetPathNormalized) {
            window.history.pushState({}, '', mergePathPreservingReturnParams(pathToPush));
        }
    }, [activePageState, user?.id]);

    // Support browser back/forward navigation.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!user?.id) return;

        const onPopState = () => {
            const p = normalizePath(window.location.pathname);
            if (isWitmePreviewMode() && isWitmeSurfacePath(p)) return;
            const mapped = pathToPage[p];
            if (mapped) setActivePageState(mapped);
        };

        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, [user?.id]);
    
    const navigateToDashboardWithFilter = (filters: Partial<any>, highlightId?: string) => {
        setDashboardNavState({ filters, highlightId });
        setActivePage('dashboard');
    };
    
    const clearDashboardNavState = () => setDashboardNavState(null);

    const setComposeContext = (data: ComposeContextData) => {
        setComposeContextState(data);
        setActivePage('compose');
    };
    const clearComposeContext = () => setComposeContextState(null);
    
    const startTour = () => {
        if (!user) return;
        // FIX: Passed the full 'user' object instead of 'user.plan' to match the function signature.
        const steps = getTourStepsForPlan(user);
        const firstStepPage = steps[0]?.page;
        
        // If first step requires a specific page, navigate there first
        if (firstStepPage && activePageState !== firstStepPage) {
            setActivePage(firstStepPage);
            // Wait briefly for the page to render before starting tour
            setTimeout(() => {
                setTourSteps(steps);
                setTourStep(0);
                setIsTourActive(true);
            }, 400);
        } else {
            // Start tour immediately if already on correct page
            setTourSteps(steps);
            setTourStep(0);
            setIsTourActive(true);
        }
    };

    const endTour = () => {
        setIsTourActive(false);
        setTourStep(0);
        setTourSteps([]);
        // Navigate back to dashboard when tour ends
        setActivePage('dashboard');
    };

    const nextTourStep = () => {
        if (tourStep < tourSteps.length - 1) {
            const next = tourSteps[tourStep + 1];
            // Navigate to the page for the next step if needed
            if (next.page && activePageState !== next.page) {
                if (next.page === 'settings') {
                    try {
                        localStorage.setItem('settingsActiveTab', 'ai-training');
                    } catch {}
                }
                // Hide overlay immediately by resetting targetRect
                // Navigate to new page
                setActivePage(next.page);
                // Wait a bit longer for the page to render before moving to next step
                // This gives the page time to mount and the element to be available
                setTimeout(() => {
                    setTourStep(prev => prev + 1);
                }, 500);
            } else {
                setTourStep(prev => prev + 1);
            }
        } else {
            endTour();
        }
    };
    
    const openPaymentModal = (plan: PaymentPlan) => {
        setPaymentPlan(plan);
        setIsPaymentModalOpen(true);
    };

    const closePaymentModal = () => {
        setIsPaymentModalOpen(false);
        setPaymentPlan(null);
    };

    /** Stable ref so consumers' useCallback(..., [showToast]) does not invalidate every render (avoids API refetch loops). */
    const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    const openCRM = (targetUser: { name: string; avatar: string }) => {
        setActiveCRMProfileId(targetUser.name); // Using name as ID for simplicity
        setPendingCRMUser(targetUser); // Store user info for profile creation if needed
        setIsCRMOpen(true);
    };

    const closeCRM = () => {
        setIsCRMOpen(false);
        setActiveCRMProfileId(null);
        setPendingCRMUser(null);
    };
    
    const value = {
        isDarkMode, toggleTheme, activePage: activePageState, setActivePage, isSidebarOpen, setIsSidebarOpen,
        dashboardNavState, navigateToDashboardWithFilter, clearDashboardNavState,
        composeContext, setComposeContext, clearComposeContext,
        isTourActive, tourStep, tourSteps, startTour, nextTourStep, endTour,
        isPaymentModalOpen, paymentPlan, openPaymentModal, closePaymentModal,
        isCRMOpen, activeCRMProfileId, openCRM, closeCRM,
        toast, showToast,
        pricingView, setPricingView,
        selectedPlan, setSelectedPlan,
    };

    return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
};

export const useUI = (): UIContextType => {
    const context = useContext(UIContext);
    if (context === undefined) {
        throw new Error('useUI must be used within a UIProvider');
    }
    return context;
};
