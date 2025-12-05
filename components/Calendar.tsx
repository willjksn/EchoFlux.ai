
import React, { useState, useMemo, useEffect } from 'react';
import { CalendarEvent, Platform, Post } from '../types';
import { InstagramIcon, TikTokIcon, XIcon, ThreadsIcon, YouTubeIcon, LinkedInIcon, FacebookIcon } from './icons/PlatformIcons';
import { PlusIcon, SparklesIcon, XMarkIcon, TrashIcon } from './icons/UIIcons';
import { useAppContext } from './AppContext';
import { db } from '../firebaseConfig';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';

const platformIcons: Record<Platform, React.ReactNode> = {
  Instagram: <InstagramIcon />,
  TikTok: <TikTokIcon />,
  X: <XIcon />,
  Threads: <ThreadsIcon />,
  YouTube: <YouTubeIcon />,
  LinkedIn: <LinkedInIcon />,
  Facebook: <FacebookIcon />,
};

const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const Calendar: React.FC = () => {
    const { calendarEvents, setActivePage, posts, user, showToast, updatePost, addCalendarEvent, deletePost } = useAppContext();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedEvent, setSelectedEvent] = useState<{ event: CalendarEvent; post: Post | null } | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editDate, setEditDate] = useState('');
    const [editTime, setEditTime] = useState('');
    const [editPlatforms, setEditPlatforms] = useState<Record<Platform, boolean>>({
        Instagram: false,
        TikTok: false,
        X: false,
        Threads: false,
        YouTube: false,
        LinkedIn: false,
        Facebook: false,
    });
    const [isSaving, setIsSaving] = useState(false);

    // Filter calendar events: only show Scheduled posts with media, exclude Published
    const filteredEvents = useMemo(() => {
        if (!calendarEvents || !Array.isArray(calendarEvents)) return [];
        if (!posts || !Array.isArray(posts)) return [];
        
        return calendarEvents.filter(evt => {
            // Only show Scheduled events (not Published or Draft)
            if (evt.status !== 'Scheduled') return false;
            
            // Find associated post
            const associatedPost = posts.find(p => {
                if (evt.id.includes(p.id) || p.id.includes(evt.id.replace('cal-', '').replace('-calendar', ''))) {
                    return true;
                }
                if (p.content && evt.title && p.content.includes(evt.title.substring(0, 30))) {
                    return true;
                }
                return false;
            });
            
            // Only show if post has media
            return associatedPost ? !!associatedPost.mediaUrl : !!evt.thumbnail;
        });
    }, [calendarEvents, posts]);

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
            
            // Mock Best Time Logic: Tuesday (2) and Thursday (4)
            const dateObj = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDay);
            const dayOfWeek = dateObj.getDay();
            const isBestTime = dayOfWeek === 2 || dayOfWeek === 4;

            const dayEvents = filteredEvents.filter(e => {
                const eventDate = new Date(e.date);
                return (
                    eventDate.getDate() === currentDay &&
                    eventDate.getMonth() === currentDate.getMonth() &&
                    eventDate.getFullYear() === currentDate.getFullYear()
                );
            });

            // Sort events by time
            dayEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            const todayHighlight = isToday(currentDay);
            
            const hasEvents = dayEvents.length > 0;
            
            grid.push(
                <div 
                    key={dayCounter} 
                    className={`${hasEvents ? 'min-h-[140px]' : 'min-h-[80px]'} border-r border-b border-gray-200 dark:border-gray-700 p-3 relative group flex flex-col transition-all ${
                        todayHighlight 
                            ? 'bg-gradient-to-br from-primary-50 to-blue-50 dark:from-primary-900/20 dark:to-blue-900/20 ring-2 ring-primary-400 dark:ring-primary-500' 
                            : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                >
                    <div className="flex justify-between items-start mb-2 h-7 flex-shrink-0">
                        <span className={`font-bold text-base ${
                            todayHighlight 
                                ? 'text-primary-700 dark:text-primary-300' 
                                : isBestTime 
                                    ? 'text-purple-600 dark:text-purple-400' 
                                    : 'text-gray-700 dark:text-gray-300'
                        }`}>
                            {currentDay}
                        </span>
                        {isBestTime && (
                            <span className="flex items-center text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/40 dark:to-pink-900/40 px-2 py-0.5 rounded-full shadow-sm" title="High Engagement Potential">
                                <SparklesIcon className="w-3 h-3 mr-1" /> Best
                            </span>
                        )}
                    </div>
                    <div className={`space-y-2 ${hasEvents ? 'flex-1 overflow-y-auto custom-scrollbar pb-8' : 'flex-shrink-0'}`}>
                        {dayEvents.map(evt => {
                            const timeString = new Date(evt.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
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
                            const colors = statusColors[evt.status] || statusColors.Draft;
                            
                            const handleEventClick = () => {
                                // Find associated post
                                const associatedPost = posts.find(p => {
                                    if (evt.id.includes(p.id) || p.id.includes(evt.id.replace('cal-', '').replace('-calendar', ''))) {
                                        return true;
                                    }
                                    if (p.content && evt.title && p.content.includes(evt.title.substring(0, 30))) {
                                        return true;
                                    }
                                    return false;
                                });
                                
                                // Initialize edit state
                                const eventDate = new Date(evt.date);
                                const dateStr = eventDate.toISOString().split('T')[0];
                                const timeStr = eventDate.toTimeString().slice(0, 5);
                                
                                const platforms: Record<Platform, boolean> = {
                                    Instagram: false,
                                    TikTok: false,
                                    X: false,
                                    Threads: false,
                                    YouTube: false,
                                    LinkedIn: false,
                                    Facebook: false,
                                };
                                
                                if (associatedPost?.platforms) {
                                    associatedPost.platforms.forEach(p => {
                                        platforms[p] = true;
                                    });
                                } else {
                                    platforms[evt.platform] = true;
                                }
                                
                                setEditDate(dateStr);
                                setEditTime(timeStr);
                                setEditPlatforms(platforms);
                                setIsEditing(false);
                                
                                // Show preview modal instead of navigating
                                setSelectedEvent({ event: evt, post: associatedPost || null });
                            };
                            
                            return (
                                <div 
                                    key={evt.id} 
                                    className={`flex flex-col p-2 rounded-lg text-xs shadow-sm cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all ${colors.bg} ${colors.border}`}
                                    onClick={handleEventClick}
                                    title={`${evt.title} - ${new Date(evt.date).toLocaleString()}`}
                                >
                                    <div className="flex justify-between items-center mb-1.5 gap-1">
                                        <span className={`font-bold text-[10px] ${colors.text} whitespace-nowrap`}>
                                            {timeString}
                                        </span>
                                        <div className={`w-2 h-2 rounded-full flex-shrink-0 shadow-sm ${colors.dot}`}></div>
                                    </div>
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="w-4 h-4 flex-shrink-0 text-gray-600 dark:text-gray-300">{platformIcons[evt.platform]}</span>
                                        <span className={`truncate font-semibold text-[11px] ${colors.text}`} title={evt.title}>
                                            {evt.title}
                                        </span>
                                    </div>
                                    {evt.type && (
                                        <div className="mt-1.5">
                                            <span className="text-[9px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                                {evt.type}
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

    // Handle save edits
    const handleSaveEdit = async () => {
        if (!selectedEvent || !user) return;

        const selectedPlatformsList = (Object.keys(editPlatforms) as Platform[]).filter(p => editPlatforms[p]);
        if (selectedPlatformsList.length === 0) {
            showToast('Please select at least one platform.', 'error');
            return;
        }

        if (!editDate || !editTime) {
            showToast('Please select both date and time.', 'error');
            return;
        }

        setIsSaving(true);
        try {
            // Combine date and time
            const newDateTime = new Date(`${editDate}T${editTime}`);
            const newDateTimeISO = newDateTime.toISOString();

            // Update Post if it exists
            if (selectedEvent.post) {
                const updatedPost: Post = {
                    ...selectedEvent.post,
                    scheduledDate: newDateTimeISO,
                    platforms: selectedPlatformsList,
                };
                await updatePost(updatedPost);
            }

            // Update CalendarEvent
            const updatedEvent: CalendarEvent = {
                ...selectedEvent.event,
                date: newDateTimeISO,
                platform: selectedPlatformsList[0], // Primary platform for calendar display
            };

            await setDoc(doc(db, 'users', user.id, 'calendar_events', updatedEvent.id), updatedEvent);

            // Update local state
            setSelectedEvent({
                event: updatedEvent,
                post: selectedEvent.post ? {
                    ...selectedEvent.post,
                    scheduledDate: newDateTimeISO,
                    platforms: selectedPlatformsList,
                } : null,
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

    // Handle delete post
    const handleDeletePost = async () => {
        if (!selectedEvent || !user) return;
        
        if (!window.confirm('Are you sure you want to delete this scheduled post?')) {
            return;
        }

        try {
            // Delete the post from Firestore
            if (selectedEvent.post) {
                await deletePost(selectedEvent.post.id);
            }

            // Delete the calendar event from Firestore
            const eventDocRef = doc(db, 'users', user.id, 'calendar_events', selectedEvent.event.id);
            await deleteDoc(eventDocRef);

            setSelectedEvent(null);
            showToast('Post deleted successfully!', 'success');
        } catch (error) {
            console.error('Failed to delete post:', error);
            showToast('Failed to delete post. Please try again.', 'error');
        }
    };

    // Reset edit state when modal closes
    useEffect(() => {
        if (!selectedEvent) {
            setIsEditing(false);
            setEditDate('');
            setEditTime('');
            setEditPlatforms({
                Instagram: false,
                TikTok: false,
                X: false,
                Threads: false,
                YouTube: false,
                LinkedIn: false,
                Facebook: false,
            });
        }
    }, [selectedEvent]);

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
                                        <button
                                            onClick={() => setIsEditing(true)}
                                            className="px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
                                        >
                                            Edit
                                        </button>
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

                            {/* Platforms - Editable */}
                            <div className="mb-4">
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Platforms:</h4>
                                {isEditing ? (
                                    <div className="flex flex-wrap gap-2">
                                        {(Object.keys(platformIcons) as Platform[]).map((platform) => (
                                            <button
                                                key={platform}
                                                onClick={() => setEditPlatforms(prev => ({ ...prev, [platform]: !prev[platform] }))}
                                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                                                    editPlatforms[platform]
                                                        ? 'bg-primary-100 dark:bg-primary-900/30 border-primary-500 dark:border-primary-600 text-primary-700 dark:text-primary-300'
                                                        : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                                }`}
                                            >
                                                <span className="w-4 h-4">{platformIcons[platform]}</span>
                                                <span className="text-sm font-medium">{platform}</span>
                                            </button>
                                        ))}
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
                                                // Reset to original values
                                                const eventDate = new Date(selectedEvent.event.date);
                                                const dateStr = eventDate.toISOString().split('T')[0];
                                                const timeStr = eventDate.toTimeString().slice(0, 5);
                                                setEditDate(dateStr);
                                                setEditTime(timeStr);
                                                const platforms: Record<Platform, boolean> = {
                                                    Instagram: false,
                                                    TikTok: false,
                                                    X: false,
                                                    Threads: false,
                                                    YouTube: false,
                                                    LinkedIn: false,
                                                    Facebook: false,
                                                };
                                                if (selectedEvent.post?.platforms) {
                                                    selectedEvent.post.platforms.forEach(p => {
                                                        platforms[p] = true;
                                                    });
                                                } else {
                                                    platforms[selectedEvent.event.platform] = true;
                                                }
                                                setEditPlatforms(platforms);
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
                <div className="flex gap-4 items-center">
                    <div className="hidden md:flex items-center gap-4 text-xs bg-white dark:bg-gray-800 py-2.5 px-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                         <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-500 shadow-sm"></span> <span className="text-gray-700 dark:text-gray-300 font-medium">Published</span></div>
                         <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-500 shadow-sm"></span> <span className="text-gray-700 dark:text-gray-300 font-medium">Scheduled</span></div>
                         <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-gray-400 shadow-sm"></span> <span className="text-gray-700 dark:text-gray-300 font-medium">Draft</span></div>
                         <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-200 dark:border-gray-700">
                             <SparklesIcon className="w-4 h-4 text-purple-500 dark:text-purple-400"/> 
                             <span className="text-gray-700 dark:text-gray-300 font-medium">Best Time</span>
                         </div>
                    </div>
                    <button 
                        onClick={() => setActivePage('compose')} 
                        className="px-5 py-2.5 bg-gradient-to-r from-primary-600 to-primary-500 text-white rounded-lg hover:from-primary-700 hover:to-primary-600 text-sm font-semibold flex items-center gap-2 shadow-md transition-all"
                    >
                         <PlusIcon className="w-5 h-5" />
                         New Post
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="grid grid-cols-7 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 border-b border-gray-200 dark:border-gray-700">
                    {daysOfWeek.map(day => (
                        <div key={day} className="text-center font-bold text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wider py-3 px-2">
                            {day}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-7 auto-rows-min">
                    {renderCalendarGrid()}
                </div>
            </div>
        </div>
    );
};
