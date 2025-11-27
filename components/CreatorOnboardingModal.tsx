import React, { useState } from 'react';
import { useAppContext } from './AppContext';
import { LogoIcon } from './icons/UIIcons';

interface CreatorOnboardingModalProps {
    onComplete: () => void;
}

export const CreatorOnboardingModal: React.FC<CreatorOnboardingModalProps> = ({ onComplete }) => {
    const { user, setUser } = useAppContext();
    const [step, setStep] = useState(1);
    const [niche, setNiche] = useState(user?.niche || '');
    const [audience, setAudience] = useState(user?.audience || '');

    const handleSaveAndComplete = async () => {
        if (user) {
            await setUser({ ...user, niche, audience, hasCompletedOnboarding: true });
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
                    <div className="text-center animate-fade-in">
                        <div className="flex justify-center items-center text-primary-600 dark:text-primary-400 mb-4">
                            <LogoIcon /> <span className="text-2xl font-bold ml-2">EngageSuite.ai</span>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Welcome, Creator!</h2>
                        <p className="mt-2 text-gray-500 dark:text-gray-400">Let's get your creative workspace set up in just a moment.</p>
                    </div>
                );
            case 2:
                return (
                    <div className="animate-fade-in">
                        <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white">Tell us about your content</h2>
                        <p className="mt-2 text-center text-gray-500 dark:text-gray-400">This helps our AI understand your brand and generate better ideas.</p>
                        <div className="mt-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">What is your primary content niche?</label>
                                <input
                                    type="text"
                                    value={niche}
                                    onChange={(e) => setNiche(e.target.value)}
                                    placeholder="e.g., Gaming, Fashion, Tech Reviews"
                                    className="mt-1 w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-primary-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Who is your target audience?</label>
                                <input
                                    type="text"
                                    value={audience}
                                    onChange={(e) => setAudience(e.target.value)}
                                    placeholder="e.g., College students, Young professionals"
                                    className="mt-1 w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-primary-500"
                                />
                            </div>
                        </div>
                    </div>
                );
            default:
                return (
                     <div className="text-center animate-fade-in">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">You're All Set!</h2>
                        <p className="mt-2 text-gray-500 dark:text-gray-400">Click below to start a quick tour of your new Creator dashboard.</p>
                    </div>
                );
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm" aria-modal="true">
            <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full m-4 p-8 flex flex-col justify-between min-h-[400px]">
                <div>{renderStepContent()}</div>
                <div className="mt-8 flex justify-between items-center">
                     <span className="text-sm text-gray-400">Step {step}/3</span>
                    <button
                        onClick={handleNext}
                        disabled={step === 2 && (!niche || !audience)}
                        className="px-6 py-2 bg-primary-600 text-white font-semibold rounded-md hover:bg-primary-700 transition-colors disabled:opacity-50"
                    >
                        {step === 3 ? "Start Tour" : "Next"}
                    </button>
                </div>
            </div>
        </div>
    );
};