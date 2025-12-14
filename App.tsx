
import React, { useState, useEffect } from 'react';
import { useAppContext } from './components/AppContext';
import { AuthProvider } from './components/contexts/AuthContext';
import { UIProvider } from './components/contexts/UIContext';
import { DataProvider } from './components/contexts/DataContext';

import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { Analytics } from './components/Analytics';
import { Settings } from './components/Settings';
import { LandingPage } from './components/LandingPage';
import { LoginModal } from './components/LoginModal';
import { Compose } from './components/Compose';
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
import { AdminDashboard } from './components/AdminDashboard';
import Automation from './components/Automation';
import { Calendar } from './components/Calendar';
import MediaLibrary from './components/MediaLibrary';
import { Approvals } from './components/Approvals';
import { Inbox } from './components/Inbox';
import { OnboardingSelector } from './components/OnboardingSeledtor';
import { CreatorOnboardingModal } from './components/CreatorOnboardingModal';
import { BusinessOnboardingModal } from './components/BusinessOnboardingModal';
import { PlanSelectorModal } from './components/PlanSelectorModal';
import { MaintenancePage } from './components/MaintenancePage';
import { isMaintenanceMode, getAllowedEmail, canBypassMaintenance } from './src/utils/maintenance';
import { InteractiveTour } from './components/InteractiveTour';
import { PaymentModal } from './components/PaymentModal';
import { Toast } from './components/Toast';
import { Chatbot } from './components/Chatbot';
import { Page, UserType, Plan } from './types';
import { Pricing } from './components/Pricing';
import { CRMSidebar } from './components/CRMSidebar';
import { BioPageBuilder } from './components/BioPageBuilder';
import { Strategy } from './components/Strategy';
import { AdGenerator } from './components/AdGenerator';
import { VoiceAssistant } from './components/VoiceAssistant';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OnlyFansStudio } from './components/OnlyFansStudio';
import { BioPageView } from './components/BioPageView';

const pageTitles: Record<Page, string> = {
    dashboard: 'Dashboard',
    inbox: 'Inbox',
    analytics: 'Analytics',
    settings: 'Settings',
    compose: 'Compose',
    calendar: 'Content Calendar',
    approvals: 'Approval Workflow',
    team: 'Team Management',
    opportunities: 'Opportunities',
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
    bio: 'Link in Bio Builder',
    strategy: 'AI Content Strategist',
    ads: 'AI Ad Generator',
    mediaLibrary: 'Media Library',
    autopilot: 'AI Autopilot',
    onlyfansStudio: 'OnlyFans Studio',
};

