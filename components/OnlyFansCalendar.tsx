import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAppContext } from './AppContext';
import { Post } from '../types';
import { db } from '../firebaseConfig';
import { collection, query, orderBy, onSnapshot, doc, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { PlusIcon, TrashIcon, XMarkIcon, CheckCircleIcon, DownloadIcon, SparklesIcon, CopyIcon } from './icons/UIIcons';
import { generateCaptions } from '../src/services/geminiService';
import { FanSelector } from './FanSelector';

export interface OnlyFansCalendarEvent {
    id: string;
    title: string;
    date: string; // ISO string
    reminderType: 'post' | 'shoot'; // post = upload reminder, shoot = filming reminder
    contentType: 'free' | 'paid' | 'custom'; // free, paid, or custom content
    description?: string;
    reminderTime?: string; // Time for the reminder (e.g., "8:00 PM")
    createdAt: string;
    userId: string;
    customStatus?: 'ordered' | 'in-progress' | 'delivered' | 'cancelled'; // Status for custom content
    fanId?: string; // ID of the fan this custom is for
    fanName?: string; // Name of the fan this custom is for
}

// Combined event type for display (posts or reminders)
interface CombinedEvent {
    id: string;
    title: string;
    date: string;
    type: 'post' | 'reminder';
    status?: 'Draft' | 'Scheduled' | 'Published';
    reminderType?: 'post' | 'shoot';
    contentType?: 'free' | 'paid' | 'custom';
    post?: Post | null;
    reminder?: OnlyFansCalendarEvent | null;
    thumbnail?: string;
    customStatus?: 'ordered' | 'in-progress' | 'delivered' | 'cancelled';
}

const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface OnlyFansCalendarProps {
    onNavigateToContentBrain?: () => void;
}

export const OnlyFansCalendar: React.FC<OnlyFansCalendarProps> = ({ onNavigateToContentBrain }) => {
    const { user, showToast, posts, updatePost, deletePost } = useAppContext();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [reminders, setReminders] = useState<OnlyFansCalendarEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedEvent, setSelectedEvent] = useState<CombinedEvent | null>(null);
    const [isCreatingReminder, setIsCreatingReminder] = useState(false);
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    
    // Post editing state
    const [isEditing, setIsEditing] = useState(false);
    const [editDate, setEditDate] = useState('');
    const [editTime, setEditTime] = useState('');
    const [regenerateGoal, setRegenerateGoal] = useState<string>('engagement');
    const [regenerateTone, setRegenerateTone] = useState<string>('friendly');
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [exportPreview, setExportPreview] = useState<{ post: Post; event: CombinedEvent } | null>(null);
    
    // Hover preview state
    
    // Reminder form state
    const [eventTitle, setEventTitle] = useState('');
    const [eventDescription, setEventDescription] = useState('');
    const [eventReminderType, setEventReminderType] = useState<'post' | 'shoot'>('post');
    const [eventContentType, setEventContentType] = useState<'free' | 'paid' | 'custom'>('free');
    const [eventCustomStatus, setEventCustomStatus] = useState<'ordered' | 'in-progress' | 'delivered' | 'cancelled'>('ordered');
    const [eventDate, setEventDate] = useState('');
    const [eventTime, setEventTime] = useState('');
    const [selectedFanId, setSelectedFanId] = useState<string | null>(null);
    const [selectedFanName, setSelectedFanName] = useState<string | null>(null);

    // Load reminders from Firestore
    useEffect(() => {
        if (!user) return;

        const eventsRef = collection(db, 'users', user.id, 'onlyfans_calendar_events');
        const q = query(eventsRef, orderBy('date', 'asc'));

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const loadedEvents: OnlyFansCalendarEvent[] = snapshot.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                } as OnlyFansCalendarEvent));
                setReminders(loadedEvents);
                if (isLoading) setIsLoading(false);
            },
            (error) => {
                console.error('Error loading OnlyFans calendar events:', error);
                showToast('Failed to load calendar events', 'error');
                if (isLoading) setIsLoading(false);
            }
        );

        return () => unsubscribe();
    }, [user, showToast, isLoading]);

    // Combine posts and reminders into a single events array
    const combinedEvents = useMemo(() => {
        const events: CombinedEvent[] = [];
        
        // Add posts with OnlyFans platform
        if (posts && Array.isArray(posts)) {
            const onlyFansPosts = posts.filter(p => 
                p.scheduledDate && 
                (p.status === 'Scheduled' || p.status === 'Published' || p.status === 'Draft') &&
                p.platforms && (p.platforms as any[]).includes('OnlyFans')
            );
            
            onlyFansPosts.forEach(post => {
                // Get preview URL - prefer mediaUrl, fallback to mediaUrls array
                let previewUrl = post.mediaUrl || (Array.isArray(post.mediaUrls) ? post.mediaUrls[0] : undefined);
                
                // Filter out blob URLs (they expire) - only use Firebase Storage URLs or HTTP/HTTPS URLs
                if (previewUrl && (previewUrl.startsWith('blob:') || previewUrl.startsWith('data:'))) {
                    // Blob URLs expire, so don't use them for thumbnails
                    // Try to get a Firebase Storage URL from the post data if available
                    previewUrl = undefined;
                }
                
                // For videos, check if there's a thumbnail URL, otherwise use the video URL itself
                // Videos can show their first frame as a thumbnail
                const isVideo = post.mediaType === 'video';
                const thumbnailUrl = isVideo 
                    ? ((post as any).thumbnailUrl || (post as any).posterUrl || previewUrl) 
                    : previewUrl;
                
                events.push({
                    id: `post-${post.id}`,
                    title: post.content?.substring(0, 30) + '...' || 'Drop',
                    date: post.scheduledDate || new Date().toISOString(),
                    type: 'post',
                    status: post.status as 'Draft' | 'Scheduled' | 'Published',
                    post: post,
                    thumbnail: thumbnailUrl, // Only set if it's a valid permanent URL
                    contentType: (post as any).contentType,
                });
            });
        }
        
        // Add reminders
        reminders.forEach(reminder => {
            events.push({
                id: `reminder-${reminder.id}`,
                title: reminder.title,
                date: reminder.date,
                type: 'reminder',
                reminderType: reminder.reminderType,
                contentType: reminder.contentType,
                customStatus: reminder.customStatus,
                reminder: reminder,
            });
        });
        
        // Deduplicate by id (prevent double-render when posts/reminders update)
        const uniqueById = events.reduce<Record<string, CombinedEvent>>((acc, evt) => {
            if (!acc[evt.id]) {
                acc[evt.id] = evt;
            }
            return acc;
        }, {});
        
        // Sort by date
        return Object.values(uniqueById).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [posts, reminders]);

    // Calendar grid calculations
    const calendarData = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        const weeks: Array<Array<Date | null>> = [];
        let currentWeek: Array<Date | null> = [];

        // Add empty cells for days before month starts
        for (let i = 0; i < startingDayOfWeek; i++) {
            currentWeek.push(null);
        }

        // Add days of the month
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            currentWeek.push(date);
            
            if (currentWeek.length === 7) {
                weeks.push(currentWeek);
                currentWeek = [];
            }
        }

        // Add empty cells for remaining days in last week
        while (currentWeek.length < 7 && currentWeek.length > 0) {
            currentWeek.push(null);
        }
        if (currentWeek.length > 0) {
            weeks.push(currentWeek);
        }

        return weeks;
    }, [currentDate]);

    // Get events for a specific date
    const getEventsForDate = (date: Date | null): CombinedEvent[] => {
        if (!date) return [];
        const dateStr = date.toISOString().split('T')[0];
        return combinedEvents.filter(evt => {
            const eventDateStr = new Date(evt.date).toISOString().split('T')[0];
            return eventDateStr === dateStr;
        });
    };

    // Extract hashtags from post content
    const extractHashtags = (content: string): string[] => {
        const hashtagRegex = /#\w+/g;
        return content.match(hashtagRegex) || [];
    };

    // Navigate months
    const goToPreviousMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const goToNextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    const goToToday = () => {
        setCurrentDate(new Date());
    };

    // Handle date click to create reminder
    const handleDateClick = (date: Date) => {
        setSelectedDate(date);
        const dateStr = date.toISOString().split('T')[0];
        setEventDate(dateStr);
        setEventTime('20:00'); // Default to 8 PM
        setIsCreatingReminder(true);
        setSelectedEvent(null);
    };

    // Handle event click (post or reminder)
    const handleEventClick = (event: CombinedEvent) => {
        if (event.type === 'reminder') {
            // Open reminder edit modal
            const reminder = event.reminder!;
            setSelectedEvent(event);
            setEventTitle(reminder.title);
            setEventDescription(reminder.description || '');
            setEventReminderType(reminder.reminderType);
            setEventContentType(reminder.contentType);
            setEventCustomStatus(reminder.customStatus || 'ordered');
            setEventDate(new Date(reminder.date).toISOString().split('T')[0]);
            setEventTime(reminder.reminderTime || '20:00');
            setSelectedFanId(reminder.fanId || null);
            setSelectedFanName(reminder.fanName || null);
            setIsCreatingReminder(true);
        } else {
            // Open post modal
            const eventDate = new Date(event.date);
            const dateStr = eventDate.toISOString().split('T')[0];
            const timeStr = eventDate.toTimeString().slice(0, 5);
            
            setEditDate(dateStr);
            setEditTime(timeStr);
            setIsEditing(false);
            setIsRegenerating(false);
            
            // Initialize goal and tone from post
            const post = event.post!;
            if ((post as any)?.postGoal) {
                setRegenerateGoal((post as any).postGoal);
            } else {
                setRegenerateGoal('engagement');
            }
            if ((post as any)?.postTone) {
                setRegenerateTone((post as any).postTone);
            } else {
                setRegenerateTone('friendly');
            }
            
            setSelectedEvent(event);
        }
    };

    // Save reminder
    const handleSaveReminder = async () => {
        if (!user || !eventTitle.trim() || !eventDate) {
            showToast('Please fill in all required fields', 'error');
            return;
        }

        try {
            const reminderId = selectedEvent?.reminder?.id || `evt-${Date.now()}`;
            const dateTime = new Date(`${eventDate}T${eventTime || '12:00'}`);
            
            const eventData: Omit<OnlyFansCalendarEvent, 'id'> = {
                title: eventTitle.trim(),
                description: eventDescription.trim() || undefined,
                date: dateTime.toISOString(),
                reminderType: eventReminderType,
                contentType: eventContentType,
                reminderTime: eventTime || undefined,
                createdAt: selectedEvent?.reminder?.createdAt || new Date().toISOString(),
                userId: user.id,
                ...(eventContentType === 'custom' ? { customStatus: eventCustomStatus } : {}),
                ...(selectedFanId ? { fanId: selectedFanId, fanName: selectedFanName ?? undefined } : {}),
            };

            await setDoc(doc(db, 'users', user.id, 'onlyfans_calendar_events', reminderId), eventData);

            showToast(selectedEvent?.reminder ? 'Reminder updated!' : 'Reminder created!', 'success');
            resetReminderForm();
        } catch (error) {
            console.error('Error saving reminder:', error);
            showToast('Failed to save reminder', 'error');
        }
    };

    // Delete reminder
    const handleDeleteReminder = async (reminderId: string) => {
        if (!user) return;
        
        if (!confirm('Are you sure you want to delete this reminder?')) {
            return;
        }

        try {
            await deleteDoc(doc(db, 'users', user.id, 'onlyfans_calendar_events', reminderId));
            showToast('Reminder deleted', 'success');
            setSelectedEvent(null);
            resetReminderForm();
        } catch (error) {
            console.error('Error deleting reminder:', error);
            showToast('Failed to delete reminder', 'error');
        }
    };

    // Reset reminder form
    const resetReminderForm = () => {
        setIsCreatingReminder(false);
        setSelectedEvent(null);
        setSelectedDate(null);
        setSelectedFanId(null);
        setSelectedFanName(null);
        setEventTitle('');
        setEventDescription('');
        setEventReminderType('post');
        setEventContentType('free');
        setEventCustomStatus('ordered');
        setEventDate('');
        setEventTime('');
    };

    // Handle save post edits
    const handleSaveEdit = async () => {
        if (!selectedEvent || !user || !selectedEvent.post) return;

        if (!editDate || !editTime) {
            showToast('Please select both date and time.', 'error');
            return;
        }

        setIsSaving(true);
        try {
            // Combine date and time
            const newDateTime = new Date(`${editDate}T${editTime}`);
            const newDateTimeISO = newDateTime.toISOString();

            // Update Post
            const updatedPost: Post = {
                ...selectedEvent.post,
                scheduledDate: newDateTimeISO,
                platforms: ['OnlyFans' as any], // Keep OnlyFans platform
                postGoal: regenerateGoal,
                postTone: regenerateTone,
            } as Post & { postGoal: string; postTone: string };
            await updatePost(updatedPost);

            // Update local state
            setSelectedEvent({
                ...selectedEvent,
                date: newDateTimeISO,
                post: updatedPost,
            });

            setIsEditing(false);
            showToast('Drop updated!', 'success');
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

        setIsRegenerating(true);
        try {
            // Generate new captions optimized for OnlyFans
            const captions = await generateCaptions({
                mediaUrl: selectedEvent.post.mediaUrl || null,
                goal: regenerateGoal,
                tone: regenerateTone,
                promptText: selectedEvent.post.content || null,
                platforms: ['OnlyFans' as any],
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

            showToast('Captions regenerated successfully!', 'success');
        } catch (error) {
            console.error('Failed to regenerate captions:', error);
            showToast('Failed to regenerate captions. Please try again.', 'error');
        } finally {
            setIsRegenerating(false);
        }
    };

    // Handle delete post
    const handleDeletePost = async () => {
        if (!selectedEvent || !user || !selectedEvent.post) return;
        
        if (!window.confirm('Are you sure you want to delete this scheduled post?')) {
            return;
        }

        try {
            const postId = selectedEvent.post.id;
            
            // Delete the post from Firestore
            if (postId) {
                await deletePost(postId);
            }

            // Close the modal
            setSelectedEvent(null);
            
            showToast('Drop deleted!', 'success');
        } catch (error) {
            console.error('Failed to delete post:', error);
            showToast('Failed to delete post. Please try again.', 'error');
        }
    };

    // Handle mark as posted
    const handleMarkAsPosted = async () => {
        if (!selectedEvent || !selectedEvent.post || !user) return;
        
        try {
            const updatedPost: Post = {
                ...selectedEvent.post,
                status: 'Published',
            };
            await updatePost(updatedPost);
            
            setSelectedEvent({
                ...selectedEvent,
                post: updatedPost,
                status: 'Published',
            });
            showToast('Marked as Published!', 'success');
        } catch (error) {
            console.error('Failed to mark as published:', error);
            showToast('Failed to mark as published', 'error');
        }
    };

    // Reset edit state when modal closes
    useEffect(() => {
        if (!selectedEvent || selectedEvent.type === 'reminder') {
            setIsEditing(false);
            setIsRegenerating(false);
            setEditDate('');
            setEditTime('');
            setRegenerateGoal('engagement');
            setRegenerateTone('friendly');
        }
    }, [selectedEvent]);


    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-500 dark:text-gray-400">Loading calendar...</div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Weekly Money Calendar</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Plan drops, sessions, promos, and reschedule fast. Manual posting only.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={goToToday}
                        className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                    >
                        Today
                    </button>
                    {onNavigateToContentBrain && (
                        <button
                            onClick={onNavigateToContentBrain}
                            className="px-4 py-2 text-sm bg-gradient-to-r from-primary-600 to-primary-500 text-white rounded-md hover:from-primary-700 hover:to-primary-600 flex items-center gap-2 font-medium shadow-md transition-all"
                        >
                            <PlusIcon className="w-4 h-4" />
                            Add drop
                        </button>
                    )}
                    <button
                        onClick={() => setIsCreatingReminder(true)}
                        className="px-4 py-2 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center gap-2"
                    >
                        <PlusIcon className="w-4 h-4" />
                        Add reminder
                    </button>
                </div>
            </div>

            {/* Important Notice */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Reminder:</strong> These are manual reminders only. This studio does not post to your accounts. 
                    You must manually upload content to OnlyFans, Fansly, or Fanvue.
                </p>
            </div>

            {/* Calendar Navigation */}
            <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <button
                    onClick={goToPreviousMonth}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                >
                    ←
                </button>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                    {months[currentDate.getMonth()]} {currentDate.getFullYear()}
                </h3>
                <button
                    onClick={goToNextMonth}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                >
                    →
                </button>
            </div>

            {/* Color Legend */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <div className="flex flex-wrap items-center gap-4 text-sm">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">Status:</span>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full bg-green-500 dark:bg-green-400"></div>
                        <span className="text-gray-700 dark:text-gray-300">Published</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full bg-blue-500 dark:bg-blue-400"></div>
                        <span className="text-gray-700 dark:text-gray-300">Scheduled</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full bg-gray-400 dark:bg-gray-500"></div>
                        <span className="text-gray-700 dark:text-gray-300">Draft</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full bg-orange-500 dark:bg-orange-400"></div>
                        <span className="text-gray-700 dark:text-gray-300">Reminder</span>
                    </div>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                {/* Day headers */}
                <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
                    {daysOfWeek.map(day => (
                        <div key={day} className="p-3 text-center text-sm font-semibold text-gray-700 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700 last:border-r-0">
                            {day}
                        </div>
                    ))}
                </div>

                {/* Calendar days */}
                {calendarData.map((week, weekIdx) => (
                    <div key={weekIdx} className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                        {week.map((date, dayIdx) => {
                            const dayEvents = getEventsForDate(date);
                            const isToday = date && 
                                date.toDateString() === new Date().toDateString();
                            const isSelected = selectedDate && date &&
                                date.toDateString() === selectedDate.toDateString();

                            return (
                                <div
                                    key={dayIdx}
                                    onClick={() => date && handleDateClick(date)}
                                    className={`relative min-h-[120px] sm:min-h-24 p-2 border-r border-gray-200 dark:border-gray-700 last:border-r-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                                        !date ? 'bg-gray-50 dark:bg-gray-900/50' : ''
                                    } ${isToday ? 'bg-primary-50 dark:bg-primary-900/20' : ''} ${
                                        isSelected ? 'ring-2 ring-primary-500' : ''
                                    }`}
                                >
                                    {date && (
                                        <>
                                            <div className={`text-sm font-medium mb-1 ${
                                                isToday ? 'text-primary-600 dark:text-primary-400' : 
                                                'text-gray-900 dark:text-white'
                                            }`}>
                                                {date.getDate()}
                                            </div>
                                            <div className="space-y-1">
                                                {dayEvents.slice(0, 3).map(event => {
                                                    const statusColors = {
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
                                                        Draft: {
                                                            bg: 'bg-gray-100 dark:bg-gray-700/50',
                                                            border: 'border-l-4 border-gray-400 dark:border-gray-600',
                                                            dot: 'bg-gray-400 dark:bg-gray-500',
                                                            text: 'text-gray-700 dark:text-gray-300'
                                                        }
                                                    };
                                                    
                                                    // Determine colors based on event type
                                                    let colors;
                                                    if (event.type === 'post' && event.status) {
                                                        colors = statusColors[event.status] || statusColors.Draft;
                                                    } else if (event.type === 'reminder') {
                                                        // Custom content reminders use status-based colors
                                                        if (event.contentType === 'custom' && event.customStatus) {
                                                            // Use distinct colors for custom reminders (avoid post colors)
                                                            const customStatusColors = {
                                                                'ordered': {
                                                                    bg: 'bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/25 dark:to-purple-900/25',
                                                                    border: 'border-l-4 border-violet-500 dark:border-violet-400',
                                                                    dot: 'bg-violet-500 dark:bg-violet-400',
                                                                    text: 'text-violet-700 dark:text-violet-300'
                                                                },
                                                                'in-progress': {
                                                                    bg: 'bg-gradient-to-r from-cyan-50 to-teal-50 dark:from-cyan-900/25 dark:to-teal-900/25',
                                                                    border: 'border-l-4 border-teal-500 dark:border-teal-400',
                                                                    dot: 'bg-teal-500 dark:bg-teal-400',
                                                                    text: 'text-teal-700 dark:text-teal-300'
                                                                },
                                                                'delivered': {
                                                                    bg: 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/25 dark:to-orange-900/25',
                                                                    border: 'border-l-4 border-amber-500 dark:border-amber-400',
                                                                    dot: 'bg-amber-500 dark:bg-amber-400',
                                                                    text: 'text-amber-700 dark:text-amber-300'
                                                                },
                                                                'cancelled': {
                                                                    bg: 'bg-gradient-to-r from-rose-50 to-pink-50 dark:from-rose-900/25 dark:to-pink-900/25',
                                                                    border: 'border-l-4 border-rose-500 dark:border-rose-400',
                                                                    dot: 'bg-rose-500 dark:bg-rose-400',
                                                                    text: 'text-rose-700 dark:text-rose-300'
                                                                }
                                                            };
                                                            colors = customStatusColors[event.customStatus] || customStatusColors['ordered'];
                                                        } else {
                                                            // Regular reminders use orange/amber color
                                                            colors = {
                                                                bg: 'bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/30 dark:to-amber-900/30',
                                                                border: 'border-l-4 border-orange-500 dark:border-orange-400',
                                                                dot: 'bg-orange-500 dark:bg-orange-400',
                                                                text: 'text-orange-700 dark:text-orange-300'
                                                            };
                                                        }
                                                    } else {
                                                        colors = statusColors.Draft;
                                                    }


                                                    return (
                                                        <div key={event.id}>
                                                            <div 
                                                                className={`flex flex-col p-2 sm:p-1.5 md:p-1.5 rounded-lg text-xs sm:text-[10px] md:text-[10px] shadow-sm cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all ${colors.bg} ${colors.border} relative min-h-[50px] sm:min-h-[40px]`}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleEventClick(event);
                                                                }}
                                                                title={event.title}
                                                                style={{ pointerEvents: 'auto' }}
                                                            >
                                                                <div 
                                                                    className="flex justify-between items-center mb-1 sm:mb-0.5 gap-1"
                                                                    style={{ pointerEvents: 'none' }}
                                                                >
                                                                    <span className={`font-bold text-[10px] sm:text-[9px] md:text-[9px] ${colors.text} whitespace-nowrap`}>
                                                                        {new Date(event.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}
                                                                    </span>
                                                                    <div className={`w-2 h-2 sm:w-1.5 sm:h-1.5 rounded-full flex-shrink-0 shadow-sm ${colors.dot}`}></div>
                                                                </div>
                                                                {event.type === 'post' && event.thumbnail && (
                                                                    <div className="mb-1 relative w-full h-8">
                                                                        {/* Video preview - show image if thumbnail/poster exists, otherwise show video element */}
                                                                        {event.post?.mediaType === 'video' ? (
                                                                            (event.post as any)?.thumbnailUrl || (event.post as any)?.posterUrl ? (
                                                                                <img
                                                                                    src={(event.post as any).thumbnailUrl || (event.post as any).posterUrl}
                                                                                    alt="Video preview"
                                                                                    className="w-full h-8 rounded-md object-cover border border-gray-200 dark:border-gray-700"
                                                                                    onError={(e) => {
                                                                                        // Hide image on error and fall back to video element
                                                                                        const img = e.target as HTMLImageElement;
                                                                                        img.style.display = 'none';
                                                                                        // Try to show video element instead
                                                                                        const videoElement = img.parentElement?.querySelector('video') as HTMLVideoElement;
                                                                                        if (videoElement && event.thumbnail) {
                                                                                            videoElement.style.display = 'block';
                                                                                        }
                                                                                    }}
                                                                                    loading="lazy"
                                                                                />
                                                                            ) : event.thumbnail ? (
                                                                                <video
                                                                                    src={event.thumbnail}
                                                                                    className="w-full h-8 rounded-md object-cover border border-gray-200 dark:border-gray-700"
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
                                                                                            console.warn('Failed to load calendar video thumbnail:', event.thumbnail);
                                                                                        }
                                                                                    }}
                                                                                    style={{ pointerEvents: 'none' }}
                                                                                />
                                                                            ) : null
                                                                        ) : (
                                                                            <img
                                                                                src={event.thumbnail}
                                                                                alt="Preview"
                                                                                className="w-full h-8 rounded-md object-cover border border-gray-200 dark:border-gray-700"
                                                                                onError={(e) => {
                                                                                    // Hide image on error (e.g., expired blob URL, CORS issue, invalid URL, etc.)
                                                                                    const img = e.target as HTMLImageElement;
                                                                                    img.style.display = 'none';
                                                                                    // Optionally log for debugging in production
                                                                                    if (process.env.NODE_ENV === 'development') {
                                                                                        console.warn('Failed to load calendar thumbnail:', event.thumbnail);
                                                                                    }
                                                                                }}
                                                                                loading="lazy"
                                                                            />
                                                                        )}
                                                                        {/* Video play icon overlay */}
                                                                        {event.post?.mediaType === 'video' && (
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
                                                                    {event.type === 'reminder' && (
                                                                        <span className="text-sm sm:text-xs">
                                                                            {event.reminderType === 'shoot' ? '🎬' : '📤'}
                                                                        </span>
                                                                    )}
                                                                    <span className={`truncate font-semibold text-sm sm:text-[11px] md:text-[11px] ${colors.text}`} title={event.title}>
                                                                        {event.title}
                                                                    </span>
                                                                    {event.type === 'post' && event.status && (
                                                                        <span className={`text-[9px] sm:text-[8px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${
                                                                            event.status === 'Published' 
                                                                                ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                                                                                : event.status === 'Scheduled'
                                                                                ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                                                                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                                                        }`}>
                                                                            {event.status}
                                                                        </span>
                                                                    )}
                                                                    {event.type === 'post' && event.contentType && (
                                                                        <span className="text-[9px] sm:text-[8px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 uppercase">
                                                                            {event.contentType}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {event.type === 'post' && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleEventClick(event);
                                                                        setIsEditing(true);
                                                                    }}
                                                                    className="absolute top-2 right-2 px-2 py-0.5 text-[9px] sm:text-[8px] rounded-full bg-white/90 dark:bg-gray-800/80 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 hover:bg-white"
                                                                >
                                                                    Edit
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                                {dayEvents.length > 3 && (
                                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                                        +{dayEvents.length - 3} more
                                                    </div>
                                                )}
                                            </div>

                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedDate(date);
                                                    setIsCreatingReminder(true);
                                                }}
                                                className="absolute bottom-2 right-2 p-2 bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:from-primary-600 hover:to-primary-700 rounded-full transition-all shadow-md opacity-0 hover:opacity-100 focus:opacity-100"
                                                title="Add Reminder"
                                                aria-label="Add reminder"
                                            >
                                                <PlusIcon className="w-4 h-4" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>

            {/* Post Modal */}
            {selectedEvent && selectedEvent.type === 'post' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4" onClick={() => setSelectedEvent(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                                        <span className="text-2xl">🔞</span>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Scheduled Drop Preview</h3>
                                            {selectedEvent.status && (
                                                <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                                                    selectedEvent.status === 'Published' 
                                                        ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                                                        : selectedEvent.status === 'Scheduled'
                                                        ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                                }`}>
                                                    {selectedEvent.status}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">OnlyFans</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {!isEditing && (
                                        <>
                                            <button
                                                onClick={() => {
                                                    if (!selectedEvent.post) return;
                                                    setExportPreview({ post: selectedEvent.post, event: selectedEvent });
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
                                                    onClick={handleMarkAsPosted}
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
                                            {new Date(selectedEvent.date).toLocaleString([], {
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
                            {selectedEvent.post?.mediaUrl && (
                                <div className="mb-4 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                                    {selectedEvent.post.mediaType === 'video' ? (
                                        <video src={selectedEvent.post.mediaUrl} controls className="w-full max-h-96 object-contain bg-gray-100 dark:bg-gray-900" />
                                    ) : (
                                        <img src={selectedEvent.post.mediaUrl} alt="Post preview" className="w-full max-h-96 object-contain bg-gray-100 dark:bg-gray-900" />
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

                            {/* Regenerate Captions Section - Only in Edit Mode */}
                            {isEditing && (
                                <div className="mb-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                                    <div className="space-y-4">
                                        <h4 className="text-sm font-semibold text-purple-700 dark:text-purple-300">Regenerate Captions</h4>
                                        
                                        <div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                                Captions will be optimized for OnlyFans. Use the goal and tone settings below to customize the caption style.
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
                                                Delete Drop
                                    </button>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => {
                                                setIsEditing(false);
                                                setIsRegenerating(false);
                                                const eventDate = new Date(selectedEvent.date);
                                                const dateStr = eventDate.toISOString().split('T')[0];
                                                const timeStr = eventDate.toTimeString().slice(0, 5);
                                                setEditDate(dateStr);
                                                setEditTime(timeStr);
                                                if ((selectedEvent.post as any)?.postGoal) {
                                                    setRegenerateGoal((selectedEvent.post as any).postGoal);
                                                } else {
                                                    setRegenerateGoal('engagement');
                                                }
                                                if ((selectedEvent.post as any)?.postTone) {
                                                    setRegenerateTone((selectedEvent.post as any).postTone);
                                                } else {
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

            {/* Reminder Modal */}
            {isCreatingReminder && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                {selectedEvent?.reminder ? 'Edit Reminder' : 'Create Reminder'}
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
                                    Reminder *
                                </label>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setEventReminderType('post')}
                                        className={`flex-1 px-4 py-2 rounded-md border-2 transition-colors ${
                                            eventReminderType === 'post'
                                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                                                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                                        }`}
                                    >
                                        📤 Drop Reminder
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEventReminderType('shoot')}
                                        className={`flex-1 px-4 py-2 rounded-md border-2 transition-colors ${
                                            eventReminderType === 'shoot'
                                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                                                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                                        }`}
                                    >
                                        🎬 Shoot Reminder
                                    </button>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    {eventReminderType === 'post' 
                                        ? 'Reminder to upload content to OnlyFans'
                                        : 'Reminder to film/create content'}
                                </p>
                            </div>

                            {/* Content Type */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Drop Type *
                                </label>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setEventContentType('free')}
                                        className={`flex-1 px-4 py-2 rounded-md border-2 transition-colors ${
                                            eventContentType === 'free'
                                                ? 'border-green-500 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                                        }`}
                                    >
                                        Teaser
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEventContentType('paid')}
                                        className={`flex-1 px-4 py-2 rounded-md border-2 transition-colors ${
                                            eventContentType === 'paid'
                                                ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                                                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                                        }`}
                                    >
                                        PPV Drop
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEventContentType('custom')}
                                        className={`flex-1 px-4 py-2 rounded-md border-2 transition-colors ${
                                            eventContentType === 'custom'
                                                ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                                                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                                        }`}
                                    >
                                        Bundle/Custom
                                    </button>
                                </div>
                            </div>

                            {/* Custom Status (only show when Custom is selected) */}
                            {eventContentType === 'custom' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Status *
                                    </label>
                                    <select
                                        value={eventCustomStatus}
                                        onChange={(e) => setEventCustomStatus(e.target.value as 'ordered' | 'in-progress' | 'delivered' | 'cancelled')}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="ordered">Ordered</option>
                                        <option value="in-progress">In Progress</option>
                                        <option value="delivered">Delivered</option>
                                        <option value="cancelled">Cancelled</option>
                                    </select>
                                </div>
                            )}

                            {/* Title */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Title *
                                </label>
                                <input
                                    type="text"
                                    value={eventTitle}
                                    onChange={(e) => setEventTitle(e.target.value)}
                                    placeholder="e.g., Photoset upload, Roleplay video shoot"
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Description
                                </label>
                                <textarea
                                    value={eventDescription}
                                    onChange={(e) => setEventDescription(e.target.value)}
                                    placeholder="Additional notes..."
                                    rows={3}
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
                                    value={eventDate}
                                    onChange={(e) => setEventDate(e.target.value)}
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
                                    value={eventTime}
                                    onChange={(e) => setEventTime(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    When you want to be reminded (e.g., 8:00 PM)
                                </p>
                            </div>

                            {/* Fan Selector */}
                            <FanSelector
                                selectedFanId={selectedFanId}
                                onSelectFan={(fanId, fanName) => {
                                    setSelectedFanId(fanId);
                                    setSelectedFanName(fanName);
                                }}
                                allowNewFan={true}
                            />

                            {/* Actions */}
                            <div className="flex gap-3 pt-4">
                                {selectedEvent?.reminder && (
                                    <button
                                        onClick={() => handleDeleteReminder(selectedEvent.reminder!.id)}
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
                                    {selectedEvent?.reminder ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Export Preview Modal */}
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
                                {/* Media Preview */}
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
                                        <p><strong>Platform:</strong> OnlyFans</p>
                                        <p><strong>Scheduled:</strong> {exportPreview.post.scheduledDate ? new Date(exportPreview.post.scheduledDate).toLocaleString() : 'Not scheduled'}</p>
                                        <p><strong>Status:</strong> {exportPreview.post.status}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Export Actions */}
                            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                                {/* Download Text File */}
                                <button
                                    onClick={async () => {
                                        const post = exportPreview.post;
                                        const scheduled = post.scheduledDate
                                            ? new Date(post.scheduledDate).toLocaleString()
                                            : 'No planned date';
                                        const mediaUrl = post.mediaUrl || 'No media URL (text-only post)';
                                        
                                        const exportContent = `Drop Export\n${'='.repeat(50)}\nPlatform: OnlyFans\nPlanned Date/Time: ${scheduled}\nStatus: ${post.status}\nMedia: ${mediaUrl}\n\nCaption:\n${post.content}\n${'='.repeat(50)}`;
                                        
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
                                        const scheduled = post.scheduledDate
                                            ? new Date(post.scheduledDate).toLocaleString()
                                            : 'Not scheduled';
                                        
                                        const allContent = `Platform: OnlyFans\nScheduled: ${scheduled}\nStatus: ${post.status}\n\n${post.content}`;
                                        
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
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
