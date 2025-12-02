import React, { useState, useRef, ChangeEvent, useEffect } from 'react';
import { CameraIcon, TrashIcon, CheckCircleIcon, CalendarIcon, CreditCardIcon, LockIcon, DownloadIcon, SparklesIcon } from './icons/UIIcons';
import { useAppContext } from './AppContext';
import { User, MediaItem, Client, Plan } from '../types';
import { auth, storage } from '../firebaseConfig';
// @ts-ignore
import * as storageFunctions from 'firebase/storage';
import { sendPasswordResetEmail } from 'firebase/auth';
import { getGeneratedContent } from '../src/services/geminiService';

const SettingsSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{title}</h3>
        <div className="space-y-4">{children}</div>
    </div>
);

export const Profile: React.FC = () => {
    const { user, setUser, setActivePage, selectedClient, clients, setClients, showToast } = useAppContext();
    const [isEditing, setIsEditing] = useState(false);
    const [editableUser, setEditableUser] = useState<User | null>(user);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [usageTab, setUsageTab] = useState<'stats' | 'ads'>('stats');
    const [storedAds, setStoredAds] = useState<any[]>([]);
    const [isLoadingAds, setIsLoadingAds] = useState(false);

    const currentData = selectedClient ? clients.find(c => c.id === selectedClient.id) : user;
    const currentAccountName = selectedClient ? selectedClient.name : user?.name;
    const canEdit = !selectedClient && user;

    if (!currentData || !user) {
        return <div className="text-center p-8">Profile not found.</div>
    }
    
    const handleEditToggle = () => {
        if (isEditing) {
            setEditableUser(user);
        } else {
            setEditableUser(user);
        }
        setIsEditing(!isEditing);
    };

    const handleSave = () => {
        if(editableUser) {
            setUser(editableUser);
        }
        setIsEditing(false);
        showToast('Profile updated!', 'success');
    };

    const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setEditableUser(prev => prev ? ({ ...prev, [name]: value }) : null);
    };

    const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setEditableUser(prev => prev ? ({ ...prev, avatar: event.target?.result as string }) : null);
            };
            reader.readAsDataURL(file);
        }
    };
    
    const handlePasswordReset = async () => {
        if(user && user.email) {
            try {
                await sendPasswordResetEmail(auth, user.email);
                showToast('Password reset email sent.', 'success');
            } catch (error) {
                showToast('Failed to send password reset email.', 'error');
            }
        }
    }

    const planColorMap: Record<Plan, string> = {
        Free: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
        Pro: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200',
        Elite: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200',
        Agency: 'bg-primary-100 text-primary-800 dark:bg-primary-900/50 dark:text-primary-200',
        Growth: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
        Starter: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
    };

    const storagePercentage = user.storageLimit > 0 ? (user.storageUsed / user.storageLimit) * 100 : 0;

    useEffect(() => {
        if (usageTab === 'ads' && canEdit) {
            loadStoredAds();
        }
    }, [usageTab, canEdit]);

    const loadStoredAds = async () => {
        setIsLoadingAds(true);
        try {
            const result = await getGeneratedContent('ad');
            if (result.success) {
                setStoredAds(result.content || []);
            }
        } catch (err) {
            console.error('Failed to load ads:', err);
            showToast('Failed to load saved ads', 'error');
        } finally {
            setIsLoadingAds(false);
        }
    };

    const handleDownloadAd = (ad: any) => {
        const content = [
            ad.headline,
            ad.adType === 'text' ? ad.adCopy : ad.videoPrompt,
            ad.description,
            ad.callToAction,
            ad.hashtags?.join(' '),
        ].filter(Boolean).join('\n\n');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ad-${ad.adType}-${ad.id}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Ad downloaded!', 'success');
    };

    return (
        <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-full">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{currentAccountName}'s Profile</h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">View and manage profile information.</p>
                </div>

                {/* Account Overview Section */}
                {canEdit && (
                    <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="flex items-center space-x-4">
                                <div className="p-3 bg-primary-50 dark:bg-primary-900/30 rounded-lg">
                                    <CreditCardIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Current Plan</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`px-3 py-1 text-xs font-semibold rounded-full ${planColorMap[user.plan]}`}>
                                            {user.plan}
                                        </span>
                                        {user.plan !== 'Free' && (
                                            <button 
                                                onClick={() => setActivePage('pricing')}
                                                className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
                                            >
                                                Manage
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center space-x-4">
                                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg">
                                    <CalendarIcon className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Member Since</p>
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                                        {new Date(user.signupDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center space-x-4">
                                <div className="p-3 bg-amber-50 dark:bg-amber-900/30 rounded-lg">
                                    <LockIcon className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Storage</p>
                                    <div className="mt-1">
                                        <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                                            <span>{(user.storageUsed || 0).toFixed(1)}MB</span>
                                            <span>{(user.storageLimit || 0)}MB</span>
                                        </div>
                                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                            <div 
                                                className={`h-2 rounded-full transition-all ${
                                                    storagePercentage > 90 ? 'bg-red-500' : 
                                                    storagePercentage > 70 ? 'bg-amber-500' : 
                                                    'bg-emerald-500'
                                                }`}
                                                style={{ width: `${Math.min(storagePercentage, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

            <SettingsSection title="Profile Information">
                <div className="flex items-center space-x-6">
                    <div className="relative">
                        <img src={canEdit && isEditing && editableUser ? editableUser.avatar : currentData.avatar} alt="Profile" className="w-28 h-28 rounded-full object-cover border-4 border-white dark:border-gray-800 shadow-lg ring-2 ring-gray-200 dark:ring-gray-700" />
                        {isEditing && (
                            <>
                                <input type="file" ref={fileInputRef} onChange={handleAvatarChange} className="hidden" accept="image/*" />
                                <button onClick={() => fileInputRef.current?.click()} className="absolute bottom-0 right-0 p-2 bg-gradient-to-r from-primary-600 to-primary-500 text-white rounded-full hover:from-primary-700 hover:to-primary-600 shadow-md transition-all">
                                    <CameraIcon className="w-4 h-4" />
                                </button>
                            </>
                        )}
                    </div>
                    <div className="flex-1 space-y-2">
                        {canEdit && isEditing && editableUser ? (
                            <input 
                                type="text" 
                                name="name" 
                                value={editableUser.name} 
                                onChange={handleInputChange} 
                                className="w-full p-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-xl font-bold focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all" 
                            />
                        ) : (
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{currentData.name}</h3>
                        )}
                        {'email' in currentData && <p className="text-gray-500 dark:text-gray-400">{(currentData as User).email}</p>}
                    </div>
                </div>
                 {canEdit && (isEditing && editableUser ? (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Bio</label>
                        <textarea 
                            name="bio" 
                            value={editableUser.bio} 
                            onChange={handleInputChange} 
                            rows={4} 
                            className="w-full p-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all resize-none" 
                            placeholder="Tell us about yourself..."
                        />
                    </div>
                 ) : (
                    'bio' in currentData && (currentData as User).bio ? (
                        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">{(currentData as User).bio}</p>
                        </div>
                    ) : (
                        <p className="text-gray-400 dark:text-gray-500 italic mt-4">No bio added yet.</p>
                    )
                 ))}

                 {/* --- Role-Specific Fields --- */}
                 {canEdit && user.userType === 'Business' && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t dark:border-gray-700">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Name</label>
                            {isEditing && editableUser ? (
                                <input 
                                    type="text" 
                                    name="businessName" 
                                    value={editableUser.businessName || ''} 
                                    onChange={handleInputChange} 
                                    className="w-full p-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all" 
                                    placeholder="Enter business name"
                                />
                            ) : (
                                <p className="text-gray-900 dark:text-white font-semibold">{user.businessName || 'Not set'}</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Industry</label>
                            {isEditing && editableUser ? (
                                <input 
                                    type="text" 
                                    name="businessType" 
                                    value={editableUser.businessType || ''} 
                                    onChange={handleInputChange} 
                                    className="w-full p-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all" 
                                    placeholder="Enter industry"
                                />
                            ) : (
                                <p className="text-gray-900 dark:text-white font-semibold">{user.businessType || 'Not set'}</p>
                            )}
                        </div>
                    </div>
                 )}

                 {canEdit && user.userType === 'Creator' && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t dark:border-gray-700">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Niche</label>
                            {isEditing && editableUser ? (
                                <input 
                                    type="text" 
                                    name="niche" 
                                    value={editableUser.niche || ''} 
                                    onChange={handleInputChange} 
                                    className="w-full p-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all" 
                                    placeholder="Enter your niche"
                                />
                            ) : (
                                <p className="text-gray-900 dark:text-white font-semibold">{user.niche || 'Not set'}</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Target Audience</label>
                            {isEditing && editableUser ? (
                                <input 
                                    type="text" 
                                    name="audience" 
                                    value={editableUser.audience || ''} 
                                    onChange={handleInputChange} 
                                    className="w-full p-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all" 
                                    placeholder="Enter target audience"
                                />
                            ) : (
                                <p className="text-gray-900 dark:text-white font-semibold">{user.audience || 'Not set'}</p>
                            )}
                        </div>
                    </div>
                 )}
                 {/* ------------------------- */}

                 {canEdit && (
                    <div className="flex justify-end space-x-3 mt-4">
                        {isEditing ? (
                            <>
                                <button onClick={handleEditToggle} className="px-5 py-2.5 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 font-semibold transition-all">Cancel</button>
                                <button onClick={handleSave} className="px-5 py-2.5 bg-gradient-to-r from-primary-600 to-primary-500 text-white rounded-lg hover:from-primary-700 hover:to-primary-600 font-semibold shadow-md transition-all">Save</button>
                            </>
                        ) : (
                            <button onClick={handleEditToggle} className="px-5 py-2.5 bg-gradient-to-r from-primary-600 to-primary-500 text-white rounded-lg hover:from-primary-700 hover:to-primary-600 font-semibold shadow-md transition-all">Edit</button>
                        )}
                    </div>
                 )}
            </SettingsSection>
            
                {/* Usage Statistics */}
                {canEdit && (
                    <SettingsSection title="Usage Statistics">
                        {/* Tabs */}
                        <div className="flex gap-2 mb-4 border-b border-gray-200 dark:border-gray-700">
                            <button
                                onClick={() => setUsageTab('stats')}
                                className={`px-4 py-2 font-medium text-sm transition-colors ${
                                    usageTab === 'stats'
                                        ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                            >
                                Statistics
                            </button>
                            <button
                                onClick={() => setUsageTab('ads')}
                                className={`px-4 py-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                                    usageTab === 'ads'
                                        ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                            >
                                <SparklesIcon className="w-4 h-4" />
                                Ad Generator
                            </button>
                        </div>

                        {/* Stats Tab */}
                        {usageTab === 'stats' && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Image Generations</p>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                        {user.monthlyImageGenerationsUsed || 0}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">This month</p>
                                </div>
                                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Video Generations</p>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                        {user.monthlyVideoGenerationsUsed || 0}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">This month</p>
                                </div>
                                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Caption Generations</p>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                        {user.monthlyCaptionGenerationsUsed || 0}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">This month</p>
                                </div>
                                {(user.monthlyAdGenerationsUsed || user.monthlyVideoAdGenerationsUsed) && (
                                    <>
                                        <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Text Ads Generated</p>
                                            <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                                {user.monthlyAdGenerationsUsed || 0}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">This month</p>
                                        </div>
                                        <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Video Ads Generated</p>
                                            <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                                {user.monthlyVideoAdGenerationsUsed || 0}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">This month</p>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Ads Tab */}
                        {usageTab === 'ads' && (
                            <div>
                                {isLoadingAds ? (
                                    <div className="text-center py-8">
                                        <p className="text-gray-500 dark:text-gray-400">Loading saved ads...</p>
                                    </div>
                                ) : storedAds.length === 0 ? (
                                    <div className="text-center py-12">
                                        <SparklesIcon className="w-12 h-12 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
                                        <p className="text-gray-500 dark:text-gray-400">No saved ads yet</p>
                                        <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Generate and save ads from the Ad Generator</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {storedAds.map((ad) => (
                                            <div
                                                key={ad.id}
                                                className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                                            >
                                                <div className="flex items-start justify-between mb-2">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className={`px-2 py-1 text-xs font-semibold rounded ${
                                                                ad.adType === 'text' 
                                                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                                                                    : 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                                                            }`}>
                                                                {ad.adType === 'text' ? 'Text Ad' : 'Video Ad'}
                                                            </span>
                                                            {ad.platform && (
                                                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                                                    {ad.platform}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {ad.headline && (
                                                            <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
                                                                {ad.headline}
                                                            </h4>
                                                        )}
                                                        {ad.adCopy && (
                                                            <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 mb-2">
                                                                {ad.adCopy}
                                                            </p>
                                                        )}
                                                        {ad.videoPrompt && (
                                                            <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 mb-2">
                                                                {ad.videoPrompt}
                                                            </p>
                                                        )}
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                                            {new Date(ad.createdAt).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={() => handleDownloadAd(ad)}
                                                        className="ml-4 p-2 text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                                                        title="Download ad"
                                                    >
                                                        <DownloadIcon className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </SettingsSection>
                )}

            {canEdit && (
                <SettingsSection title="Security">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">Password</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Reset your password via email</p>
                        </div>
                        <button 
                            onClick={handlePasswordReset} 
                            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 font-semibold transition-all"
                        >
                            Reset Password
                        </button>
                    </div>
                </SettingsSection>
            )}
            </div>
        </div>
    );
};