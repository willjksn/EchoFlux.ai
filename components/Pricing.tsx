
import React, { useState } from 'react';
import { CheckIcon, ImageIcon, VideoIcon } from './icons/UIIcons';
import { useAppContext } from './AppContext';
import { Page } from '../types';

interface PricingProps {
    onGetStartedClick?: () => void;
    onNavigateRequest?: (page: Page) => void;
}

const pricingTiers = [
    {
        name: 'Free',
        priceMonthly: 0,
        priceAnnually: 0,
        description: 'For individuals starting out.',
        features: [
            '1 Social Account',
            '50 AI Replies / month',
            'Basic Link-in-Bio Page',
            '100 MB Media Storage',
            'Manual Inbox Management',
        ],
        isRecommended: false,
    },
    {
        name: 'Pro',
        priceMonthly: 49,
        priceAnnually: 39,
        description: 'For creators and small brands.',
        features: [
            '3 Social Accounts',
            '500 AI Replies / month',
            'AI Content Strategist',
            'Link-in-Bio + Email Capture',
            'Visual Content Calendar',
            'Basic Content Remixing',
            'Engagement Analytics',
            '50 AI Image Generations / month',
            '1 AI Video Generation / month',
        ],
        isRecommended: true,
    },
    {
        name: 'Elite',
        priceMonthly: 199,
        priceAnnually: 159,
        description: 'For power users and growing businesses.',
        features: [
            '5 Social Accounts',
            '1,500 AI Replies / month',
            'AI Content Strategist',
            'Advanced CRM & Lead Gen',
            'Competitor Analysis (3 profiles)',
            'Advanced Remixing Engine',
            '500 AI Image Generations / month',
            '25 AI Video Generations / month',
            'Director Mode (Multi-Scene Video)',
            '3 Custom Voice Clones',
        ],
        isRecommended: false,
    },
    {
        name: 'Agency',
        priceMonthly: 599,
        priceAnnually: 479,
        description: 'For agencies and large teams with custom needs.',
        features: [
            '10+ Social Accounts',
            'Unlimited AI Replies',
            'AI Content Strategist',
            'Client Approval Workflows',
            'Advanced Social Listening',
            'Unlimited Competitor Analysis',
            'Unlimited* AI Image Generations',
            '50 AI Video Generations / month',
            'Director Mode (Multi-Scene Video)',
            'Team Management',
        ],
        isRecommended: false,
    },
];

