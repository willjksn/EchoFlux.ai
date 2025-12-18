import React, { useState } from 'react';
import { useAppContext } from './AppContext';
import { db, auth } from '../firebaseConfig';
import { doc, deleteDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { deleteUser } from 'firebase/auth';
import { ref, listAll, deleteObject } from 'firebase/storage';
import { storage } from '../firebaseConfig';

export const DataDeletion: React.FC = () => {
    const { user, showToast, isAuthenticated } = useAppContext();
    const [isDeleting, setIsDeleting] = useState(false);
    const [email, setEmail] = useState('');
    const [confirmationText, setConfirmationText] = useState('');

    const handleDeleteAccount = async () => {
        if (!user || !isAuthenticated) {
            showToast('Please sign in to delete your account', 'error');
            return;
        }

        if (confirmationText !== 'DELETE') {
            showToast('Please type DELETE to confirm', 'error');
            return;
        }

        if (!window.confirm('Are you sure you want to permanently delete your account and all data? This action cannot be undone.')) {
            return;
        }

        setIsDeleting(true);
        try {
            const userId = user.id;

            // Delete all user subcollections
            const subcollections = [
                'messages',
                'posts',
                'calendar_events',
                'crm_profiles',
                'voices',
                'strategies',
                'media_library',
                'media_folders',
                'hashtag_sets',
                'notifications',
                'automation_files',
            ];

            for (const subcollection of subcollections) {
                try {
                    const subcollectionRef = collection(db, 'users', userId, subcollection);
                    const snapshot = await getDocs(subcollectionRef);
                    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
                    await Promise.all(deletePromises);
                } catch (error) {
                    console.error(`Error deleting ${subcollection}:`, error);
                }
            }

            // Delete user's storage files
            try {
                const storageRef = ref(storage, `users/${userId}`);
                const files = await listAll(storageRef);
                const deletePromises = files.items.map(item => deleteObject(item));
                await Promise.all(deletePromises);
            } catch (error) {
                console.error('Error deleting storage files:', error);
            }

            // Delete user document
            await deleteDoc(doc(db, 'users', userId));

            // Delete Firebase Auth account
            const currentUser = auth.currentUser;
            if (currentUser) {
                await deleteUser(currentUser);
            }

            showToast('Account and all data deleted successfully', 'success');
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
        } catch (error: any) {
            console.error('Error deleting account:', error);
            showToast('Failed to delete account. Please contact support.', 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 p-6">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Data Deletion Instructions</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Last updated: January 2025</p>

                <div className="mt-6 prose prose-lg dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
                    <p>
                        EchoFlux.AI respects your right to control your personal data. This page explains how you can request deletion of your data from our platform.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">How to Request Data Deletion</h3>
                    
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                        <h4 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">Option 1: Delete Your Account (Recommended)</h4>
                        <p className="text-blue-800 dark:text-blue-100 text-sm">
                            If you have an account, you can delete it directly from this page. This will permanently delete all your data including:
                        </p>
                        <ul className="list-disc pl-6 mt-2 text-sm text-blue-800 dark:text-blue-100">
                            <li>Your account information</li>
                            <li>All uploaded media files</li>
                            <li>All posts and scheduled content</li>
                            <li>All messages and comments</li>
                            <li>All connected social media accounts</li>
                            <li>All CRM data and profiles</li>
                            <li>All strategies and content plans</li>
                        </ul>
                    </div>

                    {isAuthenticated && user ? (
                        <div className="mt-6 p-6 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-lg">
                            <h4 className="text-lg font-bold text-red-900 dark:text-red-200 mb-4">Delete My Account</h4>
                            <p className="text-red-800 dark:text-red-100 mb-4">
                                <strong>Warning:</strong> This action is permanent and cannot be undone. All your data will be deleted immediately.
                            </p>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Type "DELETE" to confirm:
                                    </label>
                                    <input
                                        type="text"
                                        value={confirmationText}
                                        onChange={(e) => setConfirmationText(e.target.value)}
                                        placeholder="Type DELETE"
                                        className="w-full px-3 py-2 border rounded-md bg-white text-gray-900 dark:bg-gray-900 dark:text-white border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500"
                                    />
                                </div>
                                <button
                                    onClick={handleDeleteAccount}
                                    disabled={confirmationText !== 'DELETE' || isDeleting}
                                    className="px-6 py-3 bg-red-600 text-white font-semibold rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isDeleting ? 'Deleting...' : 'Permanently Delete My Account'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="mt-6 p-6 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                            <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Request Data Deletion via Email</h4>
                            <p className="text-gray-700 dark:text-gray-300 mb-4">
                                If you don't have an account or prefer to request deletion via email, please contact us at:
                            </p>
                            <div className="bg-white dark:bg-gray-800 p-4 rounded border border-gray-200 dark:border-gray-600">
                                <p className="font-mono text-primary-600 dark:text-primary-400">
                                    <a href="mailto:support@echoflux.ai?subject=Data Deletion Request" className="hover:underline">
                                        support@echoflux.ai
                                    </a>
                                </p>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
                                Please include the following information in your email:
                            </p>
                            <ul className="list-disc pl-6 mt-2 text-sm text-gray-700 dark:text-gray-300">
                                <li>Your account email address</li>
                                <li>Confirmation that you want to delete your data</li>
                                <li>Any specific data you want deleted (or "all data")</li>
                            </ul>
                        </div>
                    )}

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">What Data Will Be Deleted</h3>
                    <p>
                        When you request data deletion, we will permanently delete:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 mt-4">
                        <li><strong>Account Information:</strong> Name, email, profile picture, bio, and account settings</li>
                        <li><strong>Media Files:</strong> All images and videos uploaded to your Media Library</li>
                        <li><strong>Content:</strong> All posts, captions, hashtags, and scheduled content</li>
                        <li><strong>Messages:</strong> All DMs, comments, and inbox messages</li>
                        <li><strong>Social Connections:</strong> All connected social media accounts and their tokens</li>
                        <li><strong>CRM Data:</strong> All customer profiles, notes, and interaction history</li>
                        <li><strong>Strategies:</strong> All content strategies and roadmaps</li>
                        <li><strong>Analytics:</strong> All analytics data and reports</li>
                    </ul>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">Processing Time</h3>
                    <p>
                        Account deletion is processed immediately when you delete your account through this page. 
                        For email requests, we will process your request within 30 days of receipt.
                    </p>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">Data Retention</h3>
                    <p>
                        Some data may be retained for legal or business purposes as required by law, such as:
                    </p>
                    <ul className="list-disc pl-6 space-y-2 mt-4">
                        <li>Transaction records for billing purposes (retained for 7 years as required by tax law)</li>
                        <li>Data necessary to comply with legal obligations</li>
                        <li>Anonymized analytics data that cannot be linked to your account</li>
                    </ul>

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-2">Third-Party Data</h3>
                    <p>
                        If you have connected social media accounts (Instagram, Facebook, etc.), we will delete the connection 
                        and access tokens stored in our system. However, you may need to revoke access directly in those platforms' 
                        settings as well.
                    </p>

                    <div className="mt-8 p-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                        <h4 className="text-lg font-bold text-yellow-900 dark:text-yellow-200 mb-2">Need Help?</h4>
                        <p className="text-yellow-800 dark:text-yellow-100">
                            If you have questions about data deletion or need assistance, please contact us at{' '}
                            <a href="mailto:support@echoflux.ai" className="underline font-semibold">support@echoflux.ai</a>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};






