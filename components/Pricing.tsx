import React, { useState, useEffect } from 'react';
import { CheckIcon } from './icons/UIIcons';
import { useAppContext } from './AppContext';
import { Page, Plan } from '../types';

interface PricingProps {
    onGetStartedClick?: () => void;
    onNavigateRequest?: (page: Page) => void;
}

// All available plans (hidden plans commented out for future use)
const allCreatorTiers = [
    {
        name: 'Free',
        priceMonthly: 0,
        priceAnnually: 0,
        description: 'For individuals testing the studio.',
        features: [
            '1 weekly plan (basic)',
            '10 caption ideas',
            'Fair-use AI limits & rate limits',
            'Bio Link Page (1 link)',
            'My Vault',
            '100 MB Storage'
        ],
        isRecommended: false
    },
    {
        name: 'Pro',
        priceMonthly: 29,
        priceAnnually: 23,
        description: 'For creators building their brand.',
        features: [
            'Plan My Week',
            '2 content strategies / month',
            'Live trend research',
            '500 caption ideas',
            'Fair-use AI limits & queued heavy tasks',
            'Bio Link Page (5 links)',
            'My Vault',
            'My Schedule',
            '5 GB Storage'
        ],
        isRecommended: false
    },
    {
        name: 'Elite',
        priceMonthly: 79,
        priceAnnually: 63,
        description: 'For monetized creators maximizing revenue.',
        features: [
            'Premium Content Studio (included)',
            'Advanced Plan My Week options',
            '5 content strategies / month',
            'Enhanced live trend research',
            '1,500 caption ideas',
            'Fair-use AI limits & priority queueing',
            'Bio Link Page (unlimited links)',
            'My Vault',
            'My Schedule',
            '10 GB Storage',
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

// Only show Pro and Elite plans (Free plan hidden - users can try with 7-day trial)
const creatorTiers = allCreatorTiers.filter(tier => ['Pro', 'Elite'].includes(tier.name));

export const Pricing: React.FC<PricingProps> = ({ onGetStartedClick, onNavigateRequest }) => {
    const { user, openPaymentModal, setActivePage, isAuthenticated, pricingView, setPricingView, showToast, setUser, setSelectedPlan } = useAppContext();
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'annually'>('monthly');
    // Initialize view from context or userType, default to Creator
    const initialView = 'Creator';
    // Business view is hidden for now; keep type simple to avoid toggles.
    const [view, setView] = useState<'Creator'>(initialView);
    
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

    return (
        <div id="pricing" className="bg-gray-100 dark:bg-gray-800 py-24">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center">
                    <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl">
                        Built for Monetized Creators
                    </h2>
                    <p className="mt-4 text-lg text-gray-500 dark:text-gray-400">
                        Start with a 7-day free trial of Pro or Elite. No charge until the trial ends. Cancel anytime. Elite includes Premium Content Studio for OnlyFans, Fansly & Fanvue creators.
                    </p>
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
                        const isCurrentPlan = currentPlan === tier.name;
                        const price = billingCycle === 'monthly' ? tier.priceMonthly : tier.priceAnnually;
                        const annualTotal = billingCycle === 'annually' ? (tier.priceAnnually * 12) : null;
                        
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
                        
                        let buttonText = 'Start 7-Day Trial';
                        if (isCurrentPlan) buttonText = 'Current Plan';

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
                                  <p className="text-sm font-semibold text-primary-600 dark:text-primary-300">
                                    Free 7-Day Trial • Cancel Anytime
                                  </p>
                                </div>
                                <div className="mt-4">
                                    <>
                                        <span className="text-4xl font-extrabold text-gray-900 dark:text-white">${price}</span>
                                        <span className="text-base font-medium text-gray-500 dark:text-gray-400">/{billingCycle === 'monthly' ? 'mo' : 'mo'}</span>
                                    </>
                                    {billingCycle === 'annually' && tier.priceAnnually > 0 && (
                                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Billed annually (${annualTotal?.toFixed(0)}/year)
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