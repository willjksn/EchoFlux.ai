import React, { useMemo, useState, useEffect } from 'react';
import { User } from '../types';
import { GrantReferralRewardModal } from './GrantReferralRewardModal';
import { db, auth } from '../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';

interface UserManagementModalProps {
    user: User;
    onClose: () => void;
    onSave: (updatedUser: User) => void;
    showToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({ user, onClose, onSave, showToast }) => {
    const [editedUser, setEditedUser] = useState<User>(user);
    const [showGrantRewardModal, setShowGrantRewardModal] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
    const [isSendingReset, setIsSendingReset] = useState(false);
    
    // Video minutes grant state
    const [grantVideoMinutes, setGrantVideoMinutes] = useState(0);
    const [isGrantingVideoMinutes, setIsGrantingVideoMinutes] = useState(false);
    const [videoQuota, setVideoQuota] = useState<{ monthlyMinutesLimit: number; minutesUsedThisMonth: number; bonusMinutes: number } | null>(null);
    const isFanHubAccount = editedUser.accountOrigin === 'fan_hub';

    useEffect(() => {
        setEditedUser(user);
    }, [user]);

    // Ensure we can display up-to-date reward history even if parent state doesn't refresh while modal is open
    useEffect(() => {
        const loadRewards = async () => {
            if (!user?.id) return;
            try {
                const snap = await getDoc(doc(db, 'users', user.id));
                if (snap.exists()) {
                    const data = snap.data() as any;
                    setEditedUser(prev => ({
                        ...prev,
                        manualReferralRewards: Array.isArray(data.manualReferralRewards) ? data.manualReferralRewards : [],
                    }));
                }
            } catch (e) {
                console.error('Failed to load user rewards:', e);
            }
        };
        loadRewards();
    }, [user?.id]);

    // Fetch video quota for the user
    useEffect(() => {
        const loadVideoQuota = async () => {
            if (!user?.id) return;
            try {
                const token = await auth.currentUser?.getIdToken(true);
                const res = await fetch(`/api/videoUsageStats?creatorId=${user.id}`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                if (res.ok) {
                    const data = await res.json();
                    setVideoQuota(data.quota);
                }
            } catch (e) {
                console.error('Failed to load video quota:', e);
            }
        };
        loadVideoQuota();
    }, [user?.id]);

    const handleGrantVideoMinutes = async () => {
        if (!user?.id || grantVideoMinutes <= 0) return;
        setIsGrantingVideoMinutes(true);
        try {
            const token = await auth.currentUser?.getIdToken(true);
            if (!token) {
                showToast?.('You must be signed in', 'error');
                return;
            }
            const res = await fetch('/api/videoUsageStats?action=addMinutes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    creatorId: user.id,
                    minutes: grantVideoMinutes,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.success) {
                showToast?.(data?.error || 'Failed to grant video minutes', 'error');
                return;
            }
            showToast?.(`Granted ${grantVideoMinutes} video minutes to ${user.name}`, 'success');
            setGrantVideoMinutes(0);
            // Refresh quota display
            setVideoQuota(prev => prev ? { ...prev, bonusMinutes: (prev.bonusMinutes || 0) + grantVideoMinutes } : null);
        } catch (err: any) {
            showToast?.(err?.message || 'Failed to grant video minutes', 'error');
        } finally {
            setIsGrantingVideoMinutes(false);
        }
    };

    const rewardSummary = useMemo(() => {
        const rewards = Array.isArray((editedUser as any).manualReferralRewards)
            ? (editedUser as any).manualReferralRewards
            : [];
        const totals: Record<string, { total: number; count: number; lastAt?: string }> = {};
        for (const r of rewards) {
            const key = r.rewardType || 'unknown';
            if (!totals[key]) totals[key] = { total: 0, count: 0 };
            totals[key].total += Number(r.rewardAmount || 0);
            totals[key].count += 1;
            const t = r.grantedAt;
            if (t && (!totals[key].lastAt || new Date(t).getTime() > new Date(totals[key].lastAt!).getTime())) {
                totals[key].lastAt = t;
            }
        }
        return totals;
    }, [editedUser.manualReferralRewards]);

    const rewardTypeLabel = (t: string) => {
        switch (t) {
            case 'extra_generations': return 'Extra AI Generations';
            case 'strategy_generations': return 'Extra Strategy Generations';
            case 'free_month': return 'Free Month(s)';
            case 'storage_boost': return 'Storage Boost (GB)';
            default: return t;
        }
    };

    const handlePlanChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newPlan = e.target.value as User['plan'];
        setEditedUser(prev => ({ ...prev, plan: newPlan }));
    };

    const handleUpdatePassword = async () => {
        const trimmed = newPassword.trim();
        if (!trimmed || trimmed.length < 6) {
            showToast?.('Password must be at least 6 characters', 'error');
            return;
        }
        if (!/[^A-Za-z0-9]/.test(trimmed)) {
            showToast?.('Password must include at least one special character', 'error');
            return;
        }
        setIsUpdatingPassword(true);
        try {
            const token = await auth.currentUser?.getIdToken(true);
            if (!token) {
                showToast?.('You must be signed in to update passwords', 'error');
                return;
            }
            const res = await fetch('/api/adminUpdateUserPassword', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ userId: user.id, newPassword: trimmed }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.success) {
                showToast?.(data?.error || 'Failed to update password', 'error');
                return;
            }
            setNewPassword('');
            showToast?.('Password updated successfully', 'success');
        } catch (err: any) {
            showToast?.(err?.message || 'Failed to update password', 'error');
        } finally {
            setIsUpdatingPassword(false);
        }
    };

