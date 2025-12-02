
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
import { AdminDashboard } from './components/AdminDashboard';
import Automation from './components/Automation';
import Autopilot from './components/Autopilot';
import { Calendar } from './components/Calendar';
import { Approvals } from './components/Approvals';
/* OnboardingSelector was missing — provide a local fallback stub to avoid compile errors.
   Replace this stub with the real ./components/OnboardingSelector export when that file is added. */
const OnboardingSelector: React.FC<{ onSelect: (type: any) => void }> = ({ onSelect }) => null;

/* CreatorOnboardingModal was missing — provide a local fallback stub to avoid compile errors.
   Replace this stub with the real ./components/CreatorOnboardingModal export when that file is added. */
const CreatorOnboardingModal: React.FC<{ onComplete: () => void }> = ({ onComplete }) => null;
import { BusinessOnboardingModal } from './components/BusinessOnboardingModal';
import { InteractiveTour } from './components/InteractiveTour';
import { PaymentModal } from './components/PaymentModal';
import { Toast } from './components/Toast';
import { Chatbot } from './components/Chatbot';
import { Page, UserType } from './types';
import { Pricing } from './components/Pricing';
import { CRMSidebar } from './components/CRMSidebar';
import { BioPageBuilder } from './components/BioPageBuilder';
import { Strategy } from './components/Strategy';
import { AdGenerator } from './components/AdGenerator';
import { VoiceAssistant } from './components/VoiceAssistant';

const pageTitles: Record<Page, string> = {
    dashboard: 'Dashboard',
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
    admin: 'Admin Dashboard',
    automation: 'Automation',
    autopilot: 'AI Autopilot',
    bio: 'Link in Bio Builder',
    strategy: 'AI Content Strategist',
    ads: 'AI Ad Generator',
};

const MainContent: React.FC = () => {
    const { user, activePage } = useAppContext();

    switch (activePage) {
        case 'dashboard': return <Dashboard />;
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
        case 'admin': return user?.role === 'Admin' ? <AdminDashboard /> : <Dashboard />;
        case 'automation': return <Automation />;
        case 'autopilot': return <Autopilot />;
        case 'bio': return <BioPageBuilder />;
        case 'strategy': return <Strategy />;
        case 'ads': return <AdGenerator />;
        default: return <Dashboard />;
    }
}

const AppContent: React.FC = () => {
    const { isAuthenticated, isAuthLoading, user, setUser, activePage, setActivePage, startTour, isTourActive, toast, isCRMOpen, setPricingView } = useAppContext();
    
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
    const [onboardingStep, setOnboardingStep] = useState<'selector' | 'creator' | 'business' | 'none'>('none');

    useEffect(() => {
        if (isAuthenticated && user) {
            if (!user.userType) {
                setOnboardingStep('selector');
            } else if (!user.hasCompletedOnboarding) {
                setOnboardingStep(user.userType === 'Business' ? 'business' : 'creator');
            } else {
                setOnboardingStep('none');
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
        }
        
        setOnboardingStep(type === 'Business' ? 'business' : 'creator');
    };

    const handleNavigateRequest = (page: Page) => {
        if (isAuthenticated) {
            setActivePage(page);
        } else {
            setIsLoginModalOpen(true);
        }
    }

    if (isAuthLoading) {
        return <div className="h-screen w-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900"><p className="text-gray-500 dark:text-gray-400">Loading...</p></div>;
    }

    if (!isAuthenticated) {
        return (
            <>
                <LandingPage onLoginClick={() => setIsLoginModalOpen(true)} onNavigateRequest={handleNavigateRequest} />
                {isLoginModalOpen && <LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} />}
            </>
        );
    }
    
    const pageTitle = pageTitles[activePage] || 'Dashboard';
    
    return (
        <div className="flex h-screen bg-gray-100 dark:bg-gray-900 font-sans w-full overflow-x-hidden">
            {onboardingStep === 'selector' && <OnboardingSelector onSelect={handleUserTypeSelected} />}
            {onboardingStep === 'creator' && <CreatorOnboardingModal onComplete={handleOnboardingComplete} />}
            {onboardingStep === 'business' && <BusinessOnboardingModal onComplete={handleOnboardingComplete} />}

            {isTourActive && <InteractiveTour />}
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden relative">
                <Header pageTitle={pageTitle} />
                <main className="flex-1 overflow-x-hidden overflow-y-auto p-6">
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
    <AuthProvider>
        <UIProvider>
            <DataProvider>
                <AppContent />
            </DataProvider>
        </UIProvider>
    </AuthProvider>
  );
};

export default App;