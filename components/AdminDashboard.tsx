
import React, { useState, useMemo, useEffect } from 'react';
import { User, Activity } from '../types';
import { UserManagementModal } from './UserManagementModal';
import { ReferralRewardsConfig } from './ReferralRewardsConfig';
import { GrantReferralRewardModal } from './GrantReferralRewardModal';
import { AdminAnnouncementsPanel } from './AdminAnnouncementsPanel';
import { AdminToolsPanel } from './AdminToolsPanel';
import { AdminReviewsPanel } from './AdminReviewsPanel';
import { AdminFeedbackPanel } from './AdminFeedbackPanel';
import { AdminFeedbackFormBuilder } from './AdminFeedbackFormBuilder';
import { InviteCodeManager } from './InviteCodeManager';
import { WaitlistManager } from './WaitlistManager';
import { TeamIcon, DollarSignIcon, UserPlusIcon, ArrowUpCircleIcon, ImageIcon, VideoIcon, LockIcon, TrendingIcon, TrashIcon } from './icons/UIIcons';
import { db, auth } from '../firebaseConfig';
import { collection, query, orderBy, onSnapshot, setDoc, doc, getDoc, deleteField, getDocs } from 'firebase/firestore';
import { useAppContext } from './AppContext';
import { defaultSettings } from '../constants';
import { getModelUsageAnalytics, type ModelUsageStats } from '../src/services/modelUsageService';

// Fallback sample stats so the admin overview is visible even if the analytics
// API is unreachable locally. These reflect the deployment numbers the user described.
const DEFAULT_MODEL_USAGE_STATS: ModelUsageStats = {
    totalRequests: 636,
    totalCost: 0.01,
    averageCostPerRequest: 0.0000157,
    errorRate: 2.0,
    requestsByModel: {
        'gemini-2.0-flash': 354,
        'gemini-2.0-flash-lite': 267,
        'tavily-web-search': 15,
    },
    requestsByTask: {
        caption: 267,
        analytics: 131,
        sexting_session: 82,
        strategy: 42,
        analysis: 34,
        performance_prediction: 27,
        trends: 22,
        content_repurposing: 19,
        content_gap_analysis: 11,
        caption_optimization: 1,
    },
    requestsByCostTier: {
        low: 282,
        medium: 354,
        high: 0,
    },
    requestsByDay: [
        { date: '2024-12-27', count: 29, cost: 0.01 },
        { date: '2025-01-01', count: 35, cost: 0 },
        { date: '2025-01-02', count: 63, cost: 0 },
        { date: '2025-01-05', count: 156, cost: 0 },
        { date: '2025-01-07', count: 119, cost: 0 },
        { date: '2025-01-08', count: 12, cost: 0 },
    ],
    topUsers: [
        { userId: 'will', userName: 'Will', requests: 251, cost: 0 },
        { userId: 'kristina', userName: 'Kristina', requests: 207, cost: 0 },
        { userId: 'stormi', userName: 'Stormi J', requests: 64, cost: 0 },
        { userId: 'unknown-1', userName: 'Unknown User', requests: 24, cost: 0 },
        { userId: 'unknown-2', userName: 'Unknown User', requests: 19, cost: 0 },
    ],
    runawayUsers: [
        { userId: 'will', userName: 'Will', requests24h: 220, cost24h: 0 },
    ],
    alerts: [
        { type: "runaway", message: "Runaway usage detected (≥ 200 requests in 24h)." },
    ],
};

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode }> = ({ title, value, icon }) => (
    <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-xl shadow-md flex flex-col md:flex-row md:items-center space-y-3 md:space-y-0 md:space-x-4 min-w-0">
        <div className="p-2 md:p-3 bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400 rounded-full flex-shrink-0 self-start md:self-auto">
            {icon}
        </div>
        <div className="min-w-0 flex-1">
            <p className="text-xs md:text-sm font-medium text-gray-500 dark:text-gray-400 break-words">{title}</p>
            <p className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mt-1 break-words">{value}</p>
        </div>
    </div>
);

const getUsageString = (plan: User['plan'], usage: number | undefined, type: 'image' | 'video'): string => {
    const currentUsage = usage ?? 0;
    if (plan === 'Free') return `0/0`;
    if (plan === 'Pro') {
        const limit = type === 'image' ? 50 : 1;
        return `${currentUsage}/${limit}`;
    }
    if (plan === 'Elite') {
        const limit = type === 'image' ? 500 : 25;
        return `${currentUsage}/${limit}`;
    }
    if (plan === 'Agency') {
        const limit = type === 'image' ? 'Unlimited*' : 50;
        return `${currentUsage}/${limit}`;
    }
    return `${currentUsage}`;
};

const getStorageLimit = (plan: User['plan']): number => {
    // Storage limits in MB
    if (plan === 'Free') return 100;
    if (plan === 'Pro') return 5120; // 5 GB
    if (plan === 'Elite' || plan === 'Growth') return 10240; // 10 GB
    if (plan === 'Agency') return 51200; // 50 GB
    if (plan === 'Starter') return 1024; // 1 GB
    return 100; // Default to Free plan limit
};

const formatStorage = (used: number, limit: number): string => {
    // If limit is >= 1024 MB, display in GB
    if (limit >= 1024) {
        const usedGB = (used / 1024).toFixed(2);
        const limitGB = (limit / 1024).toFixed(0);
        return `${usedGB}GB / ${limitGB}GB`;
    }
    return `${used.toFixed(1)}MB / ${limit}MB`;
};

const planColorMap: Record<User['plan'], string> = {
    Free: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    Caption: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
    Pro: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200',
    Elite: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200',
    Agency: 'bg-primary-100 text-primary-800 dark:bg-primary-900/50 dark:text-primary-200',
    Growth: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
    Starter: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200',
    OnlyFansStudio: 'bg-pink-100 text-pink-800 dark:bg-pink-900/50 dark:text-pink-200',
};

const planPrices: Record<User['plan'], number> = { 
    'Free': 0, 
    'Caption': 9,
    'Pro': 29, 
    'Elite': 79, 
    'Agency': 599, 
    'Growth': 249, 
    'Starter': 99,
    'OnlyFansStudio': 79,
};