    const handleSendPasswordReset = async () => {
        setIsSendingReset(true);
        try {
            const token = await auth.currentUser?.getIdToken(true);
            if (!token) {
                showToast?.('You must be signed in', 'error');
                return;
            }
            const res = await fetch('/api/adminSendPasswordReset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ userId: user.id }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.success) {
                showToast?.(data?.error || 'Failed to send password reset email', 'error');
                return;
            }
            showToast?.(data?.emailSent ? 'Password reset email sent' : 'Request sent (check email config)', 'success');
        } catch (err: any) {
            showToast?.(err?.message || 'Failed to send password reset email', 'error');
        } finally {
            setIsSendingReset(false);
        }
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
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black bg-opacity-60 overflow-y-auto py-6 px-4">
            <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[calc(100vh-3rem)] overflow-hidden">
                <div className="p-6 overflow-y-auto max-h-[calc(100vh-3rem)]">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">Manage User</h3>
                    
                    <div className="mt-4 flex items-center space-x-4">
                        <img src={editedUser.avatar} alt={editedUser.name} className="w-16 h-16 rounded-full"/>
                        <div>
                            <p className="text-lg font-bold text-gray-900 dark:text-white">{editedUser.name}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{editedUser.email}</p>
                            {isFanHubAccount ? (
                                <span className="mt-1 inline-flex text-[10px] bg-cyan-600 text-white px-2 py-0.5 rounded-full font-semibold tracking-wide">
                                    FAN HUB MEMBER
                                </span>
                            ) : null}
                        </div>
                    </div>

                    {!isFanHubAccount ? (
                        <>
                            <div className="mt-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Change Password</label>
                                    <div className="mt-1 flex gap-2">
                                        <div className="flex-1 relative">
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                value={newPassword}
                                                onChange={e => setNewPassword(e.target.value)}
                                                placeholder="New password (min 6 chars + symbol)"
                                                className="w-full pl-3 pr-20 py-2 text-base border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:text-white dark:placeholder-gray-400"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-primary-600 dark:text-primary-400 hover:underline"
                                            >
                                                {showPassword ? 'Hide' : 'Show'}
                                            </button>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleUpdatePassword}
                                            disabled={isUpdatingPassword || newPassword.length < 6 || !/[^A-Za-z0-9]/.test(newPassword)}
                                            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md transition-colors"
                                        >
                                            {isUpdatingPassword ? 'Updating...' : 'Set Password'}
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <button
                                        type="button"
                                        onClick={handleSendPasswordReset}
                                        disabled={isSendingReset}
                                        className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-md transition-colors font-medium"
                                    >
                                        {isSendingReset ? 'Sending...' : 'Send Password Reset Email'}
                                    </button>
                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                        Sends an email to {user.email} with a link to set a new password.
                                    </p>
                                </div>
                                <div>
                                    <label htmlFor="plan" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Subscription Plan</label>
                                    <select 
                                        id="plan" 
                                        value={editedUser.plan === 'Pro' || editedUser.plan === 'Elite' ? editedUser.plan : 'Pro'} 
                                        onChange={handlePlanChange} 
                                        disabled={false}
                                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:text-white"
                                    >
                                        <option value="Pro">Pro</option>
                                        <option value="Elite">Elite</option>
                                    </select>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Changing a user's plan here will override their current subscription status. This is useful for granting complimentary access to selected users or partners.
                                </p>
                            </div>

                            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                                <button
                                    onClick={() => setShowGrantRewardModal(true)}
                                    className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors font-medium"
                                >
                                    Grant Referral Reward
                                </button>
                                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
                                    Manually grant referral rewards (generations, free months, or storage)
                                </p>
                            </div>

                            {/* Grant Video Minutes Section */}
                            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Grant Video Minutes</p>
                                {videoQuota && (
                                    <div className="mb-3 p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800">
                                        <div className="grid grid-cols-3 gap-2 text-xs">
                                            <div>
                                                <span className="text-cyan-700 dark:text-cyan-300 block">Monthly Limit</span>
                                                <span className="font-semibold text-cyan-900 dark:text-cyan-100">
                                                    {videoQuota.monthlyMinutesLimit === -1 ? 'Unlimited' : `${videoQuota.monthlyMinutesLimit} min`}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-cyan-700 dark:text-cyan-300 block">Used</span>
                                                <span className="font-semibold text-cyan-900 dark:text-cyan-100">{videoQuota.minutesUsedThisMonth} min</span>
                                            </div>
                                            <div>
                                                <span className="text-cyan-700 dark:text-cyan-300 block">Bonus</span>
                                                <span className="font-semibold text-cyan-900 dark:text-cyan-100">{videoQuota.bonusMinutes} min</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        min={1}
                                        max={1000}
                                        value={grantVideoMinutes || ''}
                                        onChange={e => setGrantVideoMinutes(Number(e.target.value))}
                                        placeholder="Minutes to grant"
                                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleGrantVideoMinutes}
                                        disabled={grantVideoMinutes <= 0 || isGrantingVideoMinutes}
                                        className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md transition-colors font-medium flex items-center gap-2"
                                    >
                                        {isGrantingVideoMinutes ? (
                                            <>
                                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                                Granting...
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <polygon points="23 7 16 12 23 17 23 7" />
                                                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                                                </svg>
                                                Grant
                                            </>
                                        )}
                                    </button>
                                </div>
                                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                    Quick:{' '}
                                    <button onClick={() => setGrantVideoMinutes(50)} className="text-cyan-600 hover:underline">50 min</button>
                                    {' · '}
                                    <button onClick={() => setGrantVideoMinutes(100)} className="text-cyan-600 hover:underline">100 min</button>
                                    {' · '}
                                    <button onClick={() => setGrantVideoMinutes(250)} className="text-cyan-600 hover:underline">250 min</button>
                                    {' · '}
                                    <button onClick={() => setGrantVideoMinutes(500)} className="text-cyan-600 hover:underline">500 min</button>
                                </p>
                            </div>
                        </>
                    ) : (
                        <div className="mt-6 space-y-4">
                            <div>
                                <button
                                    type="button"
                                    onClick={handleSendPasswordReset}
                                    disabled={isSendingReset}
                                    className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-md transition-colors font-medium"
                                >
                                    {isSendingReset ? 'Sending...' : 'Send Password Reset Email'}
                                </button>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    Fan Hub members don't use creator plan/reward controls. You can send a reset link to {user.email}.
                                </p>
                            </div>
                        </div>
                    )}

                    {!isFanHubAccount && (
                    <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700/40 rounded-lg border border-gray-200 dark:border-gray-600">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Reward Summary</p>
                        {Object.keys(rewardSummary).length === 0 ? (
                            <p className="text-sm text-gray-600 dark:text-gray-300">No admin-granted rewards yet.</p>
                        ) : (
                            <div className="space-y-1">
                                {Object.entries(rewardSummary).map(([type, info]) => (
                                    <div key={type} className="flex items-center justify-between text-sm">
                                        <span className="text-gray-700 dark:text-gray-200">{rewardTypeLabel(type)}</span>
                                        <span className="text-gray-900 dark:text-white font-medium">
                                            {info.total} <span className="text-xs text-gray-500 dark:text-gray-300 font-normal">({info.count} grants{info.lastAt ? ` • last ${new Date(info.lastAt).toLocaleDateString()}` : ''})</span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    )}

                     <div className="mt-6 flex justify-end space-x-3">
                        <button onClick={onClose} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500">Cancel</button>
                        {!isFanHubAccount ? (
                            <button onClick={handleSave} className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700">Save Changes</button>
                        ) : null}
                    </div>
                    
                    {showGrantRewardModal && (
                        <GrantReferralRewardModal
                            user={editedUser}
                            onClose={() => setShowGrantRewardModal(false)}
                            onSuccess={() => {
                                // Refresh reward history in this modal
                                (async () => {
                                    try {
                                        const snap = await getDoc(doc(db, 'users', editedUser.id));
                                        if (snap.exists()) {
                                            const data = snap.data() as any;
                                            setEditedUser(prev => ({
                                                ...prev,
                                                manualReferralRewards: Array.isArray(data.manualReferralRewards) ? data.manualReferralRewards : [],
                                            }));
                                        }
                                    } catch (e) {
                                        console.error('Failed to refresh rewards after grant:', e);
                                    } finally {
                                        setShowGrantRewardModal(false);
                                    }
                                })();
                            }}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};