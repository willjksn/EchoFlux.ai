
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { User, Activity } from '../types';
import { UserManagementModal } from './UserManagementModal';
import { AddUserModal } from './AddUserModal';
import { ReferralRewardsConfig } from './ReferralRewardsConfig';
import { GrantReferralRewardModal } from './GrantReferralRewardModal';
import { AdminAnnouncementsPanel } from './AdminAnnouncementsPanel';
import { AdminToolsPanel } from './AdminToolsPanel';
import { AdminReviewsPanel } from './AdminReviewsPanel';
import { AdminFeedbackPanel } from './AdminFeedbackPanel';
import { AdminFeedbackFormBuilder } from './AdminFeedbackFormBuilder';
import { AdminITSupportPanel } from './AdminITSupportPanel';
import { InviteCodeManager } from './InviteCodeManager';
import { WaitlistManager } from './WaitlistManager';
import { EmailCenterPage } from './EmailCenterPage';
import { TeamIcon, DollarSignIcon, UserPlusIcon, ArrowUpCircleIcon, ImageIcon, VideoIcon, LockIcon, TrendingIcon, TrashIcon, HeartIcon, StarIcon, ChatIcon, GlobeIcon } from './icons/UIIcons';
import { db, auth } from '../firebaseConfig';
import { collection, query, orderBy, onSnapshot, setDoc, doc, getDoc, deleteField, getDocs } from 'firebase/firestore';
import { useAppContext } from './AppContext';
import { defaultSettings } from '../constants';
import { getModelUsageAnalytics, type ModelUsageStats } from '../src/services/modelUsageService';
import { hasActiveStripeEchofluxSubscription } from '../src/lib/echofluxStripeMrr';
import { parseDateLike, formatRemainingAccessForFanRow } from '../src/lib/memberAccessEnd';

