import React, { useState, useEffect } from 'react';
import { useAppContext } from './AppContext';
import { SparklesIcon, RefreshIcon, XMarkIcon, ClockIcon, CopyIcon, TrashIcon, UploadIcon, DownloadIcon } from './icons/UIIcons';
import { auth, storage, db } from '../firebaseConfig';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, query, getDocs, deleteDoc, doc, orderBy, Timestamp } from 'firebase/firestore';
import { Platform } from '../types';
import { InstagramIcon, TikTokIcon, ThreadsIcon, XIcon, YouTubeIcon, LinkedInIcon, FacebookIcon, PinterestIcon } from './icons/PlatformIcons';

type IntelligenceType = 'gap_analysis' | 'predict' | 'optimize' | 'repurpose' | 'media_captions';

interface HistoryItem {
    id: string;
    type: IntelligenceType;
    title: string;
    data: any;
    createdAt: Timestamp;
}

export const ContentIntelligence: React.FC = () => {
    const { user, showToast, activePage } = useAppContext();
    const [activeTab, setActiveTab] = useState<'tools' | 'history'>('tools');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [isPredicting, setIsPredicting] = useState(false);
    const [isRepurposing, setIsRepurposing] = useState(false);
    const [isGeneratingMediaCaptions, setIsGeneratingMediaCaptions] = useState(false);
    
    // Detect if we're in OnlyFans Studio context
    const isOnlyFansStudio = activePage === 'onlyfansStudio' || window.location.pathname.includes('onlyfansStudio');
    
    // Results state
    const [gapAnalysis, setGapAnalysis] = useState<any>(null);
    const [optimizeResult, setOptimizeResult] = useState<any>(null);
    const [predictResult, setPredictResult] = useState<any>(null);
    const [repurposeResult, setRepurposeResult] = useState<any>(null);
    const [generatedMediaCaptions, setGeneratedMediaCaptions] = useState<{caption: string; hashtags: string[]}[]>([]);
    
    // Modals
    const [showGapModal, setShowGapModal] = useState(false);
    const [showOptimizeModal, setShowOptimizeModal] = useState(false);
    const [showPredictModal, setShowPredictModal] = useState(false);
    const [showRepurposeModal, setShowRepurposeModal] = useState(false);
    
    // Inputs - default to OnlyFans if in OnlyFans Studio context
    const [captionInput, setCaptionInput] = useState('');
    const [platformInput, setPlatformInput] = useState<Platform>('Instagram');
    
    // Media captions inputs (integrated into Content Input)
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [mediaPreview, setMediaPreview] = useState<string | null>(null);
    const [mediaCaptionTone, setMediaCaptionTone] = useState<'Playful' | 'Flirty' | 'Confident' | 'Teasing' | 'Intimate' | 'Explicit'>('Teasing');
    const [mediaCaptionGoal, setMediaCaptionGoal] = useState('engagement');
    const [mediaCaptionPrompt, setMediaCaptionPrompt] = useState('');
    
    // History
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    useEffect(() => {
        if (user?.id && activeTab === 'history') {
            loadHistory();
        }
    }, [user?.id, activeTab]);

    const loadHistory = async () => {
        if (!user?.id) return;
        setLoadingHistory(true);
        try {
            const historyRef = collection(db, 'users', user.id, 'content_intelligence_history');
            const q = query(historyRef, orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            const items: HistoryItem[] = [];
            snapshot.forEach((doc) => {
                items.push({ id: doc.id, ...doc.data() } as HistoryItem);
            });
            setHistory(items);
        } catch (error: any) {
            console.error('Error loading history:', error);
            showToast('Failed to load history', 'error');
        } finally {
            setLoadingHistory(false);
        }
    };

    const saveToHistory = async (type: IntelligenceType, title: string, data: any) => {
        if (!user?.id) {
            console.warn('Cannot save to history: user not logged in');
            return;
        }
        try {
            await addDoc(collection(db, 'users', user.id, 'content_intelligence_history'), {
                type,
                title,
                data,
                createdAt: Timestamp.now(),
            });
            console.log('Saved to history:', type, title);
            if (activeTab === 'history') {
                loadHistory();
            }
        } catch (error: any) {
            console.error('Error saving to history:', error);
            showToast('Failed to save to history. Results may be lost if you leave the page.', 'error');
        }
    };

    const handleGapAnalysis = async () => {
        if (!user) {
            showToast('Please sign in to analyze content gaps', 'error');
            return;
        }

        setIsAnalyzing(true);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            const response = await fetch('/api/analyzeContentGaps', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    daysToAnalyze: 90,
                    niche: user.niche || '',
                    platforms: ['Instagram', 'TikTok', 'X', 'LinkedIn', 'Facebook', 'Threads', 'YouTube'],
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to analyze content gaps');
            }

            const data = await response.json();
            // Save to history regardless of success flag
            await saveToHistory('gap_analysis', `Content Gap Analysis - ${new Date().toLocaleDateString()}`, data);
            if (data.success) {
                setGapAnalysis(data);
                setShowGapModal(true);
                showToast('Content gap analysis complete!', 'success');
            } else {
                showToast('Analysis completed but may have issues. Check history for details.', 'warning');
            }
        } catch (error: any) {
            console.error('Error analyzing content gaps:', error);
            showToast(error.message || 'Failed to analyze content gaps', 'error');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleOptimize = async () => {
        // If media is uploaded but no caption, generate caption from media first
        let captionToUse = captionInput.trim();
        
        if (mediaFile && !captionToUse) {
            showToast('Generating caption from media first...', 'info');
            try {
                // Generate caption from media
                const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
                if (!user?.id) {
                    throw new Error('User not authenticated');
                }

                // Upload media to Firebase Storage
                const timestamp = Date.now();
                const fileExtension = mediaFile.name.split('.').pop() || (mediaFile.type.startsWith('video/') ? 'mp4' : 'jpg');
                const storagePath = `users/${user.id}/content-intelligence-uploads/${timestamp}.${fileExtension}`;
                const storageRef = ref(storage, storagePath);
                await uploadBytes(storageRef, mediaFile, { contentType: mediaFile.type });
                const mediaUrl = await getDownloadURL(storageRef);
                
                // Generate caption
                const response = await fetch('/api/generateCaptions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({
                        mediaUrl: mediaUrl,
                        tone: mediaCaptionTone === 'Explicit' ? 'Sexy / Explicit' : mediaCaptionTone,
                        goal: mediaCaptionGoal,
                        platforms: isOnlyFansStudio ? ['OnlyFans'] : [platformInput],
                        promptText: `${mediaCaptionPrompt || ''} [Variety seed: ${Date.now()}-${Math.random().toString(36).substr(2, 9)}]`.trim(),
                    }),
                });

                if (!response.ok) throw new Error('Failed to generate caption');
                const data = await response.json();
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
                
                if (captions.length > 0) {
                    captionToUse = captions[0].caption;
                    setCaptionInput(captionToUse);
                    setGeneratedMediaCaptions(captions);
                    showToast('Caption generated from media. Optimizing...', 'success');
                } else {
                    showToast('Failed to generate caption from media. Please enter a caption manually.', 'error');
                    return;
                }
            } catch (error: any) {
                showToast('Failed to generate caption from media. Please enter a caption manually.', 'error');
                return;
            }
        }
        
        if (!captionToUse) {
            showToast('Please enter a caption to optimize', 'error');
            return;
        }

        setIsOptimizing(true);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            const response = await fetch('/api/optimizeCaption', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    originalCaption: captionToUse,
                    platform: isOnlyFansStudio ? 'OnlyFans' : platformInput,
                    niche: user?.niche || '',
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to optimize caption');
            }

            const data = await response.json();
            // Save to history regardless of success flag
            await saveToHistory('optimize', `Caption Optimization - ${isOnlyFansStudio ? 'OnlyFans' : platformInput}`, { ...data, originalCaption: captionToUse, platform: isOnlyFansStudio ? 'OnlyFans' : platformInput });
            if (data.success) {
                setOptimizeResult(data);
                setShowOptimizeModal(true);
                showToast('Caption optimized!', 'success');
            } else {
                showToast('Optimization completed but may have issues. Check history for details.', 'warning');
            }
        } catch (error: any) {
            console.error('Error optimizing caption:', error);
            showToast(error.message || 'Failed to optimize caption', 'error');
        } finally {
            setIsOptimizing(false);
        }
    };

    const handlePredict = async () => {
        // If media is uploaded but no caption, generate caption from media first
        let captionToUse = captionInput.trim();
        
        if (mediaFile && !captionToUse) {
            showToast('Generating caption from media first...', 'info');
            try {
                // Generate caption from media (same logic as handleOptimize)
                const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
                if (!user?.id) {
                    throw new Error('User not authenticated');
                }

                const timestamp = Date.now();
                const fileExtension = mediaFile.name.split('.').pop() || (mediaFile.type.startsWith('video/') ? 'mp4' : 'jpg');
                const storagePath = `users/${user.id}/content-intelligence-uploads/${timestamp}.${fileExtension}`;
                const storageRef = ref(storage, storagePath);
                await uploadBytes(storageRef, mediaFile, { contentType: mediaFile.type });
                const mediaUrl = await getDownloadURL(storageRef);
                
                const response = await fetch('/api/generateCaptions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({
                        mediaUrl: mediaUrl,
                        tone: mediaCaptionTone === 'Explicit' ? 'Sexy / Explicit' : mediaCaptionTone,
                        goal: mediaCaptionGoal,
                        platforms: isOnlyFansStudio ? ['OnlyFans'] : [platformInput],
                        promptText: `${mediaCaptionPrompt || ''} [Variety seed: ${Date.now()}-${Math.random().toString(36).substr(2, 9)}]`.trim(),
                    }),
                });

                if (!response.ok) throw new Error('Failed to generate caption');
                const data = await response.json();
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
                
                if (captions.length > 0) {
                    captionToUse = captions[0].caption;
                    setCaptionInput(captionToUse);
                    setGeneratedMediaCaptions(captions);
                    showToast('Caption generated from media. Predicting...', 'success');
                } else {
                    showToast('Failed to generate caption from media. Please enter a caption manually.', 'error');
                    return;
                }
            } catch (error: any) {
                showToast('Failed to generate caption from media. Please enter a caption manually.', 'error');
                return;
            }
        }
        
        if (!captionToUse) {
            showToast('Please enter a caption to predict', 'error');
            return;
        }

        setIsPredicting(true);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            const response = await fetch('/api/predictContentPerformance', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    caption: captionToUse,
                    platform: isOnlyFansStudio ? 'OnlyFans' : platformInput,
                    niche: user?.niche || '',
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to predict performance');
            }

            const data = await response.json();
            // Save to history regardless of success flag
            await saveToHistory('predict', `Performance Prediction - ${isOnlyFansStudio ? 'OnlyFans' : platformInput}`, { ...data, originalCaption: captionToUse, platform: isOnlyFansStudio ? 'OnlyFans' : platformInput });
            if (data.success) {
                setPredictResult(data);
                setShowPredictModal(true);
                showToast('Performance predicted!', 'success');
            } else {
                showToast('Prediction completed but may have issues. Check history for details.', 'warning');
            }
        } catch (error: any) {
            console.error('Error predicting performance:', error);
            showToast(error.message || 'Failed to predict performance', 'error');
        } finally {
            setIsPredicting(false);
        }
    };

    const handleRepurpose = async () => {
        // If media is uploaded but no caption, generate caption from media first
        let captionToUse = captionInput.trim();
        
        if (mediaFile && !captionToUse) {
            showToast('Generating caption from media first...', 'info');
            try {
                // Generate caption from media (same logic as handleOptimize)
                const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
                if (!user?.id) {
                    throw new Error('User not authenticated');
                }

                const timestamp = Date.now();
                const fileExtension = mediaFile.name.split('.').pop() || (mediaFile.type.startsWith('video/') ? 'mp4' : 'jpg');
                const storagePath = `users/${user.id}/content-intelligence-uploads/${timestamp}.${fileExtension}`;
                const storageRef = ref(storage, storagePath);
                await uploadBytes(storageRef, mediaFile, { contentType: mediaFile.type });
                const mediaUrl = await getDownloadURL(storageRef);
                
                const response = await fetch('/api/generateCaptions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({
                        mediaUrl: mediaUrl,
                        tone: mediaCaptionTone === 'Explicit' ? 'Sexy / Explicit' : mediaCaptionTone,
                        goal: mediaCaptionGoal,
                        platforms: isOnlyFansStudio ? ['OnlyFans'] : [platformInput],
                        promptText: `${mediaCaptionPrompt || ''} [Variety seed: ${Date.now()}-${Math.random().toString(36).substr(2, 9)}]`.trim(),
                    }),
                });

                if (!response.ok) throw new Error('Failed to generate caption');
                const data = await response.json();
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
                
                if (captions.length > 0) {
                    captionToUse = captions[0].caption;
                    setCaptionInput(captionToUse);
                    setGeneratedMediaCaptions(captions);
                    showToast('Caption generated from media. Repurposing...', 'success');
                } else {
                    showToast('Failed to generate caption from media. Please enter a caption manually.', 'error');
                    return;
                }
            } catch (error: any) {
                showToast('Failed to generate caption from media. Please enter a caption manually.', 'error');
                return;
            }
        }
        
        if (!captionToUse) {
            showToast('Please enter content to repurpose', 'error');
            return;
        }

        if (!platformInput && !isOnlyFansStudio) {
            showToast('Please select a platform first', 'error');
            return;
        }

        setIsRepurposing(true);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            // For repurpose, target all other platforms (if in OnlyFans Studio, repurpose from OnlyFans to other platforms)
            const originalPlatform = isOnlyFansStudio ? 'OnlyFans' : platformInput;
            const allTargetPlatforms = safePlatforms.filter(p => p !== originalPlatform);
            
            const response = await fetch('/api/repurposeContent', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    originalContent: captionToUse,
                    originalPlatform: isOnlyFansStudio ? 'OnlyFans' : platformInput,
                    targetPlatforms: allTargetPlatforms,
                    niche: user?.niche || '',
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to repurpose content');
            }

            const data = await response.json();
            // Save to history regardless of success flag
            await saveToHistory('repurpose', `Content Repurposing - ${allTargetPlatforms.join(', ')}`, { ...data, originalContent: captionToUse, originalPlatform: isOnlyFansStudio ? 'OnlyFans' : platformInput, targetPlatforms: allTargetPlatforms });
            if (data.success) {
                setRepurposeResult(data);
                setShowRepurposeModal(true);
                showToast('Content repurposed!', 'success');
            } else {
                showToast('Repurposing completed but may have issues. Check history for details.', 'warning');
            }
        } catch (error: any) {
            console.error('Error repurposing content:', error);
            showToast(error.message || 'Failed to repurpose content', 'error');
        } finally {
            setIsRepurposing(false);
        }
    };

    const deleteHistoryItem = async (id: string) => {
        if (!user?.id) return;
        try {
            await deleteDoc(doc(db, 'users', user.id, 'content_intelligence_history', id));
            setHistory(history.filter(item => item.id !== id));
            showToast('Item deleted', 'success');
        } catch (error: any) {
            console.error('Error deleting history item:', error);
            showToast('Failed to delete item', 'error');
        }
    };

    // Media Captions Generation
    const handleGenerateMediaCaptions = async () => {
        if (!mediaFile) {
            showToast('Please upload an image or video', 'error');
            return;
        }

        const fileSizeMB = mediaFile.size / 1024 / 1024;
        const isVideo = mediaFile.type.startsWith('video/');
        const maxSizeMB = isVideo ? 100 : 10;

        if (fileSizeMB > maxSizeMB) {
            showToast(
                `File is too large (${fileSizeMB.toFixed(1)}MB). Maximum size: ${maxSizeMB}MB for ${isVideo ? 'videos' : 'images'}.`,
                'error'
            );
            return;
        }

        setIsGeneratingMediaCaptions(true);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            if (!user?.id) {
                throw new Error('User not authenticated');
            }

            // Upload to Firebase Storage
            let mediaUrl: string;
            try {
                const timestamp = Date.now();
                const fileExtension = mediaFile.name.split('.').pop() || (mediaFile.type.startsWith('video/') ? 'mp4' : 'jpg');
                const storagePath = `users/${user.id}/content-intelligence-uploads/${timestamp}.${fileExtension}`;
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
                    mediaUrl: mediaUrl,
                    tone: mediaCaptionTone === 'Explicit' ? 'Sexy / Explicit' : mediaCaptionTone,
                    goal: mediaCaptionGoal,
                    platforms: [platformInput],
                    promptText: `${mediaCaptionPrompt || ''} [Variety seed: ${Date.now()}-${Math.random().toString(36).substr(2, 9)}] - Generate diverse, unique captions each time. Avoid repetition.`.trim(),
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate captions');
            }

            const data = await response.json();
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
            await saveToHistory('media_captions', `Media Captions - ${platformInput}`, { captions, platform: platformInput });
            showToast('Captions generated successfully!', 'success');
        } catch (error: any) {
            console.error('Error generating media captions:', error);
            showToast(error.message || 'Failed to generate captions. Please try again.', 'error');
        } finally {
            setIsGeneratingMediaCaptions(false);
        }
    };

    const handleMediaFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setMediaFile(file);
        const previewUrl = URL.createObjectURL(file);
        setMediaPreview(previewUrl);
    };


    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!', 'success');
    };

    const platforms: Platform[] = ['Instagram', 'TikTok', 'X', 'LinkedIn', 'Facebook', 'Threads', 'YouTube'];
    const platformIcons: Record<Platform, React.ReactNode> = {
        Instagram: <InstagramIcon />,
        TikTok: <TikTokIcon />,
        X: <XIcon />,
        Threads: <ThreadsIcon />,
        YouTube: <YouTubeIcon />,
        LinkedIn: <LinkedInIcon />,
        Facebook: <FacebookIcon />,
        Pinterest: <PinterestIcon />,
    };

    // Safety check - ensure platforms is always an array
    const safePlatforms = Array.isArray(platforms) ? platforms : [];

    return (
        <div className="space-y-4">
            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
                <button
                    onClick={() => setActiveTab('tools')}
                    className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                        activeTab === 'tools'
                            ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                            : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                >
                    Tools
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                        activeTab === 'history'
                            ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                            : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                >
                    History
                </button>
            </div>

            {/* Tools Tab */}
            {activeTab === 'tools' && (
                <div className="space-y-6">
                    {/* Input Section */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            Content Input
                        </h3>
                        <div className="space-y-4">
                            {/* Image/Video Upload */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Upload Image/Video (Optional):
                                </label>
                                {!mediaPreview ? (
                                    <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center">
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
                                            <UploadIcon className="w-8 h-8 text-gray-400" />
                                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                                Click to upload image or video
                                            </span>
                                            <span className="text-xs text-gray-500 dark:text-gray-500">
                                                Max 20MB
                                            </span>
                                        </label>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        {mediaFile?.type.startsWith('video/') ? (
                                            <video
                                                src={mediaPreview}
                                                controls
                                                className="w-full max-h-64 rounded-lg"
                                            />
                                        ) : (
                                            <img
                                                src={mediaPreview}
                                                alt="Preview"
                                                className="w-full max-h-64 object-contain rounded-lg"
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
                                    Caption/Content/Context:
                                </label>
                                <textarea
                                    value={captionInput}
                                    onChange={(e) => setCaptionInput(e.target.value)}
                                    placeholder={mediaFile ? "Enter your caption or content to analyze, optimize, predict, or repurpose..." : "Enter your caption or content to analyze, optimize, predict, or repurpose..."}
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[120px]"
                                />
                            </div>

                            {/* Media Caption Options (only show if media is uploaded) */}
                            {mediaFile && (
                                <>
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
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
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
                                                <option value="followers">Increase Followers</option>
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
                                                        className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
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
                                </>
                            )}

                            {isOnlyFansStudio ? (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Target Platform (for Repurpose Content only):
                                    </label>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                        Content is optimized for OnlyFans by default. Select a platform below only if you want to repurpose content to other platforms.
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {platforms.map(platform => {
                                            const isSelected = platformInput === platform;
                                            return (
                                                <button
                                                    key={platform}
                                                    onClick={() => setPlatformInput(platform)}
                                                    className={`flex items-center justify-center gap-1 px-2 py-1 rounded text-xs border transition-colors ${
                                                        isSelected
                                                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium'
                                                            : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                                                    }`}
                                                >
                                                    <span className="w-3 h-3 flex items-center justify-center flex-shrink-0">{platformIcons[platform]}</span>
                                                    <span className="hidden sm:inline">{platform}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Plan for Platform (Select One):
                                    </label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {platforms.map(platform => {
                                            const isSelected = platformInput === platform;
                                            return (
                                                <button
                                                    key={platform}
                                                    onClick={() => setPlatformInput(platform)}
                                                    className={`flex items-center justify-center gap-1 px-2 py-1 rounded text-xs border transition-colors ${
                                                        isSelected
                                                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium'
                                                            : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                                                    }`}
                                                >
                                                    <span className="w-3 h-3 flex items-center justify-center flex-shrink-0">{platformIcons[platform]}</span>
                                                    <span className="hidden sm:inline">{platform}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {!platformInput && (
                                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Please select a platform</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Generate Media Captions Button (only show if media is uploaded) */}
                    {mediaFile && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                            <button
                                onClick={handleGenerateMediaCaptions}
                                disabled={isGeneratingMediaCaptions}
                                className="w-full px-4 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition-all shadow-md hover:shadow-lg"
                            >
                                {isGeneratingMediaCaptions ? (
                                    <>
                                        <RefreshIcon className="w-5 h-5 animate-spin" />
                                        Analyzing media and generating captions...
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="w-5 h-5" />
                                        Generate Captions from Image/Video
                                    </>
                                )}
                            </button>

                            {/* Generated Media Captions */}
                            {Array.isArray(generatedMediaCaptions) && generatedMediaCaptions.length > 0 && (
                                <div className="mt-6 space-y-3">
                                    <h4 className="text-md font-semibold text-gray-900 dark:text-white">Generated Captions</h4>
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
                                                Copy
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Gap Analysis */}
                        <button
                            onClick={handleGapAnalysis}
                            disabled={isAnalyzing}
                            className="px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition-all shadow-md hover:shadow-lg"
                        >
                            {isAnalyzing ? (
                                <>
                                    <RefreshIcon className="w-5 h-5 animate-spin" />
                                    Analyzing...
                                </>
                            ) : (
                                <>
                                    <SparklesIcon className="w-5 h-5" />
                                    Analyze Content Gaps
                                </>
                            )}
                        </button>

                        {/* Optimize */}
                        <button
                            onClick={handleOptimize}
                            disabled={isOptimizing || !captionInput.trim()}
                            className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition-all shadow-md hover:shadow-lg"
                        >
                            {isOptimizing ? (
                                <>
                                    <RefreshIcon className="w-5 h-5 animate-spin" />
                                    Optimizing...
                                </>
                            ) : (
                                <>
                                    <SparklesIcon className="w-5 h-5" />
                                    Optimize Caption
                                </>
                            )}
                        </button>

                        {/* Predict */}
                        <button
                            onClick={handlePredict}
                            disabled={isPredicting || !captionInput.trim()}
                            className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition-all shadow-md hover:shadow-lg"
                        >
                            {isPredicting ? (
                                <>
                                    <RefreshIcon className="w-5 h-5 animate-spin" />
                                    Predicting...
                                </>
                            ) : (
                                <>
                                    <SparklesIcon className="w-5 h-5" />
                                    Predict Performance
                                </>
                            )}
                        </button>

                        {/* Repurpose */}
                        <button
                            onClick={handleRepurpose}
                            disabled={isRepurposing || !captionInput.trim() || !platformInput}
                            className="px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition-all shadow-md hover:shadow-lg"
                        >
                            {isRepurposing ? (
                                <>
                                    <RefreshIcon className="w-5 h-5 animate-spin" />
                                    Repurposing...
                                </>
                            ) : (
                                <>
                                    <SparklesIcon className="w-5 h-5" />
                                    Repurpose Content
                                </>
                            )}
                        </button>
                    </div>

                </div>
            )}

            {/* History Tab */}
            {activeTab === 'history' && (
                <div className="space-y-4">
                    {loadingHistory ? (
                        <div className="text-center py-8">
                            <RefreshIcon className="w-8 h-8 animate-spin mx-auto text-primary-600 dark:text-primary-400" />
                        </div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                            No history yet. Use the tools to generate content intelligence.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {history.map((item) => (
                                <div
                                    key={item.id}
                                    className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 border border-gray-200 dark:border-gray-700"
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex-1">
                                            <h4 className="font-semibold text-gray-900 dark:text-white">{item.title}</h4>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                {item.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())} • {item.createdAt.toDate().toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => {
                                                    if (item.type === 'gap_analysis') {
                                                        setGapAnalysis(item.data);
                                                        setShowGapModal(true);
                                                    } else if (item.type === 'optimize') {
                                                        setOptimizeResult(item.data);
                                                        setShowOptimizeModal(true);
                                                    } else if (item.type === 'predict') {
                                                        setPredictResult(item.data);
                                                        setShowPredictModal(true);
                                                    } else if (item.type === 'repurpose') {
                                                        setRepurposeResult(item.data);
                                                        setShowRepurposeModal(true);
                                                    } else if (item.type === 'media_captions') {
                                                        setGeneratedMediaCaptions(item.data.captions || []);
                                                        showToast('Media captions loaded', 'success');
                                                    }
                                                }}
                                                className="p-2 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded"
                                                title="View"
                                            >
                                                <ClockIcon className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => deleteHistoryItem(item.id)}
                                                className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
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

            {/* Gap Analysis Modal */}
            {showGapModal && gapAnalysis && (
                <GapAnalysisModal
                    analysis={gapAnalysis}
                    onClose={() => setShowGapModal(false)}
                    onCopy={(text) => {
                        navigator.clipboard.writeText(text);
                        showToast('Copied to clipboard!', 'success');
                    }}
                />
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
            {showRepurposeModal && repurposeResult && (
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

// Gap Analysis Modal Component
const GapAnalysisModal: React.FC<{ analysis: any; onClose: () => void; onCopy: (text: string) => void }> = ({ analysis, onClose, onCopy }) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Content Gap Analysis</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {analysis.summary && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                            <p className="text-blue-900 dark:text-blue-200">{analysis.summary}</p>
                        </div>
                    )}

                    {analysis.gaps && analysis.gaps.length > 0 && (
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Identified Gaps</h3>
                            <div className="space-y-3">
                                {analysis.gaps.map((gap: any, idx: number) => (
                                    <div
                                        key={idx}
                                        className={`p-4 rounded-lg border ${
                                            gap.severity === 'high'
                                                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                                                : gap.severity === 'medium'
                                                ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                                                : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between mb-2">
                                            <span className={`text-xs font-semibold px-2 py-1 rounded ${
                                                gap.severity === 'high'
                                                    ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                                                    : gap.severity === 'medium'
                                                    ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300'
                                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                            }`}>
                                                {gap.severity.toUpperCase()}
                                            </span>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">{gap.type}</span>
                                        </div>
                                        <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">{gap.description}</p>
                                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">{gap.impact}</p>
                                        <p className="text-xs text-gray-700 dark:text-gray-300">{gap.recommendation}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {analysis.suggestions && analysis.suggestions.length > 0 && (
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Content Suggestions</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {analysis.suggestions.map((suggestion: any, idx: number) => (
                                    <div
                                        key={idx}
                                        className="p-4 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
                                    >
                                        <div className="flex items-start justify-between mb-2">
                                            <span className={`text-xs font-semibold px-2 py-1 rounded ${
                                                suggestion.priority === 'high'
                                                    ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                                                    : suggestion.priority === 'medium'
                                                    ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300'
                                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                            }`}>
                                                {suggestion.priority.toUpperCase()}
                                            </span>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">{suggestion.type}</span>
                                        </div>
                                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{suggestion.title}</h4>
                                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">{suggestion.captionOutline}</p>
                                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2">
                                            <span>{suggestion.platform}</span>
                                            <span>•</span>
                                            <span>{suggestion.format}</span>
                                        </div>
                                        <p className="text-xs text-gray-700 dark:text-gray-300 italic">{suggestion.whyThisFillsGap}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
                    <button
                        onClick={() => onCopy(JSON.stringify(analysis, null, 2))}
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex items-center gap-2"
                    >
                        <CopyIcon className="w-4 h-4" />
                        Copy
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

// Optimize Modal Component
const OptimizeModal: React.FC<{ result: any; onClose: () => void; onCopy: (text: string) => void }> = ({ result, onClose, onCopy }) => {
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
                    {result.scores && (
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Quality Scores</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {Object.entries(result.scores).map(([key, value]: [string, any]) => (
                                    <div key={key} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                                        <p className="text-2xl font-bold text-primary-600 dark:text-primary-400">{value}/10</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Improvements */}
                    {result.improvements && result.improvements.length > 0 && (
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
                    {result.hashtagSuggestions && result.hashtagSuggestions.length > 0 && (
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
                    {result.factors && (
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Factor Analysis</h3>
                            <div className="space-y-3">
                                {Object.entries(result.factors).map(([key, value]: [string, any]) => (
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
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Improvements */}
                    {result.improvements && result.improvements.length > 0 && (
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
                    )}

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
    const repurposedContent = result.repurposedContent || [];

    const copyPlatformContent = (item: any) => {
        const text = `${item.platform} (${item.format})\n\n${item.caption}\n\nHashtags: ${(item.hashtags || []).join(' ')}\n\nOptimizations:\n${(item.optimizations || []).map((opt: string) => `• ${opt}`).join('\n')}`;
        onCopy(text);
    };

    const copyAllContent = () => {
        const text = repurposedContent.map((item: any) => 
            `--- ${item.platform} (${item.format}) ---\n${item.caption}\n\nHashtags: ${(item.hashtags || []).join(' ')}\n\nOptimizations:\n${(item.optimizations || []).map((opt: string) => `• ${opt}`).join('\n')}`
        ).join('\n\n');
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

                    {repurposedContent.map((item: any, idx: number) => (
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

                            {item.hashtags && item.hashtags.length > 0 && (
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

                            {item.optimizations && item.optimizations.length > 0 && (
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
