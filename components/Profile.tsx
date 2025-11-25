import React, { useState, useRef, ChangeEvent } from 'react';
import { CameraIcon, TrashIcon } from './icons/UIIcons';
import { useAppContext } from './AppContext';
import { User, MediaItem, Client } from '../types';
import { auth, storage } from '../firebaseConfig';
// FIX: Use namespace import for firebase/storage to resolve module resolution issues.
import * as storageApi from 'firebase/storage';
import { sendPasswordResetEmail } from 'firebase/auth';

const SettingsSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
        <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{title}</h3>
        <div className="space-y-4">{children}</div>
    </div>
);

const ToggleSwitch: React.FC<{ label: string; enabled: boolean; onChange: () => void; description?: string }> = ({ label, enabled, onChange, description }) => (
    <div>
        <div className="flex items-center justify-between">
            <span className="font-medium text-gray-700 dark:text-gray-300">{label}</span>
            <button
              onClick={onChange}
              className={`${ enabled ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600' } relative inline-flex h-6 w-11 items-center rounded-full transition-colors`}
            >
              <span className={`${ enabled ? 'translate-x-6' : 'translate-x-1' } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
            </button>
        </div>
        {description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{description}</p>}
    </div>
);


export const Profile: React.FC = () => {
    const { user, setUser, setActivePage, selectedClient, clients, setClients, showToast } = useAppContext();
    const [isEditing, setIsEditing] = useState(false);
    const [editableUser, setEditableUser] = useState<User | null>(user);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [viewingImage, setViewingImage] = useState<MediaItem | null>(null);

    const currentData = selectedClient ? clients.find(c => c.id === selectedClient.id) : user;
    const currentAccountName = selectedClient ? selectedClient.name : user?.name;
    const canEdit = !selectedClient && user;

    if (!currentData || !user) {
        return (
            <div className="max-w-4xl mx-auto space-y-8 text-center">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Profile Not Found</h2>
                <p className="text-gray-500 dark:text-gray-400">Could not find data for the selected profile.</p>
            </div>
        );
    }
    
    const handleEditToggle = () => {
        if (isEditing) {
            setEditableUser(user); // Revert changes on cancel
        } else {
            setEditableUser(user); // Set editable user when starting edit
        }
        setIsEditing(!isEditing);
    };

    const handleSave = () => {
        if(editableUser) {
            setUser(editableUser);
        }
        setIsEditing(false);
        showToast('Profile updated successfully!', 'success');
    };

    const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setEditableUser(prev => prev ? ({ ...prev, [name]: value }) : null);
    };
    
    const handleToggleNotificationSetting = (key: keyof User['notifications']) => {
        if (selectedClient) {
            setClients(prevClients =>
                prevClients.map(client => {
                    if (client.id === selectedClient.id) {
                        const newNotifications = {
                            ...client.notifications,
                            [key]: !client.notifications[key]
                        };
                        return { ...client, notifications: newNotifications };
                    }
                    return client;
                })
            );
        } else {
            setUser(prevUser => {
                if (!prevUser) return null;
                const newNotifications = {
                    ...prevUser.notifications,
                    [key]: !prevUser.notifications[key]
                };
                return {
                    ...prevUser,
                    notifications: newNotifications,
                };
            });
        }
        showToast('Notification setting updated!', 'success');
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
    
    const handleDeleteMedia = async (mediaItem: MediaItem) => {
        try {
            if (mediaItem.url.startsWith('https://firebasestorage.googleapis.com')) {
                const sRef = storageApi.ref(storage, mediaItem.url);
                await storageApi.deleteObject(sRef);
            }
        } catch (error) {
            console.error("Error deleting file from storage:", error);
            showToast('Failed to delete file from storage. It may have already been removed.', 'error');
        }

        const updateLibrary = (account: User | Client) => {
            const updatedLibrary = account.mediaLibrary.filter(item => item.id !== mediaItem.id);
            const updatedUsage = (account.storageUsed || 0) - (mediaItem.size || 0);
            return { ...account, mediaLibrary: updatedLibrary, storageUsed: Math.max(0, updatedUsage) };
        };

        if (selectedClient) {
            setClients(currentClients => currentClients.map(c => c.id === selectedClient.id ? updateLibrary(c) as Client : c));
        } else if(user) {
            setUser(updateLibrary(user) as User);
        }
        showToast(`${mediaItem.name} deleted.`, 'success');
    };

    const handlePasswordReset = async () => {
        if (auth.currentUser?.email) {
            try {
                await sendPasswordResetEmail(auth, auth.currentUser.email);
                showToast('Password reset email sent!', 'success');
            } catch (error) {
                console.error(error);
                showToast('Failed to send reset email.', 'error');
            }
        }
    };

    const storagePercentage = (currentData.storageUsed / currentData.storageLimit) * 100;

    return (
        <div className="max-w-4xl mx-auto space-y-8">

            {viewingImage && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80" onClick={() => setViewingImage(null)}>
                    <img src={viewingImage.url} alt={viewingImage.name} className="max-w-[90vw] max-h-[90vh] object-contain" />
                </div>
            )}

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Profile: {currentAccountName}</h2>
                {canEdit && (
                    <div className="flex gap-4">
                        {isEditing ? (
                            <>
                                <button onClick={handleEditToggle} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-200">Cancel</button>
                                <button onClick={handleSave} className="px-4 py-2 bg-primary-600 text-white rounded-md">Save Changes</button>
                            </>
                        ) : (
                             <button onClick={handleEditToggle} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md">Edit Profile</button>
                        )}
                    </div>
                )}
            </div>

            <SettingsSection title="Account Information">
                 <div className="flex items-center space-x-6">
                    <div className="relative group">
                        <img src={isEditing && editableUser ? editableUser.avatar : currentData.avatar} alt="Avatar" className="w-24 h-24 rounded-full object-cover"/>
                        {isEditing && (
                            <>
                                <input type="file" ref={fileInputRef} onChange={handleAvatarChange} className="hidden" accept="image/*" />
                                <button onClick={() => fileInputRef.current?.click()} className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                    <CameraIcon />
                                </button>
                            </>
                        )}
                    </div>
                    <div className="flex-1 space-y-2">
                         <div>
                            <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Name</label>
                            {isEditing ? (
                                <input name="name" value={editableUser?.name || ''} onChange={handleInputChange} className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600"/>
                            ) : (
                                <p className="font-semibold text-lg text-gray-900 dark:text-white">{currentData.name}</p>
                            )}
                        </div>
                         <div>
                            <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</label>
                            <p className="text-gray-700 dark:text-gray-300">
                                {'email' in currentData && currentData.email ? currentData.email : 'N/A for clients'}
                            </p>
                        </div>
                    </div>
                </div>
                <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Bio</label>
                     {isEditing ? (
                        <textarea name="bio" value={editableUser?.bio || ''} onChange={handleInputChange} rows={3} className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600"/>
                    ) : (
                        <p className="text-gray-700 dark:text-gray-300">
                           {'bio' in currentData && currentData.bio ? currentData.bio : 'No bio set.'}
                        </p>
                    )}
                </div>
                {canEdit && (
                    <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                        <button onClick={handlePasswordReset} className="text-sm text-primary-600 hover:underline">Send Password Reset Email</button>
                    </div>
                )}
            </SettingsSection>
            
            <SettingsSection title="Plan & Usage">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-medium text-gray-900 dark:text-white">Current Plan</p>
                        <p className="text-2xl font-bold text-primary-600">{currentData.plan}</p>
                    </div>
                    <button onClick={() => setActivePage('pricing')} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">Manage Plan</button>
                </div>
                <div className="space-y-2">
                    <div>
                        <div className="flex justify-between mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                            <span>Storage</span>
                            <span>{currentData.storageUsed.toFixed(2)}MB / {currentData.storageLimit}MB</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                            <div className="bg-primary-600 h-2.5 rounded-full" style={{width: `${storagePercentage}%`}}></div>
                        </div>
                    </div>
                </div>
            </SettingsSection>

             <SettingsSection title="Media Library">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {currentData.mediaLibrary.map(item => (
                        <div key={item.id} className="relative group aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
                            {item.type === 'image' ? (
                                <img src={item.url} alt={item.name} className="w-full h-full object-cover"/>
                            ) : (
                                <video src={item.url} className="w-full h-full object-cover" />
                            )}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2 text-white">
                                <p className="text-xs font-bold line-clamp-2">{item.name}</p>
                                <div className="flex justify-end gap-2">
                                     <button onClick={() => setViewingImage(item)} className="p-1.5 bg-white/20 rounded-full backdrop-blur-sm hover:bg-white/40">
                                         <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                    </button>
                                    {canEdit && <button onClick={() => handleDeleteMedia(item)} className="p-1.5 bg-red-500/80 rounded-full backdrop-blur-sm hover:bg-red-500">
                                        <TrashIcon />
                                    </button>}
                                </div>
                            </div>
                        </div>
                    ))}
                    {currentData.mediaLibrary.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400 col-span-full text-center py-8">Your media library is empty.</p>}
                </div>
            </SettingsSection>

            <SettingsSection title="Notification Settings">
                <ToggleSwitch 
                    label="New Messages" 
                    description="Receive an email when you get a new direct message."
                    enabled={currentData.notifications.newMessages} 
                    onChange={() => handleToggleNotificationSetting('newMessages')}
                />
                <ToggleSwitch 
                    label="Weekly Summary"
                    description="Get a weekly performance report delivered to your inbox."
                    enabled={currentData.notifications.weeklySummary} 
                    onChange={() => handleToggleNotificationSetting('weeklySummary')}
                />
                <ToggleSwitch 
                    label="Trend Alerts"
                    description="Be notified when a new engagement opportunity is detected."
                    enabled={currentData.notifications.trendAlerts} 
                    onChange={() => handleToggleNotificationSetting('trendAlerts')}
                />
            </SettingsSection>
        </div>
    );
};