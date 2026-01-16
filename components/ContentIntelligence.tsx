import React, { useState, useEffect } from 'react';
import { useAppContext } from './AppContext';
import { hasCalendarAccess } from '../src/utils/planAccess';
import { SparklesIcon, RefreshIcon, XMarkIcon, ClockIcon, CopyIcon, TrashIcon, UploadIcon, DownloadIcon, ImageIcon } from './icons/UIIcons';
import { auth, storage, db } from '../firebaseConfig';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, query, getDocs, deleteDoc, doc, orderBy, Timestamp, setDoc, getDocs as getDocsQuery } from 'firebase/firestore';
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
    const { user, showToast, activePage, setPosts, setActivePage } = useAppContext();
    const [activeTab, setActiveTab] = useState<'tools' | 'history'>('tools');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [isPredicting, setIsPredicting] = useState(false);
    const [isRepurposing, setIsRepurposing] = useState(false);
    const [isGeneratingMediaCaptions, setIsGeneratingMediaCaptions] = useState(false);
    
    // Detect if we're in OnlyFans Studio context
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    const isOnlyFansStudio = activePage === 'onlyfansStudio' || pathname.includes('premiumcontentstudio') || pathname.includes('onlyfansStudio');
    
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
    const [mediaUrl, setMediaUrl] = useState<string | null>(null); // Store uploaded media URL
    const [mediaCaptionTone, setMediaCaptionTone] = useState<'Playful' | 'Flirty' | 'Confident' | 'Teasing' | 'Intimate' | 'Explicit' | 'Very Explicit'>('Teasing');
    const [mediaCaptionGoal, setMediaCaptionGoal] = useState('engagement');
    const [mediaCaptionPrompt, setMediaCaptionPrompt] = useState('');
    const [showRepurposePlatforms, setShowRepurposePlatforms] = useState(false);
    const [showMediaVaultModal, setShowMediaVaultModal] = useState(false);
    const [mediaVaultItems, setMediaVaultItems] = useState<any[]>([]);
    
    // History
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    useEffect(() => {
        if (user?.id && activeTab === 'history') {
            loadHistory();
        }
    }, [user?.id, activeTab]);

    // Load media vault when modal opens
    useEffect(() => {
        if (showMediaVaultModal && isOnlyFansStudio) {
            loadMediaVault();
        }
    }, [showMediaVaultModal, isOnlyFansStudio]);

    const loadMediaVault = async () => {
        if (!user?.id) return;
        try {
            const vaultRef = collection(db, 'users', user.id, 'onlyfans_media_library');
            const q = query(vaultRef, orderBy('uploadedAt', 'desc'));
            const snapshot = await getDocs(q);
            const items: any[] = [];
            snapshot.forEach((doc) => {
                items.push({ id: doc.id, ...doc.data() });
            });
            setMediaVaultItems(items);
        } catch (error) {
            console.error('Error loading media vault:', error);
        }
    };

    const handleSelectFromVault = async (item: any) => {
        setMediaUrl(item.url);
        setMediaPreview(item.url);
        // Create a fake File object for compatibility with existing code
        // The actual upload will use the URL directly
        const fakeFile = new File([], item.name || 'vault-media', { type: item.mimeType || (item.type === 'video' ? 'video/mp4' : 'image/jpeg') });
        Object.defineProperty(fakeFile, 'type', { value: item.mimeType || (item.type === 'video' ? 'video/mp4' : 'image/jpeg') });
        setMediaFile(fakeFile);
        setShowMediaVaultModal(false);
    };

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
            showToast("Please sign in to check what's missing", 'error');
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
                throw new Error("Failed to check what's missing");
            }

            const data = await response.json();
            // Save to history regardless of success flag
            await saveToHistory('gap_analysis', `What's Missing - ${new Date().toLocaleDateString()}`, data);
            if (data.success) {
                setGapAnalysis(data);
                setShowGapModal(true);
                showToast("What's missing check complete!", 'success');
            } else {
                showToast("Check completed but may have issues. See history for details.", 'warning');
            }
        } catch (error: any) {
            console.error('Error analyzing content gaps:', error);
            showToast(error.message || "Failed to check what's missing", 'error');
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
                const captionsUrl = new URL('/api/generateCaptions', window.location.origin);
                const response = await fetch(captionsUrl.toString(), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({
                        mediaUrl: mediaUrl,
                        tone: mediaCaptionTone === 'Explicit' ? 'Sexy / Explicit' : mediaCaptionTone === 'Very Explicit' ? 'Sexy / Very Explicit' : mediaCaptionTone,
                        goal: mediaCaptionGoal,
                        platforms: isOnlyFansStudio ? ['OnlyFans' as any] : [platformInput],
                        promptText: `${isOnlyFansStudio ? 'Generate OnlyFans-optimized captions with emojis. OnlyFans creators use lots of emojis to engage fans. ' : ''}${mediaCaptionPrompt || ''} [Variety seed: ${Date.now()}-${Math.random().toString(36).substr(2, 9)}]`.trim(),
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
            await saveToHistory('optimize', `Make It Stronger - ${isOnlyFansStudio ? 'OnlyFans' : platformInput}`, { ...data, originalCaption: captionToUse, platform: isOnlyFansStudio ? 'OnlyFans' : platformInput });
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
        // Use generated caption if available, otherwise use input
        let captionToUse = generatedMediaCaptions.length > 0 
            ? generatedMediaCaptions[0].caption 
            : captionInput.trim();
        
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
                
                const captionsUrl = new URL('/api/generateCaptions', window.location.origin);
                const response = await fetch(captionsUrl.toString(), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({
                        mediaUrl: mediaUrl,
                        tone: mediaCaptionTone === 'Explicit' ? 'Sexy / Explicit' : mediaCaptionTone === 'Very Explicit' ? 'Sexy / Very Explicit' : mediaCaptionTone,
                        goal: mediaCaptionGoal,
                        platforms: isOnlyFansStudio ? ['OnlyFans' as any] : [platformInput],
                        promptText: `${isOnlyFansStudio ? 'Generate OnlyFans-optimized captions with emojis. OnlyFans creators use lots of emojis to engage fans. ' : ''}${mediaCaptionPrompt || ''} [Variety seed: ${Date.now()}-${Math.random().toString(36).substr(2, 9)}]`.trim(),
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
                    showToast("Caption generated from media. Pulling ideas...", 'success');
                } else {
                    showToast('Failed to generate caption from media. Please enter a caption manually.', 'error');
                    return;
                }
            } catch (error: any) {
                showToast('Failed to generate caption from media. Please enter a caption manually.', 'error');
                return;
            }
        }

        if (!isOnlyFansStudio && !platformInput) {
            showToast('Please select a platform first', 'error');
            return;
        }
        
        setIsPredicting(true);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            const adultPlatforms = ['OnlyFans', 'Fansly', 'Fanvue'];
            const isAdultPlatform = platformInput && adultPlatforms.includes(platformInput);
            const stripAdultPlatforms = (value: string) =>
                value.replace(/onlyfans|fansly|fanvue/gi, '').replace(/\s+/g, ' ').trim();
            const safeNiche = isAdultPlatform
                ? (user?.niche || 'Adult Content Creator')
                : (user?.niche ? stripAdultPlatforms(user.niche) : '');
            const safeRecentContent = !isAdultPlatform && captionToUse
                ? stripAdultPlatforms(captionToUse)
                : captionToUse;

            const response = await fetch('/api/whatToPostNext', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    platform: isOnlyFansStudio ? 'OnlyFans' : platformInput,
                    niche: isOnlyFansStudio ? (user?.niche || 'Adult Content Creator') : safeNiche,
                    recentContent: isOnlyFansStudio ? (captionToUse || undefined) : (safeRecentContent || undefined),
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate what to post next');
            }

            const data = await response.json();
            // Save to history regardless of success flag
            await saveToHistory('predict', `What To Post Next - ${isOnlyFansStudio ? 'OnlyFans' : platformInput}`, { ...data, originalCaption: captionToUse, platform: isOnlyFansStudio ? 'OnlyFans' : platformInput });
            if (data.success) {
                setPredictResult(data);
                setShowPredictModal(true);
                showToast('Ideas ready!', 'success');
            } else {
                showToast("Check completed but may have issues. See history for details.", 'warning');
            }
        } catch (error: any) {
            console.error('Error generating what to post next:', error);
            showToast(error.message || 'Failed to generate what to post next', 'error');
        } finally {
            setIsPredicting(false);
        }
    };

    const handleRepurpose = async () => {
        // Use generated caption if available, otherwise use input
        let captionToUse = generatedMediaCaptions.length > 0 
            ? generatedMediaCaptions[0].caption 
            : captionInput.trim();
        
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
                
                const captionsUrl = new URL('/api/generateCaptions', window.location.origin);
                const response = await fetch(captionsUrl.toString(), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({
                        mediaUrl: mediaUrl,
                        tone: mediaCaptionTone === 'Explicit' ? 'Sexy / Explicit' : mediaCaptionTone === 'Very Explicit' ? 'Sexy / Very Explicit' : mediaCaptionTone,
                        goal: mediaCaptionGoal,
                        platforms: isOnlyFansStudio ? ['OnlyFans' as any] : [platformInput],
                        promptText: `${isOnlyFansStudio ? 'Generate OnlyFans-optimized captions with emojis. OnlyFans creators use lots of emojis to engage fans. ' : ''}${mediaCaptionPrompt || ''} [Variety seed: ${Date.now()}-${Math.random().toString(36).substr(2, 9)}]`.trim(),
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

        if (isOnlyFansStudio && !showRepurposePlatforms) {
            showToast('Please click Repurpose Content first to select a platform', 'error');
            return;
        }
        
        if (!platformInput && !isOnlyFansStudio) {
            showToast('Please select a platform first', 'error');
            return;
        }
        
        if (isOnlyFansStudio && showRepurposePlatforms && !platformInput) {
            showToast('Please select a platform to repurpose to', 'error');
            return;
        }

        setIsRepurposing(true);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            // For repurpose, if in OnlyFans Studio and platform is selected, repurpose to that single platform
            // Otherwise, repurpose to all other platforms
            const originalPlatform = isOnlyFansStudio ? 'OnlyFans' : platformInput;
            const allTargetPlatforms = isOnlyFansStudio && showRepurposePlatforms && platformInput
                ? [platformInput] // Single platform for OnlyFans repurpose
                : safePlatforms.filter(p => p !== originalPlatform);
            
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
        if (!mediaFile && !mediaUrl) {
            showToast('Please upload an image or video', 'error');
            return;
        }

        // Check file size only if it's an actual file (not from vault)
        if (mediaFile && mediaFile.size > 0) {
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
        }

        setIsGeneratingMediaCaptions(true);
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
            
            if (!user?.id) {
                throw new Error('User not authenticated');
            }

            // Use existing URL if available (from vault), otherwise upload
            let uploadedMediaUrl: string;
            if (mediaUrl && !mediaUrl.startsWith('blob:')) {
                // Already have a URL from vault
                uploadedMediaUrl = mediaUrl;
            } else {
                // Need to upload the file
                if (!mediaFile || mediaFile.size === 0) {
                    throw new Error('Please upload an image or video');
                }
                try {
                    const timestamp = Date.now();
                    const fileExtension = mediaFile.name.split('.').pop() || (mediaFile.type.startsWith('video/') ? 'mp4' : 'jpg');
                    const storagePath = `users/${user.id}/content-intelligence-uploads/${timestamp}.${fileExtension}`;
                    const storageRef = ref(storage, storagePath);

                    await uploadBytes(storageRef, mediaFile, {
                        contentType: mediaFile.type,
                    });

                    uploadedMediaUrl = await getDownloadURL(storageRef);
                    setMediaUrl(uploadedMediaUrl); // Store the URL for later use
                
                    // If in OnlyFans Studio, also save to media vault
                    if (isOnlyFansStudio) {
                        try {
                            const mediaItem = {
                                id: timestamp.toString(),
                                userId: user.id,
                                url: uploadedMediaUrl,
                                name: mediaFile.name,
                                type: mediaFile.type.startsWith('video/') ? 'video' : 'image',
                                mimeType: mediaFile.type,
                                size: mediaFile.size,
                                uploadedAt: new Date().toISOString(),
                                usedInPosts: [],
                                tags: [],
                                folderId: 'general', // Save to General folder
                            };
                            
                            await setDoc(doc(db, 'users', user.id, 'onlyfans_media_library', mediaItem.id), mediaItem);
                        } catch (vaultError: any) {
                            console.error('Failed to save to media vault:', vaultError);
                            // Don't throw - continue with caption generation even if vault save fails
                        }
                    }
                } catch (uploadError: any) {
                    console.error('Upload error:', uploadError);
                    throw new Error(`Failed to upload media: ${uploadError.message || 'Please try again'}`);
                }
            }
            
            const captionsUrl = new URL('/api/generateCaptions', window.location.origin);
            const response = await fetch(captionsUrl.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    mediaUrl: uploadedMediaUrl,
                    tone: mediaCaptionTone === 'Explicit' ? 'Sexy / Explicit' : mediaCaptionTone === 'Very Explicit' ? 'Sexy / Very Explicit' : mediaCaptionTone,
                    goal: mediaCaptionGoal,
                    platforms: isOnlyFansStudio ? ['OnlyFans' as any] : [platformInput],
                    promptText: `${isOnlyFansStudio ? 'Generate OnlyFans-optimized captions with emojis. OnlyFans creators use lots of emojis to engage fans. ' : ''}${mediaCaptionPrompt || ''} [Variety seed: ${Date.now()}-${Math.random().toString(36).substr(2, 9)}] - Generate diverse, unique captions each time. Avoid repetition.`.trim(),
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
            await saveToHistory('media_captions', `Media Captions - ${isOnlyFansStudio ? 'OnlyFans' : platformInput}`, { captions, platform: isOnlyFansStudio ? 'OnlyFans' : platformInput });
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
        setMediaUrl(null); // Reset stored URL when new file is selected
        setShowRepurposePlatforms(false); // Reset repurpose platforms visibility
    };


    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!', 'success');
    };

    // Handle save to Draft or Calendar
    const handleSaveCaption = async (caption: string, hashtags: string[], status: 'Draft' | 'Scheduled') => {
        if (!user || !mediaFile) {
            showToast('Please upload media first', 'error');
            return;
        }

        try {
            // Use stored media URL from generation, or upload if not available
            let finalMediaUrl: string | undefined = mediaUrl || undefined;
            
            if (!finalMediaUrl && mediaPreview && mediaPreview.startsWith('blob:')) {
                // Need to upload to get permanent URL
                const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
                if (!user?.id) {
                    throw new Error('User not authenticated');
                }

                const timestamp = Date.now();
                const fileExtension = mediaFile.name.split('.').pop() || (mediaFile.type.startsWith('video/') ? 'mp4' : 'jpg');
                const storagePath = `users/${user.id}/content-intelligence-uploads/${timestamp}.${fileExtension}`;
                const storageRef = ref(storage, storagePath);
                await uploadBytes(storageRef, mediaFile, { contentType: mediaFile.type });
                finalMediaUrl = await getDownloadURL(storageRef);
                setMediaUrl(finalMediaUrl);
            } else if (!finalMediaUrl) {
                finalMediaUrl = mediaPreview || undefined;
            }

            const postId = Date.now().toString();
            const draftDate = new Date();
            draftDate.setHours(12, 0, 0, 0);

            let scheduledDate: string | undefined;
            if (status === 'Scheduled') {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(14, 0, 0, 0);
                scheduledDate = tomorrow.toISOString();
            } else if (status === 'Draft') {
                scheduledDate = draftDate.toISOString();
            }

            const fullCaption = hashtags && hashtags.length > 0 
                ? `${caption} ${hashtags.join(' ')}`
                : caption;

            const newPost = {
                id: postId,
                content: fullCaption,
                mediaUrl: finalMediaUrl,
                mediaType: mediaFile.type.startsWith('video/') ? 'video' : 'image',
                platforms: isOnlyFansStudio ? ['OnlyFans' as any] : [platformInput],
                status: status,
                author: { name: user.name, avatar: user.avatar },
                comments: [],
                scheduledDate: scheduledDate,
                postGoal: mediaCaptionGoal,
                postTone: mediaCaptionTone === 'Explicit' ? 'Sexy / Explicit' : mediaCaptionTone === 'Very Explicit' ? 'Sexy / Very Explicit' : mediaCaptionTone,
                timestamp: new Date().toISOString(),
            };

            const safePost = JSON.parse(JSON.stringify(newPost));
            await setDoc(doc(db, 'users', user.id, 'posts', postId), safePost);

            // Refresh posts
            if (setPosts) {
                try {
                    const postsRef = collection(db, 'users', user.id, 'posts');
                    const snapshot = await getDocs(postsRef);
                    const updatedPosts: any[] = [];
                    snapshot.forEach((doc) => {
                        updatedPosts.push({
                            id: doc.id,
                            ...doc.data(),
                        });
                    });
                    setPosts(updatedPosts);
                } catch (error) {
                    console.error('Failed to refresh posts:', error);
                }
            }

            // Clear media after saving
            setMediaFile(null);
            setMediaPreview(null);
            setMediaUrl(null);
            setGeneratedMediaCaptions([]);
            setShowRepurposePlatforms(false);
            
            if (status === 'Scheduled') {
                showToast('Added to Calendar!', 'success');
                if (isOnlyFansStudio && setActivePage) {
                    setActivePage('onlyfansStudio');
                } else if (setActivePage) {
                    if (!hasCalendarAccess(user)) {
                        showToast('Upgrade to Pro or Elite to access the calendar', 'info');
                        setActivePage('pricing');
                    } else {
                        setActivePage('calendar');
                    }
                }
            } else {
                showToast('Saved to Drafts!', 'success');
                if (isOnlyFansStudio && setActivePage) {
                    setActivePage('onlyfansStudio');
                } else if (setActivePage) {
                    setActivePage('approvals');
                }
            }
        } catch (error: any) {
            console.error('Error saving caption:', error);
            showToast('Failed to save. Please try again.', 'error');
        }
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
                                    <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="flex gap-2 w-full">
                                                <input
                                                    type="file"
                                                    accept="image/*,video/*"
                                                    onChange={handleMediaFileChange}
                                                    className="hidden"
                                                    id="media-upload"
                                                />
                                                <label
                                                    htmlFor="media-upload"
                                                    className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer text-center text-sm font-medium flex items-center justify-center gap-2"
                                                >
                                                    <UploadIcon className="w-5 h-5" />
                                                    Upload File
                                                </label>
                                                {isOnlyFansStudio && (
                                                    <button
                                                        onClick={() => setShowMediaVaultModal(true)}
                                                        className="flex-1 px-4 py-3 border border-primary-300 dark:border-primary-700 rounded-md bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/50 text-sm font-medium flex items-center justify-center gap-2"
                                                    >
                                                        <ImageIcon className="w-5 h-5" />
                                                        From Media Vault
                                                    </button>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                Drag and drop or click to upload. Images or Videos (max 20MB)
                                            </p>
                                        </div>
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
                                                setMediaUrl(null);
                                                setShowRepurposePlatforms(false);
                                                setGeneratedMediaCaptions([]);
                                            }}
                                            className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600"
                                        >
                                            <XMarkIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Context (Optional) - Single text box */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Add context for your caption (optional):
                                </label>
                                <textarea
                                    value={mediaCaptionPrompt}
                                    onChange={(e) => setMediaCaptionPrompt(e.target.value)}
                                    placeholder="Add any specific details or focus you want for the caption..."
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-y min-h-[80px]"
                                />
                            </div>

                            {/* Goal and Tone (always show if media is uploaded) */}
                            {mediaFile && (
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
                                            {(['Playful', 'Flirty', 'Confident', 'Teasing', 'Intimate', 'Explicit', 'Very Explicit'] as const).map((tone) => (
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
                            )}

                            {/* Platform Selection - Only show when Repurpose is clicked (OnlyFans Studio) */}
                            {isOnlyFansStudio && showRepurposePlatforms && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Select Platform to Repurpose To:
                                    </label>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                        Select a single platform to repurpose your OnlyFans content to.
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
                            )}

                            {/* Platform Selection - Non-OnlyFans Studio (always show) */}
                            {!isOnlyFansStudio && (
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

                    {/* Generate Media Captions Button - Always Visible */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                        <button
                            onClick={handleGenerateMediaCaptions}
                            disabled={isGeneratingMediaCaptions || (!mediaFile && !mediaUrl)}
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
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    onClick={() => copyToClipboard(`${result.caption} ${(result.hashtags || []).join(' ')}`.trim())}
                                                    className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                                >
                                                    Copy
                                                </button>
                                                {isOnlyFansStudio && (
                                                    <>
                                                        <button
                                                            onClick={() => handleSaveCaption(result.caption, result.hashtags || [], 'Draft')}
                                                            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                                                        >
                                                            Draft
                                                        </button>
                                                        <button
                                                            onClick={() => handleSaveCaption(result.caption, result.hashtags || [], 'Scheduled')}
                                                            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 px-3 py-1 border border-blue-300 dark:border-blue-600 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                                        >
                                                            Calendar
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                    </div>

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
                                    Checking...
                                </>
                            ) : (
                                <>
                                    <SparklesIcon className="w-5 h-5" />
                                    What's Missing
                                </>
                            )}
                        </button>

                        {/* What To Post Next */}
                        <button
                            onClick={handlePredict}
                            disabled={isPredicting || (!captionInput.trim() && generatedMediaCaptions.length === 0)}
                            className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition-all shadow-md hover:shadow-lg"
                        >
                            {isPredicting ? (
                                <>
                                    <RefreshIcon className="w-5 h-5 animate-spin" />
                                    Checking...
                                </>
                            ) : (
                                <>
                                    <SparklesIcon className="w-5 h-5" />
                                    What To Post Next
                                </>
                            )}
                        </button>

                        {/* Repurpose */}
                        <button
                            onClick={() => {
                                if (isOnlyFansStudio && !showRepurposePlatforms) {
                                    // First click: show platform selection
                                    setShowRepurposePlatforms(true);
                                    showToast('Select a platform to repurpose to', 'info');
                                } else {
                                    // Second click: execute repurpose
                                    handleRepurpose();
                                }
                            }}
                            disabled={isRepurposing || !captionInput.trim() || (!isOnlyFansStudio && !platformInput)}
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
                                    {isOnlyFansStudio && !showRepurposePlatforms ? 'Repurpose Content' : 'Repurpose to Selected Platform'}
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

            {/* Media Vault Selection Modal */}
            {showMediaVaultModal && isOnlyFansStudio && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Select from Media Vault</h2>
                            <button
                                onClick={() => setShowMediaVaultModal(false)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <XMarkIcon className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6">
                            {mediaVaultItems.length === 0 ? (
                                <div className="text-center py-8">
                                    <p className="text-gray-600 dark:text-gray-400">No media in vault yet.</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">Upload media to your OnlyFans Media Vault first.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {mediaVaultItems.map((item) => (
                                        <button
                                            key={item.id}
                                            onClick={() => handleSelectFromVault(item)}
                                            className="relative aspect-square rounded-lg overflow-hidden border-2 border-gray-200 dark:border-gray-700 hover:border-primary-500 dark:hover:border-primary-400 transition-colors"
                                        >
                                            {item.type === 'video' ? (
                                                <video src={item.url} className="w-full h-full object-cover" />
                                            ) : (
                                                <img src={item.url} alt={item.name || 'Media'} className="w-full h-full object-cover" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                            <button
                                onClick={() => setShowMediaVaultModal(false)}
                                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
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
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">What's Missing</h2>
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
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">What's Missing</h3>
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
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Ideas to Fill the Gaps</h3>
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
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Make It Stronger</h2>
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
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Quality Check</h3>
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
    const ideas = result.ideas || result.postIdeas || result.nextPostIdeas;
    const weeklyMix = Array.isArray(result.weeklyMix) ? result.weeklyMix : [];
    const bestBet = result.bestBet || result.nextBestBet;
    const hasIdeas = Array.isArray(ideas) && ideas.length > 0;

    if (hasIdeas) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">What To Post Next</h2>
                            {result.platform && (
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    For {result.platform} creators
                                </p>
                            )}
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                            <XMarkIcon className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {result.summary && (
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                                <p className="text-blue-900 dark:text-blue-200 text-sm">{result.summary}</p>
                            </div>
                        )}
                        {bestBet && (
                            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                                <p className="text-green-900 dark:text-green-200 text-sm">
                                    <span className="font-semibold">Best bet:</span> {bestBet}
                                </p>
                            </div>
                        )}
                        {weeklyMix.length > 0 && (
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Suggested Weekly Mix</h3>
                                <div className="flex flex-wrap gap-2">
                                    {weeklyMix.map((item: any, idx: number) => (
                                        <span
                                            key={`${item.type}-${idx}`}
                                            className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-xs text-gray-700 dark:text-gray-200 rounded-full"
                                        >
                                            {item.type} x{item.count}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="space-y-4">
                            {ideas.map((idea: any, idx: number) => (
                                <div key={idx} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                        <div>
                                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                                                Idea {idx + 1}: {idea.title || 'Post idea'}
                                            </h4>
                                            {idea.format && (
                                                <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                                                    {idea.format}
                                                </span>
                                            )}
                                        </div>
                                        {Array.isArray(idea.tags) && idea.tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1">
                                                {idea.tags.map((tag: string, tagIdx: number) => (
                                                    <span
                                                        key={`${tag}-${tagIdx}`}
                                                        className="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200"
                                                    >
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    {idea.description && (
                                        <p className="text-xs text-gray-700 dark:text-gray-300 mb-2">{idea.description}</p>
                                    )}
                                    {idea.why && (
                                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                                            <span className="font-semibold text-gray-800 dark:text-gray-200">Why it works:</span> {idea.why}
                                        </p>
                                    )}
                                    {idea.hook && (
                                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                                            <span className="font-semibold text-gray-800 dark:text-gray-200">Hook:</span> {idea.hook}
                                        </p>
                                    )}
                                    {idea.caption && (
                                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md p-3 text-xs text-gray-700 dark:text-gray-300 mb-2">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-semibold">Caption</span>
                                                <button
                                                    onClick={() => onCopy(idea.caption)}
                                                    className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                                >
                                                    Copy
                                                </button>
                                            </div>
                                            <p className="whitespace-pre-wrap">{idea.caption}</p>
                                        </div>
                                    )}
                                    {idea.dmLine && (
                                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md p-3 text-xs text-gray-700 dark:text-gray-300 mb-2">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-semibold">DM Line</span>
                                                <button
                                                    onClick={() => onCopy(idea.dmLine)}
                                                    className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                                                >
                                                    Copy
                                                </button>
                                            </div>
                                            <p className="whitespace-pre-wrap">{idea.dmLine}</p>
                                        </div>
                                    )}
                                    {idea.ppvAngle && (
                                        <p className="text-xs text-gray-600 dark:text-gray-400">
                                            <span className="font-semibold text-gray-800 dark:text-gray-200">PPV angle:</span> {idea.ppvAngle}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
                        >
                            OK
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">What To Post Next</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40">
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                            This looks like a legacy performance result. The new “What To Post Next” gives you a
                            trend-based roadmap and fresh ideas instead of grading captions.
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            Click “What To Post Next” again to generate ideas.
                        </p>
                    </div>
                </div>

                <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
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
