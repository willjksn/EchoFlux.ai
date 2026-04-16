import React, { useState } from 'react';
import { LogoIcon, SparklesIcon, ChatIcon, AnalyticsIcon, CalendarIcon, GlobeIcon, UserIcon, TargetIcon, FilmIcon, RocketIcon, TrendingIcon, ImageIcon, HeartIcon } from './icons/UIIcons';
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
      ? 'About EchoFlux.ai & witme.io'
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
                <button onClick={() => handleScroll('fan-hub')} className="text-base font-medium text-gray-500 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">Fan Hub</button>
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
                      EchoFlux studio + witme.io fan pages
                    </div>

                    <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-5xl lg:text-6xl max-w-full break-words">
                      <span className="block">Build your brand.</span>
                      <span className="block text-primary-700 dark:text-primary-200">
                        Grow your audience.
                      </span>
                    </h1>

                    <p className="mt-6 max-w-xl text-lg text-gray-700 dark:text-primary-100 sm:text-xl max-w-full break-words">
                      EchoFlux.ai is your creator studio—planning, vault, and payouts. Your public fan page lives on{' '}
                      <a
                        href="https://witme.io"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-primary-700 underline-offset-2 hover:underline dark:text-primary-200"
                      >
                        witme.io
                      </a>{' '}
                      (e.g. witme.io/yourname), where fans subscribe, shop, tip, and message you.
                    </p>

                    <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                      <button
                        onClick={handleGetStarted}
                        className="inline-flex items-center justify-center rounded-md bg-white px-8 py-3 text-base font-semibold text-primary-700 shadow-sm transition hover:bg-primary-50"
                      >
                        Get started free
                      </button>
                      <button
                        onClick={() => handleScroll('fan-hub')}
                        className="inline-flex items-center justify-center rounded-md border border-primary-200 bg-white px-8 py-3 text-base font-medium text-primary-700 shadow-sm transition hover:bg-primary-50 dark:border-white/30 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                      >
                        Explore Fan Hub
                      </button>
                    </div>

                    <div className="mt-4 text-sm text-gray-700 dark:text-primary-100/90">
                      7-day free trial on Pro and Elite plans.
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
                        <div className="text-base font-semibold">Start building today</div>
                        <div className="mt-2 text-sm text-gray-700 dark:text-primary-100/90">
                          Sign up to launch your witme.io page from EchoFlux, plan and publish content, and grow your audience.
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
                            Pro & Elite plans
                          </span>
                          <span className="inline-flex items-center rounded-full bg-primary-50 border border-primary-200 px-3 py-1.5 whitespace-nowrap font-medium text-primary-700 shadow-sm dark:bg-white/20 dark:border-white/30 dark:text-white dark:shadow-lg flex-shrink-0">
                            Your own storefront
                          </span>
                          <span className="inline-flex items-center rounded-full bg-primary-50 border border-primary-200 px-3 py-1.5 whitespace-nowrap font-medium text-primary-700 shadow-sm dark:bg-white/20 dark:border-white/30 dark:text-white dark:shadow-lg flex-shrink-0">
                            Built-in monetization
                          </span>
                        </div>
                      </div>
                      <div className="text-sm text-gray-700 dark:text-primary-100">
                        <span>Trusted by creators building their brands and communities</span>
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
                          Creator Dashboard
                        </span>
                        <span className="inline-flex items-center gap-1 whitespace-nowrap">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                          Live
                        </span>
                      </div>

                      <div className="space-y-4 p-4">
                        <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center text-xs text-gray-800 dark:text-gray-200">
                          <div className="rounded-xl bg-gray-50 dark:bg-white/5 p-2 sm:p-3 min-w-0">
                            <p className="text-[0.65rem] sm:text-[0.7rem] uppercase tracking-wide text-primary-600/80 dark:text-primary-200/80">
                              Members
                            </p>
                            <p className="mt-1 text-base sm:text-2xl font-bold text-gray-900 dark:text-white break-words">847</p>
                            <p className="mt-1 text-[0.65rem] sm:text-[0.7rem] text-gray-600 dark:text-gray-300">+24 this week</p>
                          </div>
                          <div className="rounded-xl bg-gray-50 dark:bg-white/5 p-2 sm:p-3 min-w-0">
                            <p className="text-[0.65rem] sm:text-[0.7rem] uppercase tracking-wide text-primary-600/80 dark:text-primary-200/80">
                              Revenue
                            </p>
                            <p className="mt-1 text-base sm:text-2xl font-bold text-gray-900 dark:text-white break-words">$4,280</p>
                            <p className="mt-1 text-[0.65rem] sm:text-[0.7rem] text-gray-600 dark:text-gray-300 leading-tight">this month</p>
                          </div>
                          <div className="rounded-xl bg-gray-50 dark:bg-white/5 p-2 sm:p-3 min-w-0">
                            <p className="text-[0.65rem] sm:text-[0.7rem] uppercase tracking-wide text-primary-600/80 dark:text-primary-200/80">
                              Posts
                            </p>
                            <p className="mt-1 text-base sm:text-2xl font-bold text-gray-900 dark:text-white break-words">32</p>
                            <p className="mt-1 text-[0.65rem] sm:text-[0.7rem] text-gray-600 dark:text-gray-300">scheduled</p>
                          </div>
                        </div>

                        <div className="rounded-xl bg-gray-50 dark:bg-white/5 p-3 text-xs text-gray-800 dark:text-gray-200">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">Your Fan Hub</span>
                            <span className="text-[0.7rem] text-primary-700 dark:text-primary-100">witme.io/yourname</span>
                          </div>
                          <ul className="mt-2 space-y-1 text-[0.7rem] text-gray-600 dark:text-gray-300">
                            <li>• Customizable storefront with your branding</li>
                            <li>• Subscriptions, tips, and digital products</li>
                            <li>• Direct messages with your fans</li>
                            <li>• Video chat sessions</li>
                          </ul>
                        </div>

                        <div className="flex items-center justify-between border-t border-gray-200 dark:border-white/10 pt-3 text-[0.7rem] text-gray-600 dark:text-gray-300">
                          <span>Plan content · Post to socials</span>
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

        {/* Fan Hub Section */}
        <div id="fan-hub" className="bg-gradient-to-br from-primary-50 to-purple-50 dark:from-gray-800 dark:to-gray-900 py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <div className="inline-flex items-center rounded-full bg-primary-100 px-4 py-1.5 text-sm font-medium text-primary-700 dark:bg-primary-900/50 dark:text-primary-300 mb-4">
                <HeartIcon className="w-4 h-4 mr-2" />
                Fan Hub
              </div>
              <h2 className="text-4xl font-extrabold text-gray-900 dark:text-white sm:text-5xl">
                Your witme link. Your community.
              </h2>
              <p className="mt-4 text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
                Fans open your page on witme.io—you customize it, set pricing, and run memberships, tips, store, and DMs from
                EchoFlux. Ticketed live broadcasts to your feed are included on Elite.
              </p>
            </div>

            <div className="mb-12 flex justify-center px-2">
              <div className="max-w-2xl rounded-2xl border border-primary-200/90 bg-white/90 px-5 py-4 text-center shadow-sm dark:border-white/10 dark:bg-gray-800/90">
                <div className="flex justify-center">
                  <img
                    src="/witme-wordmark-on-light.svg"
                    alt="witme"
                    className="h-7 w-auto sm:h-8 dark:hidden"
                    loading="lazy"
                  />
                  <img
                    src="/witme-wordmark-on-dark.svg"
                    alt="witme"
                    className="hidden h-7 w-auto sm:h-8 dark:block"
                    loading="lazy"
                  />
                </div>
                <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                  Fans browse creator pages on{' '}
                  <a
                    href="https://witme.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary-600 underline-offset-2 hover:underline dark:text-primary-300"
                  >
                    witme.io
                  </a>
                  . Share it in your bio—everything they do there (subscribe, shop, tip, message) is powered by what you
                  set up in EchoFlux.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Subscriptions */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-xl transition-shadow">
                <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/50 rounded-xl flex items-center justify-center mb-4">
                  <UserIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Monthly Subscriptions</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Build recurring revenue with paid memberships. Fans subscribe to access your exclusive content and community.
                </p>
              </div>

              {/* Tips */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-xl transition-shadow">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/50 rounded-xl flex items-center justify-center mb-4">
                  <HeartIcon className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Tips & Support</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Let fans show their appreciation with one-time tips. No subscription required — anyone can support you.
                </p>
              </div>

              {/* Fan store */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-xl transition-shadow">
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/50 rounded-xl flex items-center justify-center mb-4">
                  <SparklesIcon className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Fan store</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Sell digital products, exclusive content bundles, personalized messages, and more in your own store.
                </p>
              </div>

              {/* Direct Messages */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-xl transition-shadow">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/50 rounded-xl flex items-center justify-center mb-4">
                  <ChatIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Direct Messages</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Connect with your fans through private messages. Build relationships and engage your community personally.
                </p>
              </div>

              {/* Video Chat */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-xl transition-shadow">
                <div className="w-12 h-12 bg-rose-100 dark:bg-rose-900/50 rounded-xl flex items-center justify-center mb-4">
                  <FilmIcon className="w-6 h-6 text-rose-600 dark:text-rose-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Video Chat Sessions</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Offer paid 1-on-1 video calls with fans. Perfect for coaching, Q&A sessions, or exclusive experiences.
                </p>
              </div>

              {/* Live streams to feed — Elite */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-xl transition-shadow">
                <div className="w-12 h-12 bg-fuchsia-100 dark:bg-fuchsia-900/50 rounded-xl flex items-center justify-center mb-4">
                  <RocketIcon className="w-6 h-6 text-fuchsia-600 dark:text-fuchsia-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Live streams to your fans</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Schedule ticketed or free shows on your Fan Hub feed with a live broadcast. Included on Elite so we can keep infrastructure sustainable as you scale.
                </p>
              </div>

              {/* Custom Branding */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-xl transition-shadow">
                <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/50 rounded-xl flex items-center justify-center mb-4">
                  <GlobeIcon className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Your Brand, Your Way</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Customize colors, fonts, and layout. Add your hero image and social links. It's your page.
                </p>
              </div>
            </div>

            <div className="mt-12 text-center">
              <button
                onClick={handleGetStarted}
                className="inline-flex items-center justify-center rounded-lg bg-primary-600 px-8 py-4 text-lg font-semibold text-white shadow-lg hover:bg-primary-700 transition"
              >
                Create your witme page
              </button>
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                Fan-facing URL on witme.io with Pro or Elite. Platform fees apply when you earn.
              </p>
            </div>
          </div>
        </div>

        {/* Who We Serve Section */}
        <div className="bg-gray-100 dark:bg-gray-800 py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-12">
                    <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white">Built for Every Creator</h2>
                    <p className="mt-4 text-xl text-gray-500 dark:text-gray-400">
                      Whether you are starting out or scaling, EchoFlux runs your business and witme.io is the link fans save.
                    </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="bg-white dark:bg-gray-900 p-8 rounded-2xl shadow-lg border-t-4 border-blue-500 hover:-translate-y-1 transition-transform">
                        <div className="flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-full mb-6 mx-auto">
                            <RocketIcon className="w-8 h-8" />
                        </div>
                        <h3 className="text-xl font-bold text-center text-gray-900 dark:text-white mb-4">Growing Creators</h3>
                        <p className="text-gray-600 dark:text-gray-300 text-center">
                            Build your audience with structured content planning. Create engaging posts for Instagram, TikTok, X, and Facebook.
                        </p>
                    </div>
                    <div className="bg-white dark:bg-gray-900 p-8 rounded-2xl shadow-lg border-t-4 border-purple-500 hover:-translate-y-1 transition-transform">
                        <div className="flex items-center justify-center w-16 h-16 bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 rounded-full mb-6 mx-auto">
                            <UserIcon className="w-8 h-8" />
                        </div>
                        <h3 className="text-xl font-bold text-center text-gray-900 dark:text-white mb-4">Community Builders</h3>
                        <p className="text-gray-600 dark:text-gray-300 text-center">
                            Share one witme.io URL in your bio. Fans join, subscribe, and shop there while you manage everything in EchoFlux.
                        </p>
                    </div>
                    <div className="bg-white dark:bg-gray-900 p-8 rounded-2xl shadow-lg border-t-4 border-green-500 hover:-translate-y-1 transition-transform">
                        <div className="flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 rounded-full mb-6 mx-auto">
                            <TrendingIcon className="w-8 h-8" />
                        </div>
                        <h3 className="text-xl font-bold text-center text-gray-900 dark:text-white mb-4">Monetizing Creators</h3>
                        <p className="text-gray-600 dark:text-gray-300 text-center">
                            Turn your audience into revenue. Subscriptions, tips, digital products, and video sessions — all powered by Stripe.
                        </p>
                    </div>
                </div>
            </div>
        </div>

        {/* Features Section */}
        <div id="features" className="bg-white dark:bg-gray-900 py-24">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="lg:text-center">
                    <h2 className="text-base text-primary-600 font-semibold tracking-wide uppercase">Studio &amp; witme.io</h2>
                    <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
                      Run your business from EchoFlux
                    </p>
                    <p className="mt-4 max-w-2xl text-xl text-gray-500 dark:text-gray-400 lg:mx-auto">
                      Plan content, manage your vault, and configure your public page on witme.io—where fans subscribe, shop, and message{' '}
                      <span className="font-medium text-gray-700 dark:text-gray-300">you</span>. Optional drafting helpers stay in your studio;
                      what fans see is always under your control.
                    </p>
                </div>
                <div className="mt-12">
                    <dl className="space-y-10 md:space-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-x-8 md:gap-y-10">
                        <Feature icon={<SparklesIcon />} title="AI Captions">
                           Generate scroll-stopping captions with trending hashtags. Optimized for Instagram, TikTok, X, Facebook, and your Fan Hub.
                        </Feature>
                        <Feature icon={<TargetIcon />} title="Content Strategy">
                           Get AI-generated content ideas and posting strategies based on current trends and what works for your niche.
                        </Feature>
                        <Feature icon={<CalendarIcon />} title="Content Calendar">
                           See all your planned posts in one beautiful calendar. Organize your content schedule and never miss a post.
                        </Feature>
                        <Feature icon={<ImageIcon />} title="My Vault">
                           Upload and organize your images, videos, and audio files. Reuse assets across your social posts and Fan Hub.
                        </Feature>
                        <Feature icon={<HeartIcon />} title="witme.io fan page">
                           Your public page at witme.io/yourhandle—subscriptions, tips, store, and DMs—configured from EchoFlux.
                        </Feature>
                        <Feature icon={<ChatIcon />} title="Studio assistant">
                           Brainstorm ideas and draft captions inside EchoFlux—built for your workflow, not for replacing you with fans.
                        </Feature>
                        <Feature icon={<ChatIcon />} title="Chat session reply drafts (Elite)">
                           During timed chat sessions, get optional reply suggestions in your voice—you review and send; fans only ever get messages you send. Elite only; Pro sees an upgrade prompt.
                        </Feature>
                        <Feature icon={<SparklesIcon />} title="Feed comment drafts (Elite)">
                           Draft responses to public feed comments in your tone; you choose what posts. Optionally prioritize supporters who tip or buy. Elite only; Pro sees an upgrade prompt.
                        </Feature>
                    </dl>
                </div>
            </div>
        </div>

         {/* How It Works Section */}
        <div className="py-24 bg-gray-50 dark:bg-gray-800 overflow-hidden">
            <div className="relative max-w-xl mx-auto px-4 sm:px-6 lg:px-8 lg:max-w-7xl">
                 <div className="lg:text-center">
                     <h2 className="text-3xl leading-8 font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-4xl">Get Started in Minutes</h2>
                </div>
                <div className="relative mt-12 lg:mt-24 lg:grid lg:grid-cols-3 lg:gap-8 lg:items-center">
                    <div className="relative">
                        <h3 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight sm:text-3xl">1. Create Your Account</h3>
                        <p className="mt-3 text-lg text-gray-500 dark:text-gray-400">Sign up free and set up your creator profile. Tell us about your niche, goals, and the platforms you use.</p>
                    </div>

                    <div className="mt-10 -mx-4 relative lg:mt-0" aria-hidden="true">
                        <div className="text-5xl text-primary-500 mx-auto text-center font-extrabold">&rarr;</div>
                    </div>

                    <div className="relative">
                        <h3 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight sm:text-3xl">2. Launch on witme.io</h3>
                        <p className="mt-3 text-lg text-gray-500 dark:text-gray-400">
                          Pick your handle, theme, and offers in EchoFlux. Fans use your witme.io link to subscribe, shop, and message you.
                        </p>
                    </div>

                     <div className="mt-10 -mx-4 relative lg:mt-0" aria-hidden="true">
                        <div className="text-5xl text-primary-500 mx-auto text-center font-extrabold">&rarr;</div>
                    </div>

                    <div className="relative">
                        <h3 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight sm:text-3xl">3. Grow & monetize</h3>
                        <p className="mt-3 text-lg text-gray-500 dark:text-gray-400">
                          Plan content, post everywhere, and send traffic to your witme.io page. Stripe handles payouts and renewals.
                        </p>
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
                    <p className="text-gray-500 dark:text-gray-400 text-base">
                      Creator studio at EchoFlux.ai. Fan-facing pages on{' '}
                      <a
                        href="https://witme.io"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:underline dark:text-primary-400"
                      >
                        witme.io
                      </a>
                      .
                    </p>
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
                            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 tracking-wider uppercase">Platform</h3>
                            <ul className="mt-4 space-y-4">
                                <li><button onClick={() => onNavigateRequest('fanHub')} className="text-base text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-left">Fan Hub</button></li>
                                <li><button onClick={() => onNavigateRequest('compose')} className="text-base text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-left">AI Captions</button></li>
                                <li><button onClick={() => onNavigateRequest('calendar')} className="text-base text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-left">Content Calendar</button></li>
                                <li><button onClick={() => onNavigateRequest('mediaLibrary')} className="text-base text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-left">My Vault</button></li>
                            </ul>
                        </div>
                        <div className="mt-12 md:mt-0">
                             <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 tracking-wider uppercase">Company</h3>
                            <ul className="mt-4 space-y-4">
                            <li><button onClick={() => setLegalModal('about')} className="text-base text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-left">About Us</button></li>
                            <li><button onClick={() => setLegalModal('contact')} className="text-base text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-left">Contact Us</button></li>
                            <li><a href="/terms-of-service.html" className="text-base text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Terms</a></li>
                            <li><a href="/privacy-policy.html" className="text-base text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">Privacy</a></li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
            <div className="mt-12 border-t border-gray-200 dark:border-gray-700 pt-8 md:flex md:items-center md:justify-between">
                <p className="text-base text-gray-400 md:order-1">
                  &copy; 2026 EchoFlux.ai &amp; witme.io. All rights reserved.
                </p>
                <div className="mt-8 md:mt-0 md:order-2 flex space-x-6">
                    <a href="/terms-of-service.html" className="text-base text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">Terms</a>
                    <a href="/privacy-policy.html" className="text-base text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">Privacy</a>
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
                      Email us anytime and we'll get back to you as fast as we can.
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

export default LandingPage;
