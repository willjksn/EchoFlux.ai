
import React, { useState } from 'react';
import { CalendarEvent, Platform } from '../types';
import { InstagramIcon, TikTokIcon, XIcon, ThreadsIcon, YouTubeIcon, LinkedInIcon, FacebookIcon } from './icons/PlatformIcons';
import { PlusIcon, SparklesIcon } from './icons/UIIcons';
import { useAppContext } from './AppContext';

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
    const { calendarEvents, setActivePage } = useAppContext();
    const [currentDate, setCurrentDate] = useState(new Date());

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
                <div key={`empty-${i}`} className="bg-gray-50 dark:bg-gray-800/30 min-h-[140px] border-r border-b border-gray-200 dark:border-gray-700"></div>
            );
        }

        // Days of the month
        while (dayCounter <= daysInMonth) {
            const currentDay = dayCounter;
            
            // Mock Best Time Logic: Tuesday (2) and Thursday (4)
            const dateObj = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDay);
            const dayOfWeek = dateObj.getDay();
            const isBestTime = dayOfWeek === 2 || dayOfWeek === 4;

            const dayEvents = calendarEvents.filter(e => {
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
            
            grid.push(
                <div 
                    key={dayCounter} 
                    className={`min-h-[140px] border-r border-b border-gray-200 dark:border-gray-700 p-3 relative group flex flex-col transition-all ${
                        todayHighlight 
                            ? 'bg-gradient-to-br from-primary-50 to-blue-50 dark:from-primary-900/20 dark:to-blue-900/20 ring-2 ring-primary-400 dark:ring-primary-500' 
                            : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                >
                    <div className="flex justify-between items-start mb-2 h-7">
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
                    <div className="space-y-2 flex-1 overflow-y-auto custom-scrollbar pb-8">
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
                            
                            return (
                                <div 
                                    key={evt.id} 
                                    className={`flex flex-col p-2 rounded-lg text-xs shadow-sm cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all ${colors.bg} ${colors.border}`}
                                    onClick={() => setActivePage('compose')}
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

    return (
        <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-full">
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

                <div className="grid grid-cols-7 auto-rows-fr min-h-[600px]">
                    {renderCalendarGrid()}
                </div>
            </div>
        </div>
    );
};
