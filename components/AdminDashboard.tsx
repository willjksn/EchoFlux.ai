
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
import { TeamIcon, DollarSignIcon, UserPlusIcon, ArrowUpCircleIcon, ImageIcon, VideoIcon, LockIcon, TrendingIcon, TrashIcon, HeartIcon, StarIcon, ChatIcon, GlobeIcon, SparklesIcon } from './icons/UIIcons';
import { db, auth } from '../firebaseConfig';
import { collection, query, orderBy, onSnapshot, setDoc, doc, getDoc, deleteField, getDocs } from 'firebase/firestore';
import { useAppContext } from './AppContext';
import { defaultSettings, ECHOFLUX_CREATOR_ELITE_INVITE_USD, ECHOFLUX_CREATOR_PRO_INVITE_USD } from '../constants';
import { getModelUsageAnalytics, type ModelUsageStats } from '../src/services/modelUsageService';
import { hasActiveStripeEchofluxSubscription } from '../src/lib/echofluxStripeMrr';
import { safeUsernameForHandle } from '../src/lib/fanHubDisplay';

/** Gemini text models always listed in Requests by Model (0 when unused) so 2.5 / 2.0 / 1.5 show like other rows. */
const GEMINI_TEXT_MODEL_DISPLAY_ORDER = [
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
] as const;

function buildRequestsByModelRows(requestsByModel: Record<string, number>): [string, number][] {
    const geminiRows: [string, number][] = GEMINI_TEXT_MODEL_DISPLAY_ORDER.map((id) => [
        id,
        requestsByModel[id] ?? 0,
    ]);
    const otherRows = Object.entries(requestsByModel)
        .filter(([k]) => !(GEMINI_TEXT_MODEL_DISPLAY_ORDER as readonly string[]).includes(k))
        .sort((a, b) => b[1] - a[1]);
    return [...geminiRows, ...otherRows];
}

/** Admin live-stream table status column — matches Model Usage Analytics color language */
const LIVE_STREAM_STATUS_BADGE: Record<string, string> = {
    live: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/45 dark:text-emerald-100 ring-1 ring-emerald-300/60 dark:ring-emerald-600/50",
    scheduled:
        "bg-blue-100 text-blue-900 dark:bg-blue-900/45 dark:text-blue-100 ring-1 ring-blue-300/60 dark:ring-blue-600/50",
    ended: "bg-slate-200 text-slate-800 dark:bg-slate-600/55 dark:text-slate-100 ring-1 ring-slate-300/50 dark:ring-slate-500/40",
    cancelled: "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100 ring-1 ring-rose-300/60 dark:ring-rose-700/40",
    draft: "bg-amber-100 text-amber-950 dark:bg-amber-900/35 dark:text-amber-100 ring-1 ring-amber-300/50 dark:ring-amber-700/35",
    other: "bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100 ring-1 ring-violet-300/60 dark:ring-violet-700/40",
};

function liveStreamStatusBadgeClass(status: string): string {
    const k = status.trim().toLowerCase();
    return LIVE_STREAM_STATUS_BADGE[k] ?? LIVE_STREAM_STATUS_BADGE.other!;
}

