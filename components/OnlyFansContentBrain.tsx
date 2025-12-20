import React, { useState, useEffect } from 'react';
import { useAppContext } from './AppContext';
import { SparklesIcon, RefreshIcon, DownloadIcon, UploadIcon, XMarkIcon, CopyIcon } from './icons/UIIcons';
import { auth, storage, db } from '../firebaseConfig';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, Timestamp } from 'firebase/firestore';

type ContentType = 'captions' | 'mediaCaptions' | 'postIdeas' | 'shootConcepts' | 'weeklyPlan';

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
        } catch (err: any) {
            console.error('Error initializing OnlyFansContentBrain:', err);
            setError(err?.message || 'Failed to initialize component');
            setIsLoading(false);
        }
    }, []);

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
            setGeneratedPostIdeas(Array.isArray(ideas) && ideas.length > 0 ? ideas : (typeof text === 'string' ? [text] : []));
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
            setGeneratedShootConcepts(Array.isArray(concepts) && concepts.length > 0 ? concepts : (typeof text === 'string' ? [text] : []));
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
            setGeneratedWeeklyPlan(data.plan || JSON.stringify(data, null, 2));
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

    const saveToHistory = async (type: 'optimize' | 'predict' | 'repurpose', title: string, data: any) => {
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

    const tabs: { id: ContentType; label: string }[] = [
        { id: 'captions', label: 'AI Captions' },
        { id: 'mediaCaptions', label: 'Image/Video Captions' },
        { id: 'postIdeas', label: 'Post Ideas' },
        { id: 'shootConcepts', label: 'Shoot Concepts' },
        { id: 'weeklyPlan', label: 'Weekly Plan' },
    ];

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

            {/* Media Captions Tab */}
            {activeTab === 'mediaCaptions' && (
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
                                                src={mediaPreview}
                                                controls
                                                className="w-full max-h-96 rounded-lg"
                                            />
                                        ) : (
                                            <img
                                                src={mediaPreview}
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
        </div>
    );
};
