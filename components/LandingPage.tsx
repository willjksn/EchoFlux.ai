import React from "react";
import {
  LogoIcon,
  SparklesIcon,
  TeamIcon,
  AutomationIcon,
  ChatIcon,
  AnalyticsIcon,
  CalendarIcon,
  ListeningIcon,
  RefreshIcon,
  GlobeIcon,
  UserIcon,
  TargetIcon,
  DashboardIcon,
  FilmIcon,
  MicrophoneWaveIcon,
  RocketIcon
} from "./icons/UIIcons";

import { InstagramIcon, TikTokIcon, XIcon, FacebookIcon } from "./icons/PlatformIcons";

import { Pricing } from "./Pricing";
import { Page } from "../types";

interface LandingPageProps {
  onLoginClick: () => void;
  onNavigateRequest: (page: Page) => void;
}

const Feature: React.FC<{
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}> = ({ icon, title, children }) => (
  <div className="flex">
    <div className="flex-shrink-0">
      <div className="flex items-center justify-center h-12 w-12 rounded-md bg-primary-500 text-white">
        {icon}
      </div>
    </div>
    <div className="ml-4">
      <h3 className="text-lg font-medium text-gray-900 dark:text-white">{title}</h3>
      <p className="mt-2 text-base text-gray-600 dark:text-gray-400">{children}</p>
    </div>
  </div>
);