export const Pricing: React.FC<PricingProps> = ({ onGetStartedClick, onNavigateRequest }) => {
    const { user, openPaymentModal, setActivePage, isAuthenticated } = useAppContext();
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'annually'>('monthly');
    const currentPlan = user?.plan;

    return (
        <div id="pricing" className="bg-gray-100 dark:bg-gray-800 py-24">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center">
                    <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl">
                        Choose the plan that's right for you
                    </h2>
                </div>

                <div className="mt-12 flex justify-center items-center space-x-4">
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

                <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
                    {pricingTiers.map((tier) => {
                        const isCurrentPlan = currentPlan === tier.name;
                        const isAgency = tier.name === 'Agency';
                        const price = billingCycle === 'monthly' ? tier.priceMonthly : tier.priceAnnually;

                        const handleButtonClick = () => {
                            if (isCurrentPlan) return;

                            if (isAgency) {
                                if (isAuthenticated) {
                                    setActivePage('contact');
                                } else if (onNavigateRequest) {
                                    onNavigateRequest('contact');
                                }
                                return;
                            }
                            
                            if (tier.priceMonthly === 0 && onGetStartedClick) {
                                onGetStartedClick();
                            } else {
                                openPaymentModal({ name: tier.name, price, cycle: billingCycle });
                            }
                        };
                        
                        let buttonText = 'Choose Plan';
                        if (onGetStartedClick && tier.priceMonthly === 0) buttonText = 'Start for free';
                        if (isCurrentPlan) buttonText = 'Current Plan';
                        if (isAgency) buttonText = 'Contact Sales';


                        return (
                            <div key={tier.name} className={`relative flex flex-col p-8 rounded-2xl shadow-lg ${tier.isRecommended ? 'bg-white dark:bg-gray-800 ring-2 ring-primary-500' : 'bg-white dark:bg-gray-800'}`}>
                                {tier.isRecommended && !isCurrentPlan && (
                                    <div className="absolute top-0 -translate-y-1/2 w-full flex justify-center">
                                        <span className="px-4 py-1 text-xs font-semibold tracking-wider text-white uppercase bg-primary-500 rounded-full">Most Popular</span>
                                    </div>
                                )}
                                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{tier.name}</h3>
                                <p className="mt-4 text-gray-500 dark:text-gray-400 h-10">{tier.description}</p>
                                <div className="mt-6">
                                    {isAgency ? (
                                        <>
                                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Starting at</p>
                                            <span className="text-4xl font-extrabold text-gray-900 dark:text-white">
                                                ${price}
                                            </span>
                                        </>
                                    ) : (
                                        <span className="text-4xl font-extrabold text-gray-900 dark:text-white">
                                            ${price}
                                        </span>
                                    )}
                                    <span className="text-base font-medium text-gray-500 dark:text-gray-400">/mo</span>
                                </div>
                                <ul className="mt-6 space-y-4 flex-1">
                                    {tier.features.map((feature) => (
                                        <li key={feature} className="flex items-start">
                                            <div className="flex-shrink-0 text-primary-500">
                                                <CheckIcon />
                                            </div>
                                            <p className="ml-3 text-base text-gray-500 dark:text-gray-400">{feature}</p>
                                        </li>
                                    ))}
                                </ul>
                                <button
                                    onClick={handleButtonClick}
                                    disabled={isCurrentPlan}
                                    className={`mt-8 block w-full py-3 px-6 border border-transparent rounded-md text-center font-medium ${
                                        isCurrentPlan 
                                            ? 'bg-gray-200 text-gray-500 cursor-default dark:bg-gray-700 dark:text-gray-400'
                                            : isAgency
                                                ? 'bg-gray-800 text-white hover:bg-black dark:bg-gray-200 dark:text-gray-900 dark:hover:bg-white'
                                                : tier.isRecommended 
                                                    ? 'bg-primary-600 text-white hover:bg-primary-700' 
                                                    : 'bg-primary-100 text-primary-700 hover:bg-primary-200 dark:bg-primary-900/50 dark:text-primary-300 dark:hover:bg-primary-900'
                                    }`}
                                >
                                    {buttonText}
                                </button>
                            </div>
                        )
                    })}
                </div>

                {isAuthenticated && (
                    <>
                        <div className="mt-24 text-center">
                            <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl">
                                Need more generations?
                            </h2>
                            <p className="mt-4 text-lg text-gray-500 dark:text-gray-400">
                                Top up your account with a one-time purchase. Credits are used after your monthly plan allowance is depleted and do not expire.
                            </p>
                        </div>
                        <div className="mt-12 max-w-lg mx-auto grid gap-8 lg:grid-cols-2 lg:max-w-none">
                            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 flex flex-col">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3">
                                        <ImageIcon />
                                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Image Generation Pack</h3>
                                    </div>
                                    <p className="mt-4 text-gray-500 dark:text-gray-400">A one-time purchase to top up your image credits.</p>
                                    <div className="mt-6">
                                        <span className="text-4xl font-extrabold text-gray-900 dark:text-white">$19</span>
                                        <span className="text-base font-medium text-gray-500 dark:text-gray-400">/ one-time</span>
                                    </div>
                                    <p className="mt-6 font-medium text-gray-700 dark:text-gray-300">Includes:</p>
                                    <ul className="mt-2 space-y-2">
                                        <li className="flex items-start">
                                            <div className="flex-shrink-0 text-primary-500 mt-1"><CheckIcon /></div>
                                            <p className="ml-3 text-base text-gray-500 dark:text-gray-400">100 extra AI image generations</p>
                                        </li>
                                    </ul>
                                </div>
                                <button onClick={() => openPaymentModal({ name: 'Image Pack', price: 19, cycle: 'monthly' })} className="mt-8 block w-full py-3 px-6 border border-transparent rounded-md text-center font-medium bg-green-600 text-white hover:bg-green-700">
                                    Purchase Pack
                                </button>
                            </div>
                            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 flex flex-col">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3">
                                        <VideoIcon />
                                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Video Generation Pack</h3>
                                    </div>
                                    <p className="mt-4 text-gray-500 dark:text-gray-400">A one-time purchase to get more video credits.</p>
                                    <div className="mt-6">
                                        <span className="text-4xl font-extrabold text-gray-900 dark:text-white">$29</span>
                                        <span className="text-base font-medium text-gray-500 dark:text-gray-400">/ one-time</span>
                                    </div>
                                    <p className="mt-6 font-medium text-gray-700 dark:text-gray-300">Includes:</p>
                                    <ul className="mt-2 space-y-2">
                                        <li className="flex items-start">
                                            <div className="flex-shrink-0 text-primary-500 mt-1"><CheckIcon /></div>
                                            <p className="ml-3 text-base text-gray-500 dark:text-gray-400">5 extra AI video generations</p>
                                        </li>
                                    </ul>
                                </div>
                                <button onClick={() => openPaymentModal({ name: 'Video Pack', price: 29, cycle: 'monthly' })} className="mt-8 block w-full py-3 px-6 border border-transparent rounded-md text-center font-medium bg-green-600 text-white hover:bg-green-700">
                                    Purchase Pack
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
