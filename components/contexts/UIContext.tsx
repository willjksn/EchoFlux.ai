
import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { Page, DashboardNavState, TourStep, PaymentPlan, Toast, ComposeContextData, Plan } from '../../types';
import { useAuth } from './AuthContext';
import { getTourStepsForPlan } from '../../constants';

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
    showToast: (message: string, type: 'success' | 'error') => void;
    
    // Pricing
    pricingView: 'Creator' | 'Business' | null;
    setPricingView: (view: 'Creator' | 'Business' | null) => void;
    
    // Selected plan from landing page (for signup flow)
    selectedPlan: Plan | null;
    setSelectedPlan: (plan: Plan | null) => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export const UIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    
    const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            const savedTheme = localStorage.getItem('theme');
            // Default to dark mode if no preference is saved, or if saved preference is 'dark'
            return savedTheme ? savedTheme === 'dark' : true;
        }
        return true;
    });
    
    const [activePageState, setActivePageState] = useState<Page>('dashboard');
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
        inbox: '/inbox',
        analytics: '/analytics',
        settings: '/settings',
        compose: '/compose',
        calendar: '/calendar',
        approvals: '/approvals',
        team: '/team',
        opportunities: '/opportunities',
        profile: '/profile',
        about: '/about',
        contact: '/contact',
        pricing: '/pricing',
        clients: '/clients',
        faq: '/faq',
        terms: '/terms',
        privacy: '/privacy',
        dataDeletion: '/dataDeletion',
        admin: '/admin',
        automation: '/automation',
        bio: '/bio',
        strategy: '/strategy',
        ads: '/ads',
        mediaLibrary: '/mediaLibrary',
        autopilot: '/autopilot',
        onlyfansStudio: '/premiumcontentstudio',
    };

    const pathToPage: Record<string, Page> = Object.entries(pageToPath).reduce((acc, [page, path]) => {
        if (path) acc[normalizePath(path)] = page as Page;
        return acc;
    }, {} as Record<string, Page>);
    // Accept legacy route for backward compatibility
    pathToPage['/onlyfansstudio'] = 'onlyfansStudio';

    const isRoutableAppPath = (path: string) => {
        const p = normalizePath(path);
        return p === '/' || !!pathToPage[p];
    };

    // Wrapper so all navigation goes through a single place.
    const setActivePage = (page: Page) => {
        setActivePageState(page);
    };

    // Initialize active page from URL (or last saved page) after auth resolves.
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const currentPath = normalizePath(window.location.pathname);

        // Never hijack public bio pages (e.g. /username) or special flows (e.g. /reset-password).
        if (!isRoutableAppPath(currentPath)) return;
        if (currentPath === '/reset-password') return;

        // If URL explicitly maps to a page, honor it.
        const fromUrl = pathToPage[currentPath];
        if (fromUrl) {
            setActivePageState(fromUrl);
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
        // Avoid rewriting public bio pages / special flows.
        if (!isRoutableAppPath(currentPath) || currentPath === '/reset-password') return;

        try {
            localStorage.setItem(LAST_ACTIVE_PAGE_KEY, activePageState);
        } catch {}

        const targetPath = pageToPath[activePageState];
        if (!targetPath) return;

        if (normalizePath(window.location.pathname) !== normalizePath(targetPath)) {
            window.history.pushState({}, '', targetPath);
        }
    }, [activePageState, user?.id]);

    // Support browser back/forward navigation.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!user?.id) return;

        const onPopState = () => {
            const p = normalizePath(window.location.pathname);
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
            // Wait for page to render before starting tour
            setTimeout(() => {
                setTourSteps(steps);
                setTourStep(0);
                setIsTourActive(true);
            }, 500);
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
    };

    const nextTourStep = () => {
        if (tourStep < tourSteps.length - 1) {
            const next = tourSteps[tourStep + 1];
            // Navigate to the page for the next step if needed
            if (next.page && activePageState !== next.page) {
                setActivePage(next.page);
                // Wait a bit for the page to render before moving to next step
                setTimeout(() => {
                    setTourStep(prev => prev + 1);
                }, 300);
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

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

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
