import React, { useEffect, useState } from 'react';
import { useAppContext } from './AppContext';
import { CopyIcon, SparklesIcon, SettingsIcon, XMarkIcon } from './icons/UIIcons';
import { OnlyFansContentBrain } from './OnlyFansContentBrain';
import { OnlyFansRoleplay } from './OnlyFansRoleplay';
import { OnlyFansStudioSettings } from './OnlyFansStudioSettings';
import { OnlyFansExportHub } from './OnlyFansExportHub';
import { OnlyFansCalendar } from './OnlyFansCalendar';
import { OnlyFansMediaVault } from './OnlyFansMediaVault';
import { OnlyFansGuides } from './OnlyFansGuides';
import { OnlyFansAnalytics } from './OnlyFansAnalytics';
import { OnlyFansFans } from './OnlyFansFans';
import { ErrorBoundary } from './ErrorBoundary';
import { auth, db } from '../firebaseConfig';
import { addDoc, collection, getDocs, limit, orderBy, query, Timestamp, doc, getDoc, where } from 'firebase/firestore';
import { UserIcon } from './icons/UIIcons';
type ActiveView = 'dashboard' | 'contentBrain' | 'roleplay' | 'calendar' | 'mediaVault' | 'export' | 'guides' | 'settings' | 'analytics' | 'fans';

type TeaserPack = {
    instagram?: { reelHooks?: string[]; caption?: string; storyFrames?: string[] };
    x?: { posts?: string[] };
    tiktok?: { hooks?: string[]; caption?: string };
    ctas?: string[];
};

