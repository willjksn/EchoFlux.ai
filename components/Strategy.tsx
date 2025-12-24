
import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from './AppContext';
import { StrategyPlan, Platform, WeekPlan, DayPlan, Post, CalendarEvent, MediaLibraryItem } from '../types';
import { generateContentStrategy, saveStrategy, getStrategies, updateStrategyStatus, analyzeMediaForPost, generateCaptions } from "../src/services/geminiService";
import { TargetIcon, SparklesIcon, CalendarIcon, CheckCircleIcon, RocketIcon, DownloadIcon, TrashIcon, ClockIcon, UploadIcon, ImageIcon, XMarkIcon, CopyIcon } from './icons/UIIcons';
import { UpgradePrompt } from './UpgradePrompt';
import { storage } from '../firebaseConfig';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db } from '../firebaseConfig';
import { doc, setDoc, getDoc, collection, getDocs, query, orderBy, deleteDoc } from 'firebase/firestore';
import { OFFLINE_MODE } from '../constants';

export const Strategy: React.FC = () => {
    const { 
        showToast, 
        setActivePage, 
        user, 
        settings,
        posts,
        setPosts
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
    
    // Auto-set explicit tone when OnlyFans/Fanvue is selected
    useEffect(() => {
        if ((platformFocus === 'OnlyFans' || platformFocus === 'Fanvue') && 
            tone !== 'Explicit/Adult Content' && 
            tone !== 'Sexy / Explicit' && 
            tone !== 'Sexy / Bold') {
            setTone('Explicit/Adult Content');
        } else if (platformFocus !== 'OnlyFans' && 
                   platformFocus !== 'Fanvue' && 
                   (tone === 'Explicit/Adult Content' || tone === 'Sexy / Explicit')) {
            setTone('Professional');
        }
    }, [platformFocus, tone]);
    const [isLoading, setIsLoading] = useState(false);
    const [plan, setPlan] = useState<StrategyPlan | null>(null);
    const [savedStrategies, setSavedStrategies] = useState<any[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [strategyName, setStrategyName] = useState('');
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [selectedStrategy, setSelectedStrategy] = useState<any | null>(null);
    const [uploadingMedia, setUploadingMedia] = useState<{ weekIndex: number; dayIndex: number } | null>(null);
    const [showMediaLibrary, setShowMediaLibrary] = useState<{ weekIndex: number; dayIndex: number } | null>(null);
    const [mediaLibraryItems, setMediaLibraryItems] = useState<MediaLibraryItem[]>([]);
    const [generatingCaption, setGeneratingCaption] = useState<{ weekIndex: number; dayIndex: number } | null>(null);
    const [loadingMediaItem, setLoadingMediaItem] = useState<string | null>(null);
    const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
    
    // Usage stats
    const [usageStats, setUsageStats] = useState<{
        strategy: { count: number; limit: number; remaining: number; month: string };
        tavily: { count: number; limit: number; remaining: number; month: string };
    } | null>(null);

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

    // Free plan gets 1 basic strategy/month, Pro/Elite get more
    // Only show upgrade prompt for plans that don't have strategy access at all
    const hasStrategyAccess = user?.role === 'Admin' || 
                               ['Free', 'Pro', 'Elite'].includes(user?.plan || '');

    // Load usage stats
    const loadUsageStats = async () => {
        if (!user?.id) return;
        try {
            const { auth } = await import('../firebaseConfig');
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            const response = await fetch('/api/getUsageStats', {
                headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
            });
            if (response.ok) {
                const data = await response.json();
                setUsageStats(data);
            } else {
                console.error('Failed to load usage stats:', response.status, response.statusText);
            }
        } catch (error) {
            console.error('Failed to load usage stats:', error);
        }
    };

    // Track if we should auto-generate from opportunity
    const [shouldAutoGenerate, setShouldAutoGenerate] = useState(false);

    // Load saved strategies and active roadmap on mount
    useEffect(() => {
        loadStrategies();
        loadActiveRoadmap();
        loadMediaLibrary();
        loadUsageStats();
        
        // Check for opportunity sent from Opportunities page
        if (user?.id) {
            const opportunityData = localStorage.getItem(`opportunity_for_strategy_${user.id}`);
            if (opportunityData) {
                try {
                    const data = JSON.parse(opportunityData);
                    if (data.opportunity && data.niche) {
                        setNiche(data.niche);
                        setGoal(data.goal || 'Increase Followers/Fans');
                        setAudience(data.opportunity.platform || 'General Audience');
                        // Set flag to auto-generate after state updates
                        setShouldAutoGenerate(true);
                    }
                } catch (error) {
                    console.error('Failed to load opportunity for strategy:', error);
                    localStorage.removeItem(`opportunity_for_strategy_${user.id}`);
                }
            }
        }
    }, [user?.id]);



    const loadMediaLibrary = async () => {
        if (!user) return;
        try {
            const mediaRef = collection(db, 'users', user.id, 'media_library');
            const q = query(mediaRef, orderBy('uploadedAt', 'desc'));
            const snapshot = await getDocs(q);
            
            const items: MediaLibraryItem[] = [];
            snapshot.forEach((doc) => {
                items.push({
                    id: doc.id,
                    ...doc.data(),
                } as MediaLibraryItem);
            });
            
            setMediaLibraryItems(items);
        } catch (error) {
            console.error('Failed to load media library:', error);
        }
    };

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

    if (!hasStrategyAccess) {
         return <UpgradePrompt featureName="AI Content Strategist" onUpgradeClick={() => setActivePage('pricing')} />;
    }

    const handleGenerate = async () => {
        if (!niche || !audience) {
            showToast('Please fill in all required fields.', 'error');
            return;
        }
        setIsLoading(true);
        
        // Clear opportunity data after starting generation
        if (user?.id) {
            localStorage.removeItem(`opportunity_for_strategy_${user.id}`);
        }
        
        try {
            const result = await generateContentStrategy(niche, audience, goal, duration, tone, platformFocus, null, undefined);
            if (result && result.weeks) {
                // Initialize status for all content items
                const planWithStatus = {
                    ...result,
                    weeks: result.weeks.map((week: WeekPlan) => ({
                        ...week,
                        content: week.content.map((day: DayPlan) => ({
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
                // Note: This is NOT saved to Firestore - user must click "Save Strategy" to save it
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
                
                // Reload usage stats to reflect the new generation
                // Add a small delay to ensure Firestore has updated
                setTimeout(async () => {
                    await loadUsageStats();
                }, 1000);
                
                showToast('Strategy generated! Click "Save Strategy" to save it to your history.', 'success');
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

    // Auto-generate when opportunity is loaded
    useEffect(() => {
        if (shouldAutoGenerate && niche && audience && !isLoading) {
            setShouldAutoGenerate(false);
            // Small delay to ensure state is updated
            setTimeout(() => {
                handleGenerate();
            }, 300);
        }
    }, [shouldAutoGenerate, niche, audience, isLoading]);

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

        const fileType: 'image' | 'video' = file.type.startsWith('image') ? 'image' : 'video';
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

            // Save to media library
            try {
                const mediaLibraryItem: MediaLibraryItem = {
                    id: timestamp.toString(),
                    userId: user.id,
                    url: mediaUrl,
                    name: file.name || `Strategy Media ${new Date().toLocaleDateString()}`,
                    type: fileType,
                    mimeType: file.type,
                    size: file.size,
                    uploadedAt: new Date().toISOString(),
                    usedInPosts: [],
                    tags: [],
                };
                await setDoc(doc(db, 'users', user.id, 'media_library', mediaLibraryItem.id), mediaLibraryItem);
            } catch (libraryError) {
                // Don't fail the upload if media library save fails
                console.error('Failed to save to media library:', libraryError);
            }

            // Get the current day to use for analysis
            const currentDay = plan.weeks[weekIndex].content[dayIndex];
            
            // Analyze media and generate caption using AI
            let generatedCaption = currentDay.topic; // Default to topic
            let suggestedMediaType: 'image' | 'video' | undefined = fileType;
            
            try {
                const analysis = await analyzeMediaForPost({
                    mediaUrl,
                    goal: goal,
                    tone: tone,
                });
                
                generatedCaption = analysis.caption || currentDay.topic;
                // Add hashtags to caption if provided
                if (analysis.hashtags && analysis.hashtags.length > 0) {
                    generatedCaption += '\n\n' + analysis.hashtags.join(' ');
                }
                
                // Determine suggested media type based on analysis
                // If videoIdeas exist and are more relevant, suggest video
                if (currentDay.videoIdeas && currentDay.videoIdeas.length > 0 && fileType === 'image') {
                    // Could suggest video based on content analysis
                    suggestedMediaType = fileType; // Keep uploaded type for now
                }
            } catch (error) {
                console.error('Failed to analyze media:', error);
                // Continue with default caption if analysis fails
            }

            // Update plan with media and generated caption
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
                                mediaUrl, // Use Firebase URL for storage
                                mediaType: fileType,
                                caption: generatedCaption, // Auto-populate caption
                                suggestedMediaType: suggestedMediaType,
                                status: 'ready' as const
                            };
                        })
                    };
                })
            };
            
            setPlan(updatedPlan);
            
            // Update selectedStrategy if it exists
            if (selectedStrategy) {
                const updatedStrategy = {
                    ...selectedStrategy,
                    plan: updatedPlan
                };
                setSelectedStrategy(updatedStrategy);
                
                // Save updated strategy to Firestore
                try {
                    await setDoc(doc(db, 'users', user.id, 'strategies', selectedStrategy.id), updatedStrategy);
                } catch (error) {
                    console.error('Failed to save updated strategy:', error);
                }
            }

            // Create a post + calendar event so this day shows up on the planning calendar.
            // Status is "Ready" (not "Scheduled") - user will schedule it when ready.
            // This does NOT auto-post; it is for planning and manual posting later.
            // Get the updated day for calendar
            const updatedDay = updatedPlan.weeks[weekIndex].content[dayIndex];

            // Calculate suggested date based on roadmap (for planning purposes)
            const today = new Date();
            const suggestedDate = new Date(today);
            suggestedDate.setDate(today.getDate() + (weekIndex * 7) + updatedDay.dayOffset);
            suggestedDate.setHours(14, 0, 0, 0); // Default to 2 PM

            // Create a post + calendar event so it appears as "Ready" content
            const postId = `roadmap-${selectedStrategy?.id || 'temp'}-${weekIndex}-${dayIndex}-${Date.now()}`;

            if (user) {
                const newPost: Post = {
                    id: postId,
                    content: updatedDay.caption || generatedCaption || updatedDay.topic, // Use generated caption
                    mediaUrl: mediaUrl,
                    mediaType: fileType,
                    platforms: [updatedDay.platform],
                    status: 'Draft', // Draft until user schedules it
                    author: { name: user.name, avatar: user.avatar },
                    comments: [],
                    scheduledDate: suggestedDate.toISOString(), // Suggested date, not actual schedule
                    clientId: user.userType === 'Business' ? user.id : undefined,
                };

                const safePost = JSON.parse(JSON.stringify(newPost));
                await setDoc(doc(db, 'users', user.id, 'posts', postId), safePost);

                // Keep local posts state in sync so Calendar/Drafts update immediately
                if (setPosts) {
                    setPosts(prev => {
                        const others = prev.filter(p => p.id !== postId);
                        return [...others, { ...safePost }];
                    });
                }

                // Calendar component will auto-create event from post

                // Update roadmap item status to "ready" (not "scheduled") and link post
                // Status stays as "ready" - it was already set above
                // Just link the post ID
                const updatedPlanWithLink = {
                    ...updatedPlan,
                    weeks: updatedPlan.weeks.map((week, wIdx) => {
                        if (wIdx !== weekIndex) return week;
                        return {
                            ...week,
                            content: week.content.map((d, dIdx) => {
                                if (dIdx !== dayIndex) return d;
                                return {
                                    ...d,
                                    linkedPostId: postId
                                    // Status is already "ready" from above
                                };
                            })
                        };
                    })
                };

                setPlan(updatedPlanWithLink);

                // Update selectedStrategy
                if (selectedStrategy) {
                    const updatedStrategy = {
                        ...selectedStrategy,
                        plan: updatedPlanWithLink,
                        linkedPostIds: [...(selectedStrategy.linkedPostIds || []), postId]
                    };
                    setSelectedStrategy(updatedStrategy);

                    // Save to Firestore
                    await setDoc(doc(db, 'users', user.id, 'strategies', selectedStrategy.id), updatedStrategy);
                }
            }

            showToast('Media uploaded, caption generated, and added to your calendar as "Ready".', 'success');
        } catch (error) {
            console.error('Failed to upload media:', error);
            showToast('Failed to upload media. Please try again.', 'error');
        } finally {
            setUploadingMedia(null);
        }
    };

    // Attach an existing media library item to a specific roadmap day
    const handleSelectFromMediaLibrary = async (weekIndex: number, dayIndex: number, item: MediaLibraryItem) => {
        if (!plan) return;

        // Set loading state for this specific item
        setLoadingMediaItem(item.id);

        try {
            const mediaType: 'image' | 'video' =
                item.type === 'video' || item.mimeType?.startsWith('video')
                    ? 'video'
                    : 'image';

            const currentDay = plan.weeks[weekIndex].content[dayIndex];

            // Analyze media and generate caption using AI (similar to direct upload)
            let generatedCaption = currentDay.caption || currentDay.topic;
            let suggestedMediaType: 'image' | 'video' | undefined = mediaType;

            try {
                const analysis = await analyzeMediaForPost({
                    mediaUrl: item.url,
                    goal: goal,
                    tone: tone,
                });

                generatedCaption = analysis.caption || generatedCaption;
                if (analysis.hashtags && analysis.hashtags.length > 0) {
                    generatedCaption += '\n\n' + analysis.hashtags.join(' ');
                }
            } catch (error) {
                console.error('Failed to analyze media from library:', error);
                // Fall back to topic / existing caption
            }

            const basePlan: StrategyPlan = {
                ...plan,
                weeks: plan.weeks.map((week, wIdx) => {
                    if (wIdx !== weekIndex) return week;
                    return {
                        ...week,
                        content: week.content.map((day, dIdx) => {
                            if (dIdx !== dayIndex) return day;
                            return {
                                ...day,
                                mediaUrl: item.url,
                                mediaType,
                                caption: generatedCaption,
                                suggestedMediaType,
                                status: 'ready' as const,
                            };
                        }),
                    };
                }),
            };

            // Calculate suggested date for this roadmap day (for planning purposes)
            const today = new Date();
            const suggestedDate = new Date(today);
            suggestedDate.setDate(today.getDate() + (weekIndex * 7) + currentDay.dayOffset);
            suggestedDate.setHours(14, 0, 0, 0); // 2 PM by default

            const postId = `roadmap-${selectedStrategy?.id || 'temp'}-${weekIndex}-${dayIndex}-${Date.now()}`;

            // Create a Post + calendar event so this shows up on Calendar as "Ready"
            if (user) {
                const newPost: Post = {
                    id: postId,
                    content: generatedCaption || currentDay.topic,
                    mediaUrl: item.url,
                    mediaType,
                    platforms: [currentDay.platform],
                    status: 'Draft', // Draft until user schedules it
                    author: { name: user.name, avatar: user.avatar },
                    comments: [],
                    scheduledDate: suggestedDate.toISOString(), // Suggested date, not actual schedule
                    clientId: user.userType === 'Business' ? user.id : undefined,
                };

                const safePost = JSON.parse(JSON.stringify(newPost));
                await setDoc(doc(db, 'users', user.id, 'posts', postId), safePost);

                // Keep local posts state in sync so Calendar/Drafts update immediately
                if (setPosts) {
                    setPosts(prev => {
                        const others = prev.filter(p => p.id !== postId);
                        return [...others, { ...safePost }];
                    });
                }

                // Calendar component will auto-create event from post
            }

            // Mark this roadmap day as "ready" (not "scheduled") and link the post
            // Status is already "ready" from basePlan above
            const updatedPlanWithLink: StrategyPlan = {
                ...basePlan,
                weeks: basePlan.weeks.map((week, wIdx) => {
                    if (wIdx !== weekIndex) return week;
                    return {
                        ...week,
                        content: week.content.map((day, dIdx) => {
                            if (dIdx !== dayIndex) return day;
                            return {
                                ...day,
                                linkedPostId: postId,
                                // Status is already "ready" from basePlan
                            };
                        }),
                    };
                }),
            };

            setPlan(updatedPlanWithLink);

            // Persist into the selected strategy document if it exists
            if (selectedStrategy && user) {
                const updatedStrategy = {
                    ...selectedStrategy,
                    plan: updatedPlanWithLink,
                    linkedPostIds: [...(selectedStrategy.linkedPostIds || []), postId],
                };
                setSelectedStrategy(updatedStrategy);
                try {
                    await setDoc(doc(db, 'users', user.id, 'strategies', selectedStrategy.id), updatedStrategy);
                } catch (err) {
                    console.error('Failed to save updated strategy after selecting media from library:', err);
                }
            }

            setShowMediaLibrary(null);
            setLoadingMediaItem(null);
            showToast('Media attached from your library, caption generated, and added to your calendar as "Ready".', 'success');
        } catch (error) {
            console.error('Failed to attach media from library:', error);
            setLoadingMediaItem(null);
            showToast('Failed to attach media from your library. Please try again.', 'error');
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

    const handleDeleteStrategy = async (strategyId: string) => {
        if (!window.confirm('Are you sure you want to delete this strategy? This action cannot be undone.')) {
            return;
        }
        if (!user) return;
        try {
            // Actually delete the strategy from Firestore
            await deleteDoc(doc(db, 'users', user.id, 'strategies', strategyId));
            showToast('Strategy deleted.', 'success');
            await loadStrategies();
        } catch (error: any) {
            console.error('Failed to delete strategy:', error);
            showToast('Failed to delete strategy.', 'error');
        }
    };

    const formatStrategyAsText = (plan: StrategyPlan): string => {
        let text = '='.repeat(60) + '\n';
        text += 'CONTENT STRATEGY EXPORT\n';
        text += '='.repeat(60) + '\n\n';
        
        if (niche) text += `Niche: ${niche}\n`;
        if (audience) text += `Audience: ${audience}\n`;
        if (goal) text += `Goal: ${goal}\n`;
        if (duration) text += `Duration: ${duration}\n`;
        if (tone) text += `Tone: ${tone}\n`;
        if (platformFocus) text += `Platform Focus: ${platformFocus}\n`;
        text += '\n' + '='.repeat(60) + '\n\n';
        
        plan.weeks.forEach((week, weekIndex) => {
            text += `\nWEEK ${week.weekNumber}: ${week.theme}\n`;
            text += '-'.repeat(60) + '\n';
            
            week.content.forEach((day, dayIndex) => {
                const today = new Date();
                const scheduledDate = new Date(today);
                scheduledDate.setDate(today.getDate() + (weekIndex * 7) + day.dayOffset);
                scheduledDate.setHours(14, 0, 0, 0);
                
                text += `\nDay ${day.dayOffset + 1} - ${day.format} (${scheduledDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})\n`;
                text += `Platform: ${day.platform}\n`;
                text += `Topic: ${day.topic}\n`;
                if (day.caption) {
                    text += `\nCaption:\n${day.caption}\n`;
                }
                if (day.mediaUrl) {
                    text += `\nMedia: ${day.mediaType === 'image' ? 'Image' : 'Video'}\n`;
                    text += `Media URL: ${day.mediaUrl}\n`;
                }
                if (day.imageIdeas && day.imageIdeas.length > 0) {
                    text += `\nImage Ideas:\n`;
                    day.imageIdeas.forEach((idea, idx) => {
                        text += `  ${idx + 1}. ${idea}\n`;
                    });
                }
                if (day.videoIdeas && day.videoIdeas.length > 0) {
                    text += `\nVideo Ideas:\n`;
                    day.videoIdeas.forEach((idea, idx) => {
                        text += `  ${idx + 1}. ${idea}\n`;
                    });
                }
                text += `\nStatus: ${day.status || 'draft'}\n`;
                text += '-'.repeat(60) + '\n';
            });
        });
        
        text += '\n' + '='.repeat(60) + '\n';
        text += `Generated: ${new Date().toLocaleString()}\n`;
        text += '='.repeat(60) + '\n';
        
        return text;
    };

    const handleExportStrategy = () => {
        if (!plan) return;
        const textContent = formatStrategyAsText(plan);
        const dataBlob = new Blob([textContent], { type: 'text/plain' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `strategy-${Date.now()}.txt`;
        link.click();
        URL.revokeObjectURL(url);
        showToast('Strategy exported as TXT!', 'success');
    };

    const handleCopyStrategy = () => {
        if (!plan) return;
        const textContent = formatStrategyAsText(plan);
        navigator.clipboard.writeText(textContent).then(() => {
            showToast('Strategy copied to clipboard!', 'success');
        }).catch(() => {
            showToast('Failed to copy to clipboard', 'error');
        });
    };

    const handlePopulateCalendar = async () => {
        if (!plan || !user) return;

        let eventsAdded = 0;
        const today = new Date();

        for (let w = 0; w < plan.weeks.length; w++) {
            for (let d = 0; d < plan.weeks[w].content.length; d++) {
                const day = plan.weeks[w].content[d];

                // Skip if already linked
                if (day.linkedPostId) continue;

                const scheduledDate = new Date(today);
                scheduledDate.setDate(today.getDate() + (w * 7) + day.dayOffset);
                scheduledDate.setHours(14, 0, 0, 0);

                const postId = `roadmap-${selectedStrategy?.id}-${w}-${d}-${Date.now()}`;

                const post: Post = {
                    id: postId,
                    content: day.caption || day.topic,
                    mediaUrl: day.mediaUrl,
                    mediaType: day.mediaType || 'image',
                    platforms: [day.platform],
                    status: 'Draft',
                    author: { name: user.name, avatar: user.avatar },
                    comments: [],
                    scheduledDate: scheduledDate.toISOString(),
                };

                await setDoc(
                    doc(db, 'users', user.id, 'posts', postId),
                    JSON.parse(JSON.stringify(post))
                );

                setPosts(prev => [...prev, post]);
                eventsAdded++;
            }
        }

        showToast(`Added ${eventsAdded} drafts to your calendar!`, 'success');
        setActivePage('calendar');
    };


    return (
        <div className="p-4 sm:p-6 bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 min-h-full overflow-x-hidden">
            {/* Modern Header */}
            <div className="mb-8">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-4">
                    <div className="flex-1 min-w-0">
                        <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-primary-600 to-primary-800 dark:from-primary-400 dark:to-primary-600 bg-clip-text text-transparent mb-2">
                            AI Content Strategist
                        </h1>
                        <p className="text-base sm:text-lg text-gray-600 dark:text-gray-400">
                            Create an AI-powered content strategy tailored to your primary goal using niche research, current trends, and your content history
                        </p>
                    </div>
                    <button
                        onClick={() => setShowHistory(!showHistory)}
                        className="px-5 py-2.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 shadow-sm border border-gray-200 dark:border-gray-700 flex-shrink-0 whitespace-nowrap"
                    >
                        <ClockIcon className="w-5 h-5" />
                        {showHistory ? 'Hide' : 'View'} Saved ({savedStrategies.length})
                    </button>
                </div>
                
                {/* Stats Cards */}
                {posts && posts.filter(p => p.status === 'Published').length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Published Posts</div>
                            <div className="text-2xl font-bold text-gray-900 dark:text-white">
                                {posts.filter(p => p.status === 'Published').length}
                            </div>
                        </div>
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Planned Platforms</div>
                            <div className="text-2xl font-bold text-gray-900 dark:text-white">
                                {new Set(posts.filter(p => p.status === 'Published' || p.status === 'Scheduled').flatMap(p => p.platforms || [])).size}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Platforms you're planning for</div>
                        </div>
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Content Mix</div>
                            <div className="text-2xl font-bold text-gray-900 dark:text-white">
                                {posts.filter(p => (p.status === 'Published' || p.status === 'Scheduled') && p.mediaType === 'image').length} Images, {posts.filter(p => (p.status === 'Published' || p.status === 'Scheduled') && p.mediaType === 'video').length} Videos
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Planned content types</div>
                        </div>
                    </div>
                )}
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
                                                onClick={() => handleDeleteStrategy(strategy.id)}
                                                className="p-1.5 text-gray-500 hover:text-red-600 transition-colors"
                                                title="Delete"
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

            {/* Redesigned Input Section */}
            <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 p-8 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 mb-6">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                        <SparklesIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                        Create Your Content Strategy
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">
                        AI creates a personalized strategy for your primary goal using niche research, current social media trends, and insights from your content history.
                    </p>
                </div>


                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-white mb-2">
                            Brand Niche <span className="text-red-500">*</span>
                        </label>
                        <input 
                            type="text" 
                            value={niche} 
                            onChange={e => setNiche(e.target.value)} 
                            placeholder="e.g. Vegan Skincare, Fitness Coaching, Tech Reviews" 
                            className="w-full p-3.5 border-2 rounded-xl bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:text-white dark:placeholder-gray-400 transition-all"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-white mb-2">
                            Target Audience <span className="text-red-500">*</span>
                        </label>
                        <input 
                            type="text" 
                            value={audience} 
                            onChange={e => setAudience(e.target.value)} 
                            placeholder="e.g. Busy Moms in 30s, Tech Enthusiasts, Fitness Beginners" 
                            className="w-full p-3.5 border-2 rounded-xl bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:text-white dark:placeholder-gray-400 transition-all"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-white mb-2">
                            Primary Goal <span className="text-red-500">*</span>
                        </label>
                        <select 
                            value={goal} 
                            onChange={e => setGoal(e.target.value)} 
                            className="w-full p-3.5 border-2 rounded-xl bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:text-white transition-all"
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
                        <label className="block text-sm font-semibold text-gray-700 dark:text-white mb-2">
                            Duration
                        </label>
                        <select 
                            value={duration} 
                            onChange={e => setDuration(e.target.value)} 
                            className="w-full p-3.5 border-2 rounded-xl bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:text-white transition-all"
                        >
                            <option>1 Week</option>
                            <option>2 Weeks</option>
                            <option>3 Weeks</option>
                            <option>4 Weeks</option>
                            <option>6 Weeks</option>
                            <option>8 Weeks</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-white mb-2">
                            Tone
                        </label>
                        <select 
                            value={tone} 
                            onChange={e => setTone(e.target.value)} 
                            className="w-full p-3.5 border-2 rounded-xl bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:text-white transition-all"
                        >
                            <option>Professional</option>
                            <option>Casual & Friendly</option>
                            <option>Edgy & Bold</option>
                            <option>Educational</option>
                            <option>Inspirational</option>
                            {(platformFocus === 'OnlyFans' || platformFocus === 'Fanvue') && (
                                <option value="Explicit/Adult Content">Explicit/Adult Content 🌶️</option>
                            )}
                            {showAdvancedOptions && (
                                <>
                                    <option>Sexy / Bold</option>
                                    <option>Sexy / Explicit</option>
                                </>
                            )}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-white mb-2">
                            Platform Focus
                        </label>
                        <select 
                            value={platformFocus} 
                            onChange={e => setPlatformFocus(e.target.value)} 
                            className="w-full p-3.5 border-2 rounded-xl bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:text-white transition-all"
                        >
                            <option>Mixed / All</option>
                            <option value="Instagram">Instagram Focus</option>
                            <option value="TikTok">TikTok Focus</option>
                            <option value="X">X (Twitter) Focus</option>
                            <option value="Threads">Threads Focus</option>
                            <option value="YouTube">YouTube Focus</option>
                            <option value="LinkedIn">LinkedIn Focus</option>
                            <option value="Facebook">Facebook Focus</option>
                            <option value="Pinterest">Pinterest Focus</option>
                            <option value="OnlyFans">OnlyFans Focus</option>
                        </select>
                    </div>
                </div>

                {/* Generate Button Section */}
                <div className="pt-6 mt-6 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="text-sm text-gray-600 dark:text-gray-400 flex-shrink-0">
                            {plan ? (
                                <span className="flex items-center gap-2 text-green-600 dark:text-green-400">
                                    <CheckCircleIcon className="w-5 h-5" />
                                    Strategy generated! Save it to use later.
                                </span>
                            ) : (
                                'Fill in all required fields (*) and click Generate to create your strategy'
                            )}
                        </div>
                        <div className="flex gap-3 flex-shrink-0 overflow-x-auto pb-2 -mx-6 px-6 sm:mx-0 sm:px-0 sm:pb-0">
                            {plan && (
                                <button
                                    onClick={() => {
                                        setStrategyName('');
                                        setShowSaveModal(true);
                                    }}
                                    className="px-5 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex items-center gap-2 font-semibold shadow-sm whitespace-nowrap flex-shrink-0"
                                >
                                    <DownloadIcon className="w-4 h-4" />
                                    Save Strategy
                                </button>
                            )}
                            <button 
                                onClick={handleGenerate} 
                                disabled={isLoading || !niche || !audience || (usageStats?.strategy.remaining === 0)} 
                                className="px-8 py-3 bg-gradient-to-r from-primary-600 to-primary-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:from-primary-700 hover:to-primary-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap flex-shrink-0"
                            >
                                {isLoading ? (
                                    <>
                                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Analyzing & Generating...
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="w-5 h-5" /> Generate Strategy
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                    {usageStats && usageStats.strategy ? (
                        <div className="mt-3 text-sm text-gray-600 dark:text-gray-400 text-center">
                            <span className="font-medium">Strategy Generations:</span> {usageStats.strategy.count || 0}/{usageStats.strategy.limit || 0} used this month
                            {usageStats.strategy.remaining === 0 && (
                                <span className="ml-2 text-red-600 dark:text-red-400 font-semibold">(Limit reached - upgrade for more)</span>
                            )}
                        </div>
                    ) : (
                        <div className="mt-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                            Loading usage stats...
                        </div>
                    )}
                </div>
            </div>

            {/* Results Section */}
            {plan && (
                <div className="space-y-6 animate-fade-in-up">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex-shrink-0">Your Strategy Plan</h2>
                        <div className="flex items-center gap-3 overflow-x-auto pb-2 -mx-6 px-6 sm:mx-0 sm:px-0 sm:pb-0">
                            <button 
                                onClick={() => setShowSaveModal(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap flex-shrink-0"
                            >
                                <CheckCircleIcon className="w-5 h-5" /> Save Strategy
                            </button>
                            <button 
                                onClick={handleExportStrategy}
                                className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors shadow-sm whitespace-nowrap flex-shrink-0"
                            >
                                <DownloadIcon className="w-5 h-5" /> Export TXT
                            </button>
                            <button 
                                onClick={handleCopyStrategy}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap flex-shrink-0"
                            >
                                <CopyIcon className="w-5 h-5" /> Copy All
                            </button>
                            <button 
                                onClick={handlePopulateCalendar}
                                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm whitespace-nowrap flex-shrink-0"
                            >
                                <CalendarIcon className="w-5 h-5" /> Populate Calendar
                            </button>
                            <button 
                                onClick={() => {
                                    setPlan(null);
                                    setSelectedStrategy(null);
                                    showToast('Strategy cleared. You can generate a new roadmap anytime.', 'success');
                                }}
                                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm whitespace-nowrap flex-shrink-0"
                            >
                                <TrashIcon className="w-5 h-5" /> Clear Plan
                            </button>
                        </div>
                    </div>

                    {/* Data Roadmap Section */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-2 mb-4">
                            <SparklesIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Content Roadmap & Success Checkpoints</h3>
                        </div>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Planning Focus */}
                            <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                                <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">Planning Focus</h4>
                                <p className="text-sm text-blue-800 dark:text-blue-200">
                                    {goal === 'Brand Awareness' && 'Show up consistently with recognizable, on-brand stories.'}
                                    {goal === 'Lead Generation' && 'Make sure your posts clearly point people toward a next step (link in bio, offer, or DM).'}
                                    {goal === 'Sales Conversion' && 'Connect your content to specific offers and make the path to buy obvious.'}
                                    {(goal === 'Community Engagement' || goal === 'Increase Engagement' || goal === 'Customer Engagement') && 'Start real conversations, ask questions, and invite replies or DMs.'}
                                    {goal === 'Increase Followers/Fans' && 'Focus on shareable, bingeable content that new people can discover and fall in love with.'}
                                    {!goal && 'Stay consistent, keep your content organized, and regularly ship what you planned.'}
                                </p>
                            </div>

                            {/* What “success” looks like for this plan */}
                            <div className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-lg border border-emerald-100 dark:border-emerald-800">
                                <h4 className="text-sm font-semibold text-emerald-900 dark:text-emerald-300 mb-2">What “success” looks like for this plan</h4>
                                <ul className="space-y-1">
                                    <li className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                                        <CheckCircleIcon className="w-3 h-3" /> You create posts in Compose and organize them on your Calendar.
                                    </li>
                                    <li className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                                        <CheckCircleIcon className="w-3 h-3" /> Each week has a clear mix of nurture, value, and soft promo content (not just back‑to‑back sales posts).
                                    </li>
                                    <li className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                                        <CheckCircleIcon className="w-3 h-3" /> You reuse or remix at least 1–2 ideas instead of starting from scratch every time.
                                    </li>
                                    <li className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                                        <CheckCircleIcon className="w-3 h-3" /> You keep light notes on what felt good or got strong reactions, so future plans get easier.
                                    </li>
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
                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Key Things to Review Each Week</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {[
                                    { label: 'Posts Created', icon: '📝' },
                                    { label: 'Planned Posts', icon: '📅' },
                                    { label: 'Pillars Covered', icon: '📚' },
                                    { label: 'Ideas Used', icon: '💡' }
                                ].map((metric, idx) => (
                                    <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
                                        <div className="text-2xl mb-1">{metric.icon}</div>
                                        <div className="text-xs font-medium text-gray-600 dark:text-gray-400">{metric.label}</div>
                                    </div>
                                ))}
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
                                💡 Use this as a simple checklist when you review your calendar and content library each week.
                            </p>
                        </div>

                        {/* Expected Outcomes (planning lens, not analytics) */}
                        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Expected Outcomes</h4>
                            <div className="space-y-3">
                                {plan.weeks.map((week) => (
                                    <div key={week.weekNumber} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center text-xs font-bold">
                                            {week.weekNumber}
                                        </div>
                                        <p className="text-sm text-gray-700 dark:text-gray-300">
                                            Week {week.weekNumber}: Ship the content you planned, note which ideas felt strong, and mark 1–2 pieces you’d like to reuse or expand later.
                                        </p>
                                    </div>
                                ))}
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

                    </div>

                    {plan.weeks.map((week, weekIndex) => {
                        const weekProgress = selectedStrategy?.linkedPostIds 
                            ? Math.round((week.content.filter((_, idx) => selectedStrategy.linkedPostIds?.includes(`week-${weekIndex}-day-${idx}`)).length / week.content.length) * 100)
                            : 0;
                        
                        return (
                        <div key={weekIndex} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden border border-gray-100 dark:border-gray-700">
                            <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900/50 dark:to-gray-800/50 p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-3 mb-1">
                                        <h4 className="font-bold text-lg text-gray-800 dark:text-gray-200 break-words">Week {week.weekNumber}: {week.theme}</h4>
                                        <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${
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
                                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider bg-white dark:bg-gray-700 px-3 py-1 rounded-full flex-shrink-0">{week.content.length} Total</span>
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

                                    // Only grey out if status is 'draft' or 'scheduled' - NOT 'ready'
                                    const isActionTaken = (status === 'draft' || status === 'scheduled');
                                    
                                    return (
                                    <div key={dayIndex} className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${isActionTaken ? 'opacity-60 bg-gray-100 dark:bg-gray-800/50' : ''}`}>
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                            <div className="flex items-center gap-3 min-w-[120px]">
                                                <div>
                                                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Day {day.dayOffset + 1}</p>
                                                    <p className="text-xs font-medium text-primary-600 dark:text-primary-400">{day.format}</p>
                                                    {/* Calculate and display scheduled date/time */}
                                                    {(() => {
                                                        const today = new Date();
                                                        const scheduledDate = new Date(today);
                                                        scheduledDate.setDate(today.getDate() + (weekIndex * 7) + day.dayOffset);
                                                        scheduledDate.setHours(14, 0, 0, 0); // Default to 2 PM
                                                        return (
                                                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                                                {scheduledDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {scheduledDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                                            </p>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                            <div className="flex-grow flex-1 min-w-0">
                                                <div className="flex flex-col gap-3">
                                                    <div className="flex items-start gap-3">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-medium text-gray-900 dark:text-white mb-1">{day.topic}</p>
                                                            {/* Show suggested media type and current media type */}
                                                            {day.mediaUrl && day.mediaType && (
                                                                <div className="mb-2">
                                                                    <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full font-medium">
                                                                        {day.mediaType === 'image' ? '📸 Image' : '🎥 Video'} Uploaded
                                                                    </span>
                                                                    {day.suggestedMediaType && day.suggestedMediaType !== day.mediaType && (
                                                                        <span className="ml-2 text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full font-medium">
                                                                            💡 Consider: {day.suggestedMediaType === 'image' ? 'Image' : 'Video'}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                            {!day.mediaUrl && day.suggestedMediaType && (
                                                                <div className="mb-2">
                                                                    <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full font-medium">
                                                                        Suggested: {day.suggestedMediaType === 'image' ? '📸 Image' : '🎥 Video'}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        {/* Show image/video suggestions beside the post line */}
                                                        {((day.imageIdeas && day.imageIdeas.length > 0) || (day.videoIdeas && day.videoIdeas.length > 0)) && (
                                                            <div className="flex-shrink-0 w-56 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                                                                <p className="text-xs font-semibold text-blue-900 dark:text-blue-200 mb-1.5">
                                                                    💡 Suggestions:
                                                                </p>
                                                                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                                                    {day.imageIdeas && day.imageIdeas.length > 0 && (
                                                                        <div className="text-xs text-blue-800 dark:text-blue-300">
                                                                            <span className="font-medium">📸 Images:</span>
                                                                            <ul className="mt-0.5 ml-3 list-disc space-y-0.5">
                                                                                {day.imageIdeas.map((idea, idx) => (
                                                                                    <li key={idx} className="leading-tight">{idea}</li>
                                                                                ))}
                                                                            </ul>
                                                                        </div>
                                                                    )}
                                                                    {day.videoIdeas && day.videoIdeas.length > 0 && (
                                                                        <div className="text-xs text-blue-800 dark:text-blue-300">
                                                                            <span className="font-medium">🎥 Videos:</span>
                                                                            <ul className="mt-0.5 ml-3 list-disc space-y-0.5">
                                                                                {day.videoIdeas.map((idea, idx) => (
                                                                                    <li key={idx} className="leading-tight">{idea}</li>
                                                                                ))}
                                                                            </ul>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {/* Show uploaded media info */}
                                                    {day.mediaUrl && (
                                                        <div className="p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                                                            <p className="text-xs font-semibold text-green-800 dark:text-green-200">
                                                                ✅ Media uploaded • Caption generated {day.status === 'scheduled' ? '• Post created (Scheduled)' : day.status === 'draft' ? '• Post created (Draft)' : ''}
                                                            </p>
                                                        </div>
                                                    )}
                                                    {/* Caption input */}
                                                    <div className="w-full">
                                                        <textarea
                                                            value={day.caption || ''}
                                                            onChange={(e) => {
                                                                const updatedPlan = {
                                                                    ...plan,
                                                                    weeks: plan.weeks.map((w, wIdx) => {
                                                                        if (wIdx !== weekIndex) return w;
                                                                        return {
                                                                            ...w,
                                                                            content: w.content.map((d, dIdx) => {
                                                                                if (dIdx !== dayIndex) return d;
                                                                                return { ...d, caption: e.target.value };
                                                                            })
                                                                        };
                                                                    })
                                                                };
                                                                setPlan(updatedPlan);
                                                                if (selectedStrategy) {
                                                                    const updatedStrategy = {
                                                                        ...selectedStrategy,
                                                                        plan: updatedPlan
                                                                    };
                                                                    setSelectedStrategy(updatedStrategy);
                                                                    // Don't auto-save - user must click save button
                                                                }
                                                            }}
                                                            placeholder="Caption will be auto-generated when you upload media..."
                                                            className="w-full p-3 text-sm border rounded-lg bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-primary-500 dark:text-white dark:placeholder-gray-400 resize-y"
                                                            rows={4}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-center gap-2 flex-shrink-0">
                                                {/* Media Preview/Upload */}
                                                {day.mediaUrl ? (
                                                    <div className="relative group">
                                                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-700">
                                                            {day.mediaType === 'image' ? (
                                                                <img src={day.mediaUrl} alt="Uploaded" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <video src={day.mediaUrl} className="w-full h-full object-cover" />
                                                            )}
                                                        </div>
                                                        {/* Delete/Replace button */}
                                                        <button
                                                            onClick={async () => {
                                                                const currentDay = plan.weeks[weekIndex].content[dayIndex];
                                                                const linkedPostId = currentDay.linkedPostId;
                                                                
                                                                // Delete calendar event if it exists
                                                                if (linkedPostId && user) {
                                                                    try {
                                                                        const calendarEventId = `strategy-${linkedPostId}`;
                                                                        await deleteDoc(doc(db, 'users', user.id, 'calendar_events', calendarEventId));
                                                                    } catch (error) {
                                                                        // Calendar event might not exist, ignore
                                                                        console.warn('Calendar event not found or already deleted:', error);
                                                                    }
                                                                    
                                                                    // Delete the post if it exists
                                                                    try {
                                                                        await deleteDoc(doc(db, 'users', user.id, 'posts', linkedPostId));
                                                                    } catch (error) {
                                                                        // Post might not exist, ignore
                                                                        console.warn('Post not found or already deleted:', error);
                                                                    }
                                                                }
                                                                
                                                                // Helper function to remove undefined values from objects
                                                                const removeUndefined = (obj: any): any => {
                                                                    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
                                                                    const clean: any = {};
                                                                    for (const key in obj) {
                                                                        const value = obj[key];
                                                                        if (value !== undefined) {
                                                                            clean[key] = removeUndefined(value);
                                                                        }
                                                                    }
                                                                    return clean;
                                                                };
                                                                
                                                                // Create updated day without undefined fields
                                                                const updatedDay = {
                                                                    ...plan.weeks[weekIndex].content[dayIndex],
                                                                    status: 'draft' as const
                                                                };
                                                                // Remove fields we want to delete
                                                                delete updatedDay.mediaUrl;
                                                                delete updatedDay.mediaType;
                                                                delete updatedDay.caption;
                                                                delete updatedDay.suggestedMediaType;
                                                                delete updatedDay.linkedPostId;
                                                                
                                                                const updatedPlan = {
                                                                    ...plan,
                                                                    weeks: plan.weeks.map((w, wIdx) => {
                                                                        if (wIdx !== weekIndex) return w;
                                                                        return {
                                                                            ...w,
                                                                            content: w.content.map((d, dIdx) => {
                                                                                if (dIdx !== dayIndex) return d;
                                                                                return updatedDay;
                                                                            })
                                                                        };
                                                                    })
                                                                };
                                                                setPlan(updatedPlan);
                                                                if (selectedStrategy) {
                                                                    const updatedStrategy = {
                                                                        ...selectedStrategy,
                                                                        plan: removeUndefined(updatedPlan),
                                                                        linkedPostIds: (selectedStrategy.linkedPostIds || []).filter((id: string) => id !== linkedPostId)
                                                                    };
                                                                    setSelectedStrategy(updatedStrategy);
                                                                    if (user) {
                                                                        // Ensure the save completes before showing toast
                                                                        try {
                                                                            await setDoc(doc(db, 'users', user.id, 'strategies', selectedStrategy.id), updatedStrategy);
                                                                            showToast('Media removed. You can upload a new one.', 'success');
                                                                        } catch (error) {
                                                                            console.error('Failed to save strategy after removing media:', error);
                                                                            showToast('Media removed locally, but failed to save. Please refresh the page.', 'error');
                                                                        }
                                                                    } else {
                                                                        showToast('Media removed. You can upload a new one.', 'success');
                                                                    }
                                                                } else {
                                                                    showToast('Media removed. You can upload a new one.', 'success');
                                                                }
                                                            }}
                                                            className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700 shadow-lg"
                                                            title="Remove media"
                                                        >
                                                            <XMarkIcon className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ) : null}
                                                
                                                {/* Draft and Calendar buttons - show below media preview */}
                                                {day.mediaUrl && (
                                                    <div className="flex flex-col gap-2 w-full">
                                                        <button
                                                            onClick={async () => {
                                                                if (!plan || !user) return;
                                                                
                                                                const currentDay = plan.weeks[weekIndex].content[dayIndex];
                                                                if (!currentDay.mediaUrl) {
                                                                    showToast('Please upload media first', 'error');
                                                                    return;
                                                                }
                                                                
                                                                // Prevent multiple clicks by checking if already has linked post
                                                                if (currentDay.linkedPostId && (currentDay.status === 'draft' || currentDay.status === 'scheduled')) {
                                                                    showToast('This post already exists in your calendar', 'success');
                                                                    return;
                                                                }
                                                                
                                                                const today = new Date();
                                                                const suggestedDate = new Date(today);
                                                                suggestedDate.setDate(today.getDate() + (weekIndex * 7) + currentDay.dayOffset);
                                                                suggestedDate.setHours(14, 0, 0, 0);
                                                                
                                                                // Use stable postId - reuse existing linkedPostId or generate stable ID based on strategy/week/day (not timestamp)
                                                                const postId = currentDay.linkedPostId || `roadmap-${selectedStrategy?.id || 'temp'}-${weekIndex}-${dayIndex}`;
                                                                
                                                                // Ensure scheduledDate is a valid ISO string (Calendar requires this)
                                                                const scheduledDateISO = suggestedDate.toISOString();
                                                                
                                                                // Ensure platform is valid (not OnlyFans for main calendar)
                                                                // Platform type doesn't include OnlyFans, but check string value just in case
                                                                const platformValue = String(currentDay.platform);
                                                                const platform: Platform = (platformValue === 'OnlyFans' || platformValue?.includes('OnlyFans')) ? 'Instagram' : (currentDay.platform as Platform);
                                                                
                                                                const newPost = {
                                                                    id: postId,
                                                                    content: currentDay.caption || currentDay.topic || 'Untitled Post',
                                                                    mediaUrl: currentDay.mediaUrl, // Required for Calendar to show it
                                                                    mediaType: currentDay.mediaType || 'image',
                                                                    platforms: [platform], // Use valid platform (not OnlyFans)
                                                                    status: 'Draft',
                                                                    author: { name: user.name, avatar: user.avatar },
                                                                    comments: [],
                                                                    scheduledDate: scheduledDateISO, // Required for Calendar - must be ISO string
                                                                };
                                                                
                                                                try {
                                                                    // Save post exactly like Compose does - no manual refresh, let Firestore listener handle it
                                                                    const safePost = JSON.parse(JSON.stringify(newPost));
                                                                    console.log('Strategy: Saving Draft post:', { 
                                                                        postId, 
                                                                        status: newPost.status, 
                                                                        scheduledDate: newPost.scheduledDate,
                                                                        scheduledDateFormatted: new Date(newPost.scheduledDate).toLocaleDateString(),
                                                                        platforms: newPost.platforms,
                                                                        mediaUrl: newPost.mediaUrl ? 'present' : 'missing'
                                                                    });
                                                                    await setDoc(doc(db, 'users', user.id, 'posts', postId), safePost);
                                                                    console.log('Strategy: Draft post saved to Firestore:', {
                                                                        postId,
                                                                        status: safePost.status,
                                                                        scheduledDate: safePost.scheduledDate,
                                                                        scheduledDateParsed: new Date(safePost.scheduledDate).toLocaleString(),
                                                                        platforms: safePost.platforms,
                                                                        hasMediaUrl: !!safePost.mediaUrl,
                                                                        mediaType: safePost.mediaType
                                                                    });
                                                                    // Update local posts state immediately so Calendar shows it right away
                                                                    if (setPosts) {
                                                                        setPosts(prev => {
                                                                            const existingIndex = prev.findIndex(p => p.id === postId);
                                                                            if (existingIndex >= 0) {
                                                                                // Update existing post
                                                                                const updated = [...prev];
                                                                                updated[existingIndex] = { ...safePost } as Post;
                                                                                return updated;
                                                                            } else {
                                                                                // Add new post
                                                                                return [...prev, { ...safePost } as Post];
                                                                            }
                                                                        });
                                                                    }
                                                                    
                                                                    // Update plan with Draft status and link post (do this after post is saved)
                                                                    const updatedPlan = {
                                                                        ...plan,
                                                                        weeks: plan.weeks.map((w, wIdx) => {
                                                                            if (wIdx !== weekIndex) return w;
                                                                            return {
                                                                                ...w,
                                                                                content: w.content.map((d, dIdx) => {
                                                                                    if (dIdx !== dayIndex) return d;
                                                                                    return {
                                                                                        ...d,
                                                                                        status: 'draft' as const,
                                                                                        linkedPostId: postId
                                                                                    };
                                                                                })
                                                                            };
                                                                        })
                                                                    };
                                                                    
                                                                    setPlan(updatedPlan);
                                                                    
                                                                    if (selectedStrategy) {
                                                                        const updatedStrategy = {
                                                                            ...selectedStrategy,
                                                                            plan: updatedPlan,
                                                                            linkedPostIds: [...(selectedStrategy.linkedPostIds || []).filter((id: string) => id !== currentDay.linkedPostId), postId]
                                                                        };
                                                                        setSelectedStrategy(updatedStrategy);
                                                                        // Save strategy update in background (don't await)
                                                                        setDoc(doc(db, 'users', user.id, 'strategies', selectedStrategy.id), updatedStrategy).catch(err => console.error('Failed to update strategy:', err));
                                                                    }
                                                                    
                                                                    showToast('Saved to Draft and added to Calendar!', 'success');
                                                                    // Navigate to Approvals page to see the draft (like ContentIntelligence)
                                                                    // Small delay to ensure posts context updates
                                                                    setTimeout(() => {
                                                                        if (setActivePage) {
                                                                            setActivePage('approvals');
                                                                        }
                                                                    }, 100);
                                                                } catch (error) {
                                                                    console.error('Failed to save to draft:', error);
                                                                    showToast('Failed to save to draft', 'error');
                                                                }
                                                            }}
                                                            disabled={status === 'draft' || status === 'scheduled'}
                                                            className="px-3 py-1.5 text-xs font-medium bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1"
                                                        >
                                                            <CheckCircleIcon className="w-3 h-3" />
                                                            Draft
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                if (!plan || !user) return;
                                                                
                                                                const currentDay = plan.weeks[weekIndex].content[dayIndex];
                                                                if (!currentDay.mediaUrl) {
                                                                    showToast('Please upload media first', 'error');
                                                                    return;
                                                                }
                                                                
                                                                // Prevent multiple clicks by checking if already scheduled
                                                                if (currentDay.status === 'scheduled' && currentDay.linkedPostId) {
                                                                    showToast('This post is already scheduled', 'success');
                                                                    return;
                                                                }
                                                                
                                                                const today = new Date();
                                                                const scheduledDate = new Date(today);
                                                                scheduledDate.setDate(today.getDate() + (weekIndex * 7) + currentDay.dayOffset);
                                                                scheduledDate.setHours(14, 0, 0, 0);
                                                                
                                                                // Use stable postId - reuse existing linkedPostId or generate stable ID based on strategy/week/day (not timestamp)
                                                                const postId = currentDay.linkedPostId || `roadmap-${selectedStrategy?.id || 'temp'}-${weekIndex}-${dayIndex}`;
                                                                
                                                                // Convert date to ISO string like Compose does (using same format)
                                                                const scheduledDateISO = scheduledDate.toISOString();
                                                                
                                                                // Ensure platform is valid (not OnlyFans for main calendar)
                                                                // Platform type doesn't include OnlyFans, but check string value just in case
                                                                const platformValue = String(currentDay.platform);
                                                                const platform: Platform = (platformValue === 'OnlyFans' || platformValue?.includes('OnlyFans')) ? 'Instagram' : (currentDay.platform as Platform);
                                                                
                                                                const newPost = {
                                                                    id: postId,
                                                                    content: currentDay.caption || currentDay.topic || 'Untitled Post',
                                                                    mediaUrl: currentDay.mediaUrl, // Required for Calendar to show it
                                                                    mediaType: currentDay.mediaType || 'image',
                                                                    platforms: [platform], // Use valid platform (not OnlyFans)
                                                                    status: 'Scheduled',
                                                                    author: { name: user.name, avatar: user.avatar },
                                                                    comments: [],
                                                                    scheduledDate: scheduledDateISO, // Required for Calendar - use ISO string like Compose
                                                                };
                                                                
                                                                try {
                                                                    // Save post exactly like Compose does - no manual refresh, let Firestore listener handle it
                                                                    const safePost = JSON.parse(JSON.stringify(newPost));
                                                                    await setDoc(doc(db, 'users', user.id, 'posts', postId), safePost);
                                                                    console.log('Strategy: Scheduled post saved to Firestore:', {
                                                                        postId,
                                                                        status: safePost.status,
                                                                        scheduledDate: safePost.scheduledDate,
                                                                        scheduledDateParsed: new Date(safePost.scheduledDate).toLocaleString(),
                                                                        platforms: safePost.platforms,
                                                                        hasMediaUrl: !!safePost.mediaUrl,
                                                                        mediaType: safePost.mediaType
                                                                    });
                                                                    // Update local posts state immediately so Calendar shows it right away
                                                                    if (setPosts) {
                                                                        setPosts(prev => {
                                                                            const existingIndex = prev.findIndex(p => p.id === postId);
                                                                            if (existingIndex >= 0) {
                                                                                // Update existing post
                                                                                const updated = [...prev];
                                                                                updated[existingIndex] = { ...safePost } as Post;
                                                                                return updated;
                                                                            } else {
                                                                                // Add new post
                                                                                return [...prev, { ...safePost } as Post];
                                                                            }
                                                                        });
                                                                    }
                                                                    
                                                                    // Update plan with Scheduled status and link post (do this after post is saved)
                                                                    const updatedPlan = {
                                                                        ...plan,
                                                                        weeks: plan.weeks.map((w, wIdx) => {
                                                                            if (wIdx !== weekIndex) return w;
                                                                            return {
                                                                                ...w,
                                                                                content: w.content.map((d, dIdx) => {
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
                                                                    
                                                                    setPlan(updatedPlan);
                                                                    
                                                                    if (selectedStrategy) {
                                                                        const updatedStrategy = {
                                                                            ...selectedStrategy,
                                                                            plan: updatedPlan,
                                                                            linkedPostIds: [...(selectedStrategy.linkedPostIds || []).filter((id: string) => id !== currentDay.linkedPostId), postId]
                                                                        };
                                                                        setSelectedStrategy(updatedStrategy);
                                                                        // Save strategy update in background (don't await)
                                                                        setDoc(doc(db, 'users', user.id, 'strategies', selectedStrategy.id), updatedStrategy).catch(err => console.error('Failed to update strategy:', err));
                                                                    }
                                                                    
                                                                    showToast('Added to Calendar!', 'success');
                                                                    // Navigate to Calendar page to see the scheduled post (like ContentIntelligence)
                                                                    // Small delay to ensure posts context updates
                                                                    setTimeout(() => {
                                                                        if (setActivePage) {
                                                                            setActivePage('calendar');
                                                                        }
                                                                    }, 100);
                                                                } catch (error: any) {
                                                                    console.error('Failed to save to calendar:', error);
                                                                    const errorMessage = error?.message || 'Failed to save to calendar';
                                                                    showToast(errorMessage, 'error');
                                                                    // Log full error for debugging
                                                                    if (process.env.NODE_ENV === 'development') {
                                                                        console.error('Full error details:', error);
                                                                    }
                                                                }
                                                            }}
                                                            disabled={status === 'draft' || status === 'scheduled'}
                                                            className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1"
                                                        >
                                                            <CalendarIcon className="w-3 h-3" />
                                                            Calendar
                                                        </button>
                                                    </div>
                                                )}
                                                
                                                {!day.mediaUrl && (
                                                    <div className="relative flex gap-1">
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
                                                        <button
                                                            onClick={() => setShowMediaLibrary({ weekIndex, dayIndex })}
                                                            disabled={isUploading}
                                                            className="w-16 h-16 flex items-center justify-center border-2 border-dashed border-primary-300 dark:border-primary-600 rounded-lg hover:border-primary-500 dark:hover:border-primary-400 transition-colors disabled:opacity-50 bg-primary-50 dark:bg-primary-900/20"
                                                            title="Select from Media Library"
                                                        >
                                                            <ImageIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
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

            {/* Media Library Modal */}
            {showMediaLibrary && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Select from Media Library</h3>
                            <button
                                onClick={() => setShowMediaLibrary(null)}
                                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            >
                                <XMarkIcon className="w-6 h-6" />
                            </button>
                        </div>
                        {mediaLibraryItems.length === 0 ? (
                            <div className="text-center py-8">
                                <ImageIcon className="w-16 h-16 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
                                <p className="text-gray-600 dark:text-gray-400">No media in your library yet.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {mediaLibraryItems.map((item) => {
                                    const isLoading = loadingMediaItem === item.id;
                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => {
                                                if (showMediaLibrary && !isLoading) {
                                                    handleSelectFromMediaLibrary(showMediaLibrary.weekIndex, showMediaLibrary.dayIndex, item);
                                                }
                                            }}
                                            className={`relative group cursor-pointer border-2 rounded-lg overflow-hidden transition-colors ${
                                                isLoading 
                                                    ? 'border-primary-500 dark:border-primary-500 cursor-wait' 
                                                    : 'border-gray-200 dark:border-gray-700 hover:border-primary-500 dark:hover:border-primary-500'
                                            }`}
                                        >
                                            {item.type === 'video' ? (
                                                <video
                                                    src={item.url}
                                                    className="w-full h-32 object-cover"
                                                    controls={false}
                                                />
                                            ) : (
                                                <img
                                                    src={item.url}
                                                    alt={item.name}
                                                    className="w-full h-32 object-cover"
                                                />
                                            )}
                                            <div className="p-2 bg-white dark:bg-gray-800">
                                                <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{item.name}</p>
                                            </div>
                                            {isLoading ? (
                                                <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <svg className="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                        <span className="text-white font-medium text-sm">Processing...</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <span className="text-white font-medium text-sm">Click to Select</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
