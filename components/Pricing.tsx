import React, { useState, useEffect } from 'react';
import { CheckIcon } from './icons/UIIcons';
import { useAppContext } from './AppContext';
import { Page } from '../types';

interface PricingProps {
    onGetStartedClick?: () => void;
    onNavigateRequest?: (page: Page) => void;
}

const creatorTiers = [
    {
        name: 'Free',
        priceMonthly: 0,
        priceAnnually: 0,
        description: 'For individuals testing the studio.',
        features: [
            '1 active campaign',
            'Basic Strategy & Autopilot access',
            '25 AI captions / month',
            'Basic Link-in-Bio (1 link)',
            '100 MB Storage'
        ],
        isRecommended: false
    },
    {
        name: 'Caption',
        displayName: 'Caption Pro',
        priceMonthly: 9,
        priceAnnually: 7,
        description: 'Perfect for caption writing.',
        features: [
            '100 AI captions / month',
            'Trending hashtags (all platforms)',
            'Tone & goal customization',
            'AI Training',
            'Basic Link-in-Bio (1 link)'
        ],
        isRecommended: false
    },
    {
        name: 'OnlyFansStudio',
        displayName: 'OnlyFans Studio',
        priceMonthly: 24,
        priceAnnually: 19,
        description: 'AI content planning for premium creators.',
        features: [
            'OnlyFans Studio access',
            'OF-specific AI captions & prompts',
            'Content planning & calendars',
            'Roleplay & interactive ideas',
            'Media organization',
            'Export content packages',
            'Cross-platform teaser generator'
        ],
        isRecommended: false
    },
    {
        name: 'Pro',
        priceMonthly: 29,
        priceAnnually: 23,
        description: 'For creators scaling their brand.',
        features: [
            'Up to 3 active campaigns',
            'AI Content Strategist',
            'Autopilot content packs',
            '500 AI captions / month',
            'Media Library',
            'Visual Content Calendar',
            '5 GB Storage'
        ],
        isRecommended: true
    },
    {
        name: 'Elite',
        priceMonthly: 59,
        priceAnnually: 47,
        description: 'For professional & OF creators.',
        features: [
            'Unlimited active campaigns',
            'Advanced Strategy & Autopilot options',
            '1,500 AI captions / month',
            'Workflow board & approvals',
            'Media Library',
            '10 GB Storage',
            'OnlyFans Studio (included)'
        ],
        isRecommended: false
    },
    {
        name: 'Agency',
        priceMonthly: 299,
        priceAnnually: 239,
        description: 'For agencies managing clients.',
        features: [
            'Unlimited Accounts',
            '2,000 AI Replies / month',
            '10,000 AI Captions / month*',
            'AI Content Strategist',
            'Quick Post Automation',
            'Media Library',
            '5 GB Storage',
            'Client Workflows',
            'Team Management',
            'White-labeling',
            'Advanced Analytics',
            'OnlyFans Studio'
        ],
        isRecommended: false
    },
];

export const Pricing: React.FC<PricingProps> = ({ onGetStartedClick, onNavigateRequest }) => {
    const { user, openPaymentModal, setActivePage, isAuthenticated, pricingView, setPricingView, showToast } = useAppContext();
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'annually'>('monthly');
    const [promoCode, setPromoCode] = useState('');
    // Initialize view from context or userType, default to Creator
    const initialView = 'Creator';
    // Business view is hidden for now; keep type simple to avoid toggles.
    const [view, setView] = useState<'Creator'>(initialView);
    
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
    const visibleTierNames: Array<string> = ['Free', 'Pro', 'Elite'];
    const pricingTiers = creatorTiers.filter((tier) => visibleTierNames.includes(tier.name));

    return (
        <div id="pricing" className="bg-gray-100 dark:bg-gray-800 py-24">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center">
                    <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl">
                        Choose the plan that's right for you
                    </h2>
                    <p className="mt-4 text-lg text-gray-500 dark:text-gray-400">
                        Built for creators first. Upgrade when you’re ready.
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
                    {/* Promotion Code Input */}
                    <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
                        <input
                            type="text"
                            value={promoCode}
                            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                            placeholder="Enter promotion code"
                            className="w-full sm:w-auto px-4 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        />
                        <button
                            onClick={() => {
                                if (!promoCode.trim()) {
                                    showToast('Please enter a promotion code', 'error');
                                    return;
                                }
                                if (!isAuthenticated) {
                                    showToast('Please sign in to apply promotion code', 'error');
                                    return;
                                }
                                showToast('Promotion code will be applied at checkout', 'success');
                            }}
                            className="w-full sm:w-auto px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors whitespace-nowrap"
                        >
                            Apply
                        </button>
                    </div>
                </div>

                <div className="mt-10 grid gap-6 grid-cols-1 md:grid-cols-3 max-w-4xl mx-auto">
                    {pricingTiers.map((tier) => {
                        const isCurrentPlan = currentPlan === tier.name;
                        const isAgency = tier.name === 'Agency';
                        const price = billingCycle === 'monthly' ? tier.priceMonthly : tier.priceAnnually;
                        
                        const handleButtonClick = () => {
                            if (isCurrentPlan) return;
                            if (isAgency) {
                                if (isAuthenticated && setActivePage) setActivePage('contact');
                                else if (onNavigateRequest) onNavigateRequest('contact');
                                return;
                            }
                            if (!isAuthenticated && onGetStartedClick) {
                                onGetStartedClick();
                                return;
                            }
                            if(isAuthenticated) {
                                // Store promo code in localStorage if entered
                                if (promoCode) {
                                    localStorage.setItem('pendingPromoCode', promoCode);
                                }
                                openPaymentModal({ name: tier.name, price, cycle: billingCycle });
                            }
                        };
                        
                        let buttonText = 'Choose Plan';
                        if (!isAuthenticated && tier.priceMonthly === 0) buttonText = 'Start for free';
                        if (isCurrentPlan) buttonText = 'Current Plan';
                        if (isAgency) buttonText = 'Call for Quote';

                        return (
                            <div key={tier.name} className={`relative flex flex-col p-6 rounded-2xl shadow-lg transition-transform hover:-translate-y-1 ${tier.isRecommended ? 'bg-white dark:bg-gray-800 ring-2 ring-primary-500' : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700'}`}>
                                {tier.isRecommended && !isCurrentPlan && (
                                    <div className="absolute top-0 -translate-y-1/2 w-full flex justify-center left-0">
                                        <span className="px-4 py-1 text-xs font-semibold tracking-wider text-white uppercase bg-primary-500 rounded-full shadow-sm">Most Popular</span>
                                    </div>
                                )}
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">{(tier as any).displayName || tier.name}</h3>
                                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 h-10">{tier.description}</p>
                                {isAgency && (
                                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 italic">*10,000 captions/month included. Overage fees apply. See Terms for details.</p>
                                )}
                                <div className="mt-6">
                                    {isAgency ? (
                                        <span className="text-4xl font-extrabold text-gray-900 dark:text-white">Call for Quote</span>
                                    ) : (
                                        <>
                                            <span className="text-4xl font-extrabold text-gray-900 dark:text-white">${price}</span>
                                            <span className="text-base font-medium text-gray-500 dark:text-gray-400">/{billingCycle === 'monthly' ? 'mo' : 'yr'}</span>
                                        </>
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
                                            : isAgency 
                                                ? 'bg-gray-900 text-white hover:bg-black dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100' 
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