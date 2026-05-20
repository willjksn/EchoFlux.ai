import React, { useState, useRef, useMemo, useEffect, useCallback, lazy, Suspense } from 'react';
import { Settings as AppSettings, Platform, CustomVoice, SocialAccount } from '../types';
import { OFFLINE_MODE, CONNECTION_VISIBLE_PLATFORMS, ANALYTICS_ENABLED, VIDEO_MINUTE_PACKS } from '../constants';
import { InstagramIcon, TikTokIcon, ThreadsIcon, XIcon, YouTubeIcon, LinkedInIcon, FacebookIcon, PinterestIcon } from './icons/PlatformIcons';
import { useAppContext } from './AppContext';
import { UpgradePrompt } from './UpgradePrompt';
import { UploadIcon, TrashIcon, SettingsIcon, LinkIcon, SparklesIcon, CreditCardIcon, CheckCircleIcon, XMarkIcon, ClockIcon, VoiceIcon, HeartIcon } from './icons/UIIcons';
import { db, storage, auth } from '../firebaseConfig';
// @ts-ignore
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll, getMetadata } from 'firebase/storage';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { connectSocialAccount, disconnectSocialAccount } from '../src/services/socialMediaService';
import { startXOAuth1Authorization } from '../src/lib/startXOAuth1Authorization';
import { PLATFORM_CAPABILITIES, hasCapability, getCapabilityDescription, getCapability, isFullySupported } from '../src/services/platformCapabilities';
import { isCreatorIdentityPlanClient } from '../src/lib/creatorIdentity/planGate';
import { hasPremiumStudioRouteAccess } from '../src/utils/planAccess';
import { EchoFluxHowItWorksModal } from './EchoFluxHowItWorksModal';

const CreatorIdentityBuilder = lazy(() =>
    import('./CreatorIdentityBuilder').then((m) => ({ default: m.CreatorIdentityBuilder }))
);

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
  Pinterest: <PinterestIcon />,
  'My Page': <HeartIcon />,
};

const COMING_SOON_PLATFORMS: Platform[] = [];

