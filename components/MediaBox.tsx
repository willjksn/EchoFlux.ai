import React, { useState, useRef, useMemo, useEffect } from 'react';
import { MediaItemState, CaptionResult, Platform } from '../types';
import { generateCaptions } from '../src/services/geminiService';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, auth } from '../firebaseConfig';

import {
  UploadIcon,
  TrashIcon,
  RefreshIcon,
  CalendarIcon,
  SendIcon,
  MobileIcon,
  ImageIcon,
  HashtagIcon,
  PlusIcon,
  EmojiIcon,
  FaceSmileIcon,
  CatIcon,
  PizzaIcon,
  SoccerBallIcon,
  CarIcon,
  LightbulbIcon,
  HeartIcon,
  PlayIcon,
  CheckCircleIcon,
  ClipboardCheckIcon,
  SparklesIcon,
  XMarkIcon,
  CopyIcon,
} from './icons/UIIcons';
import { MusicTrack } from '../types';
import { EMOJIS, EMOJI_CATEGORIES, Emoji } from './emojiData';
import { getMusicTracks, searchMusicTracks, getMusicGenres, getMusicMoods } from '../src/services/musicService';
import {
  InstagramIcon,
  TikTokIcon,
  XIcon,
  ThreadsIcon,
  YouTubeIcon,
  LinkedInIcon,
  FacebookIcon
} from './icons/PlatformIcons';
import { useAppContext } from './AppContext';
import { MediaLibraryItem } from '../types';
import { db } from '../firebaseConfig';
import { collection, getDocs, query, orderBy, setDoc, doc, addDoc, Timestamp, deleteDoc } from 'firebase/firestore';
import { VideoIcon } from './icons/UIIcons';

const categoryIcons: Record<string, React.ReactNode> = {
    FaceSmileIcon: <FaceSmileIcon className="w-5 h-5"/>,
    CatIcon: <CatIcon className="w-5 h-5"/>,
    PizzaIcon: <PizzaIcon className="w-5 h-5"/>,
    SoccerBallIcon: <SoccerBallIcon className="w-5 h-5"/>,
    CarIcon: <CarIcon className="w-5 h-5"/>,
    LightbulbIcon: <LightbulbIcon className="w-5 h-5"/>,
    HeartIcon: <HeartIcon className="w-5 h-5"/>,
};

// Local platformIcons constant (not used - prop shadows this)
// Kept for potential future use, but currently MediaBox uses the platformIcons prop
const localPlatformIcons: Partial<Record<Platform, React.ReactNode>> = {
  Instagram: <InstagramIcon />,
  TikTok: <TikTokIcon />,
  X: <XIcon />,
  Threads: <ThreadsIcon />,
  YouTube: <YouTubeIcon />,
  LinkedIn: <LinkedInIcon />,
  Facebook: <FacebookIcon />,
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = error => reject(error);
  });
};

