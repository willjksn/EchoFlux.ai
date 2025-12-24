
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
    
    const [activePage, setActivePage] = useState<Page>('dashboard');
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
        if (firstStepPage && activePage !== firstStepPage) {
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
            if (next.page && activePage !== next.page) {
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
        isDarkMode, toggleTheme, activePage, setActivePage, isSidebarOpen, setIsSidebarOpen,
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
