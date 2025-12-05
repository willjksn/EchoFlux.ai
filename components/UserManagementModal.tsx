import React, { useState, useEffect } from 'react';
import { User } from '../types';

interface UserManagementModalProps {
    user: User;
    onClose: () => void;
    onSave: (updatedUser: User) => void;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({ user, onClose, onSave }) => {
    const [editedUser, setEditedUser] = useState<User>(user);

    useEffect(() => {
        setEditedUser(user);
    }, [user]);

    const handlePlanChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newPlan = e.target.value as User['plan'];
        setEditedUser(prev => ({ ...prev, plan: newPlan }));
    };

    const handleSave = async () => {
        try {
            await onSave(editedUser);
            onClose();
        } catch (error) {
            console.error('Failed to save user:', error);
            // Error handling could be improved with toast notification
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
            <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full m-4">
                <div className="p-6">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">Manage User</h3>
                    
                    <div className="mt-4 flex items-center space-x-4">
                        <img src={editedUser.avatar} alt={editedUser.name} className="w-16 h-16 rounded-full"/>
                        <div>
                            <p className="text-lg font-bold text-gray-900 dark:text-white">{editedUser.name}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{editedUser.email}</p>
                        </div>
                    </div>

                    <div className="mt-6 space-y-4">
                        <div>
                            <label htmlFor="plan" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Subscription Plan</label>
                            <select 
                                id="plan" 
                                value={editedUser.plan || 'Free'} 
                                onChange={handlePlanChange} 
                                disabled={false}
                                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:text-white"
                            >
                                <option value="Free">Free</option>
                                <option value="Pro">Pro</option>
                                <option value="Elite">Elite</option>
                                <option value="Agency">Agency</option>
                                <option value="Starter">Starter</option>
                                <option value="Growth">Growth</option>
                            </select>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Changing a user's plan here will override their current subscription status. This is useful for granting complimentary access to beta testers or partners.
                        </p>
                    </div>

                     <div className="mt-6 flex justify-end space-x-3">
                        <button onClick={onClose} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500">Cancel</button>
                        <button onClick={handleSave} className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700">Save Changes</button>
                    </div>
                </div>
            </div>
        </div>
    );
};