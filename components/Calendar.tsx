
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { CalendarEvent, Platform, Post } from '../types';
import { InstagramIcon, TikTokIcon, XIcon, ThreadsIcon, YouTubeIcon, LinkedInIcon, FacebookIcon, PinterestIcon } from './icons/PlatformIcons';
import { PlusIcon, SparklesIcon, XMarkIcon, TrashIcon, DownloadIcon, CheckCircleIcon, CopyIcon, SendIcon } from './icons/UIIcons';
import { useAppContext } from './AppContext';
import { db, auth } from '../firebaseConfig';
import { doc, setDoc, deleteDoc, deleteField, updateDoc, collection, query, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { hasCapability } from '../src/services/platformCapabilities';
import { generateCaptions } from '../src/services/geminiService';
import { UpgradePrompt } from './UpgradePrompt';
import { hasCalendarAccess } from '../src/utils/planAccess';
import { publishFacebookPost, publishInstagramPost, publishTweet } from '../src/services/socialMediaService';
import { OFFLINE_MODE } from '../constants';

const platformIcons: Record<Platform, React.ReactNode> = {
    Instagram: <InstagramIcon />,
    TikTok: <TikTokIcon />,
    X: <XIcon />,
    Threads: <ThreadsIcon />,
    YouTube: <YouTubeIcon />,
    LinkedIn: <LinkedInIcon />,
    Facebook: <FacebookIcon />,
    Pinterest: <PinterestIcon />,
    'My Page': undefined
};

const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Normalize `liveStreams.scheduledStart` (ISO string or Firestore Timestamp) for calendar sorting. */
function isoFromLiveStreamScheduledStart(v: unknown): string | null {
    if (v == null) return null;
    if (typeof v === 'string' && v.trim()) {
        const t = Date.parse(v.trim());
        return Number.isFinite(t) ? new Date(t).toISOString() : null;
    }
    if (typeof v === 'object' && v !== null && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
        const d = (v as { toDate: () => Date }).toDate();
        return Number.isFinite(d.getTime()) ? d.toISOString() : null;
    }
    return null;
}

/** If scheduled start + grace has passed, treat stuck `live` / `scheduled` streams as ended in the UI. */
const LIVE_STREAM_STALE_UI_MS = 6 * 60 * 60 * 1000;

function effectiveLiveStreamStatusForUi(statusRaw: string, dateISO: string | null | undefined): string {
    const st = String(statusRaw ?? '').trim().toLowerCase();
    if (st === 'ended' || st === 'cancelled') return st;
    if (!dateISO) return st || 'scheduled';
    const startMs = Date.parse(dateISO);
    if (!Number.isFinite(startMs)) return st || 'scheduled';
    if (Date.now() > startMs + LIVE_STREAM_STALE_UI_MS) return 'ended';
    return st || 'scheduled';
}

export const Calendar: React.FC = () => {
    const { calendarEvents, setActivePage, posts, setPosts, user, showToast, updatePost, addCalendarEvent, socialAccounts } = useAppContext();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedEvent, setSelectedEvent] = useState<{ event: CalendarEvent; post: Post | null } | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editDate, setEditDate] = useState('');
    const [editTime, setEditTime] = useState('');
    const [editGoal, setEditGoal] = useState<string>('engagement');
    const [editTone, setEditTone] = useState<string>('friendly');
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [regeneratePlatform, setRegeneratePlatform] = useState<Platform | null>(null);
    const [regenerateGoal, setRegenerateGoal] = useState<string>('engagement');
    const [regenerateTone, setRegenerateTone] = useState<string>('friendly');
    const [isSaving, setIsSaving] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [isRunningScheduledPosts, setIsRunningScheduledPosts] = useState(false);
    const [autoPublishUpdating, setAutoPublishUpdating] = useState(false);
    const [exportPreview, setExportPreview] = useState<{ post: Post; event: CalendarEvent } | null>(null);
    
    // Reminder state
    const [reminders, setReminders] = useState<Array<{ id: string; title: string; date: string; reminderType: 'post' | 'shoot'; description?: string; reminderTime?: string; createdAt: string; userId: string }>>([]);
    const [isCreatingReminder, setIsCreatingReminder] = useState(false);
    const [selectedReminder, setSelectedReminder] = useState<{ id: string; title: string; date: string; reminderType: 'post' | 'shoot'; description?: string; reminderTime?: string; createdAt: string; userId: string } | null>(null);
    const [reminderTitle, setReminderTitle] = useState('');
    const [reminderDescription, setReminderDescription] = useState('');
    const [reminderType, setReminderType] = useState<'post' | 'shoot'>('post');
    const [reminderDate, setReminderDate] = useState('');
    const [reminderTime, setReminderTime] = useState('');
    const [purchaseEvents, setPurchaseEvents] = useState<
      Array<{
        id: string;
        title: string;
        date: string;
        treatPurchaseId?: string;
        treatStatus?: "scheduled" | "delivered" | "confirmed" | "in_progress" | "completed" | "cancelled";
        fanName?: string;
        fanEmail?: string;
        deliveryType?: "video" | "image" | "audio" | "text" | null;
        deliveryUrl?: string | null;
        deliveryText?: string | null;
      }>
    >([]);

    const [liveStreamScheduleEvents, setLiveStreamScheduleEvents] = useState<
        Array<{
            streamId: string;
            title: string;
            dateISO: string;
            status: string;
            ticketCents: number;
            creatorTestOnly: boolean;
            description?: string;
        }>
    >([]);

    // Calendar is Pro+ (or Admin). Free plan should not access any calendar features.
    if (!hasCalendarAccess(user)) {
        return (
            <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-full">
                <div className="max-w-4xl mx-auto">
                    <UpgradePrompt
                        featureName="My Schedule"
                        onUpgradeClick={() => setActivePage('pricing')}
                    />
                </div>
            </div>
        );
    }

    // Load reminders from Firestore
    useEffect(() => {
        if (!user) return;

        const remindersRef = collection(db, 'users', user.id, 'calendar_events');
        const q = query(remindersRef, orderBy('date', 'asc'));

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const loadedReminders: Array<{ id: string; title: string; date: string; reminderType: 'post' | 'shoot'; description?: string; reminderTime?: string; createdAt: string; userId: string }> = [];
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    // Only load reminders (events with reminderType field, not posts)
                    if (data.reminderType && !data.platform) {
                        loadedReminders.push({
                            id: doc.id,
                            ...data,
                        } as any);
                    }
                });
                setReminders(loadedReminders);
            },
            (error) => {
                console.error('Error loading reminders:', error);
            }
        );

        return () => unsubscribe();
    }, [user]);

    // Load Fan Hub purchase schedule/delivery events into main calendar.
    useEffect(() => {
        if (!user?.id) {
            setPurchaseEvents([]);
            return;
        }
        const eventsRef = collection(db, 'users', user.id, 'onlyfans_calendar_events');
        const q = query(eventsRef, orderBy('date', 'asc'));
        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const next: Array<{
                    id: string;
                    title: string;
                    date: string;
                    treatPurchaseId?: string;
                    treatStatus?: "scheduled" | "delivered" | "confirmed" | "in_progress" | "completed" | "cancelled";
                    fanName?: string;
                    fanEmail?: string;
                    deliveryType?: "video" | "image" | "audio" | "text" | null;
                    deliveryUrl?: string | null;
                    deliveryText?: string | null;
                }> = [];
                snapshot.forEach((docSnap) => {
                    const data = docSnap.data() as Record<string, unknown>;
                    if (!data?.treatPurchaseId) return;
                    const date = typeof data.date === 'string' ? data.date : '';
                    if (!date) return;
                    next.push({
                        id: docSnap.id,
                        title: typeof data.title === 'string' && data.title.trim() ? data.title : 'Store purchase',
                        date,
                        treatPurchaseId: typeof data.treatPurchaseId === 'string' ? data.treatPurchaseId : undefined,
                        treatStatus:
                            data.treatStatus === 'scheduled' ||
                            data.treatStatus === 'delivered' ||
                            data.treatStatus === 'confirmed' ||
                            data.treatStatus === 'in_progress' ||
                            data.treatStatus === 'completed' ||
                            data.treatStatus === 'cancelled'
                                ? data.treatStatus
                                : undefined,
                        fanName: typeof data.fanName === 'string' ? data.fanName : undefined,
                        fanEmail: typeof data.fanEmail === 'string' ? data.fanEmail : undefined,
                        deliveryType:
                            data.deliveryType === 'video' ||
                            data.deliveryType === 'image' ||
                            data.deliveryType === 'audio' ||
                            data.deliveryType === 'text'
                                ? data.deliveryType
                                : null,
                        deliveryUrl: typeof data.deliveryUrl === 'string' ? data.deliveryUrl : null,
                        deliveryText: typeof data.deliveryText === 'string' ? data.deliveryText : null,
                    });
                });
                setPurchaseEvents(next);
            },
            (error) => {
                console.error('Error loading purchase events:', error);
            }
        );
        return () => unsubscribe();
    }, [user?.id]);

    // Fan Hub scheduled / live broadcasts (`creators/{uid}/liveStreams`) — updates when scheduled or rescheduled.
    useEffect(() => {
        if (!user?.id) {
            setLiveStreamScheduleEvents([]);
            return;
        }
        const colRef = collection(db, 'creators', user.id, 'liveStreams');
        const unsubscribe = onSnapshot(
            colRef,
            (snapshot) => {
                const next: Array<{
                    streamId: string;
                    title: string;
                    dateISO: string;
                    status: string;
                    ticketCents: number;
                    creatorTestOnly: boolean;
                    description?: string;
                }> = [];
                snapshot.forEach((docSnap) => {
                    const d = docSnap.data() as Record<string, unknown>;
                    if (d.hiddenFromMainCalendar === true) return;
                    const status = typeof d.status === 'string' ? d.status.trim().toLowerCase() : '';
                    if (status === 'ended' || status === 'cancelled') return;
                    const dateISO = isoFromLiveStreamScheduledStart(d.scheduledStart);
                    if (!dateISO) return;
                    const titleRaw = typeof d.title === 'string' ? d.title.trim() : '';
                    const title = titleRaw || 'Live stream';
                    const ticketCents =
                        typeof d.ticketCents === 'number' && Number.isFinite(d.ticketCents)
                            ? Math.max(0, Math.round(d.ticketCents))
                            : 0;
                    const desc =
                        typeof d.description === 'string' && d.description.trim() ? d.description.trim() : undefined;
                    next.push({
                        streamId: docSnap.id,
                        title,
                        dateISO,
                        status: status || 'scheduled',
                        ticketCents,
                        creatorTestOnly: d.creatorTestOnly === true,
                        ...(desc ? { description: desc } : {}),
                    });
                });
                setLiveStreamScheduleEvents(next);
            },
            (error) => {
                console.error('Error loading Fan Hub live stream schedule:', error);
            }
        );
        return () => unsubscribe();
    }, [user?.id]);

    // Calendar should ONLY show posts with scheduledDate (Scheduled or Published status)
    // Derive events directly from Posts, not from separate calendar_events collection
    // Also include reminders
    const filteredEvents = useMemo(() => {
        const events: CalendarEvent[] = [];
        
        // Debug logging - log ALL posts with scheduledDate to see what we're working with
        if (posts && Array.isArray(posts)) {
            const allPostsWithDate = posts.filter(p => p.scheduledDate);
            const draftPosts = posts.filter(p => p.status === 'Draft' && p.scheduledDate);
            const scheduledPosts = posts.filter(p => p.status === 'Scheduled' && p.scheduledDate);
            
            console.log('Calendar: All posts with scheduledDate:', allPostsWithDate.length);
            console.log('Calendar: Posts by status - Draft:', draftPosts.length, 'Scheduled:', scheduledPosts.length, 'Published:', posts.filter(p => p.status === 'Published' && p.scheduledDate).length);
            
            // Log posts from Strategy (check for roadmap- prefix in ID)
            const strategyPosts = allPostsWithDate.filter(p => p.id?.includes('roadmap-'));
            if (strategyPosts.length > 0) {
                console.log('Calendar: Strategy posts found:', strategyPosts.length, strategyPosts.map(p => ({
                    id: p.id,
                    status: p.status,
                    scheduledDate: p.scheduledDate,
                    dateFormatted: p.scheduledDate ? new Date(p.scheduledDate).toLocaleString() : 'No date',
                    platforms: p.platforms,
                    hasMediaUrl: !!p.mediaUrl
                })));
            }
            
            if (draftPosts.length > 0 || scheduledPosts.length > 0) {
                const currentMonth = currentDate.getMonth();
                const currentYear = currentDate.getFullYear();
                const draftInCurrentMonth = draftPosts.filter(p => {
                    if (!p.scheduledDate) return false;
                    const postDate = new Date(p.scheduledDate);
                    return postDate.getMonth() === currentMonth && postDate.getFullYear() === currentYear;
                });
                const scheduledInCurrentMonth = scheduledPosts.filter(p => {
                    if (!p.scheduledDate) return false;
                    const postDate = new Date(p.scheduledDate);
                    return postDate.getMonth() === currentMonth && postDate.getFullYear() === currentYear;
                });
                console.log('Calendar: Current month view - Draft:', draftInCurrentMonth.length, 'Scheduled:', scheduledInCurrentMonth.length, 'Month:', currentMonth + 1, 'Year:', currentYear);
                if (draftPosts.length > 0) {
                    console.log('Calendar: Draft post dates:', draftPosts.map(p => {
                        if (!p.scheduledDate) return { id: p.id, date: 'No date', day: 0, month: 0 };
                        const date = new Date(p.scheduledDate);
                        return { id: p.id, date: date.toLocaleDateString(), day: date.getDate(), month: date.getMonth() + 1 };
                    }));
                }
            }
        }

        const purchaseCalendarEvents: CalendarEvent[] = purchaseEvents.map((p) => ({
            id: `purchase-${p.id}`,
            title: p.title,
            date: p.date,
            type: p.deliveryType === 'video' ? 'Reel' : 'Post',
            platform: 'My Page' as Platform,
            status: 'Scheduled',
            thumbnail: (p.deliveryType === 'video' || p.deliveryType === 'image') && p.deliveryUrl ? p.deliveryUrl : undefined,
            reminderType: 'treat',
            purchaseEvent: true,
            purchaseId: p.treatPurchaseId,
            purchaseStatus: p.treatStatus || 'scheduled',
            fanName: p.fanName,
            fanEmail: p.fanEmail,
            deliveryType: p.deliveryType || null,
            deliveryUrl: p.deliveryUrl || null,
            deliveryText: p.deliveryText || null,
        } as any));

        const liveStreamCalendarEvents: CalendarEvent[] = liveStreamScheduleEvents.map((s) => {
            const prefix = s.creatorTestOnly ? '🧪 ' : '';
            const effectiveStatus = effectiveLiveStreamStatusForUi(s.status, s.dateISO);
            return {
                id: `livestream-${s.streamId}`,
                title: `${prefix}${s.title}`,
                date: s.dateISO,
                type: 'Post',
                platform: 'My Page' as Platform,
                status: effectiveStatus === 'live' ? ('Published' as const) : ('Scheduled' as const),
                liveStreamEvent: true,
                liveStreamId: s.streamId,
                liveStreamStatus: effectiveStatus,
                liveStreamTicketCents: s.ticketCents,
                liveStreamTestOnly: s.creatorTestOnly,
                ...(s.description ? { liveStreamDescription: s.description } : {}),
            } as any;
        });
        
        if (!posts || !Array.isArray(posts)) {
            const reminderEvents: CalendarEvent[] = reminders.map(reminder => ({
                id: `reminder-${reminder.id}`,
                title: reminder.title,
                date: reminder.date,
                type: 'Reminder' as any,
                platform: 'Instagram' as Platform,
                status: 'Scheduled' as const,
                reminderType: reminder.reminderType,
                reminderDescription: reminder.description,
                thumbnail: undefined,
            } as any));
            return [...reminderEvents, ...purchaseCalendarEvents, ...liveStreamCalendarEvents].sort(
                (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
            );
        }
        
        // Get all posts that have scheduledDate (Scheduled, Published, or Draft)
        // Include Draft posts - they should appear in Calendar if they have a scheduledDate
        // Filter out OnlyFans posts - they should only appear in OnlyFans Studio calendar
        const scheduledPosts = posts.filter(p => 
            p.scheduledDate && 
            (p.status === 'Scheduled' || p.status === 'Published' || p.status === 'Draft') &&
            !(p.platforms && (p.platforms as any[]).includes('OnlyFans')) // Exclude OnlyFans posts
        );
        
        // Create calendar events from posts (Scheduled, Published, and Draft)
        const eventsFromPosts: CalendarEvent[] = scheduledPosts.map(post => {
            const platforms = post.platforms || [];
            const previewUrl = post.mediaUrl || (Array.isArray(post.mediaUrls) ? post.mediaUrls[0] : undefined);
            // For videos, check if there's a thumbnail URL, otherwise use the video URL itself
            const isVideo = post.mediaType === 'video';
            const thumbnailUrl = isVideo 
                ? ((post as any).thumbnailUrl || (post as any).posterUrl || previewUrl) 
                : previewUrl;
            return platforms.map((platform, idx) => {
                const eventDate = post.scheduledDate || new Date().toISOString();
                const parsedDate = new Date(eventDate);
                // Determine type: 'Post' | 'Story' | 'Reel'
                let eventType: 'Post' | 'Story' | 'Reel' = 'Post';
                if (post.mediaType === 'video') {
                    eventType = 'Reel';
                } else if ((post as any).instagramPostType === 'Story') {
                    eventType = 'Story';
                } else if ((post as any).instagramPostType === 'Reel') {
                    eventType = 'Reel';
                }
                return {
                    id: `post-${post.id}-${platform}-${idx}`,
                    title: post.content?.substring(0, 30) + '...' || 'Post',
                    date: eventDate,
                    type: eventType,
                    platform: platform,
                    status: post.status as 'Scheduled' | 'Published' | 'Draft',
                    thumbnail: thumbnailUrl, // Only set if it's a valid permanent URL
                    post: post, // Include the full post object so we can access thumbnailUrl/posterUrl
                };
            });
        }).flat();
        
        // Debug: Log events created from posts
        if (eventsFromPosts.length > 0) {
            console.log('Calendar: Created', eventsFromPosts.length, 'events from posts');
            const currentMonth = currentDate.getMonth();
            const currentYear = currentDate.getFullYear();
            const eventsInMonth = eventsFromPosts.filter(e => {
                const eventDate = new Date(e.date);
                return eventDate.getMonth() === currentMonth && eventDate.getFullYear() === currentYear;
            });
            if (eventsInMonth.length > 0) {
                console.log('Calendar: Events in current month from posts:', eventsInMonth.slice(0, 5).map(e => {
                    const d = new Date(e.date);
                    return { id: e.id, dateISO: e.date, day: d.getDate(), month: d.getMonth(), year: d.getFullYear(), title: e.title };
                }));
            }
        }
        
        // Also include existing calendar events that match posts (for backward compatibility)
        const existingEvents = (calendarEvents || []).filter(evt => {
            // Extract post ID from event ID
            let postIdFromEvent: string | null = null;
            if (evt.id.startsWith('cal-')) {
                const parts = evt.id.replace('cal-', '').split('-');
                postIdFromEvent = parts[0];
            } else if (evt.id.startsWith('post-')) {
                const parts = evt.id.replace('post-', '').split('-');
                postIdFromEvent = parts[0];
            }
            
            if (postIdFromEvent) {
                const associatedPost = posts.find(p => p.id === postIdFromEvent);
                // Only keep if post exists and has scheduledDate (including Drafts)
                return associatedPost && associatedPost.scheduledDate && 
                       (associatedPost.status === 'Scheduled' || associatedPost.status === 'Published' || 
                        (associatedPost.status === 'Draft' && associatedPost.scheduledDate));
            }
            return false;
        });
        
        // Combine and deduplicate (prefer events from posts)
        const combinedPostEvents = [...eventsFromPosts, ...existingEvents];
        const uniqueEvents = combinedPostEvents.filter((evt, idx, self) => 
            idx === self.findIndex(e => e.id === evt.id)
        );
        
        const filteredPostEvents = uniqueEvents.filter(evt => {
            // Filter out OnlyFans events - they should only appear in OnlyFans Studio calendar
            // Check if event is from OnlyFans export package or has OnlyFans marker
            if (evt.id.includes('onlyfans-export') || (evt as any).isOnlyFans || (evt as any).exportPackageId) {
                return false;
            }
            
            // Filter out events with OnlyFans platform (if it exists in the type system)
            // Since OnlyFans is not in Platform type, check title for OnlyFans indicator
            if (evt.title.includes('[OnlyFans]')) {
                return false;
            }
            
            // Find associated post
            // Event ID format: post-${postId}-${platform}-${idx}
            // For Strategy posts, postId can contain dashes (e.g., roadmap-abc123-0-1-1234567890)
            // So we need to extract everything between 'post-' and the last two dashes (platform and idx)
            let postId: string | null = null;
            if (evt.id.startsWith('post-')) {
                const withoutPrefix = evt.id.replace('post-', '');
                const parts = withoutPrefix.split('-');
                // Platform and idx are the last two parts, so postId is everything before them
                if (parts.length >= 3) {
                    postId = parts.slice(0, -2).join('-');
                } else {
                    // Fallback: if format is unexpected, try first part
                    postId = parts[0];
                }
            } else if (evt.id.startsWith('cal-')) {
                const withoutPrefix = evt.id.replace('cal-', '');
                const parts = withoutPrefix.split('-');
                postId = parts[0];
            }
            
            const associatedPost = postId ? posts.find(p => p.id === postId) : null;
            
            if (!associatedPost) {
                return false;
            }
            
            // Only show if post has scheduledDate
            if (!associatedPost.scheduledDate) {
                return false;
            }
            
            // IMPORTANT: Only show Published if post was MANUALLY set to Published
            // Don't auto-mark as Published just because date passed
            if (evt.status === 'Published' && associatedPost.status !== 'Published') {
                return false; // Event says Published but post isn't - don't show
            }
            
            // Show Scheduled and Draft posts (Drafts should appear if they have scheduledDate)
            // Only show Published if post status is explicitly Published
            if (associatedPost.status === 'Published') {
                // Only show if it was manually set to Published
                return true;
            } else if (associatedPost.status === 'Scheduled' || associatedPost.status === 'Draft') {
                // Show Scheduled and Draft posts with scheduledDate
                return true;
            }
            
            // Don't show other statuses
            return false;
        }).map(evt => {
            // Update event status to match post status (don't auto-mark as Published)
            // Event ID format: post-${postId}-${platform}-${idx}
            // For Strategy posts, postId can contain dashes (e.g., roadmap-abc123-0-1-1234567890)
            let postId: string | null = null;
            if (evt.id.startsWith('post-')) {
                const withoutPrefix = evt.id.replace('post-', '');
                const parts = withoutPrefix.split('-');
                // Platform and idx are the last two parts, so postId is everything before them
                if (parts.length >= 3) {
                    postId = parts.slice(0, -2).join('-');
                } else {
                    // Fallback: if format is unexpected, try first part
                    postId = parts[0];
                }
            } else if (evt.id.startsWith('cal-')) {
                const withoutPrefix = evt.id.replace('cal-', '');
                const parts = withoutPrefix.split('-');
                postId = parts[0];
            }
            const associatedPost = postId ? posts.find(p => p.id === postId) : null;
            
            if (associatedPost) {
                // Use post status, not event status (prevents auto-Published)
                return {
                    ...evt,
                    status: associatedPost.status as 'Scheduled' | 'Published' | 'Draft'
                };
            }
            return evt;
        });
        
        // Add reminders as calendar events
        const reminderEvents: CalendarEvent[] = reminders.map(reminder => ({
            id: `reminder-${reminder.id}`,
            title: reminder.title,
            date: reminder.date,
            type: 'Reminder' as any,
            platform: 'Instagram' as Platform, // Placeholder
            status: 'Scheduled' as const,
            reminderType: reminder.reminderType,
            reminderDescription: reminder.description,
            thumbnail: undefined, // Reminders don't have thumbnails
        } as any));
        
        // Combine and sort by date
        const allEvents = [...filteredPostEvents, ...reminderEvents, ...purchaseCalendarEvents, ...liveStreamCalendarEvents].sort((a, b) => 
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        
        // Debug: Log final events count
        if (allEvents.length > 0) {
            const currentMonth = currentDate.getMonth();
            const currentYear = currentDate.getFullYear();
            const eventsInCurrentMonth = allEvents.filter(e => {
                const eventDate = new Date(e.date);
                return eventDate.getMonth() === currentMonth && eventDate.getFullYear() === currentYear;
            });
            console.log('Calendar: Final filteredEvents - Total:', allEvents.length, 'In current month:', eventsInCurrentMonth.length);
            if (eventsInCurrentMonth.length > 0) {
                // Log first 10 events to see their dates
                const eventsToLog = eventsInCurrentMonth.slice(0, 10);
                console.log('Calendar: Events in current month (first 10):', eventsToLog.map(e => {
                    const eventDate = new Date(e.date);
                    return { 
                        id: e.id, 
                        title: e.title.substring(0, 20), 
                        dateISO: e.date,
                        dateFormatted: eventDate.toLocaleDateString(),
                        day: eventDate.getDate(),
                        month: eventDate.getMonth(),
                        year: eventDate.getFullYear(),
                        status: e.status,
                        platforms: (e as any).platforms || [e.platform]
                    };
                }));
            }
        }
        
        return allEvents;
    }, [calendarEvents, posts, reminders, purchaseEvents, liveStreamScheduleEvents, currentDate]);

    // Auto-select event from dashboard navigation
    useEffect(() => {
        if (!filteredEvents || filteredEvents.length === 0) return;
        
        const selectedEventId = localStorage.getItem('calendarSelectedEventId');
        if (selectedEventId) {
            localStorage.removeItem('calendarSelectedEventId');
            const eventToSelect = filteredEvents.find(evt => evt.id === selectedEventId);
            if (eventToSelect) {
                const associatedPost = posts?.find(p => {
                    if (eventToSelect.id.includes(p.id) || p.id.includes(eventToSelect.id.replace('cal-', '').replace('-calendar', ''))) {
                        return true;
                    }
                    if (p.content && eventToSelect.title && p.content.includes(eventToSelect.title.substring(0, 30))) {
                        return true;
                    }
                    return false;
                });
                setSelectedEvent({ event: eventToSelect, post: associatedPost || null });
                // Scroll to the event's date
                const eventDate = new Date(eventToSelect.date);
                setCurrentDate(new Date(eventDate.getFullYear(), eventDate.getMonth(), 1));
            }
        }
    }, [filteredEvents, posts]);

    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

    const daysInMonth = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
    const firstDay = getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth());

    const handlePrevMonth = () => {
        const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
        setCurrentDate(newDate);
    };

    const handleNextMonth = () => {
        const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
        setCurrentDate(newDate);
    };

    const handleToday = () => {
        setCurrentDate(new Date());
    };

    const today = new Date();
    const isToday = (day: number) => {
        return (
            day === today.getDate() &&
            currentDate.getMonth() === today.getMonth() &&
            currentDate.getFullYear() === today.getFullYear()
        );
    };

    const resolvePostIdFromCalendarEvent = (evt: CalendarEvent): string | null => {
        if (evt.id.startsWith('post-')) {
            const withoutPrefix = evt.id.replace('post-', '');
            const parts = withoutPrefix.split('-');
            if (parts.length >= 3) {
                return parts.slice(0, -2).join('-');
            }
            return parts[0] ?? null;
        }
        if (evt.id.startsWith('cal-')) {
            const parts = evt.id.replace('cal-', '').split('-');
            return parts[0] ?? null;
        }
        return null;
    };

    /** Clears schedule on the post and legacy calendar_event docs — does not delete the post. */
    const removePostFromMainCalendar = async (post: Post, calendarEventId: string) => {
        if (!user) throw new Error('Not signed in');

        await setDoc(
            doc(db, 'users', user.id, 'posts', post.id),
            { scheduledDate: deleteField(), autoPublishAtSchedule: false },
            { merge: true }
        );

        setPosts((prev) =>
            prev.map((p) =>
                p.id === post.id ? { ...p, scheduledDate: undefined, autoPublishAtSchedule: false } : p
            )
        );

        try {
            const matchingEvents = calendarEvents.filter((evt) => evt.id.includes(post.id));
            for (const ce of matchingEvents) {
                await deleteDoc(doc(db, 'users', user.id, 'calendar_events', ce.id));
            }
        } catch (calendarDeleteError) {
            console.error('Failed to delete related calendar events:', calendarDeleteError);
        }

        try {
            await deleteDoc(doc(db, 'users', user.id, 'calendar_events', calendarEventId));
        } catch {
            // Derived-only row or missing doc
        }
    };

    const handleDeleteCalendarGridItem = async (
        e: React.MouseEvent,
        evt: CalendarEvent,
        associatedPost: Post | null | undefined
    ) => {
        e.stopPropagation();
        e.preventDefault();
        if (!user) return;

        const isPurchase = evt.id.startsWith('purchase-') || !!(evt as any).purchaseEvent;
        const isLiveStream = evt.id.startsWith('livestream-') || !!(evt as any).liveStreamEvent;
        const isReminder =
            !isPurchase && !isLiveStream && (evt.id.startsWith('reminder-') || !!(evt as any).reminderType);

        try {
            if (isReminder) {
                const reminderDocId = evt.id.startsWith('reminder-') ? evt.id.slice('reminder-'.length) : evt.id;
                if (!window.confirm('Delete this reminder?')) return;
                await deleteDoc(doc(db, 'users', user.id, 'calendar_events', reminderDocId));
                showToast('Reminder deleted', 'success');
                if (selectedEvent?.event.id === evt.id) setSelectedEvent(null);
                return;
            }

            if (isPurchase) {
                const purchaseDocId = evt.id.startsWith('purchase-')
                    ? evt.id.slice('purchase-'.length)
                    : String((evt as any).id || '');
                if (!purchaseDocId) {
                    showToast('Could not remove this purchase event.', 'error');
                    return;
                }
                if (!window.confirm('Remove this from your main calendar only? Purchases and Fan Hub are unchanged.')) return;
                await deleteDoc(doc(db, 'users', user.id, 'onlyfans_calendar_events', purchaseDocId));
                showToast('Removed from calendar', 'success');
                if (selectedEvent?.event.id === evt.id) setSelectedEvent(null);
                return;
            }

            if (isLiveStream) {
                const streamId = (evt as any).liveStreamId as string | undefined;
                if (!streamId) {
                    showToast('Could not update: missing stream id', 'error');
                    return;
                }
                if (
                    !window.confirm(
                        'Hide this live stream from your main calendar only? Fan Hub, tickets, and the event itself are unchanged.'
                    )
                )
                    return;
                await updateDoc(doc(db, 'creators', user.id, 'liveStreams', streamId), {
                    hiddenFromMainCalendar: true,
                });
                showToast('Live stream hidden from calendar', 'success');
                if (selectedEvent?.event.id === evt.id) setSelectedEvent(null);
                return;
            }

            const postId = associatedPost?.id || resolvePostIdFromCalendarEvent(evt);
            const post = postId ? associatedPost ?? posts?.find((p) => p.id === postId) : null;
            if (!postId || !post) {
                showToast('Could not remove: no post linked to this event.', 'error');
                return;
            }
            if (
                !window.confirm(
                    'Remove this from your main calendar? The post is not deleted and stays in Create Post / your content.'
                )
            )
                return;

            await removePostFromMainCalendar(post, evt.id);

            showToast('Removed from calendar', 'success');
            if (selectedEvent?.event.id === evt.id) setSelectedEvent(null);
        } catch (error) {
            console.error('Failed to delete calendar item:', error);
            showToast('Failed to delete. Please try again.', 'error');
        }
    };

    const renderCalendarGrid = () => {
        const grid = [];
        let dayCounter = 1;

        // Empty cells for days before the 1st
        for (let i = 0; i < firstDay; i++) {
            grid.push(
                <div key={`empty-${i}`} className="bg-gray-50 dark:bg-gray-800/30 min-h-[80px] border-r border-b border-gray-200 dark:border-gray-700"></div>
            );
        }

        // Days of the month
        while (dayCounter <= daysInMonth) {
            const currentDay = dayCounter; // Capture day value for this iteration
            
            const dayEvents = filteredEvents.filter(e => {
                const eventDate = new Date(e.date);
                const eventDay = eventDate.getDate();
                const eventMonth = eventDate.getMonth();
                const eventYear = eventDate.getFullYear();
                const matches = (
                    eventDay === currentDay &&
                    eventMonth === currentDate.getMonth() &&
                    eventYear === currentDate.getFullYear()
                );
                return matches;
            });
            
            // Debug: Log if we have events but none match this day
            if (currentDay <= 10 && filteredEvents.length > 0 && dayEvents.length === 0) {
                const eventsForThisMonth = filteredEvents.filter(ev => {
                    const evDate = new Date(ev.date);
                    return evDate.getMonth() === currentDate.getMonth() && evDate.getFullYear() === currentDate.getFullYear();
                });
                const eventsForThisDay = eventsForThisMonth.filter(ev => {
                    const evDate = new Date(ev.date);
                    return evDate.getDate() === currentDay;
                });
                if (eventsForThisDay.length > 0) {
                    // Events exist for this day but didn't match - log why
                    console.log(`Calendar: Day ${currentDay} - Found ${eventsForThisDay.length} events for this day but filter returned 0:`, eventsForThisDay.map(e => {
                        const d = new Date(e.date);
                        return {
                            id: e.id,
                            dateISO: e.date,
                            parsedDay: d.getDate(),
                            parsedMonth: d.getMonth(),
                            parsedYear: d.getFullYear(),
                            currentDay,
                            currentMonth: currentDate.getMonth(),
                            currentYear: currentDate.getFullYear()
                        };
                    }));
                }
            }

            // Sort events by time
            dayEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            const todayHighlight = isToday(currentDay);
            
            const hasEvents = dayEvents.length > 0;
            
            grid.push(
                <div 
                    key={dayCounter} 
                    className={`${hasEvents ? 'min-h-[180px] sm:min-h-[140px]' : 'min-h-[80px]'} border-r border-b border-gray-200 dark:border-gray-700 p-2 sm:p-3 relative group flex flex-col transition-all overflow-visible ${
                        todayHighlight 
                            ? 'bg-gradient-to-br from-primary-50 to-blue-50 dark:from-primary-900/20 dark:to-blue-900/20 ring-2 ring-primary-400 dark:ring-primary-500' 
                            : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                >
                    <div className="flex justify-between items-start mb-2 h-7 flex-shrink-0">
                        <span className={`font-bold text-base ${
                            todayHighlight 
                                ? 'text-primary-700 dark:text-primary-300' 
                                : 'text-gray-700 dark:text-gray-300'
                        }`}>
                            {currentDay}
                        </span>
                    </div>
                    <div className="space-y-2 overflow-visible">
                        {dayEvents.map(evt => {
                            const timeString = new Date(evt.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
                            
                            // Check if this is a purchase event or regular reminder.
                            const isPurchase = evt.id.startsWith('purchase-') || !!(evt as any).purchaseEvent;
                            const isLiveStream = evt.id.startsWith('livestream-') || !!(evt as any).liveStreamEvent;
                            const isReminder =
                                !isPurchase && !isLiveStream && (evt.id.startsWith('reminder-') || (evt as any).reminderType);
                            
                            const statusColors: Record<'Published' | 'Scheduled' | 'Draft' | 'In Review', {
                                bg: string;
                                border: string;
                                dot: string;
                                text: string;
                            }> = {
                                Published: {
                                    bg: 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30',
                                    border: 'border-l-4 border-green-500 dark:border-green-400',
                                    dot: 'bg-green-500 dark:bg-green-400',
                                    text: 'text-green-700 dark:text-green-300'
                                },
                                Scheduled: {
                                    bg: 'bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/30',
                                    border: 'border-l-4 border-blue-500 dark:border-blue-400',
                                    dot: 'bg-blue-500 dark:bg-blue-400',
                                    text: 'text-blue-700 dark:text-blue-300'
                                },
                                'In Review': {
                                    bg: 'bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/30 dark:to-indigo-900/30',
                                    border: 'border-l-4 border-purple-500 dark:border-purple-400',
                                    dot: 'bg-purple-500 dark:bg-purple-400',
                                    text: 'text-purple-700 dark:text-purple-300'
                                },
                                Draft: {
                                    bg: 'bg-gray-100 dark:bg-gray-700/50',
                                    border: 'border-l-4 border-gray-400 dark:border-gray-600',
                                    dot: 'bg-gray-400 dark:bg-gray-500',
                                    text: 'text-gray-700 dark:text-gray-300'
                                }
                            };
                            
                            // Reminders have different styling
                            let colors;
                            if (isReminder) {
                                colors = {
                                    bg: 'bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/30 dark:to-amber-900/30',
                                    border: 'border-l-4 border-orange-500 dark:border-orange-400',
                                    dot: 'bg-orange-500 dark:bg-orange-400',
                                    text: 'text-orange-700 dark:text-orange-300'
                                };
                            } else if (isPurchase) {
                                const purchaseStatus = String((evt as any).purchaseStatus || 'scheduled');
                                const delivered = purchaseStatus === 'delivered' || purchaseStatus === 'completed';
                                colors = delivered
                                  ? {
                                        bg: 'bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/30 dark:to-green-900/30',
                                        border: 'border-l-4 border-emerald-500 dark:border-emerald-400',
                                        dot: 'bg-emerald-500 dark:bg-emerald-400',
                                        text: 'text-emerald-700 dark:text-emerald-300',
                                    }
                                  : {
                                        bg: 'bg-gradient-to-r from-purple-50 to-fuchsia-50 dark:from-purple-900/30 dark:to-fuchsia-900/30',
                                        border: 'border-l-4 border-purple-500 dark:border-purple-400',
                                        dot: 'bg-purple-500 dark:bg-purple-400',
                                        text: 'text-purple-700 dark:text-purple-300',
                                    };
                            } else if (isLiveStream) {
                                const st = String((evt as any).liveStreamStatus || '').toLowerCase();
                                const isLive = st === 'live';
                                const isEnded = st === 'ended' || st === 'cancelled';
                                colors = isLive
                                    ? {
                                          bg: 'bg-gradient-to-r from-rose-50 to-red-50 dark:from-rose-900/30 dark:to-red-900/30',
                                          border: 'border-l-4 border-rose-500 dark:border-rose-400',
                                          dot: 'bg-rose-500 dark:bg-rose-400',
                                          text: 'text-rose-800 dark:text-rose-200',
                                      }
                                    : isEnded
                                      ? {
                                            bg: 'bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/30 dark:to-green-900/30',
                                            border: 'border-l-4 border-emerald-500 dark:border-emerald-400',
                                            dot: 'bg-emerald-500 dark:bg-emerald-400',
                                            text: 'text-emerald-800 dark:text-emerald-200',
                                        }
                                      : {
                                            bg: 'bg-gradient-to-r from-sky-50 to-cyan-50 dark:from-sky-900/30 dark:to-cyan-900/30',
                                            border: 'border-l-4 border-sky-500 dark:border-sky-400',
                                            dot: 'bg-sky-500 dark:bg-sky-400',
                                            text: 'text-sky-800 dark:text-sky-200',
                                        };
                            } else {
                                colors = statusColors[evt.status] || statusColors.Draft;
                            }
                            
                            // Find associated post (shared for both click and hover)
                            // Event ID format: post-${postId}-${platform}-${idx}
                            // For Strategy posts, postId can contain dashes (e.g., roadmap-abc123-0-1-1234567890)
                            let postIdFromEvent: string | null = null;
                            if (evt.id.startsWith('post-')) {
                                const withoutPrefix = evt.id.replace('post-', '');
                                const parts = withoutPrefix.split('-');
                                // Platform and idx are the last two parts, so postId is everything before them
                                if (parts.length >= 3) {
                                    postIdFromEvent = parts.slice(0, -2).join('-');
                                } else {
                                    // Fallback: if format is unexpected, try first part
                                    postIdFromEvent = parts[0];
                                }
                            } else if (evt.id.startsWith('cal-')) {
                                const parts = evt.id.replace('cal-', '').split('-');
                                postIdFromEvent = parts[0];
                            }
                            
                            const associatedPost = postIdFromEvent 
                                ? posts.find(p => p.id === postIdFromEvent)
                                : posts.find(p => {
                                    // Fallback: try matching by content if ID extraction failed
                                    if (p.content && evt.title && p.content.includes(evt.title.substring(0, 30))) {
                                        return true;
                                    }
                                    return false;
                                });

                            const handleEventClick = () => {
                                // Check if this is a reminder
                                if (isReminder) {
                                    // Handle reminder click - open reminder modal
                                    const reminderId = evt.id.replace('reminder-', '');
                                    const reminder = reminders.find(r => r.id === reminderId);
                                    if (reminder) {
                                        setSelectedReminder(reminder);
                                        setReminderTitle(reminder.title);
                                        setReminderDescription(reminder.description || '');
                                        setReminderType(reminder.reminderType);
                                        setReminderDate(new Date(reminder.date).toISOString().split('T')[0]);
                                        setReminderTime(reminder.reminderTime || '20:00');
                                        setIsCreatingReminder(true);
                                    }
                                    return;
                                }
                                if (isPurchase) {
                                    setIsEditing(false);
                                    setIsRegenerating(false);
                                    setSelectedEvent({ event: evt, post: null });
                                    return;
                                }
                                if (isLiveStream) {
                                    setIsEditing(false);
                                    setIsRegenerating(false);
                                    setSelectedEvent({ event: evt, post: null });
                                    return;
                                }
                                
                                // Handle post click - initialize view state (not editing yet)
                                const eventDate = new Date(evt.date);
                                const dateStr = eventDate.toISOString().split('T')[0];
                                const timeStr = eventDate.toTimeString().slice(0, 5);
                                
                                setEditDate(dateStr);
                                setEditTime(timeStr);
                                setIsEditing(false);
                                setIsRegenerating(false);
                                
                                // Initialize regenerate platform with first platform from post
                                if (associatedPost?.platforms && associatedPost.platforms.length > 0) {
                                    setRegeneratePlatform(associatedPost.platforms[0]);
                                } else {
                                    setRegeneratePlatform(evt.platform);
                                }
                                
                                // Initialize edit goal and tone from post if available
                                if ((associatedPost as any)?.postGoal) {
                                    setEditGoal((associatedPost as any).postGoal);
                                    setRegenerateGoal((associatedPost as any).postGoal);
                                } else {
                                    setEditGoal('engagement');
                                    setRegenerateGoal('engagement');
                                }
                                if ((associatedPost as any)?.postTone) {
                                    setEditTone((associatedPost as any).postTone);
                                    setRegenerateTone((associatedPost as any).postTone);
                                } else {
                                    setEditTone('friendly');
                                    setRegenerateTone('friendly');
                                }
                                
                                // Show preview modal instead of navigating
                                setSelectedEvent({ event: evt, post: associatedPost || null });
                            };


                            const purchaseDeliveryUrl = typeof (evt as any).deliveryUrl === 'string' ? (evt as any).deliveryUrl : undefined;
                            const purchaseDeliveryType = (evt as any).deliveryType as ('video' | 'image' | 'audio' | 'text' | undefined);
                            const postMediaUrl = associatedPost?.mediaUrl || (Array.isArray(associatedPost?.mediaUrls) ? associatedPost?.mediaUrls[0] : undefined);
                            const mediaPreviewUrl = isPurchase
                                ? (purchaseDeliveryType === 'video' || purchaseDeliveryType === 'image' ? purchaseDeliveryUrl : undefined)
                                : postMediaUrl || evt.thumbnail;
                            const isVideoPreview = isPurchase
                                ? purchaseDeliveryType === 'video'
                                : associatedPost?.mediaType === 'video' || evt.type === 'Reel';
                            return (
                                <div 
                                    key={evt.id} 
                                    className={`flex flex-col p-2.5 sm:p-2 md:p-2 rounded-lg text-xs sm:text-xs md:text-xs shadow-sm cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all ${colors.bg} ${colors.border} relative min-h-[65px] sm:min-h-[50px] pr-7`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleEventClick();
                                    }}
                                    title={`${evt.title} - ${new Date(evt.date).toLocaleString()}`}
                                    style={{ pointerEvents: 'auto' }}
                                >
                                    <button
                                        type="button"
                                        aria-label="Remove from calendar"
                                        title="Remove from calendar (does not delete content or purchases)"
                                        className="absolute top-1 right-1 z-20 p-1 rounded-md bg-white/95 dark:bg-gray-900/95 text-red-600 dark:text-red-400 shadow-sm border border-red-200/80 dark:border-red-900/60 opacity-90 hover:opacity-100 active:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-red-400/80 touch-manipulation"
                                        onClick={(e) => handleDeleteCalendarGridItem(e, evt, associatedPost ?? null)}
                                    >
                                        <TrashIcon className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                                    </button>
                                    <div 
                                        className="flex justify-between items-center mb-1.5 sm:mb-1 gap-1"
                                        style={{ pointerEvents: 'none' }}
                                    >
                                        <span className={`font-bold text-xs sm:text-[10px] md:text-[10px] ${colors.text} whitespace-nowrap`}>
                                            {timeString}
                                        </span>
                                        <div className={`w-2.5 h-2.5 sm:w-2 sm:h-2 rounded-full flex-shrink-0 shadow-sm ${colors.dot}`}></div>
                                    </div>
                                    {!isReminder && mediaPreviewUrl && (
                                        <div className="mb-1 relative w-full h-10">
                                            {/* Video preview - show image if thumbnail/poster exists, otherwise show video element */}
                                            {isVideoPreview ? (
                                                ((associatedPost as any)?.thumbnailUrl || (associatedPost as any)?.posterUrl) ? (
                                                    <img
                                                        src={(associatedPost as any).thumbnailUrl || (associatedPost as any).posterUrl}
                                                        alt="Video preview"
                                                        className="w-full h-10 rounded-md object-cover border border-gray-200 dark:border-gray-700"
                                                        onError={(e) => {
                                                            // Hide image on error and fall back to video element
                                                            const img = e.target as HTMLImageElement;
                                                            img.style.display = 'none';
                                                            // Try to show video element instead
                                                            const videoElement = img.parentElement?.querySelector('video') as HTMLVideoElement;
                                                            if (videoElement && (associatedPost?.mediaUrl || (Array.isArray(associatedPost?.mediaUrls) ? associatedPost?.mediaUrls[0] : undefined) || evt?.thumbnail)) {
                                                                videoElement.style.display = 'block';
                                                            }
                                                        }}
                                                        loading="lazy"
                                                    />
                                                ) : mediaPreviewUrl ? (
                                                    <video
                                                        src={mediaPreviewUrl}
                                                        className="w-full h-10 rounded-md object-cover border border-gray-200 dark:border-gray-700"
                                                        muted
                                                        playsInline
                                                        preload="metadata"
                                                        onLoadedMetadata={(e) => {
                                                            // Seek to first frame to ensure it displays
                                                            const video = e.target as HTMLVideoElement;
                                                            video.currentTime = 0.1; // Seek to 0.1s to get first frame
                                                        }}
                                                        onSeeked={(e) => {
                                                            // Pause after seeking to first frame
                                                            const video = e.target as HTMLVideoElement;
                                                            video.pause();
                                                        }}
                                                        onError={(e) => {
                                                            // Hide video on error
                                                            const video = e.target as HTMLVideoElement;
                                                            video.style.display = 'none';
                                                            if (process.env.NODE_ENV === 'development') {
                                                                console.warn('Failed to load calendar video thumbnail:', associatedPost?.mediaUrl || evt?.thumbnail);
                                                            }
                                                        }}
                                                        style={{ pointerEvents: 'none' }}
                                                    />
                                                ) : null
                                            ) : (
                                                <img
                                                    src={mediaPreviewUrl}
                                                    alt="Preview"
                                                    className="w-full h-10 rounded-md object-cover border border-gray-200 dark:border-gray-700"
                                                    onError={(e) => {
                                                        // Hide image on error (e.g., expired blob URL, CORS issue, invalid URL, etc.)
                                                        const img = e.target as HTMLImageElement;
                                                        img.style.display = 'none';
                                                        // Optionally log for debugging in production
                                                        if (process.env.NODE_ENV === 'development') {
                                                            console.warn('Failed to load calendar thumbnail:', associatedPost?.mediaUrl || evt?.thumbnail);
                                                        }
                                                    }}
                                                    loading="lazy"
                                                />
                                            )}
                                            {/* Video play icon overlay */}
                                            {isVideoPreview && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-md pointer-events-none">
                                                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                        <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                                                    </svg>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div 
                                        className="flex items-center gap-2 min-w-0"
                                        style={{ pointerEvents: 'none' }}
                                    >
                                        {isReminder ? (
                                            <span className="text-sm sm:text-xs">
                                                {(evt as any).reminderType === 'shoot' ? '🎬' : '📤'}
                                            </span>
                                        ) : isLiveStream ? (
                                            <span className="text-sm sm:text-xs">📡</span>
                                        ) : isPurchase ? (
                                            <span className="text-sm sm:text-xs">
                                                {(evt as any).deliveryType === 'video' ? '🎬' : (evt as any).deliveryType === 'audio' ? '🎧' : (evt as any).deliveryType === 'image' ? '🖼️' : '🎁'}
                                            </span>
                                        ) : (
                                            <span className="w-5 h-5 sm:w-4 sm:h-4 flex-shrink-0 text-gray-600 dark:text-gray-300">{platformIcons[evt.platform]}</span>
                                        )}
                                        <span className={`truncate font-semibold text-sm sm:text-[11px] md:text-[11px] ${colors.text}`} title={evt.title}>
                                            {evt.title}
                                        </span>
                                    </div>
                                    {evt.type && (
                                        <div 
                                            className="mt-1.5"
                                            style={{ pointerEvents: 'none' }}
                                        >
                                            <span className="text-[10px] sm:text-[9px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                                {isPurchase
                                                    ? String((evt as any).purchaseStatus || 'scheduled') === 'delivered'
                                                        ? 'DELIVERED PURCHASE'
                                                        : 'SCHEDULED PURCHASE'
                                                    : isLiveStream
                                                      ? (() => {
                                                            const lst = String((evt as any).liveStreamStatus || '').toLowerCase();
                                                            if (lst === 'live') return 'LIVE STREAM';
                                                            if (lst === 'ended' || lst === 'cancelled') return 'ENDED LIVE';
                                                            return 'SCHEDULED LIVE';
                                                        })()
                                                      : evt.type}
                                            </span>
                                        </div>
                                    )}

                                </div>
                            );
                        })}
                    </div>
                    {dayEvents.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">No posts scheduled</p>
                        </div>
                    )}
                    <button 
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            // Just navigate to compose - don't prefill date
                            setActivePage('compose'); 
                        }} 
                        data-day={currentDay}
                        data-year={currentDate.getFullYear()}
                        data-month={currentDate.getMonth()}
                        className="absolute bottom-3 right-3 p-2 bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:from-primary-600 hover:to-primary-700 rounded-full transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 z-10 shadow-lg hover:shadow-xl"
                        title="Add Post to this day"
                        aria-label="Add post"
                    >
                         <PlusIcon className="w-5 h-5" />
                    </button>
                </div>
            );
            dayCounter++;
        }
        
        return grid;
    };

    // Extract hashtags from post content
    const extractHashtags = (content: string): string[] => {
        const hashtagRegex = /#\w+/g;
        return content.match(hashtagRegex) || [];
    };

    const openPostInCompose = (post: Post) => {
        const payload = {
            id: post.id,
            content: post.content,
            mediaUrl: post.mediaUrl,
            mediaUrls: post.mediaUrls,
            mediaType: post.mediaType,
            platforms: post.platforms,
            scheduledDate: post.scheduledDate,
            postGoal: (post as Post & { postGoal?: string }).postGoal,
            postTone: (post as Post & { postTone?: string }).postTone,
            instagramPostType: (post as Post & { instagramPostType?: string }).instagramPostType,
            autoPublishAtSchedule: post.autoPublishAtSchedule,
        };
        try {
            sessionStorage.setItem('draftPostToEdit', JSON.stringify(payload));
        } catch {
            try {
                localStorage.setItem('draftPostToEdit', JSON.stringify(payload));
            } catch (e) {
                console.error('Failed to store draft handoff', e);
                showToast('Could not open Create Post. Try again.', 'error');
                return;
            }
        }
        setSelectedEvent(null);
        setActivePage('compose');
        showToast('Opening Create Post…', 'success');
    };

    // Handle save edits (date/time, platform, goal, and tone)
    const handleSaveEdit = async () => {
        if (!selectedEvent || !user) return;

        if (!editDate || !editTime) {
            showToast('Please select both date and time.', 'error');
            return;
        }

        if (!regeneratePlatform) {
            showToast('Please select a platform.', 'error');
            return;
        }

        setIsSaving(true);
        try {
            // Combine date and time
            const newDateTime = new Date(`${editDate}T${editTime}`);
            const newDateTimeISO = newDateTime.toISOString();

            // Update Post if it exists (update platform, date, goal, and tone)
            if (selectedEvent.post) {
                const updatedPost: Post = {
                    ...selectedEvent.post,
                    scheduledDate: newDateTimeISO,
                    platforms: [regeneratePlatform], // Update to selected platform
                    postGoal: regenerateGoal, // Update goal from regenerate section
                    postTone: regenerateTone, // Update tone from regenerate section
                    autoPublishAtSchedule: selectedEvent.post.autoPublishAtSchedule,
                } as Post & { postGoal: string; postTone: string };
                await updatePost(updatedPost);
            }

            // Update CalendarEvent
            const updatedEvent: CalendarEvent = {
                ...selectedEvent.event,
                date: newDateTimeISO,
                platform: regeneratePlatform, // Update platform
            };

            await setDoc(doc(db, 'users', user.id, 'calendar_events', updatedEvent.id), updatedEvent);

            // Update local state
            setSelectedEvent({
                event: updatedEvent,
                post: selectedEvent.post ? {
                    ...selectedEvent.post,
                    scheduledDate: newDateTimeISO,
                    platforms: [regeneratePlatform],
                    postGoal: regenerateGoal,
                    postTone: regenerateTone,
                    autoPublishAtSchedule: selectedEvent.post.autoPublishAtSchedule,
                } as Post & { postGoal: string; postTone: string } : null,
            });

            setIsEditing(false);
            showToast('Post updated successfully!', 'success');
            // Auto-close modal after successful save (no click-off required)
            setSelectedEvent(null);
        } catch (error) {
            console.error('Failed to update post:', error);
            showToast('Failed to update post. Please try again.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    // Handle regenerate captions
    const handleRegenerateCaptions = async () => {
        if (!selectedEvent || !selectedEvent.post || !user) return;

        if (!regeneratePlatform) {
            showToast('Please select a platform to regenerate captions for.', 'error');
            return;
        }

        setIsRegenerating(true);
        try {
            // Generate new captions optimized for the selected platform
            const captions = await generateCaptions({
                mediaUrl: selectedEvent.post.mediaUrl || null,
                goal: regenerateGoal,
                tone: regenerateTone,
                promptText: selectedEvent.post.content || null, // Use existing caption as prompt
                platforms: [regeneratePlatform], // Single platform for optimization
            });

            if (!captions || (Array.isArray(captions) && captions.length === 0)) {
                showToast('Failed to generate captions. Please try again.', 'error');
                return;
            }

            // Get the first caption result
            const captionResult = Array.isArray(captions) ? captions[0] : captions;
            const newCaption = captionResult?.caption || captionResult?.content || '';

            if (!newCaption) {
                showToast('Failed to generate captions. Please try again.', 'error');
                return;
            }

            // Update the post with new caption
            const updatedPost: Post = {
                ...selectedEvent.post,
                content: newCaption,
            };
            await updatePost(updatedPost);

            // Update local state
            setSelectedEvent({
                ...selectedEvent,
                post: updatedPost,
            });

            // Don't close regenerate section - keep it open in edit mode so user can regenerate again if needed
            showToast(`Captions regenerated and optimized for ${regeneratePlatform}!`, 'success');
        } catch (error) {
            console.error('Failed to regenerate captions:', error);
            showToast('Failed to regenerate captions. Please try again.', 'error');
        } finally {
            setIsRegenerating(false);
        }
    };

    // Handle publish post (auto-publish to social platforms)
    const handlePublishPost = async () => {
        if (!selectedEvent || !selectedEvent.post || !user) return;
        
        // In offline mode, publishing is disabled for everyone
        if (OFFLINE_MODE) {
            showToast(
                'Scheduling to social platforms is disabled in this version. You can still use the calendar and campaigns to plan content, then post manually.',
                'error'
            );
            return;
        }
        
        const post = selectedEvent.post;
        const platformsToPost = post.platforms || [selectedEvent.event.platform];
        
        if (platformsToPost.length === 0) {
            showToast('No platforms selected for this post.', 'error');
            return;
        }
        
        if (!post.content?.trim()) {
            showToast('Post has no caption content.', 'error');
            return;
        }
        
        setIsPublishing(true);
        try {
            const mediaUrl = post.mediaUrl;
            const mediaUrls = post.mediaUrls || (mediaUrl ? [mediaUrl] : undefined);
            
            // Publish to Instagram if selected
            const hasInstagram = platformsToPost.includes('Instagram');
            if (hasInstagram && mediaUrl) {
                try {
                    let instagramMediaType: 'IMAGE' | 'REELS' | 'VIDEO' = 'IMAGE';
                    if (post.mediaType === 'video') {
                        // Try to determine if it's a Reel (could be enhanced with post metadata)
                        instagramMediaType = 'VIDEO'; // Default to VIDEO, can be changed to REELS if needed
                    }
                    
                    const additionalImageUrls = mediaUrls && mediaUrls.length > 1 ? mediaUrls.slice(1) : undefined;
                    const result = await publishInstagramPost(
                        mediaUrl,
                        post.content,
                        instagramMediaType,
                        undefined, // Immediate publish
                        additionalImageUrls
                    );
                    
                    if (result.status === 'published') {
                        console.log('Published to Instagram:', result.mediaId);
                    }
                } catch (instagramError: any) {
                    console.error('Failed to publish to Instagram:', instagramError);
                    showToast(`Failed to publish to Instagram: ${instagramError.message || 'Please check your connection'}.`, 'error');
                }
            }
            
            // Publish to Facebook if selected
            const hasFacebook = platformsToPost.includes('Facebook');
            if (hasFacebook) {
                try {
                    const fbMediaType = post.mediaType === 'video' ? 'video' : post.mediaType === 'image' ? 'image' : undefined;
                    const fbMediaUrls = mediaUrls && mediaUrls.length > 0 ? mediaUrls : (mediaUrl ? [mediaUrl] : undefined);
                    const result = await publishFacebookPost(
                        post.content,
                        mediaUrl,
                        fbMediaType,
                        undefined,
                        fbMediaUrls
                    );
                    if (result.status === 'published') {
                        console.log('Published to Facebook:', result.postId);
                    }
                } catch (facebookError: any) {
                    console.error('Failed to publish to Facebook:', facebookError);
                    showToast(`Failed to publish to Facebook: ${facebookError.message || 'Please check your connection'}.`, 'error');
                }
            }
            
            // Publish to X (Twitter) if selected
            const hasX = platformsToPost.includes('X');
            if (hasX) {
                try {
                    const xMediaUrls = mediaUrls && mediaUrls.length > 0 ? mediaUrls : (mediaUrl ? [mediaUrl] : undefined);
                    const result = await publishTweet(
                        post.content,
                        mediaUrl || undefined,
                        post.mediaType === 'video' ? 'video' : post.mediaType === 'image' ? 'image' : undefined,
                        xMediaUrls
                    );
                    
                    console.log('Published to X:', result.tweetId);
                    if (result.mediaSkipped) {
                        const fallbackMsg = result.mediaError
                            ? `Published to X (text only – media upload failed: ${result.mediaError})`
                            : 'Published to X (text only – reconnect X to enable image uploads)';
                        showToast(fallbackMsg, 'info');
                    }
                } catch (xError: any) {
                    console.error('Failed to publish to X:', xError);
                    showToast(`Failed to publish to X: ${xError.message || 'Please check your connection'}.`, 'error');
                }
            }
            
            // Update post status to Published
            const updatedPost: Post = {
                ...post,
                status: 'Published',
                publishedAt: new Date().toISOString(),
            };
            await updatePost(updatedPost);
            
            // Update calendar event status
            const updatedEvent: CalendarEvent = {
                ...selectedEvent.event,
                status: 'Published',
            };
            await setDoc(doc(db, 'users', user.id, 'calendar_events', updatedEvent.id), updatedEvent);
            
            // Update local state
            setSelectedEvent({
                event: updatedEvent,
                post: updatedPost,
            });
            
            showToast(`Published to ${platformsToPost.join(', ')}!`, 'success');
            // Auto-close modal after successful publish
            setSelectedEvent(null);
        } catch (error) {
            console.error('Failed to publish post:', error);
            showToast('Failed to publish post. Please try again.', 'error');
        } finally {
            setIsPublishing(false);
        }
    };

    // Admin: manually run the scheduled-posts cron (for testing)
    const handleRunScheduledPostsNow = async () => {
        if (!user || user.role !== 'Admin') return;
        setIsRunningScheduledPosts(true);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            if (!token) throw new Error('Must be logged in');
            const res = await fetch('/api/autoPostScheduled?debug=1', {
                method: 'GET',
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || data.error || 'Request failed');
            const msg = data.posted > 0
                ? `Posted ${data.posted} to X. Processed: ${data.processed}, In DB: ${data.totalScheduledInDb}`
                : `Processed: ${data.processed}, Posted: 0. Total Scheduled: ${data.totalScheduledInDb}. ${data.errors?.length ? data.errors.join('; ') : ''}`;
            showToast(msg, data.posted > 0 ? 'success' : 'info');
        } catch (e: any) {
            showToast(e?.message || 'Failed to run scheduled posts', 'error');
        } finally {
            setIsRunningScheduledPosts(false);
        }
    };

    // Remove post from this calendar only (does not delete the post document)
    const handleDeletePost = async () => {
        if (!selectedEvent || !user || !selectedEvent.post?.id) return;

        if (
            !window.confirm(
                'Remove this from your main calendar? The post is not deleted and stays in Create Post / your content.'
            )
        ) {
            return;
        }

        try {
            await removePostFromMainCalendar(selectedEvent.post, selectedEvent.event.id);
            setSelectedEvent(null);
            showToast('Removed from calendar', 'success');
        } catch (error) {
            console.error('Failed to remove post from calendar:', error);
            showToast('Failed to remove from calendar. Please try again.', 'error');
        }
    };

    // Handle reminder save
    const handleSaveReminder = async () => {
        if (!user || !reminderTitle.trim() || !reminderDate) {
            showToast('Please fill in all required fields', 'error');
            return;
        }

        try {
            const reminderId = selectedReminder?.id || `reminder-${Date.now()}`;
            const dateTime = new Date(`${reminderDate}T${reminderTime || '12:00'}`);
            
            const reminderData = {
                title: reminderTitle.trim(),
                date: dateTime.toISOString(),
                reminderType: reminderType,
                createdAt: selectedReminder?.createdAt || new Date().toISOString(),
                userId: user.id,
                ...(reminderDescription.trim() ? { description: reminderDescription.trim() } : {}),
                ...(reminderTime ? { reminderTime: reminderTime } : {}),
            };

            await setDoc(doc(db, 'users', user.id, 'calendar_events', reminderId), reminderData);

            showToast(selectedReminder ? 'Reminder updated!' : 'Reminder created!', 'success');
            resetReminderForm();
            // Ensure modal closes immediately after save/update
            setIsCreatingReminder(false);
            setSelectedReminder(null);
        } catch (error) {
            console.error('Error saving reminder:', error);
            showToast('Failed to save reminder', 'error');
        }
    };

    // Handle reminder delete
    const handleDeleteReminder = async (reminderId: string) => {
        if (!user) return;
        
        if (!confirm('Are you sure you want to delete this reminder?')) {
            return;
        }

        try {
            await deleteDoc(doc(db, 'users', user.id, 'calendar_events', reminderId));
            showToast('Reminder deleted', 'success');
            setSelectedReminder(null);
            resetReminderForm();
        } catch (error) {
            console.error('Error deleting reminder:', error);
            showToast('Failed to delete reminder', 'error');
        }
    };

    // Reset reminder form
    const resetReminderForm = () => {
        setIsCreatingReminder(false);
        setSelectedReminder(null);
        setReminderTitle('');
        setReminderDescription('');
        setReminderType('post');
        setReminderDate('');
        setReminderTime('');
    };

    // Reset edit state when modal closes
    useEffect(() => {
        if (!selectedEvent) {
            setIsEditing(false);
            setIsRegenerating(false);
            setIsPublishing(false);
            setEditDate('');
            setEditTime('');
            setEditGoal('engagement');
            setEditTone('friendly');
            setRegeneratePlatform(null);
            setRegenerateGoal('engagement');
            setRegenerateTone('friendly');
        }
    }, [selectedEvent]);

    const selectedIsPurchase = !!selectedEvent && (selectedEvent.event.id.startsWith('purchase-') || !!(selectedEvent.event as any).purchaseEvent);
    const selectedPurchaseStatus = selectedIsPurchase ? String((selectedEvent?.event as any)?.purchaseStatus || 'scheduled') : 'scheduled';
    const selectedIsLiveStream =
        !!selectedEvent &&
        (selectedEvent.event.id.startsWith('livestream-') || !!(selectedEvent.event as any).liveStreamEvent);
    const selectedSkipsPostEditor = selectedIsPurchase || selectedIsLiveStream;

    return (
        <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-full">
            {/* Calendar Event Preview Modal */}
            {selectedEvent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4" onClick={() => setSelectedEvent(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                                        {selectedIsPurchase ? (
                                            <span className="text-lg">🎁</span>
                                        ) : selectedIsLiveStream ? (
                                            <span className="text-lg">📡</span>
                                        ) : (
                                            platformIcons[selectedEvent.event.platform]
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                            {selectedIsPurchase
                                                ? (selectedPurchaseStatus === 'delivered' ? 'Delivered Purchase' : 'Scheduled Purchase')
                                                : selectedIsLiveStream
                                                  ? (() => {
                                                        const lst = String((selectedEvent.event as any).liveStreamStatus || '').toLowerCase();
                                                        if (lst === 'live') return 'Live stream (on air)';
                                                        if (lst === 'ended' || lst === 'cancelled') return 'Live stream (ended)';
                                                        return 'Fan Hub live stream';
                                                    })()
                                                  : selectedEvent.post?.status === 'Published'
                                                    ? 'Published Post Preview'
                                                    : 'Scheduled Post Preview'}
                                        </h3>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            {selectedIsPurchase
                                                ? `Fan Hub • ${((selectedEvent.event as any).deliveryType || 'purchase').toString()}`
                                                : selectedIsLiveStream
                                                  ? (() => {
                                                        const lst = String((selectedEvent.event as any).liveStreamStatus || '').toLowerCase();
                                                        if (lst === 'ended' || lst === 'cancelled') return 'My Page • Completed';
                                                        return `My Page • ${lst || 'scheduled'}`;
                                                    })()
                                                  : `${selectedEvent.event.platform} • ${selectedEvent.event.type}`}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {!isEditing && !selectedSkipsPostEditor && (
                                        <>
                                            <button
                                                onClick={() => {
                                                    if (!selectedEvent.post) return;
                                                    setExportPreview({ post: selectedEvent.post, event: selectedEvent.event });
                                                }}
                                                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-2"
                                            >
                                                <DownloadIcon className="w-4 h-4" />
                                                Export
                                            </button>
                                            <button
                                                onClick={() => setIsEditing(true)}
                                                className="px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
                                            >
                                                Edit
                                            </button>
                                            {(selectedEvent.post?.status === 'Draft' || selectedEvent.post?.status === 'Scheduled') && (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() => selectedEvent.post && openPostInCompose(selectedEvent.post)}
                                                        className="px-4 py-2 text-sm font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                                                    >
                                                        Edit in Create Post
                                                    </button>
                                                    {/* Auto-publish to social platforms */}
                                                    {selectedEvent.post?.status === 'Scheduled' && (
                                                        <button
                                                            onClick={handlePublishPost}
                                                            disabled={isPublishing}
                                                            className="px-4 py-2 text-sm font-medium text-white bg-green-600 dark:bg-green-700 border border-green-600 dark:border-green-700 rounded-lg hover:bg-green-700 dark:hover:bg-green-800 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                                            title="Auto-publish to social platforms"
                                                        >
                                                            <SendIcon className="w-4 h-4" />
                                                            {isPublishing ? 'Publishing...' : 'Publish Now'}
                                                        </button>
                                                    )}
                                                    {/* Mark as Posted (manual fallback) */}
                                                    <button
                                                        onClick={async () => {
                                                            if (!selectedEvent.post || !user) return;
                                                            try {
                                                                const updatedPost: Post = {
                                                                    ...selectedEvent.post,
                                                                    status: 'Published',
                                                                    // Used by Dashboard insights to compute recent posting frequency
                                                                    publishedAt: new Date().toISOString(),
                                                                };
                                                                await updatePost(updatedPost);
                                                                
                                                                // Update calendar event status
                                                                const updatedEvent: CalendarEvent = {
                                                                    ...selectedEvent.event,
                                                                    status: 'Published',
                                                                };
                                                                await setDoc(doc(db, 'users', user.id, 'calendar_events', updatedEvent.id), updatedEvent);
                                                                
                                                                setSelectedEvent({
                                                                    event: updatedEvent,
                                                                    post: updatedPost,
                                                                });
                                                                showToast('Marked as Published!', 'success');
                                                                // Auto-close modal after update (no click-off required)
                                                                setSelectedEvent(null);
                                                            } catch (error) {
                                                                console.error('Failed to mark as published:', error);
                                                                showToast('Failed to mark as published', 'error');
                                                            }
                                                        }}
                                                        className="px-4 py-2 text-sm font-medium text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors flex items-center gap-2"
                                                    >
                                                        <CheckCircleIcon className="w-4 h-4" />
                                                        Mark as Posted
                                                    </button>
                                                </>
                                            )}
                                        </>
                                    )}
                                    <button
                                        onClick={() => setSelectedEvent(null)}
                                        className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        <XMarkIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Date & Time - Published on vs Scheduled for */}
                            {selectedIsPurchase ? (
                                <div className={`mb-4 p-4 rounded-lg border ${
                                    selectedPurchaseStatus === 'delivered'
                                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                                        : 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800'
                                }`}>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-sm font-semibold ${
                                            selectedPurchaseStatus === 'delivered'
                                                ? 'text-emerald-700 dark:text-emerald-300'
                                                : 'text-purple-700 dark:text-purple-300'
                                        }`}>
                                            {selectedPurchaseStatus === 'delivered' ? 'Delivered on:' : 'Scheduled for:'}
                                        </span>
                                        <span className={`text-sm ${
                                            selectedPurchaseStatus === 'delivered'
                                                ? 'text-emerald-600 dark:text-emerald-400'
                                                : 'text-purple-600 dark:text-purple-400'
                                        }`}>
                                            {new Date(selectedEvent.event.date).toLocaleString([], {
                                                weekday: 'long',
                                                year: 'numeric',
                                                month: 'long',
                                                day: 'numeric',
                                                hour: 'numeric',
                                                minute: '2-digit',
                                                hour12: true
                                            })}
                                        </span>
                                    </div>
                                </div>
                            ) : selectedIsLiveStream ? (
                                <div
                                    className={`mb-4 p-4 rounded-lg border ${
                                        (() => {
                                            const lst = String((selectedEvent.event as any).liveStreamStatus || '').toLowerCase();
                                            return lst === 'ended' || lst === 'cancelled'
                                                ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                                                : 'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800';
                                        })()
                                    }`}
                                >
                                    <div className="flex flex-col gap-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span
                                                className={`text-sm font-semibold ${
                                                    (() => {
                                                        const lst = String((selectedEvent.event as any).liveStreamStatus || '').toLowerCase();
                                                        return lst === 'ended' || lst === 'cancelled'
                                                            ? 'text-emerald-800 dark:text-emerald-200'
                                                            : 'text-sky-800 dark:text-sky-200';
                                                    })()
                                                }`}
                                            >
                                                {(() => {
                                                    const lst = String((selectedEvent.event as any).liveStreamStatus || '').toLowerCase();
                                                    if (lst === 'live') return 'Started (scheduled start was):';
                                                    if (lst === 'ended' || lst === 'cancelled') return 'Was scheduled for:';
                                                    return 'Goes live:';
                                                })()}
                                            </span>
                                            <span
                                                className={`text-sm ${
                                                    (() => {
                                                        const lst = String((selectedEvent.event as any).liveStreamStatus || '').toLowerCase();
                                                        return lst === 'ended' || lst === 'cancelled'
                                                            ? 'text-emerald-700 dark:text-emerald-300'
                                                            : 'text-sky-700 dark:text-sky-300';
                                                    })()
                                                }`}
                                            >
                                                {new Date(selectedEvent.event.date).toLocaleString([], {
                                                    weekday: 'long',
                                                    year: 'numeric',
                                                    month: 'long',
                                                    day: 'numeric',
                                                    hour: 'numeric',
                                                    minute: '2-digit',
                                                    hour12: true,
                                                })}
                                            </span>
                                        </div>
                                        <p
                                            className={`text-xs ${
                                                (() => {
                                                    const lst = String((selectedEvent.event as any).liveStreamStatus || '').toLowerCase();
                                                    return lst === 'ended' || lst === 'cancelled'
                                                        ? 'text-emerald-800/90 dark:text-emerald-200/90'
                                                        : 'text-sky-800/90 dark:text-sky-200/90';
                                                })()
                                            }`}
                                        >
                                            Status:{' '}
                                            <span className="font-medium">
                                                {(() => {
                                                    const lst = String((selectedEvent.event as any).liveStreamStatus || '').toLowerCase();
                                                    if (lst === 'ended') return 'completed';
                                                    if (lst === 'cancelled') return 'cancelled';
                                                    return String((selectedEvent.event as any).liveStreamStatus || 'scheduled');
                                                })()}
                                            </span>
                                            {typeof (selectedEvent.event as any).liveStreamTicketCents === 'number' &&
                                            (selectedEvent.event as any).liveStreamTicketCents > 0 ? (
                                                <span className="ml-2">
                                                    · Ticket: $
                                                    {(
                                                        (selectedEvent.event as any).liveStreamTicketCents / 100
                                                    ).toFixed(2)}
                                                </span>
                                            ) : null}
                                        </p>
                                        {(selectedEvent.event as any).liveStreamTestOnly ? (
                                            <p className="text-xs text-amber-800 dark:text-amber-200">
                                                Test-only stream (hidden from fans until you turn that off in Fan Hub).
                                            </p>
                                        ) : null}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedEvent(null);
                                                setActivePage('fanHub');
                                            }}
                                            className="mt-1 self-start px-3 py-1.5 text-sm font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-400"
                                        >
                                            Open Fan Hub
                                        </button>
                                    </div>
                                </div>
                            ) : selectedEvent.post?.status === 'Published' ? (
                                <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-green-700 dark:text-green-300">Published on:</span>
                                        <span className="text-sm text-green-600 dark:text-green-400">
                                            {new Date(selectedEvent.post.publishedAt || selectedEvent.event.date).toLocaleString([], {
                                                weekday: 'long',
                                                year: 'numeric',
                                                month: 'long',
                                                day: 'numeric',
                                                hour: 'numeric',
                                                minute: '2-digit',
                                                hour12: true
                                            })}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                    {isEditing ? (
                                        <div className="space-y-3">
                                            <label className="block text-sm font-semibold text-blue-700 dark:text-blue-300 mb-2">
                                                Scheduled Date & Time:
                                            </label>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Date</label>
                                                    <input
                                                        type="date"
                                                        value={editDate}
                                                        onChange={(e) => setEditDate(e.target.value)}
                                                        className="w-full p-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Time</label>
                                                    <input
                                                        type="time"
                                                        value={editTime}
                                                        onChange={(e) => setEditTime(e.target.value)}
                                                        className="w-full p-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">Scheduled for:</span>
                                            <span className="text-sm text-blue-600 dark:text-blue-400">
                                                {new Date(selectedEvent.event.date).toLocaleString([], {
                                                    weekday: 'long',
                                                    year: 'numeric',
                                                    month: 'long',
                                                    day: 'numeric',
                                                    hour: 'numeric',
                                                    minute: '2-digit',
                                                    hour12: true
                                                })}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {!isEditing && !selectedSkipsPostEditor && selectedEvent.post?.status === 'Scheduled' && (
                                <div className="mb-4 p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
                                    <label className="flex items-start gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="mt-1 rounded border-gray-300 dark:border-gray-600 text-amber-600 focus:ring-amber-500"
                                            checked={selectedEvent.post.autoPublishAtSchedule === true}
                                            disabled={autoPublishUpdating || OFFLINE_MODE}
                                            onChange={async (e) => {
                                                if (!selectedEvent.post || !user) return;
                                                setAutoPublishUpdating(true);
                                                try {
                                                    const next: Post = {
                                                        ...selectedEvent.post,
                                                        autoPublishAtSchedule: e.target.checked,
                                                    };
                                                    await updatePost(next);
                                                    setSelectedEvent((se) =>
                                                        se && se.post ? { ...se, post: next } : se
                                                    );
                                                    showToast(
                                                        e.target.checked
                                                            ? 'Auto-post at schedule time is on for this post.'
                                                            : 'Auto-post is off; use Publish Now or post manually.',
                                                        'success'
                                                    );
                                                } catch (err) {
                                                    console.error(err);
                                                    showToast('Could not update auto-post setting.', 'error');
                                                } finally {
                                                    setAutoPublishUpdating(false);
                                                }
                                            }}
                                        />
                                        <div>
                                            <span className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                                                Auto-post when due
                                            </span>
                                            <p className="text-xs text-amber-800/90 dark:text-amber-200/90 mt-1 leading-snug">
                                                At the scheduled time, publishes automatically when X is in this post and your X account is connected. Other platforms: use Publish Now or post manually.
                                                {selectedEvent.post.platforms?.includes('X') && !socialAccounts?.X?.connected ? (
                                                    <span className="block mt-1 font-medium">
                                                        Connect X in Settings for automatic posting.
                                                    </span>
                                                ) : null}
                                            </p>
                                        </div>
                                    </label>
                                </div>
                            )}

                            {/* Media Preview */}
                            {(selectedEvent.post?.mediaUrl || selectedEvent.event.thumbnail || (selectedIsPurchase && (selectedEvent.event as any).deliveryUrl)) && (
                                <div className="mb-4 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                                    {(selectedIsPurchase && (selectedEvent.event as any).deliveryType === 'audio') ? (
                                        <audio
                                            src={(selectedEvent.event as any).deliveryUrl}
                                            controls
                                            className="w-full"
                                        />
                                    ) : ((selectedIsPurchase && (selectedEvent.event as any).deliveryType === 'video') || selectedEvent.post?.mediaType === 'video' || selectedEvent.event.type === 'Reel') ? (
                                        <video
                                            src={(selectedIsPurchase ? (selectedEvent.event as any).deliveryUrl : undefined) || selectedEvent.post?.mediaUrl || selectedEvent.event.thumbnail}
                                            controls
                                            className="w-full max-h-96 object-contain bg-gray-100 dark:bg-gray-900"
                                        />
                                    ) : (
                                        <img
                                            src={(selectedIsPurchase ? (selectedEvent.event as any).deliveryUrl : undefined) || selectedEvent.post?.mediaUrl || selectedEvent.event.thumbnail}
                                            alt="Post preview"
                                            className="w-full max-h-96 object-contain bg-gray-100 dark:bg-gray-900"
                                        />
                                    )}
                                </div>
                            )}

                            {/* Caption */}
                            {(selectedEvent.post?.content ||
                                (selectedIsPurchase && (selectedEvent.event as any).deliveryText) ||
                                (selectedIsLiveStream &&
                                    typeof (selectedEvent.event as any).liveStreamDescription === 'string' &&
                                    (selectedEvent.event as any).liveStreamDescription.trim())) && (
                                <div className="mb-4">
                                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                        {selectedIsPurchase
                                            ? 'Delivery note:'
                                            : selectedIsLiveStream
                                              ? 'Description:'
                                              : 'Caption:'}
                                    </h4>
                                    <p className="text-gray-900 dark:text-white whitespace-pre-wrap bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                                        {(selectedIsPurchase
                                            ? (selectedEvent.event as any).deliveryText
                                            : selectedIsLiveStream
                                              ? (selectedEvent.event as any).liveStreamDescription
                                              : selectedEvent.post?.content) || ''}
                                    </p>
                                </div>
                            )}
                            {selectedIsPurchase ? (
                                <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                    <p className="text-sm text-gray-700 dark:text-gray-300">
                                        Fan: {(selectedEvent.event as any).fanName || (selectedEvent.event as any).fanEmail || 'Member'}
                                    </p>
                                </div>
                            ) : null}

                            {/* Hashtags */}
                            {selectedEvent.post?.content && extractHashtags(selectedEvent.post.content).length > 0 && (
                                <div className="mb-4">
                                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Hashtags:</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {extractHashtags(selectedEvent.post.content).map((tag, idx) => (
                                            <span key={idx} className="px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-sm">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Platforms - Display Only when not editing, Editable when editing */}
                            {!selectedIsLiveStream ? (
                            <div className="mb-4">
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Platform:</h4>
                                {isEditing ? (
                                    <div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Select one platform for this post</p>
                                        <div className="flex flex-wrap gap-2">
                                            {(Object.keys(platformIcons) as Platform[])
                                                .filter((platform): platform is Platform => 
                                                    platform !== 'OnlyFans' as any && 
                                                    platform !== 'TikTok' && 
                                                    platform !== 'Threads' && 
                                                    platform !== 'YouTube' && 
                                                    platform !== 'LinkedIn' && 
                                                    platform !== 'Pinterest'
                                                )
                                                .map((platform) => {
                                                    // Check if this platform is in the original post
                                                    const originalPlatforms = selectedEvent.post?.platforms || [selectedEvent.event.platform];
                                                    const isSelected = regeneratePlatform === platform || (regeneratePlatform === null && originalPlatforms.includes(platform));
                                                    
                                                    return (
                                                        <button
                                                            key={platform}
                                                            onClick={() => setRegeneratePlatform(platform)}
                                                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                                                                isSelected
                                                                    ? 'bg-primary-100 dark:bg-primary-900/30 border-primary-500 dark:border-primary-600 text-primary-700 dark:text-primary-300 ring-2 ring-primary-400 dark:ring-primary-500'
                                                                    : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                                            }`}
                                                        >
                                                            <span className="w-4 h-4">{platformIcons[platform]}</span>
                                                            <span className="text-sm font-medium">{platform}</span>
                                                        </button>
                                                    );
                                                })}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        {(selectedEvent.post?.platforms || [selectedEvent.event.platform]).map((platform, idx) => (
                                            <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg">
                                                <span className="w-4 h-4">{platformIcons[platform]}</span>
                                                <span className="text-sm text-gray-700 dark:text-gray-300">{platform}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            ) : null}

                            {/* Regenerate Captions Section - Only in Edit Mode */}
                            {isEditing && (
                                <div className="mb-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                                    <div className="space-y-4">
                                        <h4 className="text-sm font-semibold text-purple-700 dark:text-purple-300">Regenerate Captions</h4>
                                        
                                        <div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                                Captions will be optimized for the platform selected above. Use the goal and tone settings below to customize the caption style.
                                            </p>
                                        </div>

                                        {/* Goal Dropdown */}
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Goal:</label>
                                            <select
                                                value={regenerateGoal}
                                                onChange={(e) => setRegenerateGoal(e.target.value)}
                                                className="w-full p-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                                            >
                                                <option value="engagement">Increase Engagement</option>
                                                <option value="sales">Drive Sales</option>
                                                <option value="awareness">Build Awareness</option>
                                                <option value="followers">Increase Followers/Fans</option>
                                            </select>
                                        </div>

                                        {/* Tone Dropdown */}
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Tone:</label>
                                            <select
                                                value={regenerateTone}
                                                onChange={(e) => setRegenerateTone(e.target.value)}
                                                className="w-full p-2 border rounded-lg bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                                            >
                                                <option value="friendly">Friendly</option>
                                                <option value="witty">Witty</option>
                                                <option value="inspirational">Inspirational</option>
                                                <option value="professional">Professional</option>
                                            </select>
                                        </div>

                                        {/* Regenerate Button */}
                                        <button
                                            onClick={handleRegenerateCaptions}
                                            disabled={isRegenerating}
                                            className="w-full px-4 py-2 text-sm font-medium text-white bg-purple-600 dark:bg-purple-500 rounded-lg hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            {isRegenerating ? (
                                                <>
                                                    <SparklesIcon className="w-4 h-4 animate-spin" />
                                                    Regenerating...
                                                </>
                                            ) : (
                                                <>
                                                    <SparklesIcon className="w-4 h-4" />
                                                    Regenerate Captions
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Edit Actions */}
                            {isEditing && (
                                <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                                    <button
                                        onClick={handleDeletePost}
                                        disabled={isSaving}
                                        className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50 flex items-center gap-2"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                        Remove from calendar
                                    </button>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => {
                                                setIsEditing(false);
                                                setIsRegenerating(false);
                                                // Reset to original values
                                                const eventDate = new Date(selectedEvent.event.date);
                                                const dateStr = eventDate.toISOString().split('T')[0];
                                                const timeStr = eventDate.toTimeString().slice(0, 5);
                                                setEditDate(dateStr);
                                                setEditTime(timeStr);
                                                
                                                // Reset platform to original
                                                if (selectedEvent.post?.platforms && selectedEvent.post.platforms.length > 0) {
                                                    setRegeneratePlatform(selectedEvent.post.platforms[0]);
                                                } else {
                                                    setRegeneratePlatform(selectedEvent.event.platform);
                                                }
                                                
                                                // Reset goal and tone to original
                                                if ((selectedEvent.post as any)?.postGoal) {
                                                    setEditGoal((selectedEvent.post as any).postGoal);
                                                    setRegenerateGoal((selectedEvent.post as any).postGoal);
                                                } else {
                                                    setEditGoal('engagement');
                                                    setRegenerateGoal('engagement');
                                                }
                                                if ((selectedEvent.post as any)?.postTone) {
                                                    setEditTone((selectedEvent.post as any).postTone);
                                                    setRegenerateTone((selectedEvent.post as any).postTone);
                                                } else {
                                                    setEditTone('friendly');
                                                    setRegenerateTone('friendly');
                                                }
                                            }}
                                            disabled={isSaving}
                                            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleSaveEdit}
                                            disabled={isSaving}
                                            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {isSaving ? (
                                                <>
                                                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                    Saving...
                                                </>
                                            ) : (
                                                'Save Changes'
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <div className="flex items-center gap-6">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">My Schedule</h1>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Plan and schedule your content across all platforms</p>
                    </div>
                    <div className="flex items-center bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-1.5 gap-1">
                         <button 
                             onClick={handlePrevMonth} 
                             className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
                             aria-label="Previous month"
                         >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                         </button>
                         <span className="text-base font-bold text-gray-800 dark:text-gray-200 min-w-[160px] text-center px-4">
                             {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                         </span>
                         <button 
                             onClick={handleNextMonth} 
                             className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
                             aria-label="Next month"
                         >
                             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                         </button>
                    </div>
                </div>
                <div className="flex gap-4 items-center flex-wrap">
                    <div className="flex items-center gap-2 sm:gap-4 text-xs bg-white dark:bg-gray-800 py-2.5 px-3 sm:px-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex-wrap">
                         <div className="flex items-center gap-1.5 sm:gap-2"><span className="w-3 h-3 rounded-full bg-green-500 dark:bg-green-400 shadow-sm"></span> <span className="text-gray-700 dark:text-gray-300 font-medium">Published</span></div>
                         <div className="flex items-center gap-1.5 sm:gap-2"><span className="w-3 h-3 rounded-full bg-blue-500 dark:bg-blue-400 shadow-sm"></span> <span className="text-gray-700 dark:text-gray-300 font-medium">Scheduled</span></div>
                         <div className="flex items-center gap-1.5 sm:gap-2"><span className="w-3 h-3 rounded-full bg-gray-400 dark:bg-gray-500 shadow-sm"></span> <span className="text-gray-700 dark:text-gray-300 font-medium">Draft</span></div>
                         <div className="flex items-center gap-1.5 sm:gap-2"><span className="w-3 h-3 rounded-full bg-orange-500 dark:bg-orange-400 shadow-sm"></span> <span className="text-gray-700 dark:text-gray-300 font-medium">Reminder</span></div>
                         <div className="flex items-center gap-1.5 sm:gap-2"><span className="w-3 h-3 rounded-full bg-red-500 dark:bg-red-400 shadow-sm"></span> <span className="text-gray-700 dark:text-gray-300 font-medium">Scheduled fan meeting</span></div>
                         <div className="flex items-center gap-1.5 sm:gap-2"><span className="w-3 h-3 rounded-full bg-purple-500 dark:bg-purple-400 shadow-sm"></span> <span className="text-gray-700 dark:text-gray-300 font-medium">Scheduled store purchase</span></div>
                         <div className="flex items-center gap-1.5 sm:gap-2"><span className="w-3 h-3 rounded-full bg-emerald-500 dark:bg-emerald-400 shadow-sm"></span> <span className="text-gray-700 dark:text-gray-300 font-medium">Delivered purchase</span></div>
                    </div>
                    <button 
                        onClick={() => setIsCreatingReminder(true)}
                        className="px-5 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-semibold flex items-center gap-2 shadow-md transition-all"
                    >
                         <PlusIcon className="w-5 h-5" />
                         Add Reminder
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            window.location.assign("/fan?tab=purchases");
                        }}
                        className="px-5 py-2.5 bg-purple-600 dark:bg-purple-500 text-white rounded-lg hover:bg-purple-700 dark:hover:bg-purple-600 text-sm font-semibold flex items-center gap-2 shadow-md transition-all"
                        title="Open Fan Hub → Purchases to schedule deliveries and sync your calendar"
                    >
                         <PlusIcon className="w-5 h-5" />
                         Schedule store item
                    </button>
                    <button 
                        onClick={() => {
                            // Clear any scheduled date from localStorage so compose doesn't prefill
                            localStorage.removeItem('composeScheduledDate');
                            setActivePage('compose');
                        }} 
                        className="px-5 py-2.5 bg-gradient-to-r from-primary-600 to-primary-500 text-white rounded-lg hover:from-primary-700 hover:to-primary-600 text-sm font-semibold flex items-center gap-2 shadow-md transition-all"
                    >
                         <PlusIcon className="w-5 h-5" />
                         New Post
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
                <div className="grid grid-cols-7 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 border-b border-gray-200 dark:border-gray-700 min-w-[700px]">
                    {daysOfWeek.map(day => (
                        <div key={day} className="text-center font-bold text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wider py-3 px-2">
                            {day}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-7 min-w-[700px]">
                    {renderCalendarGrid()}
                </div>
            </div>

            {/* Export Preview Modal - Mobile & Desktop Friendly */}
            {exportPreview && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4" onClick={() => setExportPreview(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Export Content</h3>
                                <button
                                    onClick={() => setExportPreview(null)}
                                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <XMarkIcon className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Content Preview */}
                            <div className="space-y-4 mb-6">
                                {/* Media Preview - Long press to save on mobile */}
                                {exportPreview.post.mediaUrl && (
                                    <div className="relative">
                                        {exportPreview.post.mediaType === 'video' ? (
                                            <video
                                                src={exportPreview.post.mediaUrl}
                                                className="w-full rounded-lg border border-gray-200 dark:border-gray-700"
                                                controls
                                                onContextMenu={(e) => e.preventDefault()}
                                            />
                                        ) : (
                                            <img
                                                src={exportPreview.post.mediaUrl}
                                                alt="Post media"
                                                className="w-full rounded-lg border border-gray-200 dark:border-gray-700"
                                                onContextMenu={(e) => e.preventDefault()}
                                            />
                                        )}
                                        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
                                            {typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches 
                                                ? '📱 Long press image to save or share'
                                                : 'Right-click image to save'}
                                        </div>
                                    </div>
                                )}

                                {/* Caption - Copy button */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Caption:</label>
                                        <button
                                            onClick={async () => {
                                                try {
                                                    await navigator.clipboard.writeText(exportPreview.post.content || '');
                                                    showToast('Caption copied to clipboard!', 'success');
                                                } catch (error) {
                                                    showToast('Failed to copy. Please select and copy manually.', 'error');
                                                }
                                            }}
                                            className="px-3 py-1.5 text-xs font-medium text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors flex items-center gap-1.5"
                                        >
                                            <CopyIcon className="w-3 h-3" />
                                            Copy Caption
                                        </button>
                                    </div>
                                    <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                        <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">{exportPreview.post.content}</p>
                                    </div>
                                </div>

                                {/* Post Details */}
                                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                    <div className="text-xs space-y-1">
                                        <p><strong>Platforms:</strong> {(exportPreview.post.platforms || []).join(', ') || 'No platforms'}</p>
                                        <p><strong>Scheduled:</strong> {exportPreview.post.scheduledDate ? new Date(exportPreview.post.scheduledDate).toLocaleString() : 'Not scheduled'}</p>
                                        <p><strong>Status:</strong> {exportPreview.post.status}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Export Actions */}
                            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                                {/* Download Text File (Desktop) */}
                                <button
                                    onClick={async () => {
                                        const post = exportPreview.post;
                                        const platforms = (post.platforms || []).join(', ') || 'No platforms set';
                                        const scheduled = post.scheduledDate
                                            ? new Date(post.scheduledDate).toLocaleString()
                                            : 'No planned date';
                                        const mediaUrl = post.mediaUrl || 'No media URL (text-only post)';
                                        
                                        const exportContent = `Post Export\n${'='.repeat(50)}\nPlatforms: ${platforms}\nPlanned Date/Time: ${scheduled}\nStatus: ${post.status}\nMedia: ${mediaUrl}\n\nCaption:\n${post.content}\n${'='.repeat(50)}`;
                                        
                                        const blob = new Blob([exportContent], { type: 'text/plain' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `post-export-${post.id || Date.now()}.txt`;
                                        document.body.appendChild(a);
                                        a.click();
                                        a.remove();
                                        URL.revokeObjectURL(url);
                                        showToast('Text file downloaded!', 'success');
                                    }}
                                    className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
                                >
                                    <DownloadIcon className="w-4 h-4" />
                                    Download Text File
                                </button>

                                {/* Download Media (if available) */}
                                {exportPreview.post.mediaUrl && (
                                    <button
                                        onClick={async () => {
                                            try {
                                                const response = await fetch(exportPreview.post.mediaUrl!);
                                                const blob = await response.blob();
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                const extension = exportPreview.post.mediaType === 'video' ? 'mp4' : 'jpg';
                                                a.download = `post-media-${exportPreview.post.id || Date.now()}.${extension}`;
                                                document.body.appendChild(a);
                                                a.click();
                                                a.remove();
                                                URL.revokeObjectURL(url);
                                                showToast('Media downloaded!', 'success');
                                            } catch (error) {
                                                console.error('Failed to download media:', error);
                                                showToast('Failed to download media. Try long-pressing the image instead.', 'error');
                                            }
                                        }}
                                        className="flex-1 px-4 py-2.5 text-sm font-medium text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors flex items-center justify-center gap-2"
                                    >
                                        <DownloadIcon className="w-4 h-4" />
                                        Download {exportPreview.post.mediaType === 'video' ? 'Video' : 'Image'}
                                    </button>
                                )}

                                {/* Copy All Button */}
                                <button
                                    onClick={async () => {
                                        const post = exportPreview.post;
                                        const platforms = (post.platforms || []).join(', ') || 'No platforms set';
                                        const scheduled = post.scheduledDate
                                            ? new Date(post.scheduledDate).toLocaleString()
                                            : 'Not scheduled';
                                        
                                        const allContent = `Platforms: ${platforms}\nScheduled: ${scheduled}\nStatus: ${post.status}\n\n${post.content}`;
                                        
                                        try {
                                            await navigator.clipboard.writeText(allContent);
                                            showToast('All content copied to clipboard!', 'success');
                                        } catch (error) {
                                            showToast('Failed to copy. Please select and copy manually.', 'error');
                                        }
                                    }}
                                    className="px-4 py-2.5 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors flex items-center justify-center gap-2"
                                >
                                    <CopyIcon className="w-4 h-4" />
                                    Copy All
                                </button>
                            </div>

                            {/* Mobile Instructions */}
                            {typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches && (
                                <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                                    <p className="text-xs text-amber-800 dark:text-amber-200">
                                        <strong>Mobile Tips:</strong> Long press the image/video above to save or share. Tap "Copy Caption" or "Copy All" to copy text to clipboard.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Reminder Modal */}
            {isCreatingReminder && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                {selectedReminder ? 'Edit Reminder' : 'Create Reminder'}
                            </h3>
                            <button
                                onClick={resetReminderForm}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <XMarkIcon className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            {/* Reminder Type */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Reminder Type *
                                </label>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setReminderType('post')}
                                        className={`flex-1 px-4 py-2 rounded-md border-2 transition-colors ${
                                            reminderType === 'post'
                                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                                                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                                        }`}
                                    >
                                        📤 Post Reminder
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setReminderType('shoot')}
                                        className={`flex-1 px-4 py-2 rounded-md border-2 transition-colors ${
                                            reminderType === 'shoot'
                                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                                                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                                        }`}
                                    >
                                        🎬 Shoot Reminder
                                    </button>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    {reminderType === 'post' 
                                        ? 'Reminder to post content'
                                        : 'Reminder to film/create content'}
                                </p>
                            </div>

                            {/* Title */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Title *
                                </label>
                                <input
                                    type="text"
                                    value={reminderTitle}
                                    onChange={(e) => setReminderTitle(e.target.value)}
                                    placeholder="e.g., Post Instagram content, Film TikTok video"
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>

                            {/* Description/Content - Text box only */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Description / Content
                                </label>
                                <textarea
                                    value={reminderDescription}
                                    onChange={(e) => setReminderDescription(e.target.value)}
                                    placeholder="Additional notes or content details..."
                                    rows={4}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>

                            {/* Date */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Date *
                                </label>
                                <input
                                    type="date"
                                    value={reminderDate}
                                    onChange={(e) => setReminderDate(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>

                            {/* Time */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Reminder Time
                                </label>
                                <input
                                    type="time"
                                    value={reminderTime}
                                    onChange={(e) => setReminderTime(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    When you want to be reminded (e.g., 8:00 PM)
                                </p>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-4">
                                {selectedReminder && (
                                    <button
                                        onClick={() => handleDeleteReminder(selectedReminder.id)}
                                        className="flex-1 px-4 py-2 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center justify-center gap-2"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                        Delete
                                    </button>
                                )}
                                <button
                                    onClick={resetReminderForm}
                                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveReminder}
                                    className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center justify-center gap-2"
                                >
                                    <CheckCircleIcon className="w-4 h-4" />
                                    {selectedReminder ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
