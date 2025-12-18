import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Settings as AppSettings, Platform, CustomVoice, SocialAccount } from '../types';
import { OFFLINE_MODE } from '../constants';
import { InstagramIcon, TikTokIcon, ThreadsIcon, XIcon, YouTubeIcon, LinkedInIcon, FacebookIcon, PinterestIcon } from './icons/PlatformIcons';
import { useAppContext } from './AppContext';
import { UpgradePrompt } from './UpgradePrompt';
import { UploadIcon, TrashIcon, SettingsIcon, LinkIcon, SparklesIcon, CreditCardIcon, CheckCircleIcon, XMarkIcon, ClockIcon, VoiceIcon } from './icons/UIIcons';
import { db, storage, auth } from '../firebaseConfig';
// @ts-ignore
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll, getMetadata } from 'firebase/storage';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { connectSocialAccount, disconnectSocialAccount } from '../src/services/socialMediaService';
import { PLATFORM_CAPABILITIES, hasCapability, getCapabilityDescription, getCapability, isFullySupported } from '../src/services/platformCapabilities';

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
};

const AccountConnection: React.FC<{
    platform: Platform;
    account: SocialAccount | null;
    isConnecting: boolean;
    onConnect: (platform: Platform) => Promise<void>;
    onDisconnect: (platform: Platform) => Promise<void>;
    onConnectOAuth1?: () => Promise<void>;
}> = ({ platform, account, isConnecting, onConnect, onDisconnect, onConnectOAuth1 }) => {
    const isConnected = account?.connected || false;
    const accountUsername = account?.accountUsername;
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
                        {accountUsername && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">@{accountUsername}</p>
                        )}
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
                                {hasCapability(platform, 'inbox') && (
                                    <span 
                                        className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 cursor-help"
                                        title={isFullySupported(platform, 'inbox') 
                                            ? 'Inbox: Fully supported' 
                                            : `Inbox: ${getCapabilityDescription(getCapability(platform, 'inbox') || false)}`}
                                    >
                                        Inbox
                                        {!isFullySupported(platform, 'inbox') && ' ⚠️'}
                                    </span>
                                )}
                                {hasCapability(platform, 'analytics') && (
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
                            </div>
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
            {/* OAuth 1.0a connection for X (required for media uploads) */}
            {platform === 'X' && isConnected && onConnectOAuth1 && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                    <div className="flex items-center justify-between">
                        <div className="flex-1">
                            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Media Upload (OAuth 1.0a)
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {hasOAuth1 
                                    ? '✓ Connected - Images and videos can be uploaded'
                                    : 'Required for uploading images and videos to X'}
                            </p>
                        </div>
                        {!hasOAuth1 && (
                            <button
                                onClick={onConnectOAuth1}
                                disabled={isConnecting}
                                className="ml-3 px-3 py-1.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:hover:bg-blue-900 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isConnecting ? 'Connecting...' : 'Connect OAuth 1.0a'}
                            </button>
                        )}
                        {hasOAuth1 && (
                            <span className="ml-3 px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300">
                                ✓ Connected
                            </span>
                        )}
                    </div>
                </div>
            )}
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
    const [showInstagramSetupModal, setShowInstagramSetupModal] = useState(false);
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [storageUsage, setStorageUsage] = useState<{ used: number; total: number }>({ used: 0, total: 100 });
    const [isLoadingStorage, setIsLoadingStorage] = useState(false);
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
        Pinterest: null,
        Discord: null,
        Telegram: null,
        Reddit: null,
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

    // Handle OAuth callback from URL params
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const oauthSuccess = params.get('oauth_success');
        const oauthError = params.get('error');
        const platform = params.get('platform');
        const errorMessage = params.get('message');
        const errorDetails = params.get('details');

        if (oauthSuccess) {
            const oauthType = params.get('type');
            const accountName = params.get('account');
            if (oauthType === 'oauth1') {
                showToast('OAuth 1.0a connected successfully! You can now upload images and videos to X.', 'success');
            } else {
                const platformName = oauthSuccess.charAt(0).toUpperCase() + oauthSuccess.slice(1);
                const successMessage = accountName 
                    ? `${platformName} account (${decodeURIComponent(accountName)}) connected successfully!`
                    : `${platformName} account connected successfully!`;
                showToast(successMessage, 'success');
            }
            // Remove query params from URL
            window.history.replaceState({}, '', window.location.pathname);
            // Reload page to refresh social accounts
            window.location.reload();
        } else if (oauthError) {
            // Show specific error messages based on error type
            let errorMsg = '';
            
            if (oauthError === 'no_instagram_account') {
                errorMsg = 'No Instagram Business Account found. Your Instagram account must be converted to a Business or Creator account and connected to a Facebook Page. See instructions below.';
            } else if (oauthError === 'token_exchange_failed') {
                errorMsg = `Token exchange failed. ${errorDetails ? decodeURIComponent(errorDetails).substring(0, 100) : 'Please try again.'}`;
            } else if (oauthError === 'pages_fetch_failed') {
                errorMsg = 'Failed to fetch Facebook Pages. Make sure you have at least one Facebook Page.';
            } else if (oauthError === 'oauth_not_configured') {
                const platformName = platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : 'OAuth';
                errorMsg = `${platformName} OAuth is not configured. Please contact support or check your environment variables.`;
            } else if (oauthError === 'token_exchange_failed') {
                const platformName = platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : 'Account';
                errorMsg = `${platformName} token exchange failed. ${errorDetails ? decodeURIComponent(errorDetails).substring(0, 150) : 'Please check your OAuth configuration and try again.'}`;
            } else if (errorMessage) {
                errorMsg = decodeURIComponent(errorMessage);
            } else {
                errorMsg = `Failed to connect ${platform || 'account'}. Please try again.`;
            }
            
            showToast(errorMsg, 'error');
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
        if (OFFLINE_MODE) {
            showToast('Account connections are disabled in this version. EchoFlux.ai is currently focused on planning and content creation. You can still plan campaigns and copy content to post manually.', 'info');
            return;
        }
        // Block Caption plan from connecting accounts
        if (user.plan === 'Caption') {
            showToast('Caption Pro plan does not include social account connections. Upgrade to Pro or higher to connect accounts.', 'error');
            setPricingView(user.userType || 'Creator');
            setActivePage('pricing');
            return;
        }
        
        // Show Instagram setup modal if Instagram is not connected
        if (platform === 'Instagram' && !safeSocialAccounts?.Instagram?.connected) {
            setShowInstagramSetupModal(true);
            return;
        }
        
        // Check connection limit for Free plan (1 account max)
        if (user.plan === 'Free') {
            const connectedCount = Object.values(safeSocialAccounts).filter(acc => acc?.connected).length;
            if (connectedCount >= 1) {
                showToast('Free plan allows only 1 connected social media account. Upgrade to connect more accounts.', 'error');
                return;
            }
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
        // Check connection limit for Free plan (1 account max)
        if (user.plan === 'Free') {
            const connectedCount = Object.values(safeSocialAccounts).filter(acc => acc?.connected).length;
            if (connectedCount >= 1) {
                showToast('Free plan allows only 1 connected social media account. Upgrade to connect more accounts.', 'error');
                return;
            }
        }
        
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

    const handleConnectOAuth1 = async () => {
        if (OFFLINE_MODE) {
            showToast('X OAuth is disabled in this version. EchoFlux.ai is currently focused on offline planning and content creation.', 'info');
            return;
        }
        // Connect OAuth 1.0a for X media uploads
        setConnectingPlatform('X');
        try {
            const token = auth.currentUser
                ? await auth.currentUser.getIdToken(true)
                : null;

            if (!token) {
                throw new Error('User must be logged in');
            }

            const response = await fetch('/api/oauth/x/authorize-oauth1', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                let errorData: any = {};
                try {
                    errorData = await response.json();
                } catch {
                    // If response is not JSON, try to get text
                    const text = await response.text().catch(() => 'Unknown error');
                    errorData = { error: 'Failed to connect OAuth 1.0a', details: text };
                }
                
                // Build user-friendly error message
                let errorMessage = errorData.error || 'Failed to connect OAuth 1.0a';
                let errorDetails = errorData.details || errorData.twitterError || '';
                
                // Add help text if available
                if (errorData.help) {
                    errorDetails = errorDetails ? `${errorDetails}. ${errorData.help}` : errorData.help;
                }
                
                // Special handling for callback URL errors
                if (errorDetails.includes('callback URL') || errorDetails.includes('Callback URI') || errorDetails.includes('callback') || errorMessage.includes('callback')) {
                    errorMessage = 'OAuth 1.0a Callback URL Not Registered';
                    
                    // Build comprehensive troubleshooting message
                    let troubleshootingMsg = `The callback URL "${errorData.callbackUrl || 'https://echoflux.ai/api/oauth/x/callback-oauth1'}" is not recognized by X.\n\n`;
                    troubleshootingMsg += `Common causes:\n`;
                    troubleshootingMsg += `• URL registered in OAuth 2.0 section instead of OAuth 1.0a section\n`;
                    troubleshootingMsg += `• OAuth 1.0a not enabled in Developer Portal\n`;
                    troubleshootingMsg += `• URL format mismatch (trailing slash, case sensitivity, etc.)\n`;
                    troubleshootingMsg += `• Changes not propagated yet (wait 2-3 minutes after saving)\n\n`;
                    troubleshootingMsg += `Troubleshooting Steps:\n`;
                    troubleshootingMsg += `1. Go to X Developer Portal → Your App → Settings → User authentication settings\n`;
                    troubleshootingMsg += `2. Make sure OAuth 1.0a is ENABLED (separate toggle from OAuth 2.0)\n`;
                    troubleshootingMsg += `3. Find the OAuth 1.0a Callback URLs section (NOT OAuth 2.0 section)\n`;
                    troubleshootingMsg += `4. Verify the URL is registered exactly as: ${errorData.callbackUrl || 'https://echoflux.ai/api/oauth/x/callback-oauth1'}\n`;
                    troubleshootingMsg += `5. Check for: no trailing slash, exact case, no extra spaces\n`;
                    troubleshootingMsg += `6. If the URL is already there, DELETE it and RE-ADD it\n`;
                    troubleshootingMsg += `7. Wait 2-3 minutes after saving before testing again\n`;
                    troubleshootingMsg += `8. Make sure App permissions are set to "Read and write"`;
                    
                    if (errorData.troubleshootingSteps && Array.isArray(errorData.troubleshootingSteps)) {
                        troubleshootingMsg += '\n\nAdditional steps from X:\n' + errorData.troubleshootingSteps.join('\n');
                    }
                    
                    errorDetails = troubleshootingMsg;
                } else if (errorDetails.includes('OAuth 1.0a not enabled')) {
                    errorMessage = 'OAuth 1.0a Not Enabled';
                    errorDetails = 'OAuth 1.0a must be enabled in your X Developer Portal. Go to your X App settings → User authentication settings and enable "OAuth 1.0a" authentication.';
                }
                
                const fullMessage = errorDetails ? `${errorMessage}: ${errorDetails}` : errorMessage;
                throw new Error(fullMessage);
            }

            const { authUrl } = await response.json();
            if (!authUrl || typeof authUrl !== 'string') {
                throw new Error('Invalid authorization URL');
            }

            // Redirect to OAuth 1.0a authorization
            setTimeout(() => {
                window.location.href = authUrl;
            }, 0);
        } catch (error: any) {
            console.error('Failed to connect OAuth 1.0a:', error);
            
            // Show detailed error message
            let errorMsg = error.message || 'Failed to connect OAuth 1.0a. Please try again.';
            if (errorMsg.includes('callback URL') || errorMsg.includes('callback')) {
                errorMsg = 'Callback URL not recognized. Check X Developer Portal:\n1. Enable OAuth 1.0a (separate from OAuth 2.0)\n2. Add URL to OAuth 1.0a section (not OAuth 2.0)\n3. URL: https://echoflux.ai/api/oauth/x/callback-oauth1\n4. Wait 2-3 minutes after saving';
            }
            showToast(errorMsg, 'error');
            setConnectingPlatform(null);
        }
    };

    const handleDisconnectAccount = async (platform: Platform) => {
        if (OFFLINE_MODE) {
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

    // Calculate storage usage
    useEffect(() => {
        if (!user) return;
        
        const calculateStorageUsage = async () => {
            setIsLoadingStorage(true);
            try {
                let totalSize = 0;
                
                // List all files in user's storage folders
                const folders = ['uploads', 'media_library', 'automation', 'voices'];
                
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
                
                // Set storage limits based on plan (in MB)
                const storageLimits: Record<string, number> = {
                    'Free': 100,
                    'Pro': 1024, // 1 GB
                    'Elite': 2048, // 2 GB
                    'Starter': 1024, // 1 GB
                    'Growth': 3072, // 3 GB
                    'Agency': 5120, // 5 GB
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
        // Hide live connections tab entirely in offline mode to avoid confusion
        ...(!OFFLINE_MODE ? [{ id: 'connections', label: 'Connections', icon: <LinkIcon /> } as const] : []),
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
                        {user.plan === 'Caption' ? (
                            <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                                    <strong>Caption Pro Plan:</strong> This plan focuses on caption generation only. Social account connections are not included.
                                </p>
                                <p className="text-sm text-blue-700 dark:text-blue-300">
                                    You can still select which platform you want hashtags for when generating captions, but you won't be able to connect accounts or post directly. Upgrade to Pro or higher to connect accounts and enable posting.
                                </p>
                            </div>
                        ) : (
                            <>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Connect your social media accounts to allow EchoFlux.ai to fetch incoming messages and post replies.</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {(Object.keys(platformIcons) as Platform[]).map(platform => {
                                        const account = safeSocialAccounts && safeSocialAccounts[platform] ? safeSocialAccounts[platform] : null;
                                        return (
                                            <AccountConnection 
                                                key={platform}
                                                platform={platform}
                                                account={account}
                                                isConnecting={connectingPlatform === platform}
                                                onConnect={handleConnectAccount}
                                                onDisconnect={handleDisconnectAccount}
                                                onConnectOAuth1={platform === 'X' ? handleConnectOAuth1 : undefined}
                                            />
                                        );
                                    })}
                                </div>
                                <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                    <p className="text-sm text-blue-800 dark:text-blue-200">
                                        <strong>Note:</strong> Connecting accounts enables real-time stats and posting capabilities. You'll be redirected to authorize each platform.
                                    </p>
                                </div>
                            </>
                        )}
                    </SettingsSection>
                )}

                {activeTab === 'general' && (
                    <>
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
                        <SettingsSection title="Safety & Accessibility">
                            <ToggleSwitch label="Safe Mode" enabled={settings.safeMode} onChange={(val) => updateSetting('safeMode', val)} />
                            <p className="text-sm text-gray-500 dark:text-gray-400">Prevents the AI from generating replies with profanity or discussing sensitive topics.</p>
                            <hr className="border-gray-200 dark:border-gray-700" />
                            <ToggleSwitch label="Enable Voice Mode" enabled={settings.voiceMode} onChange={(val) => updateSetting('voiceMode', val)} />
                            <p className="text-sm text-gray-500 dark:text-gray-400">Enable the floating AI Voice Assistant button for hands-free control.</p>
                        </SettingsSection>
                        {(user.plan !== 'Free' || user.plan === 'Caption') && (
                        <SettingsSection title="Goals & Milestones">
                            <div className="space-y-4">
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
                                        placeholder="Set your monthly content goal..."
                                        className="w-full p-3 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:text-white"
                                    />
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Set how many pieces of content you want to create per month.
                                    </p>
                                </div>
                            </div>
                        </SettingsSection>
                        )}
                        {/* Account Type section hidden in AI Content Studio mode */}
                        {false && (
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
                        <SettingsSection title="AI Personality & Tone">
                            <ToggleSwitch label="High Quality Generations" enabled={settings.highQuality} onChange={(val) => updateSetting('highQuality', val)} />
                            <p className="text-sm text-gray-500 dark:text-gray-400">Use a more advanced AI model for creative tasks like strategy generation. May be slower and is only available on premium plans.</p>
                            <hr className="border-gray-200 dark:border-gray-700" />
                            <ToneSlider label="Formality" value={settings.tone.formality} onChange={(val) => updateToneSetting('formality', val)} description="Low for casual & slang, high for formal & professional."/>
                            <ToneSlider label="Humor" value={settings.tone.humor} onChange={(val) => updateToneSetting('humor', val)} description="Low for serious, high for witty & funny replies."/>
                            <ToneSlider label="Empathy" value={settings.tone.empathy} onChange={(val) => updateToneSetting('empathy', val)} description="Low for direct, high for supportive & understanding."/>
                            
                            {user && (user.plan === 'Free' || user.plan === 'Caption' || user.plan === 'Pro' || user.plan === 'Elite' || user.plan === 'Agency' || user.role === 'Admin' || !user.plan) && (
                                <>
                                    <hr className="border-gray-200 dark:border-gray-700 my-4" />
                                    <ToneSlider 
                                        label="Spiciness 🌶️" 
                                        value={settings.tone.spiciness || 0} 
                                        onChange={(val) => updateToneSetting('spiciness', val)} 
                                        description="Control the level of bold/explicit language."
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
        </div>
    );
};