const AccountConnection: React.FC<{
    platform: Platform;
    account: SocialAccount | null;
    isConnecting: boolean;
    onConnect: (platform: Platform) => Promise<void>;
    onDisconnect: (platform: Platform) => Promise<void>;
    onEnableMediaUploads?: () => Promise<void>;
    comingSoon?: boolean;
}> = ({ platform, account, isConnecting, onConnect, onDisconnect, onEnableMediaUploads, comingSoon }) => {
    const isConnected = account?.connected || false;
    const accountUsername = account?.accountUsername;
    const accountDisplayName = account?.accountName;
    // Check if OAuth 1.0a is connected (for X media uploads)
    const hasOAuth1 = platform === 'X' && account && (account as any).oauthToken && (account as any).oauthTokenSecret;

    return (
        <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-3 flex-1">
                    <span className="text-gray-600 dark:text-gray-300">{platformIcons[platform]}</span>
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-800 dark:text-gray-200">{platform}</span>
                            {isConnected && (
                                <CheckCircleIcon className="w-4 h-4 text-green-500 dark:text-green-400" />
                            )}
                        </div>
                        {accountUsername ? (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">@{accountUsername}</p>
                        ) : accountDisplayName ? (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{accountDisplayName}</p>
                        ) : null}
                        {/* Show available features for this platform */}
                        {isConnected && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                                {hasCapability(platform, 'publishing') && (
                                    <span 
                                        className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 cursor-help"
                                        title={isFullySupported(platform, 'publishing') 
                                            ? 'Posting: Fully supported' 
                                            : `Posting: ${getCapabilityDescription(getCapability(platform, 'publishing') || false)}`}
                                    >
                                        Posting
                                        {!isFullySupported(platform, 'publishing') && ' ⚠️'}
                                    </span>
                                )}
                                {ANALYTICS_ENABLED && hasCapability(platform, 'analytics') && platform !== 'X' && (
                                    <span 
                                        className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 cursor-help"
                                        title={isFullySupported(platform, 'analytics') 
                                            ? 'Analytics: Fully supported' 
                                            : `Analytics: ${getCapabilityDescription(getCapability(platform, 'analytics') || false)}`}
                                    >
                                        Analytics
                                        {!isFullySupported(platform, 'analytics') && ' ⚠️'}
                                    </span>
                                )}
                                {platform === 'X' && (
                                    <span
                                        className={`text-xs px-1.5 py-0.5 rounded ${hasOAuth1 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}
                                        title={hasOAuth1 ? 'Media uploads enabled' : 'Media uploads require additional permission; reconnect X to enable'}
                                    >
                                        Media {hasOAuth1 ? 'Enabled' : 'Pending'}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                {comingSoon ? (
                    <span
                        className="px-4 py-1.5 text-sm font-semibold rounded-full bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-400 cursor-not-allowed whitespace-nowrap"
                        title="This platform is not available yet."
                    >
                        Coming soon
                    </span>
                ) : (
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
                )}
                {platform === 'X' && isConnected && !hasOAuth1 && onEnableMediaUploads && (
                    <div className="mt-2">
                        <button
                            onClick={onEnableMediaUploads}
                            disabled={isConnecting}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Enable media uploads
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

type SettingsTab = 'general' | 'connections' | 'ai-training' | 'billing';

export const Settings: React.FC = () => {
    const { user, setUser, settings, setSettings, setActivePage, selectedClient, userCustomVoices, setUserCustomVoices, showToast, setPricingView, socialAccounts } = useAppContext();
    const [activeTab, setActiveTab] = useState<SettingsTab>('general');
    const [showCreatorIdentityBuilder, setShowCreatorIdentityBuilder] = useState(false);
    const [fileName, setFileName] = useState<string | null>(null);
    const [isUploadingVoice, setIsUploadingVoice] = useState(false);

    useEffect(() => {
        const tabOverride = localStorage.getItem('settingsActiveTab') as SettingsTab | null;
        if (tabOverride && tabOverride !== activeTab) {
            setActiveTab(tabOverride);
            localStorage.removeItem('settingsActiveTab');
        }
        try {
            if (localStorage.getItem('openCreatorIdentityBuilder') === '1') {
                localStorage.removeItem('openCreatorIdentityBuilder');
                setShowCreatorIdentityBuilder(true);
            }
        } catch {
            /* ignore */
        }
    }, [activeTab]);
    const [connectingPlatform, setConnectingPlatform] = useState<Platform | null>(null);
    const [showInstagramSetupModal, setShowInstagramSetupModal] = useState(false);
    const [showFacebookSetupModal, setShowFacebookSetupModal] = useState(false);
    const [showConnectionGuideModal, setShowConnectionGuideModal] = useState(false);
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [identitySummaryElite, setIdentitySummaryElite] = useState<string | null>(null);
    const [showPersonalityHowItWorks, setShowPersonalityHowItWorks] = useState(false);

    useEffect(() => {
        if (!user?.id || !isCreatorIdentityPlanClient(user.plan)) return;
        (async () => {
            try {
                const token = await auth.currentUser?.getIdToken();
                if (!token) return;
                const r = await fetch('/api/getCreatorIdentity', { headers: { Authorization: `Bearer ${token}` } });
                if (!r.ok) return;
                const data = await r.json();
                const p = data.profile;
                const sum = p?.generatedProfile?.brandSummary;
                if (typeof sum === 'string' && sum.trim()) setIdentitySummaryElite(sum.trim());
            } catch {
                /* ignore */
            }
        })();
    }, [user?.id, user?.plan]);

    const openCreatorIdentityBuilder = useCallback(() => {
        if (!isCreatorIdentityPlanClient(user?.plan)) {
            showToast?.('Creator Identity Builder is included with Elite.', 'info');
            return;
        }
        if (!hasPremiumStudioRouteAccess(user)) {
            showToast?.('Upgrade to Elite for Creator Identity.', 'info');
            setActivePage('pricing');
            return;
        }
        try {
            localStorage.setItem('settingsActiveTab', 'ai-training');
        } catch {
            /* ignore */
        }
        setShowCreatorIdentityBuilder(true);
        setActiveTab('ai-training');
        setActivePage('settings');
        window.history.pushState({}, '', '/settings');
        window.dispatchEvent(new PopStateEvent('popstate'));
    }, [setActivePage, showToast, user]);

    // Video minutes state
    const [videoQuota, setVideoQuota] = useState<{
        monthlyMinutesLimit: number;
        minutesUsedThisMonth: number;
        bonusMinutes: number;
        totalMinutesAllTime: number;
    } | null>(null);
    const [isLoadingVideoQuota, setIsLoadingVideoQuota] = useState(false);
    const [isPurchasingMinutes, setIsPurchasingMinutes] = useState<string | null>(null);
    const [storageUsage, setStorageUsage] = useState<{ used: number; total: number }>({ used: 0, total: 100 });
    const [isLoadingStorage, setIsLoadingStorage] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const voiceFileInputRef = useRef<HTMLInputElement>(null);
    
    // Creator Profile state
    const [creatorGender, setCreatorGender] = useState('');
    const [targetAudienceGender, setTargetAudienceGender] = useState('');
    const [contentNiche, setContentNiche] = useState('');
    const [isSavingCreatorProfile, setIsSavingCreatorProfile] = useState(false);

    // Safe default for socialAccounts if undefined
    const safeSocialAccounts: Record<Platform, SocialAccount | null> = socialAccounts || {
        Instagram: null,
        TikTok: null,
        X: null,
        Threads: null,
        YouTube: null,
        LinkedIn: null,
        Facebook: null,
        Pinterest: null,
    };

    // Proactively refresh X token when user opens Connections so token stays fresh
    useEffect(() => {
        if (activeTab !== 'connections' || !user || !safeSocialAccounts?.X?.connected) return;
        const run = async () => {
            try {
                const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
                if (!token) return;
                const r = await fetch('/api/oauth/x/refresh', { headers: { Authorization: `Bearer ${token}` } });
                if (r.status === 401 || r.status === 400) {
                    const data = await r.json().catch(() => ({}));
                    showToast(data?.details || 'X connection expired. Please reconnect.', 'info');
                }
            } catch {
                // Ignore
            }
        };
        run();
    }, [activeTab, user?.id, safeSocialAccounts?.X?.connected]);
    
    // Load creator profile settings from Firestore
    useEffect(() => {
        const loadCreatorProfile = async () => {
            if (!user?.id) return;
            try {
                const { getDoc } = await import('firebase/firestore');
                const userDoc = await getDoc(doc(db, 'users', user.id));
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    setCreatorGender(data.creatorGender || '');
                    setTargetAudienceGender(data.targetAudienceGender || '');
                    setContentNiche(data.niche || '');
                }
            } catch (error) {
                console.error('Error loading creator profile:', error);
            }
        };
        loadCreatorProfile();
    }, [user?.id]);
    
    // Save creator profile to Firestore
    const handleSaveCreatorProfile = async () => {
        if (!user?.id) {
            showToast('Please log in to save your profile.', 'error');
            return;
        }
        setIsSavingCreatorProfile(true);
        try {
            await setDoc(doc(db, 'users', user.id), {
                creatorGender,
                targetAudienceGender,
                niche: contentNiche,
                updatedAt: new Date().toISOString(),
            }, { merge: true });
            // Update local user state so other components see the change
            if (setUser && user) {
                setUser({ ...user, niche: contentNiche });
            }
            showToast('Creator profile saved!', 'success');
        } catch (error: any) {
            console.error('Error saving creator profile:', error);
            showToast(error?.message || 'Failed to save profile.', 'error');
        } finally {
            setIsSavingCreatorProfile(false);
        }
    };
    
    const isPremiumFeatureUnlocked = ['Elite', 'Agency'].includes(user?.plan || 'Free') || user?.role === 'Admin';

    const voiceLimit = useMemo(() => {
        if (!user) return 0;
        if (user.role === 'Admin') return Infinity;
        switch(user.plan) {
            case 'Pro': return 1;
            case 'Elite': return 3;
            case 'Agency': return Infinity;
            default: return 0;
        }
    }, [user?.plan, user?.role]);

    // Explicitly ensure Admins have access to voice cloning
    const isVoiceFeatureUnlocked = voiceLimit > 0 || user?.role === 'Admin';
    
    // Debug logging (remove in production)
    if (process.env.NODE_ENV === 'development' && user?.role === 'Admin') {
        console.log('Admin user detected - voice cloning should be unlocked', { 
            role: user.role, 
            voiceLimit, 
            isVoiceFeatureUnlocked 
        });
    }

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
        if (key === 'spiciness' && typeof value === 'number' && user && setUser) {
            void setUser({
                ...user,
                explicitnessLevel: Math.max(0, Math.min(10, Math.round(value / 10))),
                settings: {
                    ...settings,
                    tone: {
                        ...settings.tone,
                        spiciness: value,
                    },
                },
            });
        }
    };

    const handleConnectAccount = async (platform: Platform) => {
        // Allow admins to connect accounts even in offline mode (for testing)
        if (OFFLINE_MODE && user?.role !== 'Admin') {
            showToast('Account connections are disabled in this version. EchoFlux.ai is currently focused on planning and content creation. You can still plan campaigns and copy content to post manually.', 'info');
            return;
        }
        // Show Instagram setup modal if Instagram is not connected
        if (platform === 'Instagram' && !safeSocialAccounts?.Instagram?.connected) {
            setShowInstagramSetupModal(true);
            return;
        }
        // Show Facebook setup modal if Facebook is not connected
        if (platform === 'Facebook' && !safeSocialAccounts?.Facebook?.connected) {
            setShowFacebookSetupModal(true);
            return;
        }
        
        setConnectingPlatform(platform);
        try {
            await connectSocialAccount(platform);
            // OAuth flow will redirect, so we don't need to do anything else here
            // The useEffect will handle the callback
        } catch (error: any) {
            console.error(`Failed to connect ${platform}:`, error);
            // Provide more specific error messages for X
            let errorMessage = `Failed to connect ${platform}.`;
            if (platform === 'X') {
                if (error.message?.includes('not configured') || error.message?.includes('Missing')) {
                    errorMessage = 'X OAuth is not configured. Please contact support or check your environment variables.';
                } else if (error.message?.includes('Invalid authorization URL')) {
                    errorMessage = 'Invalid X OAuth URL. Please try again or contact support.';
                } else {
                    errorMessage = `Failed to connect X: ${error.message || 'Please check your X Developer Portal settings and try again.'}`;
                }
            } else {
                errorMessage = error.message || `Failed to connect ${platform}. Please try again.`;
            }
            showToast(errorMessage, 'error');
            setConnectingPlatform(null);
        }
    };
    
    const handleProceedWithInstagramConnect = async () => {
        setShowInstagramSetupModal(false);
        
        setConnectingPlatform('Instagram');
        try {
            await connectSocialAccount('Instagram');
            // OAuth flow will redirect
        } catch (error: any) {
            console.error('Failed to connect Instagram:', error);
            showToast('Failed to connect Instagram. Please try again.', 'error');
            setConnectingPlatform(null);
        }
    };

    const handleProceedWithFacebookConnect = async () => {
        setShowFacebookSetupModal(false);

        setConnectingPlatform('Facebook');
        try {
            await connectSocialAccount('Facebook');
            // OAuth flow will redirect
        } catch (error: any) {
            console.error('Failed to connect Facebook:', error);
            showToast('Failed to connect Facebook. Please try again.', 'error');
            setConnectingPlatform(null);
        }
    };

    const handleConnectOAuth1 = async () => {
        if (OFFLINE_MODE && user?.role !== 'Admin') {
            showToast('X OAuth is disabled in this version. EchoFlux.ai is currently focused on offline planning and content creation.', 'info');
            return;
        }
        setConnectingPlatform('X');
        try {
            await startXOAuth1Authorization();
        } catch (error: any) {
            console.error('Failed to connect OAuth 1.0a:', error);
            let errorMsg = error?.message || 'Failed to connect OAuth 1.0a. Please try again.';
            if (errorMsg.includes('callback URL') || errorMsg.includes('callback') || errorMsg.includes('Callback')) {
                errorMsg = 'OAuth 1.0a callback not approved. In X Developer Portal → App → Settings → App details, add BOTH callback URLs to the list: (1) https://echoflux.ai/api/oauth/x/callback (2) https://echoflux.ai/api/oauth/x/callback-oauth1 — Also try adding TWITTER_API_KEY and TWITTER_API_SECRET (from Keys and tokens tab) to Vercel.';
            }
            showToast(errorMsg, 'error');
            setConnectingPlatform(null);
        }
    };

    const handleDebugX = async () => {
        if (user?.role !== 'Admin') return;
        try {
            const token = auth.currentUser
                ? await auth.currentUser.getIdToken(true)
                : null;

            if (!token) {
                throw new Error('User must be logged in');
            }

            const response = await fetch('/api/oauth/x/debug', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.details || errorData.error || 'Failed to load X debug info');
            }

            const result = await response.json();
            console.log('X OAuth debug:', result);
            showToast(
                `X Debug — keySource: ${result.keySource}, keyPrefix: ${result.consumerKeyPrefix || 'none'}, oauth1Tokens: ${result.hasOAuth1Tokens ? 'yes' : 'no'}`,
                'info'
            );
        } catch (error: any) {
            console.error('Failed to load X OAuth debug:', error);
            showToast(error.message || 'Failed to load X OAuth debug info', 'error');
        }
    };

    const handleDisconnectAccount = async (platform: Platform) => {
        // Allow admins to disconnect accounts even in offline mode (for testing)
        if (OFFLINE_MODE && user?.role !== 'Admin') {
            showToast('Account connections are disabled in this version.', 'info');
            return;
        }
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
            // Remove userType field instead of setting to undefined
            const { userType, ...userWithoutType } = user;
            await setUser({ ...userWithoutType, hasCompletedOnboarding: false });
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

    // Calculate storage usage
    useEffect(() => {
        if (!user) return;
        
        const calculateStorageUsage = async () => {
            setIsLoadingStorage(true);
            try {
                let totalSize = 0;
                
                // List all files in user's storage folders - matching Profile.tsx
                const folders = ['uploads', 'media_library', 'automation', 'voices', 'profile_avatar', 'bio_avatar', 'roadmap'];
                
                for (const folder of folders) {
                    try {
                        const folderRef = ref(storage, `users/${user.id}/${folder}`);
                        const result = await listAll(folderRef);
                        
                        // Get metadata for each file to get size
                        const metadataPromises = result.items.map(async (itemRef) => {
                            try {
                                const metadata = await getMetadata(itemRef);
                                return metadata.size || 0;
                            } catch (error) {
                                console.warn(`Failed to get metadata for ${itemRef.fullPath}:`, error);
                                return 0;
                            }
                        });
                        
                        const sizes = await Promise.all(metadataPromises);
                        totalSize += sizes.reduce((sum, size) => sum + size, 0);
                    } catch (error) {
                        console.warn(`Failed to list files in ${folder}:`, error);
                    }
                }
                
                // Convert bytes to MB
                const usedMB = totalSize / (1024 * 1024);
                
                // Set storage limits based on plan (in MB) - matching Profile.tsx
                const storageLimits: Record<string, number> = {
                    'Free': 100,
                    'Pro': 5120, // 5 GB
                    'Elite': 10240, // 10 GB
                    'Starter': 1024, // 1 GB
                    'Growth': 10240, // 10 GB
                    'Agency': 51200, // 50 GB
                };
                
                const totalMB = storageLimits[user.plan || 'Free'] || 100;
                
                setStorageUsage({
                    used: usedMB,
                    total: totalMB === Infinity ? usedMB * 2 : totalMB, // Show 2x used if unlimited
                });
            } catch (error) {
                console.error('Failed to calculate storage usage:', error);
            } finally {
                setIsLoadingStorage(false);
            }
        };
        
        calculateStorageUsage();
    }, [user?.id, user?.plan]);

    // Fetch video quota for billing tab
    useEffect(() => {
        if (activeTab !== 'billing' || !user?.id) return;
        
        const fetchVideoQuota = async () => {
            setIsLoadingVideoQuota(true);
            try {
                const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
                const res = await fetch(`/api/videoUsageStats?creatorId=${user.id}`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                if (res.ok) {
                    const data = await res.json();
                    setVideoQuota(data.quota);
                }
            } catch (error) {
                console.error('Error fetching video quota:', error);
            } finally {
                setIsLoadingVideoQuota(false);
            }
        };
        
        fetchVideoQuota();
    }, [activeTab, user?.id]);

    const handlePurchaseVideoMinutes = async (packId: string) => {
        if (!user?.id) return;
        setIsPurchasingMinutes(packId);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            const res = await fetch('/api/purchaseVideoMinutes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ packId }),
            });
            
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Failed to create checkout');
            }
            
            const { url } = await res.json();
            if (url) {
                window.location.href = url;
            }
        } catch (error: any) {
            showToast(error.message || 'Failed to purchase video minutes', 'error');
        } finally {
            setIsPurchasingMinutes(null);
        }
    };

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
    const subscriptionCurrentPeriodEnd = user?.subscriptionCurrentPeriodEnd;
    const trialEndDate = user?.trialEndDate;
    const subscriptionStatus = (user?.subscriptionStatus || '').toLowerCase();

    type RemainingParts = { days: number; hours: number; minutes: number; expired: boolean; endDate: Date };

    const diffUntilEnd = (endIso: string | undefined | null): RemainingParts | null => {
        if (!endIso) return null;
        const endDate = new Date(endIso);
        if (Number.isNaN(endDate.getTime())) return null;
        const diffMs = endDate.getTime() - Date.now();
        if (diffMs <= 0) return { expired: true, days: 0, hours: 0, minutes: 0, endDate };
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        return { days, hours, minutes, expired: false, endDate };
    };

    /** Cancel-at-period-end — same instant as end of current Stripe period */
    const remainingTime =
        user?.cancelAtPeriodEnd && subscriptionEndDate ? diffUntilEnd(subscriptionEndDate) : null;

    /** Trial, active renewal, or cancel — single summary under Current Plan */
    const accessSummary: { label: string; parts: RemainingParts } | null = (() => {
        if (user?.cancelAtPeriodEnd && subscriptionEndDate) {
            const parts = diffUntilEnd(subscriptionEndDate);
            if (parts && !parts.expired) return { label: 'Access until', parts };
            return null;
        }
        if (subscriptionStatus === 'trialing' && trialEndDate) {
            const parts = diffUntilEnd(trialEndDate);
            if (parts && !parts.expired) return { label: 'Trial ends', parts };
            return null;
        }
        if (isPremiumPlan && subscriptionCurrentPeriodEnd) {
            const parts = diffUntilEnd(subscriptionCurrentPeriodEnd);
            if (parts && !parts.expired) {
                const label =
                    billingCycle === 'annually' || billingCycle === 'annual'
                        ? 'Current annual period ends'
                        : 'Next billing date';
                return { label, parts };
            }
        }
        return null;
    })();

    const handleCancelSubscription = async () => {
        if (!user) return;
        
        setIsCancelling(true);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            const response = await fetch('/api/cancelSubscription', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ action: 'cancel' }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to cancel subscription');
            }

            const data = await response.json();
            
            // Update local user state
            await setUser({ 
                ...user, 
                cancelAtPeriodEnd: true,
                subscriptionEndDate: data.subscriptionEndDate || null,
                subscriptionCurrentPeriodEnd: data.subscriptionCurrentPeriodEnd ?? user.subscriptionCurrentPeriodEnd,
            });
            
            showToast(data.message || 'Subscription cancelled. You will retain access until the end of your billing period.', 'success');
            setShowCancelModal(false);
        } catch (error: any) {
            console.error('Failed to cancel subscription:', error);
            showToast(error.message || 'Failed to cancel subscription. Please try again.', 'error');
        } finally {
            setIsCancelling(false);
        }
    };

    const handleReactivateSubscription = async () => {
        if (!user) return;
        
        setIsCancelling(true);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            const response = await fetch('/api/cancelSubscription', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ action: 'reactivate' }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to reactivate subscription');
            }

            const data = await response.json();
            
            // Update local user state
            await setUser({ 
                ...user, 
                cancelAtPeriodEnd: false,
                subscriptionEndDate: undefined,
                subscriptionCurrentPeriodEnd: data.subscriptionCurrentPeriodEnd ?? user.subscriptionCurrentPeriodEnd,
            });
            
            showToast(data.message || 'Subscription reactivated successfully!', 'success');
        } catch (error: any) {
            console.error('Failed to reactivate subscription:', error);
            showToast(error.message || 'Failed to reactivate subscription. Please try again.', 'error');
        } finally {
            setIsCancelling(false);
        }
    };

    const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
      { id: 'general', label: 'General', icon: <SettingsIcon /> },
      { id: 'connections', label: 'Connections', icon: <LinkIcon /> },
      { id: 'ai-training', label: 'Profile & AI', icon: <SparklesIcon /> },
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
                            id={tab.id === 'ai-training' ? 'tour-step-5-ai-training-tab' : undefined}
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
                            <>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Connect your social media accounts.</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {CONNECTION_VISIBLE_PLATFORMS.map(platform => {
                                        const account = safeSocialAccounts && safeSocialAccounts[platform] ? safeSocialAccounts[platform] : null;
                                        return (
                                            <AccountConnection 
                                                key={platform}
                                                platform={platform}
                                                account={account}
                                                isConnecting={connectingPlatform === platform}
                                                onConnect={handleConnectAccount}
                                                onDisconnect={handleDisconnectAccount}
                                                onEnableMediaUploads={platform === 'X' ? handleConnectOAuth1 : undefined}
                                                comingSoon={COMING_SOON_PLATFORMS.includes(platform)}
                                            />
                                        );
                                    })}
                                </div>
                                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 px-4 py-3">
                                    <p className="text-sm text-gray-600 dark:text-gray-300">
                                        Need help connecting social accounts?
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => setShowConnectionGuideModal(true)}
                                        className="px-3 py-1.5 text-sm font-semibold rounded-md bg-primary-600 text-white hover:bg-primary-700 transition-colors"
                                    >
                                        Connection requirements
                                    </button>
                                </div>
                                {user?.role === 'Admin' && (
                                    <div className="mt-3 flex items-center justify-end">
                                        <button
                                            onClick={handleDebugX}
                                            className="px-3 py-1.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 transition-colors"
                                        >
                                            Debug X OAuth
                                        </button>
                                    </div>
                                )}
                            </>
                    </SettingsSection>
                )}

                {activeTab === 'general' && (
                    <>
                        {/* Inbox auto-suggest is not enabled in the current product scope */}
                        {false && (
                          <SettingsSection title="General Automation">
                              <ToggleSwitch label="Enable Auto-Suggest" enabled={settings.autoReply} onChange={(val) => updateSetting('autoReply', val)} />
                              <p className="text-sm text-gray-500 dark:text-gray-400">When enabled, EchoFlux.ai will automatically generate a suggested reply for incoming messages.</p>
                              <hr className="border-gray-200 dark:border-gray-700" />
                              {/* Auto-Respond is disabled in AI Content Studio mode */}
                              {false && (
                                <>
                                  <ToggleSwitch label="Enable Auto-Respond" enabled={settings.autoRespond} onChange={(val) => updateSetting('autoRespond', val)} />
                                  <p className="text-sm text-gray-500 dark:text-gray-400">When enabled, EchoFlux.ai will automatically send the generated reply without manual approval. Use with caution.</p>
                                </>
                              )}
                          </SettingsSection>
                        )}
                        <SettingsSection title="Safety & Accessibility">
                            <ToggleSwitch label="Safe Mode" enabled={settings.safeMode} onChange={(val) => updateSetting('safeMode', val)} />
                            <p className="text-sm text-gray-500 dark:text-gray-400">Prevents the AI from generating replies with profanity or discussing sensitive topics.</p>
                        </SettingsSection>
                        {/* Account Type section hidden in AI Content Studio mode */}
                        {false && (
                          <SettingsSection title="Account Type">
                              <div className="space-y-3">
                                  <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Current Account Type</p>
                                      <p className="text-lg font-bold text-primary-600 dark:text-primary-400">
                                          {user?.userType === 'Business' ? 'Business' : user?.userType === 'Creator' ? 'Creator' : 'Not Set'}
                                      </p>
                                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                          Your plan: <span className="font-semibold">{user?.plan}</span>
                                      </p>
                                  </div>
                                  {user?.userType === 'Business' && (
                                      <button 
                                          onClick={handleSwitchToCreator} 
                                          className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
                                      >
                                          Switch to Creator Mode
                                      </button>
                                  )}
                                  {user?.userType === 'Creator' && (
                                      <button 
                                          onClick={handleSwitchToBusiness} 
                                          className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
                                      >
                                          Switch to Business Mode
                                      </button>
                                  )}
                              </div>
                          </SettingsSection>
                        )}
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
                        <p className="text-sm text-gray-600 dark:text-gray-400 -mt-2 mb-2">
                            Your profile, brand baseline (Elite), tone sliders, and Personality Override live here so you don&apos;t have to jump between tabs.
                        </p>
                        <SettingsSection title="Creator Profile">
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                                Help the AI generate content that matches you and appeals to your audience.
                            </p>

                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Content Focus
                                </label>
                                <input
                                    type="text"
                                    value={contentNiche}
                                    onChange={(e) => setContentNiche(e.target.value)}
                                    placeholder="e.g., Fitness, Lifestyle, Gaming, Fashion, Art (comma-separated for multiple)"
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    Helps AI tailor content ideas and suggestions to your brand.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        I am a...
                                    </label>
                                    <select
                                        value={creatorGender}
                                        onChange={(e) => setCreatorGender(e.target.value)}
                                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    >
                                        <option value="">Select...</option>
                                        <option value="Female">Female Creator</option>
                                        <option value="Male">Male Creator</option>
                                        <option value="Non-binary">Non-binary Creator</option>
                                        <option value="Couple">Couple</option>
                                        <option value="Other">Other</option>
                                    </select>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Used to generate appropriate content ideas and visuals.
                                    </p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        My audience is...
                                    </label>
                                    <select
                                        value={targetAudienceGender}
                                        onChange={(e) => setTargetAudienceGender(e.target.value)}
                                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    >
                                        <option value="">Select...</option>
                                        <option value="Male">Mostly Men</option>
                                        <option value="Female">Mostly Women</option>
                                        <option value="Both">Both / Mixed</option>
                                        <option value="All">All Audiences</option>
                                    </select>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Who your content is primarily for.
                                    </p>
                                </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                                <button
                                    onClick={handleSaveCreatorProfile}
                                    disabled={isSavingCreatorProfile}
                                    className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 transition-colors text-sm font-medium"
                                >
                                    {isSavingCreatorProfile ? 'Saving...' : 'Save Creator Profile'}
                                </button>
                            </div>
                        </SettingsSection>

                        <SettingsSection title="Personality Override">
                            <div className="mb-4 rounded-xl border border-primary-100 bg-gradient-to-br from-primary-50 via-white to-pink-50 p-4 shadow-sm ring-1 ring-primary-100/60 dark:border-primary-900/40 dark:from-gray-900 dark:via-gray-900/95 dark:to-primary-950/25 dark:ring-primary-900/20">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-wide text-primary-600 dark:text-primary-400">
                                            Why this matters
                                        </p>
                                        <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                                            This is how EchoFlux learns to sound like you—not a generic AI voice.
                                        </p>
                                        <p className="mt-2 text-[13px] leading-relaxed text-gray-600 dark:text-gray-300">
                                            When you turn on Personality in Create Post (or related tools), this text is blended with your tone sliders and niche so
                                            captions, hooks, and replies match your real voice, boundaries, and phrases.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowPersonalityHowItWorks(true)}
                                        className="shrink-0 text-xs font-medium text-primary-600 underline-offset-2 hover:text-primary-700 hover:underline dark:text-primary-400 dark:hover:text-primary-300"
                                    >
                                        How it works
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Personality Override (saved text)
                                    </label>
                                    <div className="relative">
                                        <textarea
                                            value={settings.creatorPersonality || ''}
                                            onChange={(e) => updateSetting('creatorPersonality', e.target.value)}
                                            placeholder="Tone or style direction for when Personality Override is turned on during caption or strategy generation."
                                            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[100px]"
                                            rows={4}
                                        />
                                        <button
                                            onClick={async () => {
                                                if (!settings.creatorPersonality?.trim()) {
                                                    showToast('Add a short personality description first, then click AI Help to refine it.', 'error');
                                                    return;
                                                }
                                                try {
                                                    const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
                                                    const prompt = `
Rewrite this creator personality description to be clearer and more actionable for caption writing.

CURRENT DESCRIPTION:
${settings.creatorPersonality}

CONTEXT:
Niche: ${user?.niche || 'Not set'}
Tone: ${settings.tone?.formality !== undefined ? `Formality ${settings.tone.formality}` : 'Not set'}
Humor: ${settings.tone?.humor !== undefined ? `Humor ${settings.tone.humor}` : 'Not set'}
Empathy: ${settings.tone?.empathy !== undefined ? `Empathy ${settings.tone.empathy}` : 'Not set'}
Spiciness: ${settings.tone?.spiciness !== undefined ? `Spiciness ${settings.tone.spiciness}` : 'Not set'}
Emoji Usage: ${settings.tone?.emojiLevel !== undefined ? `Emoji Level ${settings.tone.emojiLevel}` : '50 (default)'}

OUTPUT:
Return only the rewritten personality description.
                                                    `.trim();
                                                    const res = await fetch('/api/generateText', {
                                                        method: 'POST',
                                                        headers: {
                                                            'Content-Type': 'application/json',
                                                            ...(token ? { Authorization: `Bearer ${token}` } : {}),
                                                        },
                                                        body: JSON.stringify({
                                                            prompt,
                                                            context: {
                                                                goal: 'captions',
                                                                tone: user?.plan === 'OnlyFansStudio' ? 'Explicit' : undefined,
                                                            },
                                                        }),
                                                    });
                                                    const data = await res.json();
                                                    if (data.error) {
                                                        throw new Error(data.error || data.note || 'Failed to generate text');
                                                    }
                                                    const rewritten = data.text || data.caption || '';
                                                    if (!rewritten) {
                                                        throw new Error('No text generated');
                                                    }
                                                    updateSetting('creatorPersonality', rewritten);
                                                    showToast('Personality Override text updated.', 'success');
                                                } catch (error: any) {
                                                    showToast(error?.message || 'AI help failed. Please try again.', 'error');
                                                }
                                            }}
                                            className="absolute top-2 right-2 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                                            title="AI Help"
                                        >
                                            <SparklesIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                                        </button>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        {isCreatorIdentityPlanClient(user?.plan)
                                            ? 'Your Creator Identity powers your default brand direction. Use Personality Override when you want a more specific tone or style for a caption, strategy, or output.'
                                            : 'Add a personality or tone direction you want EchoFlux to follow when Personality Override is turned on during caption or strategy generation.'}
                                    </p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Favorite Hashtags
                                    </label>
                                    <textarea
                                        value={settings.favoriteHashtags || ''}
                                        onChange={(e) => updateSetting('favoriteHashtags', e.target.value)}
                                        placeholder="Enter your favorite or frequently used hashtags (one per line or comma-separated). These will be available when generating captions."
                                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[80px]"
                                        rows={3}
                                    />
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Add hashtags you frequently use. They can be automatically included when generating captions if enabled.
                                    </p>
                                </div>
                            </div>
                        </SettingsSection>

                        {isCreatorIdentityPlanClient(user?.plan) && (
                            <div className="rounded-xl border border-primary-200/80 dark:border-primary-800/50 bg-gradient-to-r from-primary-50/90 to-white dark:from-primary-950/40 dark:to-gray-800/80 px-4 py-3 shadow-sm">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                                    <div className="min-w-0 space-y-1">
                                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                            Creator Identity{' '}
                                            <span className="font-medium text-primary-700 dark:text-primary-300">(Elite)</span>
                                        </p>
                                        <p className="text-xs text-gray-600 dark:text-gray-400">
                                            Your saved identity is the default brand baseline for captions and strategy. Open the full
                                            builder below when you want to update it.
                                        </p>
                                        {identitySummaryElite ? (
                                            <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2">{identitySummaryElite}</p>
                                        ) : null}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (showCreatorIdentityBuilder) {
                                                setShowCreatorIdentityBuilder(false);
                                                return;
                                            }
                                            openCreatorIdentityBuilder();
                                        }}
                                        className="shrink-0 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
                                    >
                                        {showCreatorIdentityBuilder ? 'Hide builder' : 'Open Creator Identity'}
                                    </button>
                                </div>
                            </div>
                        )}
                        {showCreatorIdentityBuilder && isCreatorIdentityPlanClient(user?.plan) && (
                            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 p-4 md:p-8 shadow-sm">
                                <Suspense fallback={<p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">Loading Creator Identity…</p>}>
                                    <CreatorIdentityBuilder />
                                </Suspense>
                            </div>
                        )}
                        <SettingsSection title="AI Personality & Tone">
                            <ToneSlider label="Formality" value={settings.tone.formality} onChange={(val) => updateToneSetting('formality', val)} description="Low for casual & slang, high for formal & professional."/>
                            <ToneSlider label="Humor" value={settings.tone.humor} onChange={(val) => updateToneSetting('humor', val)} description="Low for serious, high for witty & funny replies."/>
                            <ToneSlider label="Empathy" value={settings.tone.empathy} onChange={(val) => updateToneSetting('empathy', val)} description="Low for direct, high for supportive & understanding."/>
                            <ToneSlider label="Emoji Usage 😊" value={settings.tone.emojiLevel ?? 50} onChange={(val) => updateToneSetting('emojiLevel', val)} description="Low for no emojis, high for emoji-heavy captions & chat replies."/>
                            <ToneSlider 
                                label="Profanity 🤬" 
                                value={settings.tone.profanity ?? 0} 
                                onChange={(val) => updateToneSetting('profanity', val)} 
                                description="Low for clean language, high for casual swearing in captions & chat."
                            />
                            
                            <hr className="border-gray-200 dark:border-gray-700 my-4" />
                            <ToneSlider
                                label="Spiciness"
                                value={settings.tone.spiciness || 0}
                                onChange={(val) => updateToneSetting('spiciness', val)}
                                description="Low for clean captions, mid for flirty teasing, high for bold/borderline explicit wording where allowed."
                            />
                        </SettingsSection>

                        {/* Voice Clones section hidden in AI Content Studio mode */}
                        {false && (
                          <SettingsSection title="Voice Clones" id="voice-clones">
                              <div className="mb-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                                      ⏳ Coming Soon: Voice cloning feature is currently under development. Check back soon!
                                  </p>
                              </div>
                              {!isVoiceFeatureUnlocked ? (
                                  <UpgradePrompt 
                                      featureName="Voice Cloning" 
                                      onUpgradeClick={() => setActivePage('pricing')}
                                      description={`Upload audio samples to create AI clones of your voice for video voiceovers. Plan limits: Pro (1), Elite (3), Agency (Unlimited).`}
                                  />
                              ) : (
                                  <>
                                      <div className="space-y-4">
                                          {/* Voice cloning UI hidden for now */}
                                      </div>
                                  </>
                              )}
                          </SettingsSection>
                        )}

                        <EchoFluxHowItWorksModal
                          open={showPersonalityHowItWorks}
                          onClose={() => setShowPersonalityHowItWorks(false)}
                          ariaTitleId="personality-override-how-title"
                          title="Personality Override"
                          subtitle="The single best way to make EchoFlux sound like you—not a template."
                        >
                          <section>
                            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
                              What it controls
                            </h4>
                            <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
                              Personality Override is explicit written direction: how you greet people, joke, sign off, swear (or not),
                              reference your community, and steer clear of phrases that feel off-brand. Tone sliders set broad dials; this field
                              fills in the specifics only you know.
                            </p>
                          </section>
                          <section>
                            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
                              Where it applies
                            </h4>
                            <ul className="list-inside list-disc space-y-1 text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
                              <li>Create Post: toggle Personality when generating captions or replies so the model weighs this text heavily.</li>
                              <li>Plan → Today: enable &quot;Prioritize Personality&quot; in Quick settings when idea titles and hooks should mimic your voice.</li>
                              <li>Plan, Fan Hub → Posts, and the in-app assistant may read the same profile when those flows pass personality context.</li>
                            </ul>
                          </section>
                          <section>
                            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
                              How to write a strong override
                            </h4>
                            <ul className="list-inside list-disc space-y-1 text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
                              <li>Open with 2–3 sentences in your own voice—paste something you already posted if it helps.</li>
                              <li>List do&apos;s and don&apos;ts (&quot;never deadname,&quot; &quot;always hype the community,&quot; &quot;emoji only for emphasis&quot;).</li>
                              <li>Mention audience relationship (coach vs best friend vs flirt) so intensity matches your brand.</li>
                              <li>Tap the sparkle <strong className="text-gray-800 dark:text-gray-200">AI Help</strong> button to tighten messy notes into a concise instruction block.</li>
                            </ul>
                          </section>
                          <section>
                            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
                              Elite: Creator Identity vs override
                            </h4>
                            <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
                              If you use Creator Identity, treat that as your default brand spine. Keep Personality Override for experiments, alternate personas,
                              or niche campaigns so you can switch tone without rebuilding the full identity kit.
                            </p>
                          </section>
                        </EchoFluxHowItWorksModal>
                    </>
                )}

                {activeTab === 'billing' && (
                    <>
                     <SettingsSection title="Subscription">
                         <div className="flex items-center justify-between">
                             <div>
                                 <p className="text-gray-900 dark:text-white font-medium">Current Plan</p>
                                 <p className="text-2xl font-bold text-primary-600">{user.plan}</p>
                                 {accessSummary && (
                                     <div
                                         className={`mt-2 flex items-center gap-2 text-sm ${
                                             isSubscriptionCancelled
                                                 ? 'text-amber-600 dark:text-amber-400'
                                                 : 'text-slate-600 dark:text-slate-300'
                                         }`}
                                     >
                                         <ClockIcon className="w-4 h-4 flex-shrink-0" />
                                         <span>
                                             {accessSummary.label}{' '}
                                             {accessSummary.parts.endDate.toLocaleDateString()}
                                             {accessSummary.parts.days > 0 && (
                                                 <span>
                                                     {' '}
                                                     ({accessSummary.parts.days}{' '}
                                                     {accessSummary.parts.days === 1 ? 'day' : 'days'} remaining)
                                                 </span>
                                             )}
                                             {accessSummary.parts.days === 0 &&
                                                 accessSummary.parts.hours > 0 && (
                                                     <span>
                                                         {' '}
                                                         ({accessSummary.parts.hours}{' '}
                                                         {accessSummary.parts.hours === 1 ? 'hour' : 'hours'} remaining)
                                                     </span>
                                                 )}
                                             {accessSummary.parts.days === 0 &&
                                                 accessSummary.parts.hours === 0 &&
                                                 accessSummary.parts.minutes > 0 && (
                                                     <span>
                                                         {' '}
                                                         ({accessSummary.parts.minutes}{' '}
                                                         {accessSummary.parts.minutes === 1 ? 'minute' : 'minutes'}{' '}
                                                         remaining)
                                                     </span>
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
                             {/* Hide per-feature usage; only show storage usage in AI Content Studio mode */}
                             <div className="space-y-2">
                                 <div className="flex justify-between text-sm text-gray-700 dark:text-gray-300 mb-2">
                                     <span>Storage Usage</span>
                                     <span className="font-mono">
                                         {isLoadingStorage ? 'Calculating...' : `${storageUsage.used.toFixed(2)} MB / ${storageUsage.total === Infinity ? '∞' : `${storageUsage.total.toFixed(0)} MB`}`}
                                     </span>
                                 </div>
                                 {!isLoadingStorage && storageUsage.total > 0 && (
                                     <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                         <div 
                                             className={`h-2 rounded-full transition-all ${
                                                 storageUsage.total === Infinity ? 'bg-primary-600' :
                                                 (storageUsage.used / storageUsage.total) > 0.9 ? 'bg-red-500' :
                                                 (storageUsage.used / storageUsage.total) > 0.7 ? 'bg-yellow-500' : 'bg-primary-600'
                                             }`}
                                             style={{ 
                                                 width: `${storageUsage.total === Infinity ? 50 : Math.min((storageUsage.used / storageUsage.total) * 100, 100)}%` 
                                             }}
                                         ></div>
                                     </div>
                                 )}
                             </div>
                         </div>
                     </SettingsSection>

                     {/* Video Chat Minutes */}
                     <SettingsSection title="Video Chat Minutes">
                         <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                             Video chat minutes are used for live 1-on-1 video calls with your fans. Your plan includes a monthly allocation that resets each month, plus any bonus minutes you purchase.
                         </p>
                         
                         {isLoadingVideoQuota ? (
                             <div className="flex items-center justify-center py-4">
                                 <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
                             </div>
                         ) : videoQuota ? (
                             <div className="space-y-4">
                                 {/* Current quota display */}
                                 <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                     <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                         <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Monthly Limit</p>
                                         <p className="text-lg font-bold text-gray-900 dark:text-white">
                                             {videoQuota.monthlyMinutesLimit === -1 ? 'Unlimited' : `${videoQuota.monthlyMinutesLimit} min`}
                                         </p>
                                     </div>
                                     <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                         <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Used This Month</p>
                                         <p className="text-lg font-bold text-gray-900 dark:text-white">{videoQuota.minutesUsedThisMonth} min</p>
                                     </div>
                                     <div className="p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800">
                                         <p className="text-xs text-cyan-700 dark:text-cyan-300 mb-1">Bonus Minutes</p>
                                         <p className="text-lg font-bold text-cyan-800 dark:text-cyan-200">{videoQuota.bonusMinutes} min</p>
                                     </div>
                                     <div className="p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-800">
                                         <p className="text-xs text-primary-700 dark:text-primary-300 mb-1">Available</p>
                                         <p className="text-lg font-bold text-primary-800 dark:text-primary-200">
                                             {videoQuota.monthlyMinutesLimit === -1 
                                                 ? 'Unlimited' 
                                                 : `${Math.max(0, videoQuota.monthlyMinutesLimit - videoQuota.minutesUsedThisMonth + videoQuota.bonusMinutes)} min`}
                                         </p>
                                     </div>
                                 </div>

                                 {/* Usage progress bar */}
                                 {videoQuota.monthlyMinutesLimit !== -1 && videoQuota.monthlyMinutesLimit > 0 && (
                                     <div>
                                         <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                                             <span>Monthly usage</span>
                                             <span>{Math.round((videoQuota.minutesUsedThisMonth / videoQuota.monthlyMinutesLimit) * 100)}%</span>
                                         </div>
                                         <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                             <div 
                                                 className={`h-2 rounded-full transition-all ${
                                                     (videoQuota.minutesUsedThisMonth / videoQuota.monthlyMinutesLimit) > 0.9 ? 'bg-red-500' :
                                                     (videoQuota.minutesUsedThisMonth / videoQuota.monthlyMinutesLimit) > 0.7 ? 'bg-yellow-500' : 'bg-primary-600'
                                                 }`}
                                                 style={{ width: `${Math.min((videoQuota.minutesUsedThisMonth / videoQuota.monthlyMinutesLimit) * 100, 100)}%` }}
                                             ></div>
                                         </div>
                                     </div>
                                 )}

                                 {/* Plan-based limits info */}
                                 {videoQuota.monthlyMinutesLimit === 0 && (
                                     <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                                         <p className="text-sm text-amber-800 dark:text-amber-200">
                                             <strong>Video chat not included in your plan.</strong> Upgrade to Pro (100 min/mo) or Elite (250 min/mo) for included minutes, or purchase add-on packs below.
                                         </p>
                                     </div>
                                 )}
                             </div>
                         ) : (
                             <p className="text-sm text-gray-500 dark:text-gray-400">Unable to load video quota.</p>
                         )}

                         {/* Purchase minute packs */}
                         <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                             <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Buy Video Minutes</h4>
                             <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                                 Purchase additional minutes that never expire. Bonus minutes are used after your monthly allocation.
                             </p>
                             <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                 {VIDEO_MINUTE_PACKS.map((pack) => (
                                     <button
                                         key={pack.id}
                                         onClick={() => handlePurchaseVideoMinutes(pack.id)}
                                         disabled={!!isPurchasingMinutes}
                                         className={`p-4 rounded-lg border-2 transition-all text-left ${
                                             isPurchasingMinutes === pack.id
                                                 ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                                 : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                         } disabled:opacity-50 disabled:cursor-not-allowed`}
                                     >
                                         <p className="text-lg font-bold text-gray-900 dark:text-white">{pack.minutes} min</p>
                                         <p className="text-sm text-primary-600 dark:text-primary-400 font-semibold">${(pack.priceCents / 100).toFixed(2)}</p>
                                         <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                             ${((pack.priceCents / 100) / pack.minutes * 10).toFixed(2)}/10 min
                                         </p>
                                         {isPurchasingMinutes === pack.id && (
                                             <div className="flex items-center gap-1 mt-2 text-xs text-primary-600">
                                                 <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary-600"></div>
                                                 <span>Loading...</span>
                                             </div>
                                         )}
                                     </button>
                                 ))}
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
            
            {/* Instagram Setup Modal */}
            {showInstagramSetupModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                📱 Instagram Setup Required
                            </h3>
                            <button
                                onClick={() => setShowInstagramSetupModal(false)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <XMarkIcon className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-2">
                                    To connect Instagram, you need:
                                </p>
                                <ol className="text-sm text-amber-800 dark:text-amber-300 list-decimal list-inside space-y-1 ml-2">
                                    <li>An Instagram Business or Creator account (not a personal account)</li>
                                    <li>A Facebook Page connected to your Instagram account</li>
                                </ol>
                            </div>
                            
                            <div>
                                <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                                    How to set up:
                                </p>
                                <ol className="text-sm text-gray-700 dark:text-gray-300 list-decimal list-inside space-y-2 ml-2">
                                    <li>Open Instagram mobile app → Settings → Account → Switch to Professional Account</li>
                                    <li>Choose "Business" or "Creator"</li>
                                    <li>Connect to a Facebook Page (create one if needed)</li>
                                    <li>Then come back here and click "Proceed" below</li>
                                </ol>
                            </div>

                            <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-200 dark:border-slate-600">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                                    Why do I see extra Instagram accounts or Pages?
                                </p>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    Meta lists everything your <strong>Facebook login</strong> can manage — not only this EchoFlux account. If you admin another Page, use another IG, or test apps for someone else, those can appear. Choose only the Page linked to <strong>your</strong> creator Instagram. Use Meta’s <strong>Log into another account</strong> if the wrong Facebook profile is active.
                                </p>
                            </div>
                            
                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => setShowInstagramSetupModal(false)}
                                    className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleProceedWithInstagramConnect}
                                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
                                >
                                    Proceed to Connect
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Facebook Setup Modal */}
            {showFacebookSetupModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                📘 Facebook Page Setup Required
                            </h3>
                            <button
                                onClick={() => setShowFacebookSetupModal(false)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <XMarkIcon className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-2">
                                    To connect Facebook, you need:
                                </p>
                                <ol className="text-sm text-amber-800 dark:text-amber-300 list-decimal list-inside space-y-1 ml-2">
                                    <li>A Facebook account</li>
                                    <li>A Facebook Page where you are an Admin</li>
                                </ol>
                            </div>
                            
                            <div>
                                <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                                    How to set up:
                                </p>
                                <ol className="text-sm text-gray-700 dark:text-gray-300 list-decimal list-inside space-y-2 ml-2">
                                    <li>Create a Facebook Page (if needed)</li>
                                    <li>Make sure your Facebook account is an Admin of the Page</li>
                                    <li>Then come back here and click "Proceed" below</li>
                                </ol>
                            </div>

                            <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-200 dark:border-slate-600">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                                    Why do I see Pages that aren’t “mine” for this account?
                                </p>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    Facebook shows every Page where <strong>you</strong> have a role (Admin, Editor, etc.). That can include a company app Page, a client Page, or a test Page — EchoFlux doesn’t choose the list. Pick only the Page you want for <strong>this</strong> creator. If you see the wrong Facebook identity at the top of Meta’s screen, use <strong>Log into another account</strong>.
                                </p>
                            </div>
                            
                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => setShowFacebookSetupModal(false)}
                                    className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleProceedWithFacebookConnect}
                                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
                                >
                                    Proceed to Connect
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {showConnectionGuideModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Social connection requirements</h3>
                            <button
                                onClick={() => setShowConnectionGuideModal(false)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <XMarkIcon className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Facebook + Instagram (Meta)</p>
                                <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
                                    <p className="font-medium text-gray-900 dark:text-white">Step 1: Create a Facebook Page (if you do not have one)</p>
                                    <ol className="list-decimal list-inside space-y-1 ml-2">
                                        <li>Go to <span className="font-semibold">facebook.com/pages/create</span>.</li>
                                        <li>Choose a Page name, category, and profile details.</li>
                                        <li>Make sure your Facebook profile is listed as <strong>Admin</strong> in Page Access.</li>
                                    </ol>

                                    <p className="font-medium text-gray-900 dark:text-white">Step 2: Switch Instagram to a Professional account</p>
                                    <ol className="list-decimal list-inside space-y-1 ml-2">
                                        <li>Open Instagram app, then go to <strong>Settings and privacy</strong>, then <strong>Account type and tools</strong>.</li>
                                        <li>Select <strong>Switch to professional account</strong>.</li>
                                        <li>Choose <strong>Creator</strong> or <strong>Business</strong> (both work with EchoFlux).</li>
                                    </ol>

                                    <p className="font-medium text-gray-900 dark:text-white">Step 3: Link Instagram to your Facebook Page</p>
                                    <ol className="list-decimal list-inside space-y-1 ml-2">
                                        <li>In Instagram, go to <strong>Account Center</strong> and add your Facebook profile if needed.</li>
                                        <li>Open your Facebook Page settings, then <strong>Linked accounts</strong> / <strong>Instagram</strong>.</li>
                                        <li>Connect the same Instagram Professional account you want EchoFlux to use.</li>
                                    </ol>

                                    <p className="font-medium text-gray-900 dark:text-white">Step 4: Connect inside EchoFlux</p>
                                    <ol className="list-decimal list-inside space-y-1 ml-2">
                                        <li>In EchoFlux Settings, open <strong>Connections</strong>, then click <strong>Connect</strong> for Facebook or Instagram.</li>
                                        <li>On Meta's permission screen, verify the correct Facebook profile at the top.</li>
                                        <li>Use <strong>Edit previous settings</strong> and select only the Page/Instagram for this creator account.</li>
                                    </ol>
                                </div>
                            </div>
                            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
                                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-1">Common issues and fixes</p>
                                <ul className="text-sm text-amber-900/90 dark:text-amber-200/90 list-disc list-inside space-y-2">
                                    <li><strong>Wrong pages/accounts shown:</strong> You are logged into the wrong Facebook profile. Use <strong>Log into another account</strong> in Meta OAuth.</li>
                                    <li><strong>Instagram does not appear:</strong> Confirm it is Professional and linked to the selected Facebook Page.</li>
                                    <li><strong>Connection succeeds but posting fails:</strong> Reconnect and grant full requested permissions for Page + Instagram.</li>
                                </ul>
                            </div>
                            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">X (Twitter)</p>
                                <ul className="text-sm text-gray-700 dark:text-gray-300 list-disc list-inside space-y-2">
                                    <li>EchoFlux connects the X account currently signed in within your browser session.</li>
                                    <li>If you manage multiple X accounts, use a dedicated browser profile or incognito window per creator.</li>
                                    <li>Reconnect if you change X credentials or permissions.</li>
                                </ul>
                            </div>
                            <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4">
                                <p className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-1">How EchoFlux decides what appears</p>
                                <p className="text-sm text-blue-900/90 dark:text-blue-200/90">
                                    EchoFlux cannot edit Meta/X account lists shown during OAuth. Those options are returned directly by Meta/X based on who is logged in and what they can access.
                                </p>
                            </div>
                            <div className="flex justify-end pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowConnectionGuideModal(false)}
                                    className="px-4 py-2 text-sm font-semibold rounded-md bg-primary-600 text-white hover:bg-primary-700 transition-colors"
                                >
                                    Got it
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};