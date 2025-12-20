import React, { useState, useEffect } from 'react';
import { useAppContext } from './AppContext';
import { SparklesIcon, RefreshIcon, DownloadIcon, UploadIcon, XMarkIcon, CopyIcon } from './icons/UIIcons';
import { auth, storage, db } from '../firebaseConfig';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, Timestamp } from 'firebase/firestore';

type ContentType = 'captions' | 'mediaCaptions' | 'postIdeas' | 'shootConcepts' | 'weeklyPlan' | 'monetizationPlanner';

export const OnlyFansContentBrain: React.FC = () => {
    // All hooks must be called unconditionally at the top
    const context = useAppContext();
    const user = context?.user;
    const showToast = context?.showToast;
    
    // State management
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<ContentType>('captions');
    const [isGenerating, setIsGenerating] = useState(false);
    
    // Caption generation state
    const [captionPrompt, setCaptionPrompt] = useState('');
    const [captionTone, setCaptionTone] = useState<'Playful' | 'Flirty' | 'Confident' | 'Teasing' | 'Intimate' | 'Explicit'>('Teasing');
    const [captionGoal, setCaptionGoal] = useState('engagement');
    const [generatedCaptions, setGeneratedCaptions] = useState<string[]>([]);
    
    // Media caption generation state
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [mediaPreview, setMediaPreview] = useState<string | null>(null);
    const [mediaCaptionTone, setMediaCaptionTone] = useState<'Playful' | 'Flirty' | 'Confident' | 'Teasing' | 'Intimate' | 'Explicit'>('Teasing');
    const [mediaCaptionGoal, setMediaCaptionGoal] = useState('engagement');
    const [mediaCaptionPrompt, setMediaCaptionPrompt] = useState('');
    const [generatedMediaCaptions, setGeneratedMediaCaptions] = useState<{caption: string; hashtags: string[]}[]>([]);
    
    // Post ideas state
    const [postIdeaPrompt, setPostIdeaPrompt] = useState('');
    const [generatedPostIdeas, setGeneratedPostIdeas] = useState<string[]>([]);
    
    // Shoot concepts state
    const [shootConceptPrompt, setShootConceptPrompt] = useState('');
    const [generatedShootConcepts, setGeneratedShootConcepts] = useState<string[]>([]);
    
    // Weekly plan state
    const [weeklyPlanPrompt, setWeeklyPlanPrompt] = useState('');
    const [generatedWeeklyPlan, setGeneratedWeeklyPlan] = useState<string>('');
    
    // Monetization planner state
    const [monetizationGoals, setMonetizationGoals] = useState<string[]>([]);
    const [monetizationPreferences, setMonetizationPreferences] = useState('');
    const [subscriberCount, setSubscriberCount] = useState<number | ''>('');
    const [balanceEngagement, setBalanceEngagement] = useState(40);
    const [balanceUpsell, setBalanceUpsell] = useState(30);
    const [balanceRetention, setBalanceRetention] = useState(20);
    const [balanceConversion, setBalanceConversion] = useState(10);
    const [generatedMonetizationPlan, setGeneratedMonetizationPlan] = useState<any>(null);

    // Modal state for AI features
    const [optimizeResult, setOptimizeResult] = useState<any>(null);
    const [predictResult, setPredictResult] = useState<any>(null);
    const [repurposeResult, setRepurposeResult] = useState<any>(null);
    const [showOptimizeModal, setShowOptimizeModal] = useState(false);
    const [showPredictModal, setShowPredictModal] = useState(false);
    const [showRepurposeModal, setShowRepurposeModal] = useState(false);
    const [currentCaptionForAI, setCurrentCaptionForAI] = useState<{caption: string; index: number; type: 'plain' | 'media'} | null>(null);

    // Initialize component
    useEffect(() => {
        try {
            setIsLoading(false);
            console.log('OnlyFansContentBrain component loaded successfully');
            // If mediaCaptions tab is somehow selected, reset to captions
            if (activeTab === 'mediaCaptions') {
                setActiveTab('captions');
            }
        } catch (err: any) {
            console.error('Error initializing OnlyFansContentBrain:', err);
            setError(err?.message || 'Failed to initialize component');
            setIsLoading(false);
        }
    }, [activeTab]);

    // Show error state if context is not available
    if (!context || !user) {
        return (
            <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-full flex items-center justify-center">
                <div className="text-center">
                    <p className="text-red-600 dark:text-red-400 mb-2">Failed to load Content Brain</p>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">Please ensure you are logged in</p>
                    <button 
                        onClick={() => window.location.reload()} 
                        className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                    >
                        Reload Page
                    </button>
                </div>
            </div>
        );
    }

    const handleGenerateCaptions = async () => {
        if (!captionPrompt.trim()) {
            showToast?.('Please enter a description or idea for your caption', 'error');
            return;
        }

        setIsGenerating(true);
        setError(null);
        try {
            console.log('Generating captions...');
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            const response = await fetch('/api/generateCaptions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    tone: captionTone === 'Explicit' ? 'Sexy / Explicit' : captionTone,
                    goal: captionGoal,
                    platforms: ['OnlyFans'],
                    promptText: `${captionPrompt}\n\n[Variety seed: ${Date.now()}-${Math.random().toString(36).substr(2, 9)}] - Generate diverse, unique captions each time. Avoid repetition.`,
                }),
            });

            if (!response.ok) {
                if (response.status === 413) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.note || 'File too large. Please use a smaller image/video (max 4MB for images, 20MB for videos).');
                }
                throw new Error('Failed to generate captions');
            }

            const data = await response.json();
            // API returns array of {caption: string, hashtags: string[]}
            let captions: string[] = [];
            if (Array.isArray(data)) {
                captions = data.map((item: any) => {
                    const caption = item.caption || '';
                    const hashtags = Array.isArray(item.hashtags) ? item.hashtags : [];
                    return hashtags.length > 0 ? `${caption} ${hashtags.join(' ')}` : caption;
                });
            } else if (data && typeof data === 'object' && Array.isArray(data.captions)) {
                captions = data.captions.map((item: any) => {
                    const caption = item.caption || '';
                    const hashtags = Array.isArray(item.hashtags) ? item.hashtags : [];
                    return hashtags.length > 0 ? `${caption} ${hashtags.join(' ')}` : caption;
                });
            }
            setGeneratedCaptions(Array.isArray(captions) ? captions : []);
            showToast?.('Captions generated successfully!', 'success');
        } catch (error: any) {
            console.error('Error generating captions:', error);
            const errorMsg = error.message || 'Failed to generate captions. Please try again.';
            showToast?.(errorMsg, 'error');
            setError(errorMsg);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGeneratePostIdeas = async () => {
        if (!postIdeaPrompt.trim()) {
            showToast?.('Please enter what kind of post ideas you\'re looking for', 'error');
            return;
        }

        setIsGenerating(true);
        setError(null);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            const response = await fetch('/api/generateText', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    prompt: `Generate 10 creative post ideas for OnlyFans based on: ${postIdeaPrompt}. 
                    Each idea should be specific, engaging, and tailored for adult content creators. 
                    Format as a numbered list with brief descriptions.`,
                    context: {
                        goal: 'content-ideas',
                        tone: 'Explicit/Adult Content',
                        platforms: ['OnlyFans'],
                    },
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate post ideas');
            }

            const data = await response.json();
            const text = data.text || data.caption || '';
            // Parse the numbered list into array
            const ideas = typeof text === 'string' 
                ? text.split(/\d+\./).filter(item => item.trim()).map(item => item.trim())
                : [];
            const finalIdeas = Array.isArray(ideas) && ideas.length > 0 ? ideas : (typeof text === 'string' ? [text] : []);
            setGeneratedPostIdeas(finalIdeas);
            // Save to history
            await saveToHistory('post_ideas', `Post Ideas - ${new Date().toLocaleDateString()}`, { ideas: finalIdeas, prompt: postIdeaPrompt });
            showToast?.('Post ideas generated successfully!', 'success');
        } catch (error: any) {
            console.error('Error generating post ideas:', error);
            const errorMsg = error.message || 'Failed to generate post ideas. Please try again.';
            showToast?.(errorMsg, 'error');
            setError(errorMsg);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGenerateShootConcepts = async () => {
        if (!shootConceptPrompt.trim()) {
            showToast?.('Please describe the type of shoot concept you\'re looking for', 'error');
            return;
        }

        setIsGenerating(true);
        setError(null);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            const response = await fetch('/api/generateText', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    prompt: `Generate 8 detailed shoot concepts for OnlyFans based on: ${shootConceptPrompt}.
                    Each concept should include:
                    - Theme/Setting
                    - Outfit suggestions
                    - Lighting style
                    - Poses/angles
                    - Mood/energy
                    
                    Format as a numbered list with detailed descriptions. Make it creative and tailored for adult content.`,
                    context: {
                        goal: 'shoot-planning',
                        tone: 'Explicit/Adult Content',
                        platforms: ['OnlyFans'],
                    },
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate shoot concepts');
            }

            const data = await response.json();
            const text = data.text || data.caption || '';
            // Parse the numbered list into array
            const concepts = typeof text === 'string'
                ? text.split(/\d+\./).filter(item => item.trim()).map(item => item.trim())
                : [];
            const finalConcepts = Array.isArray(concepts) && concepts.length > 0 ? concepts : (typeof text === 'string' ? [text] : []);
            setGeneratedShootConcepts(finalConcepts);
            // Save to history
            await saveToHistory('shoot_concepts', `Shoot Concepts - ${new Date().toLocaleDateString()}`, { concepts: finalConcepts, prompt: shootConceptPrompt });
            showToast?.('Shoot concepts generated successfully!', 'success');
        } catch (error: any) {
            console.error('Error generating shoot concepts:', error);
            const errorMsg = error.message || 'Failed to generate shoot concepts. Please try again.';
            showToast?.(errorMsg, 'error');
            setError(errorMsg);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGenerateWeeklyPlan = async () => {
        if (!weeklyPlanPrompt.trim()) {
            showToast?.('Please describe your goals or preferences for the week', 'error');
            return;
        }

        setIsGenerating(true);
        setError(null);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            const response = await fetch('/api/generateContentStrategy', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    niche: 'Adult Content Creator (OnlyFans)',
                    audience: 'Subscribers and fans',
                    goals: weeklyPlanPrompt,
                    duration: 1, // 1 week
                    platforms: ['OnlyFans'],
                    explicitContent: true,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate weekly plan');
            }

            const data = await response.json();
            const plan = data.plan || JSON.stringify(data, null, 2);
            setGeneratedWeeklyPlan(plan);
            // Save to history
            await saveToHistory('weekly_plan', `Weekly Plan - ${new Date().toLocaleDateString()}`, { plan, prompt: weeklyPlanPrompt });
            showToast?.('Weekly plan generated successfully!', 'success');
        } catch (error: any) {
            console.error('Error generating weekly plan:', error);
            const errorMsg = error.message || 'Failed to generate weekly plan. Please try again.';
            showToast?.(errorMsg, 'error');
            setError(errorMsg);
        } finally {
            setIsGenerating(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        showToast?.('Copied to clipboard!', 'success');
    };

    const handleGenerateMonetizationPlan = async () => {
        if (monetizationGoals.length === 0) {
            showToast?.('Please add at least one goal', 'error');
            return;
        }

        // Validate balance totals to 100
        const totalBalance = balanceEngagement + balanceUpsell + balanceRetention + balanceConversion;
        if (Math.abs(totalBalance - 100) > 1) {
            showToast?.('Balance percentages must total 100%', 'error');
            return;
        }

        setIsGenerating(true);
        setError(null);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            const response = await fetch('/api/generateMonetizationPlan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    goals: monetizationGoals,
                    contentPreferences: monetizationPreferences,
                    subscriberCount: subscriberCount || undefined,
                    balance: {
                        engagement: balanceEngagement,
                        upsell: balanceUpsell,
                        retention: balanceRetention,
                        conversion: balanceConversion,
                    },
                    niche: user?.niche || 'Adult Content Creator',
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate monetization plan');
            }

            const data = await response.json();
            if (data.success && data.plan) {
                setGeneratedMonetizationPlan(data.plan);
                // Save to history
                await saveToHistory('monetization_plan', `Monetization Plan - ${new Date().toLocaleDateString()}`, data.plan);
                showToast?.('Monetization plan generated successfully!', 'success');
            } else {
                throw new Error(data.error || 'Failed to generate monetization plan');
            }
        } catch (error: any) {
            console.error('Error generating monetization plan:', error);
            const errorMsg = error.message || 'Failed to generate monetization plan. Please try again.';
            showToast?.(errorMsg, 'error');
            setError(errorMsg);
        } finally {
            setIsGenerating(false);
        }
    };

    const saveToHistory = async (type: 'optimize' | 'predict' | 'repurpose' | 'monetization_plan' | 'post_ideas' | 'shoot_concepts' | 'weekly_plan', title: string, data: any) => {
        if (!user?.id) return;
        try {
            await addDoc(collection(db, 'users', user.id, 'content_intelligence_history'), {
                type,
                title,
                data,
                createdAt: Timestamp.now(),
            });
        } catch (error: any) {
            console.error('Error saving to history:', error);
        }
    };

    const handleGenerateMediaCaptions = async () => {
        if (!mediaFile) {
            showToast?.('Please upload an image or video', 'error');
            return;
        }

        // Check file size (more lenient since we're using Firebase Storage, not base64)
        const fileSizeMB = mediaFile.size / 1024 / 1024;
        const isVideo = mediaFile.type.startsWith('video/');
        const maxSizeMB = isVideo ? 100 : 10; // Firebase Storage can handle larger files

        if (fileSizeMB > maxSizeMB) {
            showToast?.(
                `File is too large (${fileSizeMB.toFixed(1)}MB). Maximum size: ${maxSizeMB}MB for ${isVideo ? 'videos' : 'images'}. Please compress or use a smaller file.`,
                'error'
            );
            return;
        }

        setIsGenerating(true);
        setError(null);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            if (!user?.id) {
                throw new Error('User not authenticated');
            }

            // Upload to Firebase Storage to avoid 413 errors
            let mediaUrl: string;
            try {
                const timestamp = Date.now();
                const fileExtension = mediaFile.name.split('.').pop() || (mediaFile.type.startsWith('video/') ? 'mp4' : 'jpg');
                const storagePath = `users/${user.id}/onlyfans-uploads/${timestamp}.${fileExtension}`;
                const storageRef = ref(storage, storagePath);

                await uploadBytes(storageRef, mediaFile, {
                    contentType: mediaFile.type,
                });

                mediaUrl = await getDownloadURL(storageRef);
            } catch (uploadError: any) {
                console.error('Upload error:', uploadError);
                throw new Error(`Failed to upload media: ${uploadError.message || 'Please try again'}`);
            }
            
            const response = await fetch('/api/generateCaptions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    mediaUrl: mediaUrl, // Use Firebase Storage URL instead of base64
                    tone: mediaCaptionTone === 'Explicit' ? 'Sexy / Explicit' : mediaCaptionTone,
                    goal: mediaCaptionGoal,
                    platforms: ['OnlyFans'],
                    promptText: `${mediaCaptionPrompt || ''} [Variety seed: ${Date.now()}-${Math.random().toString(36).substr(2, 9)}] - Generate diverse, unique captions each time. Avoid repetition.`.trim(),
                }),
            });

            if (!response.ok) {
                if (response.status === 413) {
                    const errorData = await response.json().catch(() => ({}));
                    const errorMsg = errorData.note || errorData.error || 'File too large. Please use a smaller image/video (max 4MB for images, 20MB for videos).';
                    throw new Error(errorMsg);
                }
                const errorData = await response.json().catch(() => ({}));
                const errorMsg = errorData.error || errorData.message || 'Failed to generate captions';
                throw new Error(errorMsg);
            }

            const data = await response.json();
            // API returns array of {caption: string, hashtags: string[]}
            let captions: {caption: string; hashtags: string[]}[] = [];
            if (Array.isArray(data)) {
                captions = data.map((item: any) => ({
                    caption: item.caption || '',
                    hashtags: Array.isArray(item.hashtags) ? item.hashtags : [],
                }));
            } else if (data && typeof data === 'object' && Array.isArray(data.captions)) {
                captions = data.captions.map((item: any) => ({
                    caption: item.caption || '',
                    hashtags: Array.isArray(item.hashtags) ? item.hashtags : [],
                }));
            }
            setGeneratedMediaCaptions(Array.isArray(captions) ? captions : []);
            showToast?.('Captions generated successfully!', 'success');
        } catch (error: any) {
            console.error('Error generating media captions:', error);
            const errorMsg = error.message || 'Failed to generate captions. Please try again.';
            showToast?.(errorMsg, 'error');
            setError(errorMsg);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleMediaFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setMediaFile(file);
        const previewUrl = URL.createObjectURL(file);
        setMediaPreview(previewUrl);
    };

    const allTabs: { id: ContentType; label: string }[] = [
        { id: 'captions', label: 'AI Captions' },
        { id: 'mediaCaptions', label: 'Image/Video Captions' }, // Hidden but kept for stability
        { id: 'postIdeas', label: 'Post Ideas' },
        { id: 'shootConcepts', label: 'Shoot Concepts' },
        { id: 'weeklyPlan', label: 'Weekly Plan' },
        { id: 'monetizationPlanner', label: 'Monetization Planner' },
    ];
    // Filter out mediaCaptions tab (hidden but code kept for stability)
    const tabs = allTabs.filter(tab => tab.id !== 'mediaCaptions') as { id: ContentType; label: string }[];

    // Show loading state
    if (isLoading) {
        return (
            <div className="max-w-5xl mx-auto p-6">
                <div className="flex items-center justify-center min-h-[400px]">
                    <div className="text-center">
                        <RefreshIcon className="w-8 h-8 text-primary-600 dark:text-primary-400 animate-spin mx-auto mb-4" />
                        <p className="text-gray-600 dark:text-gray-400">Loading Content Brain...</p>
                    </div>
                </div>
            </div>
        );
    }

    // Show error state
    if (error && !isGenerating) {
        return (
            <div className="max-w-5xl mx-auto p-6">
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
                    <p className="text-red-600 dark:text-red-400 mb-2">Error loading Content Brain</p>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">{error}</p>
                    <button 
                        onClick={() => {
                            setError(null);
                            setIsLoading(true);
                            window.location.reload();
                        }} 
                        className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                    >
                        Reload
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                    <SparklesIcon className="w-8 h-8 text-primary-600 dark:text-primary-400" />
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        Content Brain
                    </h1>
                </div>
                <p className="text-gray-600 dark:text-gray-400">
                    Generate AI-powered captions, ideas, shoot concepts, and content plans for OnlyFans.
                </p>
            </div>

            {/* Error banner (non-blocking) */}
            {error && (
                <div className="mb-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                    <p className="text-yellow-800 dark:text-yellow-200 text-sm">{error}</p>
                    <button 
                        onClick={() => setError(null)}
                        className="mt-2 text-sm text-yellow-700 dark:text-yellow-300 hover:underline"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                            activeTab === tab.id
                                ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Captions Tab */}
            {activeTab === 'captions' && (
                <div className="space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            Generate AI Captions
                        </h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Describe your content or what you want the caption to focus on:
                                </label>
                                <textarea
                                    value={captionPrompt}
                                    onChange={(e) => setCaptionPrompt(e.target.value)}
                                    placeholder="e.g., 'A seductive photoset with lingerie and soft lighting' or 'Behind-the-scenes getting ready video'"
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[100px]"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Goal:
                                    </label>
                                    <select
                                        value={captionGoal}
                                        onChange={(e) => setCaptionGoal(e.target.value)}
                                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="engagement">Engagement</option>
                                        <option value="sales">Sales/Monetization</option>
                                        <option value="brand">Brand Awareness</option>
                                        <option value="followers">Increase Followers/Fans</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Tone:
                                    </label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['Playful', 'Flirty', 'Confident', 'Teasing', 'Intimate', 'Explicit'] as const).map((tone) => (
                                            <button
                                                key={tone}
                                                onClick={() => setCaptionTone(tone)}
                                                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                                    captionTone === tone
                                                        ? 'bg-primary-600 text-white'
                                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                                }`}
                                            >
                                                {tone}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleGenerateCaptions}
                                disabled={isGenerating}
                                className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isGenerating ? (
                                    <>
                                        <RefreshIcon className="w-5 h-5 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="w-5 h-5" />
                                        Generate Captions
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Generated Captions */}
                    {Array.isArray(generatedCaptions) && generatedCaptions.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                Generated Captions
                            </h3>
                            <div className="space-y-3">
                                {generatedCaptions.map((caption, index) => (
                                    <div
                                        key={index}
                                        className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                                    >
                                        <p className="text-gray-900 dark:text-white mb-3">{caption}</p>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                onClick={() => copyToClipboard(caption)}
                                                className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                            >
                                                Copy
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Media Captions Tab - Hidden but kept for stability */}
            {false && activeTab === 'mediaCaptions' && (
                <div className="space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            Generate Captions from Image/Video
                        </h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Upload Image or Video:
                                </label>
                                {!mediaPreview ? (
                                    <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
                                        <input
                                            type="file"
                                            accept="image/*,video/*"
                                            onChange={handleMediaFileChange}
                                            className="hidden"
                                            id="media-upload"
                                        />
                                        <label
                                            htmlFor="media-upload"
                                            className="cursor-pointer flex flex-col items-center gap-2"
                                        >
                                            <UploadIcon className="w-12 h-12 text-gray-400" />
                                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                                Click to upload or drag and drop
                                            </span>
                                            <span className="text-xs text-gray-500 dark:text-gray-500">
                                                Images or Videos (max 20MB)
                                            </span>
                                        </label>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        {mediaFile?.type.startsWith('video/') ? (
                                            <video
                                                src={mediaPreview || undefined}
                                                controls
                                                className="w-full max-h-96 rounded-lg"
                                            />
                                        ) : (
                                            <img
                                                src={mediaPreview || undefined}
                                                alt="Preview"
                                                className="w-full max-h-96 object-contain rounded-lg"
                                            />
                                        )}
                                        <button
                                            onClick={() => {
                                                setMediaFile(null);
                                                setMediaPreview(null);
                                            }}
                                            className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600"
                                        >
                                            <XMarkIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Additional Context (Optional):
                                </label>
                                <textarea
                                    value={mediaCaptionPrompt}
                                    onChange={(e) => setMediaCaptionPrompt(e.target.value)}
                                    placeholder="Add any specific details or focus you want for the caption..."
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[80px]"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Goal:
                                    </label>
                                    <select
                                        value={mediaCaptionGoal}
                                        onChange={(e) => setMediaCaptionGoal(e.target.value)}
                                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="engagement">Engagement</option>
                                        <option value="sales">Sales/Monetization</option>
                                        <option value="brand">Brand Awareness</option>
                                        <option value="followers">Increase Followers/Fans</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Tone:
                                    </label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['Playful', 'Flirty', 'Confident', 'Teasing', 'Intimate', 'Explicit'] as const).map((tone) => (
                                            <button
                                                key={tone}
                                                onClick={() => setMediaCaptionTone(tone)}
                                                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                                    mediaCaptionTone === tone
                                                        ? 'bg-primary-600 text-white'
                                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                                }`}
                                            >
                                                {tone}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleGenerateMediaCaptions}
                                disabled={isGenerating || !mediaFile}
                                className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isGenerating ? (
                                    <>
                                        <RefreshIcon className="w-5 h-5 animate-spin" />
                                        Analyzing media and generating...
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="w-5 h-5" />
                                        Generate Captions
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Generated Media Captions */}
                    {Array.isArray(generatedMediaCaptions) && generatedMediaCaptions.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                Generated Captions
                            </h3>
                            <div className="space-y-3">
                                {generatedMediaCaptions.map((result, index) => (
                                    <div
                                        key={index}
                                        className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                                    >
                                        <p className="text-gray-900 dark:text-white mb-2">{result.caption}</p>
                                        {result.hashtags && result.hashtags.length > 0 && (
                                            <p className="text-primary-600 dark:text-primary-400 text-sm mb-3">
                                                {result.hashtags.join(' ')}
                                            </p>
                                        )}
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                onClick={() => copyToClipboard(`${result.caption} ${(result.hashtags || []).join(' ')}`.trim())}
                                                className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                            >
                                                Copy
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Post Ideas Tab */}
            {activeTab === 'postIdeas' && (
                <div className="space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            Generate Post Ideas
                        </h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    What kind of post ideas are you looking for?
                                </label>
                                <textarea
                                    value={postIdeaPrompt}
                                    onChange={(e) => setPostIdeaPrompt(e.target.value)}
                                    placeholder="e.g., 'Interactive content to boost engagement' or 'Behind-the-scenes content ideas'"
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[100px]"
                                />
                            </div>

                            <button
                                onClick={handleGeneratePostIdeas}
                                disabled={isGenerating}
                                className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isGenerating ? (
                                    <>
                                        <RefreshIcon className="w-5 h-5 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="w-5 h-5" />
                                        Generate Post Ideas
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Generated Post Ideas */}
                    {Array.isArray(generatedPostIdeas) && generatedPostIdeas.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                Post Ideas
                            </h3>
                            <div className="space-y-3">
                                {generatedPostIdeas.map((idea, index) => (
                                    <div
                                        key={index}
                                        className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                                    >
                                        <p className="text-gray-900 dark:text-white">{idea}</p>
                                        <button
                                            onClick={() => copyToClipboard(idea)}
                                            className="mt-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                        >
                                            Copy
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Shoot Concepts Tab */}
            {activeTab === 'shootConcepts' && (
                <div className="space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            Generate Shoot Concepts
                        </h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Describe the type of shoot concept you want:
                                </label>
                                <textarea
                                    value={shootConceptPrompt}
                                    onChange={(e) => setShootConceptPrompt(e.target.value)}
                                    placeholder="e.g., 'Boudoir photoset with vintage vibes' or 'Intimate bedroom scene with natural lighting'"
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[100px]"
                                />
                            </div>

                            <button
                                onClick={handleGenerateShootConcepts}
                                disabled={isGenerating}
                                className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isGenerating ? (
                                    <>
                                        <RefreshIcon className="w-5 h-5 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="w-5 h-5" />
                                        Generate Shoot Concepts
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Generated Shoot Concepts */}
                    {Array.isArray(generatedShootConcepts) && generatedShootConcepts.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                Shoot Concepts
                            </h3>
                            <div className="space-y-4">
                                {generatedShootConcepts.map((concept, index) => (
                                    <div
                                        key={index}
                                        className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                                    >
                                        <p className="text-gray-900 dark:text-white whitespace-pre-line">{concept}</p>
                                        <button
                                            onClick={() => copyToClipboard(concept)}
                                            className="mt-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                        >
                                            Copy
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Weekly Plan Tab */}
            {activeTab === 'weeklyPlan' && (
                <div className="space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            Generate Weekly Content Plan
                        </h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Your goals or preferences for the week:
                                </label>
                                <textarea
                                    value={weeklyPlanPrompt}
                                    onChange={(e) => setWeeklyPlanPrompt(e.target.value)}
                                    placeholder="e.g., 'Focus on intimate content and behind-the-scenes this week' or 'Mix of photosets, videos, and interactive posts'"
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[100px]"
                                />
                            </div>

                            <button
                                onClick={handleGenerateWeeklyPlan}
                                disabled={isGenerating}
                                className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isGenerating ? (
                                    <>
                                        <RefreshIcon className="w-5 h-5 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="w-5 h-5" />
                                        Generate Weekly Plan
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Generated Weekly Plan */}
                    {generatedWeeklyPlan && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Weekly Content Plan
                                </h3>
                                <button
                                    onClick={() => copyToClipboard(generatedWeeklyPlan)}
                                    className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-1"
                                >
                                    <DownloadIcon className="w-4 h-4" />
                                    Copy
                                </button>
                            </div>
                            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                <pre className="text-gray-900 dark:text-white whitespace-pre-wrap font-sans">
                                    {generatedWeeklyPlan}
                                </pre>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Monetization Planner Tab */}
            {activeTab === 'monetizationPlanner' && (
                <div className="space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            AI Monetization Planner
                        </h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                            Generate a balanced content strategy that labels each idea as Engagement, Upsell, Retention, or Conversion. 
                            Automatically balances your content mix to prevent over-selling.
                        </p>
                        
                        <div className="space-y-4">
                            {/* Goals Input */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Your Monetization Goals (add multiple):
                                </label>
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {monetizationGoals.map((goal, index) => (
                                        <span
                                            key={index}
                                            className="px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-sm flex items-center gap-2"
                                        >
                                            {goal}
                                            <button
                                                onClick={() => setMonetizationGoals(monetizationGoals.filter((_, i) => i !== index))}
                                                className="text-primary-500 hover:text-primary-700 dark:hover:text-primary-200"
                                            >
                                                <XMarkIcon className="w-4 h-4" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="e.g., Increase paid subscribers, Retain existing fans, Upsell premium content"
                                        className="flex-1 p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        onKeyPress={(e) => {
                                            if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                                setMonetizationGoals([...monetizationGoals, e.currentTarget.value.trim()]);
                                                e.currentTarget.value = '';
                                            }
                                        }}
                                    />
                                    <button
                                        onClick={(e) => {
                                            const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                                            if (input.value.trim()) {
                                                setMonetizationGoals([...monetizationGoals, input.value.trim()]);
                                                input.value = '';
                                            }
                                        }}
                                        className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                                    >
                                        Add
                                    </button>
                                </div>
                            </div>

                            {/* Content Preferences */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Content Preferences (Optional):
                                </label>
                                <textarea
                                    value={monetizationPreferences}
                                    onChange={(e) => setMonetizationPreferences(e.target.value)}
                                    placeholder="e.g., 'Intimate content', 'Behind-the-scenes', 'Interactive posts'"
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[80px]"
                                />
                            </div>

                            {/* Subscriber Count */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Current Subscriber Count (Optional):
                                </label>
                                <input
                                    type="number"
                                    value={subscriberCount}
                                    onChange={(e) => setSubscriberCount(e.target.value ? parseInt(e.target.value) : '')}
                                    placeholder="e.g., 500"
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>

                            {/* Balance Sliders */}
                            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                <div className="flex items-center justify-between mb-4">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Content Balance (%):
                                    </label>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => {
                                                setBalanceEngagement(40);
                                                setBalanceUpsell(30);
                                                setBalanceRetention(20);
                                                setBalanceConversion(10);
                                            }}
                                            className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                                        >
                                            Reset to Default
                                        </button>
                                    </div>
                                </div>
                                <div className="mb-3 flex flex-wrap gap-2">
                                    <button
                                        onClick={() => {
                                            setBalanceEngagement(50);
                                            setBalanceUpsell(25);
                                            setBalanceRetention(20);
                                            setBalanceConversion(5);
                                        }}
                                        className="text-xs px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded hover:bg-primary-200 dark:hover:bg-primary-900/50"
                                    >
                                        Engagement Focus (50/25/20/5)
                                    </button>
                                    <button
                                        onClick={() => {
                                            setBalanceEngagement(35);
                                            setBalanceUpsell(35);
                                            setBalanceRetention(20);
                                            setBalanceConversion(10);
                                        }}
                                        className="text-xs px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded hover:bg-orange-200 dark:hover:bg-orange-900/50"
                                    >
                                        Balanced (35/35/20/10)
                                    </button>
                                    <button
                                        onClick={() => {
                                            setBalanceEngagement(30);
                                            setBalanceUpsell(30);
                                            setBalanceRetention(30);
                                            setBalanceConversion(10);
                                        }}
                                        className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50"
                                    >
                                        Retention Focus (30/30/30/10)
                                    </button>
                                </div>
                                <div className="space-y-4">
                                    {/* Engagement */}
                                    <div>
                                        <div className="flex justify-between mb-1">
                                            <span className="text-sm text-gray-700 dark:text-gray-300">Engagement (Free Content)</span>
                                            <span className="text-sm font-semibold text-primary-600 dark:text-primary-400">{balanceEngagement}%</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={balanceEngagement}
                                            onChange={(e) => setBalanceEngagement(parseInt(e.target.value))}
                                            className="w-full"
                                        />
                                    </div>
                                    {/* Upsell */}
                                    <div>
                                        <div className="flex justify-between mb-1">
                                            <span className="text-sm text-gray-700 dark:text-gray-300">Upsell (Tease Premium)</span>
                                            <span className="text-sm font-semibold text-orange-600 dark:text-orange-400">{balanceUpsell}%</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={balanceUpsell}
                                            onChange={(e) => setBalanceUpsell(parseInt(e.target.value))}
                                            className="w-full"
                                        />
                                    </div>
                                    {/* Retention */}
                                    <div>
                                        <div className="flex justify-between mb-1">
                                            <span className="text-sm text-gray-700 dark:text-gray-300">Retention (Keep Subscribers)</span>
                                            <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">{balanceRetention}%</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={balanceRetention}
                                            onChange={(e) => setBalanceRetention(parseInt(e.target.value))}
                                            className="w-full"
                                        />
                                    </div>
                                    {/* Conversion */}
                                    <div>
                                        <div className="flex justify-between mb-1">
                                            <span className="text-sm text-gray-700 dark:text-gray-300">Conversion (Direct Sales)</span>
                                            <span className="text-sm font-semibold text-green-600 dark:text-green-400">{balanceConversion}%</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={balanceConversion}
                                            onChange={(e) => setBalanceConversion(parseInt(e.target.value))}
                                            className="w-full"
                                        />
                                    </div>
                                </div>
                                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-600 dark:text-gray-400">Total:</span>
                                        <span className={`text-sm font-bold ${Math.abs((balanceEngagement + balanceUpsell + balanceRetention + balanceConversion) - 100) <= 1 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                            {balanceEngagement + balanceUpsell + balanceRetention + balanceConversion}%
                                        </span>
                                    </div>
                                    {Math.abs((balanceEngagement + balanceUpsell + balanceRetention + balanceConversion) - 100) > 1 && (
                                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">Balance must total 100%</p>
                                    )}
                                </div>
                            </div>

                            <button
                                onClick={handleGenerateMonetizationPlan}
                                disabled={isGenerating || monetizationGoals.length === 0 || Math.abs((balanceEngagement + balanceUpsell + balanceRetention + balanceConversion) - 100) > 1}
                                className="w-full px-4 py-3 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition-all shadow-md hover:shadow-lg"
                            >
                                {isGenerating ? (
                                    <>
                                        <RefreshIcon className="w-5 h-5 animate-spin" />
                                        Generating Monetization Plan...
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="w-5 h-5" />
                                        Generate Monetization Plan
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Generated Monetization Plan */}
                    {generatedMonetizationPlan && (
                        <div className="space-y-6">
                            {/* Summary */}
                            {generatedMonetizationPlan.summary && (
                                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                                    <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-200 mb-2">Strategy Summary</h3>
                                    <p className="text-blue-800 dark:text-blue-300">{generatedMonetizationPlan.summary}</p>
                                </div>
                            )}

                            {/* Balance Visualization */}
                            {generatedMonetizationPlan.balance && (
                                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Content Balance</h3>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="text-center p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                                            <p className="text-2xl font-bold text-primary-600 dark:text-primary-400">{generatedMonetizationPlan.balance.engagement}</p>
                                            <p className="text-xs text-gray-600 dark:text-gray-400">Engagement</p>
                                        </div>
                                        <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                                            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{generatedMonetizationPlan.balance.upsell}</p>
                                            <p className="text-xs text-gray-600 dark:text-gray-400">Upsell</p>
                                        </div>
                                        <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{generatedMonetizationPlan.balance.retention}</p>
                                            <p className="text-xs text-gray-600 dark:text-gray-400">Retention</p>
                                        </div>
                                        <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                                            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{generatedMonetizationPlan.balance.conversion}</p>
                                            <p className="text-xs text-gray-600 dark:text-gray-400">Conversion</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Warnings */}
                            {generatedMonetizationPlan.warnings && generatedMonetizationPlan.warnings.length > 0 && (
                                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                                    <h4 className="font-semibold text-yellow-900 dark:text-yellow-200 mb-2">⚠️ Warnings</h4>
                                    <ul className="list-disc list-inside space-y-1 text-yellow-800 dark:text-yellow-300 text-sm">
                                        {generatedMonetizationPlan.warnings.map((warning: string, index: number) => (
                                            <li key={index}>{warning}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Tips */}
                            {generatedMonetizationPlan.tips && generatedMonetizationPlan.tips.length > 0 && (
                                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                                    <h4 className="font-semibold text-green-900 dark:text-green-200 mb-2">💡 Tips</h4>
                                    <ul className="list-disc list-inside space-y-1 text-green-800 dark:text-green-300 text-sm">
                                        {generatedMonetizationPlan.tips.map((tip: string, index: number) => (
                                            <li key={index}>{tip}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Ideas by Category */}
                            {generatedMonetizationPlan.ideas && generatedMonetizationPlan.ideas.length > 0 && (
                                <div className="space-y-4">
                                    {/* Group ideas by label */}
                                    {['engagement', 'upsell', 'retention', 'conversion'].map((label) => {
                                        const categoryIdeas = generatedMonetizationPlan.ideas.filter((idea: any) => idea.label === label);
                                        if (categoryIdeas.length === 0) return null;

                                        const labelColors: Record<string, { bg: string; text: string; border: string }> = {
                                            engagement: { bg: 'bg-primary-50 dark:bg-primary-900/20', text: 'text-primary-700 dark:text-primary-300', border: 'border-primary-200 dark:border-primary-800' },
                                            upsell: { bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-800' },
                                            retention: { bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800' },
                                            conversion: { bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-700 dark:text-green-300', border: 'border-green-200 dark:border-green-800' },
                                        };

                                        const colors = labelColors[label] || labelColors.engagement;

                                        return (
                                            <div key={label} className={`${colors.bg} border ${colors.border} rounded-lg p-4`}>
                                                <h4 className={`text-lg font-semibold ${colors.text} mb-3 capitalize`}>
                                                    {label} Ideas ({categoryIdeas.length})
                                                </h4>
                                                <div className="space-y-3">
                                                    {categoryIdeas.map((idea: any, index: number) => (
                                                        <div key={index} className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                                                            <div className="flex items-start justify-between mb-2">
                                                                <h5 className="font-semibold text-gray-900 dark:text-white">{idea.idea}</h5>
                                                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                                    idea.pricing === 'free' ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300' :
                                                                    idea.pricing === 'teaser' ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300' :
                                                                    'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                                                                }`}>
                                                                    {idea.pricing === 'free' ? 'FREE' : idea.pricing === 'teaser' ? 'TEASER' : 'PAID'}
                                                                </span>
                                                            </div>
                                                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{idea.description}</p>
                                                            <div className="flex flex-wrap gap-2 text-xs">
                                                                <span className="text-gray-500 dark:text-gray-400">📅 {idea.suggestedTiming}</span>
                                                                {idea.cta && (
                                                                    <span className="text-primary-600 dark:text-primary-400">💬 CTA: {idea.cta}</span>
                                                                )}
                                                                {idea.priority && (
                                                                    <span className="text-gray-500 dark:text-gray-400">⭐ Priority: {idea.priority}/5</span>
                                                                )}
                                                            </div>
                                                            <button
                                                                onClick={() => copyToClipboard(`${idea.idea}\n\n${idea.description}\n\nPricing: ${idea.pricing}\nTiming: ${idea.suggestedTiming}\nCTA: ${idea.cta}`)}
                                                                className="mt-2 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                                            >
                                                                Copy Details
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Weekly Distribution */}
                            {generatedMonetizationPlan.weeklyDistribution && generatedMonetizationPlan.weeklyDistribution.length > 0 && (
                                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Weekly Distribution</h3>
                                    <div className="space-y-3">
                                        {generatedMonetizationPlan.weeklyDistribution.map((day: any, index: number) => (
                                            <div key={index} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                                <div className="flex items-start justify-between mb-2">
                                                    <h4 className="font-semibold text-gray-900 dark:text-white">{day.day}</h4>
                                                    <span className="text-xs text-primary-600 dark:text-primary-400">{day.focus}</span>
                                                </div>
                                                <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                                                    {day.ideas.map((idea: string, ideaIndex: number) => (
                                                        <li key={ideaIndex}>{idea}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
