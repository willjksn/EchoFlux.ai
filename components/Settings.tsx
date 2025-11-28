import React, { useState, useRef, useMemo } from 'react';
import { Settings as AppSettings, Platform, CustomVoice } from '../types';
import { InstagramIcon, TikTokIcon, ThreadsIcon, XIcon, YouTubeIcon, LinkedInIcon, FacebookIcon } from './icons/PlatformIcons';
import { useAppContext } from './AppContext';
import { UpgradePrompt } from './UpgradePrompt';
import { UploadIcon, TrashIcon, SettingsIcon, LinkIcon, SparklesIcon, CreditCardIcon } from './icons/UIIcons';
import { db, storage } from '../firebaseConfig';
// @ts-ignore
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';

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
    <div id={id} className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md animate-fade-in">
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
    isConnected: boolean;
    onToggle: (platform: Platform) => void;
}> = ({ platform, isConnected, onToggle }) => (
    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
        <div className="flex items-center space-x-3">
            <span className="text-gray-600 dark:text-gray-300">{platformIcons[platform]}</span>
            <span className="font-medium text-gray-800 dark:text-gray-200">{platform}</span>
        </div>
        <button
            onClick={() => onToggle(platform)}
            className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${
                isConnected
                    ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-900'
                    : 'bg-primary-100 text-primary-700 hover:bg-primary-200 dark:bg-primary-900/50 dark:text-primary-300 dark:hover:bg-primary-900'
            }`}
        >
            {isConnected ? 'Disconnect' : 'Connect'}
        </button>
    </div>
);

type SettingsTab = 'general' | 'connections' | 'ai-training' | 'billing';

export const Settings: React.FC = () => {
    const { user, setUser, settings, setSettings, setActivePage, selectedClient, userCustomVoices, setUserCustomVoices, showToast, setPricingView } = useAppContext();
    const [activeTab, setActiveTab] = useState<SettingsTab>('general');
    const [fileName, setFileName] = useState<string | null>(null);
    const [isUploadingVoice, setIsUploadingVoice] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const voiceFileInputRef = useRef<HTMLInputElement>(null);
    
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

    const isVoiceFeatureUnlocked = voiceLimit > 0;

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
                const sRef = ref(storage, `users/${user.id}/voices/${Date.now()}_${file.name}`);
                await uploadBytes(sRef, file);
                const url = await getDownloadURL(sRef);

                const { data, mimeType } = await fileToBase64(file);
                
                const newVoice: CustomVoice = { 
                    id: Date.now().toString(), 
                    name: file.name, 
                    data, 
                    mimeType,
                    url 
                };

                await setDoc(doc(db, 'users', user.id, 'voices', newVoice.id), newVoice);
                
                showToast('Custom voice uploaded successfully!', 'success');
            } catch (error) {
                console.error("Voice upload error:", error);
                showToast('Failed to upload voice file.', 'error');
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

    const toggleAccountConnection = (platform: Platform) => {
        setSettings(prev => ({ ...prev, connectedAccounts: { ...prev.connectedAccounts, [platform]: !prev.connectedAccounts[platform] } }));
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

    const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
        { id: 'general', label: 'General', icon: <SettingsIcon /> },
        { id: 'connections', label: 'Connections', icon: <LinkIcon /> },
        { id: 'ai-training', label: 'AI Training', icon: <SparklesIcon /> },
        { id: 'billing', label: 'Billing', icon: <CreditCardIcon /> },
    ];

    if (!user) return null;

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Settings</h2>
            </div>

            <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg overflow-x-auto">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all whitespace-nowrap flex-1 justify-center ${
                            activeTab === tab.id
                                ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-white shadow-sm'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                    >
                        <span className="w-4 h-4">{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="space-y-8">
                {activeTab === 'connections' && (
                    <SettingsSection title="Connected Accounts">
                        <p className="text-sm text-gray-500 dark:text-gray-400">Connect your social media accounts to allow EngageSuite.ai to fetch incoming messages and post replies.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {(Object.keys(settings.connectedAccounts) as Platform[]).map(platform => (
                                <AccountConnection 
                                    key={platform}
                                    platform={platform}
                                    isConnected={settings.connectedAccounts[platform]}
                                    onToggle={toggleAccountConnection}
                                />
                            ))}
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
                    </>
                )}

                {activeTab === 'billing' && (
                     <SettingsSection title="Subscription">
                         <div className="flex items-center justify-between">
                             <div>
                                 <p className="text-gray-900 dark:text-white font-medium">Current Plan</p>
                                 <p className="text-2xl font-bold text-primary-600">{user.plan}</p>
                             </div>
                             <button onClick={() => setActivePage('pricing')} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">Manage Plan</button>
                         </div>
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
                )}
            </div>
        </div>
    );
};