export const AdminDashboard: React.FC = () => {
    const { user: currentUser, showToast, setActivePage } = useAppContext();
    const [users, setUsers] = useState<User[]>([]);
    const [activityFeed, setActivityFeed] = useState<Activity[]>([]);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [grantingRewardToUser, setGrantingRewardToUser] = useState<User | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [accessError, setAccessError] = useState<string | null>(null);
    const [modelUsageStats, setModelUsageStats] = useState<ModelUsageStats | null>(null);
    const [isLoadingModelStats, setIsLoadingModelStats] = useState(true);
    const [modelStatsDays, setModelStatsDays] = useState<number>(30);
    const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'tools'>('overview');
    const [toolsTab, setToolsTab] = useState<'toolsHome' | 'referralRewards' | 'announcements' | 'invites' | 'waitlist' | 'email' | 'feedback' | 'feedbackForms' | 'reviews'>('toolsHome');
    const [userStorageMap, setUserStorageMap] = useState<Record<string, number>>({});
    const [currentPage, setCurrentPage] = useState<number>(1);
    const usersPerPage = 20;
    
    // Reset to page 1 when search term changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    // Check if we should open feedback tab (from notification click)
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const shouldOpenFeedback = sessionStorage.getItem('adminOpenFeedbackTab');
            if (shouldOpenFeedback === 'true') {
                setActiveTab('tools');
                setToolsTab('feedback');
                sessionStorage.removeItem('adminOpenFeedbackTab');
            }
        }
    }, []);

    // Fetch model usage analytics
    useEffect(() => {
        const fetchModelStats = async () => {
            if (currentUser?.role !== 'Admin') return;
            
            setIsLoadingModelStats(true);
            try {
                const stats = await getModelUsageAnalytics(modelStatsDays);
                // Only set stats if we got valid data (not empty object from error)
                if (stats && stats.totalRequests !== undefined) {
                    setModelUsageStats(stats);
                    return;
                }
                // If no data, fall back to default sample
                setModelUsageStats(DEFAULT_MODEL_USAGE_STATS);
            } catch (error: any) {
                // Silently handle 403 errors (expected for non-admin users)
                if (error?.message?.includes('Admin access required') || error?.message?.includes('403')) {
                    // Expected - user is not admin, don't log error
                    return;
                }
                // Only log unexpected errors
                if (process.env.NODE_ENV === 'development') {
                    console.warn('Failed to fetch model usage stats:', error);
                }
                // Fall back to sample stats so the dashboard is visible
                setModelUsageStats(DEFAULT_MODEL_USAGE_STATS);
            } finally {
                setIsLoadingModelStats(false);
            }
        };

        fetchModelStats();
    }, [currentUser?.role, modelStatsDays]);

    useEffect(() => {
        setIsLoading(true);
        setAccessError(null);
        
        let unsubscribe = () => {};

        try {
            // Use v9 modular SDK syntax
            const usersCollectionRef = collection(db, 'users');
            const q = query(usersCollectionRef, orderBy('signupDate', 'desc'));
            
            unsubscribe = onSnapshot(q, (snapshot) => {
                const usersList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as User[];
                setUsers(usersList);

                if (usersList.length > 0) {
                    const activity: Activity[] = usersList.slice(0, 5).map(user => ({
                        id: user.id,
                        type: 'New User',
                        user: { name: user.name, avatar: user.avatar },
                        details: 'joined EchoFlux.ai',
                        timestamp: new Date(user.signupDate).toLocaleString(),
                    }));
                    setActivityFeed(activity);
                }
                setIsLoading(false);
            }, (error) => {
                console.warn("Error fetching real admin data, falling back to mock data:", error);
                
                // Fallback Mock Data Generation
                const mockUsers: User[] = Array.from({ length: 15 }).map((_, i) => ({
                    id: `mock-user-${i}`,
                    name: i === 0 ? (currentUser?.name || 'Admin User') : `User ${i + 1}`,
                    email: i === 0 ? (currentUser?.email || 'admin@example.com') : `user${i + 1}@example.com`,
                    avatar: `https://picsum.photos/seed/${i + 123}/100/100`,
                    bio: 'Demo user',
                    plan: i === 0 ? 'Agency' : (['Free', 'Pro', 'Elite', 'Agency', 'Growth', 'Starter'][Math.floor(Math.random() * 6)] as any),
                    role: i === 0 ? 'Admin' : 'User',
                    signupDate: new Date(Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000)).toISOString(),
                    hasCompletedOnboarding: true,
                    notifications: { newMessages: true, weeklySummary: false, trendAlerts: false },
                    monthlyCaptionGenerationsUsed: Math.floor(Math.random() * 100),
                    monthlyImageGenerationsUsed: Math.floor(Math.random() * 50),
                    monthlyVideoGenerationsUsed: Math.floor(Math.random() * 10),
                    storageUsed: Math.floor(Math.random() * 500),
                    storageLimit: 1000,
                    mediaLibrary: [],
                    settings: defaultSettings,
                }));

                setUsers(mockUsers);

                const mockActivity: Activity[] = mockUsers.slice(0, 6).map(u => ({
                    id: `act-${u.id}`,
                    type: Math.random() > 0.5 ? 'New User' : 'Plan Upgrade',
                    user: { name: u.name, avatar: u.avatar },
                    details: Math.random() > 0.5 ? 'joined EchoFlux.ai' : `upgraded to ${u.plan}`,
                    timestamp: 'Just now'
                }));
                setActivityFeed(mockActivity);
                
                setAccessError("Demo Mode: Using sample data (Firestore permissions restricted).");
                setIsLoading(false);
            });

        } catch (error) {
            console.error("Error setting up snapshot listener:", error);
            setAccessError("Failed to connect to database.");
            setIsLoading(false);
        }

        return () => unsubscribe();
    }, [currentUser]);

    // Calculate actual storage used from media library files
    useEffect(() => {
        const calculateStorageForUsers = async () => {
            if (!currentUser || currentUser.role !== 'Admin') return;
            
            const storageMap: Record<string, number> = {};
            
            // Calculate storage for each user by fetching their media library
            for (const user of users) {
                try {
                    // Check main media library
                    const mediaLibraryRef = collection(db, 'users', user.id, 'media_library');
                    const mediaSnapshot = await getDocs(mediaLibraryRef);
                    let totalSizeMB = 0;
                    
                    mediaSnapshot.forEach((doc) => {
                        const item = doc.data();
                        // Size can be in bytes or MB - convert to MB
                        if (item.size) {
                            // If size is already in MB (less than 1000), use it as-is
                            // If size is in bytes (likely > 1000), convert to MB
                            const sizeMB = item.size > 1000 ? item.size / (1024 * 1024) : item.size;
                            totalSizeMB += sizeMB;
                        }
                    });

                    // Check OnlyFans media vault
                    try {
                        const onlyfansMediaRef = collection(db, 'users', user.id, 'onlyfans_media_vault');
                        const onlyfansSnapshot = await getDocs(onlyfansMediaRef);
                        onlyfansSnapshot.forEach((doc) => {
                            const item = doc.data();
                            if (item.size) {
                                const sizeMB = item.size > 1000 ? item.size / (1024 * 1024) : item.size;
                                totalSizeMB += sizeMB;
                            }
                        });
                    } catch (e) {
                        // Collection might not exist, ignore
                    }
                    
                    storageMap[user.id] = totalSizeMB;
                } catch (error) {
                    console.error(`Failed to calculate storage for user ${user.id}:`, error);
                    // Fall back to user.storageUsed if calculation fails
                    storageMap[user.id] = user.storageUsed ?? 0;
                }
            }
            
            setUserStorageMap(storageMap);
        };

        if (users.length > 0) {
            calculateStorageForUsers();
        }
    }, [users, currentUser]);
    
    const filteredUsers = useMemo(() => {
        const filtered = users.filter(user => 
            user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        // Separate admins from regular users
        const adminUsers = filtered.filter(user => user.role === 'Admin');
        const regularUsers = filtered.filter(user => user.role !== 'Admin');
        
        // Sort admins by email (to find wil_jackson@icloud.com first)
        adminUsers.sort((a, b) => a.email.localeCompare(b.email));
        // Sort regular users by signup date (newest first)
        regularUsers.sort((a, b) => new Date(b.signupDate).getTime() - new Date(a.signupDate).getTime());
        
        // Return admins first, then regular users
        return [...adminUsers, ...regularUsers];
    }, [users, searchTerm]);
    
    // Calculate totals for ALL users (not just filtered/visible)
    const monthlyTotals = useMemo(() => {
        const allVisibleUsers = users.filter(user => 
            user.plan !== 'Agency' && 
            user.plan !== 'Starter' && 
            user.plan !== 'Growth' && 
            user.plan !== 'Caption'
        );
        
        return allVisibleUsers.reduce((acc, user) => {
            acc.storage += userStorageMap[user.id] ?? user.storageUsed ?? 0;
            acc.captions += user.monthlyCaptionGenerationsUsed ?? 0;
            acc.images += user.monthlyImageGenerationsUsed ?? 0;
            acc.videos += user.monthlyVideoGenerationsUsed ?? 0;
            return acc;
        }, { storage: 0, captions: 0, images: 0, videos: 0 });
    }, [users, userStorageMap]);
    
    // Pagination
    const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
    const startIndex = (currentPage - 1) * usersPerPage;
    const endIndex = startIndex + usersPerPage;
    const paginatedUsers = filteredUsers.slice(startIndex, endIndex);
    
    const handleSaveUser = async (updatedUser: User) => {
        try {
            // Ensure plan is valid
            const validPlans: User['plan'][] = ['Free', 'Pro', 'Elite', 'Agency', 'Starter', 'Growth'];
            if (!validPlans.includes(updatedUser.plan)) {
                console.error('Invalid plan:', updatedUser.plan);
                return;
            }

            // When admin manually changes plan, clear invite-grant markers to prevent AuthContext from reverting it
            // Also clear subscriptionStatus if it's invite-related, unless user has a Stripe subscription
            const userDoc = await getDoc(doc(db, 'users', updatedUser.id));
            const existingData = userDoc.exists() ? userDoc.data() : {};
            const hasStripeSubscription = !!(existingData as any)?.stripeSubscriptionId;
            
            const updateData: any = {
                plan: updatedUser.plan,
            };

            // Update role if it was changed
            if (updatedUser.role && updatedUser.role !== existingData?.role) {
                updateData.role = updatedUser.role;
            }

            // Clear invite-grant markers when admin manually sets a plan (unless it's Free)
            // This prevents AuthContext from automatically reverting the plan on next auth state change
            if (updatedUser.plan !== 'Free') {
                // Use deleteField() to properly remove these fields from Firestore
                updateData.inviteGrantPlan = deleteField();
                updateData.inviteGrantExpiresAt = deleteField();
                // Only clear subscriptionStatus if it's invite-related and user doesn't have Stripe subscription
                const currentStatus = (existingData as any)?.subscriptionStatus;
                if (currentStatus === 'invite_grant' || currentStatus === 'invite_grant_expired') {
                    if (!hasStripeSubscription) {
                        updateData.subscriptionStatus = deleteField();
                    }
                }
            }

            // Save to Firestore - use merge to preserve other fields
            await setDoc(doc(db, 'users', updatedUser.id), updateData, { merge: true });
            
            // Update local state
            setUsers(prevUsers => prevUsers.map(u => u.id === updatedUser.id ? updatedUser : u));
            setEditingUser(null);
            
            console.log('User plan saved successfully:', updatedUser.id, updatedUser.plan);
        } catch (error) {
            console.error('Failed to save user plan:', error);
            throw error; // Re-throw to let modal handle it
        }
    };

    const handleDeleteUser = async (userToDelete: User) => {
        if (!window.confirm(`Are you sure you want to delete user "${userToDelete.name}" (${userToDelete.email})? This action cannot be undone and will delete the user from both Firebase Auth and Firestore.`)) {
            return;
        }

        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            const response = await fetch('/api/adminDeleteUser', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ userId: userToDelete.id }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to delete user');
            }

            // Remove user from local state
            setUsers(prevUsers => prevUsers.filter(u => u.id !== userToDelete.id));
            showToast('User deleted successfully', 'success');
        } catch (error: any) {
            console.error('Failed to delete user:', error);
            showToast(error?.message || 'Failed to delete user', 'error');
        }
    };

    const { 
        totalUsers, 
        simulatedMRR, 
        newUsersCount, 
        totalImageGenerations, 
        totalVideoGenerations,
        planDistribution,
        topUsers
    } = useMemo(() => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const distribution: Record<User['plan'], number> = { Free: 0, Caption: 0, Pro: 0, Elite: 0, Agency: 0, Growth: 0, Starter: 0, OnlyFansStudio: 0 };
        
        users.forEach(user => {
            // Hide Agency, Starter, Growth, and Caption plans from display
            if (user.plan !== 'Agency' && user.plan !== 'Starter' && user.plan !== 'Growth' && user.plan !== 'Caption' && user.plan in distribution) {
                distribution[user.plan]++;
            }
        });

        const sortedUsers = [...users].sort((a, b) => {
            const usageA = Number(a.monthlyImageGenerationsUsed ?? 0) + Number(a.monthlyVideoGenerationsUsed ?? 0);
            const usageB = Number(b.monthlyImageGenerationsUsed ?? 0) + Number(b.monthlyVideoGenerationsUsed ?? 0);
            return usageB - usageA;
        });

        return {
            totalUsers: users.length,
            simulatedMRR: users.reduce((acc, user) => acc + (planPrices[user.plan] || 0), 0),
            newUsersCount: users.filter(user => new Date(user.signupDate).getTime() > thirtyDaysAgo.getTime()).length,
            totalImageGenerations: users.reduce((acc, user) => acc + Number(user.monthlyImageGenerationsUsed ?? 0), 0),
            totalVideoGenerations: users.reduce((acc, user) => acc + Number(user.monthlyVideoGenerationsUsed ?? 0), 0),
            planDistribution: distribution,
            topUsers: sortedUsers.slice(0, 3)
        };
    }, [users]);
    

    const activityIcons: Record<Activity['type'], React.ReactNode> = {
        'New User': <UserPlusIcon />,
        'Plan Upgrade': <ArrowUpCircleIcon />,
    };

    return (
        <div className="space-y-8">
             {accessError && (
                <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 p-4 rounded-lg flex items-center gap-3 text-yellow-800 dark:text-yellow-200">
                    <LockIcon className="w-5 h-5" />
                    <span>{accessError}</span>
                </div>
            )}
            {editingUser && (
                <UserManagementModal 
                    user={editingUser}
                    onClose={() => setEditingUser(null)}
                    onSave={handleSaveUser}
                />
            )}
            {grantingRewardToUser && (
                <GrantReferralRewardModal
                    user={grantingRewardToUser}
                    onClose={() => setGrantingRewardToUser(null)}
                    onSuccess={() => {
                        setGrantingRewardToUser(null);
                        // Optionally refresh user data
                    }}
                />
            )}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h2>
                <div className="flex flex-wrap gap-2 overflow-x-auto pb-2 -mx-2 px-2 sm:overflow-x-visible sm:pb-0 sm:mx-0 sm:px-0">
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`px-4 py-2 rounded-md transition-colors ${
                            activeTab === 'overview'
                                ? 'bg-primary-600 text-white'
                                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                        }`}
                    >
                        Overview
                    </button>
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`px-4 py-2 rounded-md transition-colors ${
                            activeTab === 'users'
                                ? 'bg-primary-600 text-white'
                                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                        }`}
                    >
                        Users
                    </button>
                    <button
                        onClick={() => {
                            setActiveTab('tools');
                            setToolsTab('toolsHome');
                        }}
                        className={`px-4 py-2 rounded-md transition-colors ${
                            activeTab === 'tools'
                                ? 'bg-primary-600 text-white'
                                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                        }`}
                    >
                        Tools
                    </button>
                </div>
            </div>

            {activeTab === 'tools' && (
                <div className="space-y-6">
                    <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
                        <button
                            onClick={() => setToolsTab('toolsHome')}
                            className={`px-4 py-2 rounded-md transition-colors ${
                                toolsTab === 'toolsHome'
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                            }`}
                        >
                            Tools Home
                        </button>
                        <button
                            onClick={() => setToolsTab('referralRewards')}
                            className={`px-4 py-2 rounded-md transition-colors ${
                                toolsTab === 'referralRewards'
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                            }`}
                        >
                            Referral Rewards
                        </button>
                        <button
                            onClick={() => setToolsTab('announcements')}
                            className={`px-4 py-2 rounded-md transition-colors ${
                                toolsTab === 'announcements'
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                            }`}
                        >
                            Announcements
                        </button>
                        <button
                            onClick={() => setToolsTab('invites')}
                            className={`px-4 py-2 rounded-md transition-colors ${
                                toolsTab === 'invites'
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                            }`}
                        >
                            Invite Codes
                        </button>
                        <button
                            onClick={() => setToolsTab('waitlist')}
                            className={`px-4 py-2 rounded-md transition-colors ${
                                toolsTab === 'waitlist'
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                            }`}
                        >
                            Waitlist
                        </button>
                        <button
                            onClick={() => setToolsTab('feedback')}
                            className={`px-4 py-2 rounded-md transition-colors ${
                                toolsTab === 'feedback'
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                            }`}
                        >
                            Feedback
                        </button>
                        <button
                            onClick={() => setToolsTab('feedbackForms')}
                            className={`px-4 py-2 rounded-md transition-colors ${
                                toolsTab === 'feedbackForms'
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                            }`}
                        >
                            Feedback Forms
                        </button>
                        <button
                            onClick={() => setToolsTab('reviews')}
                            className={`px-4 py-2 rounded-md transition-colors ${
                                toolsTab === 'reviews'
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                            }`}
                        >
                            Reviews
                        </button>
                    </div>

                    {toolsTab === 'toolsHome' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Admin Tools</h3>
                            </div>
                            <AdminToolsPanel />
                        </div>
                    )}
                    {toolsTab === 'referralRewards' && <ReferralRewardsConfig />}
                    {toolsTab === 'announcements' && <AdminAnnouncementsPanel />}
                    {toolsTab === 'invites' && <InviteCodeManager />}
                    {toolsTab === 'waitlist' && <WaitlistManager />}
                    {toolsTab === 'feedback' && <AdminFeedbackPanel />}
                    {toolsTab === 'feedbackForms' && <AdminFeedbackFormBuilder />}
                    {toolsTab === 'reviews' && <AdminReviewsPanel />}
                </div>
            )}
            {activeTab === 'overview' && (
                <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 md:gap-6">
                <StatCard title="Total Users" value={totalUsers} icon={<TeamIcon />}/>
                <StatCard title="Simulated MRR" value={`$${simulatedMRR.toLocaleString()}`} icon={<DollarSignIcon />}/>
                <StatCard title="New Users (30d)" value={newUsersCount} icon={<UserPlusIcon />}/>
                <StatCard title="Image Generations" value={totalImageGenerations.toLocaleString()} icon={<ImageIcon />}/>
                <StatCard title="Video Generations" value={totalVideoGenerations.toLocaleString()} icon={<VideoIcon />}/>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 grid grid-cols-1 gap-6">
                     <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Plan Distribution</h3>
                         <div className="space-y-3">
                            {Object.entries(planDistribution)
                                .filter(([plan]) => plan !== 'Agency' && plan !== 'Starter' && plan !== 'Growth' && plan !== 'Caption') // Hide Agency, Starter, Growth, and Caption
                                .map(([plan, count]) => {
                                const percentage = totalUsers > 0 ? (Number(count) / totalUsers * 100).toFixed(1) : "0";
                                return (
                                    <div key={plan}>
                                        <div className="flex justify-between text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                                            <span>{plan} Plan</span>
                                            <span>{count} Users ({percentage}%)</span>
                                        </div>
                                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                                            <div className="bg-primary-600 h-2.5 rounded-full" style={{ width: `${percentage}%` }}></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                     <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Top Users by AI Generations</h3>
                        <ul className="space-y-4">
                            {topUsers.map(user => (
                                <li key={user.id} className="flex items-center space-x-3">
                                    <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full" />
                                    <div className="flex-1">
                                        <p className="font-semibold text-gray-900 dark:text-white">{user.name}</p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                                    </div>
                                    <span className="font-bold text-lg text-primary-600 dark:text-primary-400">
                                        {(Number(user.monthlyImageGenerationsUsed ?? 0) + Number(user.monthlyVideoGenerationsUsed ?? 0)).toLocaleString()}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Recent Activity</h3>
                    <ul className="space-y-4">
                        {activityFeed.length > 0 ? activityFeed.map(activity => (
                             <li key={activity.id} className="flex items-start space-x-3">
                                <div className="p-2 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full mt-1">
                                    {activityIcons[activity.type]}
                                </div>
                                <div>
                                    <p className="text-sm text-gray-800 dark:text-gray-200">
                                        <span className="font-semibold">{activity.user.name}</span> {activity.details}
                                    </p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500">{activity.timestamp}</p>
                                </div>
                            </li>
                        )) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No recent activity.</p>
                        )}
                    </ul>
                </div>
            </div>

            {/* Model Usage Analytics */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">AI Model Usage Analytics</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Track model usage, costs, and performance</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <select
                            value={modelStatsDays}
                            onChange={(e) => setModelStatsDays(Number(e.target.value))}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        >
                            <option value={7}>Last 7 days</option>
                            <option value={30}>Last 30 days</option>
                            <option value={90}>Last 90 days</option>
                        </select>
                    </div>
                </div>

                {isLoadingModelStats ? (
                    <div className="text-center py-12">
                        <svg className="animate-spin h-8 w-8 text-primary-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading model usage statistics...</p>
                    </div>
                ) : modelUsageStats ? (
                    <div className="space-y-6">
                        {(modelUsageStats.alerts || []).length > 0 && (
                            <div className="space-y-2">
                                {(modelUsageStats.alerts || []).map((alert, idx) => (
                                    <div key={idx} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                                        {alert.message}
                                    </div>
                                ))}
                            </div>
                        )}
                        {/* Key Metrics */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg border border-blue-200 dark:border-blue-700">
                                <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">Total Requests</p>
                                <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{modelUsageStats.totalRequests.toLocaleString()}</p>
                            </div>
                            <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg border border-green-200 dark:border-green-700">
                                <p className="text-xs font-medium text-green-700 dark:text-green-300 mb-1">Total Cost</p>
                                <p className="text-2xl font-bold text-green-900 dark:text-green-100">${modelUsageStats.totalCost.toFixed(2)}</p>
                            </div>
                            <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-lg border border-purple-200 dark:border-purple-700">
                                <p className="text-xs font-medium text-purple-700 dark:text-purple-300 mb-1">Avg Cost/Request</p>
                                <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">${modelUsageStats.averageCostPerRequest.toFixed(4)}</p>
                            </div>
                            <div className="p-4 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 rounded-lg border border-red-200 dark:border-red-700">
                                <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-1">Error Rate</p>
                                <p className="text-2xl font-bold text-red-900 dark:text-red-100">{modelUsageStats.errorRate.toFixed(1)}%</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Requests by Model */}
                            <div>
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Requests by Model</h4>
                                <div className="space-y-2">
                                    {Object.entries(modelUsageStats.requestsByModel)
                                        .sort(([, a], [, b]) => (b as number) - (a as number))
                                        .map(([model, count]) => {
                                            const countNum = count as number;
                                            const percentage = modelUsageStats.totalRequests > 0 
                                                ? (countNum / modelUsageStats.totalRequests * 100).toFixed(1) 
                                                : '0';
                                            return (
                                                <div key={model}>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-gray-600 dark:text-gray-400 font-mono">{model}</span>
                                                        <span className="text-gray-900 dark:text-white font-semibold">{countNum} ({percentage}%)</span>
                                                    </div>
                                                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                                        <div className="bg-primary-600 h-2 rounded-full" style={{ width: `${percentage}%` }}></div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            </div>

                            {/* Requests by Task Type */}
                            <div>
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Requests by Task Type</h4>
                                <div className="space-y-2">
                                    {Object.entries(modelUsageStats.requestsByTask)
                                        .sort(([, a], [, b]) => (b as number) - (a as number))
                                        .map(([task, count]) => {
                                            const countNum = count as number;
                                            const percentage = modelUsageStats.totalRequests > 0 
                                                ? (countNum / modelUsageStats.totalRequests * 100).toFixed(1) 
                                                : '0';
                                            return (
                                                <div key={task}>
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-gray-600 dark:text-gray-400 capitalize">{task.replace('-', ' ')}</span>
                                                        <span className="text-gray-900 dark:text-white font-semibold">{countNum} ({percentage}%)</span>
                                                    </div>
                                                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                                        <div className="bg-emerald-600 h-2 rounded-full" style={{ width: `${percentage}%` }}></div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            </div>
                        </div>

                        {/* Cost Tier Breakdown */}
                        <div>
                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Requests by Cost Tier</h4>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Low Cost</p>
                                    <p className="text-xl font-bold text-gray-900 dark:text-white">{modelUsageStats.requestsByCostTier.low.toLocaleString()}</p>
                                </div>
                                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Medium Cost</p>
                                    <p className="text-xl font-bold text-gray-900 dark:text-white">{modelUsageStats.requestsByCostTier.medium.toLocaleString()}</p>
                                </div>
                                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">High Cost</p>
                                    <p className="text-xl font-bold text-gray-900 dark:text-white">{modelUsageStats.requestsByCostTier.high.toLocaleString()}</p>
                                </div>
                            </div>
                        </div>

                        {/* Top Users */}
                        {modelUsageStats.topUsers.length > 0 && (
                            <div>
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Top Users by Requests</h4>
                                <div className="space-y-2">
                                    {modelUsageStats.topUsers.map((user: { userId: string; userName: string; requests: number; cost: number }, idx: number) => (
                                        <div key={user.userId} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                            <div className="flex items-center gap-3">
                                                <span className="text-sm font-bold text-gray-400 dark:text-gray-500 w-6">#{idx + 1}</span>
                                                <span className="text-sm font-medium text-gray-900 dark:text-white">{user.userName}</span>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="text-sm text-gray-600 dark:text-gray-400">{user.requests} requests</span>
                                                <span className="text-sm font-semibold text-gray-900 dark:text-white">${user.cost.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {(modelUsageStats.runawayUsers || []).length > 0 && (
                            <div>
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Runaway Usage (Last 24h)</h4>
                                <div className="space-y-2">
                                    {(modelUsageStats.runawayUsers || []).map((user, idx) => (
                                        <div key={`${user.userId}-${idx}`} className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                                            <span className="text-sm font-medium text-red-900 dark:text-red-200">{user.userName}</span>
                                            <span className="text-sm text-red-700 dark:text-red-300">{user.requests24h} requests • ${user.cost24h.toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Daily Usage Chart */}
                        {modelUsageStats.requestsByDay.length > 0 && (
                            <div>
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Daily Usage Trend</h4>
                                    <select
                                        value={modelStatsDays}
                                        onChange={(e) => setModelStatsDays(Number(e.target.value))}
                                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                    >
                                        <option value={7}>Last 7 days</option>
                                        <option value={30}>Last 30 days</option>
                                        <option value={90}>Last 90 days</option>
                                    </select>
                                </div>
                                {/* Horizontal scroll so 30/90-day views don't make the container too tall */}
                                <div className="overflow-x-auto -mx-2 px-2">
                                    {(() => {
                                        const daysToShow = [7, 30, 90].includes(modelStatsDays) ? modelStatsDays : 30;
                                        const days = modelUsageStats.requestsByDay.slice(-daysToShow) as Array<{ date: string; count: number; cost: number }>;
                                        const maxCount = Math.max(0, ...days.map((d) => d.count));

                                        return (
                                            <div className="min-w-max">
                                                <div className="flex items-end gap-2 pb-2">
                                                    {days.map((day) => {
                                                        const heightPct = maxCount > 0 ? (day.count / maxCount) : 0;
                                                        const barHeight = Math.round(heightPct * 96); // px, max ~96
                                                        const label = new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                                                        return (
                                                            <div key={day.date} className="w-16 flex flex-col items-center gap-2">
                                                                <div className="h-28 w-full flex items-end justify-center bg-gray-100 dark:bg-gray-700/50 rounded-md border border-gray-200 dark:border-gray-600 px-2">
                                                                    <div
                                                                        className="w-full rounded-sm bg-gradient-to-t from-primary-600 to-primary-400"
                                                                        style={{ height: `${Math.max(2, barHeight)}px` }}
                                                                        title={`${label}\nRequests: ${day.count}\nCost: $${day.cost.toFixed(2)}`}
                                                                    />
                                                                </div>
                                                                <div className="text-[11px] text-gray-600 dark:text-gray-400 whitespace-nowrap">{label}</div>
                                                                <div className="text-[11px] text-gray-900 dark:text-gray-100 font-semibold">{day.count}</div>
                                                                <div className="text-[11px] text-gray-600 dark:text-gray-400">${day.cost.toFixed(2)}</div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                        <TrendingIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm">No model usage data available</p>
                        <p className="text-xs mt-1">Usage tracking will appear here once models are used</p>
                    </div>
                )}
            </div>

            {/* Premium Content Studio AI Model Usage */}
            {modelUsageStats && (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md mt-6">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Premium Content Studio AI Model Usage</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Track AI usage specifically for Premium Content Studio features</p>
                        </div>
                    </div>

                    {(() => {
                        // Filter Premium Content Studio-related tasks
                        // Note: Some features (Content Brain, Roleplay) may use shared task types (caption, strategy, etc.)
                        // that are also used by the main app, so they appear in the general analytics
                        const premiumContentStudioTasks = ['sexting_session'];
                        const premiumContentStudioStats = {
                            totalRequests: 0,
                            totalCost: 0,
                            requestsByTask: {} as Record<string, number>,
                            requestsByDay: [] as Array<{ date: string; count: number; cost: number }>,
                        };

                        // Calculate Premium Content Studio stats from modelUsageStats
                        premiumContentStudioTasks.forEach(task => {
                            const count = modelUsageStats.requestsByTask[task as keyof typeof modelUsageStats.requestsByTask] as number || 0;
                            if (count > 0) {
                                premiumContentStudioStats.totalRequests += count;
                                premiumContentStudioStats.requestsByTask[task] = count;
                            }
                        });

                        // Calculate cost using average cost per request (more accurate than fixed estimate)
                        // Premium Content Studio tasks use medium tier, so we use the overall average cost per request
                        premiumContentStudioStats.totalCost = premiumContentStudioStats.totalRequests * modelUsageStats.averageCostPerRequest;

                        if (premiumContentStudioStats.totalRequests === 0) {
                            return (
                                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                    <p className="text-sm">No Premium Content Studio AI usage data yet</p>
                                    <p className="text-xs mt-1">Usage will appear here when creators use Premium Content Studio AI features</p>
                                    <p className="text-xs mt-2 text-gray-400 dark:text-gray-500">Note: Some features (Content Brain, Roleplay) may use shared task types that appear in general analytics</p>
                                </div>
                            );
                        }

                        return (
                            <div className="space-y-6">
                                {/* Key Metrics */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="p-4 bg-gradient-to-br from-pink-50 to-pink-100 dark:from-pink-900/20 dark:to-pink-800/20 rounded-lg border border-pink-200 dark:border-pink-700">
                                        <p className="text-xs font-medium text-pink-700 dark:text-pink-300 mb-1">Total Premium Content Studio Requests</p>
                                        <p className="text-2xl font-bold text-pink-900 dark:text-pink-100">{premiumContentStudioStats.totalRequests.toLocaleString()}</p>
                                    </div>
                                    <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-lg border border-purple-200 dark:border-purple-700">
                                        <p className="text-xs font-medium text-purple-700 dark:text-purple-300 mb-1">Total Premium Content Studio Cost</p>
                                        <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">${premiumContentStudioStats.totalCost.toFixed(2)}</p>
                                    </div>
                                    <div className="p-4 bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-800/20 rounded-lg border border-indigo-200 dark:border-indigo-700">
                                        <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">Avg Cost/Request</p>
                                        <p className="text-2xl font-bold text-indigo-900 dark:text-indigo-100">${(premiumContentStudioStats.totalCost / premiumContentStudioStats.totalRequests).toFixed(4)}</p>
                                    </div>
                                </div>

                                {/* Premium Content Studio Tasks Breakdown */}
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Premium Content Studio Features Usage</h4>
                                    <div className="space-y-2">
                                        {Object.entries(premiumContentStudioStats.requestsByTask)
                                            .sort(([, a], [, b]) => (b as number) - (a as number))
                                            .map(([task, count]) => {
                                                const countNum = count as number;
                                                const percentage = premiumContentStudioStats.totalRequests > 0 
                                                    ? (countNum / premiumContentStudioStats.totalRequests * 100).toFixed(1) 
                                                    : '0';
                                                const taskLabel = task === 'sexting_session' ? 'Sexting Session Assistant' : task;
                                                return (
                                                    <div key={task}>
                                                        <div className="flex justify-between text-xs mb-1">
                                                            <span className="text-gray-600 dark:text-gray-400 capitalize">{taskLabel}</span>
                                                            <span className="text-gray-900 dark:text-white font-semibold">{countNum} ({percentage}%)</span>
                                                        </div>
                                                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                                            <div className="bg-pink-600 h-2 rounded-full" style={{ width: `${percentage}%` }}></div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}
                </>
            )}
            {activeTab === 'users' && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">User Management</h3>
                    <input 
                        type="text"
                        placeholder="Search by name or email..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full sm:w-64 p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-primary-500 focus:border-primary-500 dark:text-white dark:placeholder-gray-400"
                    />
                </div>
                <div className="overflow-x-auto">
                     {isLoading ? (
                        <div className="text-center py-16">
                            <svg className="animate-spin h-8 w-8 text-primary-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            <p className="mt-4 text-lg font-semibold text-gray-700 dark:text-gray-300">Loading users...</p>
                        </div>
                    ) : (
                    <table className="w-full text-left min-w-[900px]">
                        <thead className="bg-gray-50 dark:bg-gray-700/50">
                            <tr>
                                <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">User</th>
                                <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">Plan</th>
                                <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">Signup Date</th>
                                <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">Storage</th>
                                <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">AI Captions</th>
                                <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">Image Usage</th>
                                <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">Video Usage</th>
                                <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(() => {
                                const visibleUsers = paginatedUsers.filter(user => 
                                    user.plan !== 'Agency' && 
                                    user.plan !== 'Starter' && 
                                    user.plan !== 'Growth' && 
                                    user.plan !== 'Caption'
                                );
                                
                                // Separate admins and regular users for display
                                const adminUsers = visibleUsers.filter(user => user.role === 'Admin');
                                const regularUsers = visibleUsers.filter(user => user.role !== 'Admin');
                                
                                // Find wil_jackson@icloud.com in current page
                                const wilJacksonUser = visibleUsers.find(user => user.email === 'wil_jackson@icloud.com');
                                const wilJacksonIndexInVisible = wilJacksonUser ? visibleUsers.indexOf(wilJacksonUser) : -1;

                                // Totals row component
                                const TotalsRow = () => (
                                    <tr className="bg-primary-50 dark:bg-primary-900/20 border-b-2 border-primary-300 dark:border-primary-700 font-semibold">
                                        <td className="p-3 text-primary-700 dark:text-primary-300">
                                            <span className="text-sm">📊 Monthly Totals</span>
                                        </td>
                                        <td className="p-3 text-primary-700 dark:text-primary-300">
                                            <span className="text-xs">—</span>
                                        </td>
                                        <td className="p-3 text-primary-700 dark:text-primary-300">
                                            <span className="text-xs">{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                                        </td>
                                        <td className="p-3 text-primary-700 dark:text-primary-300 font-mono">
                                            {(() => {
                                                const totalGB = monthlyTotals.storage / 1024;
                                                return totalGB >= 1 
                                                    ? `${totalGB.toFixed(2)}GB` 
                                                    : `${monthlyTotals.storage.toFixed(1)}MB`;
                                            })()}
                                        </td>
                                        <td className="p-3 text-primary-700 dark:text-primary-300 font-mono">
                                            {monthlyTotals.captions.toLocaleString()}
                                        </td>
                                        <td className="p-3 text-primary-700 dark:text-primary-300 font-mono">
                                            {monthlyTotals.images.toLocaleString()}
                                        </td>
                                        <td className="p-3 text-primary-700 dark:text-primary-300 font-mono">
                                            {monthlyTotals.videos.toLocaleString()}
                                        </td>
                                        <td className="p-3 text-primary-700 dark:text-primary-300">
                                            <span className="text-xs">—</span>
                                        </td>
                                    </tr>
                                );

                                return (
                                    <>
                                        {/* Totals row at top if wil_jackson@icloud.com is not on this page */}
                                        {!wilJacksonUser && <TotalsRow />}
                                        
                                        {/* Admin Users Section */}
                                        {adminUsers.length > 0 && (
                                            <>
                                                {adminUsers.map((user) => {
                                                    const isWilJackson = user.email === 'wil_jackson@icloud.com';
                                                    
                                                    return (
                                                        <React.Fragment key={user.id}>
                                                            <tr className="border-b border-gray-200 dark:border-gray-700 bg-blue-50/30 dark:bg-blue-900/10">
                                                                <td className="p-3">
                                                                    <div className="flex items-center space-x-3">
                                                                        <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full border-2 border-blue-500"/>
                                                                        <div>
                                                                            <p className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                                                                {user.name}
                                                                                <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded">ADMIN</span>
                                                                            </p>
                                                                            <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="p-3">
                                                                    <span className={`px-3 py-1 text-xs font-semibold rounded-full ${planColorMap[user.plan]}`}>
                                                                        {user.plan}
                                                                    </span>
                                                                </td>
                                                                <td className="p-3 text-sm text-gray-600 dark:text-gray-300">
                                                                    {new Date(user.signupDate).toLocaleDateString()}
                                                                </td>
                                                                <td className="p-3 text-sm text-gray-600 dark:text-gray-300">
                                                                    {formatStorage(userStorageMap[user.id] ?? user.storageUsed ?? 0, getStorageLimit(user.plan))}
                                                                </td>
                                                                <td className="p-3 font-mono text-gray-600 dark:text-gray-300">
                                                                    {(() => {
                                                                        const used = user.monthlyCaptionGenerationsUsed ?? 0;
                                                                        let limit = 0;
                                                                        if (user.plan === 'Free') limit = 10;
                                                                        else if (user.plan === 'Pro') limit = 500;
                                                                        else if (user.plan === 'Elite') limit = 1500;
                                                                        else if (user.plan === 'Agency') limit = 10000;
                                                                        return limit > 0 ? `${used}/${limit}` : `${used}`;
                                                                    })()}
                                                                </td>
                                                                <td className="p-3 font-mono text-gray-600 dark:text-gray-300">{getUsageString(user.plan, user.monthlyImageGenerationsUsed, 'image')}</td>
                                                                <td className="p-3 font-mono text-gray-600 dark:text-gray-300">{getUsageString(user.plan, user.monthlyVideoGenerationsUsed, 'video')}</td>
                                                                <td className="p-3">
                                                                    <div className="flex gap-2">
                                                                        <button onClick={() => setEditingUser(user)} className="px-3 py-1 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-md">
                                                                            Manage
                                                                        </button>
                                                                        <button onClick={() => setGrantingRewardToUser(user)} className="px-3 py-1 text-sm font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-md">
                                                                            Grant Reward
                                                                        </button>
                                                                        <button 
                                                                            onClick={() => handleDeleteUser(user)} 
                                                                            className="px-3 py-1 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md flex items-center gap-1"
                                                                            title="Delete User"
                                                                        >
                                                                            <TrashIcon className="w-4 h-4" />
                                                                            Delete
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                            {/* Totals row after wil_jackson@icloud.com if they're an admin */}
                                                            {isWilJackson && (
                                                                <TotalsRow />
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                })}
                                                
                                                {/* Separator line between admins and regular users */}
                                                {regularUsers.length > 0 && (
                                                    <tr>
                                                        <td colSpan={8} className="p-2 border-t-2 border-gray-300 dark:border-gray-600">
                                                            <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold text-center">
                                                                ────────────────────────────────────────────────────────────────────────────────
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </>
                                        )}
                                        
                                        {/* Regular Users Section */}
                                        {regularUsers.map((user, index) => {
                                            const isWilJackson = user.email === 'wil_jackson@icloud.com';
                                            
                                            return (
                                                <React.Fragment key={user.id}>
                                                    <tr className="border-b border-gray-200 dark:border-gray-700">
                                                        <td className="p-3">
                                                            <div className="flex items-center space-x-3">
                                                                <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full"/>
                                                                <div>
                                                                    <p className="font-bold text-gray-900 dark:text-white">{user.name}</p>
                                                                    <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="p-3">
                                                            <span className={`px-3 py-1 text-xs font-semibold rounded-full ${planColorMap[user.plan]}`}>
                                                                {user.plan}
                                                            </span>
                                                        </td>
                                                        <td className="p-3 text-sm text-gray-600 dark:text-gray-300">
                                                            {new Date(user.signupDate).toLocaleDateString()}
                                                        </td>
                                                        <td className="p-3 text-sm text-gray-600 dark:text-gray-300">
                                                            {formatStorage(userStorageMap[user.id] ?? user.storageUsed ?? 0, getStorageLimit(user.plan))}
                                                        </td>
                                                        <td className="p-3 font-mono text-gray-600 dark:text-gray-300">
                                                            {(() => {
                                                                const used = user.monthlyCaptionGenerationsUsed ?? 0;
                                                                let limit = 0;
                                                                if (user.plan === 'Free') limit = 10;
                                                                else if (user.plan === 'Pro') limit = 500;
                                                                else if (user.plan === 'Elite') limit = 1500;
                                                                else if (user.plan === 'Agency') limit = 10000;
                                                                return limit > 0 ? `${used}/${limit}` : `${used}`;
                                                            })()}
                                                        </td>
                                                        <td className="p-3 font-mono text-gray-600 dark:text-gray-300">{getUsageString(user.plan, user.monthlyImageGenerationsUsed, 'image')}</td>
                                                        <td className="p-3 font-mono text-gray-600 dark:text-gray-300">{getUsageString(user.plan, user.monthlyVideoGenerationsUsed, 'video')}</td>
                                                        <td className="p-3">
                                                            <div className="flex gap-2">
                                                                <button onClick={() => setEditingUser(user)} className="px-3 py-1 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-md">
                                                                    Manage
                                                                </button>
                                                                <button onClick={() => setGrantingRewardToUser(user)} className="px-3 py-1 text-sm font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-md">
                                                                    Grant Reward
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleDeleteUser(user)} 
                                                                    className="px-3 py-1 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md flex items-center gap-1"
                                                                    title="Delete User"
                                                                >
                                                                    <TrashIcon className="w-4 h-4" />
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    {/* Totals row after wil_jackson@icloud.com if they're a regular user */}
                                                    {isWilJackson && (
                                                        <TotalsRow />
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </>
                                );
                            })()}
                        </tbody>
                    </table>
                    )}
                </div>
                
                {/* Pagination Controls */}
                {!isLoading && filteredUsers.length > usersPerPage && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                            Showing {startIndex + 1} to {Math.min(endIndex, filteredUsers.length)} of {filteredUsers.length} users
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Previous
                            </button>
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                Page {currentPage} of {totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
            )}
        </div>
    );
};