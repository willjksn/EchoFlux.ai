import React, { useState, useRef, ChangeEvent, useEffect, useMemo, useLayoutEffect } from 'react';
import { CameraIcon, TrashIcon, CheckCircleIcon, CalendarIcon, CreditCardIcon, LockIcon, DownloadIcon, SparklesIcon, EmojiIcon, FaceSmileIcon, CatIcon, PizzaIcon, SoccerBallIcon, CarIcon, LightbulbIcon, HeartIcon } from './icons/UIIcons';
import { EMOJIS, EMOJI_CATEGORIES, Emoji } from './emojiData';
import { useAppContext } from './AppContext';
import { User, MediaItem, Client, Plan } from '../types';
import { ReferralSystem } from './ReferralSystem';

const categoryIcons: Record<string, React.ReactNode> = {
    FaceSmileIcon: <FaceSmileIcon className="w-5 h-5"/>,
    CatIcon: <CatIcon className="w-5 h-5"/>,
    PizzaIcon: <PizzaIcon className="w-5 h-5"/>,
    SoccerBallIcon: <SoccerBallIcon className="w-5 h-5"/>,
    CarIcon: <CarIcon className="w-5 h-5"/>,
    LightbulbIcon: <LightbulbIcon className="w-5 h-5"/>,
    HeartIcon: <HeartIcon className="w-5 h-5"/>,
};
import { auth, storage } from '../firebaseConfig';
// @ts-ignore
import * as storageFunctions from 'firebase/storage';
import { sendPasswordResetEmail } from 'firebase/auth';
import { getGeneratedContent } from '../src/services/geminiService';
import { listAll, getMetadata, ref } from 'firebase/storage';

const SettingsSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{title}</h3>
        <div className="space-y-4">{children}</div>
    </div>
);

export const Profile: React.FC = () => {
    const { user, setUser, setActivePage, selectedClient, clients, setClients, showToast, openPaymentModal, setPricingView } = useAppContext();
    const [isEditing, setIsEditing] = useState(false);
    const [editableUser, setEditableUser] = useState<User | null>(user);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [usageTab, setUsageTab] = useState<'stats' | 'ads'>('stats');
    const [storedAds, setStoredAds] = useState<any[]>([]);
    const [isLoadingAds, setIsLoadingAds] = useState(false);
    
    // Emoji picker state for name field
    const [isNameEmojiPickerOpen, setIsNameEmojiPickerOpen] = useState(false);
    const [nameEmojiSearchTerm, setNameEmojiSearchTerm] = useState('');
    const [nameActiveEmojiCategory, setNameActiveEmojiCategory] = useState<Emoji['category']>(EMOJI_CATEGORIES[0].name);
    const [namePopoverPositionClass, setNamePopoverPositionClass] = useState('bottom-full mb-2');
    const nameInputRef = useRef<HTMLInputElement>(null);
    const nameEmojiPickerRef = useRef<HTMLDivElement>(null);
    const nameEmojiButtonRef = useRef<HTMLButtonElement>(null);
    
    // Emoji picker state for bio field
    const [isBioEmojiPickerOpen, setIsBioEmojiPickerOpen] = useState(false);
    const [bioEmojiSearchTerm, setBioEmojiSearchTerm] = useState('');
    const [bioActiveEmojiCategory, setBioActiveEmojiCategory] = useState<Emoji['category']>(EMOJI_CATEGORIES[0].name);
    const [bioPopoverPositionClass, setBioPopoverPositionClass] = useState('bottom-full mb-2');
    const bioTextareaRef = useRef<HTMLTextAreaElement>(null);
    const bioEmojiPickerRef = useRef<HTMLDivElement>(null);
    const bioEmojiButtonRef = useRef<HTMLButtonElement>(null);
    
    const nameFilteredEmojis = useMemo(() => {
        const lowercasedTerm = nameEmojiSearchTerm.toLowerCase();
        if (lowercasedTerm) {
            return EMOJIS.filter(e =>
                e.description.toLowerCase().includes(lowercasedTerm) ||
                e.aliases.some(a => a.includes(lowercasedTerm))
            );
        }
        return EMOJIS.filter(e => e.category === nameActiveEmojiCategory);
    }, [nameEmojiSearchTerm, nameActiveEmojiCategory]);
    
    const bioFilteredEmojis = useMemo(() => {
        const lowercasedTerm = bioEmojiSearchTerm.toLowerCase();
        if (lowercasedTerm) {
            return EMOJIS.filter(e =>
                e.description.toLowerCase().includes(lowercasedTerm) ||
                e.aliases.some(a => a.includes(lowercasedTerm))
            );
        }
        return EMOJIS.filter(e => e.category === bioActiveEmojiCategory);
    }, [bioEmojiSearchTerm, bioActiveEmojiCategory]);
    
    useLayoutEffect(() => {
        if (isNameEmojiPickerOpen && nameInputRef.current) {
            const POPOVER_HEIGHT = 350;
            const rect = nameInputRef.current.getBoundingClientRect();
            const spaceAbove = rect.top;
            if (spaceAbove < POPOVER_HEIGHT + 10) {
                setNamePopoverPositionClass('top-full mt-2');
            } else {
                setNamePopoverPositionClass('bottom-full mb-2');
            }
        }
    }, [isNameEmojiPickerOpen]);
    
    useLayoutEffect(() => {
        if (isBioEmojiPickerOpen && bioTextareaRef.current) {
            const POPOVER_HEIGHT = 350;
            const rect = bioTextareaRef.current.getBoundingClientRect();
            const spaceAbove = rect.top;
            if (spaceAbove < POPOVER_HEIGHT + 10) {
                setBioPopoverPositionClass('top-full mt-2');
            } else {
                setBioPopoverPositionClass('bottom-full mb-2');
            }
        }
    }, [isBioEmojiPickerOpen]);
    
    const handleNameEmojiSelect = (emoji: string) => {
        if (nameInputRef.current && editableUser) {
            const { selectionStart, selectionEnd } = nameInputRef.current;
            const currentName = editableUser.name || '';
            const newName =
                currentName.substring(0, selectionStart) +
                emoji +
                currentName.substring(selectionEnd);
            setEditableUser({ ...editableUser, name: newName });
            setTimeout(() => {
                if (nameInputRef.current) {
                    nameInputRef.current.focus();
                    const newCursorPosition = selectionStart + emoji.length;
                    nameInputRef.current.setSelectionRange(newCursorPosition, newCursorPosition);
                }
            }, 0);
        }
    };
    
    const handleBioEmojiSelect = (emoji: string) => {
        if (bioTextareaRef.current && editableUser) {
            const { selectionStart, selectionEnd } = bioTextareaRef.current;
            const currentBio = editableUser.bio || '';
            const newBio =
                currentBio.substring(0, selectionStart) +
                emoji +
                currentBio.substring(selectionEnd);
            setEditableUser({ ...editableUser, bio: newBio });
            setTimeout(() => {
                if (bioTextareaRef.current) {
                    bioTextareaRef.current.focus();
                    const newCursorPosition = selectionStart + emoji.length;
                    bioTextareaRef.current.setSelectionRange(newCursorPosition, newCursorPosition);
                }
            }, 0);
        }
    };
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                nameEmojiPickerRef.current && 
                !nameEmojiPickerRef.current.contains(event.target as Node) &&
                nameEmojiButtonRef.current && 
                !nameEmojiButtonRef.current.contains(event.target as Node) &&
                bioEmojiPickerRef.current && 
                !bioEmojiPickerRef.current.contains(event.target as Node) &&
                bioEmojiButtonRef.current && 
                !bioEmojiButtonRef.current.contains(event.target as Node)
            ) {
                setIsNameEmojiPickerOpen(false);
                setNameEmojiSearchTerm('');
                setIsBioEmojiPickerOpen(false);
                setBioEmojiSearchTerm('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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

    const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && user) {
            try {
                // Upload to Firebase Storage
                const timestamp = Date.now();
                const extension = file.type.split('/')[1] || 'jpg';
                const storagePath = `users/${user.id}/profile_avatar/${timestamp}.${extension}`;
                const storageRef = ref(storage, storagePath);
                
                await storageFunctions.uploadBytes(storageRef, file, { contentType: file.type });
                const downloadURL = await storageFunctions.getDownloadURL(storageRef);
                
                // Update user with Firebase URL (persists across sessions)
                const updatedUser = { ...editableUser, avatar: downloadURL } as User;
                setEditableUser(updatedUser);
                setUser(updatedUser);
                
                showToast('Profile picture uploaded and saved!', 'success');
            } catch (error) {
                console.error('Failed to upload avatar:', error);
                showToast('Failed to upload profile picture', 'error');
            }
        }
    };
    
    const handlePasswordReset = async () => {
        if(user && user.email) {
            try {
                const actionCodeSettings = {
                    url: `${window.location.origin}/reset-password?email=${encodeURIComponent(user.email)}`,
                    handleCodeInApp: false, // Open link in email client, not app
                };
                await sendPasswordResetEmail(auth, user.email, actionCodeSettings);
                showToast('Password reset email sent. Please check your email and click the link to reset your password.', 'success');
            } catch (error: any) {
                console.error('Error sending password reset email:', error);
                showToast(error.message || 'Failed to send password reset email.', 'error');
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

    const [storageUsage, setStorageUsage] = useState({ used: 0, total: Infinity });
    const [isLoadingStorage, setIsLoadingStorage] = useState(true);

    // Calculate actual storage usage from Firebase Storage
    const calculateStorageUsage = async () => {
        if (!user) return;
        
        setIsLoadingStorage(true);
        try {
            let totalBytes = 0;
            
            // Check all storage folders
            const folders = ['uploads', 'media_library', 'automation', 'voices', 'profile_avatar', 'bio_avatar', 'roadmap'];
            
            for (const folder of folders) {
                try {
                    const folderRef = ref(storage, `users/${user.id}/${folder}`);
                    const listResult = await listAll(folderRef);
                    
                    for (const itemRef of listResult.items) {
                        try {
                            const metadata = await getMetadata(itemRef);
                            totalBytes += metadata.size || 0;
                        } catch (err) {
                            console.warn(`Failed to get metadata for ${itemRef.fullPath}:`, err);
                        }
                    }
                } catch (err) {
                    console.warn(`Failed to list ${folder}:`, err);
                }
            }
            
            const usedMB = totalBytes / (1024 * 1024); // Convert to MB
            
            // Determine storage limit based on plan
            let limitMB = Infinity;
            if (user.plan === 'Free') limitMB = 100;
            else if (user.plan === 'Pro') limitMB = 5120; // 5 GB
            else if (user.plan === 'Starter') limitMB = 1024; // 1 GB
            else if (user.plan === 'Elite' || user.plan === 'Growth') limitMB = 10240; // 10 GB
            else if (user.plan === 'Agency') limitMB = 51200; // 50 GB
            
            setStorageUsage({ used: usedMB, total: limitMB });
        } catch (error) {
            console.error('Failed to calculate storage usage:', error);
            setStorageUsage({ used: 0, total: Infinity });
        } finally {
            setIsLoadingStorage(false);
        }
    };

    useEffect(() => {
        calculateStorageUsage();
    }, [user?.id]);

    const storagePercentage = storageUsage.total > 0 && storageUsage.total !== Infinity 
        ? (storageUsage.used / storageUsage.total) * 100 
        : 0;

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
        // Safe removal (can be triggered twice in some browsers / race conditions)
        a.remove();
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
                                        <button 
                                            onClick={() => {
                                                setPricingView(user?.userType === 'Business' ? 'Business' : 'Creator');
                                                setActivePage('pricing');
                                            }}
                                            className="text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
                                        >
                                            {user.plan === 'Free' ? 'Upgrade' : 'Manage Plan'}
                                        </button>
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
                                            <span>{isLoadingStorage ? 'Calculating...' : `${storageUsage.used.toFixed(2)} MB`}</span>
                                            <span>{storageUsage.total === Infinity ? '∞' : `${storageUsage.total.toFixed(0)} MB`}</span>
                                        </div>
                                        {!isLoadingStorage && storageUsage.total > 0 && storageUsage.total !== Infinity && (
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
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

            <SettingsSection title="Profile Information">
                <div className="flex items-center space-x-6">
                    <div className="relative flex-shrink-0">
                        <img 
                            src={canEdit && isEditing && editableUser ? editableUser.avatar : currentData.avatar} 
                            alt="Profile" 
                            className="w-28 h-28 aspect-square rounded-full object-cover border-4 border-white dark:border-gray-800 shadow-lg ring-2 ring-gray-200 dark:ring-gray-700" 
                        />
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
                            <div className="relative">
                                <input 
                                    ref={nameInputRef}
                                    type="text" 
                                    name="name" 
                                    value={editableUser.name} 
                                    onChange={handleInputChange} 
                                    className="w-full p-3 pr-10 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-xl font-bold focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all" 
                                />
                                <button
                                    ref={nameEmojiButtonRef}
                                    type="button"
                                    onClick={() => setIsNameEmojiPickerOpen(prev => !prev)}
                                    className="absolute right-2 top-2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                    title="Add emoji"
                                >
                                    <EmojiIcon className="w-5 h-5" />
                                </button>
                                {isNameEmojiPickerOpen && (
                                    <div
                                        ref={nameEmojiPickerRef}
                                        className={`absolute z-10 right-0 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-2 flex flex-col border border-gray-200 dark:border-gray-600 ${namePopoverPositionClass}`}
                                    >
                                        <div className="px-1 pb-2">
                                            <input
                                                type="text"
                                                placeholder="Search emojis..."
                                                value={nameEmojiSearchTerm}
                                                onChange={e => setNameEmojiSearchTerm(e.target.value)}
                                                className="w-full p-2 border rounded-md bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-sm"
                                            />
                                        </div>
                                        <div className="grid grid-cols-8 gap-1 overflow-y-auto max-h-64 pr-1 scrollbar-thin">
                                            {nameFilteredEmojis.map(({ emoji, description }) => (
                                                <button
                                                    key={description}
                                                    type="button"
                                                    onClick={() => handleNameEmojiSelect(emoji)}
                                                    className="text-2xl p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 flex justify-center items-center"
                                                    title={description}
                                                >
                                                    {emoji}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="pt-2 border-t border-gray-200 dark:border-gray-700 grid grid-cols-7 gap-1">
                                            {EMOJI_CATEGORIES.map(({name, icon}) => (
                                                <button 
                                                    key={name}
                                                    onClick={() => { setNameActiveEmojiCategory(name); setNameEmojiSearchTerm(''); }}
                                                    className={`p-1.5 rounded-md ${nameActiveEmojiCategory === name && !nameEmojiSearchTerm ? 'bg-primary-100 dark:bg-primary-900/50' : 'hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                                                    title={name}
                                                >
                                                    <span className={nameActiveEmojiCategory === name && !nameEmojiSearchTerm ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'}>
                                                        {categoryIcons[icon]}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{currentData.name}</h3>
                        )}
                        {'email' in currentData && <p className="text-gray-500 dark:text-gray-400">{(currentData as User).email}</p>}
                    </div>
                </div>
                 {canEdit && (isEditing && editableUser ? (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Bio</label>
                        <div className="relative">
                            <textarea 
                                ref={bioTextareaRef}
                                name="bio" 
                                value={editableUser.bio} 
                                onChange={handleInputChange} 
                                rows={4} 
                                className="w-full p-3 pr-10 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all resize-none" 
                                placeholder="Tell us about yourself..."
                            />
                            <button
                                ref={bioEmojiButtonRef}
                                type="button"
                                onClick={() => setIsBioEmojiPickerOpen(prev => !prev)}
                                className="absolute right-2 top-2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                title="Add emoji"
                            >
                                <EmojiIcon className="w-5 h-5" />
                            </button>
                            {isBioEmojiPickerOpen && (
                                <div
                                    ref={bioEmojiPickerRef}
                                    className={`absolute z-10 right-0 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-2 flex flex-col border border-gray-200 dark:border-gray-600 ${bioPopoverPositionClass}`}
                                >
                                    <div className="px-1 pb-2">
                                        <input
                                            type="text"
                                            placeholder="Search emojis..."
                                            value={bioEmojiSearchTerm}
                                            onChange={e => setBioEmojiSearchTerm(e.target.value)}
                                            className="w-full p-2 border rounded-md bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-sm"
                                        />
                                    </div>
                                    <div className="grid grid-cols-8 gap-1 overflow-y-auto max-h-64 pr-1 scrollbar-thin">
                                        {bioFilteredEmojis.map(({ emoji, description }) => (
                                            <button
                                                key={description}
                                                type="button"
                                                onClick={() => handleBioEmojiSelect(emoji)}
                                                className="text-2xl p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 flex justify-center items-center"
                                                title={description}
                                            >
                                                {emoji}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="pt-2 border-t border-gray-200 dark:border-gray-700 grid grid-cols-7 gap-1">
                                        {EMOJI_CATEGORIES.map(({name, icon}) => (
                                            <button 
                                                key={name}
                                                onClick={() => { setBioActiveEmojiCategory(name); setBioEmojiSearchTerm(''); }}
                                                className={`p-1.5 rounded-md ${bioActiveEmojiCategory === name && !bioEmojiSearchTerm ? 'bg-primary-100 dark:bg-primary-900/50' : 'hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                                                title={name}
                                            >
                                                <span className={bioActiveEmojiCategory === name && !bioEmojiSearchTerm ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'}>
                                                    {categoryIcons[icon]}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
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
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Image Generations <span className="text-xs">(Coming Soon)</span></p>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                        {user.monthlyImageGenerationsUsed || 0}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">This month</p>
                                </div>
                                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Video Generations <span className="text-xs">(Coming Soon)</span></p>
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
                <>
                    <SettingsSection title="Referral Program">
                        <ReferralSystem />
                    </SettingsSection>
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
                </>
            )}
            </div>
        </div>
    );
};