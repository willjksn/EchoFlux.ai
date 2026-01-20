import React, { useState } from 'react';
import { LogoIcon, SparklesIcon, AutomationIcon, ChatIcon, AnalyticsIcon, CalendarIcon, RefreshIcon, GlobeIcon, UserIcon, TargetIcon, DashboardIcon, FilmIcon, MicrophoneWaveIcon, RocketIcon, TrendingIcon, ImageIcon, KanbanIcon } from './icons/UIIcons';
import { InstagramIcon, TikTokIcon, XIcon, FacebookIcon, YouTubeIcon } from './icons/PlatformIcons';
import { Pricing } from './Pricing';
import { ReviewsSection } from './ReviewsSection';
import { Page } from '../types';
import { WaitlistInlineForm } from './WaitlistInlineForm';
import { isInviteOnlyMode } from '../src/utils/inviteOnly';
import { About } from './About';
import { Terms } from './Terms';
import { Privacy } from './Privacy';

interface LandingPageProps {
  onLoginClick: () => void;
  onGetStartedClick?: () => void;
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


export const LandingPage: React.FC<LandingPageProps> = ({ onLoginClick, onGetStartedClick, onNavigateRequest }) => {
  const [legalModal, setLegalModal] = useState<'about' | 'terms' | 'privacy' | 'contact' | null>(null);
  const inviteOnlyMode = isInviteOnlyMode();
  const legalTitle =
    legalModal === 'about'
      ? 'About EchoFlux.ai'
      : legalModal === 'terms'
        ? 'Terms of Service'
        : legalModal === 'privacy'
          ? 'Privacy Policy'
          : legalModal === 'contact'
            ? 'Contact'
            : '';

  const handleGetStarted = onGetStartedClick || onLoginClick;
  const handleScroll = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 overflow-x-hidden">
      {/* Header */}
      <header className="relative bg-white dark:bg-gray-900 shadow-sm">
        <nav className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex justify-start lg:w-0 lg:flex-1">
               <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center">
                  <LogoIcon />
                        <span className="ml-2 text-xl font-bold" style={{ color: '#2563eb' }}>EchoFlux.ai</span>
               </button>
            </div>
            <div className="hidden md:flex items-center justify-end md:flex-1 lg:w-0 space-x-8">
                <button onClick={() => handleScroll('features')} className="text-base font-medium text-gray-500 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">Features</button>
                <button onClick={() => onNavigateRequest('freeResources')} className="text-base font-medium text-gray-500 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">Free Resources</button>
                <button onClick={() => handleScroll('pricing')} className="text-base font-medium text-gray-500 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">Pricing</button>
                <button onClick={onLoginClick} className="whitespace-nowrap text-base font-medium text-gray-500 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">Sign in</button>
                <button onClick={handleGetStarted} className="whitespace-nowrap inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-primary-600 hover:bg-primary-700">Get Started</button>
            </div>
             <div className="md:hidden">
                <button onClick={onLoginClick} className="whitespace-nowrap inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-primary-600 hover:bg-primary-700">Menu</button>
            </div>
          </div>
        </nav>
      </header>
      
      {/* Hero Section */}
      <main className="overflow-x-hidden">
        <div className="relative overflow-hidden rounded-3xl">
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gray-50 dark:bg-gray-800 rounded-b-3xl" />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-white/10 mb-12 sm:mb-14 lg:mb-16">
              {/* Background image + gradient overlay */}
              <div className="absolute inset-0 overflow-hidden">
                <img
                  className="h-full w-full object-cover opacity-15 dark:opacity-55 transition-opacity"
                  src="https://images.unsplash.com/photo-1531297484001-80022131f5a1?q=80&w=2920&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
                  alt="Abstract visualization of a hand interacting with a glowing digital network"
                />
                <div className="absolute inset-0 bg-white/96 dark:bg-gradient-to-br dark:from-primary-600/80 dark:via-gray-900/90 dark:to-gray-900" />
              </div>

              <div className="relative px-6 py-12 sm:px-10 sm:py-16 lg:px-16 lg:py-18 overflow-hidden">
                <div className="grid gap-12 lg:grid-cols-2 lg:items-center max-w-full">
                  {/* Left: Copy + CTAs */}
                  <div className="min-w-0 max-w-full overflow-hidden">
                    <div className="inline-flex items-center rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700 ring-1 ring-inset ring-primary-200 backdrop-blur dark:bg-white/10 dark:text-primary-100 dark:ring-white/20">
                      <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                      Planning Studio for revenue-focused creators
                    </div>

                    <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-5xl lg:text-6xl max-w-full break-words">
                      <span className="block">The creators who plan consistently</span>
                      <span className="block text-primary-700 dark:text-primary-200">
                        earn 3x more.
                      </span>
                    </h1>

                    <p className="mt-6 max-w-xl text-lg text-gray-700 dark:text-primary-100 sm:text-xl max-w-full break-words">
                      Turn content ideas into recurring revenue. Plan exclusive content, engage subscribers, and maximize your revenue—all in one powerful studio. Scale from content calendar to consistent income (manual posting, account-safe).
                    </p>

                    <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                      <button
                        onClick={handleGetStarted}
                        className="inline-flex items-center justify-center rounded-md bg-white px-8 py-3 text-base font-semibold text-primary-700 shadow-sm transition hover:bg-primary-50"
                      >
                        Get started for free
                      </button>
                      <button
                        onClick={() => handleScroll('features')}
                        className="inline-flex items-center justify-center rounded-md border border-primary-200 bg-white px-8 py-3 text-base font-medium text-primary-700 shadow-sm transition hover:bg-primary-50 dark:border-white/30 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                      >
                        Explore features
                      </button>
                    </div>

                    <div className="mt-4 text-sm text-gray-700 dark:text-primary-100/90">
                      Want the 7-day trial? Choose Pro or Elite below.
                    </div>

                    {inviteOnlyMode ? (
                      <>
                        <div className="mt-6 text-sm text-gray-700 dark:text-primary-100/90">
                          Invite-only right now. Join the waitlist and we'll email you if you're selected.
                        </div>
                        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 text-gray-900 shadow-sm
                          [&_*]:text-gray-900
                          [&_input]:bg-white [&_input]:border [&_input]:border-gray-300 [&_input]:text-gray-900 [&_input]:placeholder:text-gray-500 [&_input]:rounded-md [&_input]:px-3 [&_input]:py-2 [&_input]:focus:outline-none [&_input]:focus:ring-2 [&_input]:focus:ring-primary-500
                          [&_button]:bg-primary-600 [&_button]:text-white [&_button]:hover:bg-primary-700 [&_button]:rounded-md [&_button]:px-4 [&_button]:py-2
                          dark:border-white/20 dark:bg-white/5 dark:text-white dark:[&_*]:text-white
                          dark:[&_input]:bg-white/10 dark:[&_input]:border-white/30 dark:[&_input]:text-white dark:[&_input]:placeholder:text-gray-300 dark:[&_input]:focus:ring-primary-400
                          dark:[&_button]:bg-white/10 dark:[&_button]:text-white dark:[&_button]:hover:bg-white/20">
                          <WaitlistInlineForm />
                        </div>
                      </>
                    ) : (
                      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 text-gray-900 shadow-sm dark:border-white/20 dark:bg-white/5 dark:text-white">
                        <div className="text-base font-semibold">Try EchoFlux.ai out</div>
                        <div className="mt-2 text-sm text-gray-700 dark:text-primary-100/90">
                          Sign up to start planning content. If you have an invite code, enter it on the signup screen.
                        </div>
                      </div>
                    )}

                    <div className="mt-6 flex flex-col gap-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                        <div className="flex items-center">
                          <span className="mr-2 text-lg whitespace-nowrap text-gray-800 dark:text-white">★ ★ ★ ★ ★</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-gray-700 dark:text-primary-100/90 min-w-0">
                          <span className="inline-flex items-center rounded-full bg-primary-50 border border-primary-200 px-3 py-1.5 whitespace-nowrap font-medium text-primary-700 shadow-sm dark:bg-white/20 dark:border-white/30 dark:text-white dark:shadow-lg flex-shrink-0">
                            Start free (no card)
                          </span>
                          <span className="inline-flex items-center rounded-full bg-primary-50 border border-primary-200 px-3 py-1.5 whitespace-nowrap font-medium text-primary-700 shadow-sm dark:bg-white/20 dark:border-white/30 dark:text-white dark:shadow-lg flex-shrink-0">
                            7-day trial on Pro/Elite
                          </span>
                          <span className="inline-flex items-center rounded-full bg-primary-50 border border-primary-200 px-3 py-1.5 whitespace-nowrap font-medium text-primary-700 shadow-sm dark:bg-white/20 dark:border-white/30 dark:text-white dark:shadow-lg flex-shrink-0">
                            Cancel anytime
                          </span>
                        </div>
                      </div>
                      <div className="text-sm text-gray-700 dark:text-primary-100">
                        <span>Trusted by creators scaling their revenue and subscriber base</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Product preview card */}
                  <div className="relative min-w-0 max-w-full overflow-hidden">
                    <div className="pointer-events-none absolute inset-0 rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-primary-500/10 to-transparent blur-3xl" />
                    <div className="relative rounded-2xl overflow-hidden bg-white dark:bg-gray-900 p-4 shadow-xl ring-1 ring-gray-200 dark:ring-white/15">
                      <div className="flex items-center justify-between border-b border-gray-200 dark:border-white/10 px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                        <span className="inline-flex items-center gap-2">
                          <span className="flex h-2 w-2 items-center justify-center">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                          </span>
                          Planning Studio
                        </span>
                        <span className="inline-flex items-center gap-1 whitespace-nowrap">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                          Active · next 14 days
                        </span>
                      </div>

