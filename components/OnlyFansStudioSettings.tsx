import React, { useState, useEffect } from 'react';
import { useAppContext } from './AppContext';
import { SettingsIcon, UserIcon } from './icons/UIIcons';
import { auth, db } from '../firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';

type SettingsTab = 'general' | 'account' | 'aiTraining' | 'billing' | 'profile';

export const OnlyFansStudioSettings: React.FC = () => {
    const { user, setUser, showToast } = useAppContext();
    const [activeTab, setActiveTab] = useState<SettingsTab>('general');
    const [isSaving, setIsSaving] = useState(false);
    
    // Profile state
    const [displayName, setDisplayName] = useState(user?.displayName || '');
    const [bio, setBio] = useState('');
    
    // AI Training state
    const [aiPersonality, setAiPersonality] = useState('');
    const [aiTone, setAiTone] = useState('Teasing');
    const [explicitnessLevel, setExplicitnessLevel] = useState(7); // 0-10 scale
    const [creatorGender, setCreatorGender] = useState('');
    const [targetAudienceGender, setTargetAudienceGender] = useState('');
    
    // General settings
    const [notifications, setNotifications] = useState(true);
    const [emojiEnabled, setEmojiEnabled] = useState(true);
    const [emojiIntensity, setEmojiIntensity] = useState(5); // 0-10 scale, 5 = moderate
    
    // Load user settings
    useEffect(() => {
        const loadSettings = async () => {
            if (!user?.id) return;
            
            try {
                const userDoc = await getDoc(doc(db, 'users', user.id));
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    setBio(data.bio || '');
                    setAiPersonality(data.aiPersonality || '');
                    setAiTone(data.aiTone || 'Teasing');
                    setExplicitnessLevel(data.explicitnessLevel ?? 7);
                    setCreatorGender(data.creatorGender || '');
                    setTargetAudienceGender(data.targetAudienceGender || '');
                    setNotifications(data.notificationsEnabled !== false);
                    setEmojiEnabled(data.emojiEnabled !== false); // Default to true
                    setEmojiIntensity(data.emojiIntensity ?? 5); // Default to 5 (moderate)
                }
            } catch (error) {
                console.error('Error loading settings:', error);
            }
        };
        
        loadSettings();
    }, [user?.id]);

    const handleSaveProfile = async () => {
        if (!user?.id) {
            showToast('User ID not found. Please try logging in again.', 'error');
            return;
        }
        
        setIsSaving(true);
        try {
            // Update Firebase Auth profile
            if (auth.currentUser) {
                await updateProfile(auth.currentUser, {
                    displayName: displayName || undefined,
                });
            }
            
            // Update Firestore using setDoc with merge to handle cases where doc might not exist
            await setDoc(doc(db, 'users', user.id), {
                displayName: displayName || '',
                bio: bio || '',
                updatedAt: new Date().toISOString(),
            }, { merge: true });
            
            // Update local user state
            if (setUser) {
                setUser({ ...user, displayName: displayName || undefined });
            }
            
            showToast('Profile updated successfully!', 'success');
        } catch (error: any) {
            console.error('Error updating profile:', error);
            showToast(`Failed to update profile: ${error.message || 'Please try again.'}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveAITraining = async () => {
        if (!user?.id) {
            showToast('User ID not found. Please try logging in again.', 'error');
            return;
        }
        
        setIsSaving(true);
        try {
            // Use setDoc with merge: true to handle cases where document might not exist
            await setDoc(doc(db, 'users', user.id), {
                aiPersonality: aiPersonality || '',
                aiTone: aiTone,
                explicitnessLevel: explicitnessLevel,
                creatorGender: creatorGender || '',
                targetAudienceGender: targetAudienceGender || '',
                updatedAt: new Date().toISOString(),
            }, { merge: true });
            
            showToast('AI Training settings saved successfully!', 'success');
        } catch (error: any) {
            console.error('Error saving AI training:', error);
            showToast(`Failed to save AI training settings: ${error.message || 'Please try again.'}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveGeneral = async () => {
        if (!user?.id) {
            showToast('User ID not found. Please try logging in again.', 'error');
            return;
        }
        
        setIsSaving(true);
        try {
            // Use setDoc with merge: true to handle cases where document might not exist
            await setDoc(doc(db, 'users', user.id), {
                notificationsEnabled: notifications,
                emojiEnabled: emojiEnabled,
                emojiIntensity: emojiIntensity,
                updatedAt: new Date().toISOString(),
            }, { merge: true });
            
            showToast('General settings saved successfully!', 'success');
        } catch (error: any) {
            console.error('Error saving general settings:', error);
            showToast(`Failed to save settings: ${error.message || 'Please try again.'}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const getExplicitnessLabel = (level: number) => {
        if (level <= 2) return 'Safe';
        if (level <= 4) return 'Mild';
        if (level <= 6) return 'Moderate';
        if (level <= 8) return 'Explicit';
        return 'Very Explicit';
    };

    const tabs: { id: SettingsTab; label: string }[] = [
        { id: 'general', label: 'General' },
        { id: 'aiTraining', label: 'AI Training' },
    ];

    return (
        <div className="max-w-5xl mx-auto">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                    <SettingsIcon className="w-8 h-8 text-primary-600 dark:text-primary-400" />
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        Premium Content Studio Settings
                    </h1>
                </div>
                <p className="text-gray-600 dark:text-gray-400">
                    Manage your Premium Content Studio preferences, AI training, and account settings.
                </p>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${
                            activeTab === tab.id
                                ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* General Tab */}
            {activeTab === 'general' && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                        General Settings
                    </h2>
                    
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                                    In-App Notifications
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Show notifications within the app
                                </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={notifications}
                                    onChange={(e) => setNotifications(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                            </label>
                        </div>

                        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                                        Emoji in AI Content
                                    </h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        Enable emojis in AI-generated content (captions, suggestions, etc.)
                                    </p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={emojiEnabled}
                                        onChange={(e) => setEmojiEnabled(e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                                </label>
                            </div>

                            {emojiEnabled && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                                        Emoji Intensity: <span className="text-primary-600 dark:text-primary-400">
                                            {emojiIntensity === 0 ? 'None' : emojiIntensity <= 3 ? 'Light' : emojiIntensity <= 7 ? 'Moderate' : 'Heavy'}
                                        </span>
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="range"
                                            min="0"
                                            max="10"
                                            value={emojiIntensity}
                                            onChange={(e) => setEmojiIntensity(Number(e.target.value))}
                                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                                            style={{
                                                background: `linear-gradient(to right, #2563eb 0%, #2563eb ${(emojiIntensity / 10) * 100}%, #e5e7eb ${(emojiIntensity / 10) * 100}%, #e5e7eb 100%)`
                                            }}
                                        />
                                        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            <span>None</span>
                                            <span>Light</span>
                                            <span>Moderate</span>
                                            <span>Heavy</span>
                                        </div>
                                    </div>
                                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                                        Control how many emojis appear in AI-generated content. Higher values add more emojis for playful, engaging content.
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                            <button
                                onClick={handleSaveGeneral}
                                disabled={isSaving}
                                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
                            >
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Training Tab */}
            {activeTab === 'aiTraining' && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                        AI Training & Personality
                    </h2>
                    
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                AI Personality Description
                            </label>
                            <textarea
                                value={aiPersonality}
                                onChange={(e) => setAiPersonality(e.target.value)}
                                placeholder="Describe your content style, personality, and how you want the AI to write (e.g., 'Playful and confident with a hint of mystery' or 'Bold and direct, not shy about explicit content')"
                                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[100px]"
                            />
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                This helps the AI understand your unique voice and writing style.
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Default Tone
                            </label>
                            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                                {(['Playful', 'Flirty', 'Confident', 'Teasing', 'Intimate', 'Explicit'] as const).map((tone) => (
                                    <button
                                        key={tone}
                                        onClick={() => setAiTone(tone)}
                                        className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                            aiTone === tone
                                                ? 'bg-primary-600 text-white'
                                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                        }`}
                                    >
                                        {tone}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Your Gender
                                </label>
                                <select
                                    value={creatorGender}
                                    onChange={(e) => setCreatorGender(e.target.value)}
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                >
                                    <option value="">Select...</option>
                                    <option value="Female">Female</option>
                                    <option value="Male">Male</option>
                                    <option value="Non-binary">Non-binary</option>
                                    <option value="Other">Other</option>
                                    <option value="Prefer not to say">Prefer not to say</option>
                                </select>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    Helps AI generate appropriate roleplay scenarios (e.g., GFE vs BFE).
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Target Audience Gender
                                </label>
                                <select
                                    value={targetAudienceGender}
                                    onChange={(e) => setTargetAudienceGender(e.target.value)}
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                >
                                    <option value="">Select...</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Both">Both</option>
                                    <option value="All">All</option>
                                </select>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    Who your content is primarily for.
                                </p>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                                Explicitness Level: <span className="text-primary-600 dark:text-primary-400">{getExplicitnessLabel(explicitnessLevel)}</span>
                            </label>
                            <div className="relative">
                                <input
                                    type="range"
                                    min="0"
                                    max="10"
                                    value={explicitnessLevel}
                                    onChange={(e) => setExplicitnessLevel(Number(e.target.value))}
                                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                                    style={{
                                        background: `linear-gradient(to right, #2563eb 0%, #2563eb ${(explicitnessLevel / 10) * 100}%, #e5e7eb ${(explicitnessLevel / 10) * 100}%, #e5e7eb 100%)`
                                    }}
                                />
                                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    <span>Safe</span>
                                    <span>Moderate</span>
                                    <span>Very Explicit</span>
                                </div>
                            </div>
                            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                                Control how explicit the AI-generated content should be. Higher levels generate bolder, more adult-oriented content.
                            </p>
                        </div>

                        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                            <button
                                onClick={handleSaveAITraining}
                                disabled={isSaving}
                                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
                            >
                                {isSaving ? 'Saving...' : 'Save AI Training Settings'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};
