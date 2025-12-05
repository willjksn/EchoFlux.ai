import React, { useState, useEffect } from 'react';
import { CheckIcon } from './icons/UIIcons';
import { useAppContext } from './AppContext';
import { Page } from '../types';

interface PricingProps {
    onGetStartedClick?: () => void;
    onNavigateRequest?: (page: Page) => void;
}

const creatorTiers = [
    { name: 'Free', priceMonthly: 0, priceAnnually: 0, description: 'For individuals starting out.', features: ['1 Social Account', '50 AI Replies / month', 'Basic Link-in-Bio', '100 MB Storage', 'Basic Analytics'], isRecommended: false },
    { name: 'Pro', priceMonthly: 29, priceAnnually: 23, description: 'For creators scaling their brand.', features: ['3 Social Accounts', '250 AI Replies / month', 'AI Content Strategist', 'Quick Post Automation', 'Media Library', '1 GB Storage', 'Advanced Analytics'], isRecommended: true },
    { name: 'Elite', priceMonthly: 149, priceAnnually: 119, description: 'For professional creators.', features: ['5 Social Accounts', '750 AI Replies / month', 'Advanced CRM', 'Quick Post Automation', 'Media Library', '2 GB Storage', 'Social Listening', 'Competitor Analysis'], isRecommended: false },
    { name: 'Agency', priceMonthly: 0, priceAnnually: 0, description: 'For agencies managing clients.', features: ['Unlimited Accounts', '2,000 AI Replies / month', 'AI Content Strategist', 'Quick Post Automation', 'Media Library', '5 GB Storage', 'Client Workflows', 'Team Management', 'White-labeling', 'Advanced Analytics'], isRecommended: false },
];

const businessTiers = [
    { name: 'Starter', priceMonthly: 99, priceAnnually: 79, description: 'For small businesses & startups.', features: ['3 Social Accounts', '500 AI Replies / month', 'AI Content Strategist', 'Quick Post Automation', 'Media Library', '1 GB Storage', 'Business Analytics', 'Social CRM & Lead Gen'], isRecommended: false },
    { name: 'Growth', priceMonthly: 199, priceAnnually: 159, description: 'For growing businesses.', features: ['5 Social Accounts', '1,500 AI Replies / month', 'AI Content Strategist', 'Quick Post Automation', 'Media Library', '3 GB Storage', 'Marketing Campaign Ideas', 'Competitor Analysis', 'Social Listening'], isRecommended: true },
];


export const Pricing: React.FC<PricingProps> = ({ onGetStartedClick, onNavigateRequest }) => {
    const { user, openPaymentModal, setActivePage, isAuthenticated, pricingView, setPricingView, showToast } = useAppContext();
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'annually'>('monthly');
    const [promoCode, setPromoCode] = useState('');
    // Initialize view from context or userType, default to Creator
    const initialView = pricingView || (user?.userType === 'Business' ? 'Business' : 'Creator');
    const [view, setView] = useState<'Creator' | 'Business'>(initialView);
    
    // Update view when pricingView changes (e.g., from Settings)
    useEffect(() => {
        if (pricingView) {
            setView(pricingView);
            // Clear pricingView after using it
            setPricingView(null);
        } else if (user?.userType) {
            // Fallback to userType if no pricingView is set
            setView(user.userType === 'Business' ? 'Business' : 'Creator');
        }
    }, [pricingView, user?.userType, setPricingView]);
    
    const currentPlan = user?.plan;
    const pricingTiers = view === 'Creator' ? creatorTiers : businessTiers;

    return (
        <div id="pricing" className="bg-gray-100 dark:bg-gray-800 py-24">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center">
                    <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl">
                        Choose the plan that's right for you
                    </h2>
                    <p className="mt-4 text-lg text-gray-500 dark:text-gray-400">
                        Whether you're building a personal brand or scaling a business, we have a plan for you.
                    </p>
                </div>

                <div className="mt-8 flex justify-center">
                    <div className="p-1 bg-gray-200 dark:bg-gray-700 rounded-lg flex gap-1">
                        <button 
                            onClick={() => setView('Creator')} 
                            className={`px-6 py-2 text-sm font-bold rounded-md transition-all ${
                                view === 'Creator' 
                                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' 
                                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                            }`}
                        >
                            For Creators
                        </button>
                        <button 
                            onClick={() => setView('Business')} 
                            className={`px-6 py-2 text-sm font-bold rounded-md transition-all ${
                                view === 'Business' 
                                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' 
                                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                            }`}
                        >
                            For Business
                        </button>
                    </div>
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
                    {isAuthenticated && (
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={promoCode}
                                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                                placeholder="Enter promotion code"
                                className="px-4 py-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            />
                            <button
                                onClick={() => {
                                    if (!promoCode.trim()) {
                                        showToast('Please enter a promotion code', 'error');
                                        return;
                                    }
                                    showToast('Promotion code will be applied at checkout', 'success');
                                }}
                                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
                            >
                                Apply
                            </button>
                        </div>
                    )}
                </div>

                <div className={`mt-10 grid gap-8 ${
                    view === 'Creator' 
                        ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' 
                        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 max-w-4xl mx-auto'
                }`}>
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
                            <div key={tier.name} className={`relative flex flex-col p-8 rounded-2xl shadow-lg transition-transform hover:-translate-y-1 ${tier.isRecommended ? 'bg-white dark:bg-gray-800 ring-2 ring-primary-500' : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700'}`}>
                                {tier.isRecommended && !isCurrentPlan && (
                                    <div className="absolute top-0 -translate-y-1/2 w-full flex justify-center left-0">
                                        <span className="px-4 py-1 text-xs font-semibold tracking-wider text-white uppercase bg-primary-500 rounded-full shadow-sm">Most Popular</span>
                                    </div>
                                )}
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">{tier.name}</h3>
                                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 h-10">{tier.description}</p>
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