// Fallback sample stats so the admin overview is visible even if the analytics
// API is unreachable locally. These reflect the deployment numbers the user described.
const DEFAULT_MODEL_USAGE_STATS: ModelUsageStats = {
    totalRequests: 656,
    totalCost: 0.01,
    averageCostPerRequest: 0.0000157,
    errorRate: 2.0,
    adImageCostsByModel: {},
    adVideoCostsByModel: {},
    adImageRequestsByModel: {},
    adVideoRequestsByModel: {},
    requestsByModel: {
        'gemini-2.5-flash': 12,
        'gemini-2.5-flash-lite': 8,
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

function currentCalendarMonthKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Caption counts in Firestore are per calendar month; user doc is synced on each generation. */
function adminCaptionUsedThisMonth(user: User): number {
    const cur = currentCalendarMonthKey();
    const m = user.captionUsageMonth;
    if (m === cur) return user.monthlyCaptionGenerationsUsed ?? 0;
    if (m == null || m === "") return user.monthlyCaptionGenerationsUsed ?? 0;
    return 0;
}

function adminCaptionMonthlyLimit(plan: User["plan"] | null): number {
    if (!plan) return 0;
    if (plan === "Free") return 10;
    if (plan === "Pro") return 500;
    if (plan === "Elite" || plan === "OnlyFansStudio") return 1500;
    if (plan === "Agency") return 10000;
    return 0;
}

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
    CreatorPro: 'bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100 ring-1 ring-green-400/40',
    CreatorElite: 'bg-purple-100 text-purple-900 dark:bg-purple-900/40 dark:text-purple-100 ring-1 ring-purple-400/40',
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
    /** Invite-only Stripe prices (monthly); mirrors `ECHOFLUX_*_INVITE_USD` in constants.ts */
    CreatorPro: ECHOFLUX_CREATOR_PRO_INVITE_USD,
    CreatorElite: ECHOFLUX_CREATOR_ELITE_INVITE_USD,
};
function normalizeAdminCreatorGroupKey(raw: string | null | undefined): string {
    const id = String(raw || "").trim();
    if (!id) return "";
    const idx = id.indexOf("--collection=");
    if (idx >= 0) return id.slice(0, idx).trim();
    return id;
}

function fanMembershipStatusRank(status: string | null | undefined): number {
    const s = String(status || "").toLowerCase().trim();
    if (s === "active") return 5;
    if (s === "trialing") return 4;
    if (s === "past_due") return 3;
    if (s === "free") return 2;
    if (s === "canceled" || s === "cancelled" || s === "unpaid") return 1;
    return 0;
}

/** Mirrors `ACTIVE_STATUSES` in `api/adminFanHubMemberships.ts` (paid/free access–like rows). */
const ADMIN_FAN_SUB_ACTIVE_STATUSES = new Set(["active", "trialing", "free", "past_due"]);

function adminFanHubSubscriptionRowIsActive(m: { status: string }): boolean {
    const s = String(m.status || "").toLowerCase().trim();
    return ADMIN_FAN_SUB_ACTIVE_STATUSES.has(s);
}

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

function adminUserDisplayLabel(user: {
    name?: string | null;
    email?: string | null;
    username?: string | null;
    handle?: string | null;
    memberUsername?: string | null;
}): string {
    const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
    const nameRaw = typeof user.name === 'string' ? user.name.trim() : '';
    const nameLower = nameRaw.toLowerCase();
    const nameLooksPlaceholder =
        !nameRaw ||
        nameLower === 'new user' ||
        nameLower === 'member' ||
        nameLower === 'user' ||
        (email && nameLower === email);
    if (!nameLooksPlaceholder) return nameRaw;

    const username = safeUsernameForHandle(
        user.username || user.handle || user.memberUsername
    );
    if (username) return username;

    const emailLocal = email && email.includes('@') ? email.split('@')[0].trim() : '';
    if (emailLocal) return emailLocal;
    return nameRaw || 'User';
}

type FanHubMemberProfile = {
    displayName: string | null;
    email: string | null;
    username: string | null;
    photoURL?: string | null;
};

/** Prefer storefront fan doc display name over stale `users` placeholders like "New User". */
function fanHubMemberTableLabel(user: User, profile: FanHubMemberProfile | undefined): string {
    const fromFan = profile?.displayName?.trim();
    if (fromFan && !/^new user$/i.test(fromFan)) return fromFan;
    return adminUserDisplayLabel({
        name: user.name,
        email: user.email,
        username: profile?.username || undefined,
        handle: profile?.username || undefined,
        memberUsername: profile?.username || undefined,
    });
}

function isUnknownCreatorChipName(name: string | null | undefined): boolean {
    return !name?.trim() || /^unknown creator$/i.test(name.trim());
}

/**
 * One chip per creator; drops duplicate names/ids. Omits "Unknown Creator" whenever at least one
 * resolved creator name exists so counts match what a fan actually follows.
 */
function membershipChipsForDisplay(links: FanMembershipLink[]): FanMembershipLink[] {
    const out: FanMembershipLink[] = [];
    const seen = new Set<string>();
    for (const m of links) {
        const name = (m.creatorName || "").trim().toLowerCase();
        const key =
            name && name !== "unknown creator"
                ? `n:${name}`
                : `id:${normalizeAdminCreatorGroupKey(m.creatorId) || String(m.creatorHandle || "").toLowerCase() || "x"}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(m);
    }
    const known = out.filter((m) => !isUnknownCreatorChipName(m.creatorName));
    if (known.length > 0) return known;
    return [];
}

/** Dedupe Fan Hub membership links by creator (same rules as Fan Buyer Summary table). */
function dedupeFanMembershipLinksByCreator(links: FanMembershipLink[]): FanMembershipLink[] {
    const dedupedByCreator = new Map<string, FanMembershipLink>();
    links.forEach((membership) => {
        const normalizedCreatorId = normalizeAdminCreatorGroupKey(membership.creatorId);
        const key =
            normalizedCreatorId ||
            (membership.creatorHandle ? `handle:${membership.creatorHandle}` : "") ||
            `name:${(membership.creatorName || "").trim().toLowerCase()}`;
        const existing = dedupedByCreator.get(key);
        if (!existing) {
            dedupedByCreator.set(key, {
                ...membership,
                creatorId: normalizedCreatorId || membership.creatorId,
            });
            return;
        }
        const chosen =
            fanMembershipStatusRank(membership.status) > fanMembershipStatusRank(existing.status) ? membership : existing;
        dedupedByCreator.set(key, {
            ...chosen,
            creatorId: normalizedCreatorId || chosen.creatorId,
            purchaseCount: Math.max(existing.purchaseCount || 0, membership.purchaseCount || 0),
            purchasesCents: Math.max(existing.purchasesCents || 0, membership.purchasesCents || 0),
            tipCount: Math.max(existing.tipCount || 0, membership.tipCount || 0),
            tipsCents: Math.max(existing.tipsCents || 0, membership.tipsCents || 0),
            totalSpentCents: Math.max(existing.totalSpentCents || 0, membership.totalSpentCents || 0),
            subscriptionPriceCents: Math.max(
                existing.subscriptionPriceCents || 0,
                membership.subscriptionPriceCents || 0,
            ),
        });
    });
    return Array.from(dedupedByCreator.values());
}

function aggregateBuyerRowFromMemberships(memberships: FanMembershipLink[]) {
    return {
        purchaseCount: memberships.reduce((acc, m) => acc + (m.purchaseCount || 0), 0),
        purchasesCents: memberships.reduce((acc, m) => acc + (m.purchasesCents || 0), 0),
        tipCount: memberships.reduce((acc, m) => acc + (m.tipCount || 0), 0),
        tipsCents: memberships.reduce((acc, m) => acc + (m.tipsCents || 0), 0),
    };
}

function placeholderUserForFanBuyerSummary(fanKey: string, profile: FanHubMemberProfile | undefined): User {
    const email =
        (profile?.email && profile.email.trim().toLowerCase()) ||
        (fanKey.includes("@") ? fanKey.trim().toLowerCase() : "");
    const name =
        (profile?.displayName && profile.displayName.trim()) ||
        adminUserDisplayLabel({
            name: "",
            email: email || undefined,
            username: profile?.username ?? undefined,
            handle: profile?.username ?? undefined,
            memberUsername: profile?.username ?? undefined,
        });
    const id = `fanhub-summary:${fanKey.replace(/[^a-zA-Z0-9@._-]/g, "_")}`;
    return {
        id,
        name: name || fanKey,
        email: email || "—",
        avatar: `https://picsum.photos/seed/${encodeURIComponent(id)}/100/100`,
        bio: "",
        plan: null,
        role: "User",
        signupDate: new Date(0).toISOString(),
        notifications: { newMessages: true, weeklySummary: false, trendAlerts: false },
        monthlyCaptionGenerationsUsed: 0,
        monthlyImageGenerationsUsed: 0,
        monthlyVideoGenerationsUsed: 0,
        storageUsed: 0,
        storageLimit: 0,
        mediaLibrary: [],
        settings: defaultSettings,
        accountOrigin: "fan_hub",
    };
}

type FanBuyerSummaryRowState = {
    user: User;
    memberships: FanMembershipLink[];
    directoryOnly: boolean;
    purchaseCount: number;
    purchasesCents: number;
    tipCount: number;
    tipsCents: number;
    /** Fan Hub index key(s) merged into this row (server-resolved roster). */
    fanIndexKeys?: string[];
};

const ADMIN_ROSTER_UID_RE = /^[A-Za-z0-9]{20,36}$/;

type CreatorHubRosterRow = {
    id: string;
    email: string;
    displayName: string;
    subscriptionStatus: string | null;
    totalSpentCents: number;
};

/**
 * Add fans from adminFanHubMemberships so the expandable roster stays aligned with the Fan Buyer Summary
 * when Firestore fan docs are missing or keyed differently than the membership index.
 */
function augmentCreatorHubRosterRows(
    apiRows: CreatorHubRosterRow[],
    creatorUserId: string,
    membershipsByFan: Record<string, FanMembershipLink[]>,
    profilesByFan: Record<string, FanHubMemberProfile>,
    directoryUsers: User[],
): CreatorHubRosterRow[] {
    const normCreator = normalizeAdminCreatorGroupKey(creatorUserId);
    if (!normCreator) return apiRows;

    const byDedupe = new Map<string, CreatorHubRosterRow>();

    const dedupeKeyForRow = (r: CreatorHubRosterRow): string => {
        const em = r.email.trim().toLowerCase();
        if (ADMIN_ROSTER_UID_RE.test(r.id)) return `uid:${r.id}`;
        if (em && em !== "—") return `email:${em}`;
        return `id:${r.id}`;
    };

    const upsertRow = (r: CreatorHubRosterRow) => {
        const k = dedupeKeyForRow(r);
        const prev = byDedupe.get(k);
        if (!prev) {
            byDedupe.set(k, { ...r });
            return;
        }
        if (prev.email === "—" && r.email !== "—") prev.email = r.email;
        if ((prev.displayName === "—" || !prev.displayName) && r.displayName !== "—") prev.displayName = r.displayName;
        if (!prev.subscriptionStatus && r.subscriptionStatus) prev.subscriptionStatus = r.subscriptionStatus;
        prev.totalSpentCents = Math.max(prev.totalSpentCents, r.totalSpentCents);
        if (ADMIN_ROSTER_UID_RE.test(r.id) && !ADMIN_ROSTER_UID_RE.test(prev.id)) prev.id = r.id;
    };

    for (const r of apiRows) upsertRow(r);

    for (const [fanKey, links] of Object.entries(membershipsByFan)) {
        if (!Array.isArray(links) || links.length === 0) continue;
        const forCreator = links.filter((m) => normalizeAdminCreatorGroupKey(m.creatorId) === normCreator);
        if (forCreator.length === 0) continue;

        const fk = fanKey.trim();
        const profile =
            profilesByFan[fk] || (fk.includes("@") ? profilesByFan[fk.toLowerCase()] : undefined);
        const userMatch = directoryUsers.find(
            (u) => u.id === fk || (fk.includes("@") && u.email.trim().toLowerCase() === fk.toLowerCase()),
        );

        const best = [...forCreator].sort(
            (a, b) => fanMembershipStatusRank(b.status) - fanMembershipStatusRank(a.status),
        )[0];
        const spent = forCreator.reduce((max, m) => Math.max(max, m.totalSpentCents ?? 0), 0);

        const email =
            (profile?.email && profile.email.trim().toLowerCase()) ||
            (fk.includes("@") ? fk.toLowerCase() : "") ||
            userMatch?.email?.trim().toLowerCase() ||
            "—";
        const displayName =
            (profile?.displayName && profile.displayName.trim()) ||
            (userMatch?.name && userMatch.name.trim()) ||
            (email !== "—" ? email.split("@")[0] : "—");
        const rowId = ADMIN_ROSTER_UID_RE.test(fk) ? fk : email !== "—" ? email : `key:${fk}`;

        upsertRow({
            id: rowId,
            email: email || "—",
            displayName: displayName || "—",
            subscriptionStatus: best?.status ?? null,
            totalSpentCents: spent,
        });
    }

    return Array.from(byDedupe.values()).sort((a, b) => b.totalSpentCents - a.totalSpentCents);
}

type CreatorStorefrontDiagnosticPayload = {
    success: boolean;
    generatedAt?: string;
    creatorsScanned?: number;
    duplicateHandles?: Array<{ normalizedHandle: string; creatorIds: string[]; displayNames: Array<string | null> }>;
    creatorsWithoutUsersDoc?: { total: number; sampleIds: string[]; truncated: boolean };
    creatorHandlesScanned?: number;
    creatorHandlesIssues?: Array<
        | { kind: 'missing_creator'; handleKey: string; creatorId: string }
        | { kind: 'handle_mismatch'; handleKey: string; creatorId: string; creatorDocHandle: string }
    >;
    creatorHandlesIssuesTruncated?: boolean;
    error?: string;
};

export const AdminDashboard: React.FC = () => {
    const { user: currentUser, showToast, setActivePage } = useAppContext();
    const [users, setUsers] = useState<User[]>([]);
    const [creatorIds, setCreatorIds] = useState<Set<string>>(new Set());
    const [activityFeed, setActivityFeed] = useState<Activity[]>([]);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [grantingRewardToUser, setGrantingRewardToUser] = useState<User | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    /** User Management directory: workspace = EchoFlux accounts; storefront = My Page creators (+ rosters). */
    const [userMgmtView, setUserMgmtView] = useState<'workspace' | 'storefront'>('workspace');
    /** When on workspace view, optionally show the nested Fan Hub buyer / membership summary (old “All” lower section). */
    const [userMgmtShowFanSummary, setUserMgmtShowFanSummary] = useState(false);
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
    const [creatorStorefrontDiag, setCreatorStorefrontDiag] = useState<CreatorStorefrontDiagnosticPayload | null>(null);
    const [creatorStorefrontDiagLoading, setCreatorStorefrontDiagLoading] = useState(false);
    /** When false, hide the long scan output but keep the panel header + run control. */
    const [creatorStorefrontHealthResultsExpanded, setCreatorStorefrontHealthResultsExpanded] = useState(true);

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
    /** Server-built Fan Buyer rows (Firestore users join); null = use client merge fallback. */
    const [fanBuyerRosterFromApi, setFanBuyerRosterFromApi] = useState<FanBuyerSummaryRowState[] | null>(null);
    const [showFanHubMembersSection, setShowFanHubMembersSection] = useState(true);
    /** Admin: expandable `creators/{creatorId}/fans` roster (EchoFlux workspace creators, including dual Fan Hub members). */
    const [adminCreatorRosterOpen, setAdminCreatorRosterOpen] = useState<Record<string, boolean>>({});
    const [adminCreatorRosters, setAdminCreatorRosters] = useState<
        Record<string, Array<{ id: string; email: string; displayName: string; subscriptionStatus: string | null; totalSpentCents: number }>>
    >({});
    const [adminCreatorRosterLoading, setAdminCreatorRosterLoading] = useState<Record<string, boolean>>({});
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
    type AdminLiveStreamsOverview = {
        sampledDocs: number;
        sampleLimit: number;
        sampleTruncated: boolean;
        byStatus: Record<string, number>;
        withDailyRoom: number;
        uniqueCreatorsWithStreams: number;
        ticketsSold30d: number;
        /** Gross fan checkout totals (Stripe); same as ticketGrossCents30d */
        ticketRevenueCents30d: number;
        ticketGrossCents30d?: number;
        /** ~10% application fee typical for Fan Hub; not from Stripe fee field */
        echofluxCommissionEstimateCents30d?: number;
        streamsWithDailyRoomTouched30d?: number;
        estimatedLiveBroadcastParticipantMinutes?: number;
        /** Rough Daily.co cost for fan broadcasts (see API assumptions). */
        estimatedDailyLiveBroadcastCostUsd?: number;
        /** Indicative Firestore read count for this API request (for cost estimate). */
        estimatedFirestoreReads?: number;
        /** ~USD using standard Firestore read pricing; confirm in Google Cloud console. */
        estimatedFirestoreReadCostUsd?: number;
        recent: Array<{
            creatorId: string;
            creatorLabel?: string;
            streamId: string;
            title: string;
            status: string;
            ticketCents: number;
            hasDailyRoom: boolean;
            scheduledStart?: string;
            updatedAtMs: number;
        }>;
    };
    const [liveStreamsOverview, setLiveStreamsOverview] = useState<AdminLiveStreamsOverview | null>(null);
    const [liveStreamsOverviewLoading, setLiveStreamsOverviewLoading] = useState(false);
    const [liveStreamsOverviewError, setLiveStreamsOverviewError] = useState<string | null>(null);
    const [liveStreamRecentMode, setLiveStreamRecentMode] = useState<"5" | "7" | "30" | "90">("5");

    const liveStreamTableRows = useMemo(() => {
        if (!liveStreamsOverview?.recent?.length) return [];
        const rows = liveStreamsOverview.recent;
        if (liveStreamRecentMode === "5") return rows.slice(0, 5);
        const days = liveStreamRecentMode === "7" ? 7 : liveStreamRecentMode === "30" ? 30 : 90;
        const cutoff = Date.now() - days * 86400000;
        return rows.filter((r) => r.updatedAtMs >= cutoff);
    }, [liveStreamsOverview?.recent, liveStreamRecentMode]);
    const [witmeOverview, setWitmeOverview] = useState<{ pageViews: number; uniqueVisitors: number; loading: boolean }>({
        pageViews: 0,
        uniqueVisitors: 0,
        loading: true,
    });
    
    // Reset to page 1 when search term changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, userMgmtView, userMgmtShowFanSummary]);

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
        const fetchLiveStreamsOverview = async () => {
            if (currentUser?.role !== "Admin") return;
            setLiveStreamsOverviewLoading(true);
            setLiveStreamsOverviewError(null);
            try {
                const token = await auth.currentUser?.getIdToken(true);
                if (!token) return;
                const res = await fetch("/api/adminLiveStreamsOverview", {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    setLiveStreamsOverview(null);
                    setLiveStreamsOverviewError(typeof data?.error === "string" ? data.error : "Failed to load live streams overview");
                    return;
                }
                setLiveStreamsOverview(data as AdminLiveStreamsOverview);
            } catch (e) {
                console.error("Failed to fetch live streams overview:", e);
                setLiveStreamsOverviewError("Failed to load live streams overview");
                setLiveStreamsOverview(null);
            } finally {
                setLiveStreamsOverviewLoading(false);
            }
        };
        void fetchLiveStreamsOverview();
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
                    creatorDisplayNames?: Record<string, string>;
                    recentTransactions: Array<{
                        id: string;
                        creatorId: string;
                        type: string;
                        amount: number;
                        timestamp: string;
                    }>;
                };

                const displayByCreatorId = data.creatorDisplayNames ?? {};

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

                const recentTransactions = (data.recentTransactions || []).map((t) => ({
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
            if (currentUser?.role !== 'Admin') {
                setFanBuyerRosterFromApi(null);
                return;
            }
            try {
                const token = await auth.currentUser?.getIdToken(true);
                if (!token) return;
                const res = await fetch('/api/adminFanHubMemberships?activeOnly=0', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) {
                    console.warn('adminFanHubMemberships:', res.status, await res.text());
                    setFanBuyerRosterFromApi(null);
                    return;
                }
                const data = await res.json() as {
                    membershipsByFan?: Record<string, FanMembershipLink[]>;
                    fanProfilesByFanId?: Record<string, FanHubMemberProfile>;
                    buyerRoster?: {
                        rows?: Array<{
                            directoryOnly?: boolean;
                            fanIndexKeys?: string[];
                            user?: Record<string, unknown>;
                            memberships?: FanMembershipLink[];
                            purchaseCount?: number;
                            purchasesCents?: number;
                            tipCount?: number;
                            tipsCents?: number;
                        }>;
                    };
                };
                setFanHubMembershipsByFanId(data.membershipsByFan || {});
                setFanHubMemberProfilesByFanId(data.fanProfilesByFanId || {});
                if (Array.isArray(data.buyerRoster?.rows)) {
                    setFanBuyerRosterFromApi(
                        data.buyerRoster.rows.map((r) => ({
                            user: (r.user || {}) as unknown as User,
                            memberships: Array.isArray(r.memberships) ? r.memberships : [],
                            directoryOnly: !!r.directoryOnly,
                            purchaseCount: Number(r.purchaseCount) || 0,
                            purchasesCents: Number(r.purchasesCents) || 0,
                            tipCount: Number(r.tipCount) || 0,
                            tipsCents: Number(r.tipsCents) || 0,
                            fanIndexKeys: Array.isArray(r.fanIndexKeys) ? r.fanIndexKeys : [],
                        })),
                    );
                } else {
                    setFanBuyerRosterFromApi(null);
                }
            } catch (error) {
                console.warn('Failed to fetch Fan Hub memberships:', error);
                setFanBuyerRosterFromApi(null);
            }
        };
        fetchFanHubMemberships();
    }, [currentUser?.role, users.length]);

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

    const isEchofluxWorkspaceUser = useCallback((user: User): boolean => {
        return (
            user.role === 'Admin' ||
            creatorIds.has(user.id) ||
            hasActiveStripeEchofluxSubscription(user)
        );
    }, [creatorIds]);

    /** Every fan in adminFanHubMemberships plus directory fan_hub accounts (not limited to users in the paginated table). */
    const fanBuyerSummaryBundle = useMemo((): { rows: FanBuyerSummaryRowState[]; unassigned: User[] } => {
        if (userMgmtView !== 'workspace' || !userMgmtShowFanSummary) {
            return { rows: [], unassigned: [] };
        }

        const q = searchTerm.trim().toLowerCase();
        const matchesText = (parts: Array<string | null | undefined>) => {
            if (!q) return true;
            return parts.some((p) => typeof p === 'string' && p.toLowerCase().includes(q));
        };

        const passesWorkspaceDirectory = (u: User) => isEchofluxWorkspaceUser(u) || hasFanHubMembership(u);

        if (fanBuyerRosterFromApi !== null) {
            const filteredRows = fanBuyerRosterFromApi.filter((row) => {
                if (row.user.role === 'Admin') return false;
                const profile =
                    fanHubMemberProfilesByFanId[row.user.id] ||
                    (row.user.email
                        ? fanHubMemberProfilesByFanId[row.user.email.trim().toLowerCase()]
                        : undefined);
                const extra = row.fanIndexKeys ?? [];
                return matchesText([
                    row.user.name,
                    row.user.email,
                    ...extra,
                    profile?.displayName,
                    profile?.email,
                    profile?.username,
                ]);
            });
            const unassigned: User[] = [];
            for (const u of users) {
                if (u.role === 'Admin') continue;
                if (!passesWorkspaceDirectory(u)) continue;
                if (!matchesText([u.name, u.email])) continue;
                if (u.accountOrigin !== 'fan_hub') continue;
                if (getFanHubMembershipsForUser(u).length > 0) continue;
                if (filteredRows.some((r) => r.user.id === u.id)) continue;
                unassigned.push(u);
            }
            unassigned.sort((a, b) => a.name.localeCompare(b.name));
            const rows = [...filteredRows].sort((a, b) => a.user.name.localeCompare(b.user.name));
            return { rows, unassigned };
        }

        const userById = new Map(users.map((u) => [u.id, u] as const));
        const userByEmail = new Map(
            users.filter((x) => x.email).map((x) => [x.email.trim().toLowerCase(), x] as const),
        );

        const resolveUserForFanKey = (fanKey: string, profile: FanHubMemberProfile | undefined): User | null => {
            const direct = userById.get(fanKey);
            if (direct) return direct;
            if (fanKey.includes('@')) {
                const byEm = userByEmail.get(fanKey.trim().toLowerCase());
                if (byEm) return byEm;
            }
            const pe = profile?.email?.trim().toLowerCase();
            if (pe) return userByEmail.get(pe) ?? null;
            return null;
        };

        const rowMap = new Map<string, FanBuyerSummaryRowState>();

        const upsertRow = (dedupeKey: string, candidateUser: User, rawLinks: FanMembershipLink[]) => {
            const prev = rowMap.get(dedupeKey);
            const combinedRaw = prev ? [...prev.memberships, ...rawLinks] : rawLinks;
            const memberships = dedupeFanMembershipLinksByCreator(combinedRaw);
            const agg = aggregateBuyerRowFromMemberships(memberships);
            let user: User;
            if (prev) {
                const prevPh = prev.user.id.startsWith('fanhub-summary:');
                const candPh = candidateUser.id.startsWith('fanhub-summary:');
                if (!candPh) user = candidateUser;
                else if (!prevPh) user = prev.user;
                else user = candidateUser;
            } else {
                user = candidateUser;
            }
            rowMap.set(dedupeKey, {
                user,
                memberships,
                directoryOnly: user.id.startsWith('fanhub-summary:'),
                ...agg,
            });
        };

        for (const fanKey of Object.keys(fanHubMembershipsByFanId)) {
            const rawLinks = fanHubMembershipsByFanId[fanKey];
            if (!Array.isArray(rawLinks) || rawLinks.length === 0) continue;

            const profile =
                fanHubMemberProfilesByFanId[fanKey] ||
                (fanKey.includes('@') ? fanHubMemberProfilesByFanId[fanKey.trim().toLowerCase()] : undefined);

            const resolved = resolveUserForFanKey(fanKey, profile);
            if (resolved?.role === 'Admin') continue;

            if (
                !matchesText([
                    fanKey,
                    profile?.displayName,
                    profile?.email,
                    profile?.username,
                    resolved?.name,
                    resolved?.email,
                ])
            )
                continue;

            const dedupeKey = resolved ? resolved.id : `orphan:${fanKey}`;
            const candidateUser = resolved ?? placeholderUserForFanBuyerSummary(fanKey, profile);
            upsertRow(dedupeKey, candidateUser, rawLinks);
        }

        for (const u of users) {
            if (u.role === 'Admin') continue;
            if (!passesWorkspaceDirectory(u)) continue;
            if (!matchesText([u.name, u.email])) continue;
            const rawLinks = getFanHubMembershipsForUser(u);
            if (rawLinks.length === 0) continue;
            if (rowMap.has(u.id)) {
                const prev = rowMap.get(u.id)!;
                const memberships = dedupeFanMembershipLinksByCreator([...prev.memberships, ...rawLinks]);
                const agg = aggregateBuyerRowFromMemberships(memberships);
                rowMap.set(u.id, {
                    user: u,
                    memberships,
                    directoryOnly: false,
                    ...agg,
                });
                continue;
            }
            const memberships = dedupeFanMembershipLinksByCreator(rawLinks);
            rowMap.set(u.id, {
                user: u,
                memberships,
                directoryOnly: false,
                ...aggregateBuyerRowFromMemberships(memberships),
            });
        }

        const realEmails = new Set(
            [...rowMap.values()]
                .filter((r) => !r.directoryOnly && r.user.email && r.user.email !== '—')
                .map((r) => r.user.email.trim().toLowerCase()),
        );
        for (const [k, row] of [...rowMap.entries()]) {
            if (!k.startsWith('orphan:')) continue;
            const em = row.user.email?.trim().toLowerCase();
            if (em && em !== '—' && realEmails.has(em)) rowMap.delete(k);
        }

        const unassigned: User[] = [];
        for (const u of users) {
            if (u.role === 'Admin') continue;
            if (!passesWorkspaceDirectory(u)) continue;
            if (!matchesText([u.name, u.email])) continue;
            if (u.accountOrigin !== 'fan_hub') continue;
            if (getFanHubMembershipsForUser(u).length > 0) continue;
            if (rowMap.has(u.id)) continue;
            unassigned.push(u);
        }
        unassigned.sort((a, b) => a.name.localeCompare(b.name));

        const rows = [...rowMap.values()].sort((a, b) => a.user.name.localeCompare(b.user.name));
        return { rows, unassigned };
    }, [
        userMgmtView,
        userMgmtShowFanSummary,
        users,
        searchTerm,
        fanHubMembershipsByFanId,
        fanHubMemberProfilesByFanId,
        getFanHubMembershipsForUser,
        hasFanHubMembership,
        isEchofluxWorkspaceUser,
        fanBuyerRosterFromApi,
    ]);

    const runCreatorStorefrontDiagnostics = useCallback(async () => {
        setCreatorStorefrontDiagLoading(true);
        try {
            const token = await auth.currentUser?.getIdToken(true);
            if (!token) {
                showToast?.('Sign in again to run diagnostics.', 'error');
                return;
            }
            const res = await fetch('/api/adminCreatorStorefrontDiagnostics', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = (await res.json().catch(() => ({}))) as CreatorStorefrontDiagnosticPayload;
            if (!res.ok) {
                throw new Error((data as { error?: string }).error || res.statusText || 'Request failed');
            }
            setCreatorStorefrontDiag(data);
            setCreatorStorefrontHealthResultsExpanded(true);
        } catch (e) {
            console.error('adminCreatorStorefrontDiagnostics', e);
            showToast?.((e as Error).message || 'Diagnostics failed', 'error');
            setCreatorStorefrontDiag(null);
        } finally {
            setCreatorStorefrontDiagLoading(false);
        }
    }, [showToast]);

    const fetchCreatorHubRoster = useCallback(
        async (creatorId: string) => {
            const id = creatorId.trim();
            if (!id) return;
            setAdminCreatorRosterLoading((p) => ({ ...p, [id]: true }));
            try {
                const token = await auth.currentUser?.getIdToken();
                if (!token) {
                    showToast?.('Sign in again to load My Page members.', 'error');
                    return;
                }
                const res = await fetch(`/api/adminCreatorHubFans?creatorId=${encodeURIComponent(id)}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const payload = (await res.json().catch(() => null)) as { fans?: unknown; error?: string } | null;
                if (!res.ok) {
                    throw new Error(payload?.error || res.statusText || 'Request failed');
                }
                const list = Array.isArray(payload?.fans) ? payload!.fans : [];
                const rows: Array<{
                    id: string;
                    email: string;
                    displayName: string;
                    subscriptionStatus: string | null;
                    totalSpentCents: number;
                }> = [];
                for (const item of list) {
                    if (!item || typeof item !== 'object') continue;
                    const r = item as Record<string, unknown>;
                    const rowId = String(r.id ?? '').trim();
                    if (!rowId) continue;
                    rows.push({
                        id: rowId,
                        email: typeof r.email === 'string' ? r.email : '—',
                        displayName: typeof r.displayName === 'string' ? r.displayName : '—',
                        subscriptionStatus: typeof r.subscriptionStatus === 'string' ? r.subscriptionStatus : null,
                        totalSpentCents:
                            typeof r.totalSpentCents === 'number' && Number.isFinite(r.totalSpentCents)
                                ? Math.max(0, Math.round(r.totalSpentCents))
                                : 0,
                    });
                }
                rows.sort((a, b) => b.totalSpentCents - a.totalSpentCents);
                setAdminCreatorRosters((p) => ({ ...p, [id]: rows }));
            } catch (e) {
                console.error('Admin creator hub roster', id, e);
                showToast?.('Could not load My Page members for this creator.', 'error');
            } finally {
                setAdminCreatorRosterLoading((p) => ({ ...p, [id]: false }));
            }
        },
        [showToast],
    );

    const toggleCreatorHubMembers = useCallback(
        (creatorId: string) => {
            const id = creatorId.trim();
            if (!id) return;
            setAdminCreatorRosterOpen((p) => {
                const opening = !p[id];
                if (opening) void fetchCreatorHubRoster(id);
                return { ...p, [id]: opening };
            });
        },
        [fetchCreatorHubRoster],
    );

    const renderCreatorHubRosterBlock = (hubUser: User, colSpan: number) => {
        if (!isEchofluxWorkspaceUser(hubUser)) return null;
        const id = hubUser.id;
        const open = !!adminCreatorRosterOpen[id];
        const loading = !!adminCreatorRosterLoading[id];
        const apiRows = adminCreatorRosters[id] ?? [];
        const rows = augmentCreatorHubRosterRows(
            apiRows,
            id,
            fanHubMembershipsByFanId,
            fanHubMemberProfilesByFanId,
            users,
        );
        const countLabel = rows.length > 0 ? ` (${rows.length})` : '';
        return (
            <tr className="border-b border-gray-200 dark:border-gray-700 bg-slate-50/60 dark:bg-slate-900/25">
                <td colSpan={colSpan} className="p-2 pl-8">
                    <button
                        type="button"
                        onClick={() => toggleCreatorHubMembers(id)}
                        className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 hover:underline"
                    >
                        {open ? 'Hide My Page members' : 'Show My Page members'}
                        {open || rows.length > 0 ? countLabel : ''}
                    </button>
                    {open ? (
                        <div className="mt-2 border-t border-dashed border-gray-200 dark:border-gray-600 pt-2">
                            {loading ? (
                                <p className="text-xs text-gray-500 dark:text-gray-400">Loading…</p>
                            ) : rows.length === 0 ? (
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    No My Page members found for this creator (no rows under{' '}
                                    <code className="text-[10px]">creators/{id}/fans</code> and no matching Fan Hub
                                    memberships in the admin index).
                                </p>
                            ) : (
                                <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-xl border border-gray-200/90 bg-white/80 shadow-sm dark:border-gray-600 dark:bg-gray-900/40">
                                    <table className="w-full text-left text-xs min-w-[520px]">
                                        <thead className="sticky top-0 z-[1] border-b border-gray-200/80 bg-gray-50/95 backdrop-blur-sm dark:border-gray-600 dark:bg-gray-800/95">
                                            <tr>
                                                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                                    Member
                                                </th>
                                                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                                    Email
                                                </th>
                                                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                                    Status
                                                </th>
                                                <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                                    Lifetime
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/80">
                                            {rows.map((r, idx) => {
                                                const initial = (r.displayName || r.email || '?')
                                                    .trim()
                                                    .charAt(0)
                                                    .toUpperCase();
                                                const st = (r.subscriptionStatus || '').toLowerCase();
                                                const subPill =
                                                    st === 'active' || st === 'trialing'
                                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                                                        : st === 'past_due'
                                                          ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/35 dark:text-amber-200'
                                                          : st === 'canceled' || st === 'cancelled'
                                                            ? 'bg-gray-200/80 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                                                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
                                                return (
                                                    <tr
                                                        key={r.id}
                                                        className={`transition-colors hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 ${
                                                            idx % 2 === 1 ? 'bg-gray-50/40 dark:bg-gray-800/20' : ''
                                                        }`}
                                                    >
                                                        <td className="px-3 py-2.5 align-middle">
                                                            <div className="flex items-center gap-2.5 min-w-0 max-w-[220px]">
                                                                <div
                                                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 text-[11px] font-bold text-indigo-800 shadow-sm dark:from-indigo-900/60 dark:to-indigo-800/50 dark:text-indigo-100"
                                                                    aria-hidden
                                                                >
                                                                    {initial}
                                                                </div>
                                                                <span className="min-w-0 truncate font-medium text-gray-900 dark:text-white">
                                                                    {r.displayName}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-2.5 align-middle">
                                                            <span
                                                                className="block max-w-[200px] truncate font-mono text-[11px] text-gray-600 dark:text-gray-400"
                                                                title={r.email}
                                                            >
                                                                {r.email}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2.5 align-middle">
                                                            {r.subscriptionStatus ? (
                                                                <span
                                                                    className={`inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${subPill}`}
                                                                >
                                                                    {r.subscriptionStatus.replace(/_/g, ' ')}
                                                                </span>
                                                            ) : (
                                                                <span className="text-gray-400 dark:text-gray-500">—</span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right align-middle tabular-nums">
                                                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                                                                ${(r.totalSpentCents / 100).toFixed(2)}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    ) : null}
                </td>
            </tr>
        );
    };

    const filteredUsers = useMemo(() => {
        const filtered = users.filter((user) => {
            const matchesSearch =
                user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                user.email.toLowerCase().includes(searchTerm.toLowerCase());
            if (!matchesSearch) return false;
            if (userMgmtView === 'storefront') {
                if (creatorIds.size > 0) {
                    return creatorIds.has(user.id);
                }
                return hasFanHubMembership(user) || isEchofluxWorkspaceUser(user);
            }
            // Workspace: optionally widen the directory so fan-only accounts appear (for the buyer summary table).
            if (userMgmtShowFanSummary) {
                return isEchofluxWorkspaceUser(user) || hasFanHubMembership(user);
            }
            return isEchofluxWorkspaceUser(user);
        });

        // Separate admins from regular users
        const adminUsers = filtered.filter((user) => user.role === 'Admin');
        const regularUsers = filtered.filter((user) => user.role !== 'Admin');

        // Sort admins by email (to find wil_jackson@icloud.com first)
        adminUsers.sort((a, b) => a.email.localeCompare(b.email));
        // Sort regular users by signup date (newest first)
        regularUsers.sort((a, b) => new Date(b.signupDate).getTime() - new Date(a.signupDate).getTime());

        // Return admins first, then regular users
        return [...adminUsers, ...regularUsers];
    }, [users, searchTerm, userMgmtView, userMgmtShowFanSummary, hasFanHubMembership, isEchofluxWorkspaceUser, creatorIds]);

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
            acc.captions += adminCaptionUsedThisMonth(user);
            return acc;
        }, { storage: 0, captions: 0 });
    }, [users, userStorageMap]);
    
    // Pagination
    const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
    const startIndex = (currentPage - 1) * usersPerPage;
    const endIndex = startIndex + usersPerPage;
    const paginatedUsers = filteredUsers.slice(startIndex, endIndex);
    
    const handleSaveUser = async (updatedUser: User) => {
        try {
            const fanHubOnlyAdmin =
                updatedUser.accountOrigin === 'fan_hub' ||
                (hasFanHubMembership(updatedUser) && !isEchofluxWorkspaceUser(updatedUser));
            if (fanHubOnlyAdmin) {
                showToast?.(
                    'This account is Fan Hub–only (not an EchoFlux workspace subscriber). Creator plans are not applied here.',
                    'error',
                );
                return;
            }

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

        const distribution: Record<PlanKey, number> = {
            Free: 0,
            Caption: 0,
            Pro: 0,
            Elite: 0,
            Agency: 0,
            Growth: 0,
            Starter: 0,
            OnlyFansStudio: 0,
            CreatorPro: 0,
            CreatorElite: 0,
        };
        
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

    /** Optional: mark Fan Buyer Summary rows where Firestore `accountOrigin` is still `echoflux` but the fan has storefront memberships. */
    const getUserOriginBadge = (user: User, opts?: { fanHubConsumerInSummary?: boolean }) => {
        if (user.accountOrigin === 'fan_hub' || opts?.fanHubConsumerInSummary) {
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
                    fanHubConsumerOnly={
                        hasFanHubMembership(editingUser) && !isEchofluxWorkspaceUser(editingUser)
                    }
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
                                    {(() => {
                                        const matchedUser = users.find((u) => u.id === activity.id);
                                        const label = adminUserDisplayLabel({
                                            name: matchedUser?.name ?? activity.user.name,
                                            email: matchedUser?.email ?? null,
                                            username: (matchedUser as unknown as { username?: string | null })?.username ?? null,
                                            handle: (matchedUser as unknown as { handle?: string | null })?.handle ?? null,
                                            memberUsername: (matchedUser as unknown as { memberUsername?: string | null })?.memberUsername ?? null,
                                        });
                                        return (
                                    <p className="font-semibold text-gray-900 dark:text-white">
                                        {label}
                                    </p>
                                        );
                                    })()}
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
                                {buildRequestsByModelRows(modelUsageStats.requestsByModel || {})
                                    .map(([model, count]) => {
                                        const countNum = count as number;
                                        const percentage = modelUsageStats.totalRequests > 0 
                                            ? (countNum / modelUsageStats.totalRequests * 100).toFixed(1) 
                                            : '0';
                                        const pctWidth = modelUsageStats.totalRequests > 0
                                            ? Math.min(100, (countNum / modelUsageStats.totalRequests) * 100)
                                            : 0;
                                        // Estimate cost for Replicate FLUX Dev (~$0.025 per image)
                                        const isReplicate = model === 'replicate-flux-dev' || model === 'replicate-flux-schnell' || model === 'replicate-sdxl';
                                        const isGemini = model.startsWith('gemini-');
                                        const isTavily = model.includes('tavily');
                                        const estimatedCost = isReplicate ? countNum * 0.025 : null;
                                        return (
                                            <div key={model}>
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="text-gray-600 dark:text-gray-400 font-mono flex items-center gap-1">
                                                        {isGemini && (
                                                            <SparklesIcon className="w-3 h-3 text-primary-500 dark:text-primary-400 flex-shrink-0" />
                                                        )}
                                                        {isReplicate && (
                                                            <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                                                <circle cx="8.5" cy="8.5" r="1.5" />
                                                                <polyline points="21 15 16 10 5 21" />
                                                            </svg>
                                                        )}
                                                        {isTavily && (
                                                            <GlobeIcon className="w-3 h-3 flex-shrink-0" />
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
                                                    <div className={`h-2 rounded-full ${isReplicate ? 'bg-orange-500' : isGemini ? 'bg-violet-500 dark:bg-violet-600' : 'bg-primary-600'}`} style={{ width: `${pctWidth}%` }}></div>
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

                                {/* Fan live streams + Daily broadcast (all creators) */}
                                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                                    <div className="rounded-xl border border-violet-200/90 dark:border-violet-800/45 bg-gradient-to-br from-violet-50/95 via-white to-indigo-50/75 dark:from-violet-950/30 dark:via-gray-900/50 dark:to-indigo-950/25 p-4 shadow-sm ring-1 ring-violet-100/60 dark:ring-violet-900/35">
                                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300 ring-1 ring-violet-300/40 dark:ring-violet-700/40">
                                                    <VideoIcon className="w-4 h-4" />
                                                </span>
                                                <h4 className="text-sm font-semibold text-violet-950 dark:text-violet-100 tracking-tight">
                                                    Fan live streams (all creators)
                                                </h4>
                                            </div>
                                            {!liveStreamsOverviewLoading &&
                                            !liveStreamsOverviewError &&
                                            liveStreamsOverview &&
                                            liveStreamsOverview.recent.length > 0 ? (
                                                <div className="flex items-center gap-2 w-full sm:w-auto sm:shrink-0">
                                                    <select
                                                        value={liveStreamRecentMode}
                                                        onChange={(e) =>
                                                            setLiveStreamRecentMode(
                                                                e.target.value as "5" | "7" | "30" | "90",
                                                            )
                                                        }
                                                        className="px-3 py-2 border border-violet-300/80 dark:border-violet-600/70 rounded-md bg-white/95 dark:bg-gray-800/95 text-gray-900 dark:text-white text-sm w-full sm:w-auto min-w-[122px] shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-400/50 dark:focus:ring-violet-500/40"
                                                        aria-label="Recent streams time range"
                                                    >
                                                        <option value="5">Last 5</option>
                                                        <option value="7">Last 7 days</option>
                                                        <option value="30">Last 30 days</option>
                                                        <option value="90">Last 90 days</option>
                                                    </select>
                                                </div>
                                            ) : null}
                                        </div>
                                        {liveStreamsOverviewLoading ? (
                                            <p className="text-xs text-violet-700/80 dark:text-violet-300/90">Loading platform live stream snapshot…</p>
                                        ) : liveStreamsOverviewError ? (
                                            <p className="text-xs text-red-600 dark:text-red-400">{liveStreamsOverviewError}</p>
                                        ) : liveStreamsOverview ? (
                                            <div className="space-y-3">
                                                {typeof liveStreamsOverview.estimatedFirestoreReads === "number" &&
                                                typeof liveStreamsOverview.estimatedFirestoreReadCostUsd === "number" ? (
                                                    <p className="text-xs text-slate-600 dark:text-slate-300 rounded-lg border border-slate-200/90 dark:border-slate-600/80 bg-white/70 dark:bg-gray-900/40 px-3 py-2 shadow-inner">
                                                        Est. Firebase reads this refresh:{" "}
                                                        <span className="font-semibold text-indigo-800 dark:text-indigo-200">
                                                            {liveStreamsOverview.estimatedFirestoreReads.toLocaleString()} reads (~$
                                                            {liveStreamsOverview.estimatedFirestoreReadCostUsd.toFixed(4)} USD)
                                                        </span>
                                                        . Indicative only — check Google Cloud billing for actuals. Broadcast video is billed in{" "}
                                                        <a
                                                            href="https://dashboard.daily.co/"
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="font-medium text-violet-700 dark:text-violet-300 underline decoration-violet-400/70"
                                                        >
                                                            Daily.co
                                                        </a>
                                                        ; 1:1 chat is in the bar above.
                                                    </p>
                                                ) : null}
                                                {liveStreamsOverview.sampleTruncated ? (
                                                    <p className="text-xs text-amber-800 dark:text-amber-200 rounded-lg border border-amber-300/70 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/35 px-3 py-2 ring-1 ring-amber-200/50 dark:ring-amber-800/40">
                                                        Stream scan hit the max ({liveStreamsOverview.sampledDocs.toLocaleString()} / {liveStreamsOverview.sampleLimit.toLocaleString()} documents). Status breakdowns below may be incomplete until the limit is raised in the admin API.
                                                    </p>
                                                ) : null}
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                                    <div className="p-3 rounded-lg border border-indigo-200/90 dark:border-indigo-700/50 bg-gradient-to-br from-indigo-50 to-indigo-100/90 dark:from-indigo-900/25 dark:to-indigo-800/15 shadow-sm">
                                                        <span className="text-indigo-700/90 dark:text-indigo-300/95 block text-[11px] font-medium uppercase tracking-wide">
                                                            Creators w/ streams
                                                        </span>
                                                        <span className="text-xl font-bold text-indigo-950 dark:text-indigo-50 tabular-nums">
                                                            {liveStreamsOverview.uniqueCreatorsWithStreams.toLocaleString()}
                                                        </span>
                                                    </div>
                                                    <div className="p-3 rounded-lg border border-emerald-200/90 dark:border-emerald-700/50 bg-gradient-to-br from-emerald-50 to-emerald-100/90 dark:from-emerald-900/25 dark:to-emerald-800/15 shadow-sm">
                                                        <span className="text-emerald-800/90 dark:text-emerald-300/95 block text-[11px] font-medium uppercase tracking-wide">
                                                            Live now
                                                        </span>
                                                        <span className="text-xl font-bold text-emerald-950 dark:text-emerald-50 tabular-nums">
                                                            {(liveStreamsOverview.byStatus?.live ?? 0).toLocaleString()}
                                                        </span>
                                                    </div>
                                                    <div
                                                        className="p-3 rounded-lg border border-cyan-200/90 dark:border-cyan-700/50 bg-gradient-to-br from-cyan-50 to-cyan-100/90 dark:from-cyan-900/25 dark:to-cyan-800/15 shadow-sm"
                                                        title="Streams that have a Daily.co broadcast room name saved (created when the host goes live)."
                                                    >
                                                        <span className="text-cyan-800/90 dark:text-cyan-300/95 block text-[11px] font-medium uppercase tracking-wide">
                                                            Broadcast room (Daily.co)
                                                        </span>
                                                        <span className="text-xl font-bold text-cyan-950 dark:text-cyan-50 tabular-nums">
                                                            {liveStreamsOverview.withDailyRoom.toLocaleString()}
                                                        </span>
                                                    </div>
                                                    <div className="p-3 rounded-lg border border-amber-200/90 dark:border-amber-700/50 bg-gradient-to-br from-amber-50 to-amber-100/90 dark:from-amber-900/25 dark:to-amber-800/15 shadow-sm">
                                                        <span className="text-amber-900/85 dark:text-amber-300/95 block text-[11px] font-medium uppercase tracking-wide">
                                                            Tickets sold (30d)
                                                        </span>
                                                        <span className="text-xl font-bold text-amber-950 dark:text-amber-50 tabular-nums">
                                                            {liveStreamsOverview.ticketsSold30d.toLocaleString()}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap gap-2 text-[11px]">
                                                    <span className="inline-flex items-center rounded-full bg-blue-100/90 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100 px-2.5 py-1 font-medium ring-1 ring-blue-200/70 dark:ring-blue-700/50">
                                                        Scheduled {(liveStreamsOverview.byStatus?.scheduled ?? 0).toLocaleString()}
                                                    </span>
                                                    <span className="inline-flex items-center rounded-full bg-slate-200/90 text-slate-900 dark:bg-slate-600/45 dark:text-slate-100 px-2.5 py-1 font-medium ring-1 ring-slate-300/60 dark:ring-slate-500/40">
                                                        Ended {(liveStreamsOverview.byStatus?.ended ?? 0).toLocaleString()}
                                                    </span>
                                                    <span className="inline-flex items-center rounded-full bg-rose-100/90 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100 px-2.5 py-1 font-medium ring-1 ring-rose-200/70 dark:ring-rose-700/45">
                                                        Cancelled {(liveStreamsOverview.byStatus?.cancelled ?? 0).toLocaleString()}
                                                    </span>
                                                    <span className="inline-flex items-center rounded-full bg-amber-100/90 text-amber-950 dark:bg-amber-900/35 dark:text-amber-100 px-2.5 py-1 font-medium ring-1 ring-amber-200/70 dark:ring-amber-700/40">
                                                        Draft {(liveStreamsOverview.byStatus?.draft ?? 0).toLocaleString()}
                                                    </span>
                                                    {(liveStreamsOverview.byStatus?.other ?? 0) > 0 ? (
                                                        <span className="inline-flex items-center rounded-full bg-violet-100/90 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100 px-2.5 py-1 font-medium ring-1 ring-violet-200/70 dark:ring-violet-700/45">
                                                            Other {(liveStreamsOverview.byStatus?.other ?? 0).toLocaleString()}
                                                        </span>
                                                    ) : null}
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="rounded-lg border border-amber-200/80 dark:border-amber-800/45 bg-gradient-to-r from-amber-50/90 to-yellow-50/70 dark:from-amber-950/30 dark:to-yellow-950/20 px-3 py-2 text-xs">
                                                        <p className="text-amber-950 dark:text-amber-50">
                                                            <span className="font-semibold text-amber-900/95 dark:text-amber-100/95">
                                                                Gross ticket sales (30d, non-refunded):{" "}
                                                            </span>
                                                            <span className="font-bold tabular-nums">
                                                                $
                                                                {(
                                                                    (liveStreamsOverview.ticketGrossCents30d ??
                                                                        liveStreamsOverview.ticketRevenueCents30d) /
                                                                    100
                                                                ).toFixed(2)}
                                                            </span>
                                                        </p>
                                                        <p className="text-[10px] text-amber-900/75 dark:text-amber-200/80 mt-1 leading-snug">
                                                            Total charged to fans in Stripe — not creator payout or EchoFlux net.
                                                        </p>
                                                    </div>
                                                    <div className="rounded-lg border border-purple-200/85 dark:border-purple-800/50 bg-gradient-to-r from-purple-50/95 to-violet-50/80 dark:from-purple-950/35 dark:to-violet-950/25 px-3 py-2 text-xs shadow-sm">
                                                        <p className="text-purple-950 dark:text-purple-50">
                                                            <span className="font-semibold text-purple-900/95 dark:text-purple-100/95">
                                                                Est. EchoFlux share (~10%):{" "}
                                                            </span>
                                                            <span className="font-bold tabular-nums">
                                                                $
                                                                {(
                                                                    (liveStreamsOverview.echofluxCommissionEstimateCents30d ??
                                                                        Math.round(
                                                                            (liveStreamsOverview.ticketGrossCents30d ??
                                                                                liveStreamsOverview.ticketRevenueCents30d) *
                                                                                0.1,
                                                                        )) / 100
                                                                ).toFixed(2)}
                                                            </span>
                                                        </p>
                                                        <p className="text-[10px] text-purple-900/75 dark:text-purple-200/80 mt-1 leading-snug">
                                                            Typical Fan Hub application fee on gross; actual Stripe fees can differ (e.g. platform-owner creators).
                                                        </p>
                                                    </div>
                                                    <div className="rounded-lg border border-red-200/90 dark:border-red-800/55 bg-gradient-to-br from-red-50/95 to-rose-50/80 dark:from-red-950/35 dark:to-rose-950/25 px-3 py-2 text-xs shadow-sm ring-1 ring-red-100/50 dark:ring-red-900/35">
                                                        <p className="text-red-950 dark:text-red-50">
                                                            <span className="font-semibold text-red-900/95 dark:text-red-100/95">
                                                                Est. Daily.co (fan live broadcasts, 30d):{" "}
                                                            </span>
                                                            <span className="font-bold tabular-nums">
                                                                $
                                                                {(liveStreamsOverview.estimatedDailyLiveBroadcastCostUsd ?? 0).toFixed(2)}
                                                            </span>
                                                        </p>
                                                        <p className="text-[10px] text-red-900/80 dark:text-red-200/85 mt-1 leading-snug">
                                                            Rough model:{" "}
                                                            {typeof liveStreamsOverview.streamsWithDailyRoomTouched30d === "number"
                                                                ? `${liveStreamsOverview.streamsWithDailyRoomTouched30d.toLocaleString()} stream doc(s) with a Daily room updated in the last 30d`
                                                                : "stream docs with a Daily room in the sample"}
                                                            , ~42 min × ~5 participants × $0.004/participant-min (same scale as video chat cost above). Not a bill — confirm in Daily.co.
                                                        </p>
                                                    </div>
                                                </div>
                                                {liveStreamsOverview.recent.length > 0 ? (
                                                    <>
                                                        {liveStreamTableRows.length === 0 ? (
                                                            <p className="text-xs text-violet-800/80 dark:text-violet-300/90 rounded-md border border-violet-200/60 dark:border-violet-800/40 bg-violet-50/50 dark:bg-violet-950/20 px-3 py-2">
                                                                No streams in this range in the current sample.
                                                            </p>
                                                        ) : (
                                                            <div className="overflow-x-auto max-h-80 overflow-y-auto rounded-xl border border-indigo-200/70 dark:border-indigo-800/50 shadow-md ring-1 ring-indigo-100/40 dark:ring-indigo-900/30">
                                                                <table className="min-w-full text-xs text-left">
                                                                    <thead className="sticky top-0 z-10 bg-gradient-to-r from-indigo-100 via-violet-100 to-indigo-100 dark:from-indigo-950/90 dark:via-violet-950/80 dark:to-indigo-950/90 text-indigo-950 dark:text-indigo-100 shadow-sm">
                                                                        <tr>
                                                                            <th className="px-3 py-2.5 font-semibold">Creator</th>
                                                                            <th className="px-3 py-2.5 font-semibold">Stream</th>
                                                                            <th className="px-3 py-2.5 font-semibold">Status</th>
                                                                            <th className="px-3 py-2.5 font-semibold">Ticket</th>
                                                                            <th
                                                                                className="px-3 py-2.5 font-semibold max-w-[140px]"
                                                                                title='Daily.co is our live video vendor. "Yes" means a broadcast room was created for this stream (fan watch + host camera).'
                                                                            >
                                                                                Daily.co room
                                                                            </th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-indigo-100/80 dark:divide-indigo-900/40">
                                                                        {liveStreamTableRows.map((row, idx) => (
                                                                            <tr
                                                                                key={`${row.creatorId}-${row.streamId}`}
                                                                                className={
                                                                                    idx % 2 === 0
                                                                                        ? "bg-white/90 dark:bg-gray-950/20 text-slate-800 dark:text-slate-100 hover:bg-indigo-50/90 dark:hover:bg-indigo-950/30 transition-colors"
                                                                                        : "bg-violet-50/60 dark:bg-violet-950/15 text-slate-800 dark:text-slate-100 hover:bg-indigo-50/90 dark:hover:bg-indigo-950/30 transition-colors"
                                                                                }
                                                                            >
                                                                                <td
                                                                                    className="px-3 py-2 max-w-[220px] truncate font-medium text-indigo-950 dark:text-indigo-50"
                                                                                    title={`${row.creatorLabel?.trim() ? row.creatorLabel : "Creator"}\nUID: ${row.creatorId}`}
                                                                                >
                                                                                    {row.creatorLabel?.trim()
                                                                                        ? row.creatorLabel
                                                                                        : `${row.creatorId.slice(0, 8)}…`}
                                                                                </td>
                                                                                <td className="px-3 py-2 max-w-[200px]">
                                                                                    <span className="line-clamp-2 text-slate-700 dark:text-slate-200" title={row.title}>
                                                                                        {row.title}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="px-3 py-2 whitespace-nowrap">
                                                                                    <span
                                                                                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${liveStreamStatusBadgeClass(row.status)}`}
                                                                                    >
                                                                                        {row.status}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="px-3 py-2 whitespace-nowrap">
                                                                                    {row.ticketCents <= 0 ? (
                                                                                        <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100 ring-1 ring-emerald-300/50">
                                                                                            Free
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="font-semibold text-violet-800 dark:text-violet-200 tabular-nums">
                                                                                            ${(row.ticketCents / 100).toFixed(2)}
                                                                                        </span>
                                                                                    )}
                                                                                </td>
                                                                                <td className="px-3 py-2 whitespace-nowrap">
                                                                                    {row.hasDailyRoom ? (
                                                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-100 text-cyan-950 dark:bg-cyan-900/45 dark:text-cyan-100 ring-1 ring-cyan-300/50 dark:ring-cyan-700/40">
                                                                                            Yes
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="text-slate-400 dark:text-slate-500">—</span>
                                                                                    )}
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <p className="text-xs text-violet-800/80 dark:text-violet-300/90">No stream docs in sample.</p>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-violet-800/70 dark:text-violet-300/90">No data.</p>
                                        )}
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
                <div className="flex flex-col gap-4 mb-4">
                    <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white shrink-0">User Management</h3>
                        <div className="flex flex-col gap-3 w-full lg:w-auto lg:max-w-xl">
                            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-2">
                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide shrink-0">
                                    Directory
                                </span>
                                <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 p-0.5 bg-gray-50 dark:bg-gray-900/40 w-fit max-w-full">
                                    <button
                                        type="button"
                                        onClick={() => setUserMgmtView('workspace')}
                                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                                            userMgmtView === 'workspace'
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                                        }`}
                                    >
                                        Workspace
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setUserMgmtView('storefront')}
                                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                                            userMgmtView === 'storefront'
                                                ? 'bg-cyan-600 text-white shadow-sm'
                                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                                        }`}
                                    >
                                        My Page creators
                                    </button>
                                </div>
                                {userMgmtView === 'workspace' && (
                                    <button
                                        type="button"
                                        onClick={() => setUserMgmtShowFanSummary((v) => !v)}
                                        className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-md border transition-colors whitespace-nowrap w-fit ${
                                            userMgmtShowFanSummary
                                                ? 'border-indigo-400 bg-indigo-50 text-indigo-800 dark:border-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-200'
                                                : 'border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
                                        }`}
                                    >
                                        {userMgmtShowFanSummary ? 'Hide buyer summary' : 'Show buyer summary'}
                                    </button>
                                )}
                            </div>
                            <p className="text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                                {userMgmtView === 'workspace' ? (
                                    <>
                                        EchoFlux app accounts (plans, storage, captions). Use{' '}
                                        <span className="font-medium text-gray-600 dark:text-gray-300">Show My Page members</span> on a
                                        row to load that creator&apos;s fans.
                                    </>
                                ) : (
                                    <>
                                        Accounts with a <span className="font-medium text-gray-600 dark:text-gray-300">creators/</span>{' '}
                                        doc (storefront owners). Expand each row to list fans from Firestore.
                                    </>
                                )}
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowAddUserModal(true)}
                                    className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors font-medium shrink-0 w-auto"
                                >
                                    <UserPlusIcon />
                                    Add User
                                </button>
                                <input
                                    type="text"
                                    placeholder="Search by name or email..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="flex-1 min-w-[12rem] max-w-md p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-primary-500 focus:border-primary-500 dark:text-white dark:placeholder-gray-400"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="rounded-lg border border-amber-200/90 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/25 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <p className="text-xs font-semibold text-amber-900 dark:text-amber-100 uppercase tracking-wide">
                                    Storefront creator health
                                </p>
                                <p className="text-[11px] text-amber-800/90 dark:text-amber-200/85 mt-0.5 max-w-2xl">
                                    Admin-only scan: duplicate <code className="text-[10px]">creators/</code> handles,{' '}
                                    <code className="text-[10px]">creators/</code> docs without a matching{' '}
                                    <code className="text-[10px]">users/</code> id, and{' '}
                                    <code className="text-[10px]">creatorHandles</code> drift. Use this when fans split across
                                    multiple creator roots.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                                {creatorStorefrontDiag?.success ? (
                                    <button
                                        type="button"
                                        onClick={() => setCreatorStorefrontHealthResultsExpanded((v) => !v)}
                                        className="px-3 py-1.5 text-xs font-semibold rounded-md border border-amber-600/50 bg-white/90 text-amber-900 hover:bg-amber-100/90 dark:bg-amber-950/50 dark:text-amber-100 dark:border-amber-600/40 dark:hover:bg-amber-900/40"
                                    >
                                        {creatorStorefrontHealthResultsExpanded ? 'Minimize results' : 'Expand results'}
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={() => void runCreatorStorefrontDiagnostics()}
                                    disabled={creatorStorefrontDiagLoading}
                                    className="px-3 py-1.5 text-xs font-semibold rounded-md bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-50 dark:bg-amber-800 dark:hover:bg-amber-700"
                                >
                                    {creatorStorefrontDiagLoading ? 'Scanning…' : 'Run scan'}
                                </button>
                            </div>
                        </div>
                        {creatorStorefrontDiag?.success && !creatorStorefrontHealthResultsExpanded ? (
                            <p className="mt-2 text-[10px] text-amber-800/90 dark:text-amber-200/80 border-t border-amber-200/60 dark:border-amber-800/40 pt-2">
                                Results hidden · {creatorStorefrontDiag.creatorsScanned ?? 0} creators scanned
                                {creatorStorefrontDiag.generatedAt
                                    ? ` · ${new Date(creatorStorefrontDiag.generatedAt).toLocaleString()}`
                                    : ''}
                                · dup handles: {creatorStorefrontDiag.duplicateHandles?.length ?? 0}, no{' '}
                                <code className="text-[9px]">users/</code>:{' '}
                                {creatorStorefrontDiag.creatorsWithoutUsersDoc?.total ?? 0}, handle issues:{' '}
                                {creatorStorefrontDiag.creatorHandlesIssues?.length ?? 0}.{' '}
                                <button
                                    type="button"
                                    onClick={() => setCreatorStorefrontHealthResultsExpanded(true)}
                                    className="font-semibold text-amber-900 dark:text-amber-100 underline underline-offset-2"
                                >
                                    Expand
                                </button>{' '}
                                to view full report.
                            </p>
                        ) : null}
                        {creatorStorefrontDiag?.success && creatorStorefrontHealthResultsExpanded ? (
                            <div className="mt-3 space-y-3 text-xs text-amber-950 dark:text-amber-50 border-t border-amber-200/70 dark:border-amber-800/50 pt-3">
                                <p className="text-[10px] text-amber-800/80 dark:text-amber-200/75">
                                    Scanned {creatorStorefrontDiag.creatorsScanned ?? 0} creator docs ·{' '}
                                    {creatorStorefrontDiag.generatedAt
                                        ? new Date(creatorStorefrontDiag.generatedAt).toLocaleString()
                                        : ''}
                                </p>
                                {(creatorStorefrontDiag.duplicateHandles?.length ?? 0) > 0 ? (
                                    <div>
                                        <p className="font-semibold text-amber-900 dark:text-amber-100 mb-1">
                                            Duplicate handle on multiple creator docs ({creatorStorefrontDiag.duplicateHandles?.length})
                                        </p>
                                        <ul className="list-disc pl-4 space-y-1.5 text-[11px]">
                                            {creatorStorefrontDiag.duplicateHandles!.map((d) => (
                                                <li key={d.normalizedHandle}>
                                                    <span className="font-mono">@{d.normalizedHandle}</span> →{' '}
                                                    {d.creatorIds.map((id, i) => (
                                                        <span key={id}>
                                                            {i > 0 ? ', ' : ''}
                                                            <code className="text-[10px] bg-amber-100/80 dark:bg-amber-900/40 px-1 rounded">
                                                                {id}
                                                            </code>
                                                            {d.displayNames[i] ? ` (${d.displayNames[i]})` : ''}
                                                        </span>
                                                    ))}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : (
                                    <p className="text-[11px] text-amber-800/85 dark:text-amber-200/80">
                                        No duplicate handles across creator documents.
                                    </p>
                                )}
                                <div>
                                    <p className="font-semibold text-amber-900 dark:text-amber-100 mb-1">
                                        Creators doc without matching{' '}
                                        <code className="text-[10px]">users/</code> id
                                    </p>
                                    <p className="text-[11px] text-amber-800/90 dark:text-amber-200/85">
                                        {(creatorStorefrontDiag.creatorsWithoutUsersDoc?.total ?? 0) === 0
                                            ? 'None — every creators/ doc id has a users/ doc.'
                                            : `${creatorStorefrontDiag.creatorsWithoutUsersDoc?.total} doc(s); legacy roots often explain split fan trees.`}
                                    </p>
                                    {(creatorStorefrontDiag.creatorsWithoutUsersDoc?.sampleIds?.length ?? 0) > 0 ? (
                                        <p className="mt-1 font-mono text-[10px] break-all text-amber-900/90 dark:text-amber-100/90">
                                            {creatorStorefrontDiag.creatorsWithoutUsersDoc!.sampleIds.join(', ')}
                                            {creatorStorefrontDiag.creatorsWithoutUsersDoc?.truncated ? ' …' : ''}
                                        </p>
                                    ) : null}
                                </div>
                                <div>
                                    <p className="font-semibold text-amber-900 dark:text-amber-100 mb-1">
                                        creatorHandles index ({creatorStorefrontDiag.creatorHandlesScanned ?? 0} rows
                                        {creatorStorefrontDiag.creatorHandlesIssuesTruncated ? ', capped' : ''})
                                    </p>
                                    {(creatorStorefrontDiag.creatorHandlesIssues?.length ?? 0) === 0 ? (
                                        <p className="text-[11px] text-amber-800/85 dark:text-amber-200/80">
                                            No missing targets or handle mismatches in the sample.
                                        </p>
                                    ) : (
                                        <ul className="list-disc pl-4 space-y-1 text-[11px] max-h-40 overflow-y-auto">
                                            {creatorStorefrontDiag.creatorHandlesIssues!.slice(0, 25).map((issue, idx) => (
                                                <li key={`${issue.kind}-${issue.handleKey}-${idx}`}>
                                                    {issue.kind === 'missing_creator' ? (
                                                        <>
                                                            <span className="font-mono">{issue.handleKey}</span>: missing{' '}
                                                            <code className="text-[10px]">creators/{issue.creatorId || '∅'}</code>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className="font-mono">{issue.handleKey}</span> →{' '}
                                                            <code className="text-[10px]">{issue.creatorId}</code> but doc.handle is{' '}
                                                            <code className="text-[10px]">{issue.creatorDocHandle}</code>
                                                        </>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
                <div className="overflow-x-auto">
                     {isLoading ? (
                        <div className="text-center py-16">
                            <svg className="animate-spin h-8 w-8 text-primary-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            <p className="mt-4 text-lg font-semibold text-gray-700 dark:text-gray-300">Loading users...</p>
                        </div>
                    ) : (
                    <table className="w-full text-left min-w-[720px]">
                        <thead className="bg-gray-50 dark:bg-gray-700/50">
                            <tr>
                                <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">User</th>
                                <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">Plan</th>
                                <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">Signup Date</th>
                                <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">Storage</th>
                                <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">AI Captions</th>
                                <th className="p-3 font-semibold text-gray-600 dark:text-gray-300">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(() => {
                                // Admins are often on legacy "Agency" plan; still show them in User Management (they sort first in filteredUsers).
                                const visibleUsers = paginatedUsers.filter(
                                    (user) =>
                                        user.role === 'Admin' ||
                                        (user.plan !== 'Agency' &&
                                            user.plan !== 'Starter' &&
                                            user.plan !== 'Growth' &&
                                            user.plan !== 'Caption'),
                                );
                                
                                const showEchofluxSection = userMgmtView === 'workspace';
                                const showFanConsumersSection = userMgmtView === 'workspace' && userMgmtShowFanSummary;
                                const showCreatorsMyPageSection = userMgmtView === 'storefront';

                                const adminUsers = visibleUsers.filter((user) => user.role === 'Admin');
                                const nonAdminUsers = visibleUsers.filter((user) => user.role !== 'Admin');
                                /** Workspace directory: all workspace accounts on this page, admins first (same list as Stormij + Krissi). */
                                const workspaceAccountUsers = visibleUsers
                                    .filter((user) => isEchofluxWorkspaceUser(user))
                                    .sort((a, b) => {
                                        const aAd = a.role === 'Admin' ? 0 : 1;
                                        const bAd = b.role === 'Admin' ? 0 : 1;
                                        if (aAd !== bAd) return aAd - bAd;
                                        if (a.role === 'Admin') return a.email.localeCompare(b.email);
                                        return new Date(b.signupDate).getTime() - new Date(a.signupDate).getTime();
                                    });
                                // Fan Hub tab: non-admin rows are already creator-only from filteredUsers; list them with rosters.
                                const myPageCreatorUsers = showCreatorsMyPageSection
                                    ? creatorIds.size > 0
                                        ? nonAdminUsers.filter((user) => creatorIds.has(user.id))
                                        : nonAdminUsers.filter(
                                              (user) => isEchofluxWorkspaceUser(user) || hasFanHubMembership(user),
                                          )
                                    : [];
                                
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
                                        <td className="p-3 text-primary-700 dark:text-primary-300">
                                            <span className="text-xs">—</span>
                                        </td>
                                    </tr>
                                );

                                return (
                                    <>
                                        {/* Totals row at top if wil_jackson@icloud.com is not on this page */}
                                        {!wilJacksonUser && <TotalsRow />}
                                        
                                        {/* Storefront: admins first; Workspace merges admins into WORKSPACE ACCOUNTS below */}
                                        {userMgmtView === 'storefront' && adminUsers.length > 0 && (
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
                                                                        const used = adminCaptionUsedThisMonth(user);
                                                                        const limit = adminCaptionMonthlyLimit(user.plan);
                                                                        return limit > 0 ? `${used}/${limit}` : `${used}`;
                                                                    })()}
                                                                </td>
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
                                                            {creatorIds.has(user.id) ? renderCreatorHubRosterBlock(user, 6) : null}
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

                                        {/* Fan Hub tab: My Page creators with member rosters */}
                                        {showCreatorsMyPageSection && myPageCreatorUsers.length > 0 && (
                                            <>
                                                <tr>
                                                    <td colSpan={6} className="p-2 border-t-2 border-cyan-300 dark:border-cyan-700 bg-cyan-50/40 dark:bg-cyan-900/15">
                                                        <div className="text-xs text-cyan-800 dark:text-cyan-200 font-semibold tracking-wide text-center">
                                                            MY PAGE CREATORS
                                                        </div>
                                                    </td>
                                                </tr>
                                                {myPageCreatorUsers.map((user) => {
                                                    const isWilJackson = user.email === 'wil_jackson@icloud.com';
                                                    return (
                                                        <React.Fragment key={`fanhub-creator-${user.id}`}>
                                                            <tr className="border-b border-gray-200 dark:border-gray-700">
                                                                <td className="p-3">
                                                                    <div className="flex items-center space-x-3">
                                                                        <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full" />
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
                                                                        const used = adminCaptionUsedThisMonth(user);
                                                                        const limit = adminCaptionMonthlyLimit(user.plan);
                                                                        return limit > 0 ? `${used}/${limit}` : `${used}`;
                                                                    })()}
                                                                </td>
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
                                                            {renderCreatorHubRosterBlock(user, 6)}
                                                            {isWilJackson && <TotalsRow />}
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </>
                                        )}
                                        
                                        {/* Workspace accounts (includes admins like Stormij with non-admin creators) */}
                                        {showEchofluxSection && workspaceAccountUsers.length > 0 && (
                                            <>
                                                <tr>
                                                    <td colSpan={6} className="p-2 border-t-2 border-gray-300 dark:border-gray-600">
                                                        <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold tracking-wide text-center">
                                                            WORKSPACE ACCOUNTS
                                                        </div>
                                                    </td>
                                                </tr>

                                                {workspaceAccountUsers.map((user) => {
                                                    const isWilJackson = user.email === 'wil_jackson@icloud.com';
                                                    const isRowAdmin = user.role === 'Admin';

                                                    return (
                                                        <React.Fragment key={user.id}>
                                                            {isRowAdmin ? (
                                                                <tr className="border-b border-gray-200 dark:border-gray-700 bg-blue-50/30 dark:bg-blue-900/10">
                                                                    <td className="p-3">
                                                                        <div className="flex items-center space-x-3">
                                                                            <img
                                                                                src={user.avatar}
                                                                                alt={user.name}
                                                                                className="w-10 h-10 rounded-full border-2 border-blue-500"
                                                                            />
                                                                            <div>
                                                                                <p className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                                                                    {user.name}
                                                                                    <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded">
                                                                                        ADMIN
                                                                                    </span>
                                                                                    {getUserOriginBadge(user)}
                                                                                </p>
                                                                                <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                    <td className="p-3">
                                                                        <span
                                                                            className={`px-3 py-1 text-xs font-semibold rounded-full ${planColorMap[getPlanKey(user.plan)]}`}
                                                                        >
                                                                            {user.plan}
                                                                        </span>
                                                                    </td>
                                                                    <td className="p-3 text-sm text-gray-600 dark:text-gray-300">
                                                                        {new Date(user.signupDate).toLocaleDateString()}
                                                                    </td>
                                                                    <td className="p-3 text-sm text-gray-600 dark:text-gray-300">
                                                                        {formatStorage(
                                                                            userStorageMap[user.id] ?? user.storageUsed ?? 0,
                                                                            getStorageLimit(user.plan),
                                                                        )}
                                                                    </td>
                                                                    <td className="p-3 font-mono text-gray-600 dark:text-gray-300">
                                                                        {(() => {
                                                                            const used = adminCaptionUsedThisMonth(user);
                                                                            const limit = adminCaptionMonthlyLimit(user.plan);
                                                                            return limit > 0 ? `${used}/${limit}` : `${used}`;
                                                                        })()}
                                                                    </td>
                                                                    <td className="p-3">
                                                                        <div className="flex gap-2">
                                                                            <button
                                                                                onClick={() => setEditingUser(user)}
                                                                                className="px-3 py-1 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-md"
                                                                            >
                                                                                Manage
                                                                            </button>
                                                                            <button
                                                                                onClick={() => setGrantingRewardToUser(user)}
                                                                                className="px-3 py-1 text-sm font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-md"
                                                                            >
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
                                                            ) : (
                                                                <tr className="border-b border-gray-200 dark:border-gray-700">
                                                                    <td className="p-3">
                                                                        <div className="flex items-center space-x-3">
                                                                            <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full" />
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
                                                                        <span
                                                                            className={`px-3 py-1 text-xs font-semibold rounded-full ${planColorMap[getPlanKey(user.plan)]}`}
                                                                        >
                                                                            {user.plan}
                                                                        </span>
                                                                    </td>
                                                                    <td className="p-3 text-sm text-gray-600 dark:text-gray-300">
                                                                        {new Date(user.signupDate).toLocaleDateString()}
                                                                    </td>
                                                                    <td className="p-3 text-sm text-gray-600 dark:text-gray-300">
                                                                        {formatStorage(
                                                                            userStorageMap[user.id] ?? user.storageUsed ?? 0,
                                                                            getStorageLimit(user.plan),
                                                                        )}
                                                                    </td>
                                                                    <td className="p-3 font-mono text-gray-600 dark:text-gray-300">
                                                                        {(() => {
                                                                            const used = adminCaptionUsedThisMonth(user);
                                                                            const limit = adminCaptionMonthlyLimit(user.plan);
                                                                            return limit > 0 ? `${used}/${limit}` : `${used}`;
                                                                        })()}
                                                                    </td>
                                                                    <td className="p-3">
                                                                        <div className="flex gap-2">
                                                                            <button
                                                                                onClick={() => setEditingUser(user)}
                                                                                className="px-3 py-1 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-md"
                                                                            >
                                                                                Manage
                                                                            </button>
                                                                            <button
                                                                                onClick={() => setGrantingRewardToUser(user)}
                                                                                className="px-3 py-1 text-sm font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-md"
                                                                            >
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
                                                            )}
                                                            {renderCreatorHubRosterBlock(user, 6)}
                                                            {isWilJackson && <TotalsRow />}
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </>
                                        )}

                                        {/* All tab only: Fan Hub consumers (memberships as fans); creators with rosters use the Fan Hub tab. */}
                                        {showFanConsumersSection &&
                                            (fanBuyerSummaryBundle.rows.length > 0 || fanBuyerSummaryBundle.unassigned.length > 0) && (
                                            <>
                                                <tr className="bg-cyan-50/60 dark:bg-cyan-900/20">
                                                    <td colSpan={6} className="p-3 border-t-2 border-cyan-300 dark:border-cyan-700">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="text-xs font-semibold text-cyan-800 dark:text-cyan-200 tracking-wide">
                                                                FAN BUYER SUMMARY
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => setShowFanHubMembersSection((prev) => !prev)}
                                                                className="px-2.5 py-1 text-[11px] font-semibold rounded-md border border-cyan-300 dark:border-cyan-700 bg-cyan-50 text-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-200 hover:bg-cyan-100 dark:hover:bg-cyan-900/30"
                                                            >
                                                                {showFanHubMembersSection ? 'Hide members' : 'Show members'}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {showFanHubMembersSection ? (() => {
                                                    const fanHubProfileFor = (u: User) =>
                                                        fanHubMemberProfilesByFanId[u.id] ||
                                                        (u.email
                                                            ? fanHubMemberProfilesByFanId[u.email.trim().toLowerCase()]
                                                            : undefined);

                                                    return (
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
                                                                                    {fanBuyerSummaryBundle.rows.map((row) => {
                                                                                        const hubChips = membershipChipsForDisplay(row.memberships);
                                                                                        const activeSubCount = hubChips.filter(adminFanHubSubscriptionRowIsActive).length;
                                                                                        const subscriptionsSummary =
                                                                                            hubChips.length === 0
                                                                                                ? "—"
                                                                                                : activeSubCount === 0
                                                                                                  ? `${hubChips.length} ended`
                                                                                                  : activeSubCount === hubChips.length
                                                                                                    ? `${activeSubCount} active`
                                                                                                    : `${activeSubCount} active · ${hubChips.length - activeSubCount} ended`;
                                                                                        return (
                                                                                        <React.Fragment key={`fanhub-deduped-${row.user.id}`}>
                                                                                        <tr className="border-t border-cyan-100 dark:border-cyan-900/30">
                                                                                            <td className="p-3">
                                                                                                <div className="flex items-center space-x-3">
                                                                                                    <img
                                                                                                        src={row.user.avatar}
                                                                                                        alt={fanHubMemberTableLabel(row.user, fanHubProfileFor(row.user))}
                                                                                                        className="w-10 h-10 rounded-full"
                                                                                                    />
                                                                                                    <div>
                                                                                                        <p className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                                                                                            {fanHubMemberTableLabel(row.user, fanHubProfileFor(row.user))}
                                                                                                            {getUserOriginBadge(row.user, {
                                                                                                                fanHubConsumerInSummary: row.memberships.length > 0,
                                                                                                            })}
                                                                                                        </p>
                                                                                                        <p className="text-sm text-gray-500 dark:text-gray-400">{row.user.email}</p>
                                                                                                        {row.directoryOnly ? (
                                                                                                            <p className="text-[11px] text-cyan-800/90 dark:text-cyan-200/90">
                                                                                                                Fan Hub index only — no matching Firestore{' '}
                                                                                                                <span className="font-mono">users/</span> document for this fan
                                                                                                                key (by UID or email).
                                                                                                            </p>
                                                                                                        ) : null}
                                                                                                    </div>
                                                                                                </div>
                                                                                            </td>
                                                                                            <td className="p-3 text-sm text-gray-700 dark:text-gray-300">
                                                                                                {hubChips.length === 0 ? (
                                                                                                    <span className="text-gray-500 dark:text-gray-400">—</span>
                                                                                                ) : (
                                                                                                    <div className="flex flex-wrap gap-1.5">
                                                                                                        {hubChips.map((m) => (
                                                                                                            <span
                                                                                                                key={`chip-${row.user.id}-${normalizeAdminCreatorGroupKey(m.creatorId) || m.creatorHandle || m.creatorName || "x"}`}
                                                                                                                title={String(m.status || "").trim() || "—"}
                                                                                                                className={`px-2 py-0.5 rounded-full text-[11px] ${
                                                                                                                    adminFanHubSubscriptionRowIsActive(m)
                                                                                                                        ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-200"
                                                                                                                        : "bg-slate-200/90 text-slate-700 dark:bg-slate-600/50 dark:text-slate-200"
                                                                                                                }`}
                                                                                                            >
                                                                                                                {m.creatorName}
                                                                                                            </span>
                                                                                                        ))}
                                                                                                    </div>
                                                                                                )}
                                                                                            </td>
                                                                                            <td className="p-3 text-sm text-gray-700 dark:text-gray-300">
                                                                                                {subscriptionsSummary}
                                                                                            </td>
                                                                                            <td className="p-3 text-sm text-gray-700 dark:text-gray-300">
                                                                                                {row.purchaseCount} · {formatUsdFromCents(row.purchasesCents)}
                                                                                            </td>
                                                                                            <td className="p-3 text-sm text-gray-700 dark:text-gray-300">
                                                                                                {row.tipCount} · {formatUsdFromCents(row.tipsCents)}
                                                                                            </td>
                                                                                            <td className="p-3">
                                                                                                {row.directoryOnly ? (
                                                                                                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                                                                                        Manage/Delete need a real{' '}
                                                                                                        <span className="font-mono">users/</span> account row.
                                                                                                    </span>
                                                                                                ) : (
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
                                                                                                )}
                                                                                            </td>
                                                                                        </tr>
                                                                                        {renderCreatorHubRosterBlock(row.user, 6)}
                                                                                        </React.Fragment>
                                                                                        );
                                                                                    })}
                                                                                    {fanBuyerSummaryBundle.unassigned.map((user) => (
                                                                                        <tr key={`fanhub-unassigned-${user.id}`} className="border-t border-cyan-100 dark:border-cyan-900/30 bg-amber-50/30 dark:bg-amber-900/10">
                                                                                            <td className="p-3">
                                                                                                <div className="flex items-center space-x-3">
                                                                                                    <img
                                                                                                        src={user.avatar}
                                                                                                        alt={fanHubMemberTableLabel(user, fanHubProfileFor(user))}
                                                                                                        className="w-10 h-10 rounded-full"
                                                                                                    />
                                                                                                    <div>
                                                                                                        <p className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                                                                                            {fanHubMemberTableLabel(user, fanHubProfileFor(user))}
                                                                                                            {getUserOriginBadge(user, { fanHubConsumerInSummary: true })}
                                                                                                        </p>
                                                                                                        <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                                                                                                        <p className="text-[11px] text-amber-800 dark:text-amber-200">
                                                                                                            No membership row synced for this account yet.
                                                                                                        </p>
                                                                                                    </div>
                                                                                                </div>
                                                                                            </td>
                                                                                            <td className="p-3 text-sm text-gray-500 dark:text-gray-400">—</td>
                                                                                            <td className="p-3 text-sm text-gray-500 dark:text-gray-400">—</td>
                                                                                            <td className="p-3 text-sm text-gray-500 dark:text-gray-400">—</td>
                                                                                            <td className="p-3 text-sm text-gray-500 dark:text-gray-400">—</td>
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
                                                    );
                                                })() : (
                                                    <tr className="bg-cyan-50/20 dark:bg-cyan-900/10">
                                                        <td colSpan={6} className="p-3 text-xs text-cyan-800 dark:text-cyan-200 border-b border-cyan-200 dark:border-cyan-900/40">
                                                            Buyer summary is collapsed. Click Show members to expand.
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