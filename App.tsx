
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
import { CreatorOnboardingModal } from './components/CreatorOnboardingModal';
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
import { AdGenerator } from './components/AdGenerator';
import { VoiceAssistant } from './components/VoiceAssistant';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BioPageView } from './components/BioPageView';
import { lazy, Suspense } from 'react';

// Lazy load heavy components for code splitting
const Strategy = lazy(() => import('./components/Strategy').then(module => ({ default: module.Strategy })));
const OnlyFansStudio = lazy(() => import('./components/OnlyFansStudio').then(module => ({ default: module.OnlyFansStudio })));
const Autopilot = lazy(() => import('./components/Autopilot').then(module => ({ default: module.default || module.Autopilot })));

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
            case 'dashboard': return <Dashboard />;
            case 'inbox': return <Inbox />;
            case 'analytics': return (
                <ErrorBoundary>
                    <Analytics />
                </ErrorBoundary>
            );
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
            case 'strategy': return (
                <Suspense fallback={<div className="p-6 text-center text-gray-500 dark:text-gray-400">Loading Strategy...</div>}>
                    <Strategy />
                </Suspense>
            );
            case 'ads': return <AdGenerator />;
            case 'mediaLibrary': return <MediaLibrary />;
            case 'autopilot': return (
                <Suspense fallback={<div className="p-6 text-center text-gray-500 dark:text-gray-400">Loading Autopilot...</div>}>
                    <Autopilot />
                </Suspense>
            );
            case 'onlyfansStudio': return (
                <Suspense fallback={<div className="p-6 text-center text-gray-500 dark:text-gray-400">Loading OnlyFans Studio...</div>}>
                    <OnlyFansStudio />
                </Suspense>
            );
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
    // Check if this is a public bio page route (e.g., /username, /u/username, or /link/username for backward compatibility)
    // This should be checked BEFORE authentication to allow public access
    const pathname = window.location.pathname;
    
    // Exclude known app routes and API routes to avoid conflicts
    const knownRoutes = ['/', '/dashboard', '/inbox', '/analytics', '/settings', '/compose', '/calendar', '/approvals', '/team', '/opportunities', '/profile', '/about', '/contact', '/pricing', '/clients', '/faq', '/terms', '/privacy', '/dataDeletion', '/admin', '/automation', '/bio', '/strategy', '/ads', '/mediaLibrary', '/autopilot', '/onlyfansStudio'];
    
    // Check if it's a direct username path (not a known route) or legacy /u/ or /link/ path
    // Also exclude paths that start with /api or contain dots (likely static files)
    const isPublicBioPage = (
        !pathname.startsWith('/api') && 
        !pathname.includes('.') && 
        (!knownRoutes.includes(pathname) && /^\/[^/]+$/.test(pathname))
    ) || /^\/(?:u|link)\/[^/]+$/.test(pathname);
    
    if (isPublicBioPage) {
        return <BioPageView />;
    }
    
    // Check maintenance mode FIRST - before any hooks or other logic
    const maintenanceEnabled = isMaintenanceMode();
    const allowedEmail = getAllowedEmail();
    
    // Hooks must be called unconditionally at the top level
    const { isAuthenticated, isAuthLoading, user, setUser, activePage, setActivePage, startTour, isTourActive, toast, isCRMOpen, setPricingView, handleLogout, selectedPlan, setSelectedPlan, openPaymentModal } = useAppContext();
    
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
    const [loginModalInitialView, setLoginModalInitialView] = useState<'login' | 'signup'>('login');
    const [onboardingStep, setOnboardingStep] = useState<'plan-selector' | 'creator' | 'none'>('none');
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
        // Only map URL to page when not authenticated (public pages)
        if (isAuthenticated) return;

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
    }, [isAuthenticated]); // Only run when auth state changes

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
            
            // New signup flow: Show plan selector first for users who haven't completed onboarding
            // Exception: If they already have a paid plan (Pro/Elite), they've already selected,
            // so proceed directly to onboarding
            const hasPaidPlan = user.plan === 'Pro' || user.plan === 'Elite' || user.plan === 'Agency';
            
            // If user has a pre-selected plan from landing page, handle it
            if (selectedPlan) {
                if (selectedPlan === 'Free') {
                    // Free plan - set it and proceed to onboarding
                    setUser({ ...user, plan: 'Free' });
                    setSelectedPlan(null); // Clear selected plan
                    setOnboardingStep('creator');
                } else if (selectedPlan === 'Pro' || selectedPlan === 'Elite') {
                    // Paid plan - open payment modal instead of plan selector
                    const planData = selectedPlan === 'Pro' 
                        ? { name: 'Pro', price: 29, cycle: 'monthly' as const }
                        : { name: 'Elite', price: 59, cycle: 'monthly' as const };
                    openPaymentModal(planData);
                    setSelectedPlan(null); // Clear selected plan
                    // Don't set onboarding step yet - wait for payment to complete
                    return;
                }
            } else if (hasPaidPlan) {
                // User already selected a paid plan, proceed to onboarding
                setOnboardingStep('creator');
            } else {
                // User has Free plan (auto-assigned) or no plan - show plan selector so they can choose
                setOnboardingStep('plan-selector');
            }
        } else if (!isAuthenticated) {
            // Not authenticated and no pending signup - clear onboarding
            setOnboardingStep('none');
        }
    }, [isAuthenticated, user, setUser, selectedPlan, openPaymentModal]);

    const handleOnboardingComplete = async () => {
        if (user) {
            await setUser({ ...user, hasCompletedOnboarding: true });
        }
        setOnboardingStep('none');
        startTour();
    };
    
    // Removed handleUserTypeSelected - all users are Creators now

    const handlePlanSelected = async (plan: Plan) => {
        // Plan is already saved in PlanSelectorModal
        // Ensure userType is set to Creator (all users are Creators)
        if (user && user.userType !== 'Creator') {
            await setUser({ ...user, userType: 'Creator' });
        }
        // Proceed to plan-specific onboarding
        setOnboardingStep('creator');
    };

    const handlePlanCancel = async () => {
        // Cancel signup process: sign out user and close modal
        // This will take them back to the landing page (user becomes null, so landing page shows)
        await handleLogout();
        setOnboardingStep('none');
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

    // Check for pending signup - if exists, show plan selector instead of landing page
    const pendingSignup = typeof window !== 'undefined' ? localStorage.getItem('pendingSignup') : null;
    
    // Show landing page/login only if maintenance is NOT enabled OR user can bypass
    if (!isAuthenticated) {
        // If there's a pending signup, show plan selector modal
        if (pendingSignup && onboardingStep === 'plan-selector') {
            return (
                <>
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
        
        return (
            <>
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
            {onboardingStep === 'plan-selector' && (
                <PlanSelectorModal userType="Creator" onSelect={handlePlanSelected} onCancel={handlePlanCancel} />
            )}
            {onboardingStep === 'creator' && <CreatorOnboardingModal onComplete={handleOnboardingComplete} />}

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
            {user?.plan !== 'Free' && <VoiceAssistant />}
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