export const OnlyFansStudio: React.FC = () => {
    const { user, setActivePage, showToast } = useAppContext();
    const [activeView, setActiveView] = useState<ActiveView>('dashboard');
    const [showTeaserPackModal, setShowTeaserPackModal] = useState(false);
    const [teaserPromotionType, setTeaserPromotionType] = useState<'PPV' | 'New set' | 'Promo' | 'General tease'>('PPV');
    const [teaserConcept, setTeaserConcept] = useState('');
    const [teaserTone, setTeaserTone] = useState<'Teasing' | 'Flirty' | 'Explicit'>('Teasing');
    const [isGeneratingTeaserPack, setIsGeneratingTeaserPack] = useState(false);
    const [teaserPack, setTeaserPack] = useState<TeaserPack | null>(null);
    const [teaserError, setTeaserError] = useState<string | null>(null);
    const [savedTeaserPacks, setSavedTeaserPacks] = useState<Array<{ id: string; createdAt?: any; data?: any }>>([]);
    const [isLoadingSavedTeaserPacks, setIsLoadingSavedTeaserPacks] = useState(false);
    const [creatorPersonality, setCreatorPersonality] = useState('');
    const [useCreatorPersonalityTeaserPack, setUseCreatorPersonalityTeaserPack] = useState(false);
    const [aiPersonality, setAiPersonality] = useState('');
    const [aiTone, setAiTone] = useState('');
    const [explicitnessLevel, setExplicitnessLevel] = useState(7);

    // Fan widgets state
    const [fans, setFans] = useState<any[]>([]);
    const [fanStats, setFanStats] = useState({ total: 0, active: 0, vip: 0, upcomingSessions: 0 });
    const [recentFanActivity, setRecentFanActivity] = useState<any[]>([]);
    const [vipFansNeedingAttention, setVipFansNeedingAttention] = useState<any[]>([]);
    const [upcomingSessions, setUpcomingSessions] = useState<any[]>([]);
    const [isLoadingFanData, setIsLoadingFanData] = useState(false);

    // Check if user has access (OnlyFansStudio, Elite, or Agency plan)
    const hasAccess = user?.plan === 'OnlyFansStudio' || user?.plan === 'Elite' || user?.plan === 'Agency';

    // Lightweight usage tracking (best-effort)
    useEffect(() => {
        if (!hasAccess) return;
        if (!user?.id) return;
        (async () => {
            try {
                const { logUsageEventOncePerDay } = await import('../src/services/usageEvents');
                await logUsageEventOncePerDay(user.id, 'onlyfans_studio_opened', { plan: user.plan });
            } catch {
                // ignore
            }
        })();
    }, [hasAccess, user?.id, user?.plan]);

    async function loadRecentTeaserPacks() {
        if (!user?.id) return;
        setIsLoadingSavedTeaserPacks(true);
        try {
            // Avoid composite indexes: fetch recent history and filter client-side.
            const historyRef = collection(db, 'users', user.id, 'onlyfans_content_brain_history');
            const q = query(historyRef, orderBy('createdAt', 'desc'), limit(25));
            const snap = await getDocs(q);
            const items: Array<{ id: string; createdAt?: any; data?: any }> = [];
            snap.forEach((d) => {
                const row: any = d.data();
                if (row?.type === 'teaser_pack') {
                    items.push({ id: d.id, createdAt: row.createdAt, data: row.data });
                }
            });
            setSavedTeaserPacks(items.slice(0, 5));
        } catch (e) {
            console.warn('Failed to load teaser pack history:', e);
            setSavedTeaserPacks([]);
        } finally {
            setIsLoadingSavedTeaserPacks(false);
        }
    }

    // Load recent teaser packs when modal opens (must be unconditional hook to avoid hook order issues)
    useEffect(() => {
        if (!showTeaserPackModal) return;
        loadRecentTeaserPacks();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showTeaserPackModal, user?.id]);

    useEffect(() => {
        const loadCreatorPersonality = async () => {
            if (!user?.id) return;
            try {
                const userDoc = await getDoc(doc(db, 'users', user.id));
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    setCreatorPersonality(data.creatorPersonality || '');
                    setAiPersonality(data.aiPersonality || '');
                    setAiTone(data.aiTone || '');
                    setExplicitnessLevel(data.explicitnessLevel ?? 7);
                }
            } catch (error) {
                console.error('Error loading creator personality:', error);
            }
        };
        loadCreatorPersonality();
    }, [user?.id]);

    // Load fan data for dashboard widgets
    const loadFanData = async () => {
        if (!user?.id || activeView !== 'dashboard') return;
        setIsLoadingFanData(true);
        try {
            // Load all fans
            const fansSnap = await getDocs(collection(db, 'users', user.id, 'onlyfans_fan_preferences'));
            const fansList = fansSnap.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    name: data.name || doc.id,
                    preferences: {
                        ...data,
                        spendingLevel: data.spendingLevel || 0,
                        totalSessions: data.totalSessions || 0,
                        isBigSpender: data.isBigSpender || false,
                        isLoyalFan: data.isLoyalFan || false,
                        subscriptionTier: (() => {
                            // Migrate old 'VIP' or 'Regular' tiers to 'Paid' or 'Free'
                            const tier = data.subscriptionTier;
                            if (tier === 'VIP' || tier === 'Regular') {
                                return 'Paid';
                            }
                            return tier || 'Free';
                        })(),
                        isVIP: data.isVIP || false,  // Only use checkbox value, not auto-set from spending
                        lastSessionDate: data.lastSessionDate,
                        engagementHistory: data.engagementHistory || []
                    }
                };
            });
            setFans(fansList);

            // Calculate stats
            const now = Date.now();
            const activeFans = fansList.filter(f => {
                if (!f.preferences.lastSessionDate) return false;
                const lastSession = new Date(f.preferences.lastSessionDate).getTime();
                const daysSince = (now - lastSession) / (1000 * 60 * 60 * 24);
                return daysSince <= 30;
            });

            const vipFans = fansList.filter(f => f.preferences.isVIP === true);
            const bigSpenders = fansList.filter(f => f.preferences.isBigSpender || (f.preferences.spendingLevel || 0) >= 4);

            // Load upcoming sessions from calendar (both OnlyFans calendar and regular calendar)
            try {
                // Try OnlyFans calendar events first
                let upcoming: any[] = [];
                try {
                    const onlyfansCalendarSnap = await getDocs(query(
                        collection(db, 'users', user.id, 'onlyfans_calendar_events'),
                        orderBy('date', 'asc')
                    ));
                    onlyfansCalendarSnap.docs.forEach(d => {
                        const data = d.data();
                        upcoming.push({ id: d.id, ...data });
                    });
                } catch (e) {
                    console.warn('OnlyFans calendar events not found or error:', e);
                }

                // Also check saved session plans (they may have scheduled dates)
                try {
                    const sessionPlansSnap = await getDocs(query(
                        collection(db, 'users', user.id, 'onlyfans_saved_session_plans'),
                        orderBy('savedAt', 'desc'),
                        limit(20)
                    ));
                    sessionPlansSnap.docs.forEach(d => {
                        const data = d.data();
                        // If session plan has a scheduled date and fan info, include it
                        if (data.scheduledDate && (data.fanId || data.fanName)) {
                            upcoming.push({
                                id: `session-${d.id}`,
                                title: `Session: ${data.sessionType || 'Session'}`,
                                date: data.scheduledDate,
                                fanId: data.fanId,
                                fanName: data.fanName,
                                type: 'session'
                            });
                        }
                    });
                } catch (e) {
                    console.warn('Session plans error:', e);
                }

                // Also check regular calendar events
                try {
                    const calendarSnap = await getDocs(query(
                        collection(db, 'users', user.id, 'calendar_events'),
                        orderBy('date', 'asc')
                    ));
                    calendarSnap.docs.forEach(d => {
                        const data = d.data();
                        // Only include if it's OnlyFans-related or has fanId
                        if (data.platform === 'OnlyFans' || data.fanId || data.fanName) {
                            upcoming.push({ id: d.id, ...data });
                        }
                    });
                } catch (e) {
                    console.warn('Regular calendar events error:', e);
                }

                // Filter and sort upcoming events
                const filteredUpcoming = upcoming
                    .filter((event: any) => {
                        if (!event.date) return false;
                        const eventDate = event.date?.toDate ? event.date.toDate() : new Date(event.date);
                        const daysUntil = (eventDate.getTime() - now) / (1000 * 60 * 60 * 24);
                        return daysUntil >= 0 && daysUntil <= 7;
                    })
                    .sort((a: any, b: any) => {
                        const dateA = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime();
                        const dateB = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime();
                        return dateA - dateB;
                    })
                    .slice(0, 5);
                setUpcomingSessions(filteredUpcoming);

                // Count sessions with fan assignments
                const fanSessions = filteredUpcoming.filter((e: any) => e.fanId || e.fanName);
                setFanStats({
                    total: fansList.length,
                    active: activeFans.length,
                    vip: vipFans.length,
                    upcomingSessions: fanSessions.length
                });
            } catch (e) {
                console.warn('Error loading calendar events:', e);
            }

            // Recent fan activity (last 5 sessions from engagement history)
            const recentActivity: any[] = [];
            fansList.forEach(fan => {
                if (fan.preferences.engagementHistory && Array.isArray(fan.preferences.engagementHistory)) {
                    fan.preferences.engagementHistory.slice(0, 2).forEach((session: any) => {
                        recentActivity.push({
                            fanId: fan.id,
                            fanName: fan.name,
                            sessionType: session.sessionType || 'Session',
                            date: session.date || '',
                            sessionId: session.sessionId
                        });
                    });
                }
            });
            recentActivity.sort((a, b) => {
                const dateA = a.date ? new Date(a.date).getTime() : 0;
                const dateB = b.date ? new Date(b.date).getTime() : 0;
                return dateB - dateA;
            });
            setRecentFanActivity(recentActivity.slice(0, 5));

            // VIP fans needing attention (inactive > 7 days)
            const vipNeedingAttention = vipFans.filter(f => {
                if (!f.preferences.lastSessionDate) return true;
                const lastSession = new Date(f.preferences.lastSessionDate).getTime();
                const daysSince = (now - lastSession) / (1000 * 60 * 60 * 24);
                return daysSince > 7;
            }).slice(0, 5);
            setVipFansNeedingAttention(vipNeedingAttention);

        } catch (error) {
            console.error('Error loading fan data:', error);
        } finally {
            setIsLoadingFanData(false);
        }
    };

    // Load fan data when dashboard is active
    useEffect(() => {
        if (activeView === 'dashboard' && user?.id) {
            loadFanData();
        }
    }, [activeView, user?.id]);

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            showToast?.('Copied to clipboard!', 'success');
        } catch {
            showToast?.('Copy failed. Please try again.', 'error');
        }
    };

    const buildTeaserPackText = (pack: TeaserPack) => {
        const igHooks = pack.instagram?.reelHooks?.length ? pack.instagram.reelHooks.map((h) => `- ${h}`).join('\n') : '';
        const igStories = pack.instagram?.storyFrames?.length ? pack.instagram.storyFrames.map((s, i) => `${i + 1}. ${s}`).join('\n') : '';
        const xPosts = pack.x?.posts?.length ? pack.x.posts.map((p, i) => `${i + 1}. ${p}`).join('\n') : '';
        const tkHooks = pack.tiktok?.hooks?.length ? pack.tiktok.hooks.map((h) => `- ${h}`).join('\n') : '';
        const ctas = pack.ctas?.length ? pack.ctas.map((c, i) => `${i + 1}. ${c}`).join('\n') : '';

        return [
            'INSTAGRAM',
            igHooks ? `Reel hooks:\n${igHooks}` : '',
            pack.instagram?.caption ? `Caption:\n${pack.instagram.caption}` : '',
            igStories ? `Story frames:\n${igStories}` : '',
            '',
            'X (TWITTER)',
            xPosts ? xPosts : '',
            '',
            'TIKTOK',
            tkHooks ? `Hooks:\n${tkHooks}` : '',
            pack.tiktok?.caption ? `Caption:\n${pack.tiktok.caption}` : '',
            '',
            'CTAs',
            ctas ? ctas : '',
        ].filter(Boolean).join('\n\n');
    };

    const handleGenerateTeaserPack = async () => {
        if (!user?.id) return;
        if (!teaserConcept.trim()) {
            showToast?.('Add a one-line concept first.', 'error');
            return;
        }
        setIsGeneratingTeaserPack(true);
        setTeaserError(null);
        setTeaserPack(null);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            const creatorContext = useCreatorPersonalityTeaserPack && creatorPersonality
                ? creatorPersonality
                : '';
            const resp = await fetch('/api/generateTeaserPack', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    promotionType: teaserPromotionType,
                    concept: teaserConcept.trim(),
                    tone: teaserTone,
                    creatorPersonality: creatorContext,
                    aiPersonality: aiPersonality || '',
                    aiTone: aiTone || '',
                    explicitnessLevel: explicitnessLevel ?? 7,
                }),
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok || data?.success === false) {
                throw new Error(data?.error || 'Failed to generate teaser pack');
            }
            setTeaserPack(data.pack || null);
            showToast?.('Teaser pack generated!', 'success');

            // Usage tracking (best-effort)
            try {
                const { logUsageEvent } = await import('../src/services/usageEvents');
                await logUsageEvent(user.id, 'of_generate_teaser_pack', { promotionType: teaserPromotionType, tone: teaserTone });
            } catch {
                // ignore
            }
        } catch (e: any) {
            console.error('Teaser pack generation failed:', e);
            setTeaserError(e?.message || 'Teaser pack generation failed');
            showToast?.(e?.message || 'Teaser pack generation failed', 'error');
        } finally {
            setIsGeneratingTeaserPack(false);
        }
    };

    const handleSaveTeaserPack = async () => {
        if (!user?.id || !teaserPack) return;
        try {
            await addDoc(collection(db, 'users', user.id, 'onlyfans_content_brain_history'), {
                type: 'teaser_pack',
                title: `Teaser Pack - ${new Date().toLocaleDateString()}`,
                data: {
                    promotionType: teaserPromotionType,
                    concept: teaserConcept.trim(),
                    tone: teaserTone,
                    pack: teaserPack,
                },
                createdAt: Timestamp.now(),
            });
            showToast?.('Saved to history!', 'success');
            // Refresh recent list (best-effort)
            try {
                await loadRecentTeaserPacks();
            } catch {
                // ignore
            }
        } catch (e) {
            console.warn('Failed to save teaser pack:', e);
            showToast?.('Failed to save teaser pack.', 'error');
        }
    };

    if (!hasAccess) {
        return (
            <div className="max-w-4xl mx-auto">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
                    <SparklesIcon className="w-16 h-16 mx-auto mb-4 text-primary-600 dark:text-primary-400" />
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                        Monetized Creator Studio
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 italic">
                        Built for OnlyFans, Fansly, Fanvue & more
                    </p>
                    <p className="text-lg text-gray-600 dark:text-gray-400 mb-6">
                        Upgrade to <strong>Creator Elite</strong> or <strong>Agency</strong> to unlock Monetized Creator Studio.
                    </p>
                    <p className="text-gray-500 dark:text-gray-500 mb-8">
                        Monetized Creator Studio provides content planning, roleplay ideas, chatting sessions, 
                        fan management, content calendars, and export packages for manual upload.
                    </p>
                    <button
                        onClick={() => setActivePage('pricing')}
                        className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-semibold"
                    >
                        View Plans & Upgrade
                    </button>
                </div>
            </div>
        );
    }

    // If a specific view is active, show that view
    if (activeView === 'contentBrain') {
        return (
            <div className="max-w-7xl mx-auto">
                <button
                    onClick={() => setActiveView('dashboard')}
                    className="mb-4 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-2"
                >
                    ← Back to Monetized Creator Studio
                </button>
                <ErrorBoundary>
                    <OnlyFansContentBrain />
                </ErrorBoundary>
            </div>
        );
    }

    if (activeView === 'roleplay') {
        return (
            <div className="max-w-7xl mx-auto">
                <div className="mb-4 flex items-center gap-3 flex-wrap">
                    <button
                        onClick={() => setActiveView('dashboard')}
                        className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-2"
                    >
                        ← Back to Monetized Creator Studio
                    </button>
                </div>
                <OnlyFansRoleplay />
            </div>
        );
    }

    if (activeView === 'settings') {
        return (
            <div className="max-w-7xl mx-auto">
                <div className="mb-4 flex items-center gap-3 flex-wrap">
                    <button
                        onClick={() => setActiveView('dashboard')}
                        className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-2"
                    >
                        ← Back to Monetized Creator Studio
                    </button>
                </div>
                <OnlyFansStudioSettings />
            </div>
        );
    }

    if (activeView === 'export') {
        return (
            <div className="max-w-7xl mx-auto">
                <div className="mb-4 flex items-center gap-3 flex-wrap">
                    <button
                        onClick={() => setActiveView('dashboard')}
                        className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-2"
                    >
                        ← Back to Monetized Creator Studio
                    </button>
                </div>
                <OnlyFansExportHub />
            </div>
        );
    }

    if (activeView === 'calendar') {
        return (
            <div className="max-w-7xl mx-auto">
                <div className="mb-4 flex items-center gap-3 flex-wrap">
                    <button
                        onClick={() => setActiveView('dashboard')}
                        className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-2"
                    >
                        ← Back to Monetized Creator Studio
                    </button>
                </div>
                <OnlyFansCalendar onNavigateToContentBrain={() => setActiveView('contentBrain')} />
            </div>
        );
    }

    if (activeView === 'mediaVault') {
        return (
            <div className="max-w-7xl mx-auto">
                <div className="mb-4 flex items-center gap-3 flex-wrap">
                    <button
                        onClick={() => setActiveView('dashboard')}
                        className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-2"
                    >
                        ← Back to Monetized Creator Studio
                    </button>
                </div>
                <OnlyFansMediaVault />
            </div>
        );
    }

    if (activeView === 'guides') {
        return (
            <div className="max-w-7xl mx-auto">
                <div className="mb-4 flex items-center gap-3 flex-wrap">
                    <button
                        onClick={() => setActiveView('dashboard')}
                        className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-2"
                    >
                        ← Back to Monetized Creator Studio
                    </button>
                </div>
                <OnlyFansGuides />
            </div>
        );
    }

    if (activeView === 'analytics') {
        return (
            <div className="max-w-7xl mx-auto">
                <div className="mb-4 flex items-center gap-3 flex-wrap">
                    <button
                        onClick={() => setActiveView('dashboard')}
                        className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-2"
                    >
                        ← Back to Monetized Creator Studio
                    </button>
                </div>
                <ErrorBoundary>
                    <OnlyFansAnalytics />
                </ErrorBoundary>
            </div>
        );
    }

    if (activeView === 'fans') {
        return (
            <div className="max-w-7xl mx-auto">
                <div className="mb-4 flex items-center gap-3 flex-wrap">
                    <button
                        onClick={() => setActiveView('dashboard')}
                        className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-2"
                    >
                        ← Back to Monetized Creator Studio
                    </button>
                </div>
                <ErrorBoundary>
                    <OnlyFansFans />
                </ErrorBoundary>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto">
            {/* Funnel Teaser Pack Modal */}
            {showTeaserPackModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Funnel Teaser Pack</h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Generate IG/X/TikTok teasers + CTAs to drive subscribers (manual posting).</p>
                            </div>
                            <button
                                onClick={() => setShowTeaserPackModal(false)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <XMarkIcon className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 space-y-4">
                            {/* Recent teaser packs */}
                            <div className="bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Recent teaser packs</p>
                                    <button
                                        onClick={loadRecentTeaserPacks}
                                        className="text-xs font-semibold text-primary-600 dark:text-primary-300 hover:underline"
                                    >
                                        Refresh
                                    </button>
                                </div>
                                <div className="mt-3 space-y-2">
                                    {isLoadingSavedTeaserPacks ? (
                                        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
                                    ) : savedTeaserPacks.length === 0 ? (
                                        <p className="text-sm text-gray-500 dark:text-gray-400">No saved teaser packs yet.</p>
                                    ) : (
                                        savedTeaserPacks.map((item) => {
                                            const d: any = item.data || {};
                                            const pack: TeaserPack | null = d.pack || null;
                                            const created =
                                                item.createdAt?.toDate
                                                    ? item.createdAt.toDate().toLocaleDateString()
                                                    : '';
                                            const label = `${d.promotionType || 'Teaser'} · ${d.tone || ''}`.trim();
                                            return (
                                                <div
                                                    key={item.id}
                                                    className="flex items-start justify-between gap-3 p-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/40"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">{created || 'Saved'}</p>
                                                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{d.concept || 'Teaser pack'}</p>
                                                        <p className="text-xs text-gray-600 dark:text-gray-400">{label}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <button
                                                            onClick={() => {
                                                                setTeaserPromotionType((d.promotionType as any) || 'PPV');
                                                                setTeaserTone((d.tone as any) || 'Teasing');
                                                                setTeaserConcept(d.concept || '');
                                                                setTeaserPack(pack);
                                                                setTeaserError(null);
                                                                showToast?.('Loaded saved teaser pack.', 'success');
                                                            }}
                                                            className="text-xs font-semibold text-primary-600 dark:text-primary-300 hover:underline"
                                                        >
                                                            Load
                                                        </button>
                                                        {pack && (
                                                            <button
                                                                onClick={() => copyToClipboard(buildTeaserPackText(pack))}
                                                                className="text-xs font-semibold text-primary-600 dark:text-primary-300 hover:underline flex items-center gap-1"
                                                            >
                                                                <CopyIcon className="w-3.5 h-3.5" />
                                                                Copy
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Promoting</label>
                                    <select
                                        value={teaserPromotionType}
                                        onChange={(e) => setTeaserPromotionType(e.target.value as any)}
                                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="PPV">PPV</option>
                                        <option value="New set">New set</option>
                                        <option value="Promo">Promo</option>
                                        <option value="General tease">General tease</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Tone</label>
                                    <select
                                        value={teaserTone}
                                        onChange={(e) => setTeaserTone(e.target.value as any)}
                                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="Teasing">Teasing</option>
                                        <option value="Flirty">Flirty</option>
                                        <option value="Explicit">Explicit</option>
                                    </select>
                                </div>
                                <div className="md:col-span-1">
                                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Concept (one line)</label>
                                    <input
                                        value={teaserConcept}
                                        onChange={(e) => setTeaserConcept(e.target.value)}
                                        placeholder="e.g., gym mirror tease → full set inside"
                                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setUseCreatorPersonalityTeaserPack(prev => !prev)}
                                    disabled={!creatorPersonality}
                                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                                        useCreatorPersonalityTeaserPack
                                            ? 'bg-primary-600 text-white hover:bg-primary-700'
                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    } ${!creatorPersonality ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    title={!creatorPersonality ? 'Add a creator personality in Settings → AI Training to enable' : undefined}
                                >
                                    <SparklesIcon className="w-4 h-4" />
                                    Personality
                                </button>
                            </div>

                            <div className="flex items-center justify-between gap-3">
                                <button
                                    onClick={handleGenerateTeaserPack}
                                    disabled={isGeneratingTeaserPack}
                                    className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-60"
                                >
                                    {isGeneratingTeaserPack ? 'Generating…' : 'Generate pack'}
                                </button>

                                {teaserPack && (
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => copyToClipboard(buildTeaserPackText(teaserPack))}
                                            className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center gap-2"
                                        >
                                            <CopyIcon className="w-4 h-4" />
                                            Copy all
                                        </button>
                                        <button
                                            onClick={handleSaveTeaserPack}
                                            className="px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                                        >
                                            Save
                                        </button>
                                    </div>
                                )}
                            </div>

                            {teaserError && (
                                <div className="text-sm text-red-600 dark:text-red-400">{teaserError}</div>
                            )}

                            {teaserPack && (
                                <div className="space-y-3">
                                    <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Instagram</p>
                                        <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200 font-sans">{buildTeaserPackText({ instagram: teaserPack.instagram, ctas: teaserPack.ctas })}</pre>
                                    </div>
                                    <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">X</p>
                                        <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200 font-sans">{buildTeaserPackText({ x: teaserPack.x })}</pre>
                                    </div>
                                    <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">TikTok</p>
                                        <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200 font-sans">{buildTeaserPackText({ tiktok: teaserPack.tiktok })}</pre>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <SparklesIcon className="w-8 h-8 text-primary-600 dark:text-primary-400" />
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                            Monetized Creator Studio
                        </h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 italic mt-1">
                            Built for OnlyFans, Fansly, Fanvue & more
                        </p>
                    </div>
                </div>
                <p className="text-gray-600 dark:text-gray-400 mt-2">
                    Your AI-powered content and monetization brain. Plan, create, and organize premium content.
                </p>
            </div>

            {/* Important Notice */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Important:</strong> Monetized Creator Studio does not integrate with or access your premium platform accounts (OnlyFans, Fansly, Fanvue, etc.). 
                    This is a planning and content creation tool. All content must be reviewed and uploaded manually to your platform of choice.
                </p>
            </div>

            {/* Quick Fan Stats Bar */}
            {fans.length > 0 && (
                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg border border-purple-200 dark:border-purple-800 p-4 mb-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center">
                            <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">{fanStats.total}</div>
                            <div className="text-xs text-purple-700 dark:text-purple-300 mt-1">Total Fans</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{fanStats.active}</div>
                            <div className="text-xs text-purple-700 dark:text-purple-300 mt-1">Active (30d)</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{fanStats.vip}</div>
                            <div className="text-xs text-purple-700 dark:text-purple-300 mt-1">VIP Fans</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{fanStats.upcomingSessions}</div>
                            <div className="text-xs text-purple-700 dark:text-purple-300 mt-1">Upcoming Sessions</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Dashboard Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Content Brain Card */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                        Content Brain
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
                        Generate caption ideas, post ideas, shoot concepts, and weekly content plans.
                    </p>
                    <button
                        className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
                        onClick={() => setActiveView('contentBrain')}
                    >
                        Open Content Brain
                    </button>
                </div>

                {/* Roleplay & Interactive Ideas Card */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                        Roleplay & Interactive Ideas
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
                        Generate roleplay scenarios, persona ideas, body rating prompts, and interactive post concepts.
                    </p>
                    <button
                        className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
                        onClick={() => setActiveView('roleplay')}
                    >
                        Generate Ideas
                    </button>
                </div>

                {/* Funnel Teaser Pack Card (3rd card in the first row on lg screens) */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow border border-primary-100 dark:border-primary-900/40">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                        Funnel Teaser Pack
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
                        Generate IG/X/TikTok teaser copy + subscriber CTAs for your next promo (manual posting).
                    </p>
                    <button
                        className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
                        onClick={() => setShowTeaserPackModal(true)}
                    >
                        Open Teaser Pack
                    </button>
                </div>

                {/* Content Calendar Card */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                        My Schedule
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
                        Plan your posting schedule with manual upload reminders and content pacing.
                    </p>
                    <button
                        className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
                        onClick={() => setActiveView('calendar')}
                    >
                        View Calendar
                    </button>
                </div>

                {/* Media Vault Card */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                        Media Vault
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
                        Organize photos, videos, and teasers with AI tagging and basic editing tools.
                    </p>
                    <button
                        className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
                        onClick={() => setActiveView('mediaVault')}
                    >
                        Open Media Vault
                    </button>
                </div>

                {/* Export Hub Card */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                        Export Hub
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
                        Generate ready-to-upload content packages with captions, media, and checklists.
                    </p>
                    <button
                        className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
                        onClick={() => setActiveView('export')}
                    >
                        Create Export Package
                    </button>
                </div>

                {/* Guides & Tips Card */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                        Guides & Tips
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
                        Step-by-step upload guides, best practices, and monetization strategy tips.
                    </p>
                    <button
                        className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
                        onClick={() => setActiveView('guides')}
                    >
                        View Guides
                    </button>
                </div>

                {/* Analytics & Insights Card */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                        Analytics & Insights
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
                        Track content generation, media stats, and manual performance metrics.
                    </p>
                    <button
                        className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
                        onClick={() => setActiveView('analytics')}
                    >
                        View Analytics
                    </button>
                </div>

                {/* Fans Card */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                        Fans
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
                        Manage fan relationships, track engagement, and personalize content across all features.
                    </p>
                    <button
                        className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
                        onClick={() => setActiveView('fans')}
                    >
                        Manage Fans
                    </button>
                </div>

                {/* Settings Card */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                        Settings
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
                        Manage your profile, AI training, billing, and preferences.
                    </p>
                    <button
                        className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                        onClick={() => setActiveView('settings')}
                    >
                        <SettingsIcon className="w-4 h-4" />
                        Open Settings
                    </button>
                </div>
            </div>

            {/* Fan Activity Dashboard */}
            {fans.length > 0 ? (
                <div className="mt-8 space-y-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                        📋 Fan Activity Dashboard
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Recent Fan Activity */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                <SparklesIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                                Recent Activity
                            </h3>
                            {isLoadingFanData ? (
                                <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
                            ) : recentFanActivity.length > 0 ? (
                                <div className="space-y-3">
                                    {recentFanActivity.map((activity, idx) => (
                                        <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-900/40 rounded-lg border border-gray-200 dark:border-gray-700">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                        {activity.fanName}
                                                    </div>
                                                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                                        {activity.sessionType}
                                                    </div>
                                                </div>
                                                {activity.date && (
                                                    <div className="text-xs text-gray-500 dark:text-gray-500 ml-2 whitespace-nowrap">
                                                        {new Date(activity.date).toLocaleDateString()}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500 dark:text-gray-400">No recent activity yet</p>
                            )}
                            <button
                                onClick={() => setActiveView('fans')}
                                className="mt-4 w-full text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
                            >
                                View All Fans →
                            </button>
                        </div>

                        {/* VIP Fans Needing Attention */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                <span className="text-yellow-600 dark:text-yellow-400">👑</span>
                                VIP Fans Needing Attention
                            </h3>
                            {isLoadingFanData ? (
                                <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
                            ) : vipFansNeedingAttention.length > 0 ? (
                                <div className="space-y-3">
                                    {vipFansNeedingAttention.map((fan) => {
                                        const daysSince = fan.preferences.lastSessionDate 
                                            ? Math.floor((Date.now() - new Date(fan.preferences.lastSessionDate).getTime()) / (1000 * 60 * 60 * 24))
                                            : null;
                                        return (
                                            <div key={fan.id} className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                            {fan.name}
                                                        </div>
                                                        {daysSince !== null && (
                                                            <div className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                                                                {daysSince} days inactive
                                                            </div>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            setActiveView('roleplay');
                                                            // Could navigate to session planner with fan pre-selected
                                                        }}
                                                        className="ml-2 text-xs px-2 py-1 bg-primary-600 text-white rounded hover:bg-primary-700"
                                                    >
                                                        Start Session
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500 dark:text-gray-400">All VIP fans are active! 🎉</p>
                            )}
                            <button
                                onClick={() => setActiveView('fans')}
                                className="mt-4 w-full text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
                            >
                                View All VIP Fans →
                            </button>
                        </div>

                        {/* Upcoming Sessions */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                <span>📅</span>
                                Upcoming Sessions
                            </h3>
                            {isLoadingFanData ? (
                                <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
                            ) : upcomingSessions.length > 0 ? (
                                <div className="space-y-3">
                                    {upcomingSessions.slice(0, 5).map((session: any) => {
                                        const eventDate = session.date?.toDate ? session.date.toDate() : new Date(session.date);
                                        const daysUntil = Math.floor((eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                                        return (
                                            <div key={session.id} className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                            {session.fanName || session.title || 'Session'}
                                                        </div>
                                                        <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                                                            {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `In ${daysUntil} days`}
                                                        </div>
                                                    </div>
                                                    <div className="text-xs text-gray-500 dark:text-gray-500 ml-2 whitespace-nowrap">
                                                        {eventDate.toLocaleDateString()}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500 dark:text-gray-400">No upcoming sessions scheduled</p>
                            )}
                            <button
                                onClick={() => setActiveView('calendar')}
                                className="mt-4 w-full text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
                            >
                                View Calendar →
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                        Get Started with Fan Management
                    </h2>
                    <div className="space-y-3 text-gray-600 dark:text-gray-400">
                        <p className="text-sm">• Start a session in <strong>Roleplay & Interactive Ideas</strong> to create your first fan card</p>
                        <p className="text-sm">• Track fan preferences, spending, and engagement across all Monetized Creator Studio features</p>
                        <p className="text-sm">• Personalize content generation based on each fan's preferences</p>
                    </div>
                    <button
                        onClick={() => setActiveView('roleplay')}
                        className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
                    >
                        Start First Session →
                    </button>
                </div>
            )}
        </div>
    );
};
