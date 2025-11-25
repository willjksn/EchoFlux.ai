// App.tsx
import React, { useState, useEffect } from "react";

import { AuthProvider } from "./components/contexts/AuthContext";
import { UIProvider } from "./components/contexts/UIContext";
import { DataProvider } from "./components/contexts/DataContext";
import { useAppContext } from "./components/AppContext";

import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { Dashboard } from "./components/Dashboard";
import { Analytics } from "./components/Analytics";
import { Settings } from "./components/Settings";
import { LandingPage } from "./components/LandingPage";
import { LoginModal } from "./components/LoginModal";
import { Compose } from "./components/Compose";
import { Team } from "./components/Team";
import { Opportunities } from "./components/Opportunities";
import { Profile } from "./components/Profile";
import { About } from "./components/About";
import { Contact } from "./components/Contact";
import { Clients } from "./components/Clients";
import { FAQ } from "./components/FAQ";
import { Terms } from "./components/Terms";
import { Privacy } from "./components/Privacy";
import { AdminDashboard } from "./components/AdminDashboard";
import Automation from "./components/Automation";
import Autopilot from "./components/Autopilot";
import { Calendar } from "./components/Calendar";
import { Approvals } from "./components/Approvals";
import { OnboardingModal } from "./components/OnboardingModal";
import { InteractiveTour } from "./components/InteractiveTour";
import { PaymentModal } from "./components/PaymentModal";
import { Toast } from "./components/Toast";
import { Chatbot } from "./components/Chatbot";
import { Pricing } from "./components/Pricing";
import { CRMSidebar } from "./components/CRMSidebar";
import { BioPageBuilder } from "./components/BioPageBuilder";
import { Strategy } from "./components/Strategy";
import { VoiceAssistant } from "./components/VoiceAssistant";

import type { Page } from "./types";

// -----------------------------------------------------------------------------
// Page Titles
// -----------------------------------------------------------------------------
const pageTitles: Record<Page, string> = {
  dashboard: "Dashboard",
  analytics: "Analytics",
  settings: "Settings",
  compose: "Compose",
  calendar: "Content Calendar",
  approvals: "Approval Workflow",
  team: "Team Management",
  opportunities: "Opportunities",
  profile: "Your Profile",
  about: "About Us",
  contact: "Contact Us",
  pricing: "Pricing",
  clients: "Client Management",
  faq: "FAQs",
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  admin: "Admin Dashboard",
  automation: "Automation",
  autopilot: "AI Autopilot",
  bio: "Link in Bio Builder",
  strategy: "AI Content Strategist",
};

// -----------------------------------------------------------------------------
// MainContent Component
// -----------------------------------------------------------------------------
const MainContent: React.FC = () => {
  const { user, activePage } = useAppContext();

  switch (activePage) {
    case "dashboard":
      return <Dashboard />;
    case "analytics":
      return <Analytics />;
    case "settings":
      return <Settings />;
    case "compose":
      return <Compose />;
    case "calendar":
      return <Calendar />;
    case "approvals":
      return <Approvals />;
    case "team":
      return <Team />;
    case "opportunities":
      return <Opportunities />;
    case "profile":
      return <Profile />;
    case "about":
      return <About />;
    case "contact":
      return <Contact />;
    case "pricing":
      return <Pricing />;
    case "clients":
      return <Clients />;
    case "faq":
      return <FAQ />;
    case "terms":
      return <Terms />;
    case "privacy":
      return <Privacy />;
    case "admin":
      return user?.role === "Admin" ? <AdminDashboard /> : <Dashboard />;
    case "automation":
      return <Automation />;
    case "autopilot":
      return <Autopilot />;
    case "bio":
      return <BioPageBuilder />;
    case "strategy":
      return <Strategy />;

    default:
      return <Dashboard />;
  }
};

// -----------------------------------------------------------------------------
// AppContent Component (Main Shell)
// -----------------------------------------------------------------------------
const AppContent: React.FC = () => {
  const {
    isAuthenticated,
    isAuthLoading,
    user,
    setUser,
    activePage,
    setActivePage,
    startTour,
    isTourActive,
    toast,
    isCRMOpen,
  } = useAppContext();

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Handle onboarding
  useEffect(() => {
    if (isAuthenticated && user && !user.hasCompletedOnboarding) {
      setShowOnboarding(true);
    }
  }, [isAuthenticated, user]);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    if (user) {
      setUser({ ...user, hasCompletedOnboarding: true });
    }
    startTour();
  };

  // Navigation logic
  const handleNavigateRequest = (page: Page) => {
    if (isAuthenticated) {
      setActivePage(page);
    } else {
      setIsLoginModalOpen(true);
    }
  };

  // ---------------------------------------------------------------------------
  // If Firebase Auth is still loading...
  // ---------------------------------------------------------------------------
  if (isAuthLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Not logged in? Show marketing site + login modal if triggered
  // ---------------------------------------------------------------------------
  if (!isAuthenticated) {
    return (
      <>
        <LandingPage
          onLoginClick={() => setIsLoginModalOpen(true)}
          onNavigateRequest={handleNavigateRequest}
        />
        {isLoginModalOpen && (
          <LoginModal
            isOpen={isLoginModalOpen}
            onClose={() => setIsLoginModalOpen(false)}
          />
        )}
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Authenticated → Load full application
  // ---------------------------------------------------------------------------
  const pageTitle = pageTitles[activePage] || "Dashboard";

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900 font-sans w-full overflow-x-hidden">
      {showOnboarding && (
        <OnboardingModal onComplete={handleOnboardingComplete} />
      )}

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
};

// -----------------------------------------------------------------------------
// Root App Wrapper with Providers
// -----------------------------------------------------------------------------
const App: React.FC = () => (
  <AuthProvider>
    <UIProvider>
      <DataProvider>
        <AppContent />
      </DataProvider>
    </UIProvider>
  </AuthProvider>
);

export default App;
