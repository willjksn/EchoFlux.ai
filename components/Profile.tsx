import React, { useState, useRef, ChangeEvent } from 'react';
import { CameraIcon, TrashIcon } from './icons/UIIcons';
import { useAppContext } from './AppContext';
import { User, MediaItem, Client } from '../types';
import { auth, storage } from '../firebaseConfig';
// @ts-ignore
import * as storageFunctions from 'firebase/storage';
import { sendPasswordResetEmail } from 'firebase/auth';

const SettingsSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
        <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{title}</h3>
        <div className="space-y-4">{children}</div>
    </div>
);

export const Profile: React.FC = () => {
    const { user, setUser, setActivePage, selectedClient, clients, setClients, showToast } = useAppContext();
    const [isEditing, setIsEditing] = useState(false);
    const [editableUser, setEditableUser] = useState<User | null>(user);
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">{currentAccountName}'s Profile</h2>

            <SettingsSection title="Profile Information">
                <div className="flex items-center space-x-6">
                    <div className="relative">
                        <img src={canEdit && isEditing && editableUser ? editableUser.avatar : currentData.avatar} alt="Profile" className="w-24 h-24 rounded-full object-cover" />
                        {isEditing && (
                            <>
                                <input type="file" ref={fileInputRef} onChange={handleAvatarChange} className="hidden" accept="image/*" />
                                <button onClick={() => fileInputRef.current?.click()} className="absolute bottom-0 right-0 p-1.5 bg-primary-600 text-white rounded-full hover:bg-primary-700">
                                    <CameraIcon />
                                </button>
                            </>
                        )}
                    </div>
                    <div className="flex-1 space-y-2">
                        {canEdit && isEditing && editableUser ? (
                            <input type="text" name="name" value={editableUser.name} onChange={handleInputChange} className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-2xl font-bold" />
                        ) : (
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{currentData.name}</h3>
                        )}
                        {'email' in currentData && <p className="text-gray-500 dark:text-gray-400">{(currentData as User).email}</p>}
                    </div>
                </div>
                 {canEdit && (isEditing && editableUser ? (
                    <div>
                        <label className="text-sm font-medium">Bio</label>
                        <textarea name="bio" value={editableUser.bio} onChange={handleInputChange} rows={3} className="mt-1 w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600" />
                    </div>
                 ) : (
                    'bio' in currentData && <p className="text-gray-600 dark:text-gray-300 mt-4">{(currentData as User).bio}</p>
                 ))}

                 {/* --- Role-Specific Fields --- */}
                 {canEdit && user.userType === 'Business' && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t dark:border-gray-700">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Name</label>
                            {isEditing && editableUser ? (
                                <input type="text" name="businessName" value={editableUser.businessName || ''} onChange={handleInputChange} className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600" />
                            ) : (
                                <p className="text-gray-900 dark:text-white font-semibold">{user.businessName || 'Not set'}</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Industry</label>
                            {isEditing && editableUser ? (
                                <input type="text" name="businessType" value={editableUser.businessType || ''} onChange={handleInputChange} className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600" />
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
                                <input type="text" name="niche" value={editableUser.niche || ''} onChange={handleInputChange} className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600" />
                            ) : (
                                <p className="text-gray-900 dark:text-white font-semibold">{user.niche || 'Not set'}</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Target Audience</label>
                            {isEditing && editableUser ? (
                                <input type="text" name="audience" value={editableUser.audience || ''} onChange={handleInputChange} className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600" />
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
                                <button onClick={handleEditToggle} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500">Cancel</button>
                                <button onClick={handleSave} className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700">Save</button>
                            </>
                        ) : (
                            <button onClick={handleEditToggle} className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700">Edit</button>
                        )}
                    </div>
                 )}
            </SettingsSection>
            
            {canEdit && (
                <SettingsSection title="Security">
                    <button onClick={handlePasswordReset} className="text-sm font-medium text-primary-600 hover:text-primary-500">Send Password Reset Email</button>
                </SettingsSection>
            )}
        </div>
    );
};