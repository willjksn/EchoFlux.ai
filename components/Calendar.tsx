
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

    const renderCalendarGrid = () => {
        const grid = [];
        let dayCounter = 1;

        // Empty cells for days before the 1st
        for (let i = 0; i < firstDay; i++) {
            grid.push(<div key={`empty-${i}`} className="bg-gray-50 dark:bg-gray-800/50 min-h-[120px] border border-gray-200 dark:border-gray-700"></div>);
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

            grid.push(
                <div key={dayCounter} className={`bg-white dark:bg-gray-800 min-h-[120px] border border-gray-200 dark:border-gray-700 p-2 relative group flex flex-col transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50`}>
                    <div className="flex justify-between items-start mb-1 h-6">
                        <span className={`font-semibold text-sm ${isBestTime ? 'text-purple-600 dark:text-purple-400' : 'text-gray-700 dark:text-gray-300'}`}>{dayCounter}</span>
                        {isBestTime && (
                            <span className="flex items-center text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 rounded-full shadow-sm" title="High Engagement Potential">
                                <SparklesIcon className="w-3 h-3 mr-1" /> Best Time
                            </span>
                        )}
                    </div>
                    <div className="space-y-1.5 flex-1 overflow-y-auto scrollbar-hide pb-6">
                        {dayEvents.map(evt => {
                            const timeString = new Date(evt.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
                            return (
                                <div key={evt.id} className={`flex flex-col p-1.5 rounded-md border-l-2 text-xs shadow-sm cursor-pointer hover:opacity-90 transition-opacity ${
                                    evt.status === 'Published' ? 'bg-green-50 border-green-500 dark:bg-green-900/20' :
                                    evt.status === 'Scheduled' ? 'bg-blue-50 border-blue-500 dark:bg-blue-900/20' :
                                    'bg-gray-100 border-gray-400 dark:bg-gray-700'
                                }`}>
                                    <div className="flex justify-between items-center mb-1 gap-1">
                                        <span className="font-bold text-[10px] text-gray-700 dark:text-gray-300 whitespace-nowrap" title={new Date(evt.date).toLocaleString()}>{timeString}</span>
                                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                            evt.status === 'Published' ? 'bg-green-500' :
                                            evt.status === 'Scheduled' ? 'bg-blue-500' : 'bg-gray-400'
                                        }`}></div>
                                    </div>
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="w-3 h-3 flex-shrink-0 text-gray-600 dark:text-gray-300">{platformIcons[evt.platform]}</span>
                                        <span className="truncate text-gray-800 dark:text-gray-200 font-medium text-[11px]" title={evt.title}>{evt.title}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <button 
                        onClick={(e) => { e.stopPropagation(); setActivePage('compose'); }} 
                        className="absolute bottom-2 right-2 p-1.5 bg-primary-100 text-primary-600 hover:bg-primary-600 hover:text-white rounded-full transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 z-10 shadow-sm"
                        title="Add Post to this day"
                    >
                         <PlusIcon className="w-4 h-4" />
                    </button>
                </div>
            );
            dayCounter++;
        }
        
        return grid;
    };

    return (
        <div className="max-w-7xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <div className="flex items-center gap-4">
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Content Calendar</h2>
                    <div className="flex items-center bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-1">
                         <button onClick={handlePrevMonth} className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                         </button>
                         <span className="text-base font-semibold text-gray-800 dark:text-gray-200 min-w-[120px] text-center">
                             {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                         </span>
                         <button onClick={handleNextMonth} className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300">
                             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                         </button>
                    </div>
                </div>
                <div className="flex gap-4 items-center">
                    <div className="hidden md:flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 py-1.5 px-3 rounded-full shadow-sm border border-gray-200 dark:border-gray-700">
                         <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> Published</div>
                         <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Scheduled</div>
                         <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400"></span> Draft</div>
                         <div className="flex items-center gap-1 ml-2"><SparklesIcon className="w-3 h-3 text-purple-500"/> Best Time</div>
                    </div>
                    <button onClick={() => setActivePage('compose')} className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm font-medium flex items-center gap-2 shadow-sm">
                         <PlusIcon className="w-4 h-4" />
                         New Post
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-7 mb-2 min-w-[800px]">
                {daysOfWeek.map(day => (
                    <div key={day} className="text-center font-semibold text-gray-500 dark:text-gray-400 text-sm uppercase tracking-wider">{day}</div>
                ))}
            </div>

            <div className="flex-1 border-t border-l border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden shadow-sm bg-gray-200 dark:bg-gray-700 overflow-x-auto">
                <div className="grid grid-cols-7 auto-rows-fr min-w-[800px] h-full">
                    {renderCalendarGrid()}
                </div>
            </div>
        </div>
    );
};
