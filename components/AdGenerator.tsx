// components/AdGenerator.tsx
// AI-powered ad generation for text and video ads (Admin-only)

import React, { useState, useRef } from 'react';
import { SparklesIcon, UploadIcon, ImageIcon, TrashIcon, CopyIcon, CheckCircleIcon } from './icons/UIIcons';
import { useAppContext } from './AppContext';
import { storage, db, auth } from '../firebaseConfig';
import { ref, uploadBytes, getDownloadURL, listAll, deleteObject } from 'firebase/storage';
import { collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, limit } from 'firebase/firestore';

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
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAds, setGeneratedAds] = useState<GeneratedAds | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<{ platform: string; index: number } | null>(null);
  const [isAiHelping, setIsAiHelping] = useState(false);

  // Check if user is admin
  const isAdmin = user?.role === 'Admin';

  // Load existing images
  React.useEffect(() => {
    if (!isAdmin || !user?.id) return;
    loadImages();
  }, [isAdmin, user?.id]);

  React.useEffect(() => {
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
        showToast('AI suggestion generated', 'success');
      }
    } catch (error: any) {
      console.error('AI help failed:', error);
      showToast(error?.message || 'Failed to generate suggestion', 'error');
    } finally {
      setIsAiHelping(false);
    }
  };

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

          <button
            onClick={handleGenerateAds}
            disabled={isGenerating || !targetAudience.trim()}
            className="w-full px-4 py-3 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
          >
            {isGenerating ? 'Generating Ads...' : 'Generate Ads'}
          </button>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            This generates ad copy and hooks. Image/video creative is not auto-generated yet.
          </p>
        </div>
      </div>

      {/* Strategy Brief Display */}
      {generatedAds?.strategyBrief && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            Strategy Brief
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
                X (Twitter) Ads ({generatedAds.x.length} variants)
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
                Instagram Ads ({generatedAds.instagram.length} variants)
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
                TikTok Ads ({generatedAds.tiktok.length} variants)
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