const MainContent: React.FC = () => {
    try {
        const { user, activePage } = useAppContext();

        switch (activePage) {
            case 'dashboard': return <Dashboard />;
            case 'inbox': return <Inbox />;
            case 'analytics': return <Analytics />;
            case 'settings': return <Settings />;
            case 'compose': return <Compose />;
            case 'calendar': return <Calendar />;
            case 'approvals': return <Approvals />;
            case 'team': return <Team />;
            case 'opportunities': return <Opportunities />;
            case 'profile': return <Profile />;
            case 'about': return <About />;
            case 'contact': return <Contact />;
            case 'pricing': return <Pricing />;
            case 'clients': return <Clients />;
            case 'faq': return <FAQ />;
            case 'terms': return <Terms />;
            case 'privacy': return <Privacy />;
            case 'dataDeletion': return <DataDeletion />;
            case 'admin': return user?.role === 'Admin' ? <AdminDashboard /> : <Dashboard />;
            case 'automation': return <Automation />;
            case 'bio': return <BioPageBuilder />;
            case 'strategy': return <Strategy />;
            case 'ads': return <AdGenerator />;
            case 'mediaLibrary': return <MediaLibrary />;
            case 'onlyfansStudio': return <OnlyFansStudio />;
            default: return <Dashboard />;
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
    // Check if this is a public bio page route (e.g., /u/username or /link/username)
    // This should be checked BEFORE authentication to allow public access
    const pathname = window.location.pathname;
    const isPublicBioPage = /^\/(?:u|link)\/[^/]+$/.test(pathname);
    
    if (isPublicBioPage) {
        return <BioPageView />;
    }
    
    // Check maintenance mode FIRST - before any hooks or other logic
    const maintenanceEnabled = isMaintenanceMode();
    const allowedEmail = getAllowedEmail();
    
    // Hooks must be called unconditionally at the top level
    const { isAuthenticated, isAuthLoading, user, setUser, activePage, setActivePage, startTour, isTourActive, toast, isCRMOpen, setPricingView } = useAppContext();
    
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
    const [onboardingStep, setOnboardingStep] = useState<'selector' | 'plan-selector' | 'creator' | 'business' | 'none'>('none');
    const [selectedUserType, setSelectedUserType] = useState<UserType | null>(null);
    const [bypassMaintenance, setBypassMaintenance] = useState(false);

    // Auto-bypass maintenance for whitelisted users
    useEffect(() => {
        if (isAuthenticated && user) {
            const canBypass = canBypassMaintenance(user.email);
            if (canBypass) {
                setBypassMaintenance(true);
            }
        }
    }, [isAuthenticated, user]);

    // Sync URL with active page for direct access (e.g., /privacy, /terms)
    useEffect(() => {
        const path = window.location.pathname;
        const hash = window.location.hash.replace('#', '');
        
        // Map URL paths to pages
        const urlToPage: Record<string, Page> = {
            '/privacy': 'privacy',
            '/terms': 'terms',
            '/data-deletion': 'dataDeletion',
            '/about': 'about',
            '/contact': 'contact',
            '/pricing': 'pricing',
            '/faq': 'faq',
        };

        // Check if URL path matches a page
        if (path !== '/' && urlToPage[path]) {
            setActivePage(urlToPage[path]);
        } else if (hash && urlToPage[`/${hash}`]) {
            // Support hash-based routing too
            setActivePage(urlToPage[`/${hash}`]);
        }
    }, []); // Only run on mount

    // Update URL when page changes (for privacy policy, terms, etc.)
    useEffect(() => {
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
    }, [activePage]);

    useEffect(() => {
        if (isAuthenticated && user) {
            if (!user.userType) {
                setOnboardingStep('selector');
            } else {
                // Check if user has a valid plan for their userType
                const hasValidPlan = user.userType === 'Business' 
                    ? (user.plan === 'Starter' || user.plan === 'Growth')
                    : (user.plan === 'Free' || user.plan === 'Caption' || user.plan === 'OnlyFansStudio' || user.plan === 'Pro' || user.plan === 'Elite' || user.plan === 'Agency');
                
                // If user has completed onboarding, they're done
                if (user.hasCompletedOnboarding) {
                    setOnboardingStep('none');
                } else if (!hasValidPlan) {
                    // User has userType but invalid plan (e.g., Business with Free plan) - show plan selector
                    setSelectedUserType(user.userType);
                    setOnboardingStep('plan-selector');
                } else {
                    // User has valid plan but hasn't completed onboarding - proceed to onboarding
                    setOnboardingStep(user.userType === 'Business' ? 'business' : 'creator');
                }
            }
        }
    }, [isAuthenticated, user]);

    const handleOnboardingComplete = async () => {
        if (user) {
            await setUser({ ...user, hasCompletedOnboarding: true });
        }
        setOnboardingStep('none');
        startTour();
    };
    
    const handleUserTypeSelected = async (type: UserType) => {
        if (user) {
            await setUser({ ...user, userType: type });
        }
        
        // Check if there's a pending pricing view from plan upgrade/downgrade
        const pendingPricingView = localStorage.getItem('pendingPricingView') as 'Creator' | 'Business' | null;
        if (pendingPricingView && pendingPricingView === type) {
            // Navigate to pricing with the stored view
            localStorage.removeItem('pendingPricingView');
            setPricingView(pendingPricingView);
            setActivePage('pricing');
            setOnboardingStep('none');
            return;
        }
        
        // Always show plan selector after userType selection (for new signups)
        // This ensures users explicitly choose their plan
        setSelectedUserType(type);
        setOnboardingStep('plan-selector');
    };

    const handlePlanSelected = async (plan: Plan) => {
        // Plan is already saved in PlanSelectorModal, just proceed to onboarding
        if (selectedUserType) {
            setOnboardingStep(selectedUserType === 'Business' ? 'business' : 'creator');
        }
    };

    const handleNavigateRequest = (page: Page) => {
        if (isAuthenticated) {
            setActivePage(page);
        } else {
            setIsLoginModalOpen(true);
        }
    }

    // Auto-bypass maintenance for whitelisted users (must happen before maintenance check)
    useEffect(() => {
        if (isAuthenticated && user) {
            const userCanBypass = canBypassMaintenance(user.email);
            if (userCanBypass && !bypassMaintenance) {
                setBypassMaintenance(true);
            }
        }
    }, [isAuthenticated, user, bypassMaintenance]);

    // Calculate if user can bypass maintenance
    // If user is authenticated and whitelisted, they can bypass
    const canBypass = isAuthenticated && user && canBypassMaintenance(user.email);
    
    // Debug maintenance mode - always log to help troubleshoot
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

    // Debug logging
    if (process.env.NODE_ENV === 'development') {
        console.log('AppContent render:', { isAuthLoading, isAuthenticated, hasUser: !!user, activePage, maintenanceEnabled, bypassMaintenance, canBypass });
    }

    if (isAuthLoading) {
        return <div className="h-screen w-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900"><p className="text-gray-500 dark:text-gray-400">Loading...</p></div>;
    }

    // Show landing page/login only if maintenance is NOT enabled OR user can bypass
    if (!isAuthenticated) {
        return (
            <>
                <LandingPage onLoginClick={() => setIsLoginModalOpen(true)} onNavigateRequest={handleNavigateRequest} />
                {isLoginModalOpen && <LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} />}
            </>
        );
    }
    
    const pageTitle = pageTitles[activePage] || 'Dashboard';
    
    // Show loading state if user is not yet loaded (but authenticated)
    if (!user && isAuthenticated) {
        console.warn('User is authenticated but user object is null - waiting for user data...');
        return <div className="h-screen w-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900"><p className="text-gray-500 dark:text-gray-400">Loading user data...</p></div>;
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

    return (
        <div className="flex h-screen bg-gray-100 dark:bg-gray-900 font-sans w-full overflow-x-hidden">
            {onboardingStep === 'selector' && <OnboardingSelector onSelect={handleUserTypeSelected} />}
            {onboardingStep === 'plan-selector' && selectedUserType && (
                <PlanSelectorModal userType={selectedUserType} onSelect={handlePlanSelected} />
            )}
            {onboardingStep === 'creator' && <CreatorOnboardingModal onComplete={handleOnboardingComplete} />}
            {onboardingStep === 'business' && <BusinessOnboardingModal onComplete={handleOnboardingComplete} />}

            {isTourActive && <InteractiveTour />}
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden relative">
                <Header pageTitle={pageTitle} />
                <main className="flex-1 overflow-x-hidden overflow-y-auto p-6 custom-scrollbar dark:custom-scrollbar">
                    <MainContent />
                </main>
                {isCRMOpen && <CRMSidebar />}
            </div>
            <PaymentModal />
            {toast && <Toast message={toast.message} type={toast.type} />}
            <VoiceAssistant />
            <Chatbot />
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