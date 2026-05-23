import React, { useState, useEffect } from 'react';
import { CheckIcon } from './icons/UIIcons';
import { useAppContext } from './AppContext';
import { Page, Plan } from '../types';
import {
  ECHOFLUX_ELITE_MONTHLY_USD,
  ECHOFLUX_PRO_MONTHLY_USD,
  echofluxAnnualTotalUsd,
  echofluxEffectiveMonthlyWhenAnnualUsd,
} from '../constants';
import {
    canOpenCreatorBillingPortal,
    openCreatorBillingPortal,
} from '../src/lib/openCreatorBillingPortal';
import {
    canShowEchoFluxTrialMarketing,
    hasUsedEchoFluxFreeTrial,
    isEligibleForEchoFluxCheckoutTrial,
} from '../src/lib/echoFluxTrialEligibility';
import { hasActiveEchoFluxSubscription } from '../src/lib/echoFluxSubscriptionAccess';

/** Rank on pricing cards (Pro/CreatorPro = 1, Elite/CreatorElite = 2). */
function echoFluxPricingTierRank(plan: string | null | undefined): number {
    if (plan === 'Elite' || plan === 'CreatorElite') return 2;
    if (plan === 'Pro' || plan === 'CreatorPro') return 1;
    return 0;
}

function isActiveEchoFluxPricingTier(
    userPlan: string | null | undefined,
    tierName: string,
): boolean {
    if (!userPlan) return false;
    if (userPlan === tierName) return true;
    if (tierName === 'Pro' && userPlan === 'CreatorPro') return true;
    if (tierName === 'Elite' && userPlan === 'CreatorElite') return true;
    return false;
}

interface PricingProps {
    onGetStartedClick?: () => void;
    onNavigateRequest?: (page: Page) => void;
    /** Optional back control (e.g. lapsed subscription shell only). */
    onBack?: () => void;
    backLabel?: string;
}

