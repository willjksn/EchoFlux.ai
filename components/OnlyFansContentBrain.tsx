import React, { useState } from 'react';
import { useAppContext } from './AppContext';
import { SparklesIcon, RefreshIcon, DownloadIcon, CheckIcon, UploadIcon, ImageIcon, VideoIcon, XMarkIcon } from './icons/UIIcons';
import { auth, storage } from '../firebaseConfig';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

type ContentType = 'captions' | 'mediaCaptions' | 'postIdeas' | 'shootConcepts' | 'weeklyPlan';

export const OnlyFansContentBrain: React.FC = () => {
    const { user, showToast } = useAppContext();
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
            const captions = Array.isArray(data) 
                ? data.map((item: any) => {
                    const caption = item.caption || '';
                    const hashtags = item.hashtags || [];
                    return hashtags.length > 0 ? `${caption} ${hashtags.join(' ')}` : caption;
                })
                : [];
            setGeneratedCaptions(captions);
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
            const ideas = text.split(/\d+\./).filter(item => item.trim()).map(item => item.trim());
            setGeneratedPostIdeas(ideas.length > 0 ? ideas : [text]);
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
            const concepts = text.split(/\d+\./).filter(item => item.trim()).map(item => item.trim());
            setGeneratedShootConcepts(concepts.length > 0 ? concepts : [text]);
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
            const captions = Array.isArray(data) ? data : [];
            setGeneratedMediaCaptions(captions);
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
                    {generatedCaptions.length > 0 && (
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
                                        <button
                                            onClick={() => copyToClipboard(caption)}
                                            className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
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
                    {generatedMediaCaptions.length > 0 && (
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
                                        <button
                                            onClick={() => copyToClipboard(`${result.caption} ${(result.hashtags || []).join(' ')}`.trim())}
                                            className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                        >
                                            Copy Full Caption
                                        </button>
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
                    {generatedPostIdeas.length > 0 && (
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
                    {generatedShootConcepts.length > 0 && (
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