                      <div className="space-y-4 p-4">
                        <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center text-xs text-gray-800 dark:text-gray-200">
                          <div className="rounded-xl bg-gray-50 dark:bg-white/5 p-2 sm:p-3 min-w-0">
                            <p className="text-[0.65rem] sm:text-[0.7rem] uppercase tracking-wide text-primary-600/80 dark:text-primary-200/80">
                              Scheduled
                            </p>
                            <p className="mt-1 text-base sm:text-2xl font-bold text-gray-900 dark:text-white break-words">32</p>
                            <p className="mt-1 text-[0.65rem] sm:text-[0.7rem] text-gray-600 dark:text-gray-300">posts</p>
                          </div>
                          <div className="rounded-xl bg-gray-50 dark:bg-white/5 p-2 sm:p-3 min-w-0">
                            <p className="text-[0.65rem] sm:text-[0.7rem] uppercase tracking-wide text-primary-600/80 dark:text-primary-200/80">
                              Engagement
                            </p>
                            <p className="mt-1 text-base sm:text-2xl font-bold text-gray-900 dark:text-white break-words">+184%</p>
                            <p className="mt-1 text-[0.65rem] sm:text-[0.7rem] text-gray-600 dark:text-gray-300 leading-tight">last 30 days</p>
                          </div>
                          <div className="rounded-xl bg-gray-50 dark:bg-white/5 p-2 sm:p-3 min-w-0">
                            <p className="text-[0.65rem] sm:text-[0.7rem] uppercase tracking-wide text-primary-600/80 dark:text-primary-200/80">
                              Leads
                            </p>
                            <p className="mt-1 text-base sm:text-2xl font-bold text-gray-900 dark:text-white break-words">241</p>
                            <p className="mt-1 text-[0.65rem] sm:text-[0.7rem] text-gray-600 dark:text-gray-300">captured</p>
                          </div>
                        </div>