export const LandingPage: React.FC<LandingPageProps> = ({
  onLoginClick,
  onNavigateRequest
}) => {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="bg-white dark:bg-gray-900">
      {/* HEADER */}
      <header className="bg-white dark:bg-gray-900 shadow-sm sticky top-0 z-40">
        <nav className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            {/* Logo */}
            <button
              onClick={() => scrollTo("top")}
              className="flex items-center text-primary-600 dark:text-primary-400"
            >
              <LogoIcon />
              <span className="ml-2 text-xl font-bold">EngageSuite.ai</span>
            </button>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center space-x-8">
              <button
                onClick={() => scrollTo("features")}
                className="text-base font-medium text-gray-500 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
              >
                Features
              </button>

              <button
                onClick={() => scrollTo("pricing")}
                className="text-base font-medium text-gray-500 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
              >
                Pricing
              </button>

              <button
                onClick={onLoginClick}
                className="text-base font-medium text-gray-500 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
              >
                Sign in
              </button>

              <button
                onClick={onLoginClick}
                className="px-4 py-2 rounded-md bg-primary-600 text-white shadow hover:bg-primary-700"
              >
                Get Started
              </button>
            </div>

            {/* Mobile */}
            <div className="md:hidden">
              <button
                onClick={onLoginClick}
                className="px-4 py-2 bg-primary-600 text-white rounded-md shadow hover:bg-primary-700"
              >
                Menu
              </button>
            </div>
          </div>
        </nav>
      </header>

      {/* HERO SECTION */}
      <main id="top">
        <div className="relative">
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gray-100 dark:bg-gray-800" />
          <div className="max-w-7xl mx-auto sm:px-6 lg:px-8">
            <div className="relative shadow-xl sm:rounded-2xl overflow-hidden">
              {/* Background */}
              <div className="absolute inset-0">
                <img
                  className="h-full w-full object-cover"
                  src="https://images.unsplash.com/photo-1531297484001-80022131f5a1?q=80&w=2920&auto=format&fit=crop"
                  alt="AI Connectivity Background"
                />
                <div className="absolute inset-0 bg-gray-900/60" />
              </div>

              {/* Content */}
              <div className="relative px-4 py-20 sm:px-6 sm:py-28 lg:py-32 lg:px-8">
                <h1 className="text-center text-4xl font-extrabold text-white sm:text-5xl lg:text-6xl">
                  <span className="block">The First AI</span>
                  <span className="block text-primary-200">Social Operating System</span>
                </h1>

                <p className="mt-6 text-center text-xl text-primary-100 max-w-3xl mx-auto">
                  Strategize, Create, Manage, and Convert your audience from one intelligent dashboard.
                </p>

                <div className="mt-10 flex justify-center">
                  <button
                    onClick={onLoginClick}
                    className="px-8 py-3 bg-white text-primary-700 rounded-md shadow hover:bg-primary-50"
                  >
                    Get started for free
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FEATURES */}
        <section id="features" className="py-24 bg-gray-100 dark:bg-gray-800">
          <div className="max-w-7xl mx-auto px-4 lg:px-8">
            <div className="text-center">
              <h2 className="text-primary-600 font-semibold uppercase">Features</h2>
              <p className="mt-2 text-4xl font-extrabold text-gray-900 dark:text-white">
                Your New Command Center
              </p>
              <p className="mt-4 text-xl text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
                Replace your fragmented stack of apps. EngageSuite.ai unifies everything into one workflow.
              </p>
            </div>

            <div className="mt-12 grid gap-10 md:grid-cols-2 lg:grid-cols-3">
              <Feature icon={<RocketIcon />} title="AI Autopilot">
                Auto-generate full strategies and content workflows ready for approval.
              </Feature>

              <Feature icon={<MicrophoneWaveIcon />} title="AI Voice Assistant">
                Plan, ideate, and create content hands-free with real-time voice interaction.
              </Feature>

              <Feature icon={<FilmIcon />} title="AI Director">
                Generate multi-scene videos with storyboard-guided creative direction.
              </Feature>

              <Feature icon={<TargetIcon />} title="AI Content Strategist">
                Turn your goals into multi-week content plans synced with your calendar.
              </Feature>

              <Feature icon={<GlobeIcon />} title="Smart Link-in-Bio">
                Build high-converting bio pages with email capture baked in.
              </Feature>

              <Feature icon={<UserIcon />} title="Social CRM">
                Convert followers into leads with tagging, notes, and relationship tracking.
              </Feature>

              <Feature icon={<SparklesIcon />} title="Generative Studio">
                Create images, videos, captions, and voiceovers in seconds.
              </Feature>

              <Feature icon={<CalendarIcon />} title="Visual Calendar">
                Plan content with a drag-and-drop monthly or weekly view.
              </Feature>

              <Feature icon={<ListeningIcon />} title="Social Listening">
                Monitor brand mentions and conversations across multiple platforms.
              </Feature>

              <Feature icon={<RefreshIcon />} title="Content Remixing">
                Repurpose content for any platform with a single click.
              </Feature>

              <Feature icon={<ChatIcon />} title="AI Inbox">
                Manage all comments & DMs in one feed. AI drafts replies instantly.
              </Feature>

              <Feature icon={<AutomationIcon />} title="Workflow Automation">
                Schedule recurring content creation + posting workflows.
              </Feature>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="py-24 bg-white dark:bg-gray-900">
          <div className="max-w-7xl mx-auto px-4 lg:px-8">
            <h2 className="text-center text-4xl font-extrabold text-gray-900 dark:text-white">
              Go Live in 3 Simple Steps
            </h2>

            <div className="mt-16 grid lg:grid-cols-3 gap-14">
              <div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">1. Connect Accounts</h3>
                <p className="mt-3 text-lg text-gray-500 dark:text-gray-400">
                  Securely link your platforms. No passwords stored.
                </p>
              </div>

              <div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">2. Train Your AI</h3>
                <p className="mt-3 text-lg text-gray-500 dark:text-gray-400">
                  Upload writing samples, avatar images, and a voice clip.
                </p>
              </div>

              <div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">3. Automate & Convert</h3>
                <p className="mt-3 text-lg text-gray-500 dark:text-gray-400">
                  Launch your bio page and schedule automations.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing">
          <Pricing onGetStartedClick={onLoginClick} onNavigateRequest={onNavigateRequest} />
        </section>
      </main>

      {/* FOOTER */}
      <footer className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 mt-20">
        <div className="max-w-7xl mx-auto py-12 px-4 lg:px-8">
          <div className="xl:grid xl:grid-cols-3 gap-8">
            {/* Logo / Description */}
            <div className="space-y-8">
              <button
                onClick={() => scrollTo("top")}
                className="flex items-center text-primary-600 dark:text-primary-400"
              >
                <LogoIcon />
                <span className="ml-2 text-xl font-bold">EngageSuite.ai</span>
              </button>

              <p className="text-gray-500 dark:text-gray-400">The All-in-One AI Social Suite.</p>

              <div className="flex space-x-6">
                <XIcon className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300" />
                <InstagramIcon className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300" />
                <TikTokIcon className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300" />
                <FacebookIcon className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300" />
              </div>
            </div>

            {/* Links */}
            <div className="grid grid-cols-2 gap-8 xl:col-span-2 mt-12 xl:mt-0">
              <div>
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase">
                  Products
                </h3>
                <ul className="mt-4 space-y-4">
                  <li>
                    <button
                      onClick={() => onNavigateRequest("dashboard")}
                      className="text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                    >
                      Command Center
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => onNavigateRequest("compose")}
                      className="text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                    >
                      Content Studio
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => onNavigateRequest("bio")}
                      className="text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                    >
                      Link in Bio
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => onNavigateRequest("analytics")}
                      className="text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                    >
                      Analytics
                    </button>
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase">
                  Company
                </h3>
                <ul className="mt-4 space-y-4">
                  <li>
                    <button
                      onClick={() => onNavigateRequest("about")}
                      className="text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                    >
                      About Us
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => onNavigateRequest("contact")}
                      className="text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                    >
                      Contact Us
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => onNavigateRequest("terms")}
                      className="text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                    >
                      Terms
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => onNavigateRequest("privacy")}
                      className="text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                    >
                      Privacy
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Bottom */}
          <div className="mt-12 border-t border-gray-200 dark:border-gray-700 pt-8 flex justify-between text-gray-400">
            <p>© 2025 EngageSuite.ai. All rights reserved.</p>
            <div className="flex space-x-6">
              <button
                onClick={() => onNavigateRequest("terms")}
                className="hover:text-gray-500 dark:hover:text-gray-200"
              >
                Terms
              </button>
              <button
                onClick={() => onNavigateRequest("privacy")}
                className="hover:text-gray-500 dark:hover:text-gray-200"
              >
                Privacy
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

