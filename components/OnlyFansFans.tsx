import React, { useState, useEffect } from 'react';
import { useAppContext } from './AppContext';
import { UserIcon, SearchIcon, StarIcon, SparklesIcon, TrashIcon, EditIcon, PlusIcon, XMarkIcon } from './icons/UIIcons';
import { auth, db } from '../firebaseConfig';
import { collection, getDocs, doc, getDoc, setDoc, deleteDoc, updateDoc, query, orderBy, limit, Timestamp } from 'firebase/firestore';

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
    preferences: {
        preferredTone?: 'soft' | 'dominant' | 'playful' | 'dirty' | 'Very Explicit';
        favoriteSessionType?: string;
        communicationStyle?: 'casual' | 'formal' | 'flirty' | 'direct' | 'like Explicit';
        totalSessions?: number;
        spendingLevel?: number;
        subscriptionTier?: 'Free' | 'Paid';
        isVIP?: boolean;
        isLoyalFan?: boolean;
        isBigSpender?: boolean;
        lastSessionDate?: string;
        notes?: string;
        reminders?: Array<{ id: string; text: string; date: string }>;
        tags?: string[];
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

export const OnlyFansFans: React.FC = () => {
    const { user, showToast } = useAppContext();
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
    const [newFanName, setNewFanName] = useState('');
    const [newFanSpendingLevel, setNewFanSpendingLevel] = useState<number>(0);
    const [newFanTier, setNewFanTier] = useState<'Free' | 'Paid'>('Free');
    const [newFanIsVIP, setNewFanIsVIP] = useState<boolean>(false);
    const [newFanNotes, setNewFanNotes] = useState('');
    const [newFanPreferredTone, setNewFanPreferredTone] = useState<string>('');
    const [newFanFavoriteSessionType, setNewFanFavoriteSessionType] = useState<string>('');
    const [newFanCommunicationStyle, setNewFanCommunicationStyle] = useState<string>('');
    const [newFanPreferredLanguage, setNewFanPreferredLanguage] = useState<string>('');
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

    // Load fans
    const loadFans = async () => {
        if (!user?.id) return;
        setIsLoading(true);
        try {
            const fansSnap = await getDocs(collection(db, 'users', user.id, 'onlyfans_fan_preferences'));
            const fansList = fansSnap.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    name: data.name || doc.id,
                    preferences: {
                        ...data,
                        spendingLevel: data.spendingLevel || (data.totalSpent ? Math.min(5, Math.max(1, Math.ceil(data.totalSpent / 200))) : 0),
                        totalSessions: data.totalSessions || 0,
                        isBigSpender: data.isBigSpender || (data.spendingLevel && data.spendingLevel >= 4) || false,
                        isLoyalFan: data.isLoyalFan || (data.totalSessions && data.totalSessions >= 5) || false,
                        subscriptionTier: (() => {
                            // Migrate old 'VIP' or 'Regular' tiers to 'Paid' or 'Free'
                            const tier = data.subscriptionTier;
                            if (tier === 'VIP' || tier === 'Regular') {
                                return 'Paid';
                            }
                            return tier || (data.totalSessions >= 3 ? 'Paid' : 'Free');
                        })(),
                        isVIP: data.isVIP || false,  // Only use checkbox value, not auto-set from spending
                        lastSessionDate: data.lastSessionDate?.toDate ? data.lastSessionDate.toDate().toISOString() : (data.lastSessionDate || undefined),
                        engagementHistory: data.engagementHistory || [],
                        notes: data.notes || '',
                        reminders: data.reminders || [],
                        tags: data.tags || []
                    }
                };
            });
            setFans(fansList);
        } catch (error) {
            console.error('Error loading fans:', error);
            showToast?.('Failed to load fans', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    // Load session history from database
    const loadSessionHistory = async (fanId: string) => {
        if (!user?.id) return;
        
        // If already loaded, just toggle
        if (sessionHistory[fanId]) {
            setExpandedSessionFanId(expandedSessionFanId === fanId ? null : fanId);
            return;
        }
        
        setIsLoadingSessionHistory({ ...isLoadingSessionHistory, [fanId]: true });
        try {
            const sessionsSnap = await getDocs(query(
                collection(db, 'users', user.id, 'onlyfans_sexting_sessions'),
                orderBy('createdAt', 'desc')
            ));
            
            const sessions: any[] = [];
            sessionsSnap.forEach(doc => {
                const data = doc.data();
                if (data.fanId === fanId) {
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
                }
            });
            
            setSessionHistory({ ...sessionHistory, [fanId]: sessions });
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
        bigSpenders: fans.filter(f => f.preferences.isBigSpender || (f.preferences.spendingLevel || 0) >= 4).length,
        loyalFans: fans.filter(f => f.preferences.isLoyalFan || (f.preferences.totalSessions || 0) >= 5).length,
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
            filtered = filtered.filter(fan => fan.preferences.isBigSpender || (fan.preferences.spendingLevel || 0) >= 4);
        } else if (fanFilter === 'loyal') {
            filtered = filtered.filter(fan => fan.preferences.isLoyalFan || (fan.preferences.totalSessions || 0) >= 5);
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

    const getInitials = (name: string) => {
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    const getTierColor = (tier?: string) => {
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
                reminderTime: sessionTime,
                createdAt: new Date().toISOString(),
                userId: user.id,
                fanId: sessionFan.id,
                fanName: sessionFan.name,
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
        setNewFanIsVIP(fan.preferences.isVIP || false);
        setNewFanNotes(fan.preferences.notes || '');
        setNewFanPreferredTone(fan.preferences.preferredTone || '');
        setNewFanFavoriteSessionType(fan.preferences.favoriteSessionType || '');
        setNewFanCommunicationStyle(fan.preferences.communicationStyle || '');
        setNewFanPreferredLanguage(fan.preferences.preferredLanguage || '');
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
                isVIP: newFanIsVIP,
                isBigSpender: newFanSpendingLevel >= 4,
                notes: newFanNotes.trim() || '',
                tags: [],
                updatedAt: Timestamp.now(),
            };

            // Only add fields that have values (not empty strings or undefined)
            if (newFanPreferredTone) fanData.preferredTone = newFanPreferredTone;
            if (newFanFavoriteSessionType) fanData.favoriteSessionType = newFanFavoriteSessionType;
            if (newFanCommunicationStyle) fanData.communicationStyle = newFanCommunicationStyle;
            if (newFanPreferredLanguage) fanData.preferredLanguage = newFanPreferredLanguage;
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
            
            showToast?.('Fan updated successfully!', 'success');
            setShowEditFanModal(false);
            setEditingFan(null);
            // Reset form
            setNewFanName('');
            setNewFanSpendingLevel(0);
            setNewFanTier('Free');
            setNewFanIsVIP(false);
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
            // Reload fans
            loadFans();
        } catch (error) {
            console.error('Error updating fan:', error);
            showToast?.('Failed to update fan', 'error');
        } finally {
            setIsSavingFan(false);
        }
    };

    const filteredFans = getFilteredAndSortedFans();
    const displayedActivity = activityTypeFilter === 'all'
        ? selectedFanActivity
        : selectedFanActivity.filter(a => a.type === activityTypeFilter);
    const last5Activity = displayedActivity.slice(0, 5);

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <SparklesIcon className="w-8 h-8 text-primary-600 dark:text-primary-400" />
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                            Fan Management
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
                    Central hub for managing fan relationships and tracking engagement across all Premium Content Studio features.
                </p>
            </div>

            {/* Stats Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Fans</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalFans}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Active Fans</div>
                    <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">{stats.activeFans}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-500">Last 30 days</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Big Spenders</div>
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.bigSpenders}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Loyal Fans</div>
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
                        <option value="all">All Fans</option>
                        <option value="bigSpenders">Big Spenders</option>
                        <option value="loyal">Loyal Fans</option>
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
                            {fanSearchQuery || fanFilter !== 'all' ? 'No fans match your filters' : 'No fans yet. Start a session in Roleplay & Interactive Ideas to create your first fan card!'}
                        </div>
                    ) : (
                        filteredFans.map((fan) => {
                            const prefs = fan.preferences;
                            const isSelected = selectedFan?.id === fan.id;

                            return (
                                <div
                                    key={fan.id}
                                    onClick={() => setSelectedFan(fan)}
                                    className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all hover:shadow-lg ${
                                        isSelected
                                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-300 dark:hover:border-primary-700'
                                    }`}
                                >
                                    {/* Action Buttons - Top Right */}
                                    <div className="absolute top-2 right-2 flex gap-1 z-10">
                                        {prefs.subscriptionTier && (
                                            <span className={`px-2 py-1 text-xs font-semibold text-white rounded-full ${getTierColor(prefs.subscriptionTier)}`}>
                                                {prefs.subscriptionTier}
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
                                        {/* Avatar */}
                                        <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-700 dark:text-primary-300 font-semibold">
                                            {getInitials(fan.name)}
                                        </div>

                                        {/* Fan Info */}
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-semibold text-gray-900 dark:text-white truncate">
                                                {fan.name}
                                            </h4>

                                            {/* Quick Stats */}
                                            <div className="mt-2 space-y-1">
                                                {prefs.totalSessions !== undefined && prefs.totalSessions > 0 && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            loadSessionHistory(fan.id);
                                                        }}
                                                        className="flex items-center gap-2 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 cursor-pointer"
                                                    >
                                                        <span className="font-medium">{prefs.totalSessions}</span>
                                                        <span>sessions</span>
                                                    </button>
                                                )}
                                                {prefs.spendingLevel && prefs.spendingLevel > 0 && (
                                                    <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                                                        <span className="font-medium">Spending:</span>
                                                        <span className="flex items-center gap-0.5">
                                                            {Array.from({ length: 5 }).map((_, i) => (
                                                                <span key={i} className={i < (prefs.spendingLevel || 0) ? 'text-green-600 dark:text-green-400' : 'text-gray-300 dark:text-gray-600'}>
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
                                                            ⭐ {prefs.favoriteSessionType.split(' ')[0]}
                                                        </span>
                                                    )}
                                                    {prefs.preferredTone && (
                                                        <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded">
                                                            🎭 {prefs.preferredTone}
                                                        </span>
                                                    )}
                                                    {prefs.communicationStyle && (
                                                        <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
                                                            💬 {prefs.communicationStyle}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Badges */}
                                    <div className="mt-2 flex gap-1">
                                        {prefs.isVIP && (
                                            <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 px-2 py-0.5 rounded font-semibold">
                                                VIP
                                            </span>
                                        )}
                                        {prefs.isBigSpender && (
                                            <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded">
                                                💰 Big Spender
                                            </span>
                                        )}
                                        {prefs.isLoyalFan && (
                                            <span className="text-xs bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 px-2 py-0.5 rounded">
                                                ❤️ Loyal
                                            </span>
                                        )}
                                    </div>

                                    {/* Last 5 Items Preview */}
                                    {isSelected && last5Activity.length > 0 && (
                                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                                            <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Last 5 Activities:</div>
                                            <div className="space-y-1">
                                                {last5Activity.map((activity) => (
                                                    <div key={activity.id} className="text-xs text-gray-600 dark:text-gray-400 truncate">
                                                        <span className="text-gray-400 dark:text-gray-500">
                                                            {new Date(activity.date).toLocaleDateString()}
                                                        </span>
                                                        {' · '}
                                                        <span>{activity.title}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
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
                <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                            Fan Details: {selectedFan.name}
                        </h2>
                        <button
                            onClick={() => setSelectedFan(null)}
                            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                        >
                            Close
                        </button>
                    </div>

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

                    {/* Last 5 Activities */}
                    {last5Activity.length > 0 && (
                        <div className="mb-4">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Last 5 Activities</h3>
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
                        </div>
                    )}

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
            setNewFanIsVIP(false);
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

                            <div className="grid grid-cols-2 gap-4">
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
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={newFanIsVIP}
                                            onChange={(e) => setNewFanIsVIP(e.target.checked)}
                                            className="w-4 h-4 text-yellow-600 bg-gray-100 border-gray-300 rounded focus:ring-yellow-500 dark:focus:ring-yellow-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                        />
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            VIP (Special Treatment)
                                        </span>
                                    </label>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Preferred Tone
                                    </label>
                                    <select
                                        value={newFanPreferredTone}
                                        onChange={(e) => setNewFanPreferredTone(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="">Not set</option>
                                        <option value="soft">Soft</option>
                                        <option value="dominant">Dominant</option>
                                        <option value="playful">Playful</option>
                                        <option value="dirty">Dirty</option>
                                        <option value="Very Explicit">Very Explicit</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Favorite Session Type
                                    </label>
                                    <select
                                        value={newFanFavoriteSessionType}
                                        onChange={(e) => setNewFanFavoriteSessionType(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="">Not set</option>
                                        <option value="Flirty chat">Flirty chat</option>
                                        <option value="GFE-style interaction">GFE-style interaction</option>
                                        <option value="Tease & anticipation">Tease & anticipation</option>
                                        <option value="Roleplay">Roleplay</option>
                                        <option value="Explicit">Explicit</option>
                                        <option value="Check-in / reconnect">Check-in / reconnect</option>
                                        <option value="High-engagement paid chat">High-engagement paid chat</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Communication Style
                                    </label>
                                    <select
                                        value={newFanCommunicationStyle}
                                        onChange={(e) => setNewFanCommunicationStyle(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="">Not set</option>
                                        <option value="casual">Casual & Friendly</option>
                                        <option value="formal">Formal & Polite</option>
                                        <option value="flirty">Flirty & Playful</option>
                                        <option value="direct">Direct & To-the-point</option>
                                        <option value="like Explicit">Like Explicit</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Preferred Language
                                    </label>
                                    <select
                                        value={newFanPreferredLanguage}
                                        onChange={(e) => setNewFanPreferredLanguage(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="">Not set</option>
                                        <option value="English">English</option>
                                        <option value="Spanish">Spanish</option>
                                        <option value="French">French</option>
                                        <option value="German">German</option>
                                        <option value="Portuguese">Portuguese</option>
                                        <option value="Other">Other</option>
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
                                        { key: 'explicitContentOnly', label: 'Explicit content only' },
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
                                            isVIP: newFanIsVIP,
                                            totalSessions: 0,
                                            isBigSpender: newFanSpendingLevel >= 4,
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
                                        if (newFanPreferredLanguage) fanData.preferredLanguage = newFanPreferredLanguage;
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
                                        
                                        showToast?.('Fan added successfully!', 'success');
                                        setShowAddFanModal(false);
                                        setNewFanName('');
                                        setNewFanSpendingLevel(0);
                                        setNewFanTier('Free');
            setNewFanIsVIP(false);
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
                                        await loadFans(); // Reload fans list
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
                                {isSavingFan ? 'Adding...' : 'Add Fan'}
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

                            <div className="grid grid-cols-2 gap-4">
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
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={newFanIsVIP}
                                            onChange={(e) => setNewFanIsVIP(e.target.checked)}
                                            className="w-4 h-4 text-yellow-600 bg-gray-100 border-gray-300 rounded focus:ring-yellow-500 dark:focus:ring-yellow-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                        />
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            VIP (Special Treatment)
                                        </span>
                                    </label>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Preferred Tone
                                    </label>
                                    <select
                                        value={newFanPreferredTone}
                                        onChange={(e) => setNewFanPreferredTone(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="">Not set</option>
                                        <option value="soft">Soft</option>
                                        <option value="dominant">Dominant</option>
                                        <option value="playful">Playful</option>
                                        <option value="dirty">Dirty</option>
                                        <option value="Very Explicit">Very Explicit</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Favorite Session Type
                                    </label>
                                    <select
                                        value={newFanFavoriteSessionType}
                                        onChange={(e) => setNewFanFavoriteSessionType(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="">Not set</option>
                                        <option value="Flirty chat">Flirty chat</option>
                                        <option value="GFE-style interaction">GFE-style interaction</option>
                                        <option value="Tease & anticipation">Tease & anticipation</option>
                                        <option value="Roleplay">Roleplay</option>
                                        <option value="Explicit">Explicit</option>
                                        <option value="Check-in / reconnect">Check-in / reconnect</option>
                                        <option value="High-engagement paid chat">High-engagement paid chat</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Communication Style
                                    </label>
                                    <select
                                        value={newFanCommunicationStyle}
                                        onChange={(e) => setNewFanCommunicationStyle(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="">Not set</option>
                                        <option value="casual">Casual & Friendly</option>
                                        <option value="formal">Formal & Polite</option>
                                        <option value="flirty">Flirty & Playful</option>
                                        <option value="direct">Direct & To-the-point</option>
                                        <option value="like Explicit">Like Explicit</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Preferred Language
                                    </label>
                                    <select
                                        value={newFanPreferredLanguage}
                                        onChange={(e) => setNewFanPreferredLanguage(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="">Not set</option>
                                        <option value="English">English</option>
                                        <option value="Spanish">Spanish</option>
                                        <option value="French">French</option>
                                        <option value="German">German</option>
                                        <option value="Portuguese">Portuguese</option>
                                        <option value="Other">Other</option>
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
                                        { key: 'explicitContentOnly', label: 'Explicit content only' },
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

        </div>
    );
};

