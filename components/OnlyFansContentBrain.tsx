import React, { useState } from 'react';
import { useAppContext } from './AppContext';
import { SparklesIcon, RefreshIcon, DownloadIcon, CheckIcon, UploadIcon, ImageIcon, VideoIcon, XMarkIcon, CopyIcon } from './icons/UIIcons';
import { auth, storage, db } from '../firebaseConfig';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, Timestamp } from 'firebase/firestore';

type ContentType = 'captions' | 'mediaCaptions' | 'postIdeas' | 'shootConcepts' | 'weeklyPlan';

export const OnlyFansContentBrain: React.FC = () => {
    // Hooks must be called unconditionally - ErrorBoundary will catch any errors
    const context = useAppContext();
    const user = context?.user;
    const showToast = context?.showToast || (() => {});
    
    const [activeTab, setActiveTab] = useState<ContentType>('captions');
    const [isGenerating, setIsGenerating] = useState(false);
    
    // Show loading/error state if user is not available
    if (!user) {
        return (
            <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-full flex items-center justify-center">
                <div className="text-center">
                    <p className="text-gray-500 dark:text-gray-400 mb-4">Loading Content Brain...</p>
                </div>
            </div>
        );
    }
    
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
    const [currentCaptionForAI, setCurrentCaptionForAI] = useState<{caption: string; index: number; type: 'plain' | 'media'}> | null>(null);

    const handleGenerateCaptions = async () => {
        if (!captionPrompt.trim()) {
            showToast('Please enter a description or idea for your caption', 'error');
            return;
        }

        setIsGenerating(true);
        try {
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
            showToast('Captions generated successfully!', 'success');
        } catch (error: any) {
            console.error('Error generating captions:', error);
            showToast(error.message || 'Failed to generate captions. Please try again.', 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGeneratePostIdeas = async () => {
        if (!postIdeaPrompt.trim()) {
            showToast('Please enter what kind of post ideas you\'re looking for', 'error');
            return;
        }

        setIsGenerating(true);
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
            showToast('Post ideas generated successfully!', 'success');
        } catch (error: any) {
            console.error('Error generating post ideas:', error);
            showToast(error.message || 'Failed to generate post ideas. Please try again.', 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGenerateShootConcepts = async () => {
        if (!shootConceptPrompt.trim()) {
            showToast('Please describe the type of shoot concept you\'re looking for', 'error');
            return;
        }

        setIsGenerating(true);
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
            showToast('Shoot concepts generated successfully!', 'success');
        } catch (error: any) {
            console.error('Error generating shoot concepts:', error);
            showToast(error.message || 'Failed to generate shoot concepts. Please try again.', 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGenerateWeeklyPlan = async () => {
        if (!weeklyPlanPrompt.trim()) {
            showToast('Please describe your goals or preferences for the week', 'error');
            return;
        }

        setIsGenerating(true);
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
            showToast('Weekly plan generated successfully!', 'success');
        } catch (error: any) {
            console.error('Error generating weekly plan:', error);
            showToast(error.message || 'Failed to generate weekly plan. Please try again.', 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!', 'success');
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
            showToast('Please upload an image or video', 'error');
            return;
        }

        // Check file size (more lenient since we're using Firebase Storage, not base64)
        const fileSizeMB = mediaFile.size / 1024 / 1024;
        const isVideo = mediaFile.type.startsWith('video/');
        const maxSizeMB = isVideo ? 100 : 10; // Firebase Storage can handle larger files

        if (fileSizeMB > maxSizeMB) {
            showToast(
                `File is too large (${fileSizeMB.toFixed(1)}MB). Maximum size: ${maxSizeMB}MB for ${isVideo ? 'videos' : 'images'}. Please compress or use a smaller file.`,
                'error'
            );
            return;
        }

        setIsGenerating(true);
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
            showToast('Captions generated successfully!', 'success');
        } catch (error: any) {
            console.error('Error generating media captions:', error);
            showToast(error.message || 'Failed to generate captions. Please try again.', 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    // Compress image to reduce file size (aggressive compression to account for base64 overhead)
    // Base64 encoding adds ~33% overhead, so we target ~2.5MB to stay under 4MB after encoding
    const compressImage = (file: File, maxWidth = 1400, maxHeight = 1400, targetSizeMB = 2.5): Promise<File> => {
        return new Promise((resolve, reject) => {
            // Only compress images, not videos
            if (!file.type.startsWith('image/')) {
                resolve(file);
                return;
            }

            // Check initial file size - if already small enough (accounting for base64 overhead), skip compression
            const fileSizeMB = file.size / 1024 / 1024;
            // Account for base64 overhead (33% increase)
            const estimatedEncodedSizeMB = fileSizeMB * 1.33;
            if (estimatedEncodedSizeMB <= 3.8) {
                resolve(file);
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    // Calculate new dimensions
                    if (width > height) {
                        if (width > maxWidth) {
                            height = Math.round((height * maxWidth) / width);
                            width = maxWidth;
                        }
                    } else {
                        if (height > maxHeight) {
                            width = Math.round((width * maxHeight) / height);
                            height = maxHeight;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        reject(new Error('Failed to get canvas context'));
                        return;
                    }

                    ctx.drawImage(img, 0, 0, width, height);

                    // Progressive compression - aggressively reduce quality until target size is reached
                    const tryCompress = (q: number, attempt: number = 0): void => {
                        if (attempt > 10) {
                            // Prevent infinite loops - if we've tried 10 times, use the last result
                            reject(new Error('Unable to compress image to target size. Please use a smaller image.'));
                            return;
                        }

                        canvas.toBlob(
                            (blob) => {
                                if (!blob) {
                                    reject(new Error('Failed to compress image'));
                                    return;
                                }
                                
                                const blobSizeMB = blob.size / 1024 / 1024;
                                // Account for base64 overhead when checking size
                                const estimatedEncodedSizeMB = blobSizeMB * 1.33;
                                
                                // If still too large and we can reduce quality further, try again
                                if (estimatedEncodedSizeMB > 3.8 && q > 0.4) {
                                    // Reduce quality more aggressively
                                    const newQuality = Math.max(0.4, q - 0.15);
                                    tryCompress(newQuality, attempt + 1);
                                    return;
                                }
                                
                                // If still too large even at minimum quality, reduce dimensions
                                if (estimatedEncodedSizeMB > 3.8 && width > 800) {
                                    const newWidth = Math.floor(width * 0.8);
                                    const newHeight = Math.floor(height * 0.8);
                                    canvas.width = newWidth;
                                    canvas.height = newHeight;
                                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                                    ctx.drawImage(img, 0, 0, newWidth, newHeight);
                                    tryCompress(0.6, attempt + 1);
                                    return;
                                }
                                
                                const compressedFile = new File([blob], file.name, {
                                    type: file.type,
                                    lastModified: Date.now(),
                                });
                                resolve(compressedFile);
                            },
                            file.type,
                            Math.max(0.4, q) // Ensure minimum quality of 0.4
                        );
                    };

                    // Start with 0.65 quality (more aggressive)
                    tryCompress(0.65);
                };
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = e.target?.result as string;
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    };

    const handleMediaFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Since we're using Firebase Storage, we can accept larger files
        // No need for compression - Firebase Storage handles large files
        setMediaFile(file);
        const previewUrl = URL.createObjectURL(file);
        setMediaPreview(previewUrl);
    };

    // Guard against any unexpected non-array values that may slip in from API responses
    const captionsList = Array.isArray(generatedCaptions) ? generatedCaptions : [];
    const mediaCaptionsList = Array.isArray(generatedMediaCaptions) ? generatedMediaCaptions : [];
    const postIdeasList = Array.isArray(generatedPostIdeas) ? generatedPostIdeas : [];
    const shootConceptsList = Array.isArray(generatedShootConcepts) ? generatedShootConcepts : [];

    const tabs: { id: ContentType; label: string }[] = [
        { id: 'captions', label: 'AI Captions' },
        { id: 'mediaCaptions', label: 'Image/Video Captions' },
        { id: 'postIdeas', label: 'Post Ideas' },
        { id: 'shootConcepts', label: 'Shoot Concepts' },
        { id: 'weeklyPlan', label: 'Weekly Plan' },
    ];

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
                    {captionsList.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                Generated Captions
                            </h3>
                            <div className="space-y-3">
                                {captionsList.map((caption, index) => (
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
                                            <button
                                                onClick={async () => {
                                                    setCurrentCaptionForAI({ caption, index, type: 'plain' });
                                                    setIsGenerating(true);
                                                    try {
                                                        const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
                                                        const response = await fetch('/api/optimizeCaption', {
                                                            method: 'POST',
                                                            headers: {
                                                                'Content-Type': 'application/json',
                                                                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                                                            },
                                                            body: JSON.stringify({
                                                                originalCaption: caption,
                                                                platform: 'OnlyFans',
                                                                niche: 'Adult Content Creator (OnlyFans)',
                                                                tone: captionTone,
                                                                goal: captionGoal,
                                                            }),
                                                        });
                                                        if (!response.ok) throw new Error('Failed to optimize');
                                                        const data = await response.json();
                                                        if (data.success) {
                                                            setOptimizeResult(data);
                                                            setShowOptimizeModal(true);
                                                            await saveToHistory('optimize', `Caption Optimization - OnlyFans`, data);
                                                            showToast('Caption optimized!', 'success');
                                                        }
                                                    } catch (error: any) {
                                                        showToast(error.message || 'Failed to optimize', 'error');
                                                    } finally {
                                                        setIsGenerating(false);
                                                    }
                                                }}
                                                disabled={isGenerating}
                                                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50"
                                            >
                                                Optimize
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    setCurrentCaptionForAI({ caption, index, type: 'plain' });
                                                    setIsGenerating(true);
                                                    try {
                                                        const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
                                                        const response = await fetch('/api/predictContentPerformance', {
                                                            method: 'POST',
                                                            headers: {
                                                                'Content-Type': 'application/json',
                                                                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                                                            },
                                                            body: JSON.stringify({
                                                                caption: caption,
                                                                platform: 'OnlyFans',
                                                                niche: 'Adult Content Creator (OnlyFans)',
                                                                tone: captionTone,
                                                                goal: captionGoal,
                                                            }),
                                                        });
                                                        if (!response.ok) throw new Error('Failed to predict');
                                                        const data = await response.json();
                                                        if (data.success) {
                                                            setPredictResult(data);
                                                            setShowPredictModal(true);
                                                            await saveToHistory('predict', `Performance Prediction - OnlyFans`, data);
                                                            showToast('Performance predicted!', 'success');
                                                        }
                                                    } catch (error: any) {
                                                        showToast(error.message || 'Failed to predict', 'error');
                                                    } finally {
                                                        setIsGenerating(false);
                                                    }
                                                }}
                                                disabled={isGenerating}
                                                className="text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 disabled:opacity-50"
                                            >
                                                Predict
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    setCurrentCaptionForAI({ caption, index, type: 'plain' });
                                                    setIsGenerating(true);
                                                    try {
                                                        const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
                                                        const response = await fetch('/api/repurposeContent', {
                                                            method: 'POST',
                                                            headers: {
                                                                'Content-Type': 'application/json',
                                                                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                                                            },
                                                            body: JSON.stringify({
                                                                originalContent: caption,
                                                                originalPlatform: 'OnlyFans',
                                                                targetPlatforms: ['Instagram', 'TikTok', 'X', 'LinkedIn'],
                                                                niche: 'Adult Content Creator (OnlyFans)',
                                                                tone: captionTone,
                                                                goal: captionGoal,
                                                            }),
                                                        });
                                                        if (!response.ok) throw new Error('Failed to repurpose');
                                                        const data = await response.json();
                                                        if (data.success) {
                                                            setRepurposeResult(data);
                                                            setShowRepurposeModal(true);
                                                            await saveToHistory('repurpose', `Content Repurposing - OnlyFans`, data);
                                                            showToast('Content repurposed!', 'success');
                                                        }
                                                    } catch (error: any) {
                                                        showToast(error.message || 'Failed to repurpose', 'error');
                                                    } finally {
                                                        setIsGenerating(false);
                                                    }
                                                }}
                                                disabled={isGenerating}
                                                className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 disabled:opacity-50"
                                            >
                                                Repurpose
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
                    {mediaCaptionsList.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                Generated Captions
                            </h3>
                            <div className="space-y-3">
                                {mediaCaptionsList.map((result, index) => (
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
                                            <button
                                                onClick={async () => {
                                                    setCurrentCaptionForAI({ caption: result.caption, index, type: 'media' });
                                                    setIsGenerating(true);
                                                    try {
                                                        const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
                                                        const response = await fetch('/api/optimizeCaption', {
                                                            method: 'POST',
                                                            headers: {
                                                                'Content-Type': 'application/json',
                                                                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                                                            },
                                                            body: JSON.stringify({
                                                                originalCaption: result.caption,
                                                                platform: 'OnlyFans',
                                                                niche: 'Adult Content Creator (OnlyFans)',
                                                                tone: mediaCaptionTone,
                                                                goal: mediaCaptionGoal,
                                                            }),
                                                        });
                                                        if (!response.ok) throw new Error('Failed to optimize');
                                                        const data = await response.json();
                                                        if (data.success) {
                                                            setOptimizeResult(data);
                                                            setShowOptimizeModal(true);
                                                            await saveToHistory('optimize', `Caption Optimization - OnlyFans`, data);
                                                            showToast('Caption optimized!', 'success');
                                                        }
                                                    } catch (error: any) {
                                                        showToast(error.message || 'Failed to optimize', 'error');
                                                    } finally {
                                                        setIsGenerating(false);
                                                    }
                                                }}
                                                disabled={isGenerating}
                                                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50"
                                            >
                                                Optimize
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    setCurrentCaptionForAI({ caption: result.caption, index, type: 'media' });
                                                    setIsGenerating(true);
                                                    try {
                                                        const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
                                                        const response = await fetch('/api/predictContentPerformance', {
                                                            method: 'POST',
                                                            headers: {
                                                                'Content-Type': 'application/json',
                                                                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                                                            },
                                                            body: JSON.stringify({
                                                                caption: result.caption,
                                                                platform: 'OnlyFans',
                                                                niche: 'Adult Content Creator (OnlyFans)',
                                                                tone: mediaCaptionTone,
                                                                goal: mediaCaptionGoal,
                                                            }),
                                                        });
                                                        if (!response.ok) throw new Error('Failed to predict');
                                                        const data = await response.json();
                                                        if (data.success) {
                                                            setPredictResult(data);
                                                            setShowPredictModal(true);
                                                            await saveToHistory('predict', `Performance Prediction - OnlyFans`, data);
                                                            showToast('Performance predicted!', 'success');
                                                        }
                                                    } catch (error: any) {
                                                        showToast(error.message || 'Failed to predict', 'error');
                                                    } finally {
                                                        setIsGenerating(false);
                                                    }
                                                }}
                                                disabled={isGenerating}
                                                className="text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 disabled:opacity-50"
                                            >
                                                Predict
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    setCurrentCaptionForAI({ caption: result.caption, index, type: 'media' });
                                                    setIsGenerating(true);
                                                    try {
                                                        const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
                                                        const response = await fetch('/api/repurposeContent', {
                                                            method: 'POST',
                                                            headers: {
                                                                'Content-Type': 'application/json',
                                                                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                                                            },
                                                            body: JSON.stringify({
                                                                originalContent: result.caption,
                                                                originalPlatform: 'OnlyFans',
                                                                targetPlatforms: ['Instagram', 'TikTok', 'X', 'LinkedIn'],
                                                                niche: 'Adult Content Creator (OnlyFans)',
                                                                tone: mediaCaptionTone,
                                                                goal: mediaCaptionGoal,
                                                            }),
                                                        });
                                                        if (!response.ok) throw new Error('Failed to repurpose');
                                                        const data = await response.json();
                                                        if (data.success) {
                                                            setRepurposeResult(data);
                                                            setShowRepurposeModal(true);
                                                            await saveToHistory('repurpose', `Content Repurposing - OnlyFans`, data);
                                                            showToast('Content repurposed!', 'success');
                                                        }
                                                    } catch (error: any) {
                                                        showToast(error.message || 'Failed to repurpose', 'error');
                                                    } finally {
                                                        setIsGenerating(false);
                                                    }
                                                }}
                                                disabled={isGenerating}
                                                className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 disabled:opacity-50"
                                            >
                                                Repurpose
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
                    {postIdeasList.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                Post Ideas
                            </h3>
                            <div className="space-y-3">
                                {postIdeasList.map((idea, index) => (
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
                    {shootConceptsList.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                Shoot Concepts
                            </h3>
                            <div className="space-y-4">
                                {shootConceptsList.map((concept, index) => (
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

            {/* Optimize Modal */}
            {showOptimizeModal && optimizeResult && (
                <OptimizeModal
                    result={optimizeResult}
                    onClose={() => setShowOptimizeModal(false)}
                    onCopy={(text) => {
                        navigator.clipboard.writeText(text);
                        showToast('Copied to clipboard!', 'success');
                    }}
                />
            )}

            {/* Predict Modal */}
            {showPredictModal && predictResult && (
                <PredictModal
                    result={predictResult}
                    onClose={() => setShowPredictModal(false)}
                    onCopy={(text) => {
                        navigator.clipboard.writeText(text);
                        showToast('Copied to clipboard!', 'success');
                    }}
                />
            )}

            {/* Repurpose Modal */}
            {showRepurposeModal && repurposeResult && repurposeResult.repurposedContent !== undefined && (
                <RepurposeModal
                    result={repurposeResult}
                    onClose={() => setShowRepurposeModal(false)}
                    onCopy={(text) => {
                        navigator.clipboard.writeText(text);
                        showToast('Copied to clipboard!', 'success');
                    }}
                />
            )}
        </div>
    );
};

// Optimize Modal Component
const OptimizeModal: React.FC<{ result: any; onClose: () => void; onCopy: (text: string) => void }> = ({ result, onClose, onCopy }) => {
    // Safety check: ensure result is valid
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
        return null;
    }
    
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Caption Optimization</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Original vs Optimized */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Original</h3>
                            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                <p className="text-gray-900 dark:text-white whitespace-pre-wrap">{result.originalCaption}</p>
                            </div>
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Optimized</h3>
                            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                <p className="text-blue-900 dark:text-blue-200 whitespace-pre-wrap">{result.optimizedCaption}</p>
                            </div>
                        </div>
                    </div>

                    {/* Scores */}
                    {result.scores && typeof result.scores === 'object' && !Array.isArray(result.scores) && result.scores !== null && (
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Quality Scores</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {result.scores && typeof result.scores === 'object' && result.scores !== null
                                    ? Object.entries(result.scores).map(([key, value]: [string, any]) => (
                                        <div key={key} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                                            <p className="text-2xl font-bold text-primary-600 dark:text-primary-400">{value}/10</p>
                                        </div>
                                    ))
                                    : null}
                            </div>
                        </div>
                    )}

                    {/* Improvements */}
                    {Array.isArray(result.improvements) && result.improvements.length > 0 && (
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Improvements Made</h3>
                            <div className="space-y-2">
                                {result.improvements.map((imp: any, idx: number) => (
                                    <div key={idx} className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white mb-1 capitalize">{imp.area}</p>
                                        <p className="text-xs text-gray-600 dark:text-gray-400">{imp.fix}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 italic">{imp.impact}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Hashtag Suggestions */}
                    {Array.isArray(result.hashtagSuggestions) && result.hashtagSuggestions.length > 0 && (
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Hashtag Suggestions</h3>
                            <div className="flex flex-wrap gap-2">
                                {result.hashtagSuggestions.map((tag: any, idx: number) => (
                                    <span
                                        key={idx}
                                        className="px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-sm"
                                    >
                                        #{tag.hashtag}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
                    <button
                        onClick={() => onCopy(result.optimizedCaption)}
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex items-center gap-2"
                    >
                        <CopyIcon className="w-4 h-4" />
                        Copy Optimized
                    </button>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

// Predict Modal Component
const PredictModal: React.FC<{ result: any; onClose: () => void; onCopy: (text: string) => void }> = ({ result, onClose, onCopy }) => {
    // Safety check: ensure result is valid
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
        return null;
    }
    
    const prediction = result.prediction || {};
    const level = prediction.level || 'Medium';
    const score = prediction.score || 50;
    const confidence = prediction.confidence || 50;

    const getLevelColor = (level: string) => {
        if (level === 'High') return 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800';
        if (level === 'Medium') return 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800';
        return 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800';
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Performance Prediction</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Prediction Summary */}
                    <div className={`p-6 rounded-lg border-2 ${getLevelColor(level)}`}>
                        <div className="text-center">
                            <p className="text-sm font-medium mb-2">Predicted Performance</p>
                            <p className="text-4xl font-bold mb-2">{level}</p>
                            <div className="flex items-center justify-center gap-4 mt-4">
                                <div>
                                    <p className="text-xs opacity-75">Score</p>
                                    <p className="text-2xl font-bold">{score}/100</p>
                                </div>
                                <div>
                                    <p className="text-xs opacity-75">Confidence</p>
                                    <p className="text-2xl font-bold">{confidence}%</p>
                                </div>
                            </div>
                            {prediction.reasoning && (
                                <p className="text-sm mt-4 opacity-90">{prediction.reasoning}</p>
                            )}
                        </div>
                    </div>

                    {/* Factor Breakdown */}
                    {result.factors && typeof result.factors === 'object' && !Array.isArray(result.factors) && result.factors !== null && (
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Factor Analysis</h3>
                            <div className="space-y-3">
                                {result.factors && typeof result.factors === 'object' && result.factors !== null
                                    ? Object.entries(result.factors).map(([key, value]: [string, any]) => (
                                        <div key={key} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                                                {key.replace(/([A-Z])/g, ' $1').trim()}
                                            </p>
                                            <p className="text-lg font-bold text-primary-600 dark:text-primary-400">
                                                {value.score || 0}/100
                                            </p>
                                        </div>
                                        {value.analysis && (
                                            <p className="text-xs text-gray-600 dark:text-gray-400">{value.analysis}</p>
                                        )}
                                    </div>
                                    ))
                                    : null}
                            </div>
                        </div>
                    )}

                    {/* Improvements */}
                    {Array.isArray(result.improvements) && result.improvements.length > 0 ? (
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Improvement Suggestions</h3>
                            <div className="space-y-2">
                                {result.improvements.map((imp: any, idx: number) => (
                                    <div key={idx} className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                        <div className="flex items-start justify-between mb-1">
                                            <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">{imp.factor}</p>
                                            <span className={`text-xs px-2 py-1 rounded ${
                                                imp.priority === 'high' ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300' :
                                                imp.priority === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300' :
                                                'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                            }`}>
                                                {imp.priority}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">{imp.currentIssue}</p>
                                        <p className="text-xs text-gray-700 dark:text-gray-300 font-medium">{imp.suggestion}</p>
                                        <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">{imp.expectedImpact}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    {/* Optimized Version */}
                    {result.optimizedVersion && (
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Optimized Version</h3>
                            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                                <p className="text-gray-900 dark:text-white whitespace-pre-wrap mb-2">{result.optimizedVersion.caption}</p>
                                {result.optimizedVersion.expectedBoost && (
                                    <p className="text-xs text-green-700 dark:text-green-300 font-medium">
                                        Expected Boost: {result.optimizedVersion.expectedBoost}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Summary */}
                    {result.summary && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                            <p className="text-blue-900 dark:text-blue-200 text-sm">{result.summary}</p>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
                    {result.optimizedVersion && (
                        <button
                            onClick={() => onCopy(result.optimizedVersion.caption)}
                            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex items-center gap-2"
                        >
                            <CopyIcon className="w-4 h-4" />
                            Copy Optimized
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

// Repurpose Modal Component
const RepurposeModal: React.FC<{ result: any; onClose: () => void; onCopy: (text: string) => void }> = ({ result, onClose, onCopy }) => {
    // Defensive check: ensure repurposedContent is always an array (handle cases where API returns 0 or other non-array values)
    let repurposedContent: any[] = [];
    if (result && result !== null && typeof result === 'object') {
        const content = result.repurposedContent;
        if (content !== undefined && content !== null) {
            if (Array.isArray(content)) {
                repurposedContent = content;
            } else {
                // If API returns 0, string, or other non-array, default to empty array
                repurposedContent = [];
            }
        }
    }

    const copyPlatformContent = (item: any) => {
        const hashtags = Array.isArray(item.hashtags) ? item.hashtags : [];
        const optimizations = Array.isArray(item.optimizations) ? item.optimizations : [];
        const text = `${item.platform || ''} (${item.format || ''})\n\n${item.caption || ''}\n\nHashtags: ${hashtags.join(' ')}\n\nOptimizations:\n${optimizations.map((opt: string) => `• ${opt}`).join('\n')}`;
        onCopy(text);
    };

    const copyAllContent = () => {
        // Double-check that repurposedContent is an array (defensive programming)
        const safeContent = Array.isArray(repurposedContent) ? repurposedContent : [];
        if (safeContent.length === 0) {
            onCopy('No content to copy');
            return;
        }
        const text = safeContent.map((item: any) => {
            const hashtags = Array.isArray(item.hashtags) ? item.hashtags : [];
            const optimizations = Array.isArray(item.optimizations) ? item.optimizations : [];
            return `--- ${item.platform || ''} (${item.format || ''}) ---\n${item.caption || ''}\n\nHashtags: ${hashtags.join(' ')}\n\nOptimizations:\n${optimizations.map((opt: string) => `• ${opt}`).join('\n')}`;
        }).join('\n\n');
        onCopy(text);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Repurposed Content</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {result.summary && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                            <p className="text-blue-900 dark:text-blue-200 text-sm">{result.summary}</p>
                        </div>
                    )}

                    {Array.isArray(repurposedContent) && repurposedContent.length > 0 && repurposedContent.map((item: any, idx: number) => (
                        <div key={idx} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{item.platform}</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{item.format}</p>
                                </div>
                                <button
                                    onClick={() => copyPlatformContent(item)}
                                    className="px-3 py-1 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm flex items-center gap-1"
                                >
                                    <CopyIcon className="w-4 h-4" />
                                    Copy
                                </button>
                            </div>

                            <div className="mb-3">
                                <p className="text-gray-900 dark:text-white whitespace-pre-wrap">{item.caption}</p>
                            </div>

                            {Array.isArray(item.hashtags) && item.hashtags.length > 0 && (
                                <div className="mb-3">
                                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Hashtags:</p>
                                    <div className="flex flex-wrap gap-2">
                                        {item.hashtags.map((tag: string, tagIdx: number) => (
                                            <span
                                                key={tagIdx}
                                                className="px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded text-xs"
                                            >
                                                #{tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {Array.isArray(item.optimizations) && item.optimizations.length > 0 && (
                                <div>
                                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Optimizations:</p>
                                    <ul className="list-disc list-inside space-y-1">
                                        {item.optimizations.map((opt: string, optIdx: number) => (
                                            <li key={optIdx} className="text-xs text-gray-600 dark:text-gray-400">{opt}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {item.suggestedPostingTime && (
                                <p className="text-xs text-primary-600 dark:text-primary-400 mt-2">
                                    💡 Best posting time: {item.suggestedPostingTime}
                                </p>
                            )}
                        </div>
                    ))}
                </div>

                <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
                    <button
                        onClick={copyAllContent}
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex items-center gap-2"
                    >
                        <CopyIcon className="w-4 h-4" />
                        Copy All
                    </button>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
