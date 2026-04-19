import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from './AppContext';
import { usePremiumStudioTab, type PendingFansTabSelection } from './PremiumStudioLayout';
import { UserIcon, SearchIcon, StarIcon, SparklesIcon, TrashIcon, EditIcon, PlusIcon, XMarkIcon } from './icons/UIIcons';
import { auth, db } from '../firebaseConfig';
import { collection, getDocs, doc, getDoc, setDoc, deleteDoc, deleteField, updateDoc, query, orderBy, limit, Timestamp, where } from 'firebase/firestore';
import { fanHubListLabel, initialsFromFanLabel, safeUsernameForHandle } from '../src/lib/fanHubDisplay';
import { authUidFromFanDocId } from '../src/lib/compoundFanDocId';
import {
    buildFanPurchaseIdentity,
    calendarEventMatchesFanPurchaseIdentity,
    onlyfansCalendarEventIsCustomOrStore,
    orderMatchesFanPurchaseIdentity,
    type FanPurchaseIdentity,
} from '../src/lib/fanHubFanPurchaseIdentity';
import { buildCreatorImageUrlSet, fanAvatarUrlOrUndefined } from '../src/lib/fanAvatar';
import { isHubMembershipAccessExpired, parseDateLike, pickLatestMemberAccessEnd } from '../src/lib/memberAccessEnd';

function usernameFromFanDoc(fd: Record<string, unknown>): string | null {
  const keys = ['username', 'memberUsername', 'handle', 'instagram_handle', 'instagramHandle'] as const;
  for (const k of keys) {
    const v = fd[k];
    if (typeof v === 'string' && v.trim()) {
      return safeUsernameForHandle(v.replace(/^@/, ''));
    }
  }
  return null;
}

function normDisplayLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function subscriptionStatusFromFanDoc(fd: Record<string, unknown>): string | null {
  const s = fd.subscriptionStatus ?? fd.subscription_status;
  return typeof s === 'string' && s.trim() ? s.trim() : null;
}

function parseCancelAtPeriodEndFromFanDoc(d: Record<string, unknown>): boolean {
  const raw = d.cancelAtPeriodEnd ?? d.cancel_at_period_end;
  if (raw === true) return true;
  if (raw === false || raw == null) return false;
  if (typeof raw === 'string') {
    const t = raw.trim().toLowerCase();
    return t === 'true' || t === '1' || t === 'yes';
  }
  if (typeof raw === 'number') return raw === 1;
  return false;
}