// Fallback sample stats so the admin overview is visible even if the analytics
// API is unreachable locally. These reflect the deployment numbers the user described.
const DEFAULT_MODEL_USAGE_STATS: ModelUsageStats = {
    totalRequests: 636,
    totalCost: 0.01,
    averageCostPerRequest: 0.0000157,
    errorRate: 2.0,
    adImageCostsByModel: {},
    adVideoCostsByModel: {},
    adImageRequestsByModel: {},
    adVideoRequestsByModel: {},
    requestsByModel: {
        'gemini-2.0-flash': 354,
        'gemini-2.0-flash-lite': 267,
        'tavily-web-search': 15,
        'replicate-flux-dev': 0,
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

const formatUsdFromCents = (cents: number): string => {
    const safe = Number.isFinite(cents) ? cents : 0;
    return `$${(safe / 100).toFixed(2)}`;
};

type PlanKey = Exclude<User['plan'], null>;

const getPlanKey = (plan: User['plan']): PlanKey => (plan ?? 'Free') as PlanKey;

const planColorMap: Record<PlanKey, string> = {
    Free: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    Caption: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
    Pro: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200',
    Elite: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200',
    Agency: 'bg-primary-100 text-primary-800 dark:bg-primary-900/50 dark:text-primary-200',
    Growth: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
    Starter: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200',
    OnlyFansStudio: 'bg-pink-100 text-pink-800 dark:bg-pink-900/50 dark:text-pink-200',
};

const planPrices: Record<PlanKey, number> = { 
    'Free': 0,
    'Caption': 9,
    'Pro': 29, 
    'Elite': 59, 
    'Agency': 599, 
    'Growth': 249, 
    'Starter': 99,
    'OnlyFansStudio': 79,
};

type FanMembershipLink = {
    creatorId: string;
    creatorName: string;
    creatorHandle: string | null;
    membershipType: 'free' | 'paid';
    status: string;
    cancelAtPeriodEnd?: boolean;
    subscriptionCurrentPeriodEnd?: string | null;
    subscribedAt?: string | null;
    subscriptionPriceCents: number;
    totalSpentCents?: number;
    purchaseCount: number;
    purchasesCents: number;
    tipCount: number;
    tipsCents: number;
    updatedAt: string | null;
};

type FanHubMemberProfile = {
    displayName: string | null;
    email: string | null;
    username: string | null;
};

type MembershipOnlyFanRow = {
    fanKey: string;
    displayName: string;
    email: string | null;
    username: string | null;
    memberships: FanMembershipLink[];
};

function formatIsoDateShort(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '—';
    return d.toLocaleDateString();
}

function getMembershipOnlySignupDate(memberships: FanMembershipLink[]): string {
    let earliestMs: number | null = null;
    memberships.forEach((m) => {
        const d = parseDateLike(m.subscribedAt) || parseDateLike(m.updatedAt);
        if (!d) return;
        const t = d.getTime();
        if (!Number.isFinite(t)) return;
        if (earliestMs == null || t < earliestMs) earliestMs = t;
    });
    return earliestMs == null ? '—' : new Date(earliestMs).toLocaleDateString();
}

function getMembershipOnlyRemainingAccessLabel(memberships: FanMembershipLink[]): string {
    if (!memberships.length) return '—';
    const statusPriority = (status: string): number => {
        const s = status.toLowerCase();
        if (s === 'past_due') return 5;
        if (s === 'active') return 4;
        if (s === 'trialing') return 3;
        if (s === 'free') return 2;
        if (s === 'canceled' || s === 'cancelled') return 1;
        return 0;
    };
    const chosen = memberships
        .slice()
        .sort((a, b) => {
            const aEnd = parseDateLike(a.subscriptionCurrentPeriodEnd)?.getTime() || 0;
            const bEnd = parseDateLike(b.subscriptionCurrentPeriodEnd)?.getTime() || 0;
            if (bEnd !== aEnd) return bEnd - aEnd;
            return statusPriority(b.status) - statusPriority(a.status);
        })[0];
    return formatRemainingAccessForFanRow({
        subscriptionStatus: chosen.status || null,
        cancelAtPeriodEnd: chosen.cancelAtPeriodEnd === true,
        accessEnd: parseDateLike(chosen.subscriptionCurrentPeriodEnd),
    });
}

export const AdminDashboard: React.FC = () => {
    const { user: currentUser, showToast, setActivePage } = useAppContext();
    const [users, setUsers] = useState<User[]>([]);
    const [creatorIds, setCreatorIds] = useState<Set<string>>(new Set());
    const [activityFeed, setActivityFeed] = useState<Activity[]>([]);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [grantingRewardToUser, setGrantingRewardToUser] = useState<User | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [userOriginFilter, setUserOriginFilter] = useState<'all' | 'fan_hub' | 'echoflux'>('echoflux');
    const [isLoading, setIsLoading] = useState(true);
    const [accessError, setAccessError] = useState<string | null>(null);
    const [modelUsageStats, setModelUsageStats] = useState<ModelUsageStats | null>(null);
    const [isLoadingModelStats, setIsLoadingModelStats] = useState(true);
    const [modelStatsDays, setModelStatsDays] = useState<number>(30);
    const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'tools'>('overview');
    const [toolsTab, setToolsTab] = useState<'toolsHome' | 'referralRewards' | 'announcements' | 'invites' | 'waitlist' | 'email' | 'feedback' | 'feedbackForms' | 'reviews' | 'itSupport'>('toolsHome');
    const [userStorageMap, setUserStorageMap] = useState<Record<string, number>>({});
    const [currentPage, setCurrentPage] = useState<number>(1);
    const usersPerPage = 20;
    const [showAddUserModal, setShowAddUserModal] = useState(false);
    
    // Fan Hub Revenue State
    const [fanHubRevenue, setFanHubRevenue] = useState<{
        totalRevenue: number;
        tips: number;
        unlocks: number;
        treats: number;
        subscriptions: number;
        echofluxCommission: number;
        commissionRate: number;
        topCreators: Array<{ id: string; name: string; email: string; revenue: number; commission: number }>;
        recentTransactions: Array<{ id: string; creatorName: string; type: string; amount: number; commission: number; timestamp: Date }>;
    }>({
        totalRevenue: 0,
        tips: 0,
        unlocks: 0,
        treats: 0,
        subscriptions: 0,
        echofluxCommission: 0,
        commissionRate: 0.10, // 10% default
        topCreators: [],
        recentTransactions: [],
    });
    const [isLoadingFanHubRevenue, setIsLoadingFanHubRevenue] = useState(true);
    const [fanHubMembershipsByFanId, setFanHubMembershipsByFanId] = useState<Record<string, FanMembershipLink[]>>({});
    const [fanHubMemberProfilesByFanId, setFanHubMemberProfilesByFanId] = useState<Record<string, FanHubMemberProfile>>({});
    const [fanHubMembershipsAllByFanId, setFanHubMembershipsAllByFanId] = useState<Record<string, FanMembershipLink[]>>({});
    const [fanHubMemberProfilesAllByFanId, setFanHubMemberProfilesAllByFanId] = useState<Record<string, FanHubMemberProfile>>({});
    const [isLoadingAllFanHubMemberships, setIsLoadingAllFanHubMemberships] = useState(false);
    const [fanHubSubscriberFilter, setFanHubSubscriberFilter] = useState<'active' | 'all'>('active');
    const [fanHubMemberViewMode, setFanHubMemberViewMode] = useState<'grouped' | 'deduped'>('grouped');
    const [collapsedFanHubCreators, setCollapsedFanHubCreators] = useState<Record<string, boolean>>({});
    const [showFanHubMembersSection, setShowFanHubMembersSection] = useState(true);
    const [fanHubRevenueDays, setFanHubRevenueDays] = useState<number>(30);
    const [showAllFanHubTransactions, setShowAllFanHubTransactions] = useState(false);

    // Video Chat Usage Stats
    const [videoUsageStats, setVideoUsageStats] = useState<{
        currentMonth: {
            totalSessions: number;
            totalParticipantMinutes: number;
            estimatedCost: number;
            totalRevenue: number;
            totalCommission: number;
            freeMinutesRemaining: number;
            isOverFreeTier: boolean;
            freeTierLimit: number;
        };
        totals: {
            totalSessions: number;
            totalParticipantMinutes: number;
            estimatedCost: number;
            totalRevenue: number;
            totalCommission: number;
        };
    } | null>(null);
    const [isLoadingVideoStats, setIsLoadingVideoStats] = useState(true);
    const [witmeOverview, setWitmeOverview] = useState<{ pageViews: number; uniqueVisitors: number; loading: boolean }>({
        pageViews: 0,
        uniqueVisitors: 0,
        loading: true,
    });
    
    // Reset to page 1 when search term changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, userOriginFilter]);

    // Fetch Video Chat Usage Stats
    useEffect(() => {
        const fetchVideoStats = async () => {
            if (currentUser?.role !== 'Admin') return;
            setIsLoadingVideoStats(true);
            
            try {
                const token = await auth.currentUser?.getIdToken(true);
                if (!token) return;
                
                const res = await fetch('/api/videoUsageStats?months=1', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                
                if (res.ok) {
                    const data = await res.json();
                    setVideoUsageStats(data);
                }
            } catch (e) {
                console.error('Failed to fetch video stats:', e);
            } finally {
                setIsLoadingVideoStats(false);
            }
        };
        
        fetchVideoStats();
    }, [currentUser?.role]);

    useEffect(() => {
        const fetchWitmeOverview = async () => {
            if (currentUser?.role !== 'Admin') return;
            setWitmeOverview((prev) => ({ ...prev, loading: true }));
            try {
                const token = await auth.currentUser?.getIdToken(true);
                if (!token) return;
                const res = await fetch('/api/adminWitmeAnalytics?days=30', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const data = await res.json();
                setWitmeOverview({
                    pageViews: Number(data?.totals?.pageViews || 0),
                    uniqueVisitors: Number(data?.totals?.uniqueVisitors || 0),
                    loading: false,
                });
            } catch {
                setWitmeOverview((prev) => ({ ...prev, loading: false }));
            }
        };
        fetchWitmeOverview();
    }, [currentUser?.role]);

    // Fan Hub revenue: top-level `orders` (Stripe webhook) via admin API — not creators/{id}/orders mirror
    useEffect(() => {
        const fetchFanHubRevenue = async () => {
            if (currentUser?.role !== 'Admin') return;
            setIsLoadingFanHubRevenue(true);

            try {
                const commissionRate = 0.10;
                const token = await auth.currentUser?.getIdToken(true);
                if (!token) return;

                const res = await fetch('/api/adminFanHubRevenue?limit=5000', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) {
                    console.error('adminFanHubRevenue:', res.status, await res.text());
                    return;
                }

                const data = (await res.json()) as {
                    totalRevenue: number;
                    tips: number;
                    unlocks: number;
                    treats: number;
                    subscriptions: number;
                    byCreatorId: Record<string, number>;
                    recentTransactions: Array<{
                        id: string;
                        creatorId: string;
                        type: string;
                        amount: number;
                        timestamp: string;
                    }>;
                };

                const displayByCreatorId: Record<string, string> = {};
                try {
                    const creatorsSnap = await getDocs(collection(db, 'creators'));
                    creatorsSnap.forEach((d) => {
                        const cd = d.data() as { displayName?: string };
                        displayByCreatorId[d.id] = cd.displayName || 'Unknown Creator';
                    });
                } catch (creatorsErr) {
                    // Never block revenue cards if client-side creators/* read is restricted.
                    console.warn('adminFanHubRevenue: creators name lookup skipped', creatorsErr);
                }

                const resolveCreatorName = (creatorId: string) => {
                    const u = users.find((x) => x.id === creatorId);
                    return u?.name || displayByCreatorId[creatorId] || 'Unknown Creator';
                };

                const totalRevenue = data.totalRevenue ?? 0;
                const echofluxCommission = totalRevenue * commissionRate;

                const topCreators = Object.entries(data.byCreatorId || {})
                    .map(([id, revenue]) => {
                        const u = users.find((x) => x.id === id);
                        return {
                            id,
                            name: u?.name || displayByCreatorId[id] || 'Unknown Creator',
                            email: u?.email || '',
                            revenue,
                            commission: revenue * commissionRate,
                        };
                    })
                    .sort((a, b) => b.revenue - a.revenue)
                    .slice(0, 5);

                const recentTransactions = (data.recentTransactions || []).slice(0, 10).map((t) => ({
                    id: t.id,
                    creatorName: resolveCreatorName(t.creatorId),
                    type: t.type,
                    amount: t.amount,
                    commission: t.amount * commissionRate,
                    timestamp: new Date(t.timestamp),
                }));

                setFanHubRevenue({
                    totalRevenue,
                    tips: data.tips ?? 0,
                    unlocks: data.unlocks ?? 0,
                    treats: data.treats ?? 0,
                    subscriptions: data.subscriptions ?? 0,
                    echofluxCommission,
                    commissionRate,
                    topCreators,
                    recentTransactions,
                });
            } catch (err) {
                console.error('Error fetching Fan Hub revenue:', err);
            } finally {
                setIsLoadingFanHubRevenue(false);
            }
        };

        fetchFanHubRevenue();
    }, [currentUser?.role, users]);

    // Fan Hub member -> subscribed creators map (admin-only).
    useEffect(() => {
        const fetchFanHubMemberships = async () => {
            if (currentUser?.role !== 'Admin') return;
            try {
                const token = await auth.currentUser?.getIdToken(true);
                if (!token) return;
                const res = await fetch('/api/adminFanHubMemberships?activeOnly=1', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) {
                    console.warn('adminFanHubMemberships:', res.status, await res.text());
                    return;
                }
                const data = await res.json() as { membershipsByFan?: Record<string, FanMembershipLink[]> };
                setFanHubMembershipsByFanId(data.membershipsByFan || {});
                setFanHubMemberProfilesByFanId((data as { fanProfilesByFanId?: Record<string, FanHubMemberProfile> }).fanProfilesByFanId || {});
            } catch (error) {
                console.warn('Failed to fetch Fan Hub memberships:', error);
            }
        };
        fetchFanHubMemberships();
    }, [currentUser?.role, users.length]);

    // Optional historical view for membership-only subscribers (includes canceled/expired).
    useEffect(() => {
        const fetchAllFanHubMemberships = async () => {
            if (currentUser?.role !== 'Admin') return;
            if (fanHubSubscriberFilter !== 'all') return;
            setIsLoadingAllFanHubMemberships(true);
            try {
                const token = await auth.currentUser?.getIdToken(true);
                if (!token) return;
                const res = await fetch('/api/adminFanHubMemberships?activeOnly=0', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) {
                    console.warn('adminFanHubMemberships(all):', res.status, await res.text());
                    return;
                }
                const data = await res.json() as {
                    membershipsByFan?: Record<string, FanMembershipLink[]>;
                    fanProfilesByFanId?: Record<string, FanHubMemberProfile>;
                };
                setFanHubMembershipsAllByFanId(data.membershipsByFan || {});
                setFanHubMemberProfilesAllByFanId(data.fanProfilesByFanId || {});
            } catch (error) {
                console.warn('Failed to fetch all Fan Hub memberships:', error);
            } finally {
                setIsLoadingAllFanHubMemberships(false);
            }
        };
        fetchAllFanHubMemberships();
    }, [currentUser?.role, fanHubSubscriberFilter]);

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


    // Check and create admin alerts periodically
    useEffect(() => {
        if (currentUser?.role !== 'Admin') return;

        const checkAlerts = async () => {
            try {
                const token = await auth.currentUser?.getIdToken(true);
                if (!token) return;

                const response = await fetch('/api/checkAdminAlerts', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.alertsCreated > 0) {
                        showToast(`Created ${data.alertsCreated} new admin alert(s)`, 'success');
                    }
                }
            } catch (error) {
                // Silent failure - alerts are non-critical
                if (process.env.NODE_ENV === 'development') {
                    console.warn('Failed to check admin alerts:', error);
                }
            }
        };

        // Check immediately on load
        checkAlerts();

        // Then check every 30 minutes
        const interval = setInterval(checkAlerts, 30 * 60 * 1000);

        return () => clearInterval(interval);
    }, [currentUser?.role, currentUser?.id]);

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

    useEffect(() => {
        const loadCreatorIds = async () => {
            if (currentUser?.role !== 'Admin') return;
            try {
                const creatorsSnap = await getDocs(collection(db, 'creators'));
                const ids = new Set<string>();
                creatorsSnap.forEach((d) => ids.add(d.id));
                setCreatorIds(ids);
            } catch (error) {
                console.warn('AdminDashboard: failed to load creators index for user filtering:', error);
                setCreatorIds(new Set());
            }
        };
        void loadCreatorIds();
    }, [currentUser?.role]);

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

    const getFanHubMembershipsForUser = useCallback((user: User): FanMembershipLink[] => {
        const byId = fanHubMembershipsByFanId[user.id];
        if (Array.isArray(byId) && byId.length > 0) return byId;
        const emailKey = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
        if (emailKey) {
            const byEmail = fanHubMembershipsByFanId[emailKey];
            if (Array.isArray(byEmail) && byEmail.length > 0) return byEmail;
        }
        return [];
    }, [fanHubMembershipsByFanId]);

    const hasFanHubMembership = useCallback((user: User): boolean => {
        if (getFanHubMembershipsForUser(user).length > 0) return true;
        if (user.accountOrigin === 'fan_hub') return true;
        return false;
    }, [getFanHubMembershipsForUser]);
    
    const filteredUsers = useMemo(() => {
        const filtered = users.filter(user => {
            const matchesSearch =
                user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                user.email.toLowerCase().includes(searchTerm.toLowerCase());
            if (!matchesSearch) return false;
            if (userOriginFilter === 'all') return true;
            if (userOriginFilter === 'fan_hub') return hasFanHubMembership(user);
            // EchoFlux filter should show creator-workspace users only (not fan-only members).
            const isWorkspaceUser =
                user.role === 'Admin' ||
                creatorIds.has(user.id) ||
                hasActiveStripeEchofluxSubscription(user);
            return isWorkspaceUser && !hasFanHubMembership(user);
        });
        
        // Separate admins from regular users
        const adminUsers = filtered.filter(user => user.role === 'Admin');
        const regularUsers = filtered.filter(user => user.role !== 'Admin');
        
        // Sort admins by email (to find wil_jackson@icloud.com first)
        adminUsers.sort((a, b) => a.email.localeCompare(b.email));
        // Sort regular users by signup date (newest first)
        regularUsers.sort((a, b) => new Date(b.signupDate).getTime() - new Date(a.signupDate).getTime());
        
        // Return admins first, then regular users
        return [...adminUsers, ...regularUsers];
    }, [users, searchTerm, userOriginFilter, hasFanHubMembership, creatorIds]);

    const membershipOnlyFanRows = useMemo<MembershipOnlyFanRow[]>(() => {
        if (userOriginFilter === 'echoflux') return [];
        const membershipSource =
            fanHubSubscriberFilter === 'all' ? fanHubMembershipsAllByFanId : fanHubMembershipsByFanId;
        const profileSource =
            fanHubSubscriberFilter === 'all' ? fanHubMemberProfilesAllByFanId : fanHubMemberProfilesByFanId;
        const matchedKeys = new Set<string>();
        users.forEach((u) => {
            if (u.role === 'Admin') return;
            if (!hasFanHubMembership(u)) return;
            matchedKeys.add(u.id);
            const em = typeof u.email === 'string' ? u.email.trim().toLowerCase() : '';
            if (em) matchedKeys.add(em);
        });

        const search = searchTerm.trim().toLowerCase();
        const out: MembershipOnlyFanRow[] = [];
        for (const [fanKey, membershipsRaw] of Object.entries(membershipSource)) {
            const memberships = Array.isArray(membershipsRaw) ? membershipsRaw : [];
            if (memberships.length === 0) continue;
            if (matchedKeys.has(fanKey)) continue;
            const profile = profileSource[fanKey];
            const email = profile?.email || (fanKey.includes('@') ? fanKey.toLowerCase() : null);
            const usernameRaw = profile?.username ? profile.username.replace(/^@/, '').trim().toLowerCase() : '';
            const username = usernameRaw ? `@${usernameRaw}` : null;
            const displayName =
                (profile?.displayName && profile.displayName.trim()) ||
                (username && username.trim()) ||
                (email ? email.split('@')[0] : '') ||
                'Fan Member';
            if (search) {
                const creatorBlob = memberships.map((m) => (m.creatorName || '')).join(' ').toLowerCase();
                const hay = `${fanKey.toLowerCase()} ${displayName.toLowerCase()} ${email || ''} ${(username || '').toLowerCase()} ${creatorBlob}`;
                if (!hay.includes(search)) continue;
            }
            out.push({ fanKey, displayName, email, username, memberships });
        }
        out.sort((a, b) => a.displayName.localeCompare(b.displayName));
        return out;
    }, [
        fanHubMembershipsByFanId,
        fanHubMemberProfilesByFanId,
        fanHubMembershipsAllByFanId,
        fanHubMemberProfilesAllByFanId,
        fanHubSubscriberFilter,
        users,
        hasFanHubMembership,
        searchTerm,
        userOriginFilter,
    ]);

    const filteredFanHubTransactions = useMemo(() => {
        if (!fanHubRevenue.recentTransactions.length) return [];
        const cutoffMs = Date.now() - fanHubRevenueDays * 24 * 60 * 60 * 1000;
        return fanHubRevenue.recentTransactions.filter((tx) => tx.timestamp.getTime() >= cutoffMs);
    }, [fanHubRevenue.recentTransactions, fanHubRevenueDays]);

    const fanHubFilteredTotals = useMemo(() => {
        let tips = 0;
        let unlocks = 0;
        let treats = 0;
        let subscriptions = 0;

        filteredFanHubTransactions.forEach((tx) => {
            const type = String(tx.type || '').toLowerCase();
            if (type === 'tip') {
                tips += tx.amount;
                return;
            }
            if (type === 'unlock' || type === 'post_unlock') {
                unlocks += tx.amount;
                return;
            }
            if (type === 'subscription') {
                subscriptions += tx.amount;
                return;
            }
            treats += tx.amount;
        });

        return { tips, unlocks, treats, subscriptions };
    }, [filteredFanHubTransactions]);

    const visibleFanHubTransactions = useMemo(
        () => (showAllFanHubTransactions ? filteredFanHubTransactions : filteredFanHubTransactions.slice(0, 5)),
        [filteredFanHubTransactions, showAllFanHubTransactions]
    );

    useEffect(() => {
        setShowAllFanHubTransactions(false);
    }, [fanHubRevenueDays]);
    
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
            // Ensure plan is valid (only Pro and Elite in use)
            const validPlans: User['plan'][] = ['Pro', 'Elite'];
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

        const distribution: Record<PlanKey, number> = { Free: 0, Caption: 0, Pro: 0, Elite: 0, Agency: 0, Growth: 0, Starter: 0, OnlyFansStudio: 0 };
        
        users.forEach(user => {
            // Hide Agency, Starter, Growth, Caption, Free, and OnlyFansStudio plans from display
            const planKey = getPlanKey(user.plan);
            if (planKey !== 'Agency' && planKey !== 'Starter' && planKey !== 'Growth' && planKey !== 'Caption' && planKey !== 'Free' && planKey !== 'OnlyFansStudio' && planKey in distribution) {
                distribution[planKey]++;
            }
        });

        const sortedUsers = [...users].sort((a, b) => {
            const usageA = Number(a.monthlyImageGenerationsUsed ?? 0) + Number(a.monthlyVideoGenerationsUsed ?? 0);
            const usageB = Number(b.monthlyImageGenerationsUsed ?? 0) + Number(b.monthlyVideoGenerationsUsed ?? 0);
            return usageB - usageA;
        });

        return {
            totalUsers: users.length,
            simulatedMRR: users.reduce((acc, user) => {
                if (!hasActiveStripeEchofluxSubscription(user)) return acc;
                return acc + (planPrices[getPlanKey(user.plan)] || 0);
            }, 0),
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

    const getUserOriginBadge = (user: User) => {
        if (user.accountOrigin === 'fan_hub') {
            return (
                <span className="text-[10px] bg-cyan-600 text-white dark:bg-cyan-500 dark:text-white px-2 py-0.5 rounded-full font-semibold tracking-wide">
                    FAN HUB
                </span>
            );
        }
        return null;
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
                    showToast={showToast}
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
            {showAddUserModal && (
                <AddUserModal
                    onClose={() => setShowAddUserModal(false)}
                    onSuccess={() => showToast('User created successfully', 'success')}
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
                        <button
                            onClick={() => setToolsTab('itSupport')}
                            className={`px-4 py-2 rounded-md transition-colors ${
                                toolsTab === 'itSupport'
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                            }`}
                        >
                            IT Support
                        </button>
                        <button
                            onClick={() => setToolsTab('email')}
                            className={`px-4 py-2 rounded-md transition-colors ${
                                toolsTab === 'email'
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                            }`}
                        >
                            Email Center
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
                    {toolsTab === 'itSupport' && <AdminITSupportPanel />}
                    {toolsTab === 'email' && <EmailCenterPage />}
                </div>
            )}
            {activeTab === 'overview' && (
                <>
            {/* Key Metrics - Echoflux Business Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 md:gap-6">
                <StatCard title="Total Users" value={totalUsers} icon={<TeamIcon />}/>
                <StatCard title="New Users (30d)" value={newUsersCount} icon={<UserPlusIcon />}/>
                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-4 md:p-6 rounded-xl shadow-md text-white">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-white/20 rounded-full">
                            <DollarSignIcon className="w-5 h-5" />
                        </div>
                        <p className="text-sm font-medium opacity-90">Subscription MRR</p>
                    </div>
                    <p className="text-2xl md:text-3xl font-bold">
                        ${simulatedMRR.toLocaleString()}
                    </p>
                    <p className="text-xs opacity-75 mt-1">Stripe active/trialing subs only (excludes manual & invite grants)</p>
                </div>
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-4 md:p-6 rounded-xl shadow-md text-white">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-white/20 rounded-full">
                            <HeartIcon className="w-5 h-5" />
                        </div>
                        <p className="text-sm font-medium opacity-90">Fan Hub Revenue</p>
                    </div>
                    <p className="text-2xl md:text-3xl font-bold">
                        {isLoadingFanHubRevenue ? '...' : `$${fanHubRevenue.totalRevenue.toFixed(2)}`}
                    </p>
                    <p className="text-xs opacity-75 mt-1">Creator earnings via Stripe</p>
                </div>
                <div className="bg-gradient-to-br from-primary-500 to-purple-600 p-4 md:p-6 rounded-xl shadow-md text-white">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-white/20 rounded-full">
                            <TrendingIcon className="w-5 h-5" />
                        </div>
                        <p className="text-sm font-medium opacity-90">Fan Hub Commission</p>
                    </div>
                    <p className="text-2xl md:text-3xl font-bold">
                        {isLoadingFanHubRevenue ? '...' : `$${fanHubRevenue.echofluxCommission.toFixed(2)}`}
                    </p>
                    <p className="text-xs opacity-75 mt-1">{(fanHubRevenue.commissionRate * 100).toFixed(0)}% of transactions</p>
                </div>
                <button
                    type="button"
                    onClick={() => setActivePage('witmePage')}
                    className="text-left bg-gradient-to-br from-cyan-500 to-blue-600 p-4 md:p-6 rounded-xl shadow-md text-white hover:opacity-95 transition"
                >
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-white/20 rounded-full">
                            <GlobeIcon className="w-5 h-5" />
                        </div>
                        <p className="text-sm font-medium opacity-90">Witme Views (30d)</p>
                    </div>
                    <p className="text-2xl md:text-3xl font-bold">
                        {witmeOverview.loading ? '...' : witmeOverview.pageViews.toLocaleString()}
                    </p>
                    <p className="text-xs opacity-75 mt-1">
                        {witmeOverview.loading ? 'Loading traffic' : `${witmeOverview.uniqueVisitors.toLocaleString()} unique visitors`}
                    </p>
                </button>
            </div>

            {/* Total Echoflux Revenue Summary — light card in light mode */}
            <div className="bg-gradient-to-r from-slate-50 via-gray-50 to-slate-100 dark:from-gray-800 dark:via-gray-800 dark:to-gray-700 p-6 rounded-xl shadow-lg border border-gray-200/80 dark:border-gray-600/50 text-gray-900 dark:text-white">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Total Echoflux Revenue</h3>
                        <p className="text-sm text-gray-500 dark:opacity-70 mt-1">Stripe subscription MRR + Fan Hub commission</p>
                    </div>
                    <div className="text-right">
                        <p className="text-3xl md:text-4xl font-bold text-primary-600 dark:text-white">
                            ${(simulatedMRR + (isLoadingFanHubRevenue ? 0 : fanHubRevenue.echofluxCommission)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-sm text-gray-500 dark:opacity-70 mt-1">per month</p>
                    </div>
                </div>
            </div>

            {/* Fan Hub Revenue Breakdown */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">Fan Hub Revenue Breakdown</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Revenue by transaction type (last {fanHubRevenueDays} days, Echoflux earns {(fanHubRevenue.commissionRate * 100).toFixed(0)}%)
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <select
                            value={fanHubRevenueDays}
                            onChange={(e) => setFanHubRevenueDays(Number(e.target.value))}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        >
                            <option value={7}>Last 7 days</option>
                            <option value={30}>Last 30 days</option>
                            <option value={90}>Last 90 days</option>
                        </select>
                    </div>
                </div>
                
                {isLoadingFanHubRevenue ? (
                    <div className="text-center py-8">
                        <svg className="animate-spin h-8 w-8 text-primary-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 rounded-lg border border-yellow-200 dark:border-yellow-700">
                            <div className="flex items-center gap-2 mb-2">
                                <DollarSignIcon className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                                <p className="text-xs font-medium text-yellow-700 dark:text-yellow-300">Tips</p>
                            </div>
                            <p className="text-xl font-bold text-yellow-900 dark:text-yellow-100">${fanHubFilteredTotals.tips.toFixed(2)}</p>
                            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                                Commission: ${(fanHubFilteredTotals.tips * fanHubRevenue.commissionRate).toFixed(2)}
                            </p>
                        </div>
                        <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-lg border border-purple-200 dark:border-purple-700">
                            <div className="flex items-center gap-2 mb-2">
                                <LockIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                <p className="text-xs font-medium text-purple-700 dark:text-purple-300">Content Unlocks</p>
                            </div>
                            <p className="text-xl font-bold text-purple-900 dark:text-purple-100">${fanHubFilteredTotals.unlocks.toFixed(2)}</p>
                            <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                                Commission: ${(fanHubFilteredTotals.unlocks * fanHubRevenue.commissionRate).toFixed(2)}
                            </p>
                        </div>
                        <div className="p-4 bg-gradient-to-br from-pink-50 to-pink-100 dark:from-pink-900/20 dark:to-pink-800/20 rounded-lg border border-pink-200 dark:border-pink-700">
                            <div className="flex items-center gap-2 mb-2">
                                <HeartIcon className="w-4 h-4 text-pink-600 dark:text-pink-400" />
                                <p className="text-xs font-medium text-pink-700 dark:text-pink-300">Fan store</p>
                            </div>
                            <p className="text-xl font-bold text-pink-900 dark:text-pink-100">${fanHubFilteredTotals.treats.toFixed(2)}</p>
                            <p className="text-xs text-pink-600 dark:text-pink-400 mt-1">
                                Commission: ${(fanHubFilteredTotals.treats * fanHubRevenue.commissionRate).toFixed(2)}
                            </p>
                        </div>
                        <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg border border-blue-200 dark:border-blue-700">
                            <div className="flex items-center gap-2 mb-2">
                                <StarIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                <p className="text-xs font-medium text-blue-700 dark:text-blue-300">Subscriptions</p>
                            </div>
                            <p className="text-xl font-bold text-blue-900 dark:text-blue-100">${fanHubFilteredTotals.subscriptions.toFixed(2)}</p>
                            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                Commission: ${(fanHubFilteredTotals.subscriptions * fanHubRevenue.commissionRate).toFixed(2)}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Earning Creators */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Top Earning Creators</h3>
                    {isLoadingFanHubRevenue ? (
                        <div className="text-center py-8 text-gray-500">Loading...</div>
                    ) : fanHubRevenue.topCreators.length > 0 ? (
                        <ul className="space-y-3">
                            {fanHubRevenue.topCreators.map((creator, idx) => (
                                <li key={creator.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <span className="text-lg font-bold text-gray-400 w-6">#{idx + 1}</span>
                                        <div>
                                            <p className="font-semibold text-gray-900 dark:text-white">{creator.name}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">{creator.email}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-green-600 dark:text-green-400">${creator.revenue.toFixed(2)}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            Your cut: ${creator.commission.toFixed(2)}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                            <HeartIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No creator revenue yet</p>
                            <p className="text-xs mt-1">Revenue will appear when creators make sales through their Fan Pages</p>
                        </div>
                    )}
                </div>

                {/* Recent New Users */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Recent Signups</h3>
                    <ul className="space-y-3">
                        {activityFeed.length > 0 ? activityFeed.slice(0, 6).map(activity => (
                            <li key={activity.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                <div className="p-2 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full">
                                    <UserPlusIcon />
                                </div>
                                <div className="flex-1">
                                    <p className="font-semibold text-gray-900 dark:text-white">{activity.user.name}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{activity.timestamp}</p>
                                </div>
                            </li>
                        )) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No recent signups.</p>
                        )}
                    </ul>
                </div>
            </div>

            {/* Recent Transactions */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">Recent Fan Hub Transactions</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Top 5 shown by default. Expand to see all for the selected period.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <select
                            value={fanHubRevenueDays}
                            onChange={(e) => setFanHubRevenueDays(Number(e.target.value))}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        >
                            <option value={7}>Last 7 days</option>
                            <option value={30}>Last 30 days</option>
                            <option value={90}>Last 90 days</option>
                        </select>
                    </div>
                </div>
                {isLoadingFanHubRevenue ? (
                    <div className="text-center py-8 text-gray-500">Loading...</div>
                ) : filteredFanHubTransactions.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 dark:bg-gray-700/50">
                                <tr>
                                    <th className="p-3 text-xs font-semibold text-gray-600 dark:text-gray-300">Creator</th>
                                    <th className="p-3 text-xs font-semibold text-gray-600 dark:text-gray-300">Type</th>
                                    <th className="p-3 text-xs font-semibold text-gray-600 dark:text-gray-300">Amount</th>
                                    <th className="p-3 text-xs font-semibold text-gray-600 dark:text-gray-300">Your Commission</th>
                                    <th className="p-3 text-xs font-semibold text-gray-600 dark:text-gray-300">Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleFanHubTransactions.map(tx => (
                                    <tr key={tx.id} className="border-b border-gray-100 dark:border-gray-700">
                                        <td className="p-3 text-sm text-gray-900 dark:text-white">{tx.creatorName}</td>
                                        <td className="p-3">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                                tx.type === 'tip' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' :
                                                tx.type === 'unlock' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' :
                                                tx.type === 'subscription' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                                                'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300'
                                            }`}>
                                                {tx.type}
                                            </span>
                                        </td>
                                        <td className="p-3 text-sm font-semibold text-gray-900 dark:text-white">${tx.amount.toFixed(2)}</td>
                                        <td className="p-3 text-sm font-semibold text-green-600 dark:text-green-400">${tx.commission.toFixed(2)}</td>
                                        <td className="p-3 text-sm text-gray-500 dark:text-gray-400">{tx.timestamp.toLocaleDateString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredFanHubTransactions.length > 5 && (
                            <div className="mt-4 flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => setShowAllFanHubTransactions((prev) => !prev)}
                                    className="px-3 py-2 text-xs font-semibold border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
                                >
                                    {showAllFanHubTransactions
                                        ? 'Hide extra transactions'
                                        : `Show all ${filteredFanHubTransactions.length} transactions`}
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        <DollarSignIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No transactions in the selected period</p>
                        <p className="text-xs mt-1">Try a wider date range to view older transactions</p>
                    </div>
                )}
            </div>

            {/* Video Chat Usage Analytics */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">Video Chat Usage (Daily.co)</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Track video call minutes, costs, and revenue</p>
                    </div>
                </div>
                
                {isLoadingVideoStats ? (
                    <div className="text-center py-8">
                        <svg className="animate-spin h-8 w-8 text-blue-600 mx-auto" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading video usage statistics...</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Free Tier Status Alert */}
                        <div className={`rounded-lg border px-4 py-3 text-sm ${
                            videoUsageStats?.currentMonth?.isOverFreeTier
                                ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200'
                                : 'border-green-200 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-900/30 dark:text-green-200'
                        }`}>
                            {videoUsageStats?.currentMonth?.isOverFreeTier ? (
                                <>⚠️ Over free tier! {(videoUsageStats?.currentMonth?.totalParticipantMinutes || 0).toLocaleString()} / {(videoUsageStats?.currentMonth?.freeTierLimit || 10000).toLocaleString()} minutes used</>
                            ) : (
                                <>✓ Within free tier: {(videoUsageStats?.currentMonth?.freeMinutesRemaining || 10000).toLocaleString()} free minutes remaining</>
                            )}
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                            <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg border border-blue-200 dark:border-blue-700">
                                <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">Total Sessions</p>
                                <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{videoUsageStats?.currentMonth?.totalSessions || 0}</p>
                            </div>
                            <div className="p-4 bg-gradient-to-br from-cyan-50 to-cyan-100 dark:from-cyan-900/20 dark:to-cyan-800/20 rounded-lg border border-cyan-200 dark:border-cyan-700">
                                <p className="text-xs font-medium text-cyan-700 dark:text-cyan-300 mb-1">Participant Minutes</p>
                                <p className="text-2xl font-bold text-cyan-900 dark:text-cyan-100">{(videoUsageStats?.currentMonth?.totalParticipantMinutes || 0).toLocaleString()}</p>
                            </div>
                            <div className="p-4 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 rounded-lg border border-red-200 dark:border-red-700">
                                <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-1">Daily.co Cost</p>
                                <p className="text-2xl font-bold text-red-900 dark:text-red-100">${(videoUsageStats?.currentMonth?.estimatedCost || 0).toFixed(2)}</p>
                            </div>
                            <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg border border-green-200 dark:border-green-700">
                                <p className="text-xs font-medium text-green-700 dark:text-green-300 mb-1">Fan Revenue</p>
                                <p className="text-2xl font-bold text-green-900 dark:text-green-100">${((videoUsageStats?.currentMonth?.totalRevenue || 0) / 100).toFixed(2)}</p>
                            </div>
                            <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-lg border border-purple-200 dark:border-purple-700">
                                <p className="text-xs font-medium text-purple-700 dark:text-purple-300 mb-1">Echoflux Commission</p>
                                <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">${((videoUsageStats?.currentMonth?.totalCommission || 0) / 100).toFixed(2)}</p>
                            </div>
                        </div>

                        {/* Profit Calculation */}
                        <div className="p-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-700/50 dark:to-gray-600/50 rounded-lg border border-gray-200 dark:border-gray-600">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Video Chat Net Profit (Commission - Cost)</span>
                                <span className={`text-xl font-bold ${
                                    ((videoUsageStats?.currentMonth?.totalCommission || 0) / 100) - (videoUsageStats?.currentMonth?.estimatedCost || 0) >= 0
                                        ? 'text-green-600 dark:text-green-400'
                                        : 'text-red-600 dark:text-red-400'
                                }`}>
                                    ${(((videoUsageStats?.currentMonth?.totalCommission || 0) / 100) - (videoUsageStats?.currentMonth?.estimatedCost || 0)).toFixed(2)}
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Model Usage Analytics */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">Model Usage Analytics</h3>
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
                        {/* Alerts Panel - Always Visible */}
                        <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">System Alerts</h4>
                            {(modelUsageStats.alerts || []).length > 0 ? (
                                (modelUsageStats.alerts || []).map((alert, idx) => (
                                    <div key={idx} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                                        {alert.message}
                                    </div>
                                ))
                            ) : (
                                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
                                    No alerts. All systems operating normally.
                                </div>
                            )}
                        </div>
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
                                        // Estimate cost for Replicate FLUX Dev (~$0.025 per image)
                                        const isReplicate = model === 'replicate-flux-dev' || model === 'replicate-flux-schnell' || model === 'replicate-sdxl';
                                        const estimatedCost = isReplicate ? countNum * 0.025 : null;
                                        return (
                                            <div key={model}>
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="text-gray-600 dark:text-gray-400 font-mono flex items-center gap-1">
                                                        {isReplicate && (
                                                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                                                <circle cx="8.5" cy="8.5" r="1.5" />
                                                                <polyline points="21 15 16 10 5 21" />
                                                            </svg>
                                                        )}
                                                        {model}
                                                    </span>
                                                    <span className="text-gray-900 dark:text-white font-semibold">
                                                        {countNum} ({percentage}%)
                                                        {estimatedCost !== null && (
                                                            <span className="text-orange-600 dark:text-orange-400 ml-2">
                                                                ~${estimatedCost.toFixed(2)}
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>
                                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                                    <div className={`h-2 rounded-full ${isReplicate ? 'bg-orange-500' : 'bg-primary-600'}`} style={{ width: `${percentage}%` }}></div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                
                                {/* Daily.co Video Chat Usage - Always visible */}
                                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                                    <div>
                                        <div className="flex justify-between text-xs mb-1">
                                            <span className="text-gray-600 dark:text-gray-400 font-mono flex items-center gap-1">
                                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <polygon points="23 7 16 12 23 17 23 7" />
                                                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                                                </svg>
                                                daily.co (video chat)
                                            </span>
                                            <span className="text-gray-900 dark:text-white font-semibold">
                                                {videoUsageStats?.currentMonth?.totalSessions || 0} sessions · {videoUsageStats?.currentMonth?.totalParticipantMinutes || 0} min
                                            </span>
                                        </div>
                                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                            <div 
                                                className={`h-2 rounded-full ${videoUsageStats?.currentMonth?.isOverFreeTier ? 'bg-red-500' : 'bg-cyan-500'}`} 
                                                style={{ width: `${Math.min(100, ((videoUsageStats?.currentMonth?.totalParticipantMinutes || 0) / (videoUsageStats?.currentMonth?.freeTierLimit || 10000)) * 100)}%` }}
                                            ></div>
                                        </div>
                                        <div className="flex justify-between text-xs mt-1 text-gray-500 dark:text-gray-400">
                                            <span>{videoUsageStats?.currentMonth?.isOverFreeTier ? '⚠️ Over free tier' : '✓ Within free tier'}</span>
                                            <span>${(videoUsageStats?.currentMonth?.estimatedCost || 0).toFixed(2)} cost</span>
                                        </div>
                                    </div>
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

                        {/* Runaway Usage Panel - Always Visible */}
                        <div>
                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Runaway Usage (Last 24h)</h4>
                            {(modelUsageStats.runawayUsers || []).length > 0 ? (
                                <div className="space-y-2">
                                    {(modelUsageStats.runawayUsers || []).map((user, idx) => (
                                        <div key={`${user.userId}-${idx}`} className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                                            <span className="text-sm font-medium text-red-900 dark:text-red-200">{user.userName}</span>
                                            <span className="text-sm text-red-700 dark:text-red-300">{user.requests24h} requests • ${user.cost24h.toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">No runaway usage detected. All users within normal limits.</span>
                                </div>
                            )}
                        </div>

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

                </>
            )}
            {activeTab === 'users' && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">User Management</h3>
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        <div className="inline-flex rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setUserOriginFilter('all')}
                                className={`px-3 py-2 text-xs font-semibold ${
                                    userOriginFilter === 'all'
                                        ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                                        : 'bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                                }`}
                            >
                                All
                            </button>
                            <button
                                type="button"
                                onClick={() => setUserOriginFilter('fan_hub')}
                                className={`px-3 py-2 text-xs font-semibold ${
                                    userOriginFilter === 'fan_hub'
                                        ? 'bg-cyan-600 text-white dark:bg-cyan-500 dark:text-white'
                                        : 'bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                                }`}
                            >
                                Fan Hub
                            </button>
                            <button
                                type="button"
                                onClick={() => setUserOriginFilter('echoflux')}
                                className={`px-3 py-2 text-xs font-semibold ${
                                    userOriginFilter === 'echoflux'
                                        ? 'bg-indigo-600 text-white dark:bg-indigo-500 dark:text-white'
                                        : 'bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                                }`}
                            >
                                EchoFlux
                            </button>
                        </div>
                        <button
                            onClick={() => setShowAddUserModal(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors font-medium"
                        >
                            <UserPlusIcon />
                            Add User
                        </button>
                        <input 
                            type="text"
                            placeholder="Search by name or email..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full sm:w-64 p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-primary-500 focus:border-primary-500 dark:text-white dark:placeholder-gray-400"
                        />
                    </div>
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
                                
                                // Separate admins, Fan Hub members, and regular EchoFlux users
                                const adminUsers = visibleUsers.filter(user => user.role === 'Admin');
                                const nonAdminUsers = visibleUsers.filter(user => user.role !== 'Admin');
                                const fanHubUsers = nonAdminUsers.filter(user => hasFanHubMembership(user));
                                const echofluxUsers = nonAdminUsers.filter(user => !hasFanHubMembership(user));
                                
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
                                                                                {getUserOriginBadge(user)}
                                                                            </p>
                                                                            <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="p-3">
                                                                    <span className={`px-3 py-1 text-xs font-semibold rounded-full ${planColorMap[getPlanKey(user.plan)]}`}>
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
                                                
                                                {/* Divider between admins and non-admin users */}
                                                {nonAdminUsers.length > 0 && (
                                                    <tr>
                                                        <td colSpan={8} className="p-2 border-t-2 border-gray-300 dark:border-gray-600">
                                                            <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold tracking-wide text-center">
                                                                ADMIN SECTION END
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </>
                                        )}
                                        
                                        {/* EchoFlux Users Section */}
                                        {echofluxUsers.length > 0 && (
                                            <>
                                                <tr>
                                                    <td colSpan={8} className="p-2 border-t-2 border-gray-300 dark:border-gray-600">
                                                        <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold tracking-wide text-center">
                                                            ECHOFLUX USERS
                                                        </div>
                                                    </td>
                                                </tr>

                                                {echofluxUsers.map((user) => {
                                                    const isWilJackson = user.email === 'wil_jackson@icloud.com';
                                                    
                                                    return (
                                                        <React.Fragment key={user.id}>
                                                            <tr className="border-b border-gray-200 dark:border-gray-700">
                                                                <td className="p-3">
                                                                    <div className="flex items-center space-x-3">
                                                                        <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full"/>
                                                                        <div>
                                                                            <p className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                                                                {user.name}
                                                                                {getUserOriginBadge(user)}
                                                                            </p>
                                                                            <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="p-3">
                                                                    <span className={`px-3 py-1 text-xs font-semibold rounded-full ${planColorMap[getPlanKey(user.plan)]}`}>
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
                                        )}

                                        {/* Fan Hub Members Section (grouped by subscribed creator) */}
                                        {(fanHubUsers.length > 0 || membershipOnlyFanRows.length > 0) && (
                                            <>
                                                <tr className="bg-cyan-50/60 dark:bg-cyan-900/20">
                                                    <td colSpan={8} className="p-3 border-t-2 border-cyan-300 dark:border-cyan-700">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="text-xs font-semibold text-cyan-800 dark:text-cyan-200 tracking-wide">
                                                                FAN HUB MEMBERS
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setShowFanHubMembersSection((prev) => !prev)}
                                                                    className="px-2.5 py-1 text-[11px] font-semibold rounded-md border border-cyan-300 dark:border-cyan-700 bg-cyan-50 text-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-200 hover:bg-cyan-100 dark:hover:bg-cyan-900/30"
                                                                >
                                                                    {showFanHubMembersSection ? 'Hide members' : 'Show members'}
                                                                </button>
                                                                <div className="inline-flex rounded-md border border-cyan-300 dark:border-cyan-700 overflow-hidden">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setFanHubMemberViewMode('grouped')}
                                                                        className={`px-2.5 py-1 text-[11px] font-semibold ${
                                                                            fanHubMemberViewMode === 'grouped'
                                                                                ? 'bg-cyan-700 text-white dark:bg-cyan-500'
                                                                                : 'bg-cyan-50 text-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-200'
                                                                        }`}
                                                                    >
                                                                        Grouped by creator
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setFanHubMemberViewMode('deduped')}
                                                                        className={`px-2.5 py-1 text-[11px] font-semibold ${
                                                                            fanHubMemberViewMode === 'deduped'
                                                                                ? 'bg-cyan-700 text-white dark:bg-cyan-500'
                                                                                : 'bg-cyan-50 text-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-200'
                                                                        }`}
                                                                    >
                                                                        Deduped by fan
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {showFanHubMembersSection ? (() => {
                                                    const grouped = new Map<string, { creatorName: string; rows: Array<{ user: User; membership: FanMembershipLink; membershipCount: number }> }>();
                                                    const unassigned: Array<User> = [];
                                                    const dedupedRows: Array<{
                                                        user: User;
                                                        memberships: FanMembershipLink[];
                                                        purchaseCount: number;
                                                        purchasesCents: number;
                                                        tipCount: number;
                                                        tipsCents: number;
                                                    }> = [];

                                                    fanHubUsers.forEach((user) => {
                                                        const memberships = getFanHubMembershipsForUser(user);
                                                        if (memberships.length === 0) {
                                                            unassigned.push(user);
                                                            return;
                                                        }
                                                        dedupedRows.push({
                                                            user,
                                                            memberships,
                                                            purchaseCount: memberships.reduce((acc: number, m: FanMembershipLink) => acc + (m.purchaseCount || 0), 0),
                                                            purchasesCents: memberships.reduce((acc: number, m: FanMembershipLink) => acc + (m.purchasesCents || 0), 0),
                                                            tipCount: memberships.reduce((acc: number, m: FanMembershipLink) => acc + (m.tipCount || 0), 0),
                                                            tipsCents: memberships.reduce((acc: number, m: FanMembershipLink) => acc + (m.tipsCents || 0), 0),
                                                        });
                                                        memberships.forEach((membership: FanMembershipLink) => {
                                                            const creatorId = membership.creatorId || 'unknown_creator';
                                                            const group: { creatorName: string; rows: Array<{ user: User; membership: FanMembershipLink; membershipCount: number }> } =
                                                                grouped.get(creatorId) || { creatorName: membership.creatorName || 'Unknown Creator', rows: [] };
                                                            group.rows.push({ user, membership, membershipCount: memberships.length });
                                                            grouped.set(creatorId, group);
                                                        });
                                                    });

                                                    const creatorSections = Array.from(grouped.entries())
                                                        .map(([creatorId, payload]) => ({ creatorId, ...payload }))
                                                        .sort((a, b) => a.creatorName.localeCompare(b.creatorName));
                                                    dedupedRows.sort((a, b) => a.user.name.localeCompare(b.user.name));

                                                    return (
                                                        <>
                                                            {fanHubMemberViewMode === 'grouped' ? (
                                                                <>
                                                                    {creatorSections.map((section) => (
                                                                        <React.Fragment key={`fanhub-section-${section.creatorId}`}>
                                                                            <tr className="bg-cyan-100/70 dark:bg-cyan-900/30">
                                                                                <td colSpan={8} className="p-2 border-t border-cyan-300 dark:border-cyan-800">
                                                                                    <div className="flex items-center justify-between gap-2">
                                                                                        <div className="text-xs font-semibold text-cyan-800 dark:text-cyan-200 tracking-wide">
                                                                                            {section.creatorName} ({section.rows.length})
                                                                                        </div>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() =>
                                                                                                setCollapsedFanHubCreators((prev) => ({
                                                                                                    ...prev,
                                                                                                    [section.creatorId]: !prev[section.creatorId],
                                                                                                }))
                                                                                            }
                                                                                            className="px-2 py-1 text-[11px] font-semibold rounded-md border border-cyan-300 dark:border-cyan-700 text-cyan-800 dark:text-cyan-200 hover:bg-cyan-50 dark:hover:bg-cyan-900/30"
                                                                                        >
                                                                                            {collapsedFanHubCreators[section.creatorId] ? 'Show members' : 'Hide members'}
                                                                                        </button>
                                                                                    </div>
                                                                                </td>
                                                                            </tr>
                                                                            {!collapsedFanHubCreators[section.creatorId] && (
                                                                                <tr>
                                                                                    <td colSpan={8} className="p-0 border-b border-cyan-200 dark:border-cyan-900/40">
                                                                                        <div className="overflow-x-auto">
                                                                                            <table className="w-full text-left min-w-[860px] bg-cyan-50/20 dark:bg-cyan-900/10">
                                                                                                <thead className="bg-cyan-50 dark:bg-cyan-900/20">
                                                                                                    <tr>
                                                                                                        <th className="p-3 text-xs font-semibold text-cyan-800 dark:text-cyan-200">Member</th>
                                                                                                        <th className="p-3 text-xs font-semibold text-cyan-800 dark:text-cyan-200">Subscription Price</th>
                                                                                                        <th className="p-3 text-xs font-semibold text-cyan-800 dark:text-cyan-200">Purchases</th>
                                                                                                        <th className="p-3 text-xs font-semibold text-cyan-800 dark:text-cyan-200">Tips</th>
                                                                                                        <th className="p-3 text-xs font-semibold text-cyan-800 dark:text-cyan-200">Status</th>
                                                                                                        <th className="p-3 text-xs font-semibold text-cyan-800 dark:text-cyan-200">Actions</th>
                                                                                                    </tr>
                                                                                                </thead>
                                                                                                <tbody>
                                                                                                    {section.rows.map(({ user, membership, membershipCount }) => (
                                                                                                        <tr key={`fanhub-${section.creatorId}-${user.id}`} className="border-t border-cyan-100 dark:border-cyan-900/30">
                                                                                                            <td className="p-3">
                                                                                                                <div className="flex items-center space-x-3">
                                                                                                                    <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full"/>
                                                                                                                    <div>
                                                                                                                        <p className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                                                                                                            {user.name}
                                                                                                                            {getUserOriginBadge(user)}
                                                                                                                        </p>
                                                                                                                        <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                                                                                                                        {membershipCount > 1 && (
                                                                                                                            <p className="text-[11px] text-cyan-700 dark:text-cyan-300 font-medium">
                                                                                                                                Also subscribed to {membershipCount - 1} other creator{membershipCount > 2 ? 's' : ''}
                                                                                                                            </p>
                                                                                                                        )}
                                                                                                                    </div>
                                                                                                                </div>
                                                                                                            </td>
                                                                                                            <td className="p-3 text-sm font-semibold text-gray-800 dark:text-gray-200">
                                                                                                                {membership.membershipType === 'free' ? 'Free' : formatUsdFromCents(membership.subscriptionPriceCents)}
                                                                                                            </td>
                                                                                                            <td className="p-3 text-sm text-gray-700 dark:text-gray-300">
                                                                                                                {membership.purchaseCount} · {formatUsdFromCents(membership.purchasesCents)}
                                                                                                            </td>
                                                                                                            <td className="p-3 text-sm text-gray-700 dark:text-gray-300">
                                                                                                                {membership.tipCount} · {formatUsdFromCents(membership.tipsCents)}
                                                                                                            </td>
                                                                                                            <td className="p-3">
                                                                                                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                                                                                                    membership.status === 'free'
                                                                                                                        ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-200'
                                                                                                                        : membership.status === 'active' || membership.status === 'trialing'
                                                                                                                            ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200'
                                                                                                                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200'
                                                                                                                }`}>
                                                                                                                    {membership.status || 'unknown'}
                                                                                                                </span>
                                                                                                            </td>
                                                                                                            <td className="p-3">
                                                                                                                <div className="flex gap-2">
                                                                                                                    <button onClick={() => setEditingUser(user)} className="px-3 py-1 text-sm font-medium text-cyan-700 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 rounded-md">
                                                                                                                        Manage
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
                                                                                                    ))}
                                                                                                </tbody>
                                                                                            </table>
                                                                                        </div>
                                                                                    </td>
                                                                                </tr>
                                                                            )}
                                                                        </React.Fragment>
                                                                    ))}
                                                                </>
                                                            ) : (
                                                                <tr>
                                                                    <td colSpan={8} className="p-0 border-b border-cyan-200 dark:border-cyan-900/40">
                                                                        <div className="overflow-x-auto">
                                                                            <table className="w-full text-left min-w-[980px] bg-cyan-50/20 dark:bg-cyan-900/10">
                                                                                <thead className="bg-cyan-50 dark:bg-cyan-900/20">
                                                                                    <tr>
                                                                                        <th className="p-3 text-xs font-semibold text-cyan-800 dark:text-cyan-200">Member</th>
                                                                                        <th className="p-3 text-xs font-semibold text-cyan-800 dark:text-cyan-200">Creators</th>
                                                                                        <th className="p-3 text-xs font-semibold text-cyan-800 dark:text-cyan-200">Subscriptions</th>
                                                                                        <th className="p-3 text-xs font-semibold text-cyan-800 dark:text-cyan-200">Purchases</th>
                                                                                        <th className="p-3 text-xs font-semibold text-cyan-800 dark:text-cyan-200">Tips</th>
                                                                                        <th className="p-3 text-xs font-semibold text-cyan-800 dark:text-cyan-200">Actions</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    {dedupedRows.map((row) => (
                                                                                        <tr key={`fanhub-deduped-${row.user.id}`} className="border-t border-cyan-100 dark:border-cyan-900/30">
                                                                                            <td className="p-3">
                                                                                                <div className="flex items-center space-x-3">
                                                                                                    <img src={row.user.avatar} alt={row.user.name} className="w-10 h-10 rounded-full"/>
                                                                                                    <div>
                                                                                                        <p className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                                                                                            {row.user.name}
                                                                                                            {getUserOriginBadge(row.user)}
                                                                                                        </p>
                                                                                                        <p className="text-sm text-gray-500 dark:text-gray-400">{row.user.email}</p>
                                                                                                    </div>
                                                                                                </div>
                                                                                            </td>
                                                                                            <td className="p-3 text-sm text-gray-700 dark:text-gray-300">
                                                                                                <div className="flex flex-wrap gap-1.5">
                                                                                                    {row.memberships.map((m) => (
                                                                                                        <span key={`chip-${row.user.id}-${m.creatorId}`} className="px-2 py-0.5 rounded-full text-[11px] bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-200">
                                                                                                            {m.creatorName}
                                                                                                        </span>
                                                                                                    ))}
                                                                                                </div>
                                                                                            </td>
                                                                                            <td className="p-3 text-sm text-gray-700 dark:text-gray-300">
                                                                                                {row.memberships.length} active
                                                                                            </td>
                                                                                            <td className="p-3 text-sm text-gray-700 dark:text-gray-300">
                                                                                                {row.purchaseCount} · {formatUsdFromCents(row.purchasesCents)}
                                                                                            </td>
                                                                                            <td className="p-3 text-sm text-gray-700 dark:text-gray-300">
                                                                                                {row.tipCount} · {formatUsdFromCents(row.tipsCents)}
                                                                                            </td>
                                                                                            <td className="p-3">
                                                                                                <div className="flex gap-2">
                                                                                                    <button onClick={() => setEditingUser(row.user)} className="px-3 py-1 text-sm font-medium text-cyan-700 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 rounded-md">
                                                                                                        Manage
                                                                                                    </button>
                                                                                                    <button
                                                                                                        onClick={() => handleDeleteUser(row.user)}
                                                                                                        className="px-3 py-1 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md flex items-center gap-1"
                                                                                                        title="Delete User"
                                                                                                    >
                                                                                                        <TrashIcon className="w-4 h-4" />
                                                                                                        Delete
                                                                                                    </button>
                                                                                                </div>
                                                                                            </td>
                                                                                        </tr>
                                                                                    ))}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                            {unassigned.length > 0 && (
                                                                <>
                                                                    <tr className="bg-cyan-100/40 dark:bg-cyan-900/20">
                                                                        <td colSpan={8} className="p-2 border-t border-cyan-300 dark:border-cyan-800">
                                                                            <div className="text-xs font-semibold text-cyan-800 dark:text-cyan-200 tracking-wide">
                                                                                UNASSIGNED FAN HUB MEMBERS (no active subscription found)
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                    {unassigned.map((user) => (
                                                                        <tr key={`fanhub-unassigned-${user.id}`} className="border-b border-gray-200 dark:border-gray-700 bg-cyan-50/20 dark:bg-cyan-900/10">
                                                                            <td className="p-3" colSpan={7}>
                                                                                <div className="flex items-center space-x-3">
                                                                                    <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full"/>
                                                                                    <div>
                                                                                        <p className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                                                                            {user.name}
                                                                                            {getUserOriginBadge(user)}
                                                                                        </p>
                                                                                        <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                                                                                        <p className="text-[11px] text-cyan-700 dark:text-cyan-300">
                                                                                            No active creator membership link found yet.
                                                                                        </p>
                                                                                    </div>
                                                                                </div>
                                                                            </td>
                                                                            <td className="p-3">
                                                                                <div className="flex gap-2">
                                                                                    <button onClick={() => setEditingUser(user)} className="px-3 py-1 text-sm font-medium text-cyan-700 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 rounded-md">
                                                                                        Manage
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
                                                                    ))}
                                                                </>
                                                            )}
                                                            {membershipOnlyFanRows.length > 0 && (
                                                                <>
                                                                    <tr className="bg-cyan-100/40 dark:bg-cyan-900/20">
                                                                        <td colSpan={8} className="p-2 border-t border-cyan-300 dark:border-cyan-800">
                                                                            <div className="flex items-center justify-between gap-2">
                                                                                <div className="text-xs font-semibold text-cyan-800 dark:text-cyan-200 tracking-wide">
                                                                                    FAN HUB SUBSCRIBERS (membership records without EchoFlux user profile)
                                                                                </div>
                                                                                <div className="flex items-center gap-2">
                                                                                    {isLoadingAllFanHubMemberships && fanHubSubscriberFilter === 'all' ? (
                                                                                        <span className="text-[11px] text-cyan-700 dark:text-cyan-300">Loading…</span>
                                                                                    ) : null}
                                                                                    <select
                                                                                        value={fanHubSubscriberFilter}
                                                                                        onChange={(e) =>
                                                                                            setFanHubSubscriberFilter(
                                                                                                e.target.value === 'all' ? 'all' : 'active'
                                                                                            )
                                                                                        }
                                                                                        className="px-2 py-1 rounded-md border border-cyan-300 dark:border-cyan-700 bg-white dark:bg-gray-800 text-[11px] font-semibold text-cyan-800 dark:text-cyan-200"
                                                                                        title="Subscriber visibility filter"
                                                                                    >
                                                                                        <option value="active">Active only</option>
                                                                                        <option value="all">Include canceled/expired</option>
                                                                                    </select>
                                                                                </div>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                    <tr>
                                                                        <td colSpan={8} className="p-0 border-b border-cyan-200 dark:border-cyan-900/40">
                                                                            <div className="overflow-x-auto">
                                                                                <table className="w-full text-left min-w-[1200px] bg-cyan-50/20 dark:bg-cyan-900/10">
                                                                                    <thead className="bg-cyan-50 dark:bg-cyan-900/20">
                                                                                        <tr>
                                                                                            <th className="p-3 text-xs font-semibold text-cyan-800 dark:text-cyan-200">Subscriber</th>
                                                                                            <th className="p-3 text-xs font-semibold text-cyan-800 dark:text-cyan-200">Signup Date</th>
                                                                                            <th className="p-3 text-xs font-semibold text-cyan-800 dark:text-cyan-200">Remaining Access</th>
                                                                                            <th className="p-3 text-xs font-semibold text-cyan-800 dark:text-cyan-200">Total Spend</th>
                                                                                            <th className="p-3 text-xs font-semibold text-cyan-800 dark:text-cyan-200">Store</th>
                                                                                            <th className="p-3 text-xs font-semibold text-cyan-800 dark:text-cyan-200">Tips</th>
                                                                                            <th className="p-3 text-xs font-semibold text-cyan-800 dark:text-cyan-200">Unlocks</th>
                                                                                            <th className="p-3 text-xs font-semibold text-cyan-800 dark:text-cyan-200">Creators</th>
                                                                                        </tr>
                                                                                    </thead>
                                                                                    <tbody>
                                                                                        {membershipOnlyFanRows.map((row) => {
                                                                                            const memberships = row.memberships;
                                                                                            const totalSpendCents = memberships.reduce((acc, m) => {
                                                                                                const explicit = Number(m.totalSpentCents || 0);
                                                                                                return acc + (Number.isFinite(explicit) && explicit > 0
                                                                                                    ? explicit
                                                                                                    : (Number(m.purchasesCents || 0) + Number(m.tipsCents || 0)));
                                                                                            }, 0);
                                                                                            const tipsCents = memberships.reduce((acc, m) => acc + Number(m.tipsCents || 0), 0);
                                                                                            const storeCents = memberships.reduce((acc, m) => acc + Number(m.purchasesCents || 0), 0);
                                                                                            const unlocksCents = 0; // Not currently stored separately on membership rows.
                                                                                            const creators = [...new Set(memberships.map((m) => (m.creatorName || '').trim() || 'Unknown Creator'))];

                                                                                            return (
                                                                                                <tr key={`fanhub-membership-only-${row.fanKey}`} className="border-t border-cyan-100 dark:border-cyan-900/30">
                                                                                                    <td className="p-3">
                                                                                                        <div className="flex items-center space-x-3">
                                                                                                            <div className="w-10 h-10 rounded-full bg-cyan-200 dark:bg-cyan-800 text-cyan-900 dark:text-cyan-100 flex items-center justify-center font-bold text-sm">
                                                                                                                {row.displayName.slice(0, 1).toUpperCase()}
                                                                                                            </div>
                                                                                                            <div>
                                                                                                                <p className="font-bold text-gray-900 dark:text-white">
                                                                                                                    {row.displayName}
                                                                                                                    {row.username ? (
                                                                                                                        <span className="ml-2 text-xs font-semibold text-cyan-700 dark:text-cyan-300">{row.username}</span>
                                                                                                                    ) : null}
                                                                                                                </p>
                                                                                                                <p className="text-sm text-gray-500 dark:text-gray-400">{row.email || 'Fan Hub member profile'}</p>
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    </td>
                                                                                                    <td className="p-3 text-sm text-gray-700 dark:text-gray-300">{getMembershipOnlySignupDate(memberships)}</td>
                                                                                                    <td className="p-3 text-sm text-gray-700 dark:text-gray-300">{getMembershipOnlyRemainingAccessLabel(memberships)}</td>
                                                                                                    <td className="p-3 text-sm text-gray-700 dark:text-gray-300">{formatUsdFromCents(totalSpendCents)}</td>
                                                                                                    <td className="p-3 text-sm text-gray-700 dark:text-gray-300">{formatUsdFromCents(storeCents)}</td>
                                                                                                    <td className="p-3 text-sm text-gray-700 dark:text-gray-300">{formatUsdFromCents(tipsCents)}</td>
                                                                                                    <td className="p-3 text-sm text-gray-700 dark:text-gray-300">{formatUsdFromCents(unlocksCents)}</td>
                                                                                                    <td className="p-3 text-sm text-gray-700 dark:text-gray-300">{creators.join(', ')}</td>
                                                                                                </tr>
                                                                                            );
                                                                                        })}
                                                                                    </tbody>
                                                                                </table>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                </>
                                                            )}
                                                        </>
                                                    );
                                                })() : (
                                                    <tr className="bg-cyan-50/20 dark:bg-cyan-900/10">
                                                        <td colSpan={8} className="p-3 text-xs text-cyan-800 dark:text-cyan-200 border-b border-cyan-200 dark:border-cyan-900/40">
                                                            Fan Hub members are hidden. Click "Show members" to expand.
                                                        </td>
                                                    </tr>
                                                )}
                                            </>
                                        )}

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