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
    const [goal, setGoal] = useState(user?.goal || '');
    
    // Determine plan-specific onboarding content
    const userPlan = user?.plan || 'Free';
    const isFreePlan = userPlan === 'Free';
    const isProPlan = userPlan === 'Pro';
    const isElitePlan = userPlan === 'Elite';
    
    // Plan-specific step counts
    const totalSteps = isFreePlan ? 6 : isProPlan ? 7 : 9; // Free: 6, Pro: 7, Elite: 9 (adds theme toggle + completion)

    const handleSaveAndComplete = async () => {
        if (user) {
            await setUser({ ...user, niche, audience, goal, hasCompletedOnboarding: true });
        }
        onComplete();
    };

    const handleNext = () => {
        if (step < totalSteps) {
            setStep(prev => prev + 1);
        } else {
            handleSaveAndComplete();
        }
    };

    const handleBack = () => {
        if (step > 1) {
            setStep(prev => prev - 1);
        }
    };

    const renderStepContent = () => {
        // Step 1: Welcome (all plans)
        if (step === 1) {
            return (
                <div className="text-center animate-fade-in">
                    <div className="flex justify-center items-center text-primary-600 dark:text-primary-400 mb-4">
                        <LogoIcon /> <span className="text-2xl font-bold ml-2">EchoFlux.ai</span>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                        Welcome to {userPlan} Plan!
                    </h2>
                    <p className="mt-2 text-gray-500 dark:text-gray-400">
                        {isFreePlan && "Let's get you started with the essentials."}
                        {isProPlan && "You're ready to scale your content creation."}
                        {isElitePlan && "Welcome to the ultimate creator toolkit."}
                    </p>
                    {isFreePlan && (
                        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                            <p className="text-sm text-blue-800 dark:text-blue-200">
                                <strong>Free Plan Includes:</strong> 1 weekly plan/month, 10 caption ideas/month, Bio Link Page, My Vault (100MB)
                            </p>
                        </div>
                    )}
                    {isProPlan && (
                        <div className="mt-6 p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                            <p className="text-sm text-primary-800 dark:text-primary-200">
                                <strong>Pro Plan Includes:</strong> Plan My Week, 2 plans/month, Live trend research, 500 caption ideas/month, Bio Link Page (5 links), My Schedule, 5GB storage
                            </p>
                        </div>
                    )}
                    {isElitePlan && (
                        <div className="mt-6 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                            <p className="text-sm text-purple-800 dark:text-purple-200">
                                <strong>Elite Plan Includes:</strong> Advanced Plan My Week options, 5 plans/month, Enhanced trend research (40 searches/month), 1,500 caption ideas/month, Unlimited links, My Schedule, 10GB storage, Monetized Creator Studio
                            </p>
                        </div>
                    )}
                </div>
            );
        }

        // Step 2: Niche (all plans)
        if (step === 2) {
            return (
                <div className="animate-fade-in">
                    <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white">What's Your Niche?</h2>
                    <p className="mt-2 text-center text-gray-500 dark:text-gray-400">
                        Tell us about your primary content focus. This helps our AI understand your brand.
                    </p>
                    <div className="mt-6 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Primary Niche
                            </label>
                            <input
                                type="text"
                                value={niche}
                                onChange={(e) => setNiche(e.target.value)}
                                placeholder="e.g., Gaming, Lifestyle, Tech Reviews, Fitness, Beauty"
                                className="w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-primary-500"
                            />
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                Be specific! Examples: "Gaming", "Lifestyle Vlogging", "Tech Reviews", "Fitness Coaching"
                            </p>
                        </div>
                    </div>
                </div>
            );
        }

        // Step 3: Audience (all plans)
        if (step === 3) {
            return (
                <div className="animate-fade-in">
                    <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white">Who's Your Audience?</h2>
                    <p className="mt-2 text-center text-gray-500 dark:text-gray-400">
                        Understanding your audience helps us create content that resonates.
                    </p>
                    <div className="mt-6 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Target Audience
                            </label>
                            <input
                                type="text"
                                value={audience}
                                onChange={(e) => setAudience(e.target.value)}
                                placeholder="e.g., Gen Z Gamers, Young Professionals, Fitness Enthusiasts"
                                className="w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-primary-500"
                            />
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                Describe your ideal viewer. Examples: "Gen Z Gamers", "Young Professionals 25-35", "Fitness Enthusiasts"
                            </p>
                        </div>
                    </div>
                </div>
            );
        }

        // Step 4: Goal (all plans)
        if (step === 4) {
            return (
                <div className="animate-fade-in">
                    <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white">What's Your Goal?</h2>
                    <p className="mt-2 text-center text-gray-500 dark:text-gray-400">
                        Help us tailor your plan to achieve your objectives.
                    </p>
                    <div className="mt-6 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Primary Goal
                            </label>
                            <textarea
                                value={goal}
                                onChange={(e) => setGoal(e.target.value)}
                                placeholder="e.g., Grow to 10K followers, Increase engagement by 50%, Monetize my content, Build a personal brand"
                                rows={4}
                                className="w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-primary-500"
                            />
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                What do you want to achieve with your content? Be specific!
                            </p>
                        </div>
                    </div>
                </div>
            );
        }

        // Step 5: Free Plan Completion (Free only)
        if (step === 5 && isFreePlan) {
            return (
                <div className="text-center animate-fade-in">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">You're All Set!</h2>
                    <p className="mt-2 text-gray-500 dark:text-gray-400">
                        Start creating content with your Free plan. Upgrade anytime to unlock more features!
                    </p>
                    <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-left">
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-2">What's Next?</h3>
                        <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                            <li>• Generate your first weekly plan (1/month available)</li>
                            <li>• Create caption ideas (10/month available)</li>
                            <li>• Set up your Bio Link Page (1 link)</li>
                            <li>• Upload media to your vault (100MB storage)</li>
                            <li>• Set up AI Training (AI Personality + Creator Personality)</li>
                        </ul>
                    </div>
                    <div className="mt-4 p-4 border border-gray-200 dark:border-gray-600 rounded-lg bg-white/60 dark:bg-gray-800/40 text-left">
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                            <strong>Where to start:</strong> use the sidebar to open <strong>Plan My Week</strong> (your plan), <strong>Write Captions</strong> (captions),
                            <strong>Bio Link Page</strong> (your bio page), and <strong>Settings → AI Training</strong>.
                        </p>
                    </div>
                </div>
            );
        }

        // Step 5: Pro Plan Features (Pro only)
        if (step === 5 && isProPlan) {
            return (
                <div className="animate-fade-in">
                    <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white">Unlock Pro Features</h2>
                    <p className="mt-2 text-center text-gray-500 dark:text-gray-400">
                        Here's what you can do with your Pro plan:
                    </p>
                    <div className="mt-6 space-y-4">
                        <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                            <h3 className="font-semibold text-primary-900 dark:text-primary-200 mb-2">Plan My Week</h3>
                            <p className="text-sm text-primary-800 dark:text-primary-300">
                                Get personalized content plans tailored to your niche and goals. Generate 2 plans per month with live trend research.
                            </p>
                        </div>
                        <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                            <h3 className="font-semibold text-primary-900 dark:text-primary-200 mb-2">Live Trend Research</h3>
                            <p className="text-sm text-primary-800 dark:text-primary-300">
                                Plan My Week includes live research so your plan aligns with what's trending right now in your niche.
                            </p>
                        </div>
                        <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                            <h3 className="font-semibold text-primary-900 dark:text-primary-200 mb-2">My Schedule</h3>
                            <p className="text-sm text-primary-800 dark:text-primary-300">
                                Plan and visualize your content schedule. See your posting plan at a glance.
                            </p>
                        </div>
                        <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                            <h3 className="font-semibold text-primary-900 dark:text-primary-200 mb-2">Bio Link Page</h3>
                            <p className="text-sm text-primary-800 dark:text-primary-300">
                                Create a professional bio page with up to 5 links. Perfect for driving traffic to your content.
                            </p>
                        </div>
                        <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                            <h3 className="font-semibold text-primary-900 dark:text-primary-200 mb-2">500 Caption Ideas/Month</h3>
                            <p className="text-sm text-primary-800 dark:text-primary-300">
                                Generate engaging caption ideas at scale. Perfect for maintaining a consistent posting schedule.
                            </p>
                        </div>
                        <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                            <h3 className="font-semibold text-primary-900 dark:text-primary-200 mb-2">5GB My Vault</h3>
                            <p className="text-sm text-primary-800 dark:text-primary-300">
                                Upload and organize your content assets so you can reuse them quickly when planning and scheduling.
                            </p>
                        </div>
                        <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                            <h3 className="font-semibold text-primary-900 dark:text-primary-200 mb-2">AI Training (Settings)</h3>
                            <p className="text-sm text-primary-800 dark:text-primary-300">
                                Set your AI personality and creator personality so captions and plans sound like you.
                            </p>
                        </div>
                    </div>
                    <div className="mt-4 p-4 border border-primary-200 dark:border-primary-800 rounded-lg bg-white/60 dark:bg-gray-800/40">
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                                <strong>Where to find it:</strong> open <strong>Plan My Week</strong> (weekly plans), <strong>My Schedule</strong>,
                                <strong>Write Captions</strong> (captions), <strong>Bio Link Page</strong>, and <strong>Settings → AI Training</strong>.
                        </p>
                    </div>
                </div>
            );
        }

        // Step 5: Elite Quick Start (Elite only)
        if (step === 5 && isElitePlan) {
            return (
                <div className="animate-fade-in">
                    <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white">Elite Quick Start</h2>
                    <p className="mt-2 text-center text-gray-500 dark:text-gray-400">
                        Here’s the fastest way to start using Elite and get results this week.
                    </p>

                    <div className="mt-6 space-y-4">
                        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                            <h3 className="font-semibold text-purple-900 dark:text-purple-200 mb-2">1) Build your plan</h3>
                            <p className="text-sm text-purple-800 dark:text-purple-300">
                                Open <strong>Plan My Week</strong> to generate a roadmap (Elite: 5 plans/month + enhanced trend research).
                            </p>
                        </div>

                        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                            <h3 className="font-semibold text-purple-900 dark:text-purple-200 mb-2">2) Schedule your week</h3>
                            <p className="text-sm text-purple-800 dark:text-purple-300">
                                Open <strong>My Schedule</strong> to plan and organize what you’ll post and when.
                            </p>
                        </div>

                        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                            <h3 className="font-semibold text-purple-900 dark:text-purple-200 mb-2">3) Create faster</h3>
                            <p className="text-sm text-purple-800 dark:text-purple-300">
                                Use <strong>Write Captions</strong> for captions and <strong>My Vault</strong> to store/tag content.
                            </p>
                        </div>
                        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                            <h3 className="font-semibold text-purple-900 dark:text-purple-200 mb-2">4) Set your AI style</h3>
                            <p className="text-sm text-purple-800 dark:text-purple-300">
                                Open <strong>Settings → AI Training</strong> and add your AI personality and creator personality.
                            </p>
                        </div>

                        <div className="p-4 border border-purple-200 dark:border-purple-800 rounded-lg bg-white/60 dark:bg-gray-800/40">
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                                <strong>Where to find it:</strong> use the sidebar to open <strong>Plan My Week</strong>, <strong>My Schedule</strong>,
                                <strong>Write Captions</strong>, <strong>My Vault</strong>, <strong>Bio Link Page</strong>, and <strong>Settings → AI Training</strong>.
                            </p>
                        </div>
                    </div>
                </div>
            );
        }

        // Step 6: Elite Plan Features (Elite only)
        if (step === 6 && isElitePlan) {
            return (
                <div className="animate-fade-in">
                    <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white">Elite Features Overview</h2>
                    <p className="mt-2 text-center text-gray-500 dark:text-gray-400">
                        You have access to the most powerful creator tools:
                    </p>
                    <div className="mt-6 space-y-4">
                        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                            <h3 className="font-semibold text-purple-900 dark:text-purple-200 mb-2">Advanced Plan My Week Options</h3>
                            <p className="text-sm text-purple-800 dark:text-purple-300">
                                Get 5 plans per month with enhanced live trend research (40 searches/month). Deep dive into niche-specific insights.
                            </p>
                        </div>
                        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                            <h3 className="font-semibold text-purple-900 dark:text-purple-200 mb-2">1,500 Caption Ideas/Month</h3>
                            <p className="text-sm text-purple-800 dark:text-purple-300">
                                Scale your content creation with lots of caption ideas. Perfect for daily posting.
                            </p>
                        </div>
                        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                            <h3 className="font-semibold text-purple-900 dark:text-purple-200 mb-2">Unlimited Bio Link Page</h3>
                            <p className="text-sm text-purple-800 dark:text-purple-300">
                                Add as many links as you need. Perfect for creators with multiple revenue streams.
                            </p>
                        </div>
                        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                            <h3 className="font-semibold text-purple-900 dark:text-purple-200 mb-2">AI Training (Settings)</h3>
                            <p className="text-sm text-purple-800 dark:text-purple-300">
                                Set your AI personality and creator personality so everything sounds like you.
                            </p>
                        </div>
                    </div>
                </div>
            );
        }

        // Step 7: Elite Monetized Creator Studio (Elite only)
        if (step === 7 && isElitePlan) {
            return (
                <div className="animate-fade-in">
                    <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white">Monetized Creator Studio (Elite)</h2>
                    <p className="mt-2 text-center text-gray-500 dark:text-gray-400">
                        Your Elite plan unlocks OnlyFans, Fansly, and Fanvue-specific tools to help you plan, organize, and scale faster.
                    </p>
                    <div className="mt-6 space-y-4">
                        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                            <h3 className="font-semibold text-purple-900 dark:text-purple-200 mb-2">Content Ideas + Planning</h3>
                            <p className="text-sm text-purple-800 dark:text-purple-300">
                                Generate roleplay ideas, spicy caption sets, and structured content plans tailored to your niche and audience.
                            </p>
                        </div>
                        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                            <h3 className="font-semibold text-purple-900 dark:text-purple-200 mb-2">Weekly Money Calendar</h3>
                            <p className="text-sm text-purple-800 dark:text-purple-300">
                                Plan drops, sessions, and promos so your week stays consistent.
                            </p>
                        </div>
                        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                            <h3 className="font-semibold text-purple-900 dark:text-purple-200 mb-2">My Vault + Post Pack</h3>
                            <p className="text-sm text-purple-800 dark:text-purple-300">
                                Store, tag, and reuse your media, then export post packs without redoing the work.
                            </p>
                        </div>
                        <div className="p-4 border border-purple-200 dark:border-purple-800 rounded-lg bg-white/60 dark:bg-gray-800/40">
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                                <strong>Where to find it:</strong> open the sidebar and click <strong>Monetized Creator Studio</strong>.
                            </p>
                        </div>
                    </div>
                </div>
            );
        }

        // Theme toggle mention (all plans, plan-specific step)
        const themeStep = isFreePlan ? 6 : isProPlan ? 6 : 8;
        if (step === themeStep) {
            return (
                <div className="text-center animate-fade-in">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Switch Light / Dark Mode</h2>
                    <p className="mt-2 text-gray-500 dark:text-gray-400">
                        Toggle themes anytime from the header — tap the sun/moon button in the top right.
                    </p>
                    <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-left">
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Why use it?</h3>
                        <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                            <li>• Dark mode for late-night work</li>
                            <li>• Light mode for daylight readability</li>
                            <li>• Remembers your preference across sessions</li>
                        </ul>
                    </div>
                    <div className="mt-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg text-left">
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                            <strong>Where:</strong> Header top-right sun/moon icon. Tap to toggle themes.
                        </p>
                    </div>
                </div>
            );
        }

        // Final step: Completion
        if (step === totalSteps) {
            return (
                <div className="text-center animate-fade-in">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">You're All Set!</h2>
                    <p className="mt-2 text-gray-500 dark:text-gray-400">
                        {isFreePlan && "Start creating with your Free plan. Upgrade anytime to unlock more."}
                        {isProPlan && "Start creating with your Pro plan. You're ready to scale!"}
                        {isElitePlan && "Welcome to Elite! You have access to everything."}
                    </p>
                    <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-left">
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Quick Start Guide</h3>
                        <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                            <li>• Generate your first weekly plan</li>
                            <li>• Create caption ideas for your posts</li>
                            <li>• Set up your Bio Link Page</li>
                            <li>• Upload media to your vault</li>
                            <li>• Set up AI Training (AI Personality + Creator Personality)</li>
                            {isProPlan && <li>• Explore My Schedule</li>}
                            {isElitePlan && <li>• Explore Monetized Creator Studio (Content Ideas, Money Calendar, My Vault)</li>}
                        </ul>
                    </div>
                </div>
            );
        }

        return null;
    };

    const canProceed = () => {
        if (step === 2) return niche.trim().length > 0;
        if (step === 3) return audience.trim().length > 0;
        if (step === 4) return goal.trim().length > 0; // All plans require goal
        return true;
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm" aria-modal="true">
            <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full m-4 p-8 flex flex-col min-h-[400px] max-h-[90vh] overflow-hidden">
                {/* Content area can overflow on smaller screens — make it scrollable */}
                <div className="flex-1 min-h-0 overflow-y-auto pr-1" aria-live="polite">
                    {renderStepContent()}
                </div>
                <div className="mt-8 flex justify-between items-center">
                    {step > 1 ? (
                        <button
                            onClick={handleBack}
                            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                        >
                            Back
                        </button>
                    ) : (
                        <div></div>
                    )}
                    <span className="text-sm text-gray-400">Step {step}/{totalSteps}</span>
                    <button
                        onClick={handleNext}
                        disabled={!canProceed()}
                        className="px-6 py-2 bg-primary-600 text-white font-semibold rounded-md hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {step === totalSteps ? "Start Tour" : "Next"}
                    </button>
                </div>
            </div>
        </div>
    );
};
