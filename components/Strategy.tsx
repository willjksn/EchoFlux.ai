
import React, { useState } from 'react';
import { useAppContext } from './AppContext';
import { StrategyPlan, Platform, WeekPlan } from '../types';
import { generateContentStrategy } from "../src/services/geminiService"
import { TargetIcon, SparklesIcon, CalendarIcon, CheckCircleIcon } from './icons/UIIcons';
import { InstagramIcon, TikTokIcon, XIcon, LinkedInIcon, FacebookIcon } from './icons/PlatformIcons';
import { UpgradePrompt } from './UpgradePrompt';

const platformIcons: Record<Platform, React.ReactElement> = {
    Instagram: <InstagramIcon className="w-4 h-4" />,
    TikTok: <TikTokIcon className="w-4 h-4" />,
    X: <XIcon className="w-4 h-4" />,
    Threads: <div className="w-4 h-4 text-xs">Th</div>,
    YouTube: <div className="w-4 h-4 text-xs">YT</div>,
    LinkedIn: <LinkedInIcon className="w-4 h-4" />,
    Facebook: <FacebookIcon className="w-4 h-4" />,
};

export const Strategy: React.FC = () => {
    const { addCalendarEvent, showToast, setActivePage, user } = useAppContext();
    const [niche, setNiche] = useState('');
    const [audience, setAudience] = useState('');
    const [goal, setGoal] = useState('Brand Awareness');
    const [duration, setDuration] = useState('4 Weeks');
    const [tone, setTone] = useState('Professional');
    const [platformFocus, setPlatformFocus] = useState('Mixed / All');
    const [isLoading, setIsLoading] = useState(false);
    const [plan, setPlan] = useState<StrategyPlan | null>(null);

    const isFeatureUnlocked = ['Pro', 'Elite', 'Agency'].includes(user?.plan || "") || user?.role === 'Admin'
;

    if (!isFeatureUnlocked) {
         return <UpgradePrompt featureName="AI Content Strategist" onUpgradeClick={() => setActivePage('pricing')} />;
    }

    const handleGenerate = async () => {
        if (!niche || !audience) {
            showToast('Please fill in all fields.', 'error');
            return;
        }
        setIsLoading(true);
        try {
            const result = await generateContentStrategy(niche, audience, goal, duration, tone, platformFocus);
            setPlan(result);
            showToast('Strategy generated!', 'success');
        } catch (error) {
            showToast('Failed to generate strategy. Please try again.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handlePopulateCalendar = () => {
        if (!plan) return;

        const today = new Date();
        // Start from tomorrow
        const startDate = new Date(today);
        startDate.setDate(today.getDate() + 1);

        let eventsAdded = 0;

        plan.weeks.forEach((week, wIndex) => {
            week.content.forEach((dayPlan) => {
                const eventDate = new Date(startDate);
                eventDate.setDate(startDate.getDate() + (wIndex * 7) + dayPlan.dayOffset);

                addCalendarEvent({
                    id: `strat-${Date.now()}-${wIndex}-${dayPlan.dayOffset}`,
                    title: dayPlan.topic,
                    date: eventDate.toISOString(),
                    type: dayPlan.format,
                    platform: dayPlan.platform,
                    status: 'Draft'
                });
                eventsAdded++;
            });
        });

        showToast(`Added ${eventsAdded} drafts to your calendar!`, 'success');
        setActivePage('calendar');
    };

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-12">
            <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400 mb-4">
                    <TargetIcon className="w-8 h-8" />
                </div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">AI Content Strategist</h2>
                <p className="mt-2 text-lg text-gray-500 dark:text-gray-400">Stop guessing. Let AI build a data-driven roadmap for your growth.</p>
            </div>

            {/* Input Section */}
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">Brand Niche</label>
                        <input 
                            type="text" 
                            value={niche} 
                            onChange={e => setNiche(e.target.value)} 
                            placeholder="e.g. Vegan Skincare" 
                            className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 dark:text-white dark:placeholder-gray-400"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">Target Audience</label>
                        <input 
                            type="text" 
                            value={audience} 
                            onChange={e => setAudience(e.target.value)} 
                            placeholder="e.g. Busy Moms in 30s" 
                            className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 dark:text-white dark:placeholder-gray-400"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">Primary Goal</label>
                        <select 
                            value={goal} 
                            onChange={e => setGoal(e.target.value)} 
                            className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 dark:text-white"
                        >
                            <option>Brand Awareness</option>
                            <option>Increase Followers/Fans</option>
                            <option>Lead Generation</option>
                            <option>Community Engagement</option>
                            <option>Sales Conversion</option>
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">Duration</label>
                        <select 
                            value={duration} 
                            onChange={e => setDuration(e.target.value)} 
                            className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 dark:text-white"
                        >
                            <option>1 Week</option>
                            <option>2 Weeks</option>
                            <option>4 Weeks</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">Tone</label>
                        <select 
                            value={tone} 
                            onChange={e => setTone(e.target.value)} 
                            className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 dark:text-white"
                        >
                            <option>Professional</option>
                            <option>Casual & Friendly</option>
                            <option>Edgy & Bold</option>
                            <option>Educational</option>
                            <option>Inspirational</option>
                            <option>Sexy / Bold</option>
                            <option>Sexy / Explicit</option>
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-white mb-2">Platform Focus</label>
                        <select 
                            value={platformFocus} 
                            onChange={e => setPlatformFocus(e.target.value)} 
                            className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 dark:text-white"
                        >
                            <option>Mixed / All</option>
                            <option value="Instagram">Instagram Focus</option>
                            <option value="TikTok">TikTok Focus</option>
                            <option value="LinkedIn">LinkedIn Focus</option>
                            <option value="X">X (Twitter) Focus</option>
                            <option value="Facebook">Facebook Focus</option>
                        </select>
                    </div>
                </div>

                <div className="mt-8 flex justify-center">
                    <button 
                        onClick={handleGenerate} 
                        disabled={isLoading || !niche || !audience} 
                        className="px-8 py-3 bg-gradient-to-r from-primary-600 to-primary-500 text-white font-bold rounded-full shadow-lg hover:shadow-xl transform transition hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isLoading ? (
                             <>
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                Developing Strategy...
                             </>
                        ) : (
                             <>
                                <SparklesIcon className="w-5 h-5" /> Generate Roadmap
                             </>
                        )}
                    </button>
                </div>
            </div>

            {/* Results Section */}
            {plan && (
                <div className="space-y-8 animate-fade-in-up">
                    <div className="flex justify-between items-center">
                        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Your Strategy Plan</h3>
                        <button 
                            onClick={handlePopulateCalendar}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                        >
                            <CalendarIcon className="w-5 h-5" /> Populate Calendar
                        </button>
                    </div>

                    {plan.weeks.map((week, weekIndex) => (
                        <div key={weekIndex} className="bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden border border-gray-200 dark:border-gray-700">
                            <div className="bg-gray-50 dark:bg-gray-900/50 p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                                <h4 className="font-bold text-lg text-gray-800 dark:text-gray-200">Week {week.weekNumber}: {week.theme}</h4>
                                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">{week.content.length} Posts</span>
                            </div>
                            <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                {week.content.map((day, dayIndex) => (
                                    <div key={dayIndex} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors flex flex-col sm:flex-row sm:items-center gap-4">
                                        <div className="flex items-center gap-3 min-w-[120px]">
                                            <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-500 dark:text-gray-300">
                                                {platformIcons[day.platform]}
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Day {day.dayOffset + 1}</p>
                                                <p className="text-xs font-medium text-primary-600 dark:text-primary-400">{day.format}</p>
                                            </div>
                                        </div>
                                        <div className="flex-grow">
                                            <p className="font-medium text-gray-900 dark:text-white">{day.topic}</p>
                                        </div>
                                        <div className="flex-shrink-0">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                                Draft Ready
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
