
import React, { useState, useMemo, useEffect } from 'react';
import { CalendarEvent, Platform, Post } from '../types';
import { InstagramIcon, TikTokIcon, XIcon, ThreadsIcon, YouTubeIcon, LinkedInIcon, FacebookIcon, PinterestIcon } from './icons/PlatformIcons';
import { PlusIcon, SparklesIcon, XMarkIcon, TrashIcon, DownloadIcon, CheckCircleIcon, CopyIcon } from './icons/UIIcons';
import { useAppContext } from './AppContext';
import { db } from '../firebaseConfig';
import { doc, setDoc, deleteDoc, collection, query, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { hasCapability } from '../src/services/platformCapabilities';
import { generateCaptions } from '../src/services/geminiService';

const platformIcons: Record<Platform, React.ReactNode> = {
  Instagram: <InstagramIcon />,
  TikTok: <TikTokIcon />,
  X: <XIcon />,
  Threads: <ThreadsIcon />,
  YouTube: <YouTubeIcon />,
  LinkedIn: <LinkedInIcon />,
  Facebook: <FacebookIcon />,
  Pinterest: <PinterestIcon />,
};

const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const Calendar: React.FC = () => {
    const { calendarEvents, setActivePage, posts, user, showToast, updatePost, addCalendarEvent, deletePost } = useAppContext();
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
    const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
    const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);
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
        
        if (!posts || !Array.isArray(posts)) {
            // If no posts, still return reminders
            return reminders.map(reminder => ({
                id: `reminder-${reminder.id}`,
                title: reminder.title,
                date: reminder.date,
                type: 'Reminder' as any,
                platform: 'Instagram' as Platform, // Placeholder, won't be used
                status: 'Scheduled' as const,
                reminderType: reminder.reminderType,
                reminderDescription: reminder.description,
            }));
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
                    thumbnail: post.mediaUrl || undefined,
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
        } as any));
        
        // Combine and sort by date
        const allEvents = [...filteredPostEvents, ...reminderEvents].sort((a, b) => 
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
    }, [calendarEvents, posts, reminders, currentDate]);

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
            const currentDay = dayCounter;
            
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
                            
                            // Check if this is a reminder
                            const isReminder = evt.id.startsWith('reminder-') || (evt as any).reminderType;
                            
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

                            const handleMouseEnter = (e: React.MouseEvent) => {
                                // Only show hover on desktop devices that support hover
                                if (!window.matchMedia('(hover: hover)').matches) {
                                    return;
                                }
                                
                                // Show hover on desktop
                                const rect = e.currentTarget.getBoundingClientRect();
                                const viewportWidth = window.innerWidth;
                                const viewportHeight = window.innerHeight;
                                const previewWidth = 320; // w-80 = 320px
                                const previewHeight = 400; // max height
                                
                                // Determine horizontal position
                                let x: number;
                                if (rect.right + previewWidth + 10 > viewportWidth) {
                                    // Position to the left if not enough space on right
                                    x = rect.left - previewWidth - 10;
                                    // Ensure it doesn't go off-screen on the left
                                    if (x < 10) {
                                        x = 10;
                                    }
                                } else {
                                    x = rect.right + 10;
                                }
                                
                                // Determine vertical position
                                let y = rect.top;
                                // If preview would go off bottom, position it above
                                if (y + previewHeight > viewportHeight - 10) {
                                    y = viewportHeight - previewHeight - 10;
                                }
                                // Ensure it doesn't go off-screen on the top
                                if (y < 10) {
                                    y = 10;
                                }
                                
                                setHoveredEventId(evt.id);
                                setHoverPosition({ x, y });
                            };

                            const handleMouseLeave = (e: React.MouseEvent) => {
                                // Only auto-hide on desktop (not touch devices)
                                if (!window.matchMedia('(hover: hover)').matches) {
                                    return;
                                }
                                
                                // Check if mouse is moving to the preview container
                                const relatedTarget = e.relatedTarget as HTMLElement;
                                if (relatedTarget && relatedTarget.closest('.hover-preview-container')) {
                                    // Mouse is moving to preview, don't close
                                    return;
                                }
                                
                                // Close preview with a small delay to allow smooth movement to preview
                                const timeoutId = setTimeout(() => {
                                    // Verify that we're not hovering over the preview
                                    const previewElement = document.querySelector(`[data-preview-id="${evt.id}"]`);
                                    if (!previewElement || !previewElement.matches(':hover')) {
                                        setHoveredEventId(null);
                                        setHoverPosition(null);
                                    }
                                }, 150);
                                
                                // Store timeout to clear if mouse re-enters
                                (e.currentTarget as any).mouseLeaveTimeout = timeoutId;
                            };

                            const handleTouchStart = (e: React.TouchEvent) => {
                                // Toggle preview on touch devices
                                e.stopPropagation();
                                // Prevent click event from firing immediately
                                const touchTarget = e.currentTarget;
                                
                                if (hoveredEventId === evt.id) {
                                    // Close if already open
                                    setHoveredEventId(null);
                                    setHoverPosition(null);
                                } else {
                                    // Show preview
                                    const rect = touchTarget.getBoundingClientRect();
                                    const viewportWidth = window.innerWidth;
                                    const viewportHeight = window.innerHeight;
                                    const previewWidth = 320;
                                    const previewHeight = 400;
                                    
                                    let x: number;
                                    if (rect.right + previewWidth + 10 > viewportWidth) {
                                        x = rect.left - previewWidth - 10;
                                        if (x < 10) x = 10;
                                    } else {
                                        x = rect.right + 10;
                                    }
                                    
                                    let y = rect.top;
                                    if (y + previewHeight > viewportHeight - 10) {
                                        y = viewportHeight - previewHeight - 10;
                                    }
                                    if (y < 10) y = 10;
                                    
                                    setHoveredEventId(evt.id);
                                    setHoverPosition({ x, y });
                                }
                            };

                            return (
                                <div 
                                    key={evt.id} 
                                    className={`flex flex-col p-2.5 sm:p-2 md:p-2 rounded-lg text-xs sm:text-xs md:text-xs shadow-sm cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all ${colors.bg} ${colors.border} relative min-h-[65px] sm:min-h-[50px]`}
                                    onClick={(e) => {
                                        // On touch devices, if preview is showing, don't open modal (user wants to interact with preview)
                                        // On desktop, always open modal on click
                                        if (hoveredEventId === evt.id && window.matchMedia('(pointer: coarse)').matches) {
                                            // Preview is showing on touch device - don't open modal
                                            return;
                                        }
                                        e.stopPropagation();
                                        handleEventClick();
                                    }}
                                    onMouseEnter={(e) => {
                                        // Clear any pending mouse leave timeout
                                        const timeoutId = (e.currentTarget as any).mouseLeaveTimeout;
                                        if (timeoutId) {
                                            clearTimeout(timeoutId);
                                            (e.currentTarget as any).mouseLeaveTimeout = null;
                                        }
                                        handleMouseEnter(e);
                                    }}
                                    onMouseLeave={handleMouseLeave}
                                    onTouchStart={handleTouchStart}
                                    title={`${evt.title} - ${new Date(evt.date).toLocaleString()}`}
                                    style={{ pointerEvents: 'auto' }}
                                >
                                    <div 
                                        className="flex justify-between items-center mb-1.5 sm:mb-1 gap-1"
                                        style={{ pointerEvents: 'none' }}
                                    >
                                        <span className={`font-bold text-xs sm:text-[10px] md:text-[10px] ${colors.text} whitespace-nowrap`}>
                                            {timeString}
                                        </span>
                                        <div className={`w-2.5 h-2.5 sm:w-2 sm:h-2 rounded-full flex-shrink-0 shadow-sm ${colors.dot}`}></div>
                                    </div>
                                    <div 
                                        className="flex items-center gap-2 min-w-0"
                                        style={{ pointerEvents: 'none' }}
                                    >
                                        {isReminder ? (
                                            <span className="text-sm sm:text-xs">
                                                {(evt as any).reminderType === 'shoot' ? '🎬' : '📤'}
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
                                                {evt.type}
                                            </span>
                                        </div>
                                    )}

                                    {/* Hover Preview - Desktop & Touch Devices */}
                                    {hoveredEventId === evt.id && hoverPosition && (
                                        <div 
                                            data-preview-id={evt.id}
                                            className="hover-preview-container fixed z-[100] w-80 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
                                            style={{
                                                left: `${Math.max(10, Math.min(hoverPosition.x, window.innerWidth - 330))}px`,
                                                top: `${Math.max(10, Math.min(hoverPosition.y, window.innerHeight - 420))}px`,
                                                maxHeight: '400px',
                                                overflowY: 'auto'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.stopPropagation();
                                                // Keep preview open when hovering over it
                                                setHoveredEventId(evt.id);
                                                // Keep the existing position - don't update it
                                            }}
                                            onMouseLeave={(e) => {
                                                // Only close if we're actually leaving the preview (not just moving within it)
                                                const relatedTarget = e.relatedTarget as HTMLElement;
                                                if (!relatedTarget || !relatedTarget.closest('.hover-preview-container')) {
                                                    // Only auto-hide on desktop (not touch devices)
                                                    if (window.matchMedia('(hover: hover)').matches) {
                                                        setHoveredEventId(null);
                                                        setHoverPosition(null);
                                                    }
                                                }
                                            }}
                                            onTouchStart={(e) => {
                                                e.stopPropagation();
                                                // Keep preview open on touch inside
                                            }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                // Prevent click from closing preview or opening modal
                                            }}
                                        >
                                            <div className="p-4 pointer-events-auto">
                                                {/* Header */}
                                                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-200 dark:border-gray-700">
                                                    <div className="p-1.5 bg-primary-100 dark:bg-primary-900/30 rounded">
                                                        {platformIcons[evt.platform]}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-bold text-gray-900 dark:text-white truncate">
                                                            {evt.platform}
                                                        </div>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                                            {new Date(evt.date).toLocaleString([], {
                                                                month: 'short',
                                                                day: 'numeric',
                                                                hour: 'numeric',
                                                                minute: '2-digit',
                                                                hour12: true
                                                            })}
                                                        </div>
                                                    </div>
                                                    <div className={`px-2 py-1 rounded text-[10px] font-medium ${
                                                        evt.status === 'Published' 
                                                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                                            : evt.status === 'Scheduled'
                                                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                                    }`}>
                                                        {evt.status}
                                                    </div>
                                                </div>

                                                {/* Media Preview */}
                                                {(associatedPost?.mediaUrl || ('thumbnail' in evt && evt.thumbnail)) && (
                                                    <div className="mb-3 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                                                        {(associatedPost?.mediaType === 'video' || evt.type === 'Reel') ? (
                                                            <video 
                                                                src={associatedPost?.mediaUrl || ('thumbnail' in evt ? evt.thumbnail : undefined)} 
                                                                className="w-full h-32 object-cover bg-gray-100 dark:bg-gray-900"
                                                                muted
                                                            />
                                                        ) : (
                                                            <img 
                                                                src={associatedPost?.mediaUrl || ('thumbnail' in evt ? evt.thumbnail : undefined)} 
                                                                alt="Post preview" 
                                                                className="w-full h-32 object-cover bg-gray-100 dark:bg-gray-900" 
                                                            />
                                                        )}
                                                    </div>
                                                )}

                                                {/* Caption */}
                                                {associatedPost?.content ? (
                                                    <div className="mb-3">
                                                        <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Caption:</div>
                                                        <p className="text-xs text-gray-900 dark:text-white line-clamp-4 bg-gray-50 dark:bg-gray-700/50 p-2 rounded">
                                                            {associatedPost.content}
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <div className="mb-3">
                                                        <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Title:</div>
                                                        <p className="text-xs text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700/50 p-2 rounded">
                                                            {evt.title}
                                                        </p>
                                                    </div>
                                                )}

                                                {/* Hashtags */}
                                                {associatedPost?.content && extractHashtags(associatedPost.content).length > 0 && (
                                                    <div className="mb-3">
                                                        <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Hashtags:</div>
                                                        <div className="flex flex-wrap gap-1">
                                                            {extractHashtags(associatedPost.content).slice(0, 5).map((tag, idx) => (
                                                                <span key={idx} className="px-2 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded text-[10px]">
                                                                    {tag}
                                                                </span>
                                                            ))}
                                                            {extractHashtags(associatedPost.content).length > 5 && (
                                                                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                                                                    +{extractHashtags(associatedPost.content).length - 5} more
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Platforms */}
                                                {associatedPost?.platforms && associatedPost.platforms.length > 1 && (
                                                    <div>
                                                        <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Platforms:</div>
                                                        <div className="flex flex-wrap gap-1">
                                                            {associatedPost.platforms.map((platform, idx) => (
                                                                <div key={idx} className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px]">
                                                                    <span className="w-3 h-3">{platformIcons[platform]}</span>
                                                                    <span className="text-gray-700 dark:text-gray-300">{platform}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Click hint */}
                                                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 text-[10px] text-gray-500 dark:text-gray-400 text-center">
                                                    Click to edit or view full details
                                                </div>
                                            </div>
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
                        onClick={(e) => { e.stopPropagation(); setActivePage('compose'); }} 
                        className="absolute bottom-3 right-3 p-2 bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:from-primary-600 hover:to-primary-700 rounded-full transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 z-10 shadow-lg hover:shadow-xl hover:scale-110"
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
                } as Post & { postGoal: string; postTone: string } : null,
            });

            setIsEditing(false);
            showToast('Post updated successfully!', 'success');
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

    // Handle delete post
    const handleDeletePost = async () => {
        if (!selectedEvent || !user) return;
        
        if (!window.confirm('Are you sure you want to delete this scheduled post?')) {
            return;
        }

        try {
            const postId = selectedEvent.post?.id;
            
            // Delete the post from Firestore
            if (postId) {
                await deletePost(postId);
            }
            
            // Also remove any calendar events tied to this post so Dashboard/upcoming stays in sync
            if (user && postId) {
                try {
                    const matchingEvents = calendarEvents.filter(evt => evt.id.includes(postId));
                    for (const evt of matchingEvents) {
                        await deleteDoc(doc(db, 'users', user.id, 'calendar_events', evt.id));
                    }
                } catch (calendarDeleteError) {
                    console.error('Failed to delete related calendar events:', calendarDeleteError);
                }
            }

            // Delete the calendar event from Firestore (if it exists as a separate document)
            try {
                const eventDocRef = doc(db, 'users', user.id, 'calendar_events', selectedEvent.event.id);
                await deleteDoc(eventDocRef);
            } catch (eventError) {
                // Calendar event might not exist as separate document (it's derived from posts)
                // This is fine, just log it
                console.log('Calendar event not found as separate document (expected if using post-based events)');
            }

            // Close the modal
            setSelectedEvent(null);
            
            // Show success message
            showToast('Post deleted successfully!', 'success');
            
            // Note: The UI will automatically update because:
            // 1. deletePost updates the posts state in DataContext
            // 2. filteredEvents is derived from posts, so it will automatically refresh
        } catch (error) {
            console.error('Failed to delete post:', error);
            showToast('Failed to delete post. Please try again.', 'error');
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
                description: reminderDescription.trim() || undefined,
                date: dateTime.toISOString(),
                reminderType: reminderType,
                reminderTime: reminderTime || undefined,
                createdAt: selectedReminder?.createdAt || new Date().toISOString(),
                userId: user.id,
            };

            await setDoc(doc(db, 'users', user.id, 'calendar_events', reminderId), reminderData);

            showToast(selectedReminder ? 'Reminder updated!' : 'Reminder created!', 'success');
            resetReminderForm();
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
            setEditDate('');
            setEditTime('');
            setEditGoal('engagement');
            setEditTone('friendly');
            setRegeneratePlatform(null);
            setRegenerateGoal('engagement');
            setRegenerateTone('friendly');
        }
    }, [selectedEvent]);

    // Close hover preview when clicking outside (for touch devices)
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent | TouchEvent) => {
            if (hoveredEventId && !(e.target as Element).closest('.hover-preview-container')) {
                setHoveredEventId(null);
                setHoverPosition(null);
            }
        };
        if (hoveredEventId) {
            document.addEventListener('click', handleClickOutside);
            document.addEventListener('touchstart', handleClickOutside);
        }
        return () => {
            document.removeEventListener('click', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [hoveredEventId]);

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
                                        {platformIcons[selectedEvent.event.platform]}
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">Scheduled Post Preview</h3>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">{selectedEvent.event.platform} • {selectedEvent.event.type}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {!isEditing && (
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
                                                <button
                                                    onClick={async () => {
                                                        if (!selectedEvent.post || !user) return;
                                                        try {
                                                            const updatedPost: Post = {
                                                                ...selectedEvent.post,
                                                                status: 'Published',
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

                            {/* Date & Time - Editable */}
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

                            {/* Media Preview */}
                            {(selectedEvent.post?.mediaUrl || selectedEvent.event.thumbnail) && (
                                <div className="mb-4 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                                    {(selectedEvent.post?.mediaType === 'video' || selectedEvent.event.type === 'Reel') ? (
                                        <video src={selectedEvent.post?.mediaUrl || selectedEvent.event.thumbnail} controls className="w-full max-h-96 object-contain bg-gray-100 dark:bg-gray-900" />
                                    ) : (
                                        <img src={selectedEvent.post?.mediaUrl || selectedEvent.event.thumbnail} alt="Post preview" className="w-full max-h-96 object-contain bg-gray-100 dark:bg-gray-900" />
                                    )}
                                </div>
                            )}

                            {/* Caption */}
                            {selectedEvent.post?.content && (
                                <div className="mb-4">
                                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Caption:</h4>
                                    <p className="text-gray-900 dark:text-white whitespace-pre-wrap bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                                        {selectedEvent.post.content}
                                    </p>
                                </div>
                            )}

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
                            <div className="mb-4">
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Platform:</h4>
                                {isEditing ? (
                                    <div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Select one platform for this post</p>
                                        <div className="flex flex-wrap gap-2">
                                            {(Object.keys(platformIcons) as Platform[])
                                                .filter((platform): platform is Platform => platform !== 'OnlyFans' as any)
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
                                                <option value="sexy-bold">Sexy / Bold</option>
                                                <option value="sexy-explicit">Sexy / Explicit</option>
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
                                        Delete Post
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
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Content Calendar</h1>
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
                    </div>
                    <button 
                        onClick={() => setIsCreatingReminder(true)}
                        className="px-5 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-semibold flex items-center gap-2 shadow-md transition-all"
                    >
                         <PlusIcon className="w-5 h-5" />
                         Add Reminder
                    </button>
                    <button 
                        onClick={() => setActivePage('compose')} 
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
                                        document.body.removeChild(a);
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
                                                document.body.removeChild(a);
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