const ChevronLeftIcon = () => (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

// Creator SaaS: Pro and Elite only (no public free tier; access via invite grant or paid checkout).
const creatorTiers = [
    {
        name: 'Pro',
        priceMonthly: ECHOFLUX_PRO_MONTHLY_USD,
        priceAnnually: echofluxEffectiveMonthlyWhenAnnualUsd(ECHOFLUX_PRO_MONTHLY_USD),
        description: 'Everything you need to create content and monetize—with your public page on witme.io.',
        features: [
            'Create Post: AI captions (fair use)',
            'Plan → Today: daily ideas & trends',
            'Content calendar with reminders',
            'My Vault (5 GB storage)',
            'Fan Hub + witme.io page (witme.io/yourhandle)',
            'Subscriptions, tips, and store',
            'Fan messages',
            '100 video chat minutes/month',
            'Basic analytics',
            'Stripe payouts (10% platform fee)',
            'In-session & feed reply drafts (Elite unlocks)',
            'Live streams to your feed are Elite-only'
        ],
        isRecommended: false
    },
    {
        name: 'Elite',
        priceMonthly: ECHOFLUX_ELITE_MONTHLY_USD,
        priceAnnually: echofluxEffectiveMonthlyWhenAnnualUsd(ECHOFLUX_ELITE_MONTHLY_USD),
        description: 'For serious creators who want advanced tools and more video time.',
        features: [
            'Everything in Pro',
            'Fan Hub live streams on witme.io',
            'Fan Hub → Posts: Post ideas & Drop plan',
            'Plan → Weekly monetization',
            'Plan → Multi-week strategy',
            'Settings → Profile & AI: Creator Identity',
            'Fan Hub chat session planner',
            'Chat session reply drafts in your voice (you send every message)',
            'Feed comment drafts in your tone (optional priority for supporters)',
            '250 video chat minutes/month',
            'Advanced fan analytics',
            'VIP fan management',
            '10 GB storage',
            'Priority support'
        ],
        isRecommended: true
    },
    // Hidden plans - will be available in future updates
    // {
    //     name: 'Caption',
    //     displayName: 'Caption Pro',
    //     priceMonthly: 9,
    //     priceAnnually: 7,
    //     description: 'Perfect for caption writing.',
    //     features: [
    //         '100 AI captions / month',
    //         'Trending hashtags (all platforms)',
    //         'Tone & goal customization',
    //         'AI Training',
    //         'Basic Link-in-Bio (1 link)'
    //     ],
    //     isRecommended: false
    // },
    // {
    //     name: 'OnlyFansStudio',
    //     displayName: 'OnlyFans Studio',
    //     priceMonthly: 24,
    //     priceAnnually: 19,
    //     description: 'AI content planning for premium creators.',
    //     features: [
    //         'OnlyFans Studio access',
    //         'OF-specific AI captions & prompts',
    //         'Content planning & calendars',
    //         'Roleplay & interactive ideas',
    //         'Media organization',
    //         'Export content packages',
    //         'Cross-platform teaser generator'
    //     ],
    //     isRecommended: false
    // },
    // {
    //     name: 'Agency',
    //     priceMonthly: 299,
    //     priceAnnually: 239,
    //     description: 'For agencies managing clients.',
    //     features: [
    //         'Unlimited Accounts',
    //         '2,000 AI Replies / month',
    //         '10,000 AI Captions / month*',
    //         'AI Content Strategist',
    //         'AI Content Generation',
    //         'Media Library',
    //         '5 GB Storage',
    //         'Client Workflows',
    //         'Team Management',
    //         'White-labeling',
    //         'Advanced Analytics',
    //         'OnlyFans Studio'
    //     ],
    //     isRecommended: false
    // },
];

export const Pricing: React.FC<PricingProps> = ({ onGetStartedClick, onNavigateRequest, onBack, backLabel }) => {
    const { user, openPaymentModal, setActivePage, isAuthenticated, pricingView, setPricingView, showToast, setUser, setSelectedPlan } = useAppContext();
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'annually'>('monthly');
    // Initialize view from context or userType, default to Creator
    const initialView = 'Creator';
    // Business view is hidden for now; keep type simple to avoid toggles.
    const [view, setView] = useState<'Creator'>(initialView);
    const [billingPortalLoading, setBillingPortalLoading] = useState(false);
    
    // Handle Stripe success/cancel redirects
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const success = urlParams.get('success');
        const canceled = urlParams.get('canceled');
        const sessionId = urlParams.get('session_id');

        if (success === 'true' && sessionId) {
            showToast('Payment successful! Your subscription is being activated...', 'success');
            // Webhook will update the plan, but we can refresh user data
            setTimeout(() => {
                if (user) {
                    // Refresh user data to get updated plan
                    window.location.reload();
                }
            }, 2000);
            // Clean URL
            window.history.replaceState({}, '', window.location.pathname);
        } else if (canceled === 'true') {
            showToast('Payment canceled. You can try again anytime.', 'info');
            // If user has no plan (payment was canceled), redirect to plan selection
            if (user && !user.plan) {
                // User account exists but no plan - redirect to plan selector
                setTimeout(() => {
                    // Show plan selector modal or redirect to signup
                    if (setActivePage) {
                        setActivePage('pricing');
                    }
                }, 1000);
            }
            // Clean URL
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, [user, showToast]);
    
    // Update view when pricingView changes (e.g., from Settings)
    useEffect(() => {
        if (pricingView) {
            setView('Creator');
            // Clear pricingView after using it
            setPricingView(null);
        } else if (user?.userType) {
            // Fallback to userType if no pricingView is set
            setView('Creator');
        }
    }, [pricingView, user?.userType, setPricingView]);
    
    const currentPlan = user?.plan;
    // Show only the three focused creator plans in the UI
    const visibleTierNames: Array<string> = ['Pro', 'Elite'];
    const pricingTiers = creatorTiers.filter((tier) => visibleTierNames.includes(tier.name));

    const inAppPricing = isAuthenticated && !onNavigateRequest;
    const showBack = Boolean(onBack);
    const backLabelText = backLabel ?? 'Back';
    const showBillingPortal = inAppPricing && canOpenCreatorBillingPortal(user);
    const trialAlreadyUsed = hasUsedEchoFluxFreeTrial(user);
    const showTrialOffer = !trialAlreadyUsed;

    const handleOpenBillingPortal = async () => {
        setBillingPortalLoading(true);
        try {
            await openCreatorBillingPortal({ returnUrl: `${window.location.origin}/profile` });
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Could not open billing portal', 'error');
            setBillingPortalLoading(false);
        }
    };

    return (
        <div id="pricing" className={`bg-gray-100 dark:bg-gray-800 ${inAppPricing ? 'py-8' : 'py-24'}`}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {showBack && onBack && (
                    <div className="mb-6">
                        <button
                            type="button"
                            onClick={onBack}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                        >
                            <ChevronLeftIcon />
                            {backLabelText}
                        </button>
                    </div>
                )}
                <div className="text-center">
                    <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl">
                        Simple, Transparent Pricing
                    </h2>
                    <p className="mt-4 text-lg text-gray-500 dark:text-gray-400">
                        {showTrialOffer ? (
                            <>
                                Start with a one-time 7-day free trial on Pro or Elite. Your fan-facing link is on witme.io;
                                billing is through EchoFlux. No charge until the trial ends. Cancel anytime.
                            </>
                        ) : (
                            <>
                                Choose Pro or Elite to subscribe. Your fan-facing link is on witme.io; billing is through
                                EchoFlux. Cancel anytime.
                            </>
                        )}
                    </p>
                    {showBillingPortal && (
                        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                            Need to update your card or view invoices?{' '}
                            <button
                                type="button"
                                onClick={() => void handleOpenBillingPortal()}
                                disabled={billingPortalLoading}
                                className="font-medium text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50"
                            >
                                {billingPortalLoading ? 'Opening Stripe…' : 'Open Stripe billing portal'}
                            </button>
                        </p>
                    )}
                </div>

                <div className="mt-8 flex flex-col items-center gap-4">
                    <div className="flex justify-center items-center space-x-4">
                        <span className={`font-medium ${billingCycle === 'monthly' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'}`}>Monthly</span>
                        <button 
                            onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'annually' : 'monthly')} 
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${billingCycle === 'annually' ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${billingCycle === 'annually' ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                        <span className={`font-medium ${billingCycle === 'annually' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'}`}>
                            Annually <span className="text-sm text-green-500 font-semibold">(Save 20%)</span>
                        </span>
                    </div>
                </div>

                <div className="mt-10 grid gap-6 grid-cols-1 md:grid-cols-2 max-w-5xl mx-auto justify-items-center">
                    {pricingTiers.map((tier) => {
                        const userTierRank = echoFluxPricingTierRank(currentPlan);
                        const tierRank = tier.name === 'Elite' ? 2 : 1;
                        const hasActiveSub = user ? hasActiveEchoFluxSubscription(user) : false;
                        const isCurrentPlan =
                            hasActiveSub && isActiveEchoFluxPricingTier(currentPlan, tier.name);
                        const isUpgrade =
                            hasActiveSub && userTierRank > 0 && tierRank > userTierRank;
                        const price = billingCycle === 'monthly' ? tier.priceMonthly : tier.priceAnnually;
                        const annualTotal =
                          billingCycle === 'annually' && tier.priceMonthly > 0
                            ? echofluxAnnualTotalUsd(tier.priceMonthly)
                            : null;
                        const priceLabel =
                          price % 1 === 0 ? String(price) : price.toFixed(2);
                        
                        const handleButtonClick = () => {
                            if (isCurrentPlan) return;
                            if (!isAuthenticated && onGetStartedClick) {
                                // When clicking a plan on landing page, store selected plan and open signup modal
                                setSelectedPlan(tier.name as Plan);
                                onGetStartedClick();
                                return;
                            }
                            if(isAuthenticated) {
                                openPaymentModal({ name: tier.name, price, cycle: billingCycle });
                            }
                        };
                        
                        const tierTrialEligible =
                            !isCurrentPlan && !isUpgrade && isEligibleForEchoFluxCheckoutTrial(user, tier.name);
                        let buttonText = tierTrialEligible ? 'Start 7-Day Trial' : 'Subscribe Now';
                        if (isCurrentPlan) buttonText = 'Current Plan';
                        else if (isUpgrade) buttonText = 'Upgrade Now';

                        return (
                            <div key={tier.name} className={`relative flex flex-col p-6 rounded-2xl shadow-lg transition-transform hover:-translate-y-1 ${tier.isRecommended ? 'bg-white dark:bg-gray-800 ring-2 ring-primary-500' : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700'}`}>
                                {tier.isRecommended && !isCurrentPlan && (
                                    <div className="absolute top-0 -translate-y-1/2 w-full flex justify-center left-0 z-10">
                                        <span className="px-4 py-1 text-xs font-semibold tracking-wider text-white uppercase bg-primary-500 rounded-full shadow-sm">Most Popular</span>
                                    </div>
                                )}
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-4">{(tier as any).displayName || tier.name}</h3>
                                <div className="mt-2 min-h-[52px] space-y-1">
                                  <p className="text-sm text-gray-500 dark:text-gray-400">{tier.description}</p>
                                  {tierTrialEligible ? (
                                    <p className="text-sm font-semibold text-primary-600 dark:text-primary-300">
                                      One-time 7-day free trial • Cancel anytime
                                    </p>
                                  ) : !isCurrentPlan ? (
                                    <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                                      {trialAlreadyUsed
                                        ? 'Free trial already used — billed when you subscribe'
                                        : 'Billed when you subscribe • Cancel anytime'}
                                    </p>
                                  ) : null}
                                </div>
                                <div className="mt-4">
                                    <>
                                        <span className="text-4xl font-extrabold text-gray-900 dark:text-white">${priceLabel}</span>
                                        <span className="text-base font-medium text-gray-500 dark:text-gray-400">/{billingCycle === 'monthly' ? 'mo' : 'mo'}</span>
                                    </>
                                    {billingCycle === 'annually' && annualTotal != null && (
                                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Billed annually (${annualTotal.toFixed(2)}/year)
                                      </div>
                                    )}
                                </div>
                                <ul className="mt-6 space-y-4 flex-1">
                                    {tier.features.map((feature) => (
                                        <li key={feature} className="flex items-start">
                                            <div className="flex-shrink-0 text-primary-500 mt-0.5">
                                                <div className="w-5 h-5">
                                                    <CheckIcon />
                                                </div>
                                            </div>
                                            <p className="ml-3 text-sm text-gray-600 dark:text-gray-300">{feature}</p>
                                        </li>
                                    ))}
                                </ul>
                                <button
                                    onClick={handleButtonClick}
                                    disabled={isCurrentPlan}
                                    className={`mt-8 block w-full py-3 px-6 border border-transparent rounded-md text-center font-medium transition-colors ${ 
                                        isCurrentPlan 
                                            ? 'bg-gray-100 text-gray-400 cursor-default dark:bg-gray-700 dark:text-gray-500' 
                                            : tier.isRecommended 
                                                    ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-md' 
                                                    : 'bg-primary-50 text-primary-700 hover:bg-primary-100 dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-900/50'
                                    }`}
                                >
                                    {buttonText}
                                </button>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    );
};