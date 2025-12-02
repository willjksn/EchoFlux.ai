import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Settings as AppSettings, Platform, CustomVoice, SocialAccount } from '../types';
import { InstagramIcon, TikTokIcon, ThreadsIcon, XIcon, YouTubeIcon, LinkedInIcon, FacebookIcon } from './icons/PlatformIcons';
import { useAppContext } from './AppContext';
import { UpgradePrompt } from './UpgradePrompt';
import { UploadIcon, TrashIcon, SettingsIcon, LinkIcon, SparklesIcon, CreditCardIcon, CheckCircleIcon, XMarkIcon, ClockIcon, VoiceIcon } from './icons/UIIcons';
import { db, storage } from '../firebaseConfig';
// @ts-ignore
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { connectSocialAccount, disconnectSocialAccount } from '../src/services/socialMediaService';

interface SettingsProps {}

const fileToBase64 = (file: File): Promise<{ data: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();   
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            resolve({ data: result.split(',')[1], mimeType: file.type });
        };
        reader.onerror = error => reject(error);
    });
};

const ToggleSwitch: React.FC<{ label: string; enabled: boolean; onChange: (enabled: boolean) => void; }> = ({ label, enabled, onChange }) => (
  <div className="flex items-center justify-between">
    <span className="font-medium text-gray-700 dark:text-gray-300">{label}</span>
    <button
      onClick={() => onChange(!enabled)}
      className={`${
        enabled ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600'
      } relative inline-flex h-6 w-11 items-center rounded-full transition-colors`}
    >
      <span
        className={`${
          enabled ? 'translate-x-6' : 'translate-x-1'
        } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
      />
    </button>
  </div>
);

const SettingsSection: React.FC<{ title: string; children: React.ReactNode, id?: string }> = ({ title, children, id }) => (
    <div id={id} className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 animate-fade-in">
        <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{title}</h3>
        <div className="space-y-4">{children}</div>
    </div>
);

const ToneSlider: React.FC<{
    label: string;
    value: number;
    onChange: (value: number) => void;
    description: string;
}> = ({ label, value, onChange, description }) => (
    <div>
        <label className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            <span>{label}</span>
            <span className="font-semibold">{value}</span>
        </label>
        <input
            type="range"
            min="0"
            max="100"
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-600"
            style={{ accentColor: '#3b82f6' }}
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{description}</p>
    </div>
);

const platformIcons: Record<Platform, React.ReactNode> = {
  Instagram: <InstagramIcon />,
  TikTok: <TikTokIcon />,
  X: <XIcon />,
  Threads: <ThreadsIcon />,
  YouTube: <YouTubeIcon />,
  LinkedIn: <LinkedInIcon />,
  Facebook: <FacebookIcon />,
};

const AccountConnection: React.FC<{
    platform: Platform;
    account: SocialAccount | null;
    isConnecting: boolean;
    onConnect: (platform: Platform) => Promise<void>;
    onDisconnect: (platform: Platform) => Promise<void>;
}> = ({ platform, account, isConnecting, onConnect, onDisconnect }) => {
    const isConnected = account?.connected || false;
    const accountUsername = account?.accountUsername;

    return (
        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
            <div className="flex items-center space-x-3 flex-1">
                <span className="text-gray-600 dark:text-gray-300">{platformIcons[platform]}</span>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-800 dark:text-gray-200">{platform}</span>
                        {isConnected && (
                            <CheckCircleIcon className="w-4 h-4 text-green-500 dark:text-green-400" />
                        )}
                    </div>
                    {accountUsername && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">@{accountUsername}</p>
                    )}
                </div>
            </div>
            <button
                onClick={() => isConnected ? onDisconnect(platform) : onConnect(platform)}
                disabled={isConnecting}
                className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors whitespace-nowrap ${
                    isConnected
                        ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-900'
                        : 'bg-primary-100 text-primary-700 hover:bg-primary-200 dark:bg-primary-900/50 dark:text-primary-300 dark:hover:bg-primary-900'
                } ${isConnecting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                {isConnecting ? 'Connecting...' : isConnected ? 'Disconnect' : 'Connect'}
            </button>
        </div>
    );
};

type SettingsTab = 'general' | 'connections' | 'ai-training' | 'billing';

export const Settings: React.FC = () => {
    const { user, setUser, settings, setSettings, setActivePage, selectedClient, userCustomVoices, setUserCustomVoices, showToast, setPricingView, socialAccounts } = useAppContext();
    const [activeTab, setActiveTab] = useState<SettingsTab>('general');
    const [fileName, setFileName] = useState<string | null>(null);
    const [isUploadingVoice, setIsUploadingVoice] = useState(false);
    const [connectingPlatform, setConnectingPlatform] = useState<Platform | null>(null);
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const voiceFileInputRef = useRef<HTMLInputElement>(null);

    // Safe default for socialAccounts if undefined
    const safeSocialAccounts: Record<Platform, SocialAccount | null> = socialAccounts || {
        Instagram: null,
        TikTok: null,
        X: null,
        Threads: null,
        YouTube: null,
        LinkedIn: null,
        Facebook: null,
    };
    
    const isPremiumFeatureUnlocked = ['Elite', 'Agency'].includes(user?.plan || 'Free') || user?.role === 'Admin';

    const voiceLimit = useMemo(() => {
        if (!user) return 0;
        // Admins should have access to everything
        if (user.role === 'Admin') return Infinity;
        switch(user.plan) {
            case 'Pro': return 1;
            case 'Elite': return 3;
            case 'Agency': return Infinity;
            default: return 0;
        }
    }, [user?.plan, user?.role]);

    // Admins should have access to everything, including voice cloning
    const isVoiceFeatureUnlocked = voiceLimit > 0 || user?.role === 'Admin';

    // Handle OAuth callback from URL params
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const oauthSuccess = params.get('oauth_success');
        const oauthError = params.get('error');
        const platform = params.get('platform');

        if (oauthSuccess) {
            showToast(`${oauthSuccess.charAt(0).toUpperCase() + oauthSuccess.slice(1)} account connected successfully!`, 'success');
            // Remove query params from URL
            window.history.replaceState({}, '', window.location.pathname);
            // Reload page to refresh social accounts
            window.location.reload();
        } else if (oauthError) {
            showToast(`Failed to connect ${platform || 'account'}: ${oauthError}`, 'error');
            // Remove query params from URL
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, [showToast]);

    const handleVoiceFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!user) return;
        if (userCustomVoices.length >= voiceLimit) {
            showToast('Voice limit reached for your plan. Upgrade or remove a voice.', 'error');
            return;
        }
        const file = event.target.files?.[0];
        if (file) {
            setIsUploadingVoice(true);
            try {
                // Upload to Firebase Storage
                const sRef = ref(storage, `users/${user.id}/voices/${Date.now()}_${file.name}`);
                await uploadBytes(sRef, file);
                const url = await getDownloadURL(sRef);

                const { data, mimeType } = await fileToBase64(file);
                
                // Clone voice using ElevenLabs API
                const { cloneVoice } = await import('../src/services/geminiService');
                const voiceName = file.name.replace(/\.[^/.]+$/, ''); // Remove file extension
                
                try {
                    const cloneResult = await cloneVoice(data, mimeType, voiceName);
                    
                    if (cloneResult.success && cloneResult.voiceId) {
                        const newVoice: CustomVoice = { 
                            id: cloneResult.voiceId, 
                            name: voiceName, 
                            data, 
                            mimeType,
                            url,
                            elevenLabsVoiceId: cloneResult.voiceId,
                            createdAt: new Date().toISOString(),
                            isCloned: true,
                        };

                        await setDoc(doc(db, 'users', user.id, 'voices', newVoice.id), newVoice);
                        setUserCustomVoices(prev => [...prev, newVoice]);
                        
                        showToast('Voice cloned successfully! You can now use it in video generation.', 'success');
                    } else {
                        throw new Error(cloneResult.error || 'Voice cloning failed');
                    }
                } catch (cloneError: any) {
                    console.error("Voice cloning error:", cloneError);
                    // Still save the voice file even if cloning fails
                    const newVoice: CustomVoice = { 
                        id: Date.now().toString(), 
                        name: voiceName, 
                        data, 
                        mimeType,
                        url,
                        isCloned: false,
                    };
                    await setDoc(doc(db, 'users', user.id, 'voices', newVoice.id), newVoice);
                    setUserCustomVoices(prev => [...prev, newVoice]);
                    showToast('Voice uploaded but cloning failed. You can still use the audio file.', 'error');
                }
            } catch (error: any) {
                console.error("Voice upload error:", error);
                showToast(error?.message || 'Failed to upload voice file.', 'error');
            } finally {
                setIsUploadingVoice(false);
                if(voiceFileInputRef.current) voiceFileInputRef.current.value = "";
            }
        }
    };

    const handleDeleteVoice = async (id: string) => {
        if (!user) return;
        try {
             const voiceToDelete = userCustomVoices.find(v => v.id === id);
             if (voiceToDelete && voiceToDelete.url) {
                 try {
                     const sRef = ref(storage, voiceToDelete.url);
                     await deleteObject(sRef);
                 } catch(e) {
                     console.warn("Storage file might not exist", e);
                 }
             }
            await deleteDoc(doc(db, 'users', user.id, 'voices', id));
            showToast('Voice deleted.', 'success');
        } catch(e) {
            showToast('Failed to delete voice.', 'error');
        }
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files.length > 0) {
            setFileName(event.target.files[0].name);
        }
    };
    
    const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const updateToneSetting = <K extends keyof AppSettings['tone']>(key: K, value: AppSettings['tone'][K]) => {
        setSettings(prev => ({ ...prev, tone: { ...prev.tone, [key]: value } }));
    };

    const handleConnectAccount = async (platform: Platform) => {
        setConnectingPlatform(platform);
        try {
            await connectSocialAccount(platform);
            // OAuth flow will redirect, so we don't need to do anything else here
            // The useEffect will handle the callback
        } catch (error: any) {
            console.error(`Failed to connect ${platform}:`, error);
            showToast(`Failed to connect ${platform}. Please try again.`, 'error');
            setConnectingPlatform(null);
        }
    };

    const handleDisconnectAccount = async (platform: Platform) => {
        setConnectingPlatform(platform);
        try {
            await disconnectSocialAccount(platform);
            showToast(`${platform} account disconnected successfully.`, 'success');
            // Reload page to refresh social accounts
            window.location.reload();
        } catch (error: any) {
            console.error(`Failed to disconnect ${platform}:`, error);
            showToast(`Failed to disconnect ${platform}. Please try again.`, 'error');
            setConnectingPlatform(null);
        }
    };

    const handleRestartOnboarding = async () => {
        if(user) {
            showToast("Resetting account setup...", "success");
            // Async update to ensure persistence before reload
            await setUser({ ...user, hasCompletedOnboarding: false, userType: undefined });
            setTimeout(() => window.location.reload(), 500);
        }
    }

    const handleSwitchToCreator = async () => {
        if(user && user.userType === 'Business') {
            try {
                // Update userType, reset onboarding, set pricing view, and navigate
                await setUser({ ...user, userType: 'Creator', hasCompletedOnboarding: false });
                setPricingView('Creator');
                setActivePage('pricing');
                showToast("Redirecting to Creator plans...", "success");
            } catch (error) {
                showToast("Failed to switch to Creator mode.", "error");
            }
        }
    }

    const handleSwitchToBusiness = async () => {
        if(user && user.userType === 'Creator') {
            try {
                // Update userType, reset onboarding, set pricing view, and navigate
                await setUser({ ...user, userType: 'Business', hasCompletedOnboarding: false });
                setPricingView('Business');
                setActivePage('pricing');
                showToast("Redirecting to Business plans...", "success");
            } catch (error) {
                showToast("Failed to switch to Business mode.", "error");
            }
        }
    }

    // Subscription cancellation logic
    const isPremiumPlan = user?.plan && user.plan !== 'Free';
    const isSubscriptionCancelled = user?.cancelAtPeriodEnd === true;
    const subscriptionEndDate = user?.subscriptionEndDate;
    const billingCycle = user?.billingCycle || 'monthly';

    // Calculate remaining access time
    const getRemainingAccessTime = () => {
        if (!subscriptionEndDate) return null;
        const endDate = new Date(subscriptionEndDate);
        const now = new Date();
        const diffMs = endDate.getTime() - now.getTime();
        
        if (diffMs <= 0) return { expired: true, days: 0, hours: 0, minutes: 0 };
        
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        
        return { days, hours, minutes, expired: false };
    };

    const remainingTime = getRemainingAccessTime();

    const handleCancelSubscription = async () => {
        if (!user) return;
        
        setIsCancelling(true);
        try {
            // Calculate subscription end date (end of current billing period)
            const now = new Date();
            let endDate = new Date(now);
            
            // Calculate end date based on subscription start date and billing cycle
            // If subscriptionStartDate is not set, use signupDate or current date as fallback
            const startDate = user.subscriptionStartDate 
                ? new Date(user.subscriptionStartDate) 
                : (user.signupDate ? new Date(user.signupDate) : now);
            
            if (billingCycle === 'annually') {
                endDate = new Date(startDate);
                endDate.setFullYear(endDate.getFullYear() + 1);
                // If we're past the annual renewal, add another year from now
                while (endDate <= now) {
                    endDate.setFullYear(endDate.getFullYear() + 1);
                }
            } else {
                // Monthly billing
                endDate = new Date(startDate);
                endDate.setMonth(endDate.getMonth() + 1);
                // If we're past the monthly renewal, add another month from now
                while (endDate <= now) {
                    endDate.setMonth(endDate.getMonth() + 1);
                }
            }
            
            // Ensure we set subscriptionStartDate if not already set
            if (!user.subscriptionStartDate) {
                user.subscriptionStartDate = startDate.toISOString();
            }

            // Set subscription to cancel at period end
            await setUser({
                ...user,
                cancelAtPeriodEnd: true,
                subscriptionEndDate: endDate.toISOString(),
                billingCycle: billingCycle,
                subscriptionStartDate: user.subscriptionStartDate || now.toISOString()
            });

            showToast('Subscription cancelled. You will retain access until the end of your billing period.', 'success');
            setShowCancelModal(false);
        } catch (error) {
            console.error('Failed to cancel subscription:', error);
            showToast('Failed to cancel subscription. Please try again.', 'error');
        } finally {
            setIsCancelling(false);
        }
    };

    const handleReactivateSubscription = async () => {
        if (!user) return;
        
        setIsCancelling(true);
        try {
            await setUser({
                ...user,
                cancelAtPeriodEnd: false,
                subscriptionEndDate: undefined
            });

            showToast('Subscription reactivated successfully!', 'success');
        } catch (error) {
            console.error('Failed to reactivate subscription:', error);
            showToast('Failed to reactivate subscription. Please try again.', 'error');
        } finally {
            setIsCancelling(false);
        }
    };

    const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
        { id: 'general', label: 'General', icon: <SettingsIcon /> },
        { id: 'connections', label: 'Connections', icon: <LinkIcon /> },
        { id: 'ai-training', label: 'AI Training', icon: <SparklesIcon /> },
        { id: 'billing', label: 'Billing', icon: <CreditCardIcon /> },
    ];

    if (!user) return null;

    return (
        <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-full">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Settings</h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage your account preferences and integrations.</p>
                </div>

                <div className="flex space-x-1 bg-white dark:bg-gray-800 p-1 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap flex-1 justify-center ${
                                activeTab === tab.id
                                    ? 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-md'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                        >
                            <span className="w-4 h-4">{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="space-y-6">
                {activeTab === 'connections' && (
                    <SettingsSection title="Connected Accounts">
                        <p className="text-sm text-gray-500 dark:text-gray-400">Connect your social media accounts to allow EngageSuite.ai to fetch incoming messages and post replies.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {(Object.keys(settings.connectedAccounts || {}) as Platform[]).map(platform => {
                                const account = safeSocialAccounts && safeSocialAccounts[platform] ? safeSocialAccounts[platform] : null;
                                return (
                                    <AccountConnection 
                                        key={platform}
                                        platform={platform}
                                        account={account}
                                        isConnecting={connectingPlatform === platform}
                                        onConnect={handleConnectAccount}
                                        onDisconnect={handleDisconnectAccount}
                                    />
                                );
                            })}
                        </div>
                        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                            <p className="text-sm text-blue-800 dark:text-blue-200">
                                <strong>Note:</strong> Connecting accounts enables real-time stats and posting capabilities. You'll be redirected to authorize each platform.
                            </p>
                        </div>
                    </SettingsSection>
                )}

                {activeTab === 'general' && (
                    <>
                        <SettingsSection title="General Automation">
                            <ToggleSwitch label="Enable Auto-Suggest" enabled={settings.autoReply} onChange={(val) => updateSetting('autoReply', val)} />
                            <p className="text-sm text-gray-500 dark:text-gray-400">When enabled, EngageSuite.ai will automatically generate a suggested reply for incoming messages.</p>
                            <hr className="border-gray-200 dark:border-gray-700" />
                            <ToggleSwitch label="Enable Auto-Respond" enabled={settings.autoRespond} onChange={(val) => updateSetting('autoRespond', val)} />
                            <p className="text-sm text-gray-500 dark:text-gray-400">When enabled, EngageSuite.ai will automatically send the generated reply without manual approval. Use with caution.</p>
                        </SettingsSection>
                        <SettingsSection title="Safety & Accessibility">
                            <ToggleSwitch label="Safe Mode" enabled={settings.safeMode} onChange={(val) => updateSetting('safeMode', val)} />
                            <p className="text-sm text-gray-500 dark:text-gray-400">Prevents the AI from generating replies with profanity or discussing sensitive topics.</p>
                            <hr className="border-gray-200 dark:border-gray-700" />
                            <ToggleSwitch label="Enable Voice Mode" enabled={settings.voiceMode} onChange={(val) => updateSetting('voiceMode', val)} />
                            <p className="text-sm text-gray-500 dark:text-gray-400">Enable the floating AI Voice Assistant button for hands-free control.</p>
                        </SettingsSection>
                        <SettingsSection title="Goals & Milestones">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        {user.userType === 'Business' ? 'Total Reach Goal' : 'Total Followers Goal'}
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={user.goals?.followerGoal || ''}
                                        onChange={(e) => {
                                            const value = e.target.value ? parseInt(e.target.value, 10) : undefined;
                                            if (user) {
                                                setUser({
                                                    ...user,
                                                    goals: {
                                                        ...user.goals,
                                                        followerGoal: value,
                                                    }
                                                });
                                            }
                                        }}
                                        placeholder="Set your goal..."
                                        className="w-full p-3 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:text-white"
                                    />
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Set your target {user.userType === 'Business' ? 'total reach' : 'total followers'} across all platforms.
                                    </p>
                                </div>
                                <hr className="border-gray-200 dark:border-gray-700" />
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Monthly Posts Goal
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={user.goals?.monthlyPostsGoal || ''}
                                        onChange={(e) => {
                                            const value = e.target.value ? parseInt(e.target.value, 10) : undefined;
                                            if (user) {
                                                setUser({
                                                    ...user,
                                                    goals: {
                                                        ...user.goals,
                                                        monthlyPostsGoal: value,
                                                    }
                                                });
                                            }
                                        }}
                                        placeholder="Set your goal..."
                                        className="w-full p-3 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:text-white"
                                    />
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Set your target number of posts to publish per month.
                                    </p>
                                </div>
                                {user.userType === 'Business' && (
                                    <>
                                        <hr className="border-gray-200 dark:border-gray-700" />
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                Monthly Leads Goal
                                            </label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={user.goals?.monthlyLeadsGoal || ''}
                                                onChange={(e) => {
                                                    const value = e.target.value ? parseInt(e.target.value, 10) : undefined;
                                                    if (user) {
                                                        setUser({
                                                            ...user,
                                                            goals: {
                                                                ...user.goals,
                                                                monthlyLeadsGoal: value,
                                                            }
                                                        });
                                                    }
                                                }}
                                                placeholder="Set your goal..."
                                                className="w-full p-3 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:text-white"
                                            />
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                Set your target number of leads to generate per month.
                                            </p>
                                        </div>
                                    </>
                                )}
                            </div>
                        </SettingsSection>
                        <SettingsSection title="Account Type">
                            <div className="space-y-3">
                                <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Current Account Type</p>
                                    <p className="text-lg font-bold text-primary-600 dark:text-primary-400">
                                        {user.userType === 'Business' ? 'Business' : user.userType === 'Creator' ? 'Creator' : 'Not Set'}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Your plan: <span className="font-semibold">{user.plan}</span>
                                    </p>
                                </div>
                                {user.userType === 'Business' && (
                                    <button 
                                        onClick={handleSwitchToCreator} 
                                        className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
                                    >
                                        Switch to Creator Mode
                                    </button>
                                )}
                                {user.userType === 'Creator' && (
                                    <button 
                                        onClick={handleSwitchToBusiness} 
                                        className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
                                    >
                                        Switch to Business Mode
                                    </button>
                                )}
                            </div>
                        </SettingsSection>
                        <SettingsSection title="Advanced">
                            <button onClick={handleRestartOnboarding} className="px-4 py-2 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded-md hover:bg-red-200 transition-colors text-sm font-medium">
                                Restart Onboarding
                            </button>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">This will reset your workspace settings and allow you to choose between Creator or Business mode again.</p>
                        </SettingsSection>
                    </>
                )}
                
                {activeTab === 'ai-training' && (
                    <>
                        <SettingsSection title="AI Personality & Tone">
                            <ToggleSwitch label="High Quality Generations" enabled={settings.highQuality} onChange={(val) => updateSetting('highQuality', val)} />
                            <p className="text-sm text-gray-500 dark:text-gray-400">Use a more advanced AI model for creative tasks like strategy generation. May be slower and is only available on premium plans.</p>
                            <hr className="border-gray-200 dark:border-gray-700" />
                            <ToneSlider label="Formality" value={settings.tone.formality} onChange={(val) => updateToneSetting('formality', val)} description="Low for casual & slang, high for formal & professional."/>
                            <ToneSlider label="Humor" value={settings.tone.humor} onChange={(val) => updateToneSetting('humor', val)} description="Low for serious, high for witty & funny replies."/>
                            <ToneSlider label="Empathy" value={settings.tone.empathy} onChange={(val) => updateToneSetting('empathy', val)} description="Low for direct, high for supportive & understanding."/>
                            
                            {(user.userType === 'Creator' || user.plan === 'Agency' || user.role === 'Admin') && (
                                <>
                                    <hr className="border-gray-200 dark:border-gray-700 my-4" />
                                    <ToneSlider 
                                        label="Spiciness 🌶️" 
                                        value={settings.tone.spiciness || 0} 
                                        onChange={(val) => updateToneSetting('spiciness', val)} 
                                        description="Control the level of bold/explicit language. (Creator, Agency & Admin accounts only)."
                                    />
                                </>
                            )}
                        </SettingsSection>

                        <SettingsSection title="Train AI on Your Exact Voice" id="tour-step-voice-training">
                            {!isPremiumFeatureUnlocked ? (
                                <UpgradePrompt featureName="Custom Voice Training" onUpgradeClick={() => setActivePage('pricing')} />
                            ) : (
                                <>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Upload a text file with examples of your past replies to help the AI learn your unique style.</p>
                                    <div className="flex items-center space-x-4">
                                        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".txt,.md"/>
                                        <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors">Upload Document</button>
                                        {fileName && <span className="text-sm text-gray-600 dark:text-gray-400">{fileName}</span>}
                                    </div>
                                </>
                            )}
                        </SettingsSection>

                        <SettingsSection title="Voice Clones" id="voice-clones">
                            {!isVoiceFeatureUnlocked ? (
                                <UpgradePrompt 
                                    featureName="Voice Cloning" 
                                    onUpgradeClick={() => setActivePage('pricing')}
                                    description={`Upload audio samples to create AI clones of your voice for video voiceovers. Plan limits: Pro (1), Elite (3), Agency (Unlimited).`}
                                />
                            ) : (
                                <>
                                    <div className="space-y-4">
                                        <div>
                                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                                                Upload an audio sample (MP3, WAV, etc.) to create a clone of your voice. This cloned voice can be used in AI-generated videos to speak any text you provide.
                                            </p>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="file"
                                                    ref={voiceFileInputRef}
                                                    onChange={handleVoiceFileChange}
                                                    className="hidden"
                                                    accept="audio/*,.mp3,.wav,.m4a,.ogg"
                                                />
                                                <button
                                                    onClick={() => voiceFileInputRef.current?.click()}
                                                    disabled={isUploadingVoice || userCustomVoices.length >= voiceLimit}
                                                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                >
                                                    <UploadIcon className="w-4 h-4" />
                                                    {isUploadingVoice ? 'Uploading & Cloning...' : 'Upload Voice Sample'}
                                                </button>
                                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                                    {userCustomVoices.length} / {voiceLimit === Infinity ? '∞' : voiceLimit} voices
                                                </span>
                                            </div>
                                            {isUploadingVoice && (
                                                <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                                                    ⏳ Uploading and cloning your voice... This may take a minute.
                                                </p>
                                            )}
                                        </div>

                                        {userCustomVoices.length > 0 && (
                                            <div className="mt-4">
                                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                                    Your Cloned Voices:
                                                </h4>
                                                <div className="space-y-2">
                                                    {userCustomVoices.map((voice) => (
                                                        <div
                                                            key={voice.id}
                                                            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <VoiceIcon className="w-5 h-5 text-primary-600" />
                                                                <div>
                                                                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                                                                        {voice.name}
                                                                    </p>
                                                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                                                        {voice.isCloned ? (
                                                                            <span className="text-green-600 dark:text-green-400">✓ Cloned & Ready</span>
                                                                        ) : (
                                                                            <span className="text-amber-600 dark:text-amber-400">⚠ Uploaded (cloning failed)</span>
                                                                        )}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() => handleDeleteVoice(voice.id)}
                                                                className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                                                title="Delete voice"
                                                            >
                                                                <TrashIcon className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                            <p className="text-xs text-blue-800 dark:text-blue-200">
                                                <strong>Tip:</strong> For best results, upload a clear audio sample (at least 30 seconds) of you speaking naturally. The cloned voice will be used in video generation to speak any text you provide.
                                            </p>
                                        </div>
                                    </div>
                                </>
                            )}
                        </SettingsSection>
                    </>
                )}

                {activeTab === 'billing' && (
                    <>
                     <SettingsSection title="Subscription">
                         <div className="flex items-center justify-between">
                             <div>
                                 <p className="text-gray-900 dark:text-white font-medium">Current Plan</p>
                                 <p className="text-2xl font-bold text-primary-600">{user.plan}</p>
                                 {isSubscriptionCancelled && subscriptionEndDate && remainingTime && !remainingTime.expired && (
                                     <div className="mt-2 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                                         <ClockIcon className="w-4 h-4" />
                                         <span>
                                             Access until {new Date(subscriptionEndDate).toLocaleDateString()} 
                                             {remainingTime.days !== undefined && remainingTime.days > 0 && (
                                                 ` (${remainingTime.days} ${remainingTime.days === 1 ? 'day' : 'days'} remaining)`
                                             )}
                                         </span>
                                     </div>
                                 )}
                             </div>
                             <button onClick={() => setActivePage('pricing')} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">Manage Plan</button>
                         </div>
                         
                         {isSubscriptionCancelled && (
                             <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                                 <div className="flex items-start gap-3">
                                     <div className="flex-1">
                                         <h4 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">Subscription Cancelled</h4>
                                         <p className="text-sm text-amber-700 dark:text-amber-300">
                                             Your subscription is set to cancel at the end of your billing period. You'll continue to have full access until then.
                                         </p>
                                         {remainingTime && !remainingTime.expired && (
                                             <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mt-2">
                                                 {remainingTime.days !== undefined && remainingTime.days > 0 ? (
                                                     `${remainingTime.days} ${remainingTime.days === 1 ? 'day' : 'days'} remaining`
                                                 ) : remainingTime.hours !== undefined && remainingTime.hours > 0 ? (
                                                     `${remainingTime.hours} ${remainingTime.hours === 1 ? 'hour' : 'hours'} remaining`
                                                 ) : remainingTime.minutes !== undefined && remainingTime.minutes > 0 ? (
                                                     `${remainingTime.minutes} ${remainingTime.minutes === 1 ? 'minute' : 'minutes'} remaining`
                                                 ) : (
                                                     'Less than a minute remaining'
                                                 )}
                                             </p>
                                         )}
                                     </div>
                                     <button
                                         onClick={handleReactivateSubscription}
                                         disabled={isCancelling}
                                         className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 font-semibold whitespace-nowrap"
                                     >
                                         {isCancelling ? 'Reactivating...' : 'Reactivate'}
                                     </button>
                                 </div>
                             </div>
                         )}

                         {isPremiumPlan && !isSubscriptionCancelled && (
                             <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                                 <button
                                     onClick={() => setShowCancelModal(true)}
                                     className="px-4 py-2 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 font-medium"
                                 >
                                     Cancel Subscription
                                 </button>
                             </div>
                         )}

                         <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                             <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Usage this month</p>
                             <div className="space-y-2">
                                 <div className="flex justify-between text-sm text-gray-700 dark:text-gray-300">
                                     <span>Image Generations</span>
                                     <span className="font-mono">{user.monthlyImageGenerationsUsed} used</span>
                                 </div>
                                 <div className="flex justify-between text-sm text-gray-700 dark:text-gray-300">
                                     <span>Video Generations</span>
                                     <span className="font-mono">{user.monthlyVideoGenerationsUsed} used</span>
                                 </div>
                             </div>
                         </div>
                     </SettingsSection>

                     {/* Cancel Subscription Modal */}
                     {showCancelModal && (
                         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm">
                             <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4 p-6 animate-fade-in">
                                 <div className="flex items-center justify-between mb-4">
                                     <h3 className="text-xl font-bold text-gray-900 dark:text-white">Cancel Subscription</h3>
                                     <button
                                         onClick={() => setShowCancelModal(false)}
                                         className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                                     >
                                         <XMarkIcon className="w-6 h-6" />
                                     </button>
                                 </div>
                                 
                                 <div className="mb-6">
                                     <p className="text-gray-600 dark:text-gray-300 mb-4">
                                         Are you sure you want to cancel your subscription? You'll continue to have full access to all features until the end of your current billing period.
                                     </p>
                                     
                                     <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                                         <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">What happens next:</p>
                                         <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
                                             <li>Your subscription will remain active until {billingCycle === 'annually' ? 'the end of the year' : 'the end of the month'}</li>
                                             <li>You'll retain full access to all premium features</li>
                                             <li>Your account will automatically switch to Free plan after the period ends</li>
                                             <li>You can reactivate anytime before the period ends</li>
                                         </ul>
                                     </div>
                                 </div>

                                 <div className="flex justify-end gap-3">
                                     <button
                                         onClick={() => setShowCancelModal(false)}
                                         className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
                                     >
                                         Keep Subscription
                                     </button>
                                     <button
                                         onClick={handleCancelSubscription}
                                         disabled={isCancelling}
                                         className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-semibold"
                                     >
                                         {isCancelling ? 'Cancelling...' : 'Cancel Subscription'}
                                     </button>
                                 </div>
                             </div>
                         </div>
                     )}
                    </>
                )}
            </div>
            </div>
        </div>
    );
};