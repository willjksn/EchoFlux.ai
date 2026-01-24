// components/AdGenerator.tsx
// AI-powered ad generation for text and video ads (Admin-only)

import React, { useState, useRef, useEffect } from 'react';
import { SparklesIcon, UploadIcon, ImageIcon, TrashIcon, CopyIcon, CheckCircleIcon } from './icons/UIIcons';
import { useAppContext } from './AppContext';
import { storage, db, auth } from '../firebaseConfig';
import { ref, uploadBytes, getDownloadURL, listAll, deleteObject } from 'firebase/storage';
import { collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, limit } from 'firebase/firestore';
import { generateAd, generateImage, generateVideo, getVideoStatus } from '../src/services/geminiService';

interface AdImage {
  id: string;
  name: string;
  url: string;
  uploadedAt: Date;
  description?: string;
}

interface StrategyBrief {
  objective: string;
  targetAudience: string;
  keyMessage: string;
  tone: string;
  cta: string;
}

interface AdVariant {
  copy: string;
  characterCount: number;
  hashtags?: string[];
  hook?: string;
  benefit?: string;
  cta: string;
}

interface GeneratedAds {
  strategyBrief: StrategyBrief | null;
  x: AdVariant[];
  instagram: AdVariant[];
  tiktok: AdVariant[];
}

interface SavedAdSet {
  id: string;
  createdAt: Date;
  objective: string;
  targetAudience: string;
  keyMessage: string;
  ads: GeneratedAds;
}

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = error => reject(error);
  });
};

const base64ToBytes = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

export const AdGenerator: React.FC = () => {
  const { user, showToast } = useAppContext();
  const [images, setImages] = useState<AdImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [savedAds, setSavedAds] = useState<SavedAdSet[]>([]);
  const [isLoadingSavedAds, setIsLoadingSavedAds] = useState(false);

  // Ad generation state
  const [objective, setObjective] = useState('awareness');
  const [targetAudience, setTargetAudience] = useState('monetized creators');
  const [keyMessage, setKeyMessage] = useState('');
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [generateStrategy, setGenerateStrategy] = useState(true);
  const [useAppContext, setUseAppContext] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAds, setGeneratedAds] = useState<GeneratedAds | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<{ platform: string; index: number } | null>(null);
  const [isAiHelping, setIsAiHelping] = useState(false);
  const [adImagePrompt, setAdImagePrompt] = useState('');
  const [adVideoPrompt, setAdVideoPrompt] = useState('');
  const [generatedImageData, setGeneratedImageData] = useState<string | null>(null);
  const [composedImageData, setComposedImageData] = useState<string | null>(null);
  const [overlayHeadline, setOverlayHeadline] = useState('Plan smarter. Post consistently.');
  const [overlaySubheadline, setOverlaySubheadline] = useState('Content Studio for creators');
  const [overlayCta, setOverlayCta] = useState('Start 7-day free trial');
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoStatus, setVideoStatus] = useState<string | null>(null);
  const [videoOperationId, setVideoOperationId] = useState<string | null>(null);

  const getBaseImageForVideo = async (): Promise<{ data: string; mimeType: string } | null> => {
    if (generatedImageData) {
      const base64Data = generatedImageData.split(',')[1];
      return { data: base64Data, mimeType: 'image/png' };
    }

    if (selectedImageId) {
      const selected = images.find((img) => img.id === selectedImageId);
      if (!selected?.url) return null;
      const response = await fetch(selected.url);
      const blob = await response.blob();
      const mimeType = blob.type || 'image/png';
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const base64Data = dataUrl.split(',')[1];
      return { data: base64Data, mimeType };
    }

    return null;
  };

  // Check if user is admin
  const isAdmin = user?.role === 'Admin';

  // Load existing images
  useEffect(() => {
    if (!isAdmin || !user?.id) return;
    loadImages();
  }, [isAdmin, user?.id]);

  // Load saved ad hooks/copy
  useEffect(() => {
    if (!isAdmin || !user?.id) return;
    loadSavedAds();
  }, [isAdmin, user?.id]);

  const normalizeGeneratedAds = (data: any): GeneratedAds => ({
    strategyBrief: data?.strategyBrief || null,
    x: Array.isArray(data?.ads?.x) ? data.ads.x : Array.isArray(data?.x) ? data.x : [],
    instagram: Array.isArray(data?.ads?.instagram) ? data.ads.instagram : Array.isArray(data?.instagram) ? data.instagram : [],
    tiktok: Array.isArray(data?.ads?.tiktok) ? data.ads.tiktok : Array.isArray(data?.tiktok) ? data.tiktok : [],
  });

  const loadImages = async () => {
    if (!user?.id) return;
    
    setIsLoading(true);
    try {
      // Load from Firestore (metadata)
      const imagesRef = collection(db, 'ad_screenshots');
      const q = query(imagesRef, orderBy('uploadedAt', 'desc'));
      const snapshot = await getDocs(q);
      
      const loadedImages: AdImage[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        loadedImages.push({
          id: docSnap.id,
          name: data.name || 'Untitled',
          url: data.url,
          uploadedAt: data.uploadedAt?.toDate() || new Date(),
          description: data.description,
        });
      });
      
      setImages(loadedImages);
    } catch (error) {
      console.error('Failed to load images:', error);
      showToast('Failed to load images', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const loadSavedAds = async () => {
    if (!user?.id) return;
    setIsLoadingSavedAds(true);
    try {
      const adsRef = collection(db, 'ad_generator_history');
      const q = query(adsRef, orderBy('createdAt', 'desc'), limit(20));
      const snapshot = await getDocs(q);
      const items: SavedAdSet[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        items.push({
          id: docSnap.id,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          objective: data.objective || 'awareness',
          targetAudience: data.targetAudience || '',
          keyMessage: data.keyMessage || '',
          ads: normalizeGeneratedAds(data),
        });
      });
      setSavedAds(items);
    } catch (error) {
      console.error('Failed to load saved ads:', error);
      showToast('Failed to load saved ads', 'error');
    } finally {
      setIsLoadingSavedAds(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showToast('Please upload an image file', 'error');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      showToast('Image must be under 10MB', 'error');
      return;
    }

    setIsUploading(true);
    try {
      // Convert to base64
      const base64Data = await fileToBase64(file);
      
      // Upload to Firebase Storage
      const timestamp = Date.now();
      const extension = file.name.split('.').pop() || 'png';
      const storagePath = `admin/ad-images/${timestamp}.${extension}`;
      const storageRef = ref(storage, storagePath);

      const bytes = base64ToBytes(base64Data);
      await uploadBytes(storageRef, bytes, {
        contentType: file.type,
      });

      const downloadURL = await getDownloadURL(storageRef);

      // Save metadata to Firestore
      const imagesRef = collection(db, 'ad_screenshots');
      const docRef = await addDoc(imagesRef, {
        name: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
        url: downloadURL,
        uploadedAt: new Date(),
        description: '',
      });

      // Add to local state
      setImages(prev => [{
        id: docRef.id,
        name: file.name.replace(/\.[^/.]+$/, ''),
        url: downloadURL,
        uploadedAt: new Date(),
      }, ...prev]);

      showToast('Image uploaded successfully', 'success');
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error: any) {
      console.error('Upload failed:', error);
      showToast(error?.message || 'Failed to upload image', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteImage = async (image: AdImage) => {
    if (!confirm(`Delete "${image.name}"?`)) return;

    try {
      // Delete from Firestore
      const docRef = doc(db, 'ad_screenshots', image.id);
      await deleteDoc(docRef);

      // Delete from Storage (extract path from URL)
      try {
        const urlPath = image.url.split('/o/')[1]?.split('?')[0];
        if (urlPath) {
          const decodedPath = decodeURIComponent(urlPath);
          const storageRef = ref(storage, decodedPath);
          await deleteObject(storageRef);
        }
      } catch (storageError) {
        console.warn('Failed to delete from storage:', storageError);
        // Continue even if storage delete fails
      }

      // Remove from local state
      setImages(prev => prev.filter(img => img.id !== image.id));
      
      // Clear selection if deleted image was selected
      if (selectedImageId === image.id) {
        setSelectedImageId(null);
      }
      
      showToast('Image deleted', 'success');
    } catch (error: any) {
      console.error('Delete failed:', error);
      showToast(error?.message || 'Failed to delete image', 'error');
    }
  };

  const copyToClipboard = async (text: string, platform: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex({ platform, index });
      showToast('Copied to clipboard', 'success');
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (error) {
      showToast('Failed to copy', 'error');
    }
  };

  const handleAiHelp = async () => {
    if (!targetAudience.trim()) {
      showToast('Please enter target audience first', 'error');
      return;
    }

    setIsAiHelping(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const response = await fetch('/api/generateAdKeyMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          objective,
          targetAudience: targetAudience.trim(),
          currentMessage: keyMessage.trim() || undefined,
        }),
      });

      const data = await response.json();
      
      if (!response.ok || data.error) {
        throw new Error(data.error || data.note || 'Failed to generate suggestion');
      }

      if (data.suggestion) {
        setKeyMessage(data.suggestion);
        showToast('Suggestion generated', 'success');
      }
    } catch (error: any) {
      console.error('AI help failed:', error);
      showToast(error?.message || 'Failed to generate suggestion', 'error');
    } finally {
      setIsAiHelping(false);
    }
  };

  const buildAdImagePrompt = () => {
    const parts = [
      'Create a high-converting ad image for EchoFlux.ai.',
      'Style: EchoFlux UI (light + dark) with clean modern SaaS aesthetic.',
      'Include EchoFlux dashboard UI as the main visual (sidebar + cards + gradient hero bar).',
      'Layout: headline + subheadline + CTA button + UI preview (landing hero style).',
      'Format: social ad creative, 1200x628, lots of whitespace, high contrast CTA.',
      'Do NOT include people, faces, hands, or real-world photography.',
      'Do NOT include office scenes or stock photo backgrounds.',
      'Only use UI mockups, cards, charts, buttons, gradients, and subtle abstract shapes.',
      'Use vector/flat UI style, not photorealistic.',
      'Brand colors: Primary Blue #326AE8, Bright Blue #2663E9, Accent Purple #693DDE, Bright Purple #6F39DE.',
      'Signature gradient: #2663E9 → #6F39DE.',
      'Neutrals (light): Background #FFFFFF, Page #F9FAFB, Card #F2F3F5, Soft tint #EDF5FE, Borders #D1D8E4.',
      'Neutrals (dark): Background #111827, Surface #182130, Raised #202938, Sidebar #151C2C, Muted #374050.',
      'Typography: clean modern sans (Inter-style).',
      `Objective: ${objective}.`,
      `Target Audience: ${targetAudience.trim()}.`,
      keyMessage.trim() ? `Key Message: ${keyMessage.trim()}.` : '',
      'Include a subtle CTA like "Start 7-day free trial".',
      'Focus on creators, consistency, planning, and calm confidence.',
      'No explicit content. Use safe, mainstream visuals.',
    ].filter(Boolean);

    return parts.join(' ');
  };

  const applyOverlayToImage = async (baseDataUrl: string) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = baseDataUrl;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const canvas = document.createElement('canvas');
    const width = 1200;
    const height = 628;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to create canvas context');

    // Background image
    ctx.drawImage(img, 0, 0, width, height);

    // Overlay gradient bar (top-left hero pill)
    const gradient = ctx.createLinearGradient(0, 0, 480, 0);
    gradient.addColorStop(0, '#2663E9');
    gradient.addColorStop(1, '#6F39DE');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(40, 40, 520, 80, 16);
    ctx.fill();

    // Headline
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '600 28px Inter, system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText(overlayHeadline || 'Plan smarter. Post consistently.', 64, 90);

    // Subheadline
    ctx.fillStyle = '#E5E7EB';
    ctx.font = '400 16px Inter, system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText(overlaySubheadline || 'Content Studio for creators', 64, 128);

    // CTA button
    ctx.fillStyle = '#2663E9';
    ctx.beginPath();
    ctx.roundRect(40, 150, 220, 48, 12);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '600 16px Inter, system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText(overlayCta || 'Start 7-day free trial', 60, 182);

    // EchoFlux.ai stamp
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(980, 40, 160, 36, 12);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '600 14px Inter, system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText('EchoFlux.ai', 1010, 64);

    const composed = canvas.toDataURL('image/png');
    setComposedImageData(composed);
  };

  const handleGenerateImage = async () => {
    if (!targetAudience.trim()) {
      showToast('Please enter target audience first', 'error');
      return;
    }

    setIsGeneratingImage(true);
    try {
      const prompt = adImagePrompt.trim() || buildAdImagePrompt();
      const imageBase64 = await generateImage(prompt, null, false);
      const dataUrl = `data:image/png;base64,${imageBase64}`;
      setGeneratedImageData(dataUrl);
      await applyOverlayToImage(dataUrl);
      showToast('Ad image generated', 'success');
    } catch (error: any) {
      console.error('Image generation failed:', error);
      showToast(error?.message || 'Failed to generate image', 'error');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleSaveGeneratedImage = async () => {
    const imageToSave = composedImageData || generatedImageData;
    if (!imageToSave) return;
    try {
      const base64Data = imageToSave.split(',')[1];
      const timestamp = Date.now();
      const storagePath = `admin/ad-images/ai-ad-${timestamp}.png`;
      const storageRef = ref(storage, storagePath);
      const bytes = base64ToBytes(base64Data);
      await uploadBytes(storageRef, bytes, { contentType: 'image/png' });
      const downloadURL = await getDownloadURL(storageRef);

      const imagesRef = collection(db, 'ad_screenshots');
      const docRef = await addDoc(imagesRef, {
        name: `AI Ad Creative ${new Date().toLocaleDateString()}`,
        url: downloadURL,
        uploadedAt: new Date(),
        description: 'AI-generated ad creative',
      });

      setImages(prev => [{
        id: docRef.id,
        name: `AI Ad Creative ${new Date().toLocaleDateString()}`,
        url: downloadURL,
        uploadedAt: new Date(),
        description: 'AI-generated ad creative',
      }, ...prev]);

      showToast('Ad image saved to library', 'success');
    } catch (error: any) {
      console.error('Failed to save generated image:', error);
      showToast(error?.message || 'Failed to save image', 'error');
    }
  };

  const handleDownloadGeneratedImage = () => {
    const imageToDownload = composedImageData || generatedImageData;
    if (!imageToDownload) return;
    const link = document.createElement('a');
    link.href = imageToDownload;
    link.download = `ai-ad-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleGenerateVideo = async () => {
    if (!targetAudience.trim()) {
      showToast('Please enter target audience first', 'error');
      return;
    }

    const baseImage = await getBaseImageForVideo();
    if (!baseImage) {
      showToast('Stable Video Diffusion requires an input image. Generate or select an image first.', 'error');
      return;
    }

    setIsGeneratingVideo(true);
    setVideoStatus('Generating video...');
    setGeneratedVideoUrl(null);
    try {
      let prompt = adVideoPrompt.trim();

      if (!prompt) {
        const adResult = await generateAd({
          adType: 'video',
          targetAudience: targetAudience.trim(),
          goal: objective,
          platform: 'TikTok',
          tone: 'Creator-first, calm confidence',
          callToAction: 'Try free for 7 days',
          additionalContext: [
            keyMessage.trim() || '',
            'Match EchoFlux UI style guide: gradients #2663E9→#6F39DE, UI cards, clean SaaS aesthetic.',
            'Overlay style: gradient pill/bar with white text, 6–10 words max hook, 1-line support text.',
            'Use captions like: “Plan My Week”, “Write Captions”, “Schedule”, “Copy + Post”.',
            'Include tiny “EchoFlux.ai” stamp in a small gradient pill.',
          ].filter(Boolean).join(' '),
          duration: 15,
        });
        prompt = adResult?.result?.videoPrompt || '';
      }

      if (!prompt) {
        throw new Error('Could not generate a video prompt. Please add a prompt and try again.');
      }

      const result = await generateVideo(prompt, baseImage, '9:16', false);
      if (result.videoUrl) {
        setGeneratedVideoUrl(result.videoUrl);
        setVideoStatus('Video ready');
      } else if (result.operationId) {
        setVideoOperationId(result.operationId);
        setVideoStatus('Rendering video...');
      } else {
        throw new Error('Video generation failed. Please try again.');
      }
    } catch (error: any) {
      console.error('Video generation failed:', error);
      showToast(error?.message || 'Failed to generate video', 'error');
      setVideoStatus(null);
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const handleSaveGeneratedVideo = async () => {
    if (!generatedVideoUrl) return;
    try {
      const videosRef = collection(db, 'ad_generator_videos');
      await addDoc(videosRef, {
        url: generatedVideoUrl,
        createdAt: new Date(),
        createdBy: user?.id || 'unknown',
        objective,
        targetAudience: targetAudience.trim(),
        keyMessage: keyMessage.trim() || '',
      });
      showToast('Video saved', 'success');
    } catch (error: any) {
      console.error('Failed to save video:', error);
      showToast(error?.message || 'Failed to save video', 'error');
    }
  };

  const handleDownloadGeneratedVideo = () => {
    if (!generatedVideoUrl) return;
    const link = document.createElement('a');
    link.href = generatedVideoUrl;
    link.download = `ai-ad-video-${Date.now()}.mp4`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  useEffect(() => {
    if (!videoOperationId || generatedVideoUrl) return;

    let attempts = 0;
    const maxAttempts = 60; // ~5 minutes at 5s interval
    const interval = setInterval(async () => {
      attempts += 1;
      try {
        const status = await getVideoStatus(videoOperationId);
        if (status.videoUrl) {
          setGeneratedVideoUrl(status.videoUrl);
          setVideoStatus('Video ready');
          clearInterval(interval);
          setVideoOperationId(null);
        } else if (status.status) {
          setVideoStatus(status.status);
        }
      } catch (err) {
        console.warn('Video status check failed:', err);
      }

      if (attempts >= maxAttempts) {
        setVideoStatus('Video generation timed out');
        clearInterval(interval);
        setVideoOperationId(null);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [videoOperationId, generatedVideoUrl]);

  const handleGenerateAds = async () => {
    if (!targetAudience.trim()) {
      showToast('Please enter target audience', 'error');
      return;
    }

    setIsGenerating(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const response = await fetch('/api/generateAdCampaign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          objective,
          targetAudience: targetAudience.trim(),
          keyMessage: keyMessage.trim() || undefined,
          selectedImageId,
          generateStrategy,
          useAppContext,
        }),
      });

      const data = await response.json();
      
      if (!response.ok || data.error) {
        throw new Error(data.error || data.note || 'Failed to generate ads');
      }

      const normalized = normalizeGeneratedAds(data);
      setGeneratedAds(normalized);
      showToast('Ads generated successfully', 'success');

      // Auto-save generated ads for later use
      try {
        const adsRef = collection(db, 'ad_generator_history');
        await addDoc(adsRef, {
          objective,
          targetAudience: targetAudience.trim(),
          keyMessage: keyMessage.trim() || '',
          strategyBrief: normalized.strategyBrief,
          ads: normalized,
          createdAt: new Date(),
          createdBy: user?.id || 'unknown',
        });
        loadSavedAds();
      } catch (saveError) {
        console.error('Failed to auto-save ads:', saveError);
      }
    } catch (error: any) {
      console.error('Ad generation failed:', error);
      showToast(error?.message || 'Failed to generate ads', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-12 text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Admin Only
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            This feature is only available to administrators.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Ad Generation Form */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              AI Ad Generator
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Generate marketing ads for X, Instagram, and TikTok with AI
            </p>
          </div>
        </div>

        {/* Input Form */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Objective
            </label>
            <select
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="awareness">Awareness</option>
              <option value="signups">Signups / Trial Starts</option>
              <option value="engagement">Engagement</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Target Audience *
            </label>
            <input
              type="text"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder="e.g., monetized creators, new creators starting out"
              className="w-full px-3 py-2 rounded-md bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Primary audience for the ads
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Key Message / Context (Optional)
              </label>
              <button
                onClick={handleAiHelp}
                disabled={isAiHelping || !targetAudience.trim()}
                className="text-xs px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-md hover:bg-primary-200 dark:hover:bg-primary-900/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                title="Get AI help to write your key message"
              >
                <SparklesIcon className="w-3 h-3" />
                {isAiHelping ? 'Generating...' : 'AI Help'}
              </button>
            </div>
            <textarea
              value={keyMessage}
              onChange={(e) => setKeyMessage(e.target.value)}
              placeholder="Any specific message, angle, or context for the ads..."
              rows={3}
              className="w-full px-3 py-2 rounded-md bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Click "AI Help" to get suggestions based on your objective and audience
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select Image (Optional)
            </label>
            {images.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Upload images below to use them in ads
              </p>
            ) : (
              <select
                value={selectedImageId || ''}
                onChange={(e) => setSelectedImageId(e.target.value || null)}
                className="w-full px-3 py-2 rounded-md bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="">None (text-only ads)</option>
                {images.map((image) => (
                  <option key={image.id} value={image.id}>
                    {image.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="generateStrategy"
              checked={generateStrategy}
              onChange={(e) => setGenerateStrategy(e.target.checked)}
              className="w-4 h-4 text-primary-600 rounded border-gray-300"
            />
            <label htmlFor="generateStrategy" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
              Generate strategy brief first (recommended)
            </label>
          </div>
          <div className="flex items-center">
            <input
              type="checkbox"
              id="useAppContext"
              checked={useAppContext}
              onChange={(e) => setUseAppContext(e.target.checked)}
              className="w-4 h-4 text-primary-600 rounded border-gray-300"
            />
            <label htmlFor="useAppContext" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
              Analyze current app codebase for ad context
            </label>
          </div>

          <button
            onClick={handleGenerateAds}
            disabled={isGenerating || !targetAudience.trim()}
            className="w-full px-4 py-3 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
          >
            {isGenerating ? 'Generating Ads...' : 'Generate Ads'}
          </button>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Generates ad copy and hooks. Use the Creative section below to generate images or videos.
          </p>
        </div>
      </div>

      {/* Ad Creative Generation */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
          Ad Creative (AI Images & Videos)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900 dark:text-white">Generate Image</h3>
            <textarea
              value={adImagePrompt}
              onChange={(e) => setAdImagePrompt(e.target.value)}
              placeholder="Optional: describe the ad image you want..."
              rows={3}
              className="w-full px-3 py-2 rounded-md bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100"
            />
            <div className="grid grid-cols-1 gap-2">
              <input
                type="text"
                value={overlayHeadline}
                onChange={(e) => setOverlayHeadline(e.target.value)}
                placeholder="Headline"
                className="w-full px-3 py-2 rounded-md bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100"
              />
              <input
                type="text"
                value={overlaySubheadline}
                onChange={(e) => setOverlaySubheadline(e.target.value)}
                placeholder="Subheadline"
                className="w-full px-3 py-2 rounded-md bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100"
              />
              <input
                type="text"
                value={overlayCta}
                onChange={(e) => setOverlayCta(e.target.value)}
                placeholder="CTA text"
                className="w-full px-3 py-2 rounded-md bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100"
              />
              {generatedImageData && (
                <button
                  onClick={() => applyOverlayToImage(generatedImageData)}
                  className="px-3 py-2 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600"
                >
                  Apply Overlay
                </button>
              )}
            </div>
            <button
              onClick={handleGenerateImage}
              disabled={isGeneratingImage || !targetAudience.trim()}
              className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              {isGeneratingImage ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Generating Image...
                </span>
              ) : (
                'Generate Image'
              )}
            </button>
            {(composedImageData || generatedImageData) && (
              <div className="mt-3">
                <img src={composedImageData || generatedImageData || ''} alt="Generated ad creative" className="w-full rounded-lg border" />
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={handleSaveGeneratedImage}
                    className="px-3 py-2 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600"
                  >
                    Save
                  </button>
                  <button
                    onClick={handleDownloadGeneratedImage}
                    className="px-3 py-2 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600"
                  >
                    Download
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900 dark:text-white">Generate Video</h3>
            <textarea
              value={adVideoPrompt}
              onChange={(e) => setAdVideoPrompt(e.target.value)}
              placeholder="Optional: describe the ad video you want..."
              rows={3}
              className="w-full px-3 py-2 rounded-md bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100"
            />
            <button
              onClick={handleGenerateVideo}
              disabled={isGeneratingVideo || !targetAudience.trim()}
              className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              {isGeneratingVideo ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Generating Video...
                </span>
              ) : (
                'Generate Video'
              )}
            </button>
            {videoStatus && (
              <p className="text-sm text-gray-600 dark:text-gray-400">{videoStatus}</p>
            )}
            {generatedVideoUrl && (
              <div className="mt-3">
                <video src={generatedVideoUrl} controls className="w-full rounded-lg border" />
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={handleSaveGeneratedVideo}
                    className="px-3 py-2 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600"
                  >
                    Save
                  </button>
                  <button
                    onClick={handleDownloadGeneratedVideo}
                    className="px-3 py-2 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600"
                  >
                    Download
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Strategy Brief Display */}
      {generatedAds?.strategyBrief && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            Strategy Brief <span className="text-xs font-normal text-gray-500 dark:text-gray-400">(AI-generated)</span>
          </h2>
          <div className="space-y-3 text-gray-700 dark:text-gray-300">
            <div>
              <span className="font-semibold">Objective:</span> {generatedAds.strategyBrief.objective}
            </div>
            <div>
              <span className="font-semibold">Target Audience:</span> {generatedAds.strategyBrief.targetAudience}
            </div>
            <div>
              <span className="font-semibold">Key Message:</span> {generatedAds.strategyBrief.keyMessage}
            </div>
            <div>
              <span className="font-semibold">Tone:</span> {generatedAds.strategyBrief.tone}
            </div>
            <div>
              <span className="font-semibold">CTA:</span> {generatedAds.strategyBrief.cta}
            </div>
          </div>
        </div>
      )}

      {/* Generated Ads Display */}
      {generatedAds && (
        <div className="space-y-6">
          {/* X (Twitter) Ads */}
          {generatedAds.x.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                X (Twitter) Ads ({generatedAds.x.length} variants) <span className="text-xs font-normal text-gray-500 dark:text-gray-400">(AI-generated)</span>
              </h2>
              <div className="space-y-4">
                {generatedAds.x.map((ad, index) => (
                  <div
                    key={index}
                    className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                        Variant {index + 1} • {ad.characterCount} chars
                      </span>
                      <button
                        onClick={() => copyToClipboard(ad.copy, 'x', index)}
                        className="p-2 text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
                        title="Copy ad"
                      >
                        {copiedIndex?.platform === 'x' && copiedIndex?.index === index ? (
                          <CheckCircleIcon className="w-5 h-5 text-green-600" />
                        ) : (
                          <CopyIcon className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                    <p className="text-gray-900 dark:text-white whitespace-pre-wrap mb-2">
                      {ad.copy}
                    </p>
                    {ad.hashtags && ad.hashtags.length > 0 && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Hashtags: {ad.hashtags.join(' ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Instagram Ads */}
          {generatedAds.instagram.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                Instagram Ads ({generatedAds.instagram.length} variants) <span className="text-xs font-normal text-gray-500 dark:text-gray-400">(AI-generated)</span>
              </h2>
              <div className="space-y-4">
                {generatedAds.instagram.map((ad, index) => (
                  <div
                    key={index}
                    className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                        Variant {index + 1} • {ad.characterCount} chars
                      </span>
                      <button
                        onClick={() => copyToClipboard(ad.copy, 'instagram', index)}
                        className="p-2 text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
                        title="Copy ad"
                      >
                        {copiedIndex?.platform === 'instagram' && copiedIndex?.index === index ? (
                          <CheckCircleIcon className="w-5 h-5 text-green-600" />
                        ) : (
                          <CopyIcon className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                    <p className="text-gray-900 dark:text-white whitespace-pre-wrap mb-2">
                      {ad.copy}
                    </p>
                    {ad.hashtags && ad.hashtags.length > 0 && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Hashtags: {ad.hashtags.join(' ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TikTok Ads */}
          {generatedAds.tiktok.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                TikTok Ads ({generatedAds.tiktok.length} variants) <span className="text-xs font-normal text-gray-500 dark:text-gray-400">(AI-generated)</span>
              </h2>
              <div className="space-y-4">
                {generatedAds.tiktok.map((ad, index) => (
                  <div
                    key={index}
                    className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                        Variant {index + 1}
                      </span>
                      <button
                        onClick={() => copyToClipboard(ad.copy, 'tiktok', index)}
                        className="p-2 text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
                        title="Copy ad"
                      >
                        {copiedIndex?.platform === 'tiktok' && copiedIndex?.index === index ? (
                          <CheckCircleIcon className="w-5 h-5 text-green-600" />
                        ) : (
                          <CopyIcon className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                    {ad.hook && (
                      <div className="mb-2">
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Hook:</span>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{ad.hook}</p>
                      </div>
                    )}
                    <p className="text-gray-900 dark:text-white whitespace-pre-wrap mb-2">
                      {ad.copy}
                    </p>
                    {ad.hashtags && ad.hashtags.length > 0 && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Hashtags: {ad.hashtags.join(' ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Saved Ads */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
          Saved Ad Hooks & Copy
        </h2>
        {isLoadingSavedAds ? (
          <p className="text-gray-600 dark:text-gray-400">Loading saved ads...</p>
        ) : savedAds.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">No saved ads yet.</p>
        ) : (
          <div className="space-y-3">
            {savedAds.map((item) => (
              <div
                key={item.id}
                className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {item.createdAt.toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {item.objective} · {item.targetAudience}
                    </p>
                    {item.keyMessage && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                        {item.keyMessage}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setGeneratedAds(item.ads)}
                    className="px-3 py-2 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600"
                  >
                    Load
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Image Library Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              Image Library
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Upload and manage images to use in your ads. Select an image above to include it in ad generation.
            </p>
          </div>
        </div>

        {/* Upload Section */}
        <div className="mb-8 p-4 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
          <div className="flex flex-col items-center justify-center py-6">
            <UploadIcon className="w-12 h-12 text-gray-400 dark:text-gray-500 mb-4" />
            <label className="cursor-pointer">
              <span className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors inline-block">
                {isUploading ? 'Uploading...' : 'Upload Image'}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                disabled={isUploading}
                className="hidden"
              />
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              PNG, JPG, or WebP up to 10MB
            </p>
          </div>
        </div>

        {/* Image Gallery */}
        <div>
          {isLoading ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              Loading images...
            </div>
          ) : images.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No images uploaded yet. Upload your first image above.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {images.map((image) => (
                <div
                  key={image.id}
                  className={`relative group bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                    selectedImageId === image.id
                      ? 'border-primary-600 dark:border-primary-400 ring-2 ring-primary-200 dark:ring-primary-800'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                  onClick={() => setSelectedImageId(selectedImageId === image.id ? null : image.id)}
                >
                  <img
                    src={image.url}
                    alt={image.name}
                    className="w-full h-48 object-cover"
                  />
                  <div className="p-3">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {image.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {image.uploadedAt.toLocaleDateString()}
                    </p>
                  </div>
                  {selectedImageId === image.id && (
                    <div className="absolute top-2 left-2 bg-primary-600 text-white px-2 py-1 rounded text-xs font-semibold">
                      Selected
                    </div>
                  )}
                  <div className="absolute top-2 right-2 flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedImageId(selectedImageId === image.id ? null : image.id);
                      }}
                      className={`p-2 rounded-full transition-opacity ${
                        selectedImageId === image.id
                          ? 'bg-primary-600 text-white opacity-100'
                          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 opacity-0 group-hover:opacity-100'
                      }`}
                      title={selectedImageId === image.id ? 'Selected' : 'Select for ads'}
                    >
                      <CheckCircleIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteImage(image);
                      }}
                      className="p-2 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
                      title="Delete image"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
