import React, { useState } from 'react';
import { useAppContext } from './AppContext';
import { Plan, UserType } from '../types';
import { CheckIcon } from './icons/UIIcons';

interface PlanSelectorModalProps {
    userType: UserType;
    onSelect: (plan: Plan) => void;
}

const creatorPlans = [
    { 
        name: 'Free' as Plan, 
        price: 0, 
        description: 'Perfect for getting started',
        features: ['1 Social Account', '50 AI Replies / month', 'Basic Link-in-Bio', '100 MB Storage', 'Basic Analytics'],
        isRecommended: false
    },
    { 
        name: 'Pro' as Plan, 
        price: 29, 
        description: 'For creators scaling their brand',
        features: ['3 Social Accounts', '250 AI Replies / month', 'AI Content Strategist', 'Quick Post Automation', 'Media Library', '1 GB Storage', 'Advanced Analytics'],
        isRecommended: true
    },
    { 
        name: 'Elite' as Plan, 
        price: 149, 
        description: 'For professional creators',
        features: ['5 Social Accounts', '750 AI Replies / month', 'Advanced CRM', 'Quick Post Automation', 'Media Library', '2 GB Storage', 'Social Listening', 'Competitor Analysis'],
        isRecommended: false
    },
];

const businessPlans = [
    { 
        name: 'Starter' as Plan, 
        price: 99, 
        description: 'For small businesses & startups',
        features: ['3 Social Accounts', '500 AI Replies / month', 'AI Content Strategist', 'Quick Post Automation', 'Media Library', '1 GB Storage', 'Business Analytics', 'Social CRM & Lead Gen'],
        isRecommended: false
    },
    { 
        name: 'Growth' as Plan, 
        price: 199, 
        description: 'For growing businesses',
        features: ['5 Social Accounts', '1,500 AI Replies / month', 'AI Content Strategist', 'Quick Post Automation', 'Media Library', '3 GB Storage', 'Marketing Campaign Ideas', 'Competitor Analysis', 'Social Listening'],
        isRecommended: true
    },
];

export const PlanSelectorModal: React.FC<PlanSelectorModalProps> = ({ userType, onSelect }) => {
    const { user, setUser } = useAppContext();
    const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const plans = userType === 'Business' ? businessPlans : creatorPlans;

    const handleContinue = async () => {
        if (!selectedPlan || !user) return;
        
        setIsLoading(true);
        try {
            // Update user plan in Firestore
            await setUser({ ...user, plan: selectedPlan });
            onSelect(selectedPlan);
        } catch (error) {
            console.error('Failed to save plan:', error);
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
                        Select the {userType === 'Business' ? 'business' : 'creator'} plan that fits your needs.
                    </p>
                </div>

                <div className={`grid gap-6 ${
                    userType === 'Business' 
                        ? 'grid-cols-1 sm:grid-cols-2' 
                        : 'grid-cols-1 sm:grid-cols-3'
                }`}>
                    {plans.map((plan) => {
                        const isSelected = selectedPlan === plan.name;
                        return (
                            <button
                                key={plan.name}
                                onClick={() => setSelectedPlan(plan.name)}
                                className={`relative p-6 border-2 rounded-xl text-left transition-all ${
                                    isSelected
                                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 ring-2 ring-primary-500'
                                        : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700'
                                }`}
                            >
                                {plan.isRecommended && (
                                    <div className="absolute top-0 right-0 bg-primary-600 text-white text-xs font-semibold px-3 py-1 rounded-bl-lg rounded-tr-xl">
                                        Recommended
                                    </div>
                                )}
                                
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                        {plan.name}
                                    </h3>
                                    {isSelected && (
                                        <CheckIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                                    )}
                                </div>
                                
                                <div className="mb-3">
                                    <span className="text-3xl font-bold text-gray-900 dark:text-white">
                                        ${plan.price}
                                    </span>
                                    <span className="text-gray-500 dark:text-gray-400 text-sm ml-1">
                                        /month
                                    </span>
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

                <div className="mt-8 flex justify-end">
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





