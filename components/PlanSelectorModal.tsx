import React, { useState } from 'react';
import { useAppContext } from './AppContext';
import { Plan, UserType } from '../types';
import { CheckIcon } from './icons/UIIcons';
import { createAccountFromPendingSignup } from '../src/utils/createAccountFromPendingSignup';

interface PlanSelectorModalProps {
    userType?: UserType; // Optional now since new users don't have userType yet
    onSelect: (plan: Plan) => void;
    onCancel?: () => void; // Optional cancel handler
}

const creatorPlans = [
    { 
        name: 'Free' as Plan, 
        priceMonthly: 0,
        priceAnnually: 0,
        description: 'Perfect for getting started',
        features: [
            '1 AI strategy generation / month (basic)',
            '10 AI captions / month',
            'Basic Link-in-Bio (1 link)',
            'Media Library',
            '100 MB storage'
        ],
        isRecommended: false
    },
    { 
        name: 'Pro' as Plan, 
        priceMonthly: 29,
        priceAnnually: 23,
        description: 'For creators scaling their brand',
        features: [
            'AI Content Strategist',
            '2 AI strategy generations / month',
            'Live trend research included (16 searches/month)',
            '500 AI captions / month',
            'Link-in-Bio Builder (5 links)',
            'Media Library',
            'Visual Content Calendar',
            '5 GB storage'
        ],
        isRecommended: true
    },
    { 
        name: 'Elite' as Plan, 
        priceMonthly: 59,
        priceAnnually: 47,
        description: 'For professional & OF creators',
        features: [
            'Advanced Strategy options',
            '5 AI strategy generations / month',
            'Enhanced live trend research (40 searches/month)',
            '1,500 AI captions / month',
            'Link-in-Bio Builder (unlimited links)',
            'Media Library',
            'Visual Content Calendar',
            '10 GB storage',
            'OnlyFans Studio (included)'
        ],
        isRecommended: false
    },
];

export const PlanSelectorModal: React.FC<PlanSelectorModalProps> = ({ userType, onSelect, onCancel }) => {
    // Default to Creator if no userType (new signups)
    const effectiveUserType = userType || 'Creator';
    const { user, setUser, openPaymentModal, showToast } = useAppContext();
    // Pre-select current plan if user already has one (e.g., Free from auto-assignment)
    const [selectedPlan, setSelectedPlan] = useState<Plan | null>(user?.plan === 'Free' ? 'Free' : null);
    const [isLoading, setIsLoading] = useState(false);
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'annually'>('monthly');

    // Creator-focused: always show creator plans
    const plans = creatorPlans;

    const handleContinue = async () => {
        if (!selectedPlan) return;
        
        setIsLoading(true);
        
        try {
            // Check if there's a pending signup (user not yet created)
            const pendingSignup = localStorage.getItem('pendingSignup');
            
            if (pendingSignup) {
                // User hasn't created account yet - create it now
                const result = await createAccountFromPendingSignup();
                
                if (!result.success) {
                    showToast(result.error || 'Failed to create account. Please try again.', 'error');
                    setIsLoading(false);
                    return;
                }
                
                // Wait a moment for auth state to update and user document to be created
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                // For Free plan, we need to wait for user to be available, then set plan
                if (selectedPlan === 'Free') {
                    // Reload to get the new user object, then set plan
                    // The AuthContext will create the user document, then we can update it
                    window.location.reload();
                    return;
                } else {
                    // For paid plans, open payment modal
                    // User should be authenticated now, so payment modal can proceed
                    const planData = plans.find(p => p.name === selectedPlan);
                    if (planData && openPaymentModal) {
                        const price = billingCycle === 'annually' ? planData.priceAnnually : planData.priceMonthly;
                        openPaymentModal({ 
                            name: selectedPlan, 
                            price: price,
                            cycle: billingCycle
                        });
                        // Close plan selector modal
                        onSelect(selectedPlan);
                    }
                }
                return;
            } else if (user) {
                // User already exists - just update plan
                if (selectedPlan === 'Free') {
                    await setUser({ ...user, plan: selectedPlan });
                    onSelect(selectedPlan);
                } else {
                    // For paid plans, open payment modal
                    const planData = plans.find(p => p.name === selectedPlan);
                    if (planData && openPaymentModal) {
                        const price = billingCycle === 'annually' ? planData.priceAnnually : planData.priceMonthly;
                        openPaymentModal({ 
                            name: selectedPlan, 
                            price: price,
                            cycle: billingCycle
                        });
                    }
                }
            } else {
                showToast('Please sign up first.', 'error');
            }
        } catch (error) {
            console.error('Failed to process plan selection:', error);
            showToast('Failed to process plan selection. Please try again.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm" aria-modal="true">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-4xl w-full m-4 p-8 animate-fade-in-up max-h-[90vh] overflow-y-auto">
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                        Choose Your Plan
                    </h2>
                    <p className="mt-2 text-gray-500 dark:text-gray-400">
                        Select the creator plan that fits your needs.
                    </p>
                </div>

                {/* Billing Cycle Toggle */}
                <div className="flex justify-center items-center space-x-4 mb-6">
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


                <div className="grid gap-6 grid-cols-1 sm:grid-cols-3">
                    {plans.map((plan) => {
                        const isSelected = selectedPlan === plan.name;
                        return (
                            <button
                                key={plan.name}
                                onClick={() => setSelectedPlan(plan.name)}
                                className={`relative p-6 border-2 rounded-xl text-left transition-all flex flex-col ${
                                    isSelected
                                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 ring-2 ring-primary-500'
                                        : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700'
                                }`}
                            >
                                {plan.isRecommended && (
                                    <div className="absolute top-0 right-0 bg-primary-600 text-white text-xs font-semibold px-3 py-1 rounded-bl-lg rounded-tr-xl z-10">
                                        Recommended
                                    </div>
                                )}
                                
                                <div className="flex items-center justify-between mb-2 mt-4">
                                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                        {plan.name}
                                    </h3>
                                    {isSelected && (
                                        <CheckIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                                    )}
                                </div>
                                
                                <div className="mb-3">
                                    <span className="text-3xl font-bold text-gray-900 dark:text-white">
                                        ${billingCycle === 'annually' ? plan.priceAnnually : plan.priceMonthly}
                                    </span>
                                    <span className="text-gray-500 dark:text-gray-400 text-sm ml-1">
                                        /{billingCycle === 'annually' ? 'mo' : 'mo'}
                                    </span>
                                    {billingCycle === 'annually' && plan.priceAnnually > 0 && (
                                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                            Billed annually (${Math.round(plan.priceAnnually * 12)}/year)
                                        </div>
                                    )}
                                </div>
                                
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                                    {plan.description}
                                </p>
                                
                                <ul className="space-y-2">
                                    {plan.features.map((feature, idx) => (
                                        <li key={idx} className="flex items-start text-sm text-gray-700 dark:text-gray-300">
                                            <CheckIcon className="w-4 h-4 text-primary-600 dark:text-primary-400 mr-2 mt-0.5 flex-shrink-0" />
                                            <span>{feature}</span>
                                        </li>
                                    ))}
                                </ul>
                            </button>
                        );
                    })}
                </div>

                <div className="mt-8 flex justify-end gap-3">
                    {onCancel && (
                        <button
                            onClick={onCancel}
                            disabled={isLoading}
                            className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Cancel
                        </button>
                    )}
                    <button
                        onClick={handleContinue}
                        disabled={!selectedPlan || isLoading}
                        className="px-6 py-3 bg-primary-600 text-white font-semibold rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isLoading ? 'Saving...' : 'Continue'}
                    </button>
                </div>
            </div>
        </div>
    );
};






