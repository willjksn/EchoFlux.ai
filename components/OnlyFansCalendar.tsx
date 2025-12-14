import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from './AppContext';
import { db } from '../firebaseConfig';
import { collection, query, orderBy, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { PlusIcon, TrashIcon, XMarkIcon, CheckCircleIcon } from './icons/UIIcons';

export interface OnlyFansCalendarEvent {
    id: string;
    title: string;
    date: string; // ISO string
    reminderType: 'post' | 'shoot'; // post = upload reminder, shoot = filming reminder
    contentType: 'free' | 'paid'; // free or paid content
    description?: string;
    reminderTime?: string; // Time for the reminder (e.g., "8:00 PM")
    createdAt: string;
    userId: string;
}

const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const OnlyFansCalendar: React.FC = () => {
    const { user, showToast } = useAppContext();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState<OnlyFansCalendarEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedEvent, setSelectedEvent] = useState<OnlyFansCalendarEvent | null>(null);
    const [isCreatingEvent, setIsCreatingEvent] = useState(false);
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    
    // Form state
    const [eventTitle, setEventTitle] = useState('');
    const [eventDescription, setEventDescription] = useState('');
    const [eventReminderType, setEventReminderType] = useState<'post' | 'shoot'>('post');
    const [eventContentType, setEventContentType] = useState<'free' | 'paid'>('free');
    const [eventDate, setEventDate] = useState('');
    const [eventTime, setEventTime] = useState('');

    // Load events from Firestore
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
                setEvents(loadedEvents);
                setIsLoading(false);
            },
            (error) => {
                console.error('Error loading OnlyFans calendar events:', error);
                showToast('Failed to load calendar events', 'error');
                setIsLoading(false);
            }
        );

        return () => unsubscribe();
    }, [user, showToast]);

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
    const getEventsForDate = (date: Date | null): OnlyFansCalendarEvent[] => {
        if (!date) return [];
        const dateStr = date.toISOString().split('T')[0];
        return events.filter(evt => {
            const eventDateStr = new Date(evt.date).toISOString().split('T')[0];
            return eventDateStr === dateStr;
        });
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

    // Handle date click to create event
    const handleDateClick = (date: Date) => {
        setSelectedDate(date);
        const dateStr = date.toISOString().split('T')[0];
        setEventDate(dateStr);
        setEventTime('20:00'); // Default to 8 PM
        setIsCreatingEvent(true);
        setSelectedEvent(null);
    };

    // Handle event click to view/edit
    const handleEventClick = (event: OnlyFansCalendarEvent) => {
        setSelectedEvent(event);
        setEventTitle(event.title);
        setEventDescription(event.description || '');
        setEventReminderType(event.reminderType);
        setEventContentType(event.contentType);
        setEventDate(new Date(event.date).toISOString().split('T')[0]);
        setEventTime(event.reminderTime || '20:00');
        setIsCreatingEvent(true);
    };

    // Save event
    const handleSaveEvent = async () => {
        if (!user || !eventTitle.trim() || !eventDate) {
            showToast('Please fill in all required fields', 'error');
            return;
        }

        try {
            const eventId = selectedEvent?.id || `evt-${Date.now()}`;
            const dateTime = new Date(`${eventDate}T${eventTime || '12:00'}`);
            
            const eventData: Omit<OnlyFansCalendarEvent, 'id'> = {
                title: eventTitle.trim(),
                description: eventDescription.trim() || undefined,
                date: dateTime.toISOString(),
                reminderType: eventReminderType,
                contentType: eventContentType,
                reminderTime: eventTime || undefined,
                createdAt: selectedEvent?.createdAt || new Date().toISOString(),
                userId: user.id,
            };

            await setDoc(doc(db, 'users', user.id, 'onlyfans_calendar_events', eventId), eventData);

            showToast(selectedEvent ? 'Reminder updated!' : 'Reminder created!', 'success');
            resetForm();
        } catch (error) {
            console.error('Error saving event:', error);
            showToast('Failed to save reminder', 'error');
        }
    };

    // Delete event
    const handleDeleteEvent = async (eventId: string) => {
        if (!user) return;
        
        if (!confirm('Are you sure you want to delete this reminder?')) {
            return;
        }

        try {
            await deleteDoc(doc(db, 'users', user.id, 'onlyfans_calendar_events', eventId));
            showToast('Reminder deleted', 'success');
            setSelectedEvent(null);
            resetForm();
        } catch (error) {
            console.error('Error deleting event:', error);
            showToast('Failed to delete reminder', 'error');
        }
    };

    // Reset form
    const resetForm = () => {
        setIsCreatingEvent(false);
        setSelectedEvent(null);
        setSelectedDate(null);
        setEventTitle('');
        setEventDescription('');
        setEventReminderType('post');
        setEventContentType('free');
        setEventDate('');
        setEventTime('');
    };

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
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Content Calendar</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Schedule reminders for posting and filming. This does not post automatically.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={goToToday}
                        className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                    >
                        Today
                    </button>
                    <button
                        onClick={() => setIsCreatingEvent(true)}
                        className="px-4 py-2 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center gap-2"
                    >
                        <PlusIcon className="w-4 h-4" />
                        Add Reminder
                    </button>
                </div>
            </div>

            {/* Important Notice */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Reminder:</strong> These are manual reminders only. OnlyFans Studio does not post to your account. 
                    You must manually upload content to OnlyFans.
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
                                    className={`min-h-24 p-2 border-r border-gray-200 dark:border-gray-700 last:border-r-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
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
                                                {dayEvents.slice(0, 3).map(event => (
                                                    <div
                                                        key={event.id}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleEventClick(event);
                                                        }}
                                                        className={`text-xs p-1 rounded truncate cursor-pointer ${
                                                            event.contentType === 'paid'
                                                                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 border border-purple-300 dark:border-purple-700'
                                                                : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border border-green-300 dark:border-green-700'
                                                        } ${
                                                            event.reminderType === 'shoot'
                                                                ? 'font-semibold'
                                                                : ''
                                                        }`}
                                                        title={`${event.reminderType === 'shoot' ? '🎬 ' : '📤 '}${event.title} (${event.contentType === 'paid' ? 'Paid' : 'Free'})`}
                                                    >
                                                        {event.reminderType === 'shoot' ? '🎬 ' : '📤 '}
                                                        {event.title}
                                                    </div>
                                                ))}
                                                {dayEvents.length > 3 && (
                                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                                        +{dayEvents.length - 3} more
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>

            {/* Create/Edit Event Modal */}
            {isCreatingEvent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                {selectedEvent ? 'Edit Reminder' : 'Create Reminder'}
                            </h3>
                            <button
                                onClick={resetForm}
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
                                        onClick={() => setEventReminderType('post')}
                                        className={`flex-1 px-4 py-2 rounded-md border-2 transition-colors ${
                                            eventReminderType === 'post'
                                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                                                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                                        }`}
                                    >
                                        📤 Post Reminder
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
                                    Content Type *
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
                                        Free
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
                                        Paid
                                    </button>
                                </div>
                            </div>

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

                            {/* Actions */}
                            <div className="flex gap-3 pt-4">
                                {selectedEvent && (
                                    <button
                                        onClick={() => handleDeleteEvent(selectedEvent.id)}
                                        className="flex-1 px-4 py-2 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center justify-center gap-2"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                        Delete
                                    </button>
                                )}
                                <button
                                    onClick={resetForm}
                                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveEvent}
                                    className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center justify-center gap-2"
                                >
                                    <CheckCircleIcon className="w-4 h-4" />
                                    {selectedEvent ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
