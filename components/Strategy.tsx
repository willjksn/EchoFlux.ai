
import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from './AppContext';
import { StrategyPlan, Platform, WeekPlan, DayPlan, Post, CalendarEvent } from '../types';
import { generateContentStrategy, saveStrategy, getStrategies, updateStrategyStatus } from "../src/services/geminiService"
import { TargetIcon, SparklesIcon, CalendarIcon, CheckCircleIcon, RocketIcon, DownloadIcon, TrashIcon, ClockIcon, UploadIcon } from './icons/UIIcons';
import { InstagramIcon, TikTokIcon, XIcon, LinkedInIcon, FacebookIcon } from './icons/PlatformIcons';
import { UpgradePrompt } from './UpgradePrompt';
import { storage } from '../firebaseConfig';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db } from '../firebaseConfig';
import { doc, setDoc, getDoc } from 'firebase/firestore';

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
    const { 
        addCalendarEvent, 
        showToast, 
        setActivePage, 
        user, 
        addAutopilotCampaign, 
        updateAutopilotCampaign,
        settings 
    } = useAppContext();
    const [niche, setNiche] = useState('');
    const [audience, setAudience] = useState('');
    
    // Filter options for Business Starter/Growth plans
    const isBusiness = user?.userType === 'Business';
    const isAgencyPlan = user?.plan === 'Agency';
    const showAdvancedOptions = !isBusiness || isAgencyPlan; // Hide for Business Starter/Growth, show for Agency and all Creators
    
    // Set default goal based on user type - use function initializer to avoid referencing undefined
    const [goal, setGoal] = useState(() => {
        return user?.userType === 'Business' ? 'Lead Generation' : 'Increase Followers/Fans';
    });
    const [duration, setDuration] = useState('4 Weeks');
    const [tone, setTone] = useState('Professional');
    const [platformFocus, setPlatformFocus] = useState('Mixed / All');
    const [isLoading, setIsLoading] = useState(false);
    const [plan, setPlan] = useState<StrategyPlan | null>(null);
    const [savedStrategies, setSavedStrategies] = useState<any[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [strategyName, setStrategyName] = useState('');
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [selectedStrategy, setSelectedStrategy] = useState<any | null>(null);
    const [uploadingMedia, setUploadingMedia] = useState<{ weekIndex: number; dayIndex: number } | null>(null);
    const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

    // Helper function to convert file to base64
    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = error => reject(error);
        });
    };

    // Helper function to convert base64 to bytes
    function base64ToBytes(base64: string) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }

    // AI Content Strategist is a $99/month add-on feature
    // Available to Creator Pro/Elite plans, but NOT Agency (requires add-on purchase)
    const isFeatureUnlocked = user?.role === 'Admin' || 
                               (['Pro', 'Elite'].includes(user?.plan || '') && user?.plan !== 'Agency');

    // Load saved strategies and active roadmap on mount
    useEffect(() => {
        loadStrategies();
        loadActiveRoadmap();
    }, [user?.id]);

    const loadStrategies = async () => {
        try {
            const result = await getStrategies();
            if (result.success && result.strategies) {
                setSavedStrategies(result.strategies);
            }
        } catch (error) {
            console.error("Failed to load strategies:", error);
        }
    };

    const loadActiveRoadmap = async () => {
        if (!user) return;
        
        try {
            // Try to load the most recent active strategy
            const strategiesSnapshot = await getStrategies();
            if (strategiesSnapshot.success && strategiesSnapshot.strategies) {
                const activeStrategy = strategiesSnapshot.strategies.find(
                    (s: any) => s.status === 'active' && s.userId === user.id
                );
                
                if (activeStrategy) {
                    // Ensure all content items have status initialized
                    const planWithStatus = activeStrategy.plan ? {
                        ...activeStrategy.plan,
                        weeks: activeStrategy.plan.weeks.map((week: WeekPlan) => ({
                            ...week,
                            content: week.content.map((day: DayPlan) => ({
                                ...day,
                                status: day.status || 'draft',
                                imageIdeas: day.imageIdeas || [],
                                videoIdeas: day.videoIdeas || []
                            }))
                        }))
                    } : null;
                    
                    setPlan(planWithStatus);
                    setSelectedStrategy(activeStrategy);
                    setNiche(activeStrategy.niche || '');
                    setAudience(activeStrategy.audience || '');
                    setGoal(activeStrategy.goal || 'Increase Followers/Fans');
                }
            }
        } catch (error) {
            console.error("Failed to load active roadmap:", error);
        }
    };

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
            if (result && result.weeks) {
                // Initialize status for all content items
                const planWithStatus = {
                    ...result,
                    weeks: result.weeks.map(week => ({
                        ...week,
                        content: week.content.map(day => ({
                            ...day,
                            status: 'draft' as const,
                            imageIdeas: [],
                            videoIdeas: []
                        }))
                    }))
                };
                
                // Set the plan first
                setPlan(planWithStatus);
                // Create a new temporary strategy object for the newly generated roadmap
                // This ensures the plan persists on the page until a new one is generated
                const strategyId = `temp_${Date.now()}`;
                const strategyData = {
                    id: strategyId,
                    name: 'Current Strategy',
                    plan: planWithStatus,
                    goal: goal,
                    niche: niche,
                    audience: audience,
                    status: 'active',
                    linkedPostIds: [],
                    createdAt: new Date().toISOString(),
                    userId: user?.id
                };
                setSelectedStrategy(strategyData);
                
                // Save to Firestore for persistence
                if (user) {
                    try {
                        await setDoc(doc(db, 'users', user.id, 'strategies', strategyId), strategyData);
                    } catch (err) {
                        console.error('Failed to save strategy:', err);
                    }
                }
                showToast('Strategy generated!', 'success');
            } else {
                throw new Error('Invalid strategy response');
            }
        } catch (error: any) {
            console.error("Strategy generation error:", error);
            showToast(error?.note || error?.message || 'Failed to generate strategy. Please try again.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveStrategy = async () => {
        if (!plan || !strategyName.trim()) {
            showToast('Please enter a name for your strategy.', 'error');
            return;
        }
        setIsSaving(true);
        try {
            const result = await saveStrategy(plan, strategyName, goal, niche, audience);
            if (result.success) {
                showToast('Strategy saved successfully!', 'success');
                setShowSaveModal(false);
                setStrategyName('');
                await loadStrategies();
            } else {
                throw new Error(result.error || 'Failed to save strategy');
            }
        } catch (error: any) {
            showToast(error?.message || 'Failed to save strategy. Please try again.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleLoadStrategy = (strategy: any) => {
        // Ensure all content items have status initialized
        const planWithStatus = strategy.plan ? {
            ...strategy.plan,
            weeks: strategy.plan.weeks.map((week: WeekPlan) => ({
                ...week,
                content: week.content.map((day: DayPlan) => ({
                    ...day,
                    status: day.status || 'draft',
                    imageIdeas: day.imageIdeas || [],
                    videoIdeas: day.videoIdeas || []
                }))
            }))
        } : null;
        
        setPlan(planWithStatus);
        setNiche(strategy.niche || '');
        setAudience(strategy.audience || '');
        setGoal(strategy.goal || goal);
        setSelectedStrategy(strategy);
        setShowHistory(false);
        showToast('Strategy loaded!', 'success');
    };

    const handleMediaUpload = async (weekIndex: number, dayIndex: number, file: File) => {
        if (!user || !plan) return;

        const fileType = file.type.startsWith('image') ? 'image' : 'video';
        setUploadingMedia({ weekIndex, dayIndex });

        try {
            // Convert to base64 for preview
            const base64 = await fileToBase64(file);
            const dataUrl = `data:${file.type};base64,${base64}`;

            // Upload to Firebase Storage
            const timestamp = Date.now();
            const extension = file.type.split('/')[1] || (fileType === 'image' ? 'png' : 'mp4');
            const storagePath = `users/${user.id}/roadmap/${timestamp}.${extension}`;
            const storageRef = ref(storage, storagePath);

            const bytes = base64ToBytes(base64);
            await uploadBytes(storageRef, bytes, {
                contentType: file.type,
            });

            const mediaUrl = await getDownloadURL(storageRef);

            // Update plan with media
            const updatedPlan = {
                ...plan,
                weeks: plan.weeks.map((week, wIdx) => {
                    if (wIdx !== weekIndex) return week;
                    return {
                        ...week,
                        content: week.content.map((day, dIdx) => {
                            if (dIdx !== dayIndex) return day;
                            return {
                                ...day,
                                mediaUrl,
                                mediaType: fileType,
                                status: 'ready' as const
                            };
                        })
                    };
                })
            };

            // Calculate scheduled date based on roadmap
            const today = new Date();
            const scheduledDate = new Date(today);
            scheduledDate.setDate(today.getDate() + (weekIndex * 7) + day.dayOffset);
            scheduledDate.setHours(14, 0, 0, 0); // Default to 2 PM

            // Auto-schedule the post
            const postId = `roadmap-${selectedStrategy?.id || 'temp'}-${weekIndex}-${dayIndex}-${Date.now()}`;
            const postTitle = day.topic.substring(0, 30) + (day.topic.length > 30 ? '...' : '');

            // Create Post in Firestore and schedule
            if (user) {
                const newPost: Post = {
                    id: postId,
                    content: day.topic, // Use topic as caption for now
                    mediaUrl: mediaUrl,
                    mediaType: fileType,
                    platforms: [day.platform],
                    status: 'Scheduled',
                    author: { name: user.name, avatar: user.avatar },
                    comments: [],
                    scheduledDate: scheduledDate.toISOString(),
                    clientId: user.userType === 'Business' ? user.id : undefined
                };

                const safePost = JSON.parse(JSON.stringify(newPost));
                await setDoc(doc(db, 'users', user.id, 'posts', postId), safePost);

                // Create calendar event
                const newEvent: CalendarEvent = {
                    id: `cal-${postId}`,
                    title: postTitle,
                    date: scheduledDate.toISOString(),
                    type: day.format === 'Reel' ? 'Reel' : 'Post',
                    platform: day.platform,
                    status: 'Scheduled',
                    thumbnail: mediaUrl,
                };

                await addCalendarEvent(newEvent);

                // Update roadmap item status to scheduled and link post
                const updatedPlanWithSchedule = {
                    ...updatedPlan,
                    weeks: updatedPlan.weeks.map((week, wIdx) => {
                        if (wIdx !== weekIndex) return week;
                        return {
                            ...week,
                            content: week.content.map((d, dIdx) => {
                                if (dIdx !== dayIndex) return d;
                                return {
                                    ...d,
                                    status: 'scheduled' as const,
                                    linkedPostId: postId
                                };
                            })
                        };
                    })
                };

                setPlan(updatedPlanWithSchedule);

                // Update selectedStrategy
                if (selectedStrategy) {
                    const updatedStrategy = {
                        ...selectedStrategy,
                        plan: updatedPlanWithSchedule,
                        linkedPostIds: [...(selectedStrategy.linkedPostIds || []), postId]
                    };
                    setSelectedStrategy(updatedStrategy);

                    // Save to Firestore
                    await setDoc(doc(db, 'users', user.id, 'strategies', selectedStrategy.id), updatedStrategy);
                }
            } else {
                setPlan(updatedPlan);
                
                // Update selectedStrategy without scheduling
                if (selectedStrategy) {
                    const updatedStrategy = {
                        ...selectedStrategy,
                        plan: updatedPlan
                    };
                    setSelectedStrategy(updatedStrategy);

                    // Save to Firestore
                    if (user) {
                        await setDoc(doc(db, 'users', user.id, 'strategies', selectedStrategy.id), updatedStrategy);
                    }
                }
            }

            showToast('Media uploaded and post scheduled!', 'success');
        } catch (error) {
            console.error('Failed to upload media:', error);
            showToast('Failed to upload media. Please try again.', 'error');
        } finally {
            setUploadingMedia(null);
        }
    };

    // When a plan exists but no selectedStrategy, create one to ensure plan persists
    useEffect(() => {
        if (plan && !selectedStrategy) {
            // Create a temporary strategy object for newly generated strategies
            setSelectedStrategy({
                id: `temp_${Date.now()}`,
                name: 'Current Strategy',
                plan: plan,
                goal: goal,
                niche: niche,
                audience: audience,
                status: 'active',
                linkedPostIds: [],
                createdAt: new Date().toISOString()
            });
        }
    }, [plan]);

    const handleArchiveStrategy = async (strategyId: string) => {
        try {
            await updateStrategyStatus(strategyId, 'archived');
            showToast('Strategy archived.', 'success');
            await loadStrategies();
        } catch (error: any) {
            showToast('Failed to archive strategy.', 'error');
        }
    };

    const handleExportStrategy = () => {
        if (!plan) return;
        const dataStr = JSON.stringify(plan, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `strategy-${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);
        showToast('Strategy exported!', 'success');
    };

    const handlePopulateCalendar = async () => {
        if (!plan) return;

        const today = new Date();
        // Start from tomorrow
        const startDate = new Date(today);
        startDate.setDate(today.getDate() + 1);

        let eventsAdded = 0;

        // Create all calendar events and await them
        const eventPromises = [];
        plan.weeks.forEach((week, wIndex) => {
            week.content.forEach((dayPlan) => {
                const eventDate = new Date(startDate);
                eventDate.setDate(startDate.getDate() + (wIndex * 7) + dayPlan.dayOffset);

                eventPromises.push(
                    addCalendarEvent({
                        id: `strat-${Date.now()}-${wIndex}-${dayPlan.dayOffset}-${eventsAdded}`,
                        title: dayPlan.topic,
                        date: eventDate.toISOString(),
                        type: dayPlan.format,
                        platform: dayPlan.platform,
                        status: 'Draft'
                    })
                );
                eventsAdded++;
            });
        });

        // Wait for all events to be saved
        await Promise.all(eventPromises);

        showToast(`Added ${eventsAdded} drafts to your calendar!`, 'success');
        setActivePage('calendar');
    };

    const handleRunWithAutopilot = async () => {
        if (!plan || !user) return;

        try {
            // Calculate total posts from plan
            const totalPosts = plan.weeks.reduce((total, week) => total + week.content.length, 0);

            // Create Autopilot campaign with the strategy plan
            const campaignId = await addAutopilotCampaign({
                goal: goal || 'Execute Content Strategy',
                niche: niche || 'General',
                audience: audience || 'General Audience',
                status: 'Generating Content',
                plan: plan,
            });

            // Update campaign with total posts (set after creation)
            await updateAutopilotCampaign(campaignId, {
                totalPosts: totalPosts,
                progress: 0,
            });

            showToast('Campaign created! Content generation has started.', 'success');
            setActivePage('autopilot');
        } catch (error) {
            console.error('Failed to create Autopilot campaign:', error);
            showToast('Failed to create Autopilot campaign. Please try again.', 'error');
        }
    };

    return (
        <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-full">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">AI Content Strategist</h1>
                    <p className="mt-2 text-gray-500 dark:text-gray-400">Stop guessing. Let AI build a data-driven roadmap for your growth.</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowHistory(!showHistory)}
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex items-center gap-2"
                    >
                        <ClockIcon className="w-4 h-4" />
                        {showHistory ? 'Hide' : 'View'} History ({savedStrategies.length})
                    </button>
                </div>
            </div>

            {/* Strategy History View */}
            {showHistory && (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Saved Strategies</h2>
                    {savedStrategies.length === 0 ? (
                        <p className="text-gray-500 dark:text-gray-400 text-center py-8">No saved strategies yet. Generate and save your first strategy!</p>
                    ) : (
                        <div className="space-y-3">
                            {savedStrategies.map((strategy) => (
                                <div
                                    key={strategy.id}
                                    className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h3 className="font-semibold text-gray-900 dark:text-white">{strategy.name}</h3>
                                                <span className={`text-xs px-2 py-1 rounded-full ${
                                                    strategy.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                                                    strategy.status === 'completed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                                                    'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                                                }`}>
                                                    {strategy.status || 'active'}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                                                Goal: {strategy.goal} • Niche: {strategy.niche} • Audience: {strategy.audience}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                Created: {new Date(strategy.createdAt).toLocaleDateString()}
                                                {strategy.plan?.weeks && ` • ${strategy.plan.weeks.length} weeks`}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 ml-4">
                                            <button
                                                onClick={() => handleLoadStrategy(strategy)}
                                                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
                                            >
                                                Load
                                            </button>
                                            <button
                                                onClick={() => handleArchiveStrategy(strategy.id)}
                                                className="p-1.5 text-gray-500 hover:text-red-600 transition-colors"
                                                title="Archive"
                                            >
                                                <TrashIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Input Section */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
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
                            {isBusiness ? (
                                // Business-focused goals
                                <>
                                    <option>Lead Generation</option>
                                    <option>Sales Conversion</option>
                                    <option>Brand Awareness</option>
                                    <option>Customer Engagement</option>
                                    {isAgencyPlan && <option>Increase Followers/Fans</option>}
                                </>
                            ) : (
                                // Creator-focused goals
                                <>
                                    <option>Increase Followers/Fans</option>
                                    <option>Brand Awareness</option>
                                    <option>Community Engagement</option>
                                    <option>Increase Engagement</option>
                                    <option>Sales Conversion</option>
                                </>
                            )}
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
                            <option>3 Weeks</option>
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
                            {showAdvancedOptions && (
                                <>
                            <option>Sexy / Bold</option>
                            <option>Sexy / Explicit</option>
                                </>
                            )}
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
                <div className="space-y-6 animate-fade-in-up">
                    <div className="flex justify-between items-center flex-wrap gap-4">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Your Strategy Plan</h2>
                        <div className="flex items-center gap-3">
                        <button 
                            onClick={() => setShowSaveModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                        >
                            <CheckCircleIcon className="w-5 h-5" /> Save Strategy
                        </button>
                        <button 
                            onClick={handleExportStrategy}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors shadow-sm"
                        >
                            <DownloadIcon className="w-5 h-5" /> Export
                        </button>
                        <button 
                            onClick={handlePopulateCalendar}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                        >
                            <CalendarIcon className="w-5 h-5" /> Populate Calendar
                        </button>
                            {(user?.userType === 'Creator' && ['Pro', 'Elite', 'Agency'].includes(user?.plan || '')) ||
                             (user?.userType === 'Business' && ['Starter', 'Growth', 'Agency'].includes(user?.plan || '')) ? (
                                <button 
                                    onClick={handleRunWithAutopilot}
                                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-600 to-purple-600 text-white rounded-lg hover:from-primary-700 hover:to-purple-700 transition-all shadow-lg font-medium"
                                >
                                    <div className="w-5 h-5"><RocketIcon /></div> Run with Autopilot
                                </button>
                            ) : null}
                        </div>
                    </div>

                    {/* Data Roadmap Section */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-2 mb-4">
                            <SparklesIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Data Roadmap & Success Metrics</h3>
                        </div>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Primary KPI */}
                            <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                                <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">Primary KPI</h4>
                                <p className="text-2xl font-bold text-blue-700 dark:text-blue-400 mb-1">
                                    {goal === 'Brand Awareness' ? 'Reach' : 
                                     goal === 'Lead Generation' ? 'Leads Generated' :
                                     goal === 'Sales Conversion' ? 'Revenue' :
                                     goal === 'Community Engagement' || goal === 'Customer Engagement' || goal === 'Increase Engagement' ? 'Engagement Rate' :
                                     goal === 'Increase Followers/Fans' ? 'Follower Growth' :
                                     'Engagement Rate'}
                                </p>
                                <p className="text-xs text-blue-600 dark:text-blue-400">Track this metric weekly to measure strategy success</p>
                            </div>

                            {/* Success Criteria */}
                            <div className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-lg border border-emerald-100 dark:border-emerald-800">
                                <h4 className="text-sm font-semibold text-emerald-900 dark:text-emerald-300 mb-2">Success Criteria</h4>
                                <ul className="space-y-1">
                                    {goal === 'Brand Awareness' && (
                                        <>
                                            <li className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                                                <CheckCircleIcon className="w-3 h-3" /> Reach 10K+ impressions per week
                                            </li>
                                            <li className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                                                <CheckCircleIcon className="w-3 h-3" /> 20%+ increase in profile visits
                                            </li>
                                        </>
                                    )}
                                    {goal === 'Lead Generation' && (
                                        <>
                                            <li className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                                                <CheckCircleIcon className="w-3 h-3" /> Generate 50+ qualified leads
                                            </li>
                                            <li className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                                                <CheckCircleIcon className="w-3 h-3" /> 5%+ conversion rate from traffic
                                            </li>
                                        </>
                                    )}
                                    {goal === 'Sales Conversion' && (
                                        <>
                                            <li className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                                                <CheckCircleIcon className="w-3 h-3" /> 15%+ increase in sales
                                            </li>
                                            <li className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                                                <CheckCircleIcon className="w-3 h-3" /> 10%+ improvement in ROI
                                            </li>
                                        </>
                                    )}
                                    {(goal === 'Community Engagement' || goal === 'Increase Engagement') && (
                                        <>
                                            <li className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                                                <CheckCircleIcon className="w-3 h-3" /> 25%+ increase in engagement rate
                                            </li>
                                            <li className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                                                <CheckCircleIcon className="w-3 h-3" /> 2x growth in comments/DMs
                                            </li>
                                        </>
                                    )}
                                    {goal === 'Customer Engagement' && (
                                        <>
                                            <li className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                                                <CheckCircleIcon className="w-3 h-3" /> 30%+ increase in customer interactions
                                            </li>
                                            <li className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                                                <CheckCircleIcon className="w-3 h-3" /> Higher customer satisfaction scores
                                            </li>
                                        </>
                                    )}
                                    {goal === 'Increase Followers/Fans' && (
                                        <>
                                            <li className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                                                <CheckCircleIcon className="w-3 h-3" /> 20%+ follower growth
                                            </li>
                                            <li className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                                                <CheckCircleIcon className="w-3 h-3" /> Improved follower quality (engagement ratio)
                                            </li>
                                        </>
                                    )}
                                </ul>
                            </div>
                        </div>

                        {/* Milestones Timeline */}
                        <div className="mt-6">
                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Milestones Timeline</h4>
                            <div className="space-y-4">
                                {plan.weeks.map((week, index) => (
                                    <div key={index} className="flex items-start gap-4">
                                        <div className="flex flex-col items-center">
                                            <div className={`w-3 h-3 rounded-full ${index === 0 ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
                                            {index < plan.weeks.length - 1 && (
                                                <div className="w-0.5 h-12 bg-gray-200 dark:bg-gray-700 my-1"></div>
                                            )}
                                        </div>
                                        <div className="flex-1 pb-4">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-sm font-semibold text-gray-900 dark:text-white">Week {week.weekNumber}</span>
                                                <span className="text-xs text-gray-500 dark:text-gray-400">{week.content.length} posts scheduled</span>
                                            </div>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{week.theme}</p>
                                            <div className="flex flex-wrap gap-2">
                                                {index === 0 && (
                                                    <span className="text-xs px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full">
                                                        Current Week
                                                    </span>
                                                )}
                                                {index === Math.floor(plan.weeks.length / 2) && (
                                                    <span className="text-xs px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full">
                                                        Mid-Point Check
                                                    </span>
                                                )}
                                                {index === plan.weeks.length - 1 && (
                                                    <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full">
                                                        Final Review
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Key Metrics to Track */}
                        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Key Metrics to Track</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {[
                                    { label: 'Impressions', icon: '👁️' },
                                    { label: 'Engagement', icon: '💬' },
                                    { label: 'Click-Through', icon: '🔗' },
                                    { label: 'Conversions', icon: '💰' }
                                ].map((metric, idx) => (
                                    <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
                                        <div className="text-2xl mb-1">{metric.icon}</div>
                                        <div className="text-xs font-medium text-gray-600 dark:text-gray-400">{metric.label}</div>
                                    </div>
                                ))}
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
                                💡 Monitor these metrics weekly in Analytics to track your roadmap progress
                            </p>
                        </div>

                        {/* Expected Outcomes */}
                        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Expected Outcomes</h4>
                            <div className="space-y-3">
                                {plan.weeks.map((week, idx) => {
                                    const weekOutcomes: Record<string, string> = {
                                        'Brand Awareness': `Week ${week.weekNumber}: Expected ${(idx + 1) * 15}% increase in reach and impressions`,
                                        'Lead Generation': `Week ${week.weekNumber}: Target ${(idx + 1) * 10} qualified leads from content`,
                                        'Sales Conversion': `Week ${week.weekNumber}: Aim for ${(idx + 1) * 5}% increase in conversion rate`,
                                        'Community Engagement': `Week ${week.weekNumber}: Target ${(idx + 1) * 20}% boost in engagement rate`,
                                        'Increase Engagement': `Week ${week.weekNumber}: Target ${(idx + 1) * 20}% boost in engagement rate`,
                                        'Customer Engagement': `Week ${week.weekNumber}: Target ${(idx + 1) * 25}% increase in customer interactions`,
                                        'Increase Followers/Fans': `Week ${week.weekNumber}: Goal of ${(idx + 1) * 50} new followers`
                                    };
                                    return (
                                        <div key={idx} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center text-xs font-bold">
                                                {week.weekNumber}
                                            </div>
                                            <p className="text-sm text-gray-700 dark:text-gray-300">{weekOutcomes[goal] || `Week ${week.weekNumber}: Track progress towards ${goal.toLowerCase()}`}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Performance Tracking */}
                        {plan && (
                            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Performance Tracking</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-800">
                                        <div className="text-green-600 dark:text-green-400 text-sm font-semibold mb-1">Posts Created</div>
                                        <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                                            {selectedStrategy?.linkedPostIds?.length || 0}
                                        </div>
                                        <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                                            of {plan.weeks.reduce((total, week) => total + week.content.length, 0)} planned
                                        </div>
                                    </div>
                                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                                        <div className="text-blue-600 dark:text-blue-400 text-sm font-semibold mb-1">Progress</div>
                                        <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                                            {plan.weeks.length > 0 ? Math.round(((selectedStrategy?.linkedPostIds?.length || 0) / plan.weeks.reduce((total, week) => total + week.content.length, 0)) * 100) : 0}%
                                        </div>
                                        <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2 mt-2">
                                            <div 
                                                className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all"
                                                style={{ 
                                                    width: `${Math.min(((selectedStrategy?.linkedPostIds?.length || 0) / plan.weeks.reduce((total, week) => total + week.content.length, 0)) * 100, 100)}%` 
                                                }}
                                            ></div>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800">
                                        <div className="text-purple-600 dark:text-purple-400 text-sm font-semibold mb-1">Status</div>
                                        <div className="text-lg font-bold text-purple-700 dark:text-purple-300 capitalize">
                                            {selectedStrategy?.status || 'Active'}
                                        </div>
                                        <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                                            {selectedStrategy?.metrics?.lastUpdate ? `Updated ${new Date(selectedStrategy.metrics.lastUpdate).toLocaleDateString()}` : 'Ready to start'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Analytics Integration */}
                        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Analytics Integration</h4>
                                <button 
                                    onClick={() => setActivePage('analytics')}
                                    className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
                                >
                                    View Analytics →
                                </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800">
                                    <div className="text-purple-600 dark:text-purple-400 text-sm font-semibold mb-1">Weekly Reports</div>
                                    <div className="text-xs text-purple-700 dark:text-purple-300">Auto-generated insights every Monday</div>
                                </div>
                                <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-100 dark:border-orange-800">
                                    <div className="text-orange-600 dark:text-orange-400 text-sm font-semibold mb-1">Real-time Tracking</div>
                                    <div className="text-xs text-orange-700 dark:text-orange-300">Monitor performance as you post</div>
                                </div>
                                <div className="p-3 bg-pink-50 dark:bg-pink-900/20 rounded-lg border border-pink-100 dark:border-pink-800">
                                    <div className="text-pink-600 dark:text-pink-400 text-sm font-semibold mb-1">AI Insights</div>
                                    <div className="text-xs text-pink-700 dark:text-pink-300">Get recommendations based on data</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {plan.weeks.map((week, weekIndex) => {
                        const weekProgress = selectedStrategy?.linkedPostIds 
                            ? Math.round((week.content.filter((_, idx) => selectedStrategy.linkedPostIds?.includes(`week-${weekIndex}-day-${idx}`)).length / week.content.length) * 100)
                            : 0;
                        
                        return (
                        <div key={weekIndex} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden border border-gray-100 dark:border-gray-700">
                            <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900/50 dark:to-gray-800/50 p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-1">
                                        <h4 className="font-bold text-lg text-gray-800 dark:text-gray-200">Week {week.weekNumber}: {week.theme}</h4>
                                        <span className={`text-xs px-2 py-1 rounded-full ${
                                            weekProgress === 100 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                                            weekProgress > 0 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                                            'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                                        }`}>
                                            {weekProgress}% Complete
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {week.content.filter(c => c.format === 'Post').length} Posts • 
                                        {week.content.filter(c => c.format === 'Reel').length} Reels • 
                                        {week.content.filter(c => c.format === 'Story').length} Stories
                                    </p>
                                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-2">
                                        <div 
                                            className="bg-primary-600 dark:bg-primary-400 h-1.5 rounded-full transition-all"
                                            style={{ width: `${weekProgress}%` }}
                                        ></div>
                                    </div>
                                </div>
                                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider bg-white dark:bg-gray-700 px-3 py-1 rounded-full ml-4">{week.content.length} Total</span>
                            </div>
                            <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                {week.content.map((day, dayIndex) => {
                                    const itemKey = `${weekIndex}-${dayIndex}`;
                                    const isUploading = uploadingMedia?.weekIndex === weekIndex && uploadingMedia?.dayIndex === dayIndex;
                                    const status = day.status || 'draft';
                                    const statusColors = {
                                        draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
                                        ready: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
                                        scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
                                        posted: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                                    };

                                    return (
                                    <div key={dayIndex} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
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
                                                <p className="font-medium text-gray-900 dark:text-white mb-1">{day.topic}</p>
                                                {/* Show image/video ideas if available */}
                                                {(day.imageIdeas && day.imageIdeas.length > 0) || (day.videoIdeas && day.videoIdeas.length > 0) ? (
                                                    <div className="mt-2 space-y-1">
                                                        {day.imageIdeas && day.imageIdeas.length > 0 && (
                                                            <div className="text-xs text-gray-600 dark:text-gray-400">
                                                                <span className="font-medium">Image ideas:</span> {day.imageIdeas.slice(0, 2).join(', ')}
                                                                {day.imageIdeas.length > 2 && ` +${day.imageIdeas.length - 2} more`}
                                                            </div>
                                                        )}
                                                        {day.videoIdeas && day.videoIdeas.length > 0 && (
                                                            <div className="text-xs text-gray-600 dark:text-gray-400">
                                                                <span className="font-medium">Video ideas:</span> {day.videoIdeas.slice(0, 2).join(', ')}
                                                                {day.videoIdeas.length > 2 && ` +${day.videoIdeas.length - 2} more`}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : null}
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                {/* Media Preview/Upload */}
                                                {day.mediaUrl ? (
                                                    <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-700">
                                                        {day.mediaType === 'image' ? (
                                                            <img src={day.mediaUrl} alt="Uploaded" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <video src={day.mediaUrl} className="w-full h-full object-cover" />
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="relative">
                                                        <input
                                                            ref={el => fileInputRefs.current[itemKey] = el}
                                                            type="file"
                                                            accept="image/*,video/*"
                                                            onChange={(e) => {
                                                                const file = e.target.files?.[0];
                                                                if (file) {
                                                                    handleMediaUpload(weekIndex, dayIndex, file);
                                                                }
                                                            }}
                                                            className="hidden"
                                                        />
                                                        <button
                                                            onClick={() => fileInputRefs.current[itemKey]?.click()}
                                                            disabled={isUploading}
                                                            className="w-16 h-16 flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary-500 dark:hover:border-primary-400 transition-colors disabled:opacity-50"
                                                            title="Upload media"
                                                        >
                                                            {isUploading ? (
                                                                <div className="animate-spin w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full" />
                                                            ) : (
                                                                <UploadIcon className="w-5 h-5 text-gray-400" />
                                                            )}
                                                        </button>
                                                    </div>
                                                )}
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[status] || statusColors.draft}`}>
                                                    {status === 'draft' ? 'Draft' : status === 'ready' ? 'Ready' : status === 'scheduled' ? 'Scheduled' : 'Posted'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    );
                                })}
                            </div>
                        </div>
                        );
                    })}
                </div>
            )}

            {/* Save Strategy Modal */}
            {showSaveModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-xl max-w-md w-full mx-4">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Save Strategy</h3>
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Strategy Name
                            </label>
                            <input
                                type="text"
                                value={strategyName}
                                onChange={(e) => setStrategyName(e.target.value)}
                                placeholder="e.g., Q1 Content Strategy"
                                className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 dark:text-white"
                                autoFocus
                            />
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => {
                                    setShowSaveModal(false);
                                    setStrategyName('');
                                }}
                                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveStrategy}
                                disabled={isSaving || !strategyName.trim()}
                                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {isSaving ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