function base64ToBytes(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

interface MediaBoxProps {
  mediaItem: MediaItemState;
  index: number;
  onUpdate: (index: number, updates: Partial<MediaItemState>) => void;
  onRemove: (index: number) => void;
  canGenerate: boolean;
  onGenerateComplete: () => void;
  goalOptions: { value: string; label: string }[];
  toneOptions: { value: string; label: string }[];
  isSelected: boolean;
  onToggleSelect: (index: number) => void;
  onPreview: (index: number) => void;
  usePersonality?: boolean;
  useFavoriteHashtags?: boolean;
  creatorPersonality?: string;
  favoriteHashtags?: string;
  onTogglePersonality?: () => void;
  onToggleHashtags?: () => void;
  onPublish: (index: number) => void;
  onSchedule: (index: number) => void;
  onSaveToWorkflow: (index: number, status: 'Draft' | 'Scheduled') => void;
  onAIAutoSchedule?: (index: number) => void;
  platformIcons: Record<Platform, React.ReactNode>;
  onUpgradeClick?: () => void; // Callback to show upgrade modal
  onAnalyzeContentGaps?: () => void; // Callback to analyze content gaps
  isAnalyzingGaps?: boolean; // Whether content gaps are being analyzed
}

export const MediaBox: React.FC<MediaBoxProps> = ({
  mediaItem,
  index,
  onUpdate,
  onRemove,
  canGenerate,
  onGenerateComplete,
  goalOptions,
  toneOptions,
  isSelected,
  onAnalyzeContentGaps,
  isAnalyzingGaps = false,
  onToggleSelect,
  onPreview,
  onPublish,
  onSchedule,
  onSaveToWorkflow,
  onAIAutoSchedule,
  platformIcons,
  onUpgradeClick,
  usePersonality = false,
  useFavoriteHashtags = false,
  creatorPersonality,
  favoriteHashtags,
  onTogglePersonality,
  onToggleHashtags,
}) => {
  const { user, setUser, showToast, setActivePage } = useAppContext();
  const [isGenerating, setIsGenerating] = useState(false);
  const [showMediaLibraryModal, setShowMediaLibraryModal] = useState(false);
  const [libraryMediaItems, setLibraryMediaItems] = useState<MediaLibraryItem[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [emojiSearchTerm, setEmojiSearchTerm] = useState('');
  const [activeEmojiCategory, setActiveEmojiCategory] = useState<Emoji['category']>(EMOJI_CATEGORIES[0].name);
  const [showMusicModal, setShowMusicModal] = useState(false);
  const [musicSearchQuery, setMusicSearchQuery] = useState('');
  const [selectedMusicGenre, setSelectedMusicGenre] = useState<string>('');
  const [playingMusicId, setPlayingMusicId] = useState<string | null>(null);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const captionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const aiHelpRef = useRef<HTMLDivElement>(null);
  const [isAiHelpOpen, setIsAiHelpOpen] = useState(false);
  const [aiHelpPrompt, setAiHelpPrompt] = useState('');
  const [isAiHelpGenerating, setIsAiHelpGenerating] = useState(false);
  
  // Predict and Repurpose modals
  const [predictResult, setPredictResult] = useState<any>(null);
  const [showPredictModal, setShowPredictModal] = useState(false);
  const [repurposeResult, setRepurposeResult] = useState<any>(null);
  const [showRepurposeModal, setShowRepurposeModal] = useState(false);

  // (carousel captions are summarized across all media; no per-image caption selection)

  // Save predict to history (limit to last 10)
  const savePredictToHistory = async (data: any) => {
    if (!user?.id) return;
    try {
      const historyRef = collection(db, 'users', user.id, 'compose_predict_history');
      await addDoc(historyRef, {
        type: 'predict',
        data,
        createdAt: Timestamp.now(),
      });
      
      // Keep only last 10 - get all, delete oldest if > 10
      const q = query(historyRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      if (snapshot.size > 10) {
        const docs = snapshot.docs;
        const toDelete = docs.slice(10);
        for (const docToDelete of toDelete) {
          await deleteDoc(docToDelete.ref);
        }
      }
    } catch (error: any) {
      console.error('Error saving predict to history:', error);
    }
  };

  // Save repurpose to history (limit to last 10)
  const saveRepurposeToHistory = async (data: any) => {
    if (!user?.id) return;
    try {
      const historyRef = collection(db, 'users', user.id, 'compose_repurpose_history');
      await addDoc(historyRef, {
        type: 'repurpose',
        data,
        createdAt: Timestamp.now(),
      });
      
      // Keep only last 10 - get all, delete oldest if > 10
      const q = query(historyRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      if (snapshot.size > 10) {
        const docs = snapshot.docs;
        const toDelete = docs.slice(10);
        for (const docToDelete of toDelete) {
          await deleteDoc(docToDelete.ref);
        }
      }
    } catch (error: any) {
      console.error('Error saving repurpose to history:', error);
    }
  };

  // Cleanup music playback on unmount or modal close
  useEffect(() => {
    return () => {
      if (musicAudioRef.current) {
        musicAudioRef.current.pause();
        musicAudioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!showMusicModal && musicAudioRef.current) {
      musicAudioRef.current.pause();
      musicAudioRef.current = null;
      setPlayingMusicId(null);
    }
  }, [showMusicModal]);

  // Load media library items when modal opens
  React.useEffect(() => {
    if (showMediaLibraryModal && user) {
      setIsLoadingLibrary(true);
      const loadMediaLibrary = async () => {
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
          setLibraryMediaItems(items);
        } catch (error) {
          console.error('Failed to load media library:', error);
          showToast('Failed to load media library', 'error');
        } finally {
          setIsLoadingLibrary(false);
        }
      };
      loadMediaLibrary();
    }
  }, [showMediaLibraryModal, user, showToast]);


  const handleSelectFromLibrary = (item: MediaLibraryItem) => {
    onUpdate(index, {
      previewUrl: item.url,
      data: '', // Media Library items are already URLs
      mimeType: item.mimeType || (item.type === 'image' ? 'image/jpeg' : 'video/mp4'),
      type: item.type,
      isGenerated: false,
      results: [],
      captionText: '',
    });
    setShowMediaLibraryModal(false);
    showToast(`Selected ${item.name}`, 'success');
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>, isAdditionalImage: boolean = false) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !user) return;

    const file = files[0];
    const fileType = file.type.startsWith('image') ? 'image' : 'video';

    // Only allow images for additional images (multi-image posts)
    if (isAdditionalImage && fileType !== 'image') {
      showToast('Only images can be added to multi-image posts', 'error');
      return;
    }

    try {
      // Create temporary preview URL for immediate display
      const tempPreviewUrl = URL.createObjectURL(file);
      
      // Upload to Firebase Storage immediately
      const timestamp = Date.now();
      const extension = file.type.split('/')[1] || (fileType === 'image' ? 'png' : 'mp4');
      const storagePath = `users/${user.id}/uploads/${timestamp}.${extension}`;
      const storageRef = ref(storage, storagePath);

      await uploadBytes(storageRef, file, {
        contentType: file.type,
      });

      const firebaseUrl = await getDownloadURL(storageRef);
      
      // Revoke the temporary blob URL
      URL.revokeObjectURL(tempPreviewUrl);

      // Save to media library in general folder
      try {
        const mediaLibraryItem = {
          id: timestamp.toString(),
          userId: user.id,
          url: firebaseUrl,
          name: file.name,
          type: fileType,
          mimeType: file.type,
          size: file.size,
          uploadedAt: new Date().toISOString(),
          usedInPosts: [],
          tags: [],
          folderId: 'general', // Save to general folder
        };
        await setDoc(doc(db, 'users', user.id, 'media_library', mediaLibraryItem.id), mediaLibraryItem);
      } catch (libraryError) {
        // Don't fail the upload if media library save fails
        console.error('Failed to save to media library:', libraryError);
      }

      // Convert to base64 for storage (optional, but kept for compatibility)
      const base64 = await fileToBase64(file);

      if (isAdditionalImage) {
        // Add as additional image to existing post
        const currentAdditionalImages = mediaItem.additionalImages || [];
        onUpdate(index, {
          additionalImages: [
            ...currentAdditionalImages,
            {
              id: timestamp.toString(),
              previewUrl: firebaseUrl,
              data: base64,
              mimeType: file.type,
            },
          ],
        });
        showToast('Image added to post', 'success');
      } else {
        // Set as primary image
        onUpdate(index, {
          data: base64,
          mimeType: file.type,
          previewUrl: firebaseUrl, // Use Firebase URL instead of blob/data URL
          type: fileType,
          isGenerated: false,
          results: [],
          captionText: '',
        });
      }
    } catch (error) {
      showToast('Failed to upload file.', 'error');
      console.error(error);
    }
    
    // Reset file input
    event.target.value = '';
  };

  const handleRemoveAdditionalImage = (imageId: string) => {
    const currentAdditionalImages = mediaItem.additionalImages || [];
    onUpdate(index, {
      additionalImages: currentAdditionalImages.filter(img => img.id !== imageId),
    });
    showToast('Image removed', 'success');
  };

  const normalizeCaptionResults = (res: any): CaptionResult[] => {
    if (Array.isArray(res)) return res as CaptionResult[];
    if (Array.isArray(res?.captions)) return res.captions as CaptionResult[];
    if (res?.caption) return [{ caption: res.caption, hashtags: res.hashtags || [] }];
    return [];
  };

  const firstCaptionTextFromResults = (results: CaptionResult[]) => {
    return results.length > 0 ? results[0].caption + '\n\n' + (results[0].hashtags || []).join(' ') : '';
  };

  const resolveMediaUrl = async (base64Data: string | null, mimeType: string, mediaUrl?: string) => {
    let finalMediaUrl = mediaUrl;

    // If we don't have a URL yet, upload the base64 data to Firebase Storage
    if (!finalMediaUrl && base64Data && user) {
      const timestamp = Date.now();
      const extension = mimeType.split('/')[1] || 'png';
      const storagePath = `users/${user.id}/uploads/${timestamp}.${extension}`;
      const storageRef = ref(storage, storagePath);

      const bytes = base64ToBytes(base64Data);
      await uploadBytes(storageRef, bytes, {
        contentType: mimeType,
      });

      finalMediaUrl = await getDownloadURL(storageRef);
    }

    return finalMediaUrl || null;
  };

  const generateCaptionsForSingleUrl = async (finalMediaUrl: string, selectedPlatform: Platform) => {
    const res = await generateCaptions({
      mediaUrl: finalMediaUrl,
      goal: mediaItem.postGoal,
      tone: mediaItem.postTone,
      promptText: undefined,
      platforms: [selectedPlatform], // platform-optimized captions
      usePersonality: usePersonality && creatorPersonality ? true : false,
      useFavoriteHashtags: useFavoriteHashtags && favoriteHashtags ? true : false,
      creatorPersonality: usePersonality ? creatorPersonality || null : null,
      favoriteHashtags: useFavoriteHashtags ? favoriteHashtags || null : null,
    });

    const results = normalizeCaptionResults(res);
    const firstCaptionText = firstCaptionTextFromResults(results);
    return { results, firstCaptionText };
  };

  const generateCaptionsForMedia = async (base64Data: string | null, mimeType: string, mediaUrl?: string) => {
    if (!canGenerate || !user) {
      // Show upgrade modal if callback is provided
      if (onUpgradeClick) {
        onUpgradeClick();
      } else {
        showToast('You have reached your monthly caption generation limit. Upgrade to get more!', 'error');
      }
      return;
    }

    setIsGenerating(true);
    try {
      const finalMediaUrl = await resolveMediaUrl(base64Data, mimeType, mediaUrl);
      if (!finalMediaUrl) {
        showToast('Failed to get media URL for caption generation.', 'error');
        setIsGenerating(false);
        return;
      }

      // Get single selected platform for platform-optimized captions
      const selectedPlatform = (Object.keys(mediaItem.selectedPlatforms || {}) as Platform[]).find(
        p => mediaItem.selectedPlatforms?.[p]
      );
      
      if (!selectedPlatform) {
        showToast('Please select a platform first to generate platform-optimized captions', 'error');
        setIsGenerating(false);
        return;
      }
      
      const { results: generatedResults, firstCaptionText } = await generateCaptionsForSingleUrl(finalMediaUrl, selectedPlatform);

      onUpdate(index, {
        results: generatedResults,
        captionText: firstCaptionText,
      });

      onGenerateComplete();
    } catch (err) {
      console.error(err);
      showToast('Failed to generate captions.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerate = async () => {
    const additional = mediaItem.additionalImages || [];
    const hasAdditional = additional.length > 0;

    if (!hasAdditional) {
      // Single media - keep existing behavior
      if (mediaItem.data) {
        generateCaptionsForMedia(mediaItem.data, mediaItem.mimeType || 'image/jpeg');
      } else if (mediaItem.previewUrl) {
        generateCaptionsForMedia(null, mediaItem.mimeType || 'image/jpeg', mediaItem.previewUrl);
      } else {
        showToast('Please upload media first.', 'error');
      }
      return;
    }

    // Carousel: generate ONE caption set that summarizes ALL images.
    if (!canGenerate || !user) {
      if (onUpgradeClick) onUpgradeClick();
      else showToast('You have reached your monthly caption generation limit. Upgrade to get more!', 'error');
      return;
    }

    setIsGenerating(true);
    try {
      // Platform must be selected
      const selectedPlatform = (Object.keys(mediaItem.selectedPlatforms || {}) as Platform[]).find(
        p => mediaItem.selectedPlatforms?.[p]
      );
      if (!selectedPlatform) {
        showToast('Please select a platform first to generate platform-optimized captions', 'error');
        return;
      }

      // Resolve URLs for all media items (primary + additional images)
      const primaryUrl = await resolveMediaUrl(mediaItem.data || null, mediaItem.mimeType || 'image/jpeg', mediaItem.previewUrl);
      if (!primaryUrl) {
        showToast('Failed to get media URL for caption generation.', 'error');
        return;
      }

      const additionalUrls: string[] = [];
      for (const img of additional) {
        const url = await resolveMediaUrl(img.data || null, img.mimeType || 'image/jpeg', img.previewUrl);
        if (url) additionalUrls.push(url);
      }

      const mediaUrls = [primaryUrl, ...additionalUrls];
      const res = await generateCaptions({
        mediaUrls,
        goal: mediaItem.postGoal,
        tone: mediaItem.postTone,
        promptText: undefined,
        platforms: [selectedPlatform],
        usePersonality: usePersonality && creatorPersonality ? true : false,
        useFavoriteHashtags: useFavoriteHashtags && favoriteHashtags ? true : false,
        creatorPersonality: usePersonality ? creatorPersonality || null : null,
        favoriteHashtags: useFavoriteHashtags ? favoriteHashtags || null : null,
      });

      const generatedResults = normalizeCaptionResults(res);
      const firstCaptionText = firstCaptionTextFromResults(generatedResults);
      onUpdate(index, {
        results: generatedResults,
        captionText: firstCaptionText,
      });

      onGenerateComplete();
      showToast('Generated a caption that summarizes all images in this post.', 'success');
    } catch (e: any) {
      console.error(e);
      showToast(e?.message || 'Failed to generate captions.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectCaption = (result: CaptionResult) => {
    const captionText =
      result.caption + '\n\n' + (result.hashtags || []).join(' ');
    onUpdate(index, { captionText });
  };


  const filteredEmojis = useMemo(() => {
    let emojis = EMOJIS;
    
    if (emojiSearchTerm) {
      const searchLower = emojiSearchTerm.toLowerCase();
      emojis = emojis.filter(e => 
        e.description.toLowerCase().includes(searchLower) ||
        e.aliases.some(alias => alias.toLowerCase().includes(searchLower))
      );
    } else {
      emojis = emojis.filter(e => e.category === activeEmojiCategory);
    }
    
    return emojis;
  }, [emojiSearchTerm, activeEmojiCategory]);

  const handleEmojiSelect = (emoji: string) => {
    if (captionTextareaRef.current) {
      const { selectionStart, selectionEnd } = captionTextareaRef.current;
      const currentText = mediaItem.captionText || '';
      const newText =
        currentText.substring(0, selectionStart) +
        emoji +
        currentText.substring(selectionEnd);
      onUpdate(index, { captionText: newText });
      
      setTimeout(() => {
        if (captionTextareaRef.current) {
          captionTextareaRef.current.focus();
          const newCursorPosition = selectionStart + emoji.length;
          captionTextareaRef.current.setSelectionRange(newCursorPosition, newCursorPosition);
        }
      }, 0);
    } else {
      onUpdate(index, { captionText: (mediaItem.captionText || '') + emoji });
    }
    setIsEmojiPickerOpen(false);
  };

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.emoji-picker-container') && !target.closest('.emoji-button')) {
        setIsEmojiPickerOpen(false);
      }
      if (aiHelpRef.current && !aiHelpRef.current.contains(target) && !target.closest('[title="AI Help - Tell AI what you want"]')) {
        setIsAiHelpOpen(false);
      }
    };

    if (isEmojiPickerOpen || isAiHelpOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isEmojiPickerOpen, isAiHelpOpen]);

  const handleAiHelpGenerate = async () => {
    if (!aiHelpPrompt.trim()) return;

    setIsAiHelpGenerating(true);
    try {
      const selectedPlatform = (Object.keys(mediaItem.selectedPlatforms || {}) as Platform[]).find(
        p => mediaItem.selectedPlatforms?.[p]
      );
      if (!selectedPlatform) {
        showToast('Please select a platform first', 'error');
        setIsAiHelpGenerating(false);
        return;
      }

      const userNiche = user?.userType === 'Business'
        ? (user as any)?.businessType
        : user?.niche;
      const baseCaption = mediaItem.captionText?.trim();
      const contextLines = [
        userNiche ? `Niche: ${userNiche}` : null,
        mediaItem.postGoal ? `Goal: ${mediaItem.postGoal}` : null,
        mediaItem.postTone ? `Tone: ${mediaItem.postTone}` : null,
        selectedPlatform ? `Platform: ${selectedPlatform}` : null,
        usePersonality && creatorPersonality ? `Creator Personality: ${creatorPersonality}` : null,
        useFavoriteHashtags && favoriteHashtags ? `Favorite Hashtags: ${favoriteHashtags}` : null,
      ].filter(Boolean).join('\n');

      const promptText = `
Write a single caption based on the instruction below. If media is provided, use it.
Keep it aligned with the goal, tone, and platform.

INSTRUCTION:
${aiHelpPrompt}

CURRENT CAPTION:
${baseCaption || '(empty)'}

CONTEXT:
${contextLines || 'None'}
      `.trim();

      const mimeType = mediaItem.mimeType || 'image/jpeg';
      const finalMediaUrl = await resolveMediaUrl(mediaItem.data || null, mimeType, mediaItem.previewUrl || undefined);

      const res = await generateCaptions({
        mediaUrl: finalMediaUrl,
        mediaData: mediaItem.data ? { data: mediaItem.data, mimeType } : null,
        goal: mediaItem.postGoal,
        tone: mediaItem.postTone,
        promptText,
        platforms: [selectedPlatform],
        usePersonality: usePersonality && creatorPersonality ? true : false,
        useFavoriteHashtags: useFavoriteHashtags && favoriteHashtags ? true : false,
        creatorPersonality: usePersonality ? creatorPersonality || null : null,
        favoriteHashtags: useFavoriteHashtags ? favoriteHashtags || null : null,
      });

      const generatedResults = normalizeCaptionResults(res);
      const generatedText = firstCaptionTextFromResults(generatedResults);

      if (generatedText) {
        onUpdate(index, {
          results: generatedResults.length > 0 ? generatedResults : mediaItem.results,
          captionText: generatedText,
        });
        setIsAiHelpOpen(false);
        setAiHelpPrompt('');
      } else {
        throw new Error('No text generated');
      }
    } catch (error: any) {
      console.error('AI Help generation error:', error);
      showToast(error?.message || 'Failed to generate text. Please try again.', 'error');
    } finally {
      setIsAiHelpGenerating(false);
    }
  };

  const hasContent = mediaItem.previewUrl && mediaItem.captionText.trim();
  const platformsToPost = (Object.keys(mediaItem.selectedPlatforms || {}) as Platform[]).filter(
    p => mediaItem.selectedPlatforms?.[p]
  );

  return (
    <div className={`bg-white dark:bg-gray-800 p-4 rounded-xl border-2 transition-colors w-full ${
      isSelected 
        ? 'border-primary-500 dark:border-primary-500' 
        : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700'
    }`}>
      {/* Header with Checkbox and Remove button */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(index)}
            className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 dark:focus:ring-primary-400 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            style={{ display: 'none' }}
          />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Post {index + 1}
          </span>
        </div>
        <button
          onClick={() => onRemove(index)}
          className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          title="Remove"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Media Preview */}
      {mediaItem.previewUrl ? (
        <div className="mb-3">
          {/* Primary Image/Video */}
          <div className="relative w-full min-h-40 max-h-96 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden mb-2 flex items-center justify-center">
            {mediaItem.type === 'image' ? (
              <img
                src={mediaItem.previewUrl}
                alt={`Post ${index + 1}`}
                className="max-w-full max-h-96 object-contain"
              />
            ) : (
            <>
              <video
                src={mediaItem.previewUrl}
                className="max-w-full max-h-96 object-contain"
                preload="metadata"
                controls
                muted={false}
                ref={(videoRef) => {
                  if (videoRef) {
                    // Ensure video is not muted
                    videoRef.muted = false;
                    videoRef.addEventListener('play', () => {
                      const playOverlay = videoRef.parentElement?.querySelector('.play-overlay');
                      if (playOverlay) {
                        (playOverlay as HTMLElement).style.display = 'none';
                      }
                    });
                    videoRef.addEventListener('pause', () => {
                      const playOverlay = videoRef.parentElement?.querySelector('.play-overlay');
                      if (playOverlay) {
                        (playOverlay as HTMLElement).style.display = 'flex';
                      }
                    });
                  }
                }}
              />
              <div 
                className="play-overlay absolute inset-0 bg-black/30 flex items-center justify-center cursor-pointer hover:bg-black/40 transition-colors"
                onClick={(e) => {
                  const video = e.currentTarget.parentElement?.querySelector('video') as HTMLVideoElement;
                  if (video) {
                    if (video.paused) {
                      video.play();
                    } else {
                      video.pause();
                    }
                  }
                }}
              >
                <div className="bg-white/90 dark:bg-gray-800/90 rounded-full p-4 shadow-lg">
                  <PlayIcon className="w-8 h-8 text-primary-600 dark:text-primary-400" />
                </div>
              </div>
              <div className="absolute bottom-2 right-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const video = e.currentTarget.closest('.relative')?.querySelector('video') as HTMLVideoElement;
                    if (video) {
                      video.requestFullscreen?.();
                    }
                  }}
                  className="bg-black/60 text-white px-2 py-1 rounded text-xs hover:bg-black/80"
                  title="Fullscreen"
                >
                  Fullscreen
                </button>
              </div>
            </>
          )}
          {isGenerating && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
              <RefreshIcon className="w-6 h-6 text-white animate-spin" />
            </div>
          )}
          </div>
          
          {/* Additional Images (Multi-image support) */}
          {mediaItem.type === 'image' && mediaItem.additionalImages && mediaItem.additionalImages.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-2">
              {mediaItem.additionalImages.map((additionalImg) => (
            <div key={additionalImg.id} className="relative group aspect-square">
                  <img
                    src={additionalImg.previewUrl}
                    alt="Additional image"
                    className="w-full h-full object-contain rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800"
                  />
                  <button
                    onClick={() => handleRemoveAdditionalImage(additionalImg.id)}
                    className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove image"
                  >
                    <TrashIcon className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {/* Add More Images Button (only for image posts) */}
          {mediaItem.type === 'image' && (
            <button
              onClick={() => {
                const additionalInput = document.createElement('input');
                additionalInput.type = 'file';
                additionalInput.accept = 'image/*';
                additionalInput.onchange = (e) => {
                  const target = e.target as HTMLInputElement;
                  if (target.files && target.files[0]) {
                    const fakeEvent = {
                      target: { files: target.files, value: '' },
                    } as React.ChangeEvent<HTMLInputElement>;
                    handleFileChange(fakeEvent, true);
                  }
                };
                additionalInput.click();
              }}
              className="w-full py-2 px-3 text-xs border border-dashed border-primary-300 dark:border-primary-600 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors flex items-center justify-center gap-2"
            >
              <PlusIcon className="w-4 h-4" />
              Add More Images
            </button>
          )}
        </div>
      ) : (
        <div className="mb-3">
          <div className="flex gap-2">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex flex-col items-center justify-center h-20 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <PlusIcon className="w-6 h-6 text-gray-400 dark:text-primary-500" />
              <span className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Upload
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMediaLibraryModal(true);
              }}
              className="flex-1 flex flex-col items-center justify-center h-20 border-2 border-dashed border-primary-300 dark:border-primary-600 bg-primary-50 dark:bg-primary-900/20 rounded-lg cursor-pointer hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
              title="Select from My Vault"
            >
              <ImageIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
              <span className="text-xs text-primary-600 dark:text-primary-400 mt-1">
                My Vault
              </span>
            </button>
          </div>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="image/*,video/*"
      />

      {/* Goal & Tone */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Goal
          </label>
          <select
            value={mediaItem.postGoal}
            onChange={e => onUpdate(index, { postGoal: e.target.value })}
            className="w-full text-xs p-1.5 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm"
          >
            {goalOptions.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Tone
          </label>
          <select
            value={mediaItem.postTone}
            onChange={e => onUpdate(index, { postTone: e.target.value })}
            className="w-full text-xs p-1.5 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm"
          >
            {toneOptions.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Personality & Hashtag Toggle Buttons */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
          AI Generation Options
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onTogglePersonality}
            disabled={!creatorPersonality}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
              usePersonality
                ? 'bg-primary-600 text-white hover:bg-primary-700'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            } ${!creatorPersonality ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={!creatorPersonality ? 'Add a personality description in Settings to enable' : undefined}
          >
            <SparklesIcon className="w-3.5 h-3.5" />
            Personality
          </button>
          <button
            onClick={onToggleHashtags}
            disabled={!favoriteHashtags}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
              useFavoriteHashtags
                ? 'bg-primary-600 text-white hover:bg-primary-700'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            } ${!favoriteHashtags ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={!favoriteHashtags ? 'Add favorite hashtags in Settings to enable' : undefined}
          >
            <HashtagIcon className="w-3.5 h-3.5" />
            Hashtags
          </button>
        </div>
        <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
          {usePersonality && useFavoriteHashtags
            ? 'AI will use your personality and favorite hashtags.'
            : usePersonality
            ? 'AI will use your creator personality.'
            : useFavoriteHashtags
            ? 'AI will use your favorite hashtags.'
            : 'Enable toggles to include personality or hashtags.'}
        </p>
      </div>

      {/* Platform Selection - Single Select - Moved below Goal & Tone */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
          Plan for platform (select one)
        </label>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(platformIcons) as Platform[]).map(platform => {
            const isSelected = mediaItem.selectedPlatforms?.[platform] === true;
            return (
              <button
                key={platform}
                onClick={() => {
                  // Single select: only this platform is selected, all others are false
                  const updates: Partial<MediaItemState> = {
                    selectedPlatforms: {
                      Instagram: false,
                      TikTok: false,
                      X: false,
                      Threads: false,
                      YouTube: false,
                      LinkedIn: false,
                      Facebook: false,
                      Pinterest: false,
                      [platform]: true,
                    },
                  };
                  // Reset Instagram post type if switching away from Instagram
                  if (mediaItem.selectedPlatforms?.Instagram && platform !== 'Instagram') {
                    updates.instagramPostType = undefined;
                  }
                  // Auto-set Instagram post type based on media type when Instagram is selected
                  if (platform === 'Instagram' && !mediaItem.instagramPostType) {
                    updates.instagramPostType = mediaItem.type === 'video' ? 'Reel' : 'Post';
                  }
                  onUpdate(index, updates);
                }}
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
        {mediaItem.selectedPlatforms && Object.values(mediaItem.selectedPlatforms).every(p => !p) && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Please select a platform to generate platform-optimized captions</p>
        )}
      </div>

      {/* Instagram Post Type Selection */}
      {mediaItem.selectedPlatforms?.Instagram && (
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
            Instagram Post Type
          </label>
          <div className="flex gap-1.5">
            {(['Post', 'Reel', 'Story'] as const).map(postType => (
              <button
                key={postType}
                onClick={() => {
                  onUpdate(index, { instagramPostType: postType });
                }}
                className={`flex-1 px-2 py-1.5 rounded text-xs border transition-colors ${
                  mediaItem.instagramPostType === postType
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium'
                    : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                {postType}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Generate Button - Always visible when media exists */}
      {mediaItem.previewUrl && (
        <button
          onClick={handleGenerate}
          disabled={!canGenerate || isGenerating}
          className="w-full mb-3 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800 rounded-md hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors disabled:opacity-50"
        >
          <RefreshIcon className={`w-3 h-3 ${isGenerating ? 'animate-spin' : ''}`} />
          {isGenerating
            ? 'Generating...'
            : (mediaItem.additionalImages && mediaItem.additionalImages.length > 0
              ? '(Re)Generate Captions (summarize carousel)'
              : '(Re)Generate Captions')}
        </button>
      )}

      {/* Caption Results */}
      {mediaItem.results.length > 0 && (
        <div className="mb-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              AI Suggestions
            </span>
          </div>
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {mediaItem.results.slice(0, 2).map((result, idx) => (
              <button
                key={idx}
                onClick={() => handleSelectCaption(result)}
                className={`w-full text-left p-2 text-xs rounded transition-colors ${
                  mediaItem.captionText ===
                  result.caption + '\n\n' + (result.hashtags || []).join(' ')
                    ? 'bg-primary-100 dark:bg-primary-900/50 border border-primary-300 dark:border-primary-700'
                    : 'bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <p className="text-gray-800 dark:text-gray-200 line-clamp-2">
                  {result.caption}
                </p>
                {result.hashtags && result.hashtags.length > 0 && (
                  <p className="text-primary-600 dark:text-primary-400 mt-1 text-xs truncate">
                    {result.hashtags.join(' ')}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* AI Action Buttons - Always visible for Pro/Elite+ (Predict/Repurpose require media uploaded) */}
      {user && user.plan !== 'Free' && (
        <div className="mb-3 flex flex-wrap gap-2">
          {/*
            Match OnlyFans Studio button colors:
            - Gaps: purple -> indigo
            - Predict: blue -> cyan
            - Repurpose: emerald -> teal
          */}
          <button
            onClick={() => {
              if (onAnalyzeContentGaps) {
                onAnalyzeContentGaps();
              }
            }}
            disabled={
              isAnalyzingGaps ||
              !user ||
              ((user.plan !== 'Pro' && user.plan !== 'Elite' && user.plan !== 'Agency' && user.plan !== 'OnlyFansStudio' && user.role !== 'Admin'))
            }
            className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all shadow-sm flex items-center justify-center gap-1 ${
              (!user || (user.plan !== 'Pro' && user.plan !== 'Elite' && user.plan !== 'Agency' && user.plan !== 'OnlyFansStudio' && user.role !== 'Admin'))
                ? 'text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-50'
                : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            {isAnalyzingGaps ? (
              <>
                <RefreshIcon className="w-3 h-3 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <SparklesIcon className="w-3 h-3" />
                {user?.plan === 'Pro'
                  ? `What's Missing (${user.monthlyContentGapsUsed || 0}/2)`
                  : "What's Missing"}
              </>
            )}
          </button>
          <button
            onClick={async () => {
              if (!user) return;

              const monthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
              const monthChanged = user.composeInsightsUsageMonth !== monthKey;
              const used = monthChanged ? 0 : (user.monthlyPredictionsUsed || 0);
              const limit = user.role === 'Admin' || user.plan === 'Elite' || user.plan === 'Agency' || user.plan === 'OnlyFansStudio'
                ? Infinity
                : user.plan === 'Pro'
                  ? 5
                  : 0;

              if (limit === 0) {
                showToast('Upgrade to Pro or Elite to unlock What To Post Next', 'info');
                setActivePage('pricing');
                return;
              }
              if (isFinite(limit) && used >= limit) {
                showToast('Monthly What To Post Next limit reached. Upgrade to Elite for unlimited access.', 'info');
                setActivePage('pricing');
                return;
              }
              setIsGenerating(true);
              try {
                const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
                const selectedPlatform = (Object.keys(mediaItem.selectedPlatforms || {}) as Platform[]).find(
                  p => mediaItem.selectedPlatforms?.[p]
                );
                if (!selectedPlatform) {
                  showToast('Please select a platform first', 'error');
                  setIsGenerating(false);
                  return;
                }
                const adultPlatforms = ['OnlyFans', 'Fansly', 'Fanvue'];
                const isAdultPlatform = adultPlatforms.includes(selectedPlatform);
                const rawNiche = user?.userType === 'Business'
                  ? (user as any)?.businessType
                  : user?.niche;
                const stripAdultPlatforms = (value: string) =>
                  value.replace(/onlyfans|fansly|fanvue/gi, '').replace(/\s+/g, ' ').trim();
                const safeNiche = isAdultPlatform
                  ? (rawNiche || 'Adult Content Creator')
                  : (rawNiche ? stripAdultPlatforms(String(rawNiche)) : '');
                const safeRecentContent = !isAdultPlatform && mediaItem.captionText
                  ? stripAdultPlatforms(mediaItem.captionText)
                  : mediaItem.captionText;

                const response = await fetch('/api/whatToPostNext', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  },
                  body: JSON.stringify({
                    platform: selectedPlatform,
                    niche: safeNiche,
                    tone: mediaItem.postTone,
                    goal: mediaItem.postGoal,
                    recentContent: safeRecentContent || undefined,
                  }),
                });
                if (!response.ok) {
                  const err = await response.json().catch(() => ({}));
                  throw new Error(err?.error || 'Failed to generate what to post next');
                }
                const data = await response.json();
                if (data.success) {
                  // Optimistically bump local usage
                if (user) {
                  const newMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
                  const monthChanged2 = user.composeInsightsUsageMonth !== newMonthKey;
                  const base: any = monthChanged2
                    ? { monthlyContentGapsUsed: 0, monthlyPredictionsUsed: 0, monthlyRepurposesUsed: 0, composeInsightsUsageMonth: newMonthKey }
                    : { composeInsightsUsageMonth: user.composeInsightsUsageMonth || newMonthKey };
                  await setUser({
                    ...user,
                    ...base,
                    monthlyPredictionsUsed: (monthChanged2 ? 0 : (user.monthlyPredictionsUsed || 0)) + 1,
                  });
                }

                  // Save to history
                  await savePredictToHistory({
                    ...data,
                    originalCaption: mediaItem.captionText,
                    platform: selectedPlatform,
                    mediaUrl: mediaItem.previewUrl,
                    mediaType: mediaItem.type,
                  });
                  
                  setPredictResult({
                    ...data,
                    originalCaption: mediaItem.captionText,
                    mediaUrl: mediaItem.previewUrl,
                    mediaType: mediaItem.type,
                  });
                  setShowPredictModal(true);
                  showToast('Ideas ready!', 'success');
                }
              } catch (error: any) {
                showToast(error.message || 'Failed to generate what to post next', 'error');
              } finally {
                setIsGenerating(false);
              }
            }}
            disabled={isGenerating || !user || !mediaItem.previewUrl}
            className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all shadow-sm flex items-center justify-center gap-1 ${
              !mediaItem.previewUrl
                ? 'text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-50'
                : 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-700 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            <SparklesIcon className="w-3 h-3" />
            {user?.plan === 'Pro' ? `What To Post Next (${user.monthlyPredictionsUsed || 0}/5)` : 'What To Post Next'}
          </button>
          <button
            onClick={async () => {
              if (!user) return;

              const monthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
              const monthChanged = user.composeInsightsUsageMonth !== monthKey;
              const used = monthChanged ? 0 : (user.monthlyRepurposesUsed || 0);
              const limit = user.role === 'Admin' || user.plan === 'Elite' || user.plan === 'Agency' || user.plan === 'OnlyFansStudio'
                ? Infinity
                : user.plan === 'Pro'
                  ? 5
                  : 0;

              if (limit === 0) {
                showToast('Upgrade to Pro or Elite to unlock Repurpose', 'info');
                setActivePage('pricing');
                return;
              }
              if (isFinite(limit) && used >= limit) {
                showToast('Monthly Repurpose limit reached. Upgrade to Elite for unlimited access.', 'info');
                setActivePage('pricing');
                return;
              }
              if (!mediaItem.captionText.trim()) {
                showToast('Please add a caption first', 'error');
                return;
              }
              setIsGenerating(true);
              try {
                const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
                const selectedPlatform = (Object.keys(mediaItem.selectedPlatforms || {}) as Platform[]).find(
                  p => mediaItem.selectedPlatforms?.[p]
                );
                if (!selectedPlatform) {
                  showToast('Please select a platform first', 'error');
                  setIsGenerating(false);
                  return;
                }
                const response = await fetch('/api/repurposeContent', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  },
                  body: JSON.stringify({
                    originalContent: mediaItem.captionText,
                    originalPlatform: selectedPlatform,
                    targetPlatforms: ['Instagram', 'TikTok', 'X', 'LinkedIn', 'Facebook', 'Threads', 'YouTube'],
                    niche: user?.niche || '',
                    tone: mediaItem.postTone,
                    goal: mediaItem.postGoal,
                    mediaType: mediaItem.type,
                  }),
                });
                if (!response.ok) {
                  const err = await response.json().catch(() => ({}));
                  throw new Error(err?.error || 'Failed to repurpose content');
                }
                const data = await response.json();
                if (data.success && data.repurposedContent) {
                  // Optimistically bump local usage
                if (user) {
                  const newMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
                  const monthChanged2 = user.composeInsightsUsageMonth !== newMonthKey;
                  const base: any = monthChanged2
                    ? { monthlyContentGapsUsed: 0, monthlyPredictionsUsed: 0, monthlyRepurposesUsed: 0, composeInsightsUsageMonth: newMonthKey }
                    : { composeInsightsUsageMonth: user.composeInsightsUsageMonth || newMonthKey };
                  await setUser({
                    ...user,
                    ...base,
                    monthlyRepurposesUsed: (monthChanged2 ? 0 : (user.monthlyRepurposesUsed || 0)) + 1,
                  });
                }

                  // Save to history
                  await saveRepurposeToHistory({
                    ...data,
                    originalContent: mediaItem.captionText,
                    originalPlatform: selectedPlatform,
                    mediaUrl: mediaItem.previewUrl,
                    mediaType: mediaItem.type,
                  });
                  
                  setRepurposeResult(data);
                  setShowRepurposeModal(true);
                  showToast('Content repurposed!', 'success');
                }
              } catch (error: any) {
                showToast(error.message || 'Failed to repurpose content', 'error');
              } finally {
                setIsGenerating(false);
              }
            }}
            disabled={isGenerating || !user || !mediaItem.previewUrl}
            className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1 ${
              !mediaItem.previewUrl
                ? 'text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-50'
                : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            <SparklesIcon className="w-3 h-3" />
            {user?.plan === 'Pro' ? `Repurpose (${user.monthlyRepurposesUsed || 0}/5)` : 'Repurpose'}
          </button>
        </div>
      )}

      {/* Caption Input */}
      <div className="relative mb-3">
        <textarea
          ref={captionTextareaRef}
          value={mediaItem.captionText}
          onChange={e => onUpdate(index, { captionText: e.target.value })}
          placeholder="Write caption or select AI suggestion..."
          rows={4}
          className="w-full p-2.5 pr-20 text-sm border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 resize-y"
        />
        <div className="absolute right-2 top-2 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => {
              if (mediaItem.captionText) {
                navigator.clipboard.writeText(mediaItem.captionText);
                showToast('Caption copied to clipboard!', 'success');
              }
            }}
            disabled={!mediaItem.captionText || !mediaItem.captionText.trim()}
            className="p-1 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Copy caption"
          >
            <CopyIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsAiHelpOpen(!isAiHelpOpen)}
            className="p-1 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
            title="AI Help - Tell AI what you want"
          >
            <SparklesIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
            className="emoji-button p-1 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
            title="Add emoji"
          >
            <EmojiIcon className="w-4 h-4" />
          </button>
        </div>
        {isAiHelpOpen && (
          <div
            ref={aiHelpRef}
            className="absolute z-20 right-0 top-full mt-1 w-96 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 border border-gray-200 dark:border-gray-600"
          >
            <div className="mb-3">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">AI Help</h4>
              <p className="text-xs text-gray-600 dark:text-gray-400">Describe what you want in your caption, and AI will write it for you.</p>
            </div>
            <textarea
              value={aiHelpPrompt}
              onChange={(e) => setAiHelpPrompt(e.target.value)}
              placeholder="e.g., 'Write a fun caption about my new product launch', 'Create a motivational post about fitness', 'Write an engaging caption for my travel photo'"
              rows={3}
              className="w-full p-2 text-sm border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 resize-y mb-2"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAiHelpGenerate}
                disabled={!aiHelpPrompt.trim() || isAiHelpGenerating}
                className="flex-1 px-3 py-2 text-xs font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
              >
                {isAiHelpGenerating ? (
                  <>
                    <RefreshIcon className="w-3 h-3 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <SparklesIcon className="w-3 h-3" />
                    Generate Text
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setIsAiHelpOpen(false);
                  setAiHelpPrompt('');
                }}
                className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {isEmojiPickerOpen && (
          <div
            ref={emojiPickerRef}
            className="emoji-picker-container absolute z-20 right-0 top-full mt-1 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-2 flex flex-col border border-gray-200 dark:border-gray-600"
          >
            <div className="px-1 pb-2">
              <input
                type="text"
                placeholder="Search emojis..."
                value={emojiSearchTerm}
                onChange={e => setEmojiSearchTerm(e.target.value)}
                className="w-full p-2 border rounded-md bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-sm"
              />
            </div>
            <div className="grid grid-cols-8 gap-1 overflow-y-auto max-h-64 pr-1 scrollbar-thin">
              {filteredEmojis.map(({ emoji, description }) => (
                <button
                  key={description}
                  type="button"
                  onClick={() => handleEmojiSelect(emoji)}
                  className="text-2xl p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 flex justify-center items-center"
                  title={description}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700 grid grid-cols-7 gap-1">
              {EMOJI_CATEGORIES.map(({name, icon}) => (
                <button 
                  key={name}
                  onClick={() => { setActiveEmojiCategory(name); setEmojiSearchTerm(''); }}
                  className={`p-1.5 rounded-md ${activeEmojiCategory === name && !emojiSearchTerm ? 'bg-primary-100 dark:bg-primary-900/50' : 'hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                  title={name}
                >
                  <span className={activeEmojiCategory === name && !emojiSearchTerm ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'}>
                    {categoryIcons[icon]}
                  </span>
                </button>
              ))}
            </div>
            {/* Copy All Button */}
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => {
                  if (mediaItem.captionText) {
                    navigator.clipboard.writeText(mediaItem.captionText);
                    showToast('Caption copied to clipboard!', 'success');
                  }
                }}
                className="w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md flex items-center justify-center gap-2 transition-colors"
                disabled={!mediaItem.captionText || !mediaItem.captionText.trim()}
              >
                <CopyIcon className="w-4 h-4" />
                Copy All
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Music Selection for Videos - Hidden for now */}
      {false && mediaItem.type === 'video' && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Music Track
            </label>
            <button
              onClick={() => setShowMusicModal(true)}
              className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-1"
            >
              {mediaItem.selectedMusic ? 'Change' : 'Select Music'}
            </button>
          </div>
          {mediaItem.selectedMusic ? (
            <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-md text-xs">
              <div className="font-medium text-gray-800 dark:text-gray-200">{mediaItem.selectedMusic?.name}</div>
              <div className="text-gray-600 dark:text-gray-400">{mediaItem.selectedMusic?.artist}</div>
              {mediaItem.selectedMusic?.genre && (
                <div className="text-gray-500 dark:text-gray-500 mt-1">
                  {mediaItem.selectedMusic?.genre} • {mediaItem.selectedMusic?.mood}
                </div>
              )}
              <button
                onClick={() => onUpdate(index, { selectedMusic: undefined })}
                className="mt-1 text-xs text-red-600 dark:text-red-400 hover:text-red-700"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="p-2 bg-gray-50 dark:bg-gray-700 rounded-md text-xs text-gray-600 dark:text-gray-400">
              No music selected. Click "Select Music" to add royalty-free music.
            </div>
          )}
          {/* Instagram Reels Note */}
          {mediaItem.selectedPlatforms?.Instagram && (
            <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md text-xs text-yellow-800 dark:text-yellow-200">
              <strong>Note:</strong> For Instagram Reels, you'll need to add music manually when posting. Instagram's music library is only available in the Instagram app. This selected music can be embedded into your video file.
            </div>
          )}
        </div>
      )}

      {/* Schedule Date/Time Picker */}
      <div className={`mb-3 ${user?.plan === 'Free' ? 'opacity-50' : ''}`}>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Schedule Date & Time
        </label>
        <input
          type="datetime-local"
          value={mediaItem.scheduledDate ? (() => {
            // Convert ISO string to local datetime-local format
            const date = new Date(mediaItem.scheduledDate);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const formatted = `${year}-${month}-${day}T${hours}:${minutes}`;
            console.log('MediaBox: Formatting date for input:', {
              scheduledDate: mediaItem.scheduledDate,
              dateObject: date.toString(),
              year,
              month,
              day,
              hours,
              minutes,
              formatted
            });
            return formatted;
          })() : ''}
          onChange={(e) => {
            if (user?.plan === 'Free') {
              showToast('Upgrade to Pro or Elite to schedule posts', 'info');
              setActivePage('pricing');
              return;
            }
            if (e.target.value) {
              const date = new Date(e.target.value);
              onUpdate(index, { scheduledDate: date.toISOString() });
            } else {
              onUpdate(index, { scheduledDate: undefined });
            }
          }}
          disabled={user?.plan === 'Free'}
          className={`w-full p-1.5 text-xs border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white ${
            user?.plan === 'Free' ? 'cursor-not-allowed opacity-50' : ''
          }`}
          title={user?.plan === 'Free' ? 'Upgrade to Pro or Elite to schedule posts' : ''}
        />
        {mediaItem.scheduledDate && (
          <div className="mt-1 flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
            <CalendarIcon className="w-3 h-3" />
            <span>
              {new Date(mediaItem.scheduledDate).toLocaleString([], {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </span>
          </div>
        )}
      </div>



      {/* Preview Button - Always visible if media exists */}
      {mediaItem.previewUrl && (
        <button
          onClick={() => onPreview(index)}
          className="w-full mb-3 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          <MobileIcon className="w-3 h-3" /> Preview
        </button>
      )}

      {/* Action Buttons - Compact row: Draft, Schedule, Publish (admin) */}
      <div className="flex flex-col gap-2">
        <div className={`grid gap-1.5 ${user?.role === 'Admin' && user?.plan !== 'Caption' ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <button
            onClick={() => {
              if (user?.plan === 'Free') {
                if (onUpgradeClick) {
                  onUpgradeClick();
                } else {
                  showToast('Upgrade to Pro or Elite to save drafts to calendar', 'info');
                  setActivePage('pricing');
                }
                return;
              }
              onSaveToWorkflow(index, 'Draft');
            }}
            disabled={platformsToPost.length === 0 || user?.plan === 'Free'}
            className={`flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-medium rounded transition-colors ${
              user?.plan === 'Free'
                ? 'text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-50'
                : 'text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50'
            }`}
            title={user?.plan === 'Free' ? 'Upgrade to Pro or Elite to save drafts to calendar' : (platformsToPost.length === 0 ? 'Select at least one platform' : 'Save as Draft')}
          >
            <ClipboardCheckIcon className="w-2.5 h-2.5 shrink-0" /> Draft
          </button>
          <button
            onClick={() => {
              if (user?.plan === 'Free') {
                if (onUpgradeClick) {
                  onUpgradeClick();
                } else {
                  showToast('Upgrade to Pro or Elite to access the visual calendar view', 'info');
                  setActivePage('pricing');
                }
                return;
              }
              onSaveToWorkflow(index, 'Scheduled');
            }}
            disabled={platformsToPost.length === 0 || user?.plan === 'Free'}
            className={`flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-medium rounded transition-colors ${
              user?.plan === 'Free'
                ? 'text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-50'
                : 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50'
            }`}
            title={user?.plan === 'Free' ? 'Upgrade to Pro or Elite to access the visual calendar view' : (platformsToPost.length === 0 ? 'Select at least one platform' : 'Add to Calendar')}
          >
            <CalendarIcon className="w-2.5 h-2.5 shrink-0" /> Schedule
          </button>
          {user?.role === 'Admin' && user?.plan !== 'Caption' && (
            <button
              onClick={() => onPublish(index)}
              disabled={platformsToPost.length === 0}
              className="flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-medium text-white bg-green-600 rounded hover:bg-green-700 transition-colors disabled:opacity-50"
              title={platformsToPost.length === 0 ? 'Select at least one platform' : 'Publish to social'}
            >
              <SendIcon className="w-2.5 h-2.5 shrink-0" /> Publish
            </button>
          )}
        </div>
        {false && user?.plan === 'Caption' && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-blue-800 dark:text-blue-200">
              <strong>Caption Pro:</strong> This plan is for caption generation only. Select platforms to get platform-specific hashtags. Upgrade to publish/schedule posts.
            </p>
          </div>
        )}
        {/* AI Auto Schedule button (hidden in offline AI Studio mode) */}
        {false && onAIAutoSchedule && (
          <button
            onClick={() => {
              onAIAutoSchedule?.(index);
            }}
            disabled={!mediaItem.previewUrl || !mediaItem.captionText.trim() || platformsToPost.length === 0}
            className="w-full flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
            title={!mediaItem.previewUrl || !mediaItem.captionText.trim() ? 'Add media and caption first' : platformsToPost.length === 0 ? 'Select at least one platform' : 'AI Auto Schedule'}
          >
            <SparklesIcon className="w-3 h-3" /> AI Auto Schedule
          </button>
        )}
      </div>

      {/* My Vault Modal */}
      {showMediaLibraryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Select from My Vault</h3>
              <button
                onClick={() => setShowMediaLibraryModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {isLoadingLibrary ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshIcon className="w-8 h-8 animate-spin text-primary-600" />
                </div>
              ) : libraryMediaItems.length === 0 ? (
                <div className="text-center py-12">
                  <ImageIcon className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                  <p className="text-gray-600 dark:text-gray-400 mb-4">No media in your library yet.</p>
                  <button
                    onClick={() => {
                      setShowMediaLibraryModal(false);
                      setActivePage('mediaLibrary');
                    }}
                    className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                  >
                    Go to My Vault
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {libraryMediaItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleSelectFromLibrary(item)}
                      className="relative group cursor-pointer rounded-lg overflow-hidden border-2 border-gray-200 dark:border-gray-700 hover:border-primary-500 transition-colors"
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
                      <div className="absolute top-2 right-2">
                        {item.type === 'video' ? (
                          <VideoIcon className="w-5 h-5 text-white bg-black/50 rounded p-1" />
                        ) : (
                          <ImageIcon className="w-5 h-5 text-white bg-black/50 rounded p-1" />
                        )}
                      </div>
                      <div className="p-2 bg-white dark:bg-gray-800">
                        <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                          {item.name}
                        </p>
                      </div>
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-white font-medium text-sm">Click to Select</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Music Selection Modal */}
      {showMusicModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Select Music Track</h3>
              <button
                onClick={() => {
                  setShowMusicModal(false);
                  setMusicSearchQuery('');
                  setSelectedMusicGenre('');
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {/* Search and Filter */}
              <div className="mb-4 space-y-3">
                <input
                  type="text"
                  placeholder="Search music..."
                  value={musicSearchQuery}
                  onChange={e => setMusicSearchQuery(e.target.value)}
                  className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-sm"
                />
                <select
                  value={selectedMusicGenre}
                  onChange={e => setSelectedMusicGenre(e.target.value)}
                  className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-sm"
                >
                  <option value="">All Genres</option>
                  {getMusicGenres().map(genre => (
                    <option key={genre} value={genre}>{genre}</option>
                  ))}
                </select>
              </div>

              {/* Music Tracks List */}
              <div className="space-y-2">
                {(musicSearchQuery
                  ? searchMusicTracks(musicSearchQuery)
                  : getMusicTracks(selectedMusicGenre ? { genre: selectedMusicGenre } : undefined)
                ).map(track => (
                  <div
                    key={track.id}
                    className={`w-full p-3 rounded-lg border transition-colors ${
                      mediaItem.selectedMusic?.id === track.id
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 dark:text-white">{track.name}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">{track.artist}</div>
                        {track.genre && track.mood && (
                          <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            {track.genre} • {track.mood}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Play/Pause Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (playingMusicId === track.id && musicAudioRef.current) {
                              // Pause current track
                              musicAudioRef.current.pause();
                              musicAudioRef.current = null;
                              setPlayingMusicId(null);
                            } else {
                              // Stop any currently playing track
                              if (musicAudioRef.current) {
                                musicAudioRef.current.pause();
                                musicAudioRef.current = null;
                              }
                              // Play new track
                              const audio = new Audio(track.url);
                              audio.play().catch(err => {
                                console.error('Failed to play audio:', err);
                                showToast('Failed to preview music. Please check the audio URL.', 'error');
                              });
                              audio.addEventListener('ended', () => {
                                setPlayingMusicId(null);
                                musicAudioRef.current = null;
                              });
                              musicAudioRef.current = audio;
                              setPlayingMusicId(track.id);
                            }
                          }}
                          className="p-2 bg-primary-600 hover:bg-primary-700 text-white rounded-full transition-colors"
                          title={playingMusicId === track.id ? 'Pause preview' : 'Preview'}
                        >
                          {playingMusicId === track.id ? (
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                            </svg>
                          ) : (
                            <PlayIcon className="w-4 h-4" />
                          )}
                        </button>
                        {/* Select Button */}
                        <button
                          onClick={() => {
                            // Stop any playing music
                            if (musicAudioRef.current) {
                              musicAudioRef.current.pause();
                              musicAudioRef.current = null;
                            }
                            setPlayingMusicId(null);
                            onUpdate(index, { selectedMusic: track });
                            setShowMusicModal(false);
                            setMusicSearchQuery('');
                            setSelectedMusicGenre('');
                            showToast(`Selected: ${track.name}`, 'success');
                          }}
                          className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs rounded-md transition-colors"
                        >
                          Select
                        </button>
                        <div className="text-xs text-gray-500 dark:text-gray-500">
                          {Math.floor(track.duration)}s
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Info Note */}
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md text-xs text-blue-800 dark:text-blue-200">
                <strong>Note:</strong> These are royalty-free tracks. For Instagram Reels, you may need to add music manually when posting, as Instagram's music library is only available in the Instagram app.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Predict Modal */}
      {showPredictModal && predictResult && (
        <PredictModal
          result={predictResult}
          onClose={() => {
            setShowPredictModal(false);
            // Trigger history reload in parent (Compose)
            window.dispatchEvent(new CustomEvent('composeHistoryReload'));
          }}
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
          onClose={() => {
            setShowRepurposeModal(false);
            // Trigger history reload in parent (Compose)
            window.dispatchEvent(new CustomEvent('composeHistoryReload'));
          }}
          onCopy={(text) => {
            navigator.clipboard.writeText(text);
            showToast('Copied to clipboard!', 'success');
          }}
        />
      )}
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

          <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end">
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
            OK
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
            OK
          </button>
        </div>
      </div>
    </div>
  );
};