/** Fan Hub grid / detail: photo from Firestore when available */
function FanGridAvatar({
  avatarUrl,
  name,
  sizeClass = 'w-12 h-12',
  muted = false,
}: {
  avatarUrl?: string | null;
  name: string;
  sizeClass?: string;
  /** Paid membership ended (Stripe mirror): soften avatar to match greyed card. */
  muted?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const url = typeof avatarUrl === 'string' ? avatarUrl.trim() : '';
  const showImg = url.length > 0 && !failed;
  return (
    <div
      className={`flex-shrink-0 rounded-full overflow-hidden flex items-center justify-center text-sm font-semibold ${sizeClass} ${
        showImg ? 'bg-gray-200 dark:bg-gray-600' : 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
      } ${muted ? 'opacity-80 grayscale' : ''}`}
    >
      {showImg ? (
        <img
          src={url}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        initialsFromFanLabel(name)
      )}
    </div>
  );
}

/** Match DM thread → Fans grid row by uid first, then display label / email on preferences. */
function findFanForPendingSelection(fans: Fan[], pending: PendingFansTabSelection): Fan | undefined {
  const id = pending.fanId.trim();
  let m = fans.find((f) => f.id === id);
  if (m) return m;
  m = fans.find((f) => f.id.toLowerCase() === id.toLowerCase());
  if (m) return m;

  const label = pending.displayLabel?.trim();
  if (!label) return undefined;
  const n = normDisplayLabel(label);
  const nBare = n.startsWith('@') ? n.slice(1) : n;

  m = fans.find((f) => normDisplayLabel(f.name) === n);
  if (m) return m;
  m = fans.find((f) => normDisplayLabel(f.name) === nBare);
  if (m) return m;

  for (const f of fans) {
    const pref = f.preferences as { email?: string };
    const em = typeof pref.email === 'string' ? pref.email.trim() : '';
    if (em) {
      const en = normDisplayLabel(em);
      if (en === n || em.toLowerCase() === label.toLowerCase()) return f;
    }
  }
  return undefined;
}

type FanActivityType = 'session' | 'rating' | 'content' | 'calendar' | 'media';

interface FanActivity {
    id: string;
    type: FanActivityType;
    date: string;
    title: string;
    description?: string;
    link?: string;
}

interface Fan {
    id: string;
    name: string;
    /** From creators/.../fans.avatarUrl or users/{fanId}.avatar / photoURL */
    avatarUrl?: string | null;
    /** From creators/.../fans subscription mirror: paid period ended (grey card; fan row kept for renewals). */
    hubMembershipExpired?: boolean;
    preferences: {
        preferredTone?: 'soft' | 'dominant' | 'playful' | 'dirty' | 'Bold';
        favoriteSessionType?: string;
        communicationStyle?: 'casual' | 'formal' | 'flirty' | 'direct' | 'like Bold';
        totalSessions?: number;
        spendingLevel?: number;
        subscriptionTier?: 'Free' | 'Paid';
        isVIP?: boolean;
        isWhale?: boolean;
        isRegular?: boolean;
        isLoyalFan?: boolean;
        isBigSpender?: boolean;
        lastSessionDate?: string;
        notes?: string;
        reminders?: Array<{ id: string; text: string; date: string }>;
        tags?: string[];
        email?: string;
        customContentNotes?: Record<string, string>;
        engagementHistory?: Array<{
            sessionId: string;
            date: string;
            sessionType: string;
            topics: string[];
            contentUsed: string[];
            notes: string;
        }>;
    };
}

type CustomDeliveryType = 'video' | 'image' | 'audio' | 'text' | 'link' | 'other' | null;

export const OnlyFansFans: React.FC = () => {
    const { user, showToast } = useAppContext();
    const fanHubTab = usePremiumStudioTab();
    const [fans, setFans] = useState<Fan[]>([]);
    const [selectedFan, setSelectedFan] = useState<Fan | null>(null);
    const [fanSearchQuery, setFanSearchQuery] = useState('');
    const [fanFilter, setFanFilter] = useState<'all' | 'bigSpenders' | 'loyal' | 'recent' | 'inactive'>('all');
    const [fanSortBy, setFanSortBy] = useState<'name' | 'sessions' | 'lastSession' | 'spendingLevel'>('lastSession');
    const [viewMode, setViewMode] = useState<'grid' | 'timeline'>('grid');
    const [activityTypeFilter, setActivityTypeFilter] = useState<FanActivityType | 'all'>('all');
    const [isLoading, setIsLoading] = useState(false);
    const [selectedFanActivity, setSelectedFanActivity] = useState<FanActivity[]>([]);
    const [showAddFanModal, setShowAddFanModal] = useState(false);
    const [showEditFanModal, setShowEditFanModal] = useState(false);
    const [editingFan, setEditingFan] = useState<Fan | null>(null);
    const [showScheduleSessionModal, setShowScheduleSessionModal] = useState(false);
    const [sessionFan, setSessionFan] = useState<Fan | null>(null);
    const [sessionDate, setSessionDate] = useState('');
    const [sessionTime, setSessionTime] = useState('20:00');
    const [expandedSessionFanId, setExpandedSessionFanId] = useState<string | null>(null);
    const [sessionHistory, setSessionHistory] = useState<Record<string, any[]>>({});
    const [isLoadingSessionHistory, setIsLoadingSessionHistory] = useState<Record<string, boolean>>({});
    const [customContent, setCustomContent] = useState<Array<{
        id: string;
        title: string;
        description?: string;
        date: string;
        status: 'ordered' | 'in-progress' | 'delivered' | 'cancelled';
        /** Calendar row vs Fan Hub Stripe product order */
        source: 'calendar' | 'order';
        amountCents?: number;
        deliveryType?: CustomDeliveryType;
        deliveryUrl?: string | null;
        deliveryText?: string | null;
        deliveredAt?: string | null;
    }>>([]);
    const [customContentTypeFilter, setCustomContentTypeFilter] = useState<'all' | 'video' | 'image' | 'audio' | 'text'>('all');
    const [contentPreview, setContentPreview] = useState<{ type: 'video' | 'image' | 'audio'; url: string } | null>(null);
    const [expandedCustomContentId, setExpandedCustomContentId] = useState<string | null>(null);
    const [customContentNoteDrafts, setCustomContentNoteDrafts] = useState<Record<string, string>>({});
    const [savingCustomContentNoteId, setSavingCustomContentNoteId] = useState<string | null>(null);
    const [isLoadingCustomContent, setIsLoadingCustomContent] = useState(false);
    const [editingCustomContentId, setEditingCustomContentId] = useState<string | null>(null);
    const [editCustomTitle, setEditCustomTitle] = useState('');
    const [editCustomDescription, setEditCustomDescription] = useState('');
    const [editCustomStatus, setEditCustomStatus] = useState<'ordered' | 'in-progress' | 'delivered' | 'cancelled'>('ordered');
    const [newFanName, setNewFanName] = useState('');
    const [newFanSpendingLevel, setNewFanSpendingLevel] = useState<number>(0);
    const [newFanTier, setNewFanTier] = useState<'Free' | 'Paid'>('Free');
    const [newFanType, setNewFanType] = useState<'Whale' | 'VIP' | 'Regular' | ''>('');
    const [newFanNotes, setNewFanNotes] = useState('');
    const [newFanPreferredTone, setNewFanPreferredTone] = useState<string>('');
    const [newFanFavoriteSessionType, setNewFanFavoriteSessionType] = useState<string>('');
    const [newFanCommunicationStyle, setNewFanCommunicationStyle] = useState<string>('');
    const [newFanLanguagePreferences, setNewFanLanguagePreferences] = useState<string>('');
    const [newFanSuggestedFlow, setNewFanSuggestedFlow] = useState<string>('');
    const [newFanPastNotes, setNewFanPastNotes] = useState<string>('');
    const [newFanBoundaries, setNewFanBoundaries] = useState<string>('');
    const [newFanBoundariesChecklist, setNewFanBoundariesChecklist] = useState<Record<string, boolean>>({
        noFacePhotos: false,
        noRealName: false,
        explicitContentOnly: false,
        noCustomRequests: false,
        timeBoundaryOnly: false,
    });
    const [isSavingFan, setIsSavingFan] = useState(false);
    const [showActivities, setShowActivities] = useState(false);
    const [blockingFanId, setBlockingFanId] = useState<string | null>(null);
    const fanDetailsPanelRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!contentPreview) return;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prevOverflow;
        };
    }, [contentPreview]);

    useEffect(() => {
        setExpandedCustomContentId(null);
        setCustomContentNoteDrafts({});
    }, [selectedFan?.id]);

    const getCustomContentNote = (itemId: string): string => {
        const drafts = customContentNoteDrafts[itemId];
        if (typeof drafts === 'string') return drafts;
        const fromProfile = selectedFan?.preferences?.customContentNotes?.[itemId];
        return typeof fromProfile === 'string' ? fromProfile : '';
    };

    const saveCustomContentNote = async (itemId: string) => {
        if (!user?.id || !selectedFan) return;
        setSavingCustomContentNoteId(itemId);
        try {
            const note = getCustomContentNote(itemId).trim();
            const fanRef = doc(db, 'users', user.id, 'onlyfans_fan_preferences', selectedFan.id);
            if (note) {
                await setDoc(
                    fanRef,
                    {
                        [`customContentNotes.${itemId}`]: note,
                        updatedAt: Timestamp.now(),
                    },
                    { merge: true }
                );
            } else {
                await updateDoc(fanRef, {
                    [`customContentNotes.${itemId}`]: deleteField(),
                    updatedAt: Timestamp.now(),
                });
            }
            setSelectedFan({
                ...selectedFan,
                preferences: {
                    ...selectedFan.preferences,
                    customContentNotes: {
                        ...(selectedFan.preferences.customContentNotes || {}),
                        ...(note ? { [itemId]: note } : {}),
                    },
                },
            });
            if (!note) {
                setSelectedFan((prev) => {
                    if (!prev) return prev;
                    const nextMap = { ...(prev.preferences.customContentNotes || {}) };
                    delete nextMap[itemId];
                    return {
                        ...prev,
                        preferences: {
                            ...prev.preferences,
                            customContentNotes: nextMap,
                        },
                    };
                });
            }
            showToast?.('Custom content note saved', 'success');
        } catch (error) {
            console.error('Error saving custom content note:', error);
            showToast?.('Failed to save note', 'error');
        } finally {
            setSavingCustomContentNoteId(null);
        }
    };

    const orderScheduleToCustomStatus = (
        s: string | undefined
    ): 'ordered' | 'in-progress' | 'delivered' | 'cancelled' => {
        const x = (s || 'pending').toLowerCase().replace(/\s+/g, '_');
        if (x === 'completed' || x === 'delivered') return 'delivered';
        if (x === 'scheduled' || x === 'confirmed' || x === 'in_progress') return 'in-progress';
        if (x === 'cancelled') return 'cancelled';
        return 'ordered';
    };

    const inferDeliveryType = (
        item: {
            deliveryType?: CustomDeliveryType;
            deliveryUrl?: string | null;
            deliveryText?: string | null;
        }
    ): 'video' | 'image' | 'audio' | 'text' | 'other' => {
        const explicit = (item.deliveryType || '').toLowerCase();
        if (explicit === 'video' || explicit === 'image' || explicit === 'audio' || explicit === 'text') {
            return explicit;
        }
        const u = String(item.deliveryUrl || '').trim().toLowerCase();
        if (u) {
            if (/\.(mp4|mov|webm|m4v)(\?|$)/.test(u)) return 'video';
            if (/\.(jpg|jpeg|png|webp|gif)(\?|$)/.test(u)) return 'image';
            if (/\.(mp3|wav|m4a|aac|ogg)(\?|$)/.test(u)) return 'audio';
        }
        if (String(item.deliveryText || '').trim()) return 'text';
        return 'other';
    };

    /**
     * Resolve emails + all fan id aliases (compound uid, guest_${cus}, etc.) — shared rules in
     * `src/lib/fanHubFanPurchaseIdentity.ts` so new creators/edge cases don’t need one-off UI patches.
     */
    async function loadFanPurchaseIdentityForCard(
        fanDocId: string,
        prefEmail: string | null | undefined,
        creatorId: string
    ): Promise<FanPurchaseIdentity> {
        let userEmail: string | null = null;
        let fanRowEmail: string | null = null;
        let stripeCustomerId: string | null = null;
        if (fanDocId && fanDocId !== creatorId) {
            const authUid = authUidFromFanDocId(fanDocId);
            try {
                const [uSnap, fSnap] = await Promise.all([
                    getDoc(doc(db, 'users', authUid)),
                    getDoc(doc(db, 'creators', creatorId, 'fans', fanDocId)),
                ]);
                if (uSnap.exists()) {
                    const u = uSnap.data() as Record<string, unknown>;
                    if (typeof u.email === 'string' && u.email.trim()) userEmail = u.email.trim();
                }
                if (fSnap.exists()) {
                    const f = fSnap.data() as Record<string, unknown>;
                    if (typeof f.email === 'string' && f.email.trim()) fanRowEmail = f.email.trim();
                    if (typeof f.stripeCustomerId === 'string' && f.stripeCustomerId.trim()) {
                        stripeCustomerId = f.stripeCustomerId.trim();
                    }
                }
            } catch {
                /* ignore */
            }
        }
        return buildFanPurchaseIdentity({
            fanUid: fanDocId,
            prefEmail,
            userEmail,
            fanRowEmail,
            stripeCustomerId,
        });
    }

    // Calendar custom events + Fan Hub store product orders (same data as User Management / Purchases)
    const loadCustomContent = async (fanId: string, fanEmail?: string | null) => {
        if (!user?.id) return;
        setIsLoadingCustomContent(true);
        const purchaseIdentity = await loadFanPurchaseIdentityForCard(fanId, fanEmail, user.id);
        try {
            const eventsSnap = await getDocs(collection(db, 'users', user.id, 'onlyfans_calendar_events'));
            const calendarItems = eventsSnap.docs
                .map((d) => {
                    const data = d.data();
                    return {
                        id: d.id,
                        ...data,
                    };
                })
                .filter(
                    (event: Record<string, unknown>) =>
                        onlyfansCalendarEventIsCustomOrStore(event) &&
                        calendarEventMatchesFanPurchaseIdentity(event, purchaseIdentity)
                )
                .map((event: Record<string, unknown> & { id: string }) => ({
                    id: event.id,
                    title: (event.title as string) || '',
                    description: (event.description as string) || '',
                    date: (event.date as string) || '',
                    status: (() => {
                        const cs = event.customStatus;
                        if (
                            cs === 'ordered' ||
                            cs === 'in-progress' ||
                            cs === 'delivered' ||
                            cs === 'cancelled'
                        ) {
                            return cs;
                        }
                        return orderScheduleToCustomStatus(
                            typeof event.treatStatus === 'string' ? event.treatStatus : undefined
                        );
                    })(),
                    source: 'calendar' as const,
                    deliveryType:
                        event.deliveryType === 'video' ||
                        event.deliveryType === 'image' ||
                        event.deliveryType === 'audio' ||
                        event.deliveryType === 'text' ||
                        event.deliveryType === 'link'
                            ? (event.deliveryType as CustomDeliveryType)
                            : null,
                    deliveryUrl: typeof event.deliveryUrl === 'string' ? event.deliveryUrl : null,
                    deliveryText: typeof event.deliveryText === 'string' ? event.deliveryText : null,
                    deliveredAt: typeof event.deliveredAt === 'string' ? event.deliveredAt : null,
                }))
                .filter((row) => {
                    const t = Date.parse(row.date);
                    return Number.isFinite(t);
                });

            let orderItems: typeof calendarItems = [];
            try {
                const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
                const res = await fetch('/api/creatorOrders?limit=1000', {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                if (res.ok) {
                    const data = (await res.json()) as {
                        orders?: Array<{
                            id: string;
                            fanId: string;
                            fanEmail?: string;
                            fanName?: string | null;
                            linkedFromGuestFanId?: string | null;
                            type: string;
                            productTitle?: string;
                            amountCents: number;
                            status: string;
                            createdAt: string;
                            scheduleStatus?: string;
                            scheduledDate?: string | null;
                            scheduledTime?: string | null;
                            deliveryType?: 'video' | 'image' | 'audio' | 'text' | 'link' | null;
                            deliveryUrl?: string | null;
                            deliveryText?: string | null;
                            deliveredAt?: string | null;
                        }>;
                    };
                    const orders = data.orders || [];
                    orderItems = orders
                        .filter(
                            (o) =>
                                (o.type === 'product' || o.type === 'live_stream_ticket') &&
                                o.status !== 'refunded' &&
                                orderMatchesFanPurchaseIdentity(o, purchaseIdentity)
                        )
                        .map((o) => {
                            const parts: string[] = [];
                            if (typeof o.amountCents === 'number' && o.amountCents > 0) {
                                parts.push(`$${(o.amountCents / 100).toFixed(2)}`);
                            }
                            if (o.scheduledDate) {
                                parts.push(`Scheduled ${o.scheduledDate}${o.scheduledTime ? ` ${o.scheduledTime}` : ''}`);
                            } else if (o.scheduleStatus && o.scheduleStatus !== 'pending') {
                                parts.push(`Fulfillment: ${o.scheduleStatus}`);
                            }
                            const title =
                                typeof o.productTitle === 'string' && o.productTitle.trim()
                                    ? o.productTitle.trim()
                                    : 'Store purchase';
                            return {
                                id: `order-${o.id}`,
                                title,
                                description: parts.length ? parts.join(' · ') : 'Fan Hub store',
                                date: o.createdAt || new Date(0).toISOString(),
                                status: orderScheduleToCustomStatus(o.scheduleStatus),
                                source: 'order' as const,
                                amountCents: o.amountCents,
                                deliveryType: o.deliveryType || null,
                                deliveryUrl: o.deliveryUrl || null,
                                deliveryText: o.deliveryText || null,
                                deliveredAt: o.deliveredAt || null,
                            };
                        });
                }
            } catch (e) {
                console.warn('OnlyFansFans: creatorOrders for custom content', e);
            }

            const merged = [...calendarItems, ...orderItems].sort(
                (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
            );
            setCustomContent(merged);
        } catch (error) {
            console.error('Error loading custom content:', error);
            showToast?.('Failed to load custom content', 'error');
        } finally {
            setIsLoadingCustomContent(false);
        }
    };

    // Load fans (enrich from users/{fanId} + creators/.../fans so labels match User Management / ab5360d rules)
    const loadFans = async () => {
        if (!user?.id) return;
        setIsLoading(true);
        try {
            let creatorImageUrls = new Set<string>();
            try {
                const [creatorUserSnap, creatorDocSnap] = await Promise.all([
                    getDoc(doc(db, 'users', user.id)),
                    getDoc(doc(db, 'creators', user.id)),
                ]);
                creatorImageUrls = buildCreatorImageUrlSet(
                    creatorUserSnap.exists() ? (creatorUserSnap.data() as Record<string, unknown>) : undefined,
                    creatorDocSnap.exists() ? (creatorDocSnap.data() as Record<string, unknown>) : undefined
                );
            } catch {
                creatorImageUrls = new Set();
            }

            const fansSnap = await getDocs(collection(db, 'users', user.id, 'onlyfans_fan_preferences'));
            const docs = fansSnap.docs;
            const CHUNK = 25;
            const fansList: Fan[] = [];
            for (let i = 0; i < docs.length; i += CHUNK) {
                const chunk = docs.slice(i, i + CHUNK);
                const part = await Promise.all(
                    chunk.map(async (docSnap) => {
                        const data = docSnap.data();
                        const fanId = docSnap.id;
                        let username: string | null = null;
                        let displayName: string | null =
                            typeof data.displayName === 'string' && data.displayName.trim()
                                ? data.displayName.trim()
                                : null;
                        let email: string | null = typeof data.email === 'string' ? data.email : null;
                        let avatarUrl: string | null = null;
                        let hubMembershipExpired = false;

                        try {
                            if (fanId !== user.id) {
                                const prefEmailNorm =
                                    typeof data.email === 'string' && data.email.trim()
                                        ? data.email.trim().toLowerCase()
                                        : '';
                                const uSnap = await getDoc(doc(db, 'users', fanId));
                                const profileEmailNorm =
                                    uSnap.exists() &&
                                    typeof (uSnap.data() as Record<string, unknown>).email === 'string'
                                        ? String((uSnap.data() as Record<string, unknown>).email)
                                              .trim()
                                              .toLowerCase()
                                        : '';

                                /** Match User Management / `fans` keys: plain uid, compound `uid-email@…`, email-only, Stormij `…-udi:uid`, plus any row whose `email` matches pref or profile (query). */
                                const fanDocCandidates: string[] = [];
                                const pushFanDocCand = (c: string) => {
                                    const t = c.trim();
                                    if (t && !fanDocCandidates.includes(t)) fanDocCandidates.push(t);
                                };
                                const authUidForFan = authUidFromFanDocId(fanId);
                                pushFanDocCand(fanId);
                                if (authUidForFan !== fanId) pushFanDocCand(authUidForFan);
                                const emailNorms = new Set<string>();
                                if (prefEmailNorm) emailNorms.add(prefEmailNorm);
                                if (profileEmailNorm) emailNorms.add(profileEmailNorm);
                                for (const em of emailNorms) {
                                    pushFanDocCand(em);
                                    if (authUidForFan && em.includes('@')) {
                                        pushFanDocCand(`${authUidForFan}-${em}`);
                                    }
                                }

                                const emailsForFanQuery = [...emailNorms].filter(Boolean).slice(0, 10);
                                if (emailsForFanQuery.length > 0) {
                                    try {
                                        const fanColl = collection(db, 'creators', user.id, 'fans');
                                        const mailSnap = await getDocs(
                                            query(fanColl, where('email', 'in', emailsForFanQuery), limit(20))
                                        );
                                        mailSnap.forEach((d) => pushFanDocCand(d.id));
                                    } catch (qErr) {
                                        console.warn('OnlyFansFans: fans email lookup', fanId, qErr);
                                    }
                                }

                                let fSnap: Awaited<ReturnType<typeof getDoc>> | null = null;
                                for (const cand of fanDocCandidates) {
                                    const s = await getDoc(doc(db, 'creators', user.id, 'fans', cand));
                                    if (!s.exists()) continue;
                                    const fd = s.data() as Record<string, unknown>;
                                    if (
                                        isHubMembershipAccessExpired({
                                            subscriptionStatus: subscriptionStatusFromFanDoc(fd),
                                            cancelAtPeriodEnd: parseCancelAtPeriodEndFromFanDoc(fd),
                                            accessEnd: pickLatestMemberAccessEnd(fd),
                                            canceledAt: parseDateLike(fd.canceledAt),
                                        })
                                    ) {
                                        hubMembershipExpired = true;
                                    }
                                    if (!fSnap) fSnap = s;
                                }
                                if (fSnap?.exists()) {
                                    const fd = fSnap.data() as Record<string, unknown>;
                                    const fromFan = usernameFromFanDoc(fd);
                                    if (fromFan) username = fromFan;
                                    if (!displayName && typeof fd.displayName === 'string' && fd.displayName.trim()) {
                                        displayName = fd.displayName.trim();
                                    }
                                    if (!email && typeof fd.email === 'string' && fd.email) email = fd.email;
                                    const fAv =
                                        (typeof fd.avatarUrl === 'string' && fd.avatarUrl.trim()) ||
                                        (typeof fd.photoURL === 'string' && fd.photoURL.trim()) ||
                                        (typeof fd.photoUrl === 'string' && fd.photoUrl.trim()) ||
                                        '';
                                    if (fAv) {
                                        const cleaned = fanAvatarUrlOrUndefined(fAv, {
                                            fanAuthUid: fanId,
                                            creatorId: user.id,
                                            creatorImageUrls,
                                        });
                                        if (cleaned) avatarUrl = cleaned;
                                    }
                                } else {
                                    const d = data as Record<string, unknown>;
                                    hubMembershipExpired = isHubMembershipAccessExpired({
                                        subscriptionStatus: subscriptionStatusFromFanDoc(d),
                                        cancelAtPeriodEnd: parseCancelAtPeriodEndFromFanDoc(d),
                                        accessEnd: pickLatestMemberAccessEnd(d),
                                        canceledAt: parseDateLike(d.canceledAt),
                                    });
                                }
                                if (uSnap.exists()) {
                                    const ud = uSnap.data() as Record<string, unknown>;
                                    const uu =
                                        typeof ud.username === 'string' && ud.username.trim()
                                            ? safeUsernameForHandle(ud.username)
                                            : null;
                                    if (uu) username = uu;
                                    if (!displayName && typeof ud.displayName === 'string' && ud.displayName.trim()) {
                                        displayName = ud.displayName.trim();
                                    }
                                    if (!email && typeof ud.email === 'string' && ud.email) email = ud.email;
                                    const uAv =
                                        (typeof ud.avatar === 'string' && ud.avatar.trim()) ||
                                        (typeof ud.photoURL === 'string' && ud.photoURL.trim()) ||
                                        (typeof ud.photoUrl === 'string' && ud.photoUrl.trim()) ||
                                        '';
                                    if (uAv) {
                                        const cleaned = fanAvatarUrlOrUndefined(uAv, {
                                            fanAuthUid: fanId,
                                            creatorId: user.id,
                                            creatorImageUrls,
                                        });
                                        if (cleaned) avatarUrl = cleaned;
                                    }
                                }
                            }
                        } catch (e) {
                            console.warn('OnlyFansFans: enrich fan row', fanId, e);
                        }

                        const prefName = typeof data.name === 'string' ? data.name : null;
                        const listName = fanHubListLabel(username, displayName, email, prefName);

                        const prefAvatarRaw =
                            typeof (data as { avatarUrl?: unknown }).avatarUrl === 'string'
                                ? (data as { avatarUrl: string }).avatarUrl.trim()
                                : '';

                        const resolvedAvatar = fanAvatarUrlOrUndefined(avatarUrl || prefAvatarRaw || null, {
                            fanAuthUid: fanId,
                            creatorId: user.id,
                            creatorImageUrls,
                        });

                        return {
                            id: fanId,
                            name: listName,
                            avatarUrl: resolvedAvatar,
                            hubMembershipExpired,
                            preferences: {
                                ...data,
                                spendingLevel:
                                    data.spendingLevel ||
                                    (data.totalSpent ? Math.min(5, Math.max(1, Math.ceil(data.totalSpent / 200))) : 0),
                                totalSessions: data.totalSessions || 0,
                                isBigSpender:
                                    data.isBigSpender || (data.spendingLevel && data.spendingLevel >= 4) || false,
                                isLoyalFan:
                                    data.isLoyalFan || (data.totalSessions && data.totalSessions >= 5) || false,
                                subscriptionTier: (() => {
                                    const tier = data.subscriptionTier;
                                    if (tier === 'VIP' || tier === 'Regular') {
                                        return 'Paid';
                                    }
                                    return tier || (data.totalSessions >= 3 ? 'Paid' : 'Free');
                                })(),
                                isVIP: data.isVIP || false,
                                lastSessionDate: data.lastSessionDate?.toDate
                                    ? data.lastSessionDate.toDate().toISOString()
                                    : data.lastSessionDate || undefined,
                                engagementHistory: data.engagementHistory || [],
                                notes: data.notes || '',
                                reminders: data.reminders || [],
                                tags: data.tags || [],
                                email: email || (typeof data.email === 'string' ? data.email : undefined),
                            },
                        };
                    })
                );
                fansList.push(...part);
            }
            setFans(fansList);
        } catch (error) {
            console.error('Error loading fans:', error);
            showToast?.('Failed to load fans', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleBlockFan = async (fanId: string) => {
        if (!window.confirm('Block this fan? They will no longer be able to message or purchase.')) return;
        setBlockingFanId(fanId);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
            const res = await fetch('/api/blockFan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ fanId }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error((data as { error?: string }).error || 'Failed to block');
            }
            showToast?.('Fan blocked', 'success');
            setSelectedFan(null);
            await loadFans();
        } catch (e) {
            showToast?.(e instanceof Error ? e.message : 'Failed to block', 'error');
        } finally {
            setBlockingFanId(null);
        }
    };

    // Messages tab → “Fan card”: open the same Fan Details panel as the Fans grid.
    useEffect(() => {
        const pending = fanHubTab?.pendingFansTabSelection;
        const clearPending = fanHubTab?.clearPendingFansTabSelection;
        if (!pending || !clearPending) return;
        if (isLoading) return;
        const match = findFanForPendingSelection(fans, pending);
        if (match) {
            setSelectedFan(match);
            setViewMode('grid');
            clearPending();
            requestAnimationFrame(() => {
                fanDetailsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
            return;
        }
        showToast?.(
            "Couldn’t open that fan card from this thread. Try refreshing the Fans tab, or confirm this member is linked to your hub.",
            'info'
        );
        clearPending();
    }, [fanHubTab?.pendingFansTabSelection, fanHubTab?.clearPendingFansTabSelection, fans, isLoading, showToast]);

    // Load session history from database
    const loadSessionHistory = async (fanId: string, forceExpand: boolean = false) => {
        if (!user?.id) return;
        
        // If already loaded, just toggle (unless forceExpand is true)
        if (sessionHistory[fanId] && !forceExpand) {
            setExpandedSessionFanId(expandedSessionFanId === fanId ? null : fanId);
            return;
        }
        
        setIsLoadingSessionHistory({ ...isLoadingSessionHistory, [fanId]: true });
        try {
            const sessionsSnap = await getDocs(query(
                collection(db, 'users', user.id, 'onlyfans_sexting_sessions'),
                where('fanId', '==', fanId),
                orderBy('createdAt', 'desc'),
                limit(15)
            ));
            
            const sessions: any[] = [];
            sessionsSnap.forEach(doc => {
                const data = doc.data();
                sessions.push({
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : new Date()),
                    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : (data.updatedAt ? new Date(data.updatedAt) : new Date()),
                    messages: (data.messages || []).map((msg: any) => ({
                        ...msg,
                        timestamp: msg.timestamp?.toDate ? msg.timestamp.toDate() : (msg.timestamp ? new Date(msg.timestamp) : new Date()),
                    })),
                });
            });
            
            setSessionHistory({ ...sessionHistory, [fanId]: sessions });
            // Always expand when loading (or force expanding)
            setExpandedSessionFanId(fanId);
        } catch (error) {
            console.error('Error loading session history:', error);
            showToast?.('Failed to load session history', 'error');
        } finally {
            setIsLoadingSessionHistory({ ...isLoadingSessionHistory, [fanId]: false });
        }
    };

    // Delete session
    const handleDeleteSession = async (sessionId: string, fanId: string) => {
        if (!user?.id) return;
        
        if (!confirm('Are you sure you want to delete this session? This action cannot be undone.')) {
            return;
        }

        try {
            await deleteDoc(doc(db, 'users', user.id, 'onlyfans_sexting_sessions', sessionId));
            
            // Find the fan to update their count
            const fan = fans.find(f => f.id === fanId);
            if (fan && fan.preferences.totalSessions && fan.preferences.totalSessions > 0) {
                const fanRef = doc(db, 'users', user.id, 'onlyfans_fan_preferences', fanId);
                await updateDoc(fanRef, {
                    totalSessions: fan.preferences.totalSessions - 1,
                });
            }
            
            // Remove from local state
            const updatedSessions = (sessionHistory[fanId] || []).filter(s => s.id !== sessionId);
            setSessionHistory({ ...sessionHistory, [fanId]: updatedSessions });
            
            // Reload fans to update the count
            await loadFans();
            
            showToast?.('Session deleted successfully', 'success');
        } catch (error) {
            console.error('Error deleting session:', error);
            showToast?.('Failed to delete session', 'error');
        }
    };

    // Load fan activity
    const loadFanActivity = async (fanId: string) => {
        if (!user?.id) return;
        try {
            const activities: FanActivity[] = [];

            // Load from engagement history (sessions)
            const fan = fans.find(f => f.id === fanId);
            if (fan?.preferences.engagementHistory) {
                fan.preferences.engagementHistory.forEach(session => {
                    activities.push({
                        id: `session-${session.sessionId}`,
                        type: 'session',
                        date: session.date,
                        title: session.sessionType || 'Session',
                        description: session.topics.join(', '),
                    });
                });
            }

            // Load actual session history from onlyfans_sexting_sessions collection
            try {
                const sessionsSnap = await getDocs(query(
                    collection(db, 'users', user.id, 'onlyfans_sexting_sessions'),
                    where('fanId', '==', fanId),
                    orderBy('createdAt', 'desc'),
                    limit(50)
                ));
                sessionsSnap.forEach(doc => {
                    const data = doc.data();
                    const sessionDate = data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : new Date());
                    activities.push({
                        id: `sexting-session-${doc.id}`,
                        type: 'session',
                        date: sessionDate.toISOString(),
                        title: `${data.sessionType || 'Chat/Sexting Session'}${data.status === 'ended' ? ' (Ended)' : data.status === 'paused' ? ' (Paused)' : ''}`,
                        description: data.messages && data.messages.length > 0 
                            ? `${data.messages.length} messages • ${data.duration ? `${data.duration} min` : ''}`
                            : 'Session started',
                    });
                });
            } catch (e) {
                // Index might not be ready yet - silently fail
                console.warn('Could not load session history for timeline (index may not be ready):', e);
            }

            // Load from saved session plans
            try {
                const sessionPlansSnap = await getDocs(query(
                    collection(db, 'users', user.id, 'onlyfans_saved_session_plans'),
                    orderBy('savedAt', 'desc'),
                    limit(100)
                ));
                sessionPlansSnap.forEach(doc => {
                    const data = doc.data();
                    if (data.fanId === fanId || data.fanName === fan?.name) {
                        activities.push({
                            id: `session-plan-${doc.id}`,
                            type: 'session',
                            date: data.savedAt?.toDate ? data.savedAt.toDate().toISOString() : new Date().toISOString(),
                            title: `Session Plan: ${data.sessionType || 'Untitled'}`,
                            description: data.tone || '',
                        });
                    }
                });
            } catch (e) {
                console.warn('Could not load session plans for activity:', e);
            }

            // Sort by date (newest first)
            activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            setSelectedFanActivity(activities);
        } catch (error) {
            console.error('Error loading fan activity:', error);
        }
    };

    useEffect(() => {
        loadFans();
    }, [user?.id]);

    useEffect(() => {
        if (selectedFan) {
            loadFanActivity(selectedFan.id);
            loadCustomContent(selectedFan.id, selectedFan.preferences.email ?? null);
            setShowActivities(false); // Reset activities visibility when fan changes
        } else {
            setCustomContent([]);
            setShowActivities(false);
        }
    }, [selectedFan, fans]);

    // Calculate stats
    const stats = {
        totalFans: fans.length,
        activeFans: fans.filter(f => {
            if (!f.preferences.lastSessionDate) return false;
            try {
                const lastSession = f.preferences.lastSessionDate?.toDate 
                    ? f.preferences.lastSessionDate.toDate() 
                    : new Date(f.preferences.lastSessionDate);
                const daysSince = (Date.now() - lastSession.getTime()) / (1000 * 60 * 60 * 24);
                return daysSince <= 30;
            } catch {
                return false;
            }
        }).length,
        bigSpenders: fans.filter(f => f.preferences.isWhale || f.preferences.isBigSpender || (f.preferences.spendingLevel || 0) >= 4).length,
        loyalFans: fans.filter(f => f.preferences.isRegular || f.preferences.isLoyalFan || (f.preferences.totalSessions || 0) >= 5).length,
    };

    // Filter and sort fans
    const getFilteredAndSortedFans = () => {
        let filtered = [...fans];

        // Apply search filter
        if (fanSearchQuery.trim()) {
            const query = fanSearchQuery.toLowerCase();
            filtered = filtered.filter(fan =>
                fan.name.toLowerCase().includes(query) ||
                fan.id.toLowerCase().includes(query) ||
                fan.preferences.tags?.some(tag => tag.toLowerCase().includes(query))
            );
        }

        // Apply type filter
        if (fanFilter === 'bigSpenders') {
            filtered = filtered.filter(fan => fan.preferences.isWhale || fan.preferences.isBigSpender || (fan.preferences.spendingLevel || 0) >= 4);
        } else if (fanFilter === 'loyal') {
            filtered = filtered.filter(fan => fan.preferences.isRegular || fan.preferences.isLoyalFan || (fan.preferences.totalSessions || 0) >= 5);
        } else if (fanFilter === 'recent') {
            filtered = filtered.filter(fan => {
                if (!fan.preferences.lastSessionDate) return false;
                try {
                    const lastSession = fan.preferences.lastSessionDate?.toDate 
                        ? fan.preferences.lastSessionDate.toDate() 
                        : new Date(fan.preferences.lastSessionDate);
                    const daysSince = (Date.now() - lastSession.getTime()) / (1000 * 60 * 60 * 24);
                    return daysSince <= 30;
                } catch {
                    return false;
                }
            });
        } else if (fanFilter === 'inactive') {
            filtered = filtered.filter(fan => {
                if (!fan.preferences.lastSessionDate) return true;
                try {
                    const lastSession = fan.preferences.lastSessionDate?.toDate 
                        ? fan.preferences.lastSessionDate.toDate() 
                        : new Date(fan.preferences.lastSessionDate);
                    const daysSince = (Date.now() - lastSession.getTime()) / (1000 * 60 * 60 * 24);
                    return daysSince > 60;
                } catch {
                    return false;
                }
            });
        }

        // Sort
        filtered.sort((a, b) => {
            switch (fanSortBy) {
                case 'name':
                    return a.name.localeCompare(b.name);
                case 'sessions':
                    return (b.preferences.totalSessions || 0) - (a.preferences.totalSessions || 0);
                case 'spendingLevel':
                    return (b.preferences.spendingLevel || 0) - (a.preferences.spendingLevel || 0);
                case 'lastSession':
                default:
                    const aDate = a.preferences.lastSessionDate 
                        ? (a.preferences.lastSessionDate?.toDate 
                            ? a.preferences.lastSessionDate.toDate().getTime() 
                            : new Date(a.preferences.lastSessionDate).getTime())
                        : 0;
                    const bDate = b.preferences.lastSessionDate 
                        ? (b.preferences.lastSessionDate?.toDate 
                            ? b.preferences.lastSessionDate.toDate().getTime() 
                            : new Date(b.preferences.lastSessionDate).getTime())
                        : 0;
                    return bDate - aDate;
            }
        });

        return filtered;
    };

    const getTierColor = (tier?: string, accessExpired?: boolean) => {
        if (accessExpired) return 'bg-gray-500 dark:bg-gray-600';
        switch (tier) {
            case 'Paid': return 'bg-blue-500 dark:bg-blue-600';
            case 'Free': return 'bg-gray-500 dark:bg-gray-600';
            default: return 'bg-gray-400 dark:bg-gray-600';
        }
    };

    // Delete fan handler
    const handleDeleteFan = async (fanId: string, fanName: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent card selection when clicking delete
        
        if (!user?.id) return;
        
        if (!confirm(`Are you sure you want to delete ${fanName}? This action cannot be undone.`)) {
            return;
        }

        try {
            await deleteDoc(doc(db, 'users', user.id, 'onlyfans_fan_preferences', fanId));
            showToast('Fan deleted successfully', 'success');
            
            // Clear selection if deleted fan was selected
            if (selectedFan?.id === fanId) {
                setSelectedFan(null);
            }
            
            // Reload fans list
            loadFans();
        } catch (error) {
            console.error('Error deleting fan:', error);
            showToast('Failed to delete fan', 'error');
        }
    };

    // Open schedule session modal
    const handleScheduleSession = (fan: Fan, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent card selection
        setSessionFan(fan);
        // Default to tomorrow at 8 PM
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setSessionDate(tomorrow.toISOString().split('T')[0]);
        setSessionTime('20:00');
        setShowScheduleSessionModal(true);
    };

    // Save scheduled session
    const handleSaveScheduledSession = async () => {
        if (!user?.id || !sessionFan || !sessionDate || !sessionTime) {
            showToast('Please fill in all required fields', 'error');
            return;
        }

        try {
            const eventId = `session-${sessionFan.id}-${Date.now()}`;
            const dateTime = new Date(`${sessionDate}T${sessionTime}`);
            
            const eventData = {
                title: `Session with ${sessionFan.name}`,
                description: `1:1 private session${sessionFan.preferences.favoriteSessionType ? ` - ${sessionFan.preferences.favoriteSessionType}` : ''}`,
                date: dateTime.toISOString(),
                reminderType: 'post' as const,
                contentType: 'paid' as const,
                createdAt: new Date().toISOString(),
                userId: user.id,
                fanId: sessionFan.id,
                fanName: sessionFan.name,
                ...(sessionTime ? { reminderTime: sessionTime } : {}),
            };

            await setDoc(doc(db, 'users', user.id, 'onlyfans_calendar_events', eventId), eventData);
            showToast(`Session scheduled with ${sessionFan.name}!`, 'success');
            setShowScheduleSessionModal(false);
            setSessionFan(null);
        } catch (error) {
            console.error('Error scheduling session:', error);
            showToast('Failed to schedule session', 'error');
        }
    };

    // Open edit fan modal
    const handleEditFan = (fan: Fan, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent card selection
        setEditingFan(fan);
        // Pre-fill all fields with existing fan data
        setNewFanName(fan.name);
        setNewFanSpendingLevel(fan.preferences.spendingLevel || 0);
        setNewFanTier(fan.preferences.subscriptionTier || 'Free');
        setNewFanType(
            fan.preferences.isWhale ? 'Whale' :
            fan.preferences.isVIP ? 'VIP' :
            fan.preferences.isRegular ? 'Regular' :
            ''
        );
        setNewFanNotes(fan.preferences.notes || '');
        setNewFanPreferredTone(fan.preferences.preferredTone || '');
        setNewFanFavoriteSessionType(fan.preferences.favoriteSessionType || '');
        setNewFanCommunicationStyle(fan.preferences.communicationStyle || '');
        setNewFanLanguagePreferences(fan.preferences.languagePreferences || '');
        setNewFanSuggestedFlow(fan.preferences.suggestedFlow || '');
        setNewFanPastNotes(fan.preferences.pastNotes || '');
        setNewFanBoundaries(fan.preferences.boundaries || '');
        setNewFanBoundariesChecklist(fan.preferences.boundariesChecklist || {
            noFacePhotos: false,
            noRealName: false,
            explicitContentOnly: false,
            noCustomRequests: false,
            timeBoundaryOnly: false,
        });
        setShowEditFanModal(true);
    };

    // Save edited fan
    const handleSaveEditedFan = async () => {
        if (!user?.id || !editingFan || !newFanName.trim()) {
            showToast('Fan name is required', 'error');
            return;
        }

        setIsSavingFan(true);
        try {
            const fanData: any = {
                name: newFanName.trim(),
                spendingLevel: newFanSpendingLevel,
                subscriptionTier: newFanTier,
                isVIP: newFanType === 'VIP',
                isWhale: newFanType === 'Whale',
                isRegular: newFanType === 'Regular',
                isBigSpender: newFanType === 'Whale' || newFanSpendingLevel >= 4,
                notes: newFanNotes.trim() || '',
                tags: [],
                updatedAt: Timestamp.now(),
            };

            // Only add fields that have values (not empty strings or undefined)
            if (newFanPreferredTone) fanData.preferredTone = newFanPreferredTone;
            if (newFanFavoriteSessionType) fanData.favoriteSessionType = newFanFavoriteSessionType;
            if (newFanCommunicationStyle) fanData.communicationStyle = newFanCommunicationStyle;
            if (newFanLanguagePreferences && newFanLanguagePreferences.trim()) {
                fanData.languagePreferences = newFanLanguagePreferences.trim();
            }
            if (newFanSuggestedFlow && newFanSuggestedFlow.trim()) {
                fanData.suggestedFlow = newFanSuggestedFlow.trim();
            }
            if (newFanPastNotes && newFanPastNotes.trim()) {
                fanData.pastNotes = newFanPastNotes.trim();
            }
            if (newFanBoundaries && newFanBoundaries.trim()) {
                fanData.boundaries = newFanBoundaries.trim();
            }
            if (Object.keys(newFanBoundariesChecklist).some(key => newFanBoundariesChecklist[key])) {
                fanData.boundariesChecklist = newFanBoundariesChecklist;
            }

            await setDoc(doc(db, 'users', user.id, 'onlyfans_fan_preferences', editingFan.id), fanData, { merge: true });
            
            // Close modal and reset form first
            setShowEditFanModal(false);
            setEditingFan(null);
            setNewFanName('');
            setNewFanSpendingLevel(0);
            setNewFanTier('Free');
            setNewFanType('');
            setNewFanNotes('');
            setNewFanPreferredTone('');
            setNewFanFavoriteSessionType('');
            setNewFanCommunicationStyle('');
            setNewFanLanguagePreferences('');
            setNewFanSuggestedFlow('');
            setNewFanPastNotes('');
            setNewFanBoundaries('');
            setNewFanBoundariesChecklist({
                noFacePhotos: false,
                noRealName: false,
                explicitContentOnly: false,
                noCustomRequests: false,
                timeBoundaryOnly: false,
            });
            
            // Show success message
            showToast?.('Fan updated successfully!', 'success');
            
            // Reload fans list (don't await - let it happen in background)
            loadFans().catch(err => {
                console.error('Error reloading fans after update:', err);
                // Don't show error to user since save was successful
            });
        } catch (error) {
            console.error('Error updating fan:', error);
            showToast?.('Failed to update fan. Please try again.', 'error');
        } finally {
            setIsSavingFan(false);
        }
    };

    const filteredFans = getFilteredAndSortedFans();
    const displayedActivity = activityTypeFilter === 'all'
        ? selectedFanActivity
        : selectedFanActivity.filter(a => a.type === activityTypeFilter);
    const last5Activity = displayedActivity.slice(0, 5);
    const filteredCustomContent = customContentTypeFilter === 'all'
        ? customContent
        : customContent.filter((item) => inferDeliveryType(item) === customContentTypeFilter);

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <SparklesIcon className="w-8 h-8 text-primary-600 dark:text-primary-400" />
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                            Fans
                        </h1>
                    </div>
                    <button
                        onClick={() => setShowAddFanModal(true)}
                        className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors flex items-center gap-2"
                    >
                        <PlusIcon className="w-5 h-5" />
                        Add Fan
                    </button>
                </div>
                <p className="text-gray-600 dark:text-gray-400">
                    Track VIPs, regulars, whales, and what they like.
                </p>
            </div>

            {/* Stats Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total fans</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalFans}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Active (30d)</div>
                    <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">{stats.activeFans}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-500">Last 30 days</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Whales</div>
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.bigSpenders}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Regulars</div>
                    <div className="text-2xl font-bold text-pink-600 dark:text-pink-400">{stats.loyalFans}</div>
                </div>
            </div>

            {/* Search and Filters */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 mb-6">
                <div className="flex flex-col md:flex-row gap-3">
                    <div className="flex-1 relative">
                        <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            value={fanSearchQuery}
                            onChange={(e) => setFanSearchQuery(e.target.value)}
                            placeholder="Search fans by name, username, or tags..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        />
                    </div>
                    <select
                        value={fanFilter}
                        onChange={(e) => setFanFilter(e.target.value as any)}
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                        <option value="all">All fans</option>
                        <option value="bigSpenders">Whales</option>
                        <option value="loyal">Regulars</option>
                        <option value="recent">Recent (30 days)</option>
                        <option value="inactive">Inactive (60+ days)</option>
                    </select>
                    <select
                        value={fanSortBy}
                        onChange={(e) => setFanSortBy(e.target.value as any)}
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                        <option value="lastSession">Last Session</option>
                        <option value="sessions">Most Sessions</option>
                        <option value="spendingLevel">Highest Spender</option>
                        <option value="name">Name (A-Z)</option>
                    </select>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                viewMode === 'grid'
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                            }`}
                        >
                            Grid
                        </button>
                        <button
                            onClick={() => setViewMode('timeline')}
                            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                viewMode === 'timeline'
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                            }`}
                        >
                            Timeline
                        </button>
                    </div>
                </div>
            </div>

            {/* Fan Grid View */}
            {viewMode === 'grid' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {isLoading ? (
                        <div className="col-span-full text-center py-8 text-gray-500 dark:text-gray-400">Loading fans...</div>
                    ) : filteredFans.length === 0 ? (
                        <div className="col-span-full text-center py-8 text-gray-500 dark:text-gray-400">
                            {fanSearchQuery || fanFilter !== 'all' ? 'No fans match your filters' : 'No fans yet. Start a session in Scripts & Roleplay to create your first fan card!'}
                        </div>
                    ) : (
                        filteredFans.map((fan) => {
                            const prefs = fan.preferences;
                            const isSelected = selectedFan?.id === fan.id;
                            const accessExpired = fan.hubMembershipExpired === true;

                            return (
                                <div
                                    key={fan.id}
                                    onClick={() => {
                                        if (!accessExpired) setSelectedFan(fan);
                                    }}
                                    title={
                                        accessExpired
                                            ? 'Paid membership ended. Card stays for history; it updates if they resubscribe.'
                                            : undefined
                                    }
                                    className={`relative p-4 rounded-lg border-2 transition-all ${
                                        accessExpired
                                            ? 'cursor-not-allowed opacity-[0.82] grayscale-[0.55] hover:shadow-none'
                                            : 'cursor-pointer hover:shadow-lg'
                                    } ${
                                        isSelected
                                            ? accessExpired
                                                ? 'border-gray-400 dark:border-gray-500 bg-gray-100 dark:bg-gray-800/95 ring-1 ring-gray-300/80 dark:ring-gray-600/80'
                                                : 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                            : accessExpired
                                              ? 'border-gray-300 dark:border-gray-600 bg-gray-100/95 dark:bg-gray-900/85 shadow-inner'
                                              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-300 dark:hover:border-primary-700'
                                    }`}
                                >
                                    {/* Action Buttons - Top Right */}
                                    <div className="absolute top-2 right-2 flex gap-1 z-10">
                                        {(accessExpired || prefs.subscriptionTier) && (
                                            <span
                                                className={`px-2 py-1 text-xs font-semibold text-white rounded-full ${getTierColor(prefs.subscriptionTier, accessExpired)}`}
                                            >
                                                {accessExpired ? 'Expired' : prefs.subscriptionTier}
                                            </span>
                                        )}
                                        <button
                                            onClick={(e) => handleEditFan(fan, e)}
                                            className="p-1.5 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 transition-colors"
                                            title="Edit Fan"
                                        >
                                            <EditIcon className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => handleScheduleSession(fan, e)}
                                            className="p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                                            title="Schedule Session"
                                        >
                                            <PlusIcon className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => handleDeleteFan(fan.id, fan.name, e)}
                                            className="p-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                                            title="Delete Fan"
                                        >
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <div className="flex items-start gap-3">
                                        <FanGridAvatar avatarUrl={fan.avatarUrl} name={fan.name} muted={accessExpired} />

                                        {/* Fan Info */}
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-semibold text-gray-900 dark:text-white truncate">
                                                {fan.name}
                                            </h4>

                                            {/* Quick Stats */}
                                            <div className="mt-2 space-y-1">
                                                {prefs.totalSessions !== undefined && prefs.totalSessions > 0 && (
                                                    <button
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            if (accessExpired) return;
                                                            // Select the fan first if not already selected
                                                            if (!isSelected) {
                                                                setSelectedFan(fan);
                                                                // Wait a moment for the selection to take effect, then load sessions
                                                                setTimeout(() => {
                                                                    loadSessionHistory(fan.id, true);
                                                                }, 100);
                                                            } else {
                                                                // Fan already selected, just load/expand sessions
                                                                loadSessionHistory(fan.id, true);
                                                            }
                                                        }}
                                                        className="flex items-center gap-2 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 cursor-pointer underline"
                                                    >
                                                        <span className="font-medium">{prefs.totalSessions}</span>
                                                        <span>sessions</span>
                                                    </button>
                                                )}
                                                {prefs.spendingLevel && prefs.spendingLevel > 0 && (
                                                    <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                                                        <span className="font-medium">Spending:</span>
                                                        <span className="flex items-center gap-0.5">
                                                            {Array.from({ length: prefs.spendingLevel }).map((_, i) => (
                                                                <span key={i} className="text-green-600 dark:text-green-400">
                                                                    💰
                                                                </span>
                                                            ))}
                                                        </span>
                                                    </div>
                                                )}
                                                {prefs.lastSessionDate && (
                                                    <div className="text-xs text-gray-500 dark:text-gray-500">
                                                        Last: {(() => {
                                                            try {
                                                                const date = prefs.lastSessionDate?.toDate ? prefs.lastSessionDate.toDate() : new Date(prefs.lastSessionDate);
                                                                return date.toLocaleDateString();
                                                            } catch {
                                                                return 'Invalid date';
                                                            }
                                                        })()}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Favorite Tags */}
                                            {(prefs.favoriteSessionType || prefs.preferredTone || prefs.communicationStyle) && (
                                                <div className="mt-2 flex flex-wrap gap-1">
                                                    {prefs.favoriteSessionType && (
                                                        <span className="text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded">
                                                            ⭐ {prefs.favoriteSessionType === 'Explicit' ? 'Bold' : prefs.favoriteSessionType.split(' ')[0]}
                                                        </span>
                                                    )}
                                                    {prefs.preferredTone && (
                                                        <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded">
                                                            🎭 {prefs.preferredTone === 'Very Explicit' ? 'Bold' : prefs.preferredTone}
                                                        </span>
                                                    )}
                                                    {prefs.communicationStyle && (
                                                        <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
                                                            💬 {prefs.communicationStyle === 'like Explicit' ? 'Like Bold' : prefs.communicationStyle}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Badge */}
                                    <div className="mt-2 flex gap-1">
                                        {(() => {
                                            const fanType = prefs.isWhale
                                                ? 'Whale'
                                                : prefs.isVIP
                                                ? 'VIP'
                                                : prefs.isRegular
                                                ? 'Regular'
                                                : prefs.isBigSpender
                                                ? 'Whale'
                                                : prefs.isLoyalFan
                                                ? 'Regular'
                                                : null;
                                            if (!fanType) return null;
                                            const badgeClass =
                                                fanType === 'Whale'
                                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                                    : fanType === 'VIP'
                                                    ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                                                    : 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300';
                                            return (
                                                <span className={`text-xs px-2 py-0.5 rounded font-semibold ${badgeClass}`}>
                                                    {fanType}
                                                </span>
                                            );
                                        })()}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* Timeline View */}
            {viewMode === 'timeline' && selectedFan && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                            Activity Timeline: {selectedFan.name}
                        </h2>
                        <select
                            value={activityTypeFilter}
                            onChange={(e) => setActivityTypeFilter(e.target.value as any)}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        >
                            <option value="all">All Activities</option>
                            <option value="session">Sessions</option>
                            <option value="rating">Body Ratings</option>
                            <option value="content">Content</option>
                            <option value="calendar">Calendar</option>
                            <option value="media">Media</option>
                        </select>
                    </div>
                    {displayedActivity.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                            No activities found for this fan.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {displayedActivity.map((activity) => (
                                <div key={activity.id} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900/40 rounded-lg">
                                    <div className="flex-shrink-0 w-2 h-2 rounded-full bg-primary-600 dark:bg-primary-400 mt-2" />
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{activity.title}</h4>
                                            <span className="text-xs text-gray-500 dark:text-gray-500">
                                                {new Date(activity.date).toLocaleDateString()}
                                            </span>
                                        </div>
                                        {activity.description && (
                                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{activity.description}</p>
                                        )}
                                        <span className="inline-block mt-2 text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-2 py-0.5 rounded">
                                            {activity.type}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Selected Fan Details Panel */}
            {selectedFan && viewMode === 'grid' && (
                <div
                    ref={fanDetailsPanelRef}
                    className={`mt-6 rounded-lg shadow-md p-6 ${
                        selectedFan.hubMembershipExpired
                            ? 'border border-gray-300 dark:border-gray-600 bg-gray-50/90 dark:bg-gray-900/50'
                            : 'bg-white dark:bg-gray-800'
                    }`}
                >
                    <div className="flex items-center justify-between mb-4 gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <FanGridAvatar
                                avatarUrl={selectedFan.avatarUrl}
                                name={selectedFan.name}
                                sizeClass="w-14 h-14 text-base"
                                muted={selectedFan.hubMembershipExpired === true}
                            />
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white truncate">
                                Fan Details: {selectedFan.name}
                            </h2>
                        </div>
                        <button
                            onClick={() => setSelectedFan(null)}
                            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex-shrink-0"
                        >
                            Close
                        </button>
                    </div>

                    {selectedFan.hubMembershipExpired ? (
                        <p className="mb-4 rounded-lg border border-gray-200 bg-gray-100/80 px-3 py-2 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-800/80 dark:text-gray-300">
                            Paid membership has ended for this fan (per your hub billing data). They are not removed so
                            history stays intact and the card will return to normal if they renew.
                        </p>
                    ) : null}

                    {/* Notes Section */}
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Notes
                        </label>
                        <textarea
                            value={selectedFan.preferences.notes || ''}
                            onChange={async (e) => {
                                if (!user?.id) return;
                                const updatedNotes = e.target.value;
                                try {
                                    await setDoc(
                                        doc(db, 'users', user.id, 'onlyfans_fan_preferences', selectedFan.id),
                                        { notes: updatedNotes, updatedAt: Timestamp.now() },
                                        { merge: true }
                                    );
                                    setSelectedFan({
                                        ...selectedFan,
                                        preferences: { ...selectedFan.preferences, notes: updatedNotes }
                                    });
                                    showToast?.('Notes saved!', 'success');
                                } catch (error) {
                                    console.error('Error saving notes:', error);
                                    showToast?.('Failed to save notes', 'error');
                                }
                            }}
                            placeholder="Add notes about this fan..."
                            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            rows={3}
                        />
                    </div>

                    <div className="mb-4">
                        <button
                            type="button"
                            onClick={() => void handleBlockFan(selectedFan.id)}
                            disabled={blockingFanId === selectedFan.id}
                            className="w-full py-2.5 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                        >
                            {blockingFanId === selectedFan.id ? 'Blocking…' : 'Block fan'}
                        </button>
                    </div>

                    {/* Last 5 Activities */}
                    {last5Activity.length > 0 && (
                        <div className="mb-4">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Last 5 Activities</h3>
                                <button
                                    onClick={() => setShowActivities(!showActivities)}
                                    className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
                                >
                                    {showActivities ? 'Hide' : 'Show'}
                                </button>
                            </div>
                            {showActivities && (
                                <div className="space-y-2">
                                    {last5Activity.map((activity) => (
                                        <div key={activity.id} className="p-2 bg-gray-50 dark:bg-gray-900/40 rounded text-sm">
                                            <div className="flex items-center justify-between">
                                                <span className="text-gray-900 dark:text-white font-medium">{activity.title}</span>
                                                <span className="text-xs text-gray-500 dark:text-gray-500">
                                                    {new Date(activity.date).toLocaleDateString()}
                                                </span>
                                            </div>
                                            {activity.description && (
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{activity.description}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Custom Content Section */}
                    <div className="mb-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Custom Content</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    Calendar requests and paid Fan Hub store items (e.g. video replies) for this fan.
                                </p>
                            </div>
                            <select
                                value={customContentTypeFilter}
                                onChange={(e) => setCustomContentTypeFilter(e.target.value as 'all' | 'video' | 'image' | 'audio' | 'text')}
                                className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs"
                            >
                                <option value="all">All types</option>
                                <option value="video">Video</option>
                                <option value="image">Image</option>
                                <option value="audio">Voice/Audio</option>
                                <option value="text">Text</option>
                            </select>
                        </div>
                        {isLoadingCustomContent ? (
                            <div className="text-center py-4 text-gray-500 dark:text-gray-400">Loading...</div>
                        ) : filteredCustomContent.length === 0 ? (
                            <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
                                {customContent.length === 0
                                    ? 'No calendar custom requests or Fan Hub store purchases for this fan yet.'
                                    : 'No items match this delivery type filter.'}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {filteredCustomContent.map((item) => (
                                    <div key={item.id} className="p-3 bg-gray-50 dark:bg-gray-900/40 rounded-lg border border-gray-200 dark:border-gray-700">
                                        {editingCustomContentId === item.id && item.source === 'calendar' ? (
                                            <div className="space-y-2">
                                                <input
                                                    type="text"
                                                    value={editCustomTitle}
                                                    onChange={(e) => setEditCustomTitle(e.target.value)}
                                                    placeholder="Title"
                                                    className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                />
                                                <textarea
                                                    value={editCustomDescription}
                                                    onChange={(e) => setEditCustomDescription(e.target.value)}
                                                    placeholder="Description"
                                                    rows={2}
                                                    className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                />
                                                <select
                                                    value={editCustomStatus}
                                                    onChange={(e) => setEditCustomStatus(e.target.value as 'ordered' | 'in-progress' | 'delivered' | 'cancelled')}
                                                    className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                >
                                                    <option value="ordered">Ordered</option>
                                                    <option value="in-progress">In Progress</option>
                                                    <option value="delivered">Delivered</option>
                                                    <option value="cancelled">Cancelled</option>
                                                </select>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={async () => {
                                                            if (!user?.id) return;
                                                            try {
                                                                const eventRef = doc(db, 'users', user.id, 'onlyfans_calendar_events', item.id);
                                                                await updateDoc(eventRef, {
                                                                    title: editCustomTitle,
                                                                    description: editCustomDescription,
                                                                    customStatus: editCustomStatus,
                                                                });
                                                                await loadCustomContent(selectedFan.id, selectedFan.preferences.email ?? null);
                                                                setEditingCustomContentId(null);
                                                                showToast?.('Custom content updated!', 'success');
                                                            } catch (error) {
                                                                console.error('Error updating custom content:', error);
                                                                showToast?.('Failed to update custom content', 'error');
                                                            }
                                                        }}
                                                        className="flex-1 px-3 py-1 bg-primary-600 text-white rounded text-sm hover:bg-primary-700"
                                                    >
                                                        Save
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setEditingCustomContentId(null);
                                                            setEditCustomTitle('');
                                                            setEditCustomDescription('');
                                                            setEditCustomStatus('ordered');
                                                        }}
                                                        className="flex-1 px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{item.title}</h4>
                                                            <span
                                                                className={`text-xs px-2 py-0.5 rounded ${
                                                                    item.source === 'order'
                                                                        ? 'bg-violet-100 dark:bg-violet-900/35 text-violet-800 dark:text-violet-200'
                                                                        : 'bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-100'
                                                                }`}
                                                            >
                                                                {item.source === 'order' ? 'Fan Hub store' : 'Calendar'}
                                                            </span>
                                                            <span className={`text-xs px-2 py-0.5 rounded ${
                                                                item.status === 'ordered' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' :
                                                                item.status === 'in-progress' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
                                                                item.status === 'delivered' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                                                                'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                                            }`}>
                                                                {item.status === 'ordered' ? 'Ordered' :
                                                                 item.status === 'in-progress' ? 'In Progress' :
                                                                 item.status === 'delivered' ? 'Delivered' : 'Cancelled'}
                                                            </span>
                                                        </div>
                                                        {(() => {
                                                            const isExpanded = expandedCustomContentId === item.id;
                                                            const contentType = inferDeliveryType(item);
                                                            const url = String(item.deliveryUrl || '').trim();
                                                            const text = String(item.deliveryText || '').trim();
                                                            const summaryBits: string[] = [];
                                                            if (item.description) summaryBits.push(item.description);
                                                            if (url || text) summaryBits.push(`Delivered ${contentType === 'other' ? 'attachment' : contentType}`);
                                                            const summary = summaryBits.join(' · ');
                                                            return (
                                                                <>
                                                                    {summary && (
                                                                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                                                            {isExpanded
                                                                                ? summary
                                                                                : summary.length > 120
                                                                                    ? `${summary.slice(0, 120)}...`
                                                                                    : summary}
                                                                        </p>
                                                                    )}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setExpandedCustomContentId(isExpanded ? null : item.id)}
                                                                        className="mt-1 text-[11px] text-primary-600 dark:text-primary-400 hover:underline"
                                                                    >
                                                                        {isExpanded ? 'Collapse details' : 'Expand details'}
                                                                    </button>
                                                                    {isExpanded && (
                                                                        <div className="mt-2 space-y-2">
                                                                            {(url || text) && (
                                                                                <div className="text-[11px] inline-flex items-center px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300">
                                                                                    Delivered content: {contentType === 'other' ? 'attachment' : contentType}
                                                                                </div>
                                                                            )}
                                                                            {url && contentType === 'video' && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setContentPreview({ type: 'video', url })}
                                                                                    className="group block text-left"
                                                                                    title="Open preview"
                                                                                >
                                                                                    <video
                                                                                        src={url}
                                                                                        muted
                                                                                        className="w-44 h-28 rounded border border-gray-200 dark:border-gray-700 bg-black/70 object-cover"
                                                                                        preload="metadata"
                                                                                    />
                                                                                    <span className="text-[11px] text-primary-600 dark:text-primary-400 group-hover:underline">
                                                                                        Open preview
                                                                                    </span>
                                                                                </button>
                                                                            )}
                                                                            {url && contentType === 'image' && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setContentPreview({ type: 'image', url })}
                                                                                    className="group block text-left"
                                                                                    title="Open preview"
                                                                                >
                                                                                    <img
                                                                                        src={url}
                                                                                        alt="Delivered content"
                                                                                        className="w-36 h-24 rounded border border-gray-200 dark:border-gray-700 object-cover"
                                                                                        loading="lazy"
                                                                                    />
                                                                                    <span className="text-[11px] text-primary-600 dark:text-primary-400 group-hover:underline">
                                                                                        Open preview
                                                                                    </span>
                                                                                </button>
                                                                            )}
                                                                            {url && contentType === 'audio' && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setContentPreview({ type: 'audio', url })}
                                                                                    className="group inline-flex items-center px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-xs text-primary-700 dark:text-primary-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                                                                                    title="Open audio player"
                                                                                >
                                                                                    Open audio
                                                                                </button>
                                                                            )}
                                                                            {url && contentType === 'other' && (
                                                                                <a
                                                                                    href={url}
                                                                                    target="_blank"
                                                                                    rel="noreferrer"
                                                                                    className="text-xs text-primary-600 dark:text-primary-400 underline break-all"
                                                                                >
                                                                                    Open delivered attachment
                                                                                </a>
                                                                            )}
                                                                            {text && (
                                                                                <div className="text-xs text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-2 max-w-2xl whitespace-pre-wrap">
                                                                                    {text}
                                                                                </div>
                                                                            )}
                                                                            <div className="pt-1">
                                                                                <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                                                                                    Creator note
                                                                                </label>
                                                                                <textarea
                                                                                    value={getCustomContentNote(item.id)}
                                                                                    onChange={(e) =>
                                                                                        setCustomContentNoteDrafts((prev) => ({
                                                                                            ...prev,
                                                                                            [item.id]: e.target.value,
                                                                                        }))
                                                                                    }
                                                                                    placeholder="Add a private note for this delivery (e.g., style, angle, outfit, what to avoid next time)..."
                                                                                    rows={2}
                                                                                    className="w-full max-w-2xl px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white"
                                                                                />
                                                                                <div className="mt-1 flex items-center gap-2">
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => void saveCustomContentNote(item.id)}
                                                                                        disabled={savingCustomContentNoteId === item.id}
                                                                                        className="px-2 py-1 text-[11px] rounded bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed"
                                                                                    >
                                                                                        {savingCustomContentNoteId === item.id ? 'Saving…' : 'Save note'}
                                                                                    </button>
                                                                                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                                                                        Private to you (not visible to fan)
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </>
                                                            );
                                                        })()}
                                                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                                            {new Date(item.date).toLocaleDateString()}
                                                        </p>
                                                        {item.source === 'order' && (
                                                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                                                Update delivery status in{' '}
                                                                <span className="font-medium text-gray-700 dark:text-gray-300">Fan Hub → Purchases</span>.
                                                            </p>
                                                        )}
                                                    </div>
                                                    {item.source === 'calendar' && (
                                                    <div className="flex gap-1 ml-2">
                                                        <button
                                                            onClick={() => {
                                                                setEditingCustomContentId(item.id);
                                                                setEditCustomTitle(item.title);
                                                                setEditCustomDescription(item.description || '');
                                                                setEditCustomStatus(item.status);
                                                            }}
                                                            className="p-1 text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
                                                            title="Edit"
                                                        >
                                                            <EditIcon className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                if (!user?.id || !confirm('Are you sure you want to delete this custom content?')) return;
                                                                try {
                                                                    await deleteDoc(doc(db, 'users', user.id, 'onlyfans_calendar_events', item.id));
                                                                    await loadCustomContent(selectedFan.id, selectedFan.preferences.email ?? null);
                                                                    showToast?.('Custom content deleted', 'success');
                                                                } catch (error) {
                                                                    console.error('Error deleting custom content:', error);
                                                                    showToast?.('Failed to delete custom content', 'error');
                                                                }
                                                            }}
                                                            className="p-1 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                                                            title="Delete"
                                                        >
                                                            <TrashIcon className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Preferences Summary */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="text-gray-600 dark:text-gray-400">Total Sessions:</span>
                            <button
                                onClick={() => loadSessionHistory(selectedFan.id)}
                                className="ml-2 font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 underline cursor-pointer"
                            >
                                {selectedFan.preferences.totalSessions || 0}
                            </button>
                        </div>
                        <div>
                            <span className="text-gray-600 dark:text-gray-400">Spending Level:</span>
                            <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                                {selectedFan.preferences.spendingLevel || 0}/5
                            </span>
                        </div>
                        {selectedFan.preferences.lastSessionDate && (
                            <div>
                                <span className="text-gray-600 dark:text-gray-400">Last Session:</span>
                                <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                                    {(() => {
                                        try {
                                            const date = selectedFan.preferences.lastSessionDate?.toDate 
                                                ? selectedFan.preferences.lastSessionDate.toDate() 
                                                : new Date(selectedFan.preferences.lastSessionDate);
                                            return date.toLocaleDateString();
                                        } catch {
                                            return 'Invalid date';
                                        }
                                    })()}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Session History Transcripts */}
                    {expandedSessionFanId === selectedFan.id && (
                        <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Session Transcripts</h3>
                                <button
                                    onClick={() => setExpandedSessionFanId(null)}
                                    className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                                >
                                    Collapse
                                </button>
                            </div>
                            
                            {isLoadingSessionHistory[selectedFan.id] ? (
                                <div className="text-center py-4 text-gray-500 dark:text-gray-400">Loading sessions...</div>
                            ) : !sessionHistory[selectedFan.id] || sessionHistory[selectedFan.id].length === 0 ? (
                                <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                                    No sessions found for this fan.
                                </div>
                            ) : (
                                <div className="space-y-4 max-h-96 overflow-y-auto">
                                    {sessionHistory[selectedFan.id].map((session) => (
                                        <div
                                            key={session.id}
                                            className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900/40"
                                        >
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex-1">
                                                    <h4 className="font-semibold text-gray-900 dark:text-white text-sm">
                                                        {session.roleplayType || 'Session'}
                                                    </h4>
                                                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                                        {session.tone && `Tone: ${session.tone}`}
                                                        {session.duration && ` • Duration: ${session.duration} min`}
                                                        {' • '}
                                                        {session.createdAt.toLocaleDateString()} {session.createdAt.toLocaleTimeString()}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => handleDeleteSession(session.id, selectedFan.id)}
                                                    className="p-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors ml-2"
                                                    title="Delete Session"
                                                >
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            </div>

                                            {session.messages && session.messages.length > 0 && (
                                                <div className="mt-3 space-y-2">
                                                    {session.messages.map((msg: any, idx: number) => (
                                                        <div
                                                            key={idx}
                                                            className={`p-2 rounded text-xs ${
                                                                msg.role === 'creator'
                                                                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-900 dark:text-primary-100'
                                                                    : msg.role === 'fan'
                                                                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                                                                    : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-900 dark:text-yellow-100'
                                                            }`}
                                                        >
                                                            <div className="flex items-center justify-between mb-1">
                                                                <span className="font-medium text-xs">
                                                                    {msg.role === 'creator' ? 'You' : msg.role === 'fan' ? 'Fan' : 'System'}
                                                                </span>
                                                                <span className="text-xs opacity-75">
                                                                    {msg.timestamp.toLocaleTimeString()}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs">{msg.content}</p>
                                                            {msg.aiSuggested && (
                                                                <span className="text-xs opacity-75 ml-2">✨ AI</span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Add Fan Modal */}
            {showAddFanModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Add New Fan</h2>
                            <button
                                onClick={() => {
                                    setShowAddFanModal(false);
                                    setNewFanName('');
                                    setNewFanSpendingLevel(0);
                                    setNewFanTier('Free');
                                    setNewFanType('');
                                    setNewFanNotes('');
                                    setNewFanPreferredTone('');
                                    setNewFanFavoriteSessionType('');
                                    setNewFanCommunicationStyle('');
                                    setNewFanLanguagePreferences('');
                                    setNewFanSuggestedFlow('');
                                    setNewFanPastNotes('');
                                    setNewFanBoundaries('');
                                    setNewFanBoundariesChecklist({
                                        noFacePhotos: false,
                                        noRealName: false,
                                        explicitContentOnly: false,
                                        noCustomRequests: false,
                                        timeBoundaryOnly: false,
                                    });
                                }}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <XMarkIcon className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4 overflow-y-auto flex-1">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Fan Name / Username *
                                </label>
                                <input
                                    type="text"
                                    value={newFanName}
                                    onChange={(e) => setNewFanName(e.target.value)}
                                    placeholder="Enter fan name or username..."
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    autoFocus
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Spending Level (0-5)
                                    </label>
                                    <select
                                        value={newFanSpendingLevel}
                                        onChange={(e) => setNewFanSpendingLevel(Number(e.target.value))}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value={0}>0 - Not Set</option>
                                        <option value={1}>1</option>
                                        <option value={2}>2</option>
                                        <option value={3}>3</option>
                                        <option value={4}>4</option>
                                        <option value={5}>5 - Highest</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Subscription Tier
                                    </label>
                                    <select
                                        value={newFanTier}
                                        onChange={(e) => setNewFanTier(e.target.value as 'Free' | 'Paid')}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="Free">Free</option>
                                        <option value="Paid">Paid</option>
                                    </select>
                                </div>

                                <div className="flex items-center">
                                    <div className="w-full">
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Fan Type
                                        </label>
                                        <select
                                            value={newFanType}
                                            onChange={(e) => setNewFanType(e.target.value as 'Whale' | 'VIP' | 'Regular' | '')}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        >
                                            <option value="">Not set</option>
                                            <option value="Whale">Whale</option>
                                            <option value="VIP">VIP</option>
                                            <option value="Regular">Regular</option>
                                        </select>
                                    </div>
                                </div>
                            </div>


                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Preferred Tone
                                    </label>
                                    <select
                                        value={newFanPreferredTone === 'Very Explicit' ? 'Bold' : newFanPreferredTone}
                                        onChange={(e) => setNewFanPreferredTone(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="">Not set</option>
                                        <option value="soft">Soft</option>
                                        <option value="dominant">Dominant</option>
                                        <option value="playful">Playful</option>
                                        <option value="dirty">Dirty</option>
                                        <option value="Bold">Bold</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Favorite Session Type
                                    </label>
                                    <select
                                        value={newFanFavoriteSessionType === 'Explicit' ? 'Bold' : newFanFavoriteSessionType}
                                        onChange={(e) => setNewFanFavoriteSessionType(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="">Not set</option>
                                        <option value="Flirty chat">Flirty chat</option>
                                        <option value="GFE-style interaction">GFE-style interaction</option>
                                        <option value="Tease & anticipation">Tease & anticipation</option>
                                        <option value="Roleplay">Roleplay</option>
                                        <option value="Bold">Bold</option>
                                        <option value="Check-in / reconnect">Check-in / reconnect</option>
                                        <option value="High-engagement paid chat">High-engagement paid chat</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Communication Style
                                    </label>
                                    <select
                                        value={newFanCommunicationStyle === 'like Explicit' ? 'like Bold' : newFanCommunicationStyle}
                                        onChange={(e) => setNewFanCommunicationStyle(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="">Not set</option>
                                        <option value="casual">Casual & Friendly</option>
                                        <option value="formal">Formal & Polite</option>
                                        <option value="flirty">Flirty & Playful</option>
                                        <option value="direct">Direct & To-the-point</option>
                                        <option value="like Bold">Like Bold</option>
                                    </select>
                                </div>

                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Boundaries & Preferences Checklist
                                </label>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                    {[
                                        { key: 'noFacePhotos', label: 'No face photos' },
                                        { key: 'noRealName', label: 'No real name usage' },
                                        { key: 'explicitContentOnly', label: 'Bold content only' },
                                        { key: 'noCustomRequests', label: 'No custom content requests' },
                                        { key: 'timeBoundaryOnly', label: 'Time-bound sessions only' },
                                    ].map(({ key, label }) => (
                                        <label key={key} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={newFanBoundariesChecklist[key] || false}
                                                onChange={(e) => setNewFanBoundariesChecklist({
                                                    ...newFanBoundariesChecklist,
                                                    [key]: e.target.checked
                                                })}
                                                className="rounded border-gray-300 dark:border-gray-600 text-primary-600"
                                            />
                                            {label}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Additional Boundaries / Notes
                                </label>
                                <textarea
                                    value={newFanBoundaries}
                                    onChange={(e) => setNewFanBoundaries(e.target.value)}
                                    placeholder="Any other boundaries or preferences to remember..."
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    rows={2}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Suggested Flow (what works best)
                                </label>
                                <textarea
                                    value={newFanSuggestedFlow}
                                    onChange={(e) => setNewFanSuggestedFlow(e.target.value)}
                                    placeholder="e.g., 'Start slow, build anticipation, likes teasing before explicit, responds well to questions...'"
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    rows={2}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Past Notes (session history)
                                </label>
                                <textarea
                                    value={newFanPastNotes}
                                    onChange={(e) => setNewFanPastNotes(e.target.value)}
                                    placeholder="Notes from previous sessions, what they liked, topics discussed..."
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    rows={3}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Language/Word Preferences
                                </label>
                                <input
                                    type="text"
                                    value={newFanLanguagePreferences}
                                    onChange={(e) => setNewFanLanguagePreferences(e.target.value)}
                                    placeholder="e.g., 'Prefers pet names, likes being called daddy, no slurs...'"
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    General Notes (Optional)
                                </label>
                                <textarea
                                    value={newFanNotes}
                                    onChange={(e) => setNewFanNotes(e.target.value)}
                                    placeholder="Add any additional notes about this fan..."
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    rows={3}
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
                            <button
                                onClick={() => {
                                    setShowAddFanModal(false);
                                    setNewFanName('');
                                    setNewFanSpendingLevel(0);
                                    setNewFanTier('Free');
            setNewFanIsVIP(false);
                                    setNewFanNotes('');
                                    setNewFanPreferredTone('');
                                    setNewFanFavoriteSessionType('');
                                    setNewFanCommunicationStyle('');
                                    setNewFanLanguagePreferences('');
                                    setNewFanSuggestedFlow('');
                                    setNewFanPastNotes('');
                                    setNewFanBoundaries('');
                                    setNewFanBoundariesChecklist({
                                        noFacePhotos: false,
                                        noRealName: false,
                                        explicitContentOnly: false,
                                        noCustomRequests: false,
                                        timeBoundaryOnly: false,
                                    });
                                }}
                                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    if (!newFanName.trim()) {
                                        showToast?.('Please enter a fan name', 'error');
                                        return;
                                    }

                                    if (!user?.id) {
                                        showToast?.('You must be logged in to add fans', 'error');
                                        return;
                                    }

                                    setIsSavingFan(true);
                                    try {
                                        // Generate fan ID from name
                                        const fanId = newFanName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                                        
                                        // Check if fan already exists
                                        const existingFanDoc = await getDoc(doc(db, 'users', user.id, 'onlyfans_fan_preferences', fanId));
                                        if (existingFanDoc.exists()) {
                                            showToast?.('A fan with this name already exists', 'error');
                                            setIsSavingFan(false);
                                            return;
                                        }

                                        const fanData: any = {
                                            name: newFanName.trim(),
                                            spendingLevel: newFanSpendingLevel,
                                            subscriptionTier: newFanTier,
                                            isVIP: newFanType === 'VIP',
                                            isWhale: newFanType === 'Whale',
                                            isRegular: newFanType === 'Regular',
                                            totalSessions: 0,
                                            isBigSpender: newFanType === 'Whale' || newFanSpendingLevel >= 4,
                                            isLoyalFan: false,
                                            notes: newFanNotes.trim() || '',
                                            tags: [],
                                            engagementHistory: [],
                                            createdAt: Timestamp.now(),
                                            updatedAt: Timestamp.now(),
                                        };

                                        // Only add fields that have values (not empty strings or undefined)
                                        if (newFanPreferredTone) fanData.preferredTone = newFanPreferredTone;
                                        if (newFanFavoriteSessionType) fanData.favoriteSessionType = newFanFavoriteSessionType;
                                        if (newFanCommunicationStyle) fanData.communicationStyle = newFanCommunicationStyle;
                                        if (newFanLanguagePreferences && newFanLanguagePreferences.trim()) {
                                            fanData.languagePreferences = newFanLanguagePreferences.trim();
                                        }
                                        if (newFanSuggestedFlow && newFanSuggestedFlow.trim()) {
                                            fanData.suggestedFlow = newFanSuggestedFlow.trim();
                                        }
                                        if (newFanPastNotes && newFanPastNotes.trim()) {
                                            fanData.pastNotes = newFanPastNotes.trim();
                                        }
                                        if (newFanBoundaries && newFanBoundaries.trim()) {
                                            fanData.boundaries = newFanBoundaries.trim();
                                        }
                                        if (Object.keys(newFanBoundariesChecklist).some(key => newFanBoundariesChecklist[key])) {
                                            fanData.boundariesChecklist = newFanBoundariesChecklist;
                                        }

                                        await setDoc(doc(db, 'users', user.id, 'onlyfans_fan_preferences', fanId), fanData);
                                        
                                        // Clear form and close modal first
                                        setShowAddFanModal(false);
                                        setNewFanName('');
                                        setNewFanSpendingLevel(0);
                                        setNewFanTier('Free');
                                        setNewFanType('');
                                        setNewFanNotes('');
                                        setNewFanPreferredTone('');
                                        setNewFanFavoriteSessionType('');
                                        setNewFanCommunicationStyle('');
                                        setNewFanPreferredLanguage('');
                                        setNewFanLanguagePreferences('');
                                        setNewFanSuggestedFlow('');
                                        setNewFanPastNotes('');
                                        setNewFanBoundaries('');
                                        setNewFanBoundariesChecklist({
                                            noFacePhotos: false,
                                            noRealName: false,
                                            explicitContentOnly: false,
                                            noCustomRequests: false,
                                            timeBoundaryOnly: false,
                                        });
                                        
                                        // Show success message
                                        showToast?.('Fan added successfully!', 'success');
                                        
                                        // Reload fans list (don't await - let it happen in background)
                                        loadFans().catch(err => {
                                            console.error('Error reloading fans after save:', err);
                                            // Don't show error to user since save was successful
                                        });
                                    } catch (error) {
                                        console.error('Error adding fan:', error);
                                        showToast?.('Failed to add fan. Please try again.', 'error');
                                    } finally {
                                        setIsSavingFan(false);
                                    }
                                }}
                                disabled={isSavingFan || !newFanName.trim()}
                                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSavingFan ? 'Saving...' : 'Save Fan'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Fan Modal */}
            {showEditFanModal && editingFan && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Edit Fan: {editingFan.name}</h2>
                            <button
                                onClick={() => {
                                    setShowEditFanModal(false);
                                    setEditingFan(null);
                                }}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <XMarkIcon className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4 overflow-y-auto flex-1">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Fan Name / Username *
                                </label>
                                <input
                                    type="text"
                                    value={newFanName}
                                    onChange={(e) => setNewFanName(e.target.value)}
                                    placeholder="Enter fan name or username..."
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    autoFocus
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Spending Level (0-5)
                                    </label>
                                    <select
                                        value={newFanSpendingLevel}
                                        onChange={(e) => setNewFanSpendingLevel(Number(e.target.value))}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value={0}>0 - Not Set</option>
                                        <option value={1}>1</option>
                                        <option value={2}>2</option>
                                        <option value={3}>3</option>
                                        <option value={4}>4</option>
                                        <option value={5}>5 - Highest</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Subscription Tier
                                    </label>
                                    <select
                                        value={newFanTier}
                                        onChange={(e) => setNewFanTier(e.target.value as 'Free' | 'Paid')}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="Free">Free</option>
                                        <option value="Paid">Paid</option>
                                    </select>
                                </div>

                                <div className="flex items-center">
                                    <div className="w-full">
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Fan Type
                                        </label>
                                        <select
                                            value={newFanType}
                                            onChange={(e) => setNewFanType(e.target.value as 'Whale' | 'VIP' | 'Regular' | '')}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        >
                                            <option value="">Not set</option>
                                            <option value="Whale">Whale</option>
                                            <option value="VIP">VIP</option>
                                            <option value="Regular">Regular</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Preferred Tone
                                    </label>
                                    <select
                                        value={newFanPreferredTone === 'Very Explicit' ? 'Bold' : newFanPreferredTone}
                                        onChange={(e) => setNewFanPreferredTone(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="">Not set</option>
                                        <option value="soft">Soft</option>
                                        <option value="dominant">Dominant</option>
                                        <option value="playful">Playful</option>
                                        <option value="dirty">Dirty</option>
                                        <option value="Bold">Bold</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Favorite Session Type
                                    </label>
                                    <select
                                        value={newFanFavoriteSessionType === 'Explicit' ? 'Bold' : newFanFavoriteSessionType}
                                        onChange={(e) => setNewFanFavoriteSessionType(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="">Not set</option>
                                        <option value="Flirty chat">Flirty chat</option>
                                        <option value="GFE-style interaction">GFE-style interaction</option>
                                        <option value="Tease & anticipation">Tease & anticipation</option>
                                        <option value="Roleplay">Roleplay</option>
                                        <option value="Bold">Bold</option>
                                        <option value="Check-in / reconnect">Check-in / reconnect</option>
                                        <option value="High-engagement paid chat">High-engagement paid chat</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Communication Style
                                    </label>
                                    <select
                                        value={newFanCommunicationStyle === 'like Explicit' ? 'like Bold' : newFanCommunicationStyle}
                                        onChange={(e) => setNewFanCommunicationStyle(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="">Not set</option>
                                        <option value="casual">Casual & Friendly</option>
                                        <option value="formal">Formal & Polite</option>
                                        <option value="flirty">Flirty & Playful</option>
                                        <option value="direct">Direct & To-the-point</option>
                                        <option value="like Bold">Like Bold</option>
                                    </select>
                                </div>

                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Boundaries & Preferences Checklist
                                </label>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                    {[
                                        { key: 'noFacePhotos', label: 'No face photos' },
                                        { key: 'noRealName', label: 'No real name usage' },
                                        { key: 'explicitContentOnly', label: 'Bold content only' },
                                        { key: 'noCustomRequests', label: 'No custom content requests' },
                                        { key: 'timeBoundaryOnly', label: 'Time-bound sessions only' },
                                    ].map(({ key, label }) => (
                                        <label key={key} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={newFanBoundariesChecklist[key] || false}
                                                onChange={(e) => setNewFanBoundariesChecklist({
                                                    ...newFanBoundariesChecklist,
                                                    [key]: e.target.checked
                                                })}
                                                className="rounded border-gray-300 dark:border-gray-600 text-primary-600"
                                            />
                                            {label}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Additional Boundaries / Notes
                                </label>
                                <textarea
                                    value={newFanBoundaries}
                                    onChange={(e) => setNewFanBoundaries(e.target.value)}
                                    placeholder="Any other boundaries or preferences to remember..."
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    rows={2}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Suggested Flow (what works best)
                                </label>
                                <textarea
                                    value={newFanSuggestedFlow}
                                    onChange={(e) => setNewFanSuggestedFlow(e.target.value)}
                                    placeholder="e.g., 'Start slow, build anticipation, likes teasing before explicit, responds well to questions...'"
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    rows={2}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Past Notes (session history)
                                </label>
                                <textarea
                                    value={newFanPastNotes}
                                    onChange={(e) => setNewFanPastNotes(e.target.value)}
                                    placeholder="Notes from previous sessions, what they liked, topics discussed..."
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    rows={3}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Language/Word Preferences
                                </label>
                                <input
                                    type="text"
                                    value={newFanLanguagePreferences}
                                    onChange={(e) => setNewFanLanguagePreferences(e.target.value)}
                                    placeholder="e.g., 'Prefers pet names, likes being called daddy, no slurs...'"
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    General Notes (Optional)
                                </label>
                                <textarea
                                    value={newFanNotes}
                                    onChange={(e) => setNewFanNotes(e.target.value)}
                                    placeholder="Add any additional notes about this fan..."
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    rows={3}
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
                            <button
                                onClick={() => {
                                    setShowEditFanModal(false);
                                    setEditingFan(null);
                                }}
                                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveEditedFan}
                                disabled={isSavingFan || !newFanName.trim()}
                                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSavingFan ? 'Updating...' : 'Update Fan'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Schedule Session Modal */}
            {showScheduleSessionModal && sessionFan && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md">
                        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Schedule Session</h2>
                            <button
                                onClick={() => {
                                    setShowScheduleSessionModal(false);
                                    setSessionFan(null);
                                }}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <XMarkIcon className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Fan
                                </label>
                                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-md text-gray-900 dark:text-white">
                                    {sessionFan.name}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Date *
                                </label>
                                <input
                                    type="date"
                                    value={sessionDate}
                                    onChange={(e) => setSessionDate(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    min={new Date().toISOString().split('T')[0]}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Time *
                                </label>
                                <input
                                    type="time"
                                    value={sessionTime}
                                    onChange={(e) => setSessionTime(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    required
                                />
                            </div>

                            <div className="pt-2">
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    Session will be created on the calendar for {sessionFan.name}
                                    {sessionFan.preferences.favoriteSessionType && ` (${sessionFan.preferences.favoriteSessionType})`}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
                            <button
                                onClick={() => {
                                    setShowScheduleSessionModal(false);
                                    setSessionFan(null);
                                }}
                                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveScheduledSession}
                                disabled={!sessionDate || !sessionTime}
                                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Schedule Session
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {contentPreview && (
                <div
                    className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 overflow-hidden"
                    onClick={() => setContentPreview(null)}
                >
                    <div
                        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-xl p-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                                Delivered {contentPreview.type}
                            </h3>
                            <button
                                type="button"
                                onClick={() => setContentPreview(null)}
                                className="text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white"
                            >
                                Close
                            </button>
                        </div>
                        {contentPreview.type === 'video' && (
                            <video
                                src={contentPreview.url}
                                controls
                                className="w-full max-h-[56vh] rounded bg-black object-contain"
                                preload="metadata"
                            />
                        )}
                        {contentPreview.type === 'image' && (
                            <img
                                src={contentPreview.url}
                                alt="Delivered content"
                                className="w-full rounded object-contain max-h-[56vh]"
                            />
                        )}
                        {contentPreview.type === 'audio' && (
                            <audio src={contentPreview.url} controls className="w-full" preload="metadata" />
                        )}
                    </div>
                </div>
            )}

        </div>
    );
};

