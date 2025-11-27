import React from 'react';
import { LogoIcon, SparklesIcon, TeamIcon, AutomationIcon, ChatIcon, AnalyticsIcon, CalendarIcon, ListeningIcon, RefreshIcon, GlobeIcon, UserIcon, TargetIcon, DashboardIcon, FilmIcon, MicrophoneWaveIcon, RocketIcon, BriefcaseIcon } from './icons/UIIcons';
import { InstagramIcon, TikTokIcon, XIcon, FacebookIcon } from './icons/PlatformIcons';
import { Pricing } from './Pricing';
import { Page } from '../types';

interface LandingPageProps {
  onLoginClick: () => void;
  onNavigateRequest: (page: Page) => void;
}

const Feature: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="flex">
    <div className="flex-shrink-0">
      <div className="flex items-center justify-center h-12 w-12 rounded-md bg-primary-500 text-white">
        {icon}
      </div>
    </div>
    <div className="ml-4">
      <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">{title}</h3>
      <p className="mt-2 text-base text-gray-500 dark:text-gray-400">{children}</p>
    </div>
  </div>
);


export const LandingPage: React.FC<LandingPageProps> = ({ onLoginClick, onNavigateRequest }) => {
  const handleScroll = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900">
      {/* Header */}
      <header className="relative bg-white dark:bg-gray-900 shadow-sm">
        <nav className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex justify-start lg:w-0 lg:flex-1">
               <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center text-primary-600 dark:text-primary-400">
                  <LogoIcon />
                  <span className="ml-2 text-xl font-bold">EngageSuite.ai</span>
               </button>
            </div>
            <div className="hidden md:flex items-center justify-end md:flex-1 lg:w-0 space-x-8">
                <button onClick={() => handleScroll('features')} className="text-base font-medium text-gray-500 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">Features</button>
                <button onClick={() => handleScroll('pricing')} className="text-base font-medium text-gray-500 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">Pricing</button>
                <button onClick={onLoginClick} className="whitespace-nowrap text-base font-medium text-gray-500 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">Sign in</button>
                <button onClick={onLoginClick} className="whitespace-nowrap inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-primary-600 hover:bg-primary-700">Get Started</button>
            </div>
             <div className="md:hidden">
                <button onClick={onLoginClick} className="whitespace-nowrap inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-primary-600 hover:bg-primary-700">Menu</button>
            </div>
          </div>
        </nav>
      </header>
      
      {/* Hero Section */}
      <main>
        <div className="relative">
             <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gray-100 dark:bg-gray-800" />
             <div className="max-w-7xl mx-auto sm:px-6 lg:px-8">
                <div className="relative shadow-xl sm:rounded-2xl sm:overflow-hidden">
                    <div className="absolute inset-0">
                        <img className="h-full w-full object-cover" src="https://images.unsplash.com/photo-1531297484001-80022131f5a1?q=80&w=2920&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" alt="Abstract visualization of a hand interacting with a glowing digital network" />
                        <div className="absolute inset-0 bg-gray-900/60" />
                    </div>
                    <div className="relative px-4 py-16 sm:px-6 sm:py-24 lg:py-32 lg:px-8">
                        <h1 className="text-center text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
                            <span className="block text-white">The First AI</span>
                            <span className="block text-primary-200">Social & Marketing Operating System</span>
                        </h1>
                        <p className="mt-6 max-w-lg mx-auto text-center text-xl text-primary-100 sm:max-w-3xl">
                           More than just tools. A complete Command Center to Strategize, Create, Manage, and Convert your audience from one intelligent dashboard.
                        </p>
                        <div className="mt-10 max-w-sm mx-auto sm:max-w-none sm:flex sm:justify-center">
                            <button onClick={onLoginClick} className="flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-primary-700 bg-white hover:bg-primary-50 sm:px-8">Get started for free</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Who We Serve Section */}
        <div className="bg-gray-100 dark:bg-gray-800 py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-12">
                    <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white">One Platform, Two Powerful Modes</h2>
                    <p className="mt-4 text-xl text-gray-500 dark:text-gray-400">Tailored experiences for your specific goals.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-white dark:bg-gray-900 p-8 rounded-2xl shadow-lg border-t-4 border-purple-500 hover:-translate-y-1 transition-transform">
                        <div className="flex items-center justify-center w-16 h-16 bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 rounded-full mb-6 mx-auto">
                            <UserIcon className="w-8 h-8" />
                        </div>
                        <h3 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-4">For Creators</h3>
                        <p className="text-gray-600 dark:text-gray-300 text-center mb-6">
                            Build your personal brand, grow your audience, and monetize your passion.
                        </p>
                        <ul className="space-y-3 text-sm text-gray-500 dark:text-gray-400">
                            <li className="flex items-center"><SparklesIcon className="w-4 h-4 mr-2 text-purple-500" /> AI Content Assistant</li>
                            <li className="flex items-center"><SparklesIcon className="w-4 h-4 mr-2 text-purple-500" /> Growth & Engagement Analytics</li>
                            <li className="flex items-center"><SparklesIcon className="w-4 h-4 mr-2 text-purple-500" /> Brand Partnership Finder</li>
                        </ul>
                    </div>
                    <div className="bg-white dark:bg-gray-900 p-8 rounded-2xl shadow-lg border-t-4 border-blue-500 hover:-translate-y-1 transition-transform">
                        <div className="flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-full mb-6 mx-auto">
                            <BriefcaseIcon className="w-8 h-8" />
                        </div>
                        <h3 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-4">For Businesses</h3>
                        <p className="text-gray-600 dark:text-gray-300 text-center mb-6">
                            Automate marketing, generate leads, and drive sales with a virtual AI marketing team.
                        </p>
                        <ul className="space-y-3 text-sm text-gray-500 dark:text-gray-400">
                            <li className="flex items-center"><SparklesIcon className="w-4 h-4 mr-2 text-blue-500" /> AI Marketing Manager & Playbooks</li>
                            <li className="flex items-center"><SparklesIcon className="w-4 h-4 mr-2 text-blue-500" /> ROI & Conversion Tracking</li>
                            <li className="flex items-center"><SparklesIcon className="w-4 h-4 mr-2 text-blue-500" /> Social CRM & Lead Capture</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>

        {/* Features Section */}
        <div id="features" className="bg-white dark:bg-gray-900 py-24">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="lg:text-center">
                    <h2 className="text-base text-primary-600 font-semibold tracking-wide uppercase">Features</h2>
                    <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-4xl">Your New Command Center</p>
                    <p className="mt-4 max-w-2xl text-xl text-gray-500 dark:text-gray-400 lg:mx-auto">
                        Replace your fragmented stack of apps. EngageSuite.ai unifies Strategy, Content, and CRM into one powerful workflow.
                    </p>
                </div>
                <div className="mt-12">
                    <dl className="space-y-10 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-x-8 md:gap-y-10">
                        <Feature icon={<RocketIcon />} title="AI Autopilot">
                           Define a goal, and Autopilot will generate a full content strategy, create all posts, and queue them for your final approval.
                        </Feature>
                        <Feature icon={<MicrophoneWaveIcon />} title="AI Voice Assistant">
                           Plan, guide, and run your social media hands-free. Talk to your AI strategist in real-time to discover trends and draft content instantly.
                        </Feature>
                        <Feature icon={<FilmIcon />} title="AI Director Mode">
                           Direct multi-scene short films. Our AI creates storyboards and generates sequential clips, maintaining character consistency with your Avatar.
                        </Feature>
                         <Feature icon={<TargetIcon />} title="AI Content Strategist">
                           Generate multi-week content roadmaps tailored to your niche and goals, then sync them to your calendar instantly.
                        </Feature>
                        <Feature icon={<GlobeIcon />} title="Smart Link-in-Bio">
                           Build a beautiful bio page that captures emails and syncs with your latest content automatically.
                        </Feature>
                        <Feature icon={<UserIcon />} title="Social CRM">
                           Turn followers into leads. Tag users, add notes, and track relationship history directly from your inbox.
                        </Feature>
                        <Feature icon={<SparklesIcon />} title="Generative Content Studio">
                           Generate images, stunning videos (Veo), and captions in seconds. Clone your voice for audio.
                        </Feature>
                        <Feature icon={<CalendarIcon />} title="Visual Content Calendar">
                           Visualize your strategy. Drag-and-drop drafts and see scheduled automations in a monthly view.
                        </Feature>
                        <Feature icon={<ListeningIcon />} title="Social Listening">
                           Track mentions of your brand or competitors across the web. Never miss a conversation.
                        </Feature>
                         <Feature icon={<RefreshIcon />} title="Content Remixing">
                           Turn a TikTok script into a LinkedIn post with one click. Repurpose content instantly.
                        </Feature>
                        <Feature icon={<ChatIcon />} title="AI-Powered Inbox">
                           Manage every DM and comment in one smart feed. Our AI drafts replies in your unique voice.
                        </Feature>
                        <Feature icon={<AutomationIcon />} title="Automated Workflows">
                           Set it and forget it. Schedule recurring content generation and posting.
                        </Feature>
                    </dl>
                </div>
            </div>
        </div>

         {/* How It Works Section */}
        <div className="py-24 bg-gray-50 dark:bg-gray-800 overflow-hidden">
            <div className="relative max-w-xl mx-auto px-4 sm:px-6 lg:px-8 lg:max-w-7xl">
                 <div className="lg:text-center">
                     <h2 className="text-3xl leading-8 font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-4xl">Go Live in 3 Simple Steps</h2>
                </div>
                <div className="relative mt-12 lg:mt-24 lg:grid lg:grid-cols-3 lg:gap-8 lg:items-center">
                    <div className="relative">
                        <h3 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight sm:text-3xl">1. Connect Accounts</h3>
                        <p className="mt-3 text-lg text-gray-500 dark:text-gray-400">Securely link your social media profiles in seconds. It's fast, safe, and we never store your passwords.</p>
                    </div>

                    <div className="mt-10 -mx-4 relative lg:mt-0" aria-hidden="true">
                        <svg className="absolute left-1/2 -translate-x-1/2 translate-y-16 lg:hidden" width="784" height="404" fill="none" viewBox="0 0 784 404"><path d="M404 392c-204.64 0-392-167.36-392-392" stroke="url(#ca9a2958-9e73-4171-8914-a3f5a5763919)" stroke-width="2" stroke-linecap="round"/></svg>
                        <div className="text-5xl text-primary-500 mx-auto text-center font-extrabold">&rarr;</div>
                    </div>

                    <div className="relative">
                        <h3 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight sm:text-3xl">2. Train Your AI</h3>
                        <p className="mt-3 text-lg text-gray-500 dark:text-gray-400">Upload documents to match your writing style, an image for your AI Avatar, and a voice sample for custom voice-overs.</p>
                    </div>

                     <div className="mt-10 -mx-4 relative lg:mt-0" aria-hidden="true">
                        <svg className="absolute left-1/2 -translate-x-1/2 translate-y-16 lg:hidden" width="784" height="404" fill="none" viewBox="0 0 784 404"><path d="M404 392c-204.64 0-392-167.36-392-392" stroke="url(#ca9a2958-9e73-4171-8914-a3f5a5763919)" stroke-width="2" stroke-linecap="round"/></svg>
                        <div className="text-5xl text-primary-500 mx-auto text-center font-extrabold">&rarr;</div>
                    </div>

                    <div className="relative">
                        <h3 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight sm:text-3xl">3. Automate & Convert</h3>
                        <p className="mt-3 text-lg text-gray-500 dark:text-gray-400">Launch your Link-in-Bio page, schedule your workflows, and watch your engagement and email list grow automatically.</p>
                    </div>
                </div>
            </div>
        </div>

        {/* Pricing Section */}
        <Pricing onGetStartedClick={onLoginClick} onNavigateRequest={onNavigateRequest} />

      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-gray-900" aria-labelledby="footer-heading">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:py-16 lg:px-8">
            <div className="xl:grid xl:grid-cols-3 xl:gap-8">
                <div className="space-y-8 xl:col-span-1">
                     <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center text-primary-600 dark:text-primary-400">
                        <LogoIcon />
                        <span className="ml-2 text-xl font-bold">EngageSuite.ai</span>
                     </button>
                    <p className="text-gray-500 dark:text-gray-400 text-base">The First AI Social & Marketing Operating System.</p>
                    <div className="flex space-x-6">
                        <button className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"><span className="sr-only">X</span><XIcon /></button>
                        <button className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"><span className="sr-only">Instagram</span><InstagramIcon /></button>
                        <button className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"><span className="sr-only">TikTok</span><TikTokIcon /></button>
                        <button className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"><span className="sr-only">Facebook</span><FacebookIcon /></button>
                    </div>
                </div>
                <div className="mt-12 grid grid-cols-2 gap-8 xl:mt-0 xl:col-span-2">
                    <div className="md:grid md:grid-cols-2 md:gap-8">
                        <div>
                            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 tracking-wider uppercase">Products</h3>
                            <ul className="mt-4 space-y-4">
                                <li><button onClick={() => onNavigateRequest('dashboard')} className="text-base text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-left">Command Center</button></li>
                                <li><button onClick={() => onNavigateRequest('compose')} className="text-base text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-left">Content Studio</button></li>
                                <li><button onClick={() => onNavigateRequest('bio')} className="text-base text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-left">Link in Bio</button></li>
                                <li><button onClick={() => onNavigateRequest('analytics')} className="text-base text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-left">Analytics</button></li>
                            </ul>
                        </div>
                        <div className="mt-12 md:mt-0">
                             <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 tracking-wider uppercase">Company</h3>
                            <ul className="mt-4 space-y-4">
                                <li><button onClick={() => onNavigateRequest('about')} className="text-base text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-left">About Us</button></li>
                                <li><button onClick={() => onNavigateRequest('contact')} className="text-base text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-left">Contact Us</button></li>
                                <li><a href="#" onClick={(e) => { e.preventDefault(); onNavigateRequest('terms'); }} className="text-base text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Terms</a></li>
                                <li><a href="#" onClick={(e) => { e.preventDefault(); onNavigateRequest('privacy'); }} className="text-base text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Privacy</a></li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
            <div className="mt-12 border-t border-gray-200 dark:border-gray-700 pt-8 md:flex md:items-center md:justify-between">
                <p className="text-base text-gray-400 md:order-1">&copy; 2025 EngageSuite.ai. All rights reserved.</p>
                <div className="mt-8 md:mt-0 md:order-2 flex space-x-6">
                    <a href="#" onClick={(e) => { e.preventDefault(); onNavigateRequest('terms'); }} className="text-base text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">Terms</a>
                    <a href="#" onClick={(e) => { e.preventDefault(); onNavigateRequest('privacy'); }} className="text-base text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">Privacy</a>
                </div>
            </div>
        </div>
      </footer>
    </div>
  );
};