                        <div className="rounded-xl bg-gray-50 dark:bg-white/5 p-3 text-xs text-gray-800 dark:text-gray-200">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">This week&apos;s focus</span>
                            <span className="text-[0.7rem] text-primary-700 dark:text-primary-100">Plan My Week · Creator</span>
                          </div>
                          <ul className="mt-2 space-y-1 text-[0.7rem] text-gray-600 dark:text-gray-300">
                            <li>• Personalized content roadmap with image/video ideas</li>
                            <li>• Caption ideas and content packs ready to copy</li>
                            <li>• My Vault with reusable assets</li>
                            <li>• Analytics-style insights guiding content decisions</li>
                          </ul>
                        </div>

                        <div className="flex items-center justify-between border-t border-gray-200 dark:border-white/10 pt-3 text-[0.7rem] text-gray-600 dark:text-gray-300">
                          <span>Plan here · post manually to your favorite platforms</span>
                          <div className="flex items-center space-x-2 text-gray-700 dark:text-white/80">
                            <InstagramIcon className="h-4 w-4" />
                            <TikTokIcon className="h-4 w-4" />
                            <XIcon className="h-4 w-4" />
                            <FacebookIcon className="h-4 w-4" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Reviews Section */}
        <div className="mt-10 sm:mt-12 lg:mt-14">
          <ReviewsSection />
        </div>

        {/* Who We Serve Section */}
        <div className="bg-gray-100 dark:bg-gray-800 py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-12">
                    <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white">Built for Creators</h2>
                    <p className="mt-4 text-xl text-gray-500 dark:text-gray-400">Everything you need to launch, grow, and monetize with confidence.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-1 gap-8">
                    <div className="bg-white dark:bg-gray-900 p-8 rounded-2xl shadow-lg border-t-4 border-purple-500 hover:-translate-y-1 transition-transform">
                        <div className="flex items-center justify-center w-16 h-16 bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 rounded-full mb-6 mx-auto">
                            <UserIcon className="w-8 h-8" />
                        </div>
                        <h3 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-4">For Creators</h3>
                        <p className="text-gray-600 dark:text-gray-300 text-center mb-6">
                            Build your personal brand, grow your subscriber base, and maximize your revenue potential. Everything you need to scale from content idea to consistent income—all in one powerful platform.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                            <div className="space-y-4">
                                <h4 className="font-semibold text-gray-900 dark:text-white text-lg">Content Creation</h4>
                                <ul className="space-y-3 text-sm text-gray-500 dark:text-gray-400">
                                    <li className="flex items-start"><SparklesIcon className="w-4 h-4 mr-2 text-purple-500 mt-0.5 flex-shrink-0" /> <span>AI Content Assistant with conversion-optimized captions</span></li>
                                    <li className="flex items-start"><TargetIcon className="w-4 h-4 mr-2 text-purple-500 mt-0.5 flex-shrink-0" /> <span>Multi-week content roadmaps & strategic content planning</span></li>
                                    <li className="flex items-start"><ImageIcon className="w-4 h-4 mr-2 text-purple-500 mt-0.5 flex-shrink-0" /> <span>My Vault for organizing exclusive content assets</span></li>
                                    <li className="flex items-start"><CalendarIcon className="w-4 h-4 mr-2 text-purple-500 mt-0.5 flex-shrink-0" /> <span>Strategic content calendar to maximize subscriber engagement</span></li>
                                </ul>
                            </div>
                            <div className="space-y-4">
                                <h4 className="font-semibold text-gray-900 dark:text-white text-lg">Growth & Monetization</h4>
                                <ul className="space-y-3 text-sm text-gray-500 dark:text-gray-400">
                                    <li className="flex items-start"><div className="w-4 h-4 mr-2 text-purple-500 mt-0.5 flex-shrink-0 flex items-center"><AnalyticsIcon /></div> <span>Revenue & Engagement Analytics</span></li>
                                    <li className="flex items-start"><GlobeIcon className="w-4 h-4 mr-2 text-purple-500 mt-0.5 flex-shrink-0" /> <span>Bio Link Page with subscriber capture</span></li>
                                    <li className="flex items-start"><ChatIcon className="w-4 h-4 mr-2 text-purple-500 mt-0.5 flex-shrink-0" /> <span>AI Chatting Sessions for personalized fan engagement</span></li>
                                    <li className="flex items-start"><SparklesIcon className="w-4 h-4 mr-2 text-purple-500 mt-0.5 flex-shrink-0" /> <span>Subscriber conversion optimization tools</span></li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Features Section */}
        <div id="features" className="bg-white dark:bg-gray-900 py-24">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="lg:text-center">
                    <h2 className="text-base text-primary-600 font-semibold tracking-wide uppercase">Features</h2>
                    <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-4xl">Your AI Content Studio</p>
                    <p className="mt-4 max-w-2xl text-xl text-gray-500 dark:text-gray-400 lg:mx-auto">
                        Turn ideas into revenue-driving content plans, organize them strategically, and scale your subscriber base with AI-powered tools.
                    </p>
                </div>
                <div className="mt-12">
                    <dl className="space-y-10 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-x-8 md:gap-y-10">
                        <Feature icon={<TargetIcon />} title="Plan My Week">
                           Generate weekly content plans tailored to your niche and goals. See your ideas organized as planned content on your schedule.
                        </Feature>
                        <Feature icon={<KanbanIcon />} title="Drafts">
                           Save and organize your content drafts. Review, edit, and copy revenue-focused content packs before you publish.
                        </Feature>
                        <Feature icon={<CalendarIcon />} title="My Schedule">
                           See every planned post on a beautiful calendar. Click any slot to open the content, adjust timing, and copy captions/scripts.
                        </Feature>
                        <Feature icon={<ImageIcon />} title="My Vault">
                           Upload and organize images and videos in your personal media library. Reuse assets across your content and keep everything in one place.
                        </Feature>
                        <Feature icon={<SparklesIcon />} title="Premium Content Studio - Content Ideas (Elite)">
                           Plan drops, write captions, and map the week in creator language. Built for OnlyFans, Fansly, Fanvue & more.
                        </Feature>
                        <Feature icon={<ChatIcon />} title="Premium Content Studio - DM Sessions (Elite)">
                           Scripts & Roleplay plus DM session planning. Fan notes track VIPs, regulars, and whales.
                        </Feature>
                        <Feature icon={<GlobeIcon />} title="Bio Link Page">
                           Build a beautiful, creator-branded bio page with links and subscriber capture to convert visitors into paying fans.
                        </Feature>
                        <Feature icon={<ChatIcon />} title="Creator Assistant & Ideas">
                           Ask questions, generate new content angles, and brainstorm revenue-driving content ideas with a creator-focused AI assistant inside the app.
                        </Feature>
                        <Feature icon={<AnalyticsIcon />} title="Premium Content Studio - Post Packs & Wins (Elite)">
                           Copy & Post Packs for manual posting. Promo packs for drops. What’s Working keeps performance notes in one place.
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
                        <h3 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight sm:text-3xl">1. Set Up Your Profile</h3>
                        <p className="mt-3 text-lg text-gray-500 dark:text-gray-400">Tell EchoFlux.ai about your niche, audience, and goals—whether you're building your brand, growing your following, or monetizing with subscribers. AI generates content tailored to your path.</p>
                    </div>

                    <div className="mt-10 -mx-4 relative lg:mt-0" aria-hidden="true">
                        <svg className="absolute left-1/2 -translate-x-1/2 translate-y-16 lg:hidden" width="784" height="404" fill="none" viewBox="0 0 784 404"><path d="M404 392c-204.64 0-392-167.36-392-392" stroke="url(#ca9a2958-9e73-4171-8914-a3f5a5763919)" stroke-width="2" stroke-linecap="round"/></svg>
                        <div className="text-5xl text-primary-500 mx-auto text-center font-extrabold">&rarr;</div>
                    </div>

                    <div className="relative">
                        <h3 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight sm:text-3xl">2. Plan Your Content</h3>
                        <p className="mt-3 text-lg text-gray-500 dark:text-gray-400">Generate multi-week content roadmaps with Strategy, or quick weekly plans with Plan My Week. For monetized creators, plan exclusive content, drops, and subscriber-focused campaigns that drive revenue.</p>
                    </div>

                     <div className="mt-10 -mx-4 relative lg:mt-0" aria-hidden="true">
                        <svg className="absolute left-1/2 -translate-x-1/2 translate-y-16 lg:hidden" width="784" height="404" fill="none" viewBox="0 0 784 404"><path d="M404 392c-204.64 0-392-167.36-392-392" stroke="url(#ca9a2958-9e73-4171-8914-a3f5a5763919)" stroke-width="2" stroke-linecap="round"/></svg>
                        <div className="text-5xl text-primary-500 mx-auto text-center font-extrabold">&rarr;</div>
                    </div>

                    <div className="relative">
                        <h3 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight sm:text-3xl">3. Create & Schedule</h3>
                        <p className="mt-3 text-lg text-gray-500 dark:text-gray-400">Generate revenue-optimized captions in Write Captions, schedule everything on My Schedule, and copy content to post manually. Perfect for all creators—from building your brand to maximizing subscriber revenue.</p>
                    </div>
                </div>
            </div>
        </div>

        {/* Pricing Section */}
        <Pricing onGetStartedClick={handleGetStarted} onNavigateRequest={onNavigateRequest} />

      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-gray-900" aria-labelledby="footer-heading">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:py-16 lg:px-8">
            <div className="xl:grid xl:grid-cols-3 xl:gap-8">
                <div className="space-y-8 xl:col-span-1">
                     <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center">
                        <LogoIcon />
                        <span className="ml-2 text-xl font-bold" style={{ color: '#2563eb' }}>EchoFlux.ai</span>
                     </button>
                    <p className="text-gray-500 dark:text-gray-400 text-base">AI Content Studio & Content Planner for creators.</p>
                    <div className="flex space-x-6">
                        <a href="https://x.com/echoflux_ai" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors" aria-label="Follow us on X">
                            <span className="sr-only">X</span>
                            <XIcon />
                        </a>
                        <a href="https://instagram.com/echoflux.ai" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors" aria-label="Follow us on Instagram">
                            <span className="sr-only">Instagram</span>
                            <InstagramIcon />
                        </a>
                        <a href="https://www.facebook.com/profile.php?id=61584686017015" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors" aria-label="Follow us on Facebook">
                            <span className="sr-only">Facebook</span>
                            <FacebookIcon />
                        </a>
                        <a href="https://www.tiktok.com/@echoflux.ai" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors" aria-label="Follow us on TikTok">
                            <span className="sr-only">TikTok</span>
                            <TikTokIcon />
                        </a>
                        <a href="https://www.youtube.com/@echo_flux_ai" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors" aria-label="Subscribe to our YouTube channel">
                            <span className="sr-only">YouTube</span>
                            <YouTubeIcon />
                        </a>
                    </div>
                </div>
                <div className="mt-12 grid grid-cols-2 gap-8 xl:mt-0 xl:col-span-2">
                    <div className="md:grid md:grid-cols-2 md:gap-8">
                        <div>
                            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 tracking-wider uppercase">Products</h3>
                            <ul className="mt-4 space-y-4">
                                <li><button onClick={() => onNavigateRequest('dashboard')} className="text-base text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-left">Command Center</button></li>
                                <li><button onClick={() => onNavigateRequest('compose')} className="text-base text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-left">Write Captions</button></li>
                                <li><button onClick={() => onNavigateRequest('bio')} className="text-base text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-left">Bio Link Page</button></li>
                                <li><button onClick={() => onNavigateRequest('analytics')} className="text-base text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-left">What's Working</button></li>
                                <li><button onClick={() => onNavigateRequest('freeResources')} className="text-base text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-left">Free Resources</button></li>
                            </ul>
                        </div>
                        <div className="mt-12 md:mt-0">
                             <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 tracking-wider uppercase">Company</h3>
                            <ul className="mt-4 space-y-4">
                            <li><button onClick={() => setLegalModal('about')} className="text-base text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-left">About Us</button></li>
                            <li><button onClick={() => setLegalModal('contact')} className="text-base text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-left">Contact Us</button></li>
                            <li><a href="#" onClick={(e) => { e.preventDefault(); setLegalModal('terms'); }} className="text-base text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Terms</a></li>
                            <li><a href="#" onClick={(e) => { e.preventDefault(); setLegalModal('privacy'); }} className="text-base text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Privacy</a></li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
            <div className="mt-12 border-t border-gray-200 dark:border-gray-700 pt-8 md:flex md:items-center md:justify-between">
                <p className="text-base text-gray-400 md:order-1">&copy; 2025 EchoFlux.ai. All rights reserved.</p>
                <div className="mt-8 md:mt-0 md:order-2 flex space-x-6">
                    <a href="#" onClick={(e) => { e.preventDefault(); setLegalModal('terms'); }} className="text-base text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">Terms</a>
                    <a href="#" onClick={(e) => { e.preventDefault(); setLegalModal('privacy'); }} className="text-base text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">Privacy</a>
                </div>
            </div>
        </div>
      </footer>
      {/* Legal modal */}
      {legalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10 dark:bg-gray-900 dark:ring-white/10">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <div className="text-lg font-semibold text-gray-900 dark:text-white">{legalTitle}</div>
              <button
                onClick={() => setLegalModal(null)}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="max-h-[75vh] overflow-y-auto px-5 py-6">
              {legalModal === 'about' && <About />}
              {legalModal === 'terms' && <Terms />}
              {legalModal === 'privacy' && <Privacy />}
              {legalModal === 'contact' && (
                <div className="max-w-3xl mx-auto space-y-6 text-gray-700 dark:text-gray-300">
                  <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Support</h3>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">
                      Email us anytime and we’ll get back to you as fast as we can.
                    </p>
                    <div className="mt-4">
                      <a
                        href="mailto:contact@echoflux.ai"
                        className="inline-flex items-center justify-center rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
                      >
                        contact@echoflux.ai
                      </a>
                    </div>
                    <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                      Tip: include your account email and a screenshot if you can.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
