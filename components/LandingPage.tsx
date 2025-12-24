import React from 'react';
import { LogoIcon, SparklesIcon, AutomationIcon, ChatIcon, AnalyticsIcon, CalendarIcon, RefreshIcon, GlobeIcon, UserIcon, TargetIcon, DashboardIcon, FilmIcon, MicrophoneWaveIcon, RocketIcon, TrendingIcon, ImageIcon, KanbanIcon } from './icons/UIIcons';
import { InstagramIcon, TikTokIcon, XIcon, FacebookIcon, YouTubeIcon } from './icons/PlatformIcons';
import { Pricing } from './Pricing';
import { Page } from '../types';

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
  const handleGetStarted = onGetStartedClick || onLoginClick;
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
               <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center">
                  <LogoIcon />
                        <span className="ml-2 text-xl font-bold" style={{ color: '#2563eb' }}>EchoFlux.ai</span>
               </button>
            </div>
            <div className="hidden md:flex items-center justify-end md:flex-1 lg:w-0 space-x-8">
                <button onClick={() => handleScroll('features')} className="text-base font-medium text-gray-500 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">Features</button>
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
      <main>
        <div className="relative">
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gray-100 dark:bg-gray-800" />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-2xl bg-gray-900 shadow-2xl">
              {/* Background image + gradient overlay */}
              <div className="absolute inset-0">
                <img
                  className="h-full w-full object-cover opacity-70"
                  src="https://images.unsplash.com/photo-1531297484001-80022131f5a1?q=80&w=2920&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
                  alt="Abstract visualization of a hand interacting with a glowing digital network"
                />
                <div className="absolute inset-0 bg-gradient-to-br from-primary-600/80 via-gray-900/90 to-gray-900" />
              </div>

              <div className="relative px-6 py-16 sm:px-10 sm:py-20 lg:px-16 lg:py-24">
                <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
                  {/* Left: Copy + CTAs */}
                  <div>
                    <div className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-primary-100 ring-1 ring-inset ring-white/20 backdrop-blur">
                      <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Live AI operating system for creators
                    </div>

                    <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
                      <span className="block">Creator-First AI</span>
                      <span className="block text-primary-200">
                        Social Operating System
                      </span>
                    </h1>

                    <p className="mt-6 max-w-xl text-lg text-primary-100 sm:text-xl">
                      Replace scattered tools with one creator command center to
                      strategize, batch-create campaigns, and organize everything on a calendar—then post anywhere you like.
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
                        className="inline-flex items-center justify-center rounded-md border border-white/30 bg-white/5 px-8 py-3 text-base font-medium text-white backdrop-blur transition hover:bg-white/10"
                      >
                        Explore features
                      </button>
                    </div>

                    <div className="mt-6 flex flex-col gap-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                        <div className="flex items-center">
                          <span className="mr-2 text-lg whitespace-nowrap">★ ★ ★ ★ ★</span>
                        </div>
                        <div className="flex items-center space-x-3 text-xs text-primary-100/90">
                          <span className="inline-flex items-center rounded-full bg-white/25 backdrop-blur-sm border border-white/30 px-3 py-1.5 whitespace-nowrap font-medium text-white shadow-lg">
                            No credit card required
                          </span>
                          <span className="inline-flex items-center rounded-full bg-white/25 backdrop-blur-sm border border-white/30 px-3 py-1.5 whitespace-nowrap font-medium text-white shadow-lg">
                            Cancel anytime
                          </span>
                        </div>
                      </div>
                      <div className="text-sm text-primary-100">
                        <span>Trusted by creators scaling their social presence</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Product preview card */}
                  <div className="relative">
                    <div className="pointer-events-none absolute -inset-8 rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-primary-500/10 to-transparent blur-3xl" />
                    <div className="relative rounded-2xl bg-gray-900/70 p-4 shadow-xl ring-1 ring-white/15 backdrop-blur">
                      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-xs text-gray-300">
                        <span className="inline-flex items-center gap-2">
                          <span className="flex h-2 w-2 items-center justify-center">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          </span>
                          Automation · Active
                        </span>
                        <span>Next 14 days</span>
                      </div>

                      <div className="space-y-4 p-4">
                        <div className="grid grid-cols-3 gap-4 text-center text-xs text-gray-200">
                          <div className="rounded-xl bg-white/5 p-3">
                            <p className="text-[0.7rem] uppercase tracking-wide text-primary-200/80">
                              Scheduled
                            </p>
                            <p className="mt-1 text-2xl font-bold text-white">32</p>
                            <p className="mt-1 text-[0.7rem] text-gray-300">posts</p>
                          </div>
                          <div className="rounded-xl bg-white/5 p-3">
                            <p className="text-[0.7rem] uppercase tracking-wide text-primary-200/80">
                              Engagement
                            </p>
                            <p className="mt-1 text-2xl font-bold text-white">+184%</p>
                            <p className="mt-1 text-[0.7rem] text-gray-300">last 30 days</p>
                          </div>
                          <div className="rounded-xl bg-white/5 p-3">
                            <p className="text-[0.7rem] uppercase tracking-wide text-primary-200/80">
                              Leads
                            </p>
                            <p className="mt-1 text-2xl font-bold text-white">241</p>
                            <p className="mt-1 text-[0.7rem] text-gray-300">captured</p>
                          </div>
                        </div>

                        <div className="rounded-xl bg-white/5 p-3 text-xs text-gray-200">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">This week&apos;s focus</span>
                            <span className="text-[0.7rem] text-primary-100">Strategy · Creator</span>
                          </div>
                          <ul className="mt-2 space-y-1 text-[0.7rem] text-gray-300">
                            <li>• AI-generated content roadmap with image/video ideas</li>
                            <li>• AI Content Generation created 12 ready-to-use posts</li>
                            <li>• Media Library with reusable assets</li>
                            <li>• Analytics-style insights guiding content decisions</li>
                          </ul>
                        </div>

                        <div className="flex items-center justify-between border-t border-white/10 pt-3 text-[0.7rem] text-gray-300">
                          <span>Plan here · post to your favorite platforms</span>
                          <div className="flex items-center space-x-2 text-white/80">
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
                            Build your personal brand, grow your audience, and monetize your passion.
                        </p>
                        <ul className="space-y-3 text-sm text-gray-500 dark:text-gray-400">
                            <li className="flex items-center"><SparklesIcon className="w-4 h-4 mr-2 text-purple-500" /> AI Content Assistant</li>
                            <li className="flex items-center"><SparklesIcon className="w-4 h-4 mr-2 text-purple-500" /> Growth & Engagement Analytics</li>
                            <li className="flex items-center"><SparklesIcon className="w-4 h-4 mr-2 text-purple-500" /> Brand Partnership Finder</li>
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
                    <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-4xl">Your AI Content Studio</p>
                    <p className="mt-4 max-w-2xl text-xl text-gray-500 dark:text-gray-400 lg:mx-auto">
                        Turn ideas into full content campaigns, organize them on a calendar, and copy captions/scripts to post anywhere.
                    </p>
                </div>
                <div className="mt-12">
                    <dl className="space-y-10 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-x-8 md:gap-y-10">
                        <Feature icon={<RocketIcon />} title="AI Campaign Studio (Autopilot)">
                           Define a goal and let EchoFlux.ai generate a complete multi-week content campaign with ready-to-use posts, captions, and prompts.
                        </Feature>
                        <Feature icon={<TargetIcon />} title="AI Content Strategist">
                           Generate multi-week content roadmaps tailored to your niche and goals. Push ideas into campaigns and see them as planned content on your calendar.
                        </Feature>
                        <Feature icon={<KanbanIcon />} title="Workflow Board">
                           Move posts from Draft to Ready-to-Post in a simple kanban view. Review, edit, and copy content packs before you publish on your platforms.
                        </Feature>
                        <Feature icon={<CalendarIcon />} title="Visual Content Calendar">
                           See every planned post on a beautiful calendar. Click any slot to open the content, adjust timing, and copy captions/scripts.
                        </Feature>
                        <Feature icon={<ImageIcon />} title="Media Library">
                           Upload and organize images and videos in your personal media library. Reuse assets across campaigns and keep everything in one place.
                        </Feature>
                        <Feature icon={<SparklesIcon />} title="OnlyFans Studio (Elite)">
                           For Elite creators, unlock a dedicated OnlyFans Studio with spicy content ideas, roleplay flows, OF calendar, and vault-style media tools.
                        </Feature>
                        <Feature icon={<GlobeIcon />} title="Smart Link-in-Bio">
                           Build a beautiful, creator-branded bio page with links and optional email capture to grow your owned audience.
                        </Feature>
                        <Feature icon={<ChatIcon />} title="Creator Assistant & Ideas">
                           Ask questions, generate new content angles, and brainstorm campaigns with a creator-focused AI assistant inside the app.
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
                        <h3 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight sm:text-3xl">1. Set Up Your Creator Profile</h3>
                        <p className="mt-3 text-lg text-gray-500 dark:text-gray-400">Tell EchoFlux.ai about your niche, audience, and offers so your campaigns and content are tailored to you.</p>
                    </div>

                    <div className="mt-10 -mx-4 relative lg:mt-0" aria-hidden="true">
                        <svg className="absolute left-1/2 -translate-x-1/2 translate-y-16 lg:hidden" width="784" height="404" fill="none" viewBox="0 0 784 404"><path d="M404 392c-204.64 0-392-167.36-392-392" stroke="url(#ca9a2958-9e73-4171-8914-a3f5a5763919)" stroke-width="2" stroke-linecap="round"/></svg>
                        <div className="text-5xl text-primary-500 mx-auto text-center font-extrabold">&rarr;</div>
                    </div>

                    <div className="relative">
                        <h3 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight sm:text-3xl">2. Train Your AI</h3>
                        <p className="mt-3 text-lg text-gray-500 dark:text-gray-400">Upload past content or notes to match your writing style, and optionally add media and voice samples for richer ideas.</p>
                    </div>

                     <div className="mt-10 -mx-4 relative lg:mt-0" aria-hidden="true">
                        <svg className="absolute left-1/2 -translate-x-1/2 translate-y-16 lg:hidden" width="784" height="404" fill="none" viewBox="0 0 784 404"><path d="M404 392c-204.64 0-392-167.36-392-392" stroke="url(#ca9a2958-9e73-4171-8914-a3f5a5763919)" stroke-width="2" stroke-linecap="round"/></svg>
                        <div className="text-5xl text-primary-500 mx-auto text-center font-extrabold">&rarr;</div>
                    </div>

                    <div className="relative">
                        <h3 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight sm:text-3xl">3. Generate & Plan Campaigns</h3>
                        <p className="mt-3 text-lg text-gray-500 dark:text-gray-400">Use Autopilot and Strategy to create full content packs and a visual calendar. Copy captions and scripts to post on any platform you choose.</p>
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
                    <p className="text-gray-500 dark:text-gray-400 text-base">AI Content Studio & Campaign Planner for creators.</p>
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
                <p className="text-base text-gray-400 md:order-1">&copy; 2025 EchoFlux.ai. All rights reserved.</p>
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
