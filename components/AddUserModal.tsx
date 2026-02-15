import React, { useState } from 'react';
import { User } from '../types';
import { auth } from '../firebaseConfig';

interface AddUserModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

const PLAN_OPTIONS: User['plan'][] = ['Pro', 'Elite'];

export const AddUserModal: React.FC<AddUserModalProps> = ({ onClose, onSuccess }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [plan, setPlan] = useState<User['plan']>('Pro');
    const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        const trimmedEmail = email.trim();
        const trimmedName = displayName.trim();

        if (!trimmedEmail) {
            setError('Email is required');
            setIsLoading(false);
            return;
        }
        if (password && password.length < 6) {
            setError('Custom password must be at least 6 characters');
            setIsLoading(false);
            return;
        }

        try {
            const token = await auth.currentUser?.getIdToken(true);
            if (!token) {
                setError('You must be signed in to add users');
                setIsLoading(false);
                return;
            }

            const res = await fetch('/api/adminCreateUser', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    email: trimmedEmail,
                    password: password.trim() || undefined,
                    displayName: trimmedName || undefined,
                    plan,
                    sendWelcomeEmail,
                }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                const errMsg = data?.error || data?.message || data?.details || 'Failed to create user';
                setError(typeof errMsg === 'string' ? errMsg : 'Failed to create user');
                setIsLoading(false);
                return;
            }

            if (!data?.success) {
                setError(data?.error || 'Failed to create user');
                setIsLoading(false);
                return;
            }

            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err?.message || 'Failed to create user');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
            <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full m-4 max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">Add New User</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Leave password blank to use default "Password1". Welcome email includes login credentials.
                    </p>

                    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                        {error && (
                            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                            </div>
                        )}

                        <div>
                            <label htmlFor="add-user-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Email <span className="text-red-500">*</span>
                            </label>
                            <input
                                id="add-user-email"
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="user@example.com"
                                autoComplete="email"
                                className="mt-1 block w-full pl-3 pr-10 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:text-white dark:placeholder-gray-400"
                                disabled={isLoading}
                            />
                        </div>

                        <div>
                            <label htmlFor="add-user-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Custom Password (optional)
                            </label>
                            <div className="mt-1 relative">
                                <input
                                    id="add-user-password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="Leave blank for Password1"
                                    autoComplete="new-password"
                                    className="block w-full pl-3 pr-16 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:text-white dark:placeholder-gray-400"
                                    disabled={isLoading}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-primary-600 dark:text-primary-400 hover:underline"
                                >
                                    {showPassword ? 'Hide' : 'Show'}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label htmlFor="add-user-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Display Name (optional)
                            </label>
                            <input
                                id="add-user-name"
                                type="text"
                                value={displayName}
                                onChange={e => setDisplayName(e.target.value)}
                                placeholder="John Doe"
                                autoComplete="name"
                                className="mt-1 block w-full pl-3 pr-10 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:text-white dark:placeholder-gray-400"
                                disabled={isLoading}
                            />
                        </div>

                        <div>
                            <label htmlFor="add-user-plan" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Plan
                            </label>
                            <select
                                id="add-user-plan"
                                value={plan || 'Pro'}
                                onChange={e => setPlan((e.target.value || 'Pro') as User['plan'])}
                                className="mt-1 block w-full pl-3 pr-10 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:text-white"
                                disabled={isLoading}
                            >
                                {PLAN_OPTIONS.map(p => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center">
                            <input
                                id="add-user-send-email"
                                type="checkbox"
                                checked={sendWelcomeEmail}
                                onChange={e => setSendWelcomeEmail(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                disabled={isLoading}
                            />
                            <label htmlFor="add-user-send-email" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                                Send welcome email with login credentials
                            </label>
                        </div>

                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                disabled={isLoading}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                            >
                                {isLoading ? 'Creating...' : 'Create User'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};
