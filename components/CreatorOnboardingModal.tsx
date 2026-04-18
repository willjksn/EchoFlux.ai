import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useAppContext } from './AppContext';
import { auth, db } from '../firebaseConfig';
import { doc, setDoc } from 'firebase/firestore';
import { LogoIcon, DashboardIcon, TargetIcon, ComposeIcon, CalendarIcon, ImageIcon, SparklesIcon, HeartIcon, SettingsIcon } from './icons/UIIcons';
import { FAN_HUB_THEME_PRESETS } from '../constants';
import { isCreatorIdentityPlanClient } from '../src/lib/creatorIdentity/planGate';

interface CreatorOnboardingModalProps {
    onComplete: (opts?: { openFanHub?: boolean }) => void;
}

export const CreatorOnboardingModal: React.FC<CreatorOnboardingModalProps> = ({ onComplete }) => {
    const { user, setUser } = useAppContext();
    const [step, setStep] = useState(1);
    const [niche, setNiche] = useState(user?.niche || '');
    const [audience, setAudience] = useState(user?.audience || '');
    const [creatorGender, setCreatorGender] = useState(user?.creatorGender || '');
    const [goal, setGoal] = useState(user?.creatorGoal || '');
    const openFanHubAfterOnboardingRef = useRef(false);
    const [fanHubHandle, setFanHubHandle] = useState('');
    const [fanHubPresetId, setFanHubPresetId] = useState('default');
    const [fanHubPrimaryColor, setFanHubPrimaryColor] = useState(FAN_HUB_THEME_PRESETS[0].theme.primary);
    const [handleCheckStatus, setHandleCheckStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
    const [handleCheckMessage, setHandleCheckMessage] = useState('');
    const [fanHubSaving, setFanHubSaving] = useState(false);

    const userPlan = user?.plan || 'Pro';
    const isProPlan = userPlan === 'Pro' || userPlan === 'CreatorPro';
    const isElitePlan = isCreatorIdentityPlanClient(user?.plan);

    // Pro: Welcome … Fan Hub setup, Completion = 9
    // Elite (+ OnlyFansStudio / CreatorElite / Agency): + Creator Identity intro, + Premium Studio, Completion = 11
    const totalSteps = isProPlan ? 9 : isElitePlan ? 11 : 10;
    const fanHubSetupStep = 8;

    const checkHandle = useCallback(async (value: string) => {
        const clean = value.replace(/@/g, '').toLowerCase().trim();
        if (!clean || clean.length < 3 || clean.length > 20 || !/^[a-z0-9_]+$/.test(clean)) {
            setHandleCheckStatus('idle');
            setHandleCheckMessage('');
            return;
        }
        setHandleCheckStatus('checking');
        setHandleCheckMessage('');
        try {
            const params = new URLSearchParams({ handle: clean });
            if (user?.id) params.set('creatorId', user.id);
            const res = await fetch(`/api/checkHandleAvailability?${params}`);
            const data = await res.json().catch(() => ({}));
            if (data.available === true) {
                setHandleCheckStatus('available');
                setHandleCheckMessage('Available');
            } else {
                setHandleCheckStatus('taken');
                setHandleCheckMessage(data.message || 'This handle is already taken');
            }
        } catch {
            setHandleCheckStatus('idle');
            setHandleCheckMessage('Could not check');
        }
    }, [user?.id]);

    const persistFanHubThemeSelection = useCallback(async (opts?: { handle?: string }) => {
        if (!user?.id) return;
        try {
            const preset = FAN_HUB_THEME_PRESETS.find((p) => p.id === fanHubPresetId) || FAN_HUB_THEME_PRESETS[0];
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            if (!token) return;
            const body: Record<string, unknown> = {
                displayName: user.name || user.email?.split('@')[0] || user.id,
                theme: { ...preset.theme, presetId: preset.id, primary: fanHubPrimaryColor },
            };
            const cleanHandle = (opts?.handle || "").replace(/@/g, '').toLowerCase().trim();
            if (cleanHandle) {
                body.handle = cleanHandle;
            }
            await fetch('/api/updateCreatorStorefront', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });
        } catch (e) {
            console.warn('Failed to persist onboarding Fan Hub theme selection:', e);
        }
    }, [user?.id, user?.name, user?.email, fanHubPresetId, fanHubPrimaryColor]);

    useEffect(() => {
        const clean = fanHubHandle.replace(/@/g, '').toLowerCase().trim();
        if (clean.length < 3 || !/^[a-z0-9_]+$/.test(clean)) {
            setHandleCheckStatus('idle');
            setHandleCheckMessage('');
            return;
        }
        const t = setTimeout(() => checkHandle(fanHubHandle), 400);
        return () => clearTimeout(t);
    }, [fanHubHandle, checkHandle]);

    const handleSaveFanHubAndComplete = async () => {
        const cleanHandle = fanHubHandle.replace(/@/g, '').toLowerCase().trim();
        if (!user?.id) return;
        if (cleanHandle.length < 3 || cleanHandle.length > 20 || !/^[a-z0-9_]+$/.test(cleanHandle)) {
            return;
        }
        setFanHubSaving(true);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            if (!token) throw new Error('Not authenticated');
            const res = await fetch('/api/updateCreatorStorefront', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    handle: cleanHandle,
                    displayName: user.name || user.email?.split('@')[0] || cleanHandle,
                    theme: {
                        ...(FAN_HUB_THEME_PRESETS.find((p) => p.id === fanHubPresetId) || FAN_HUB_THEME_PRESETS[0]).theme,
                        presetId: fanHubPresetId,
                        primary: fanHubPrimaryColor,
                    },
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((data as { message?: string }).message || 'Save failed');
            await persistCreatorProfile();
            if (user) {
                await setUser({
                    id: user.id,
                    niche,
                    audience,
                    creatorGoal: goal.trim() || undefined,
                    creatorGender: creatorGender || undefined,
                });
            }
            openFanHubAfterOnboardingRef.current = true;
            setStep(9);
        } catch (e) {
            setHandleCheckMessage(e instanceof Error ? e.message : 'Failed to save');
        } finally {
            setFanHubSaving(false);
        }
    };

    const handleSaveAndComplete = async () => {
        await persistFanHubThemeSelection({ handle: fanHubHandle });
        await persistCreatorProfile();
        const openFanHub = openFanHubAfterOnboardingRef.current;
        openFanHubAfterOnboardingRef.current = false;
        if (user) {
            await setUser({
                id: user.id,
                niche,
                audience,
                creatorGoal: goal.trim() || undefined,
                creatorGender: creatorGender || undefined,
                hasCompletedOnboarding: true,
            });
        }
        onComplete({ openFanHub: openFanHub || undefined });
    };

    const handleNext = async () => {
        if (!canProceed()) return;
        if (step >= 2 && step <= 7) {
            await persistCreatorProfile();
        }
        if (step < totalSteps) {
            setStep((prev) => prev + 1);
        } else {
            await handleSaveAndComplete();
        }
    };

    const persistCreatorProfile = useCallback(async () => {
        if (!user?.id) return;
        try {
            await setDoc(doc(db, 'users', user.id), {
                niche,
                audience,
                creatorGender: creatorGender || undefined,
                creatorGoal: goal.trim() || undefined,
                updatedAt: new Date().toISOString(),
            }, { merge: true });
        } catch (e) {
            console.error('Failed to persist creator profile:', e);
        }
    }, [user?.id, niche, audience, creatorGender, goal]);

    const handleSkipFanHubSetup = async () => {
        await persistFanHubThemeSelection({ handle: fanHubHandle });
        await persistCreatorProfile();
        if (user) {
            await setUser({
                id: user.id,
                niche,
                audience,
                creatorGoal: goal.trim() || undefined,
                creatorGender: creatorGender || undefined,
            });
        }
        openFanHubAfterOnboardingRef.current = false;
        setStep(9);
    };

    const handleBack = () => {
        if (step > 1) {
            setStep(prev => prev - 1);
        }
    };

    const FeatureCard: React.FC<{ icon: React.ReactNode; title: string; description: string; color?: string }> = ({ icon, title, description, color = 'primary' }) => (
        <div className={`p-3 bg-${color}-50 dark:bg-${color}-900/20 rounded-lg border border-${color}-100 dark:border-${color}-800/50`}>
            <div className="flex items-start gap-3">
                <div className={`text-${color}-600 dark:text-${color}-400 mt-0.5`}>{icon}</div>
                <div>
                    <h4 className={`font-semibold text-${color}-900 dark:text-${color}-200 text-sm`}>{title}</h4>
                    <p className={`text-xs text-${color}-700 dark:text-${color}-300 mt-0.5`}>{description}</p>
                </div>
            </div>
        </div>
    );

    const renderStepContent = () => {
        // Step 1: Welcome
        if (step === 1) {
            return (
                <div className="text-center animate-fade-in">
                    <div className="flex justify-center items-center text-primary-600 dark:text-primary-400 mb-4">
                        <LogoIcon /> <span className="text-2xl font-bold ml-2">EchoFlux.ai</span>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                        Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}!
                    </h2>
                    <p className="mt-2 text-gray-500 dark:text-gray-400">
                        {isProPlan && "You're on the Pro plan - let's unlock your potential"}
                        {isElitePlan && "Welcome to Elite - the complete creator toolkit"}
                    </p>
                    
                    <div className={`mt-6 p-4 rounded-lg text-left ${
                        isProPlan ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800' :
                        'bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800'
                    }`}>
                        <p className={`text-sm font-semibold mb-2 ${
                            isProPlan ? 'text-primary-800 dark:text-primary-200' :
                            'text-purple-800 dark:text-purple-200'
                        }`}>
                            Your {userPlan} Plan Includes:
                        </p>
                        <ul className={`text-sm space-y-1 ${
                            isProPlan ? 'text-primary-700 dark:text-primary-300' :
                            'text-purple-700 dark:text-purple-300'
                        }`}>
                            {isProPlan && (
                                <>
                                    <li>• Dashboard with content overview</li>
                                    <li>• Trends - live trend research</li>
                                    <li>• What to Post - AI content ideas</li>
                                    <li>• Create Post - caption generator</li>
                                    <li>• Calendar - content scheduling</li>
                                    <li>• Fan Hub - build your fan community</li>
                                    <li>• Store — sell products to your fans</li>
                                    <li>• 5GB Vault storage</li>
                                    <li>• 500 AI generations per month</li>
                                </>
                            )}
                            {isElitePlan && (
                                <>
                                    <li>• Everything in Pro, plus:</li>
                                    <li>• Premium Studio - advanced creator tools</li>
                                    <li>• Creator Identity - AI-built brand baseline for captions & strategy</li>
                                    <li>• Enhanced Fan Hub features</li>
                                    <li>• 10GB Vault storage</li>
                                    <li>• 1,500 AI generations per month</li>
                                    <li>• Priority support</li>
                                </>
                            )}
                        </ul>
                    </div>
                </div>
            );
        }

        // Step 2: Content Focus (multi-select, same pattern as Audience)
        if (step === 2) {
            const contentFocusOptions = ['Lifestyle', 'Travel', 'Fashion', 'Spicy', 'Tech', 'Music', 'Fitness', 'Art', 'Gaming', 'Beauty', 'Food', 'Business'];
            const selectedFocus = niche.split(',').map((s) => s.trim()).filter(Boolean);

            const toggleFocus = (option: string) => {
                if (selectedFocus.includes(option)) {
                    setNiche(selectedFocus.filter((x) => x !== option).join(', '));
                } else {
                    setNiche([...selectedFocus, option].join(', '));
                }
            };

            return (
                <div className="animate-fade-in">
                    <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white">What's Your Content Focus?</h2>
                    <p className="mt-2 text-center text-gray-500 dark:text-gray-400">
                        This helps our AI tailor suggestions to your brand and style. Select all that apply.
                    </p>
                    <div className="mt-6 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Content Focus
                            </label>
                            <input
                                type="text"
                                value={niche}
                                onChange={(e) => setNiche(e.target.value)}
                                placeholder="e.g., Fitness, Lifestyle, Art"
                                className="w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-primary-500"
                            />
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                Select multiple above or type your own (comma-separated). Click chips to toggle.
                            </p>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-4">
                            {contentFocusOptions.map((option) => (
                                <button
                                    key={option}
                                    type="button"
                                    onClick={() => toggleFocus(option)}
                                    className={`px-3 py-2 text-xs rounded-md border transition-colors ${
                                        selectedFocus.includes(option)
                                            ? 'bg-primary-100 border-primary-500 text-primary-700 dark:bg-primary-900/30 dark:border-primary-500 dark:text-primary-300'
                                            : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    {option}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            );
        }

        // Step 3: Audience
        if (step === 3) {
            const audienceOptions = ['Everyone', 'Men', 'Women', 'Young Adults 18-25', 'Professionals 25-40', 'Enthusiasts'];
            const selectedAudiences = audience.split(', ').filter(a => a.trim());
            
            const toggleAudience = (option: string) => {
                if (option === 'Everyone') {
                    setAudience('Everyone');
                } else {
                    const current = selectedAudiences.filter(a => a !== 'Everyone');
                    if (current.includes(option)) {
                        const newSelection = current.filter(a => a !== option);
                        setAudience(newSelection.join(', '));
                    } else {
                        setAudience([...current, option].join(', '));
                    }
                }
            };
            
            const isSelected = (option: string) => {
                if (option === 'Everyone') return audience === 'Everyone';
                return selectedAudiences.includes(option) && audience !== 'Everyone';
            };
            
            return (
                <div className="animate-fade-in">
                    <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white">Who's Your Audience?</h2>
                    <p className="mt-2 text-center text-gray-500 dark:text-gray-400">
                        Understanding your audience helps us create content that connects.
                    </p>
                    <div className="mt-6 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Your Audience
                            </label>
                            <input
                                type="text"
                                value={audience}
                                onChange={(e) => setAudience(e.target.value)}
                                placeholder="e.g., Young professionals, fitness enthusiasts"
                                className="w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-primary-500"
                            />
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                Select multiple or type your own. Click to toggle.
                            </p>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-4">
                            {audienceOptions.map((suggestion) => (
                                <button
                                    key={suggestion}
                                    type="button"
                                    onClick={() => toggleAudience(suggestion)}
                                    className={`px-3 py-2 text-xs rounded-md border transition-colors ${
                                        isSelected(suggestion) 
                                            ? 'bg-primary-100 border-primary-500 text-primary-700 dark:bg-primary-900/30 dark:border-primary-500 dark:text-primary-300' 
                                            : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            );
        }

        // Step 4: I am a... (creator type)
        if (step === 4) {
            return (
                <div className="animate-fade-in">
                    <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white">Creator Profile</h2>
                    <p className="mt-2 text-center text-gray-500 dark:text-gray-400">
                        Helps us generate appropriate content ideas and visuals.
                    </p>
                    <div className="mt-6 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                I am a...
                            </label>
                            <select
                                value={creatorGender}
                                onChange={(e) => setCreatorGender(e.target.value)}
                                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                            >
                                <option value="">Select...</option>
                                <option value="Female">Female Creator</option>
                                <option value="Male">Male Creator</option>
                                <option value="Non-binary">Non-binary Creator</option>
                                <option value="Couple">Couple</option>
                                <option value="Other">Other</option>
                            </select>
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                Used to generate appropriate content ideas and visuals.
                            </p>
                        </div>
                    </div>
                </div>
            );
        }

        // Step 5: Goal
        if (step === 5) {
            return (
                <div className="animate-fade-in">
                    <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white">What's Your Goal?</h2>
                    <p className="mt-2 text-center text-gray-500 dark:text-gray-400">
                        We'll help you achieve your content goals.
                    </p>
                    <div className="mt-6 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Primary Goal
                            </label>
                            <textarea
                                value={goal}
                                onChange={(e) => setGoal(e.target.value)}
                                placeholder="e.g., Grow my following, post consistently, build a community"
                                rows={3}
                                className="w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-primary-500"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-4">
                            {['Grow my following', 'Post consistently', 'Build a community', 'Monetize my content'].map((suggestion) => (
                                <button
                                    key={suggestion}
                                    type="button"
                                    onClick={() => setGoal(suggestion)}
                                    className={`px-3 py-2 text-xs rounded-md border transition-colors ${
                                        goal === suggestion 
                                            ? 'bg-primary-100 border-primary-500 text-primary-700 dark:bg-primary-900/30 dark:border-primary-500 dark:text-primary-300' 
                                            : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            );
        }

        // Step 6: Core Features Overview
        if (step === 6) {
            return (
                <div className="animate-fade-in">
                    <h2 className="text-xl font-bold text-center text-gray-900 dark:text-white mb-1">Your Core Tools</h2>
                    <p className="text-center text-gray-500 dark:text-gray-400 text-sm mb-4">
                        Here's what you can do with EchoFlux.ai
                    </p>
                    <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                        <FeatureCard 
                            icon={<DashboardIcon />}
                            title="Dashboard"
                            description="Your content command center. See your stats, upcoming posts, and quick actions."
                        />
                        <FeatureCard 
                            icon={<TargetIcon />}
                            title="What to Post"
                            description="AI-powered content ideas tailored to your niche. Never run out of post ideas."
                        />
                        <FeatureCard 
                            icon={<ComposeIcon />}
                            title="Create Post"
                            description="Generate engaging captions and plan your posts with AI assistance."
                        />
                        <FeatureCard 
                            icon={<ImageIcon />}
                            title="Vault"
                            description="Store and organize your media. Tag content for easy reuse."
                        />
                        <FeatureCard 
                            icon={<CalendarIcon />}
                            title="Calendar"
                            description="Plan and visualize your content schedule. See your posting plan at a glance."
                            color="emerald"
                        />
                        <FeatureCard 
                            icon={<SettingsIcon />}
                            title="Settings → Profile & AI"
                            description="Customize your AI's personality and tone to match your brand voice."
                        />
                    </div>
                </div>
            );
        }

        // Step 7 (Pro/Elite): Fan Hub Introduction
        if (step === 7 && (isProPlan || isElitePlan)) {
            return (
                <div className="animate-fade-in">
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <HeartIcon />
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Fan Hub</h2>
                    </div>
                    <p className="text-center text-gray-500 dark:text-gray-400 text-sm mb-4">
                        Build and engage your fan community
                    </p>
                    
                    <div className={`p-4 rounded-lg mb-4 ${isElitePlan ? 'bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800' : 'bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800'}`}>
                        <p className={`text-sm ${isElitePlan ? 'text-purple-800 dark:text-purple-200' : 'text-primary-800 dark:text-primary-200'}`}>
                            Fan Hub lets you create a dedicated space for your fans. Share exclusive content, connect directly, and build a loyal community.
                        </p>
                    </div>
                    
                    <div className="space-y-3">
                        <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                            <h4 className="font-semibold text-gray-900 dark:text-white text-sm">My Page</h4>
                            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Create your personalized fan page with your branding, bio, and links.</p>
                        </div>
                        <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                            <h4 className="font-semibold text-gray-900 dark:text-white text-sm">Feed</h4>
                            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Share posts, updates, and exclusive content with your fans.</p>
                        </div>
                        <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                            <h4 className="font-semibold text-gray-900 dark:text-white text-sm">Messages</h4>
                            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Connect directly with your fans through private messaging.</p>
                        </div>
                        <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                            <h4 className="font-semibold text-gray-900 dark:text-white text-sm">Fan store</h4>
                            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Sell digital products, tips, and exclusive content to your fans.</p>
                        </div>
                    </div>
                    
                    <div className="mt-4 p-3 border border-gray-200 dark:border-gray-600 rounded-lg bg-white/60 dark:bg-gray-800/40">
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                            <strong>Find it:</strong> Click <strong>Fan Hub</strong> in the sidebar to get started.
                        </p>
                    </div>
                </div>
            );
        }

        // Step 7: Set up your Fan Hub (handle + theme)
        if (step === fanHubSetupStep) {
            const cleanHandle = fanHubHandle.replace(/@/g, '').toLowerCase().trim();
            const handleValid = cleanHandle.length >= 3 && cleanHandle.length <= 20 && /^[a-z0-9_]+$/.test(cleanHandle);
            const canSave = handleValid && handleCheckStatus === 'available';
            return (
                <div className="animate-fade-in">
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <HeartIcon />
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Set up your Fan Hub</h2>
                    </div>
                    <p className="text-center text-gray-500 dark:text-gray-400 text-sm mb-4">
                        Choose your page URL and theme. You can change these anytime in Fan Hub.
                    </p>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Your page URL</label>
                            <div className="flex gap-2">
                                <span className="flex items-center px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-l-md bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                                    witme.io/
                                </span>
                                <input
                                    type="text"
                                    value={fanHubHandle}
                                    onChange={(e) => setFanHubHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                                    placeholder="yourname"
                                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-r-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                    maxLength={20}
                                />
                            </div>
                            {handleCheckStatus === 'available' && <p className="mt-1 text-xs text-green-600 dark:text-green-400">{handleCheckMessage}</p>}
                            {handleCheckStatus === 'taken' && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{handleCheckMessage}</p>}
                            {handleCheckStatus === 'checking' && <p className="mt-1 text-xs text-gray-500">Checking…</p>}
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">3–20 characters, letters, numbers, underscores</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Theme</label>
                            <div className="grid grid-cols-3 gap-2">
                                {FAN_HUB_THEME_PRESETS.map((preset) => (
                                    <button
                                        key={preset.id}
                                        type="button"
                                        onClick={() => {
                                            setFanHubPresetId(preset.id);
                                            setFanHubPrimaryColor(preset.theme.primary);
                                        }}
                                        className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-colors ${
                                            fanHubPresetId === preset.id
                                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                                : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                                        }`}
                                    >
                                        <span className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-600 flex-shrink-0" style={{ backgroundColor: preset.theme.primary }} />
                                        <span className="text-xs font-medium text-gray-900 dark:text-white truncate w-full text-center">{preset.name}</span>
                                    </button>
                                ))}
                            </div>
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 mb-2">Pick a preset, then customize the main color below. Other colors can be set in Fan Hub → My Page.</p>
                            <div className="flex items-center gap-3">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Main color</label>
                                <input
                                    type="color"
                                    value={fanHubPrimaryColor}
                                    onChange={(e) => setFanHubPrimaryColor(e.target.value)}
                                    className="w-10 h-10 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                                />
                                <input
                                    type="text"
                                    value={fanHubPrimaryColor}
                                    onChange={(e) => setFanHubPrimaryColor(e.target.value)}
                                    className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="mt-4 flex flex-col gap-2">
                        {canSave && (
                            <button
                                type="button"
                                onClick={handleSaveFanHubAndComplete}
                                disabled={fanHubSaving}
                                className="w-full px-4 py-2.5 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 disabled:opacity-50"
                            >
                                {fanHubSaving ? 'Saving…' : 'Save & continue'}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleSkipFanHubSetup}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                            Skip for now
                        </button>
                    </div>
                </div>
            );
        }

        // Step 9 (Elite tier only): Creator Identity Builder
        if (step === 9 && isElitePlan) {
            const openCreatorIdentityBuilder = () => {
                window.open(`${window.location.origin}/studio?tab=persona`, '_blank', 'noopener,noreferrer');
            };
            return (
                <div className="animate-fade-in">
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <SparklesIcon />
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Creator Identity</h2>
                    </div>
                    <p className="text-center text-gray-500 dark:text-gray-400 text-sm mb-4">
                        Elite includes a guided identity quiz so captions, strategy, and your optional Fan Hub fill stay on-brand.
                    </p>
                    <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800 mb-4">
                        <p className="text-sm text-purple-800 dark:text-purple-200">
                            Complete the <strong>Creator Identity Builder</strong> in Premium Studio when you have a few minutes. You
                            can pause anytime — progress is saved. You                             can also open it later under <strong>Creator Profile</strong> on{' '}
                            <strong className="whitespace-nowrap">Settings → Profile &amp; AI</strong>.
                        </p>
                    </div>
                    <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-2 mb-4 list-disc list-inside">
                        <li>Turns quiz answers into a structured brand profile</li>
                        <li>Feeds your default tone into captions and strategy (unless you use Personality Override)</li>
                        <li>Optional: fill Fan Hub / My Page copy from your identity when you choose</li>
                    </ul>
                    <button
                        type="button"
                        onClick={openCreatorIdentityBuilder}
                        className="w-full px-4 py-2.5 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition-colors"
                    >
                        Open Creator Identity Builder
                    </button>
                    <p className="mt-3 text-xs text-center text-gray-500 dark:text-gray-400">
                        Opens in a new tab so you can keep this onboarding open. Use <strong>Next</strong> when you&apos;re ready to continue.
                    </p>
                </div>
            );
        }

        // Step 10 (Elite tier only): Premium Studio Introduction
        if (step === 10 && isElitePlan) {
            return (
                <div className="animate-fade-in">
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <SparklesIcon />
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Premium Studio</h2>
                    </div>
                    <p className="text-center text-gray-500 dark:text-gray-400 text-sm mb-4">
                        Advanced tools for serious creators
                    </p>
                    
                    <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800 mb-4">
                        <p className="text-sm text-purple-800 dark:text-purple-200">
                            Premium Studio gives you professional-grade AI tools to plan and create content faster.
                        </p>
                    </div>
                    
                    <div className="space-y-3">
                        <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                            <h4 className="font-semibold text-purple-900 dark:text-purple-200 text-sm">🔥 New Ideas</h4>
                            <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">Trend-powered content ideas with visual previews for every format.</p>
                        </div>
                        <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                            <h4 className="font-semibold text-purple-900 dark:text-purple-200 text-sm">Drops & PPV</h4>
                            <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">Plan and organize your content drops and pay-per-view releases.</p>
                        </div>
                        <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                            <h4 className="font-semibold text-purple-900 dark:text-purple-200 text-sm">DM Session</h4>
                            <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">Generate engaging DM templates and conversation starters.</p>
                        </div>
                        <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                            <h4 className="font-semibold text-purple-900 dark:text-purple-200 text-sm">Creator Identity</h4>
                            <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
                                Your brand baseline quiz — first tab in Premium Studio. Powers captions and strategy by default.
                            </p>
                        </div>
                        <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                            <h4 className="font-semibold text-purple-900 dark:text-purple-200 text-sm">Teasers</h4>
                            <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">Create teaser captions and previews to promote your content.</p>
                        </div>
                    </div>
                    
                    <div className="mt-4 p-3 border border-purple-200 dark:border-purple-700 rounded-lg bg-white/60 dark:bg-gray-800/40">
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                            <strong>Find it:</strong> Click <strong>Premium Studio</strong> in the sidebar to explore.
                        </p>
                    </div>
                </div>
            );
        }

        // Final Step: Completion (step varies by plan)
        if (step === totalSteps) {
            return (
                <div className="text-center animate-fade-in">
                    <div className="w-16 h-16 mx-auto mb-4 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">You're All Set!</h2>
                    <p className="mt-2 text-gray-500 dark:text-gray-400">
                        Your account is ready. Here's how to get started:
                    </p>
                    
                    <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-left">
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Quick Start</h3>
                        <ol className="text-sm text-gray-600 dark:text-gray-300 space-y-2">
                            <li className="flex items-start gap-2">
                                <span className="bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                                <span>Open <strong>What to Post</strong> to get content ideas</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                                <span>Use <strong>Create Post</strong> to write your first caption</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                                <span>Go to <strong>Settings → Profile &amp; AI</strong> to personalize your AI</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold flex-shrink-0">4</span>
                                <span>Explore <strong>Fan Hub</strong> to build your community</span>
                            </li>
                            {isElitePlan && (
                                <>
                                    <li className="flex items-start gap-2">
                                        <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold flex-shrink-0">5</span>
                                        <span>
                                            Complete <strong>Creator Identity</strong> in Premium Studio (first tab) for smarter captions
                                            and strategy
                                        </span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold flex-shrink-0">6</span>
                                        <span>Explore the rest of <strong>Premium Studio</strong> (ideas, drops, DMs, teasers)</span>
                                    </li>
                                </>
                            )}
                        </ol>
                    </div>
                </div>
            );
        }

        // Free plan step 6 is completion (handled above)
        return null;
    };

    const canProceed = () => {
        if (step === 2) return niche.trim().length > 0;
        if (step === 3) return audience.trim().length > 0;
        // Step 4 (I am a...) is optional
        if (step === 5) return goal.trim().length > 0;
        return true;
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm" aria-modal="true">
            <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full m-4 p-6 flex flex-col min-h-[420px] max-h-[90vh] overflow-hidden">
                <div className="flex-1 min-h-0 overflow-y-auto pr-1" aria-live="polite">
                    {renderStepContent()}
                </div>
                <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
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
                    <div className="flex flex-col items-center gap-1 min-w-0 flex-1 justify-center px-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums whitespace-nowrap">
                            Step {step} of {totalSteps}
                        </span>
                        <div className="w-full max-w-[160px] h-1.5 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden">
                            <div
                                className="h-full rounded-full bg-primary-500 transition-[width] duration-200"
                                style={{ width: `${Math.min(100, (step / totalSteps) * 100)}%` }}
                            />
                        </div>
                    </div>
                    {step === fanHubSetupStep ? (
                        <button
                            onClick={handleSkipFanHubSetup}
                            className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            Skip
                        </button>
                    ) : (
                        <button
                            onClick={handleNext}
                            disabled={!canProceed()}
                            className="px-6 py-2 bg-primary-600 text-white font-semibold rounded-md hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {step === totalSteps ? "Let's Go!" : "Next"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

