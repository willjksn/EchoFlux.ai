
import React, { useState } from 'react';
import { useAppContext } from './AppContext';

interface BusinessOnboardingModalProps {
    onComplete: () => void;
}

export const BusinessOnboardingModal: React.FC<BusinessOnboardingModalProps> = ({ onComplete }) => {
    const { user, setUser } = useAppContext();
    const [step, setStep] = useState(1);
    const [businessName, setBusinessName] = useState(user?.businessName || '');
    const [businessType, setBusinessType] = useState(user?.businessType || '');
    const [businessGoal, setBusinessGoal] = useState(user?.businessGoal || '');

    const handleSaveAndComplete = async () => {
        if (user) {
            await setUser({ ...user, businessName, businessType, businessGoal, hasCompletedOnboarding: true });
        }
        onComplete();
    };

    const handleNext = () => {
        if (step < 3) {
            setStep(prev => prev + 1);
        } else {
            handleSaveAndComplete();
        }
    };

    const renderStepContent = () => {
        switch (step) {
            case 1:
                return (
                    <div className="animate-fade-in">
                        <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white">Welcome! Let's set up your Business Workspace.</h2>
                        <p className="mt-2 text-center text-gray-500 dark:text-gray-400">First, tell us about your business.</p>
                        <div className="mt-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Name</label>
                                <input
                                    type="text"
                                    value={businessName}
                                    onChange={(e) => setBusinessName(e.target.value)}
                                    placeholder="e.g., The Corner Cafe"
                                    className="mt-1 w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-primary-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Type / Industry</label>
                                <input
                                    type="text"
                                    value={businessType}
                                    onChange={(e) => setBusinessType(e.target.value)}
                                    placeholder="e.g., Restaurant, E-commerce, Real Estate"
                                    className="mt-1 w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-primary-500"
                                />
                            </div>
                        </div>
                    </div>
                );
            case 2:
                return (
                     <div className="animate-fade-in">
                        <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white">What is your primary marketing goal?</h2>
                        <p className="mt-2 text-center text-gray-500 dark:text-gray-400">This will help the AI tailor its strategies and content for you.</p>
                        <div className="mt-6 space-y-3">
                            {['Drive Website Sales', 'Increase Foot Traffic', 'Generate Leads', 'Build Brand Awareness'].map(goal => (
                                <button
                                    key={goal}
                                    onClick={() => setBusinessGoal(goal)}
                                    className={`w-full p-4 border-2 rounded-lg text-left font-semibold transition-all ${businessGoal === goal ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 ring-1 ring-primary-500' : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                                >
                                    {goal}
                                </button>
                            ))}
                        </div>
                    </div>
                );
            default:
                return (
                     <div className="text-center animate-fade-in">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">You're Ready to Go!</h2>
                        <p className="mt-2 text-gray-500 dark:text-gray-400">Click below to start a quick tour of your new Business Command Center.</p>
                    </div>
                );
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm" aria-modal="true">
            <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full m-4 p-8 flex flex-col justify-between min-h-[450px]">
                <div>{renderStepContent()}</div>
                <div className="mt-8 flex justify-between items-center">
                     <span className="text-sm text-gray-400">Step {step}/3</span>
                    <button
                        onClick={handleNext}
                        disabled={(step === 1 && (!businessName || !businessType)) || (step === 2 && !businessGoal)}
                        className="px-6 py-2 bg-primary-600 text-white font-semibold rounded-md hover:bg-primary-700 disabled:opacity-50 transition-colors"
                    >
                        {step === 3 ? "Start Tour" : "Next"}
                    </button>
                </div>
            </div>
        </div>
    );
};