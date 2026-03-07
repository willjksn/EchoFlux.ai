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

/** Platforms shown in "Plan for platform" selector: Instagram, X, Facebook, and My Page only */
const PLAN_PLATFORM_KEYS: (Platform | 'My Page')[] = ['Instagram', 'X', 'Facebook', 'My Page'];
const planPlatformIcons: Record<string, React.ReactNode> = {
  Instagram: <InstagramIcon />,
  X: <XIcon />,
  Facebook: <FacebookIcon />,
  'My Page': <HeartIcon className="w-5 h-5" />,
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
    if (results.length === 0) return '';
    const caption = results[0].caption || '';
    const hashtags = (results[0].hashtags || []).join(' ').trim();
    // Only add hashtags section if there are hashtags (My Page/Fan Hub won't have them)
    return hashtags ? `${caption}\n\n${hashtags}` : caption;
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
      
      const { firstCaptionText } = await generateCaptionsForSingleUrl(finalMediaUrl, selectedPlatform);

      // Only set captionText - don't populate results (AI Suggestions panel)
      // AI Suggestions should only show when user explicitly asks for AI help
      onUpdate(index, {
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
      
      // Only set captionText - don't populate results (AI Suggestions panel)
      // AI Suggestions should only show when user explicitly asks for AI help
      onUpdate(index, {
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
    <div className={`bg-white dark:bg-gray-900 rounded-2xl shadow-lg overflow-hidden transition-all w-full border border-gray-200 dark:border-gray-700 ${
      isSelected 
        ? 'ring-2 ring-primary-500 ring-offset-2 dark:ring-offset-gray-900' 
        : 'hover:shadow-xl hover:border-gray-300 dark:hover:border-gray-600'
    }`}>
      {/* App-like Header Bar */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800 px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-indigo-600 flex items-center justify-center">
            <SendIcon className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">New Post</span>
        </div>
        <button
          onClick={() => onRemove(index)}
          className="p-2 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
          title="Remove"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Media Preview */}
        {mediaItem.previewUrl ? (
        <div className="mb-4">
          {/* Primary Image/Video */}
          <div className="relative w-full min-h-48 max-h-[400px] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-xl overflow-hidden mb-3 flex items-center justify-center shadow-inner">
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
        <div className="mb-4">
          <div className="grid grid-cols-2 gap-3">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="group flex flex-col items-center justify-center h-32 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-xl cursor-pointer hover:from-primary-50 hover:to-indigo-50 dark:hover:from-primary-900/30 dark:hover:to-indigo-900/30 transition-all border border-gray-200 dark:border-gray-600 hover:border-primary-300 dark:hover:border-primary-600 shadow-sm hover:shadow-md"
            >
              <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-600 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/50 flex items-center justify-center mb-2 transition-colors">
                <UploadIcon className="w-6 h-6 text-gray-500 dark:text-gray-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors" />
              </div>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                Upload
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Photo or Video</span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMediaLibraryModal(true);
              }}
              className="group flex flex-col items-center justify-center h-32 bg-gradient-to-br from-primary-50 to-indigo-50 dark:from-primary-900/20 dark:to-indigo-900/20 rounded-xl cursor-pointer hover:from-primary-100 hover:to-indigo-100 dark:hover:from-primary-900/40 dark:hover:to-indigo-900/40 transition-all border border-primary-200 dark:border-primary-700 hover:border-primary-400 dark:hover:border-primary-500 shadow-sm hover:shadow-md"
              title="Select from My Vault"
            >
              <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/50 group-hover:bg-primary-200 dark:group-hover:bg-primary-800/50 flex items-center justify-center mb-2 transition-colors">
                <ImageIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
              </div>
              <span className="text-sm font-medium text-primary-600 dark:text-primary-400">
                My Vault
              </span>
              <span className="text-xs text-primary-500 dark:text-primary-500 mt-0.5">Saved Media</span>
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

      {/* Settings Section - Collapsible style */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 mb-4 space-y-3">
        {/* Goal & Tone - Pill style selectors */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
              Goal
            </label>
            <div className="flex flex-wrap gap-1.5">
              {goalOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => onUpdate(index, { postGoal: opt.value })}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    mediaItem.postGoal === opt.value
                      ? 'bg-primary-600 text-white shadow-md'
                      : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:border-primary-300 dark:hover:border-primary-500'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
              Tone
            </label>
            <div className="flex flex-wrap gap-1.5">
              {toneOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => onUpdate(index, { postTone: opt.value })}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    mediaItem.postTone === opt.value
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:border-indigo-300 dark:hover:border-indigo-500'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* AI Options - Toggle switches style */}
        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
            AI Enhancements
          </label>
          <div className="flex gap-2">
            <button
              onClick={onTogglePersonality}
              disabled={!creatorPersonality}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 ${
                usePersonality
                  ? 'bg-gradient-to-r from-primary-500 to-indigo-500 text-white shadow-md'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:border-primary-300'
              } ${!creatorPersonality ? 'opacity-40 cursor-not-allowed' : ''}`}
              title={!creatorPersonality ? 'Add a personality description in Settings to enable' : 'Include your personality in AI generation'}
            >
              <SparklesIcon className="w-4 h-4" />
              Personality
              {usePersonality && <CheckCircleIcon className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={onToggleHashtags}
              disabled={!favoriteHashtags}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 ${
                useFavoriteHashtags
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:border-indigo-300'
              } ${!favoriteHashtags ? 'opacity-40 cursor-not-allowed' : ''}`}
              title={!favoriteHashtags ? 'Add favorite hashtags in Settings to enable' : 'Include your hashtags in AI generation'}
            >
              <span className="w-4 h-4 inline-flex"><HashtagIcon /></span>
              Hashtags
              {useFavoriteHashtags && <CheckCircleIcon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Platform Selection - Modern card style */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
          Platform
        </label>
        <div className="grid grid-cols-4 gap-2">
          {PLAN_PLATFORM_KEYS.map(platformOrMyPage => {
            const isSelected = mediaItem.selectedPlatforms?.[platformOrMyPage as Platform] === true;
            return (
              <button
                key={platformOrMyPage}
                onClick={() => {
                  if (platformOrMyPage === 'My Page') {
                    onUpdate(index, {
                      selectedPlatforms: {
                        Instagram: false,
                        TikTok: false,
                        X: false,
                        Threads: false,
                        YouTube: false,
                        LinkedIn: false,
                        Facebook: false,
                        Pinterest: false,
                        'My Page': true,
                      },
                      instagramPostType: undefined,
                    });
                    return;
                  }
                  const platform = platformOrMyPage as Platform;
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
                      'My Page': false,
                      [platform]: true,
                    },
                  };
                  if (mediaItem.selectedPlatforms?.Instagram && platform !== 'Instagram') {
                    updates.instagramPostType = undefined;
                  }
                  if (platform === 'Instagram' && !mediaItem.instagramPostType) {
                    updates.instagramPostType = mediaItem.type === 'video' ? 'Reel' : 'Post';
                  }
                  onUpdate(index, updates);
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all ${
                  isSelected
                    ? 'bg-gradient-to-br from-primary-500 to-indigo-600 text-white shadow-lg scale-105'
                    : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-primary-300 dark:hover:border-primary-500 hover:shadow-md'
                }`}
              >
                <span className={`w-6 h-6 flex items-center justify-center mb-1 ${isSelected ? 'text-white' : ''}`}>{planPlatformIcons[platformOrMyPage]}</span>
                <span className="text-xs font-medium">{platformOrMyPage}</span>
              </button>
            );
          })}
        </div>
        {mediaItem.selectedPlatforms && Object.values(mediaItem.selectedPlatforms).every(p => !p) && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 text-center bg-amber-50 dark:bg-amber-900/20 rounded-lg py-2">Select a platform for optimized captions</p>
        )}
      </div>

      {/* Instagram Post Type Selection */}
      {mediaItem.selectedPlatforms?.Instagram && (
        <div className="mb-4 bg-gradient-to-r from-pink-50 to-purple-50 dark:from-pink-900/20 dark:to-purple-900/20 rounded-xl p-3">
          <label className="block text-xs font-semibold text-pink-600 dark:text-pink-400 uppercase tracking-wide mb-2">
            Instagram Format
          </label>
          <div className="flex gap-2">
            {(['Post', 'Reel', 'Story'] as const).map(postType => {
              const icons: Record<string, string> = { Post: '📷', Reel: '🎬', Story: '○' };
              return (
                <button
                  key={postType}
                  onClick={() => {
                    onUpdate(index, { instagramPostType: postType });
                  }}
                  className={`flex-1 flex flex-col items-center py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                    mediaItem.instagramPostType === postType
                      ? 'bg-gradient-to-br from-pink-500 to-purple-600 text-white shadow-md'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-pink-200 dark:border-pink-800 hover:border-pink-400'
                  }`}
                >
                  <span className="text-lg mb-0.5">{icons[postType]}</span>
                  {postType}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Caption Input - Modern card style */}
      <div className="relative mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
            Caption
          </label>
          <button
            type="button"
            onClick={() => setIsAiHelpOpen(!isAiHelpOpen)}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 rounded-full hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
            title="AI Help - Tell AI what you want"
          >
            <SparklesIcon className="w-3.5 h-3.5" />
            AI Help
          </button>
        </div>
        <div className="relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden shadow-sm focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent">
          <textarea
            ref={captionTextareaRef}
            value={mediaItem.captionText}
            onChange={e => onUpdate(index, { captionText: e.target.value })}
            placeholder="Write your caption here..."
            rows={4}
            className="w-full p-3 pr-14 text-sm bg-transparent border-none focus:ring-0 dark:text-white dark:placeholder-gray-400 resize-y"
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
              className="p-2 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:text-primary-400 dark:hover:bg-primary-900/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Copy caption"
            >
              <CopyIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
              className="emoji-button p-2 rounded-lg text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
              title="Add emoji"
            >
              <EmojiIcon className="w-4 h-4" />
            </button>
          </div>
          {/* Character count */}
          <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <span className="text-xs text-gray-400">{mediaItem.captionText?.length || 0} characters</span>
            <span className="text-xs text-gray-400">
              {mediaItem.selectedPlatforms?.Instagram ? '2,200 max' : 
               mediaItem.selectedPlatforms?.X ? '280 max' : 
               mediaItem.selectedPlatforms?.['My Page'] ? 'No limit' : ''}
            </span>
          </div>
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

      {/* Generate Button - Prominent CTA */}
      {mediaItem.previewUrl && (
        <button
          onClick={handleGenerate}
          disabled={!canGenerate || isGenerating}
          className="w-full mb-4 flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-gradient-to-r from-primary-600 to-indigo-600 rounded-xl hover:from-primary-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <RefreshIcon className="w-4 h-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <SparklesIcon className="w-4 h-4" />
              {mediaItem.additionalImages && mediaItem.additionalImages.length > 0
                ? 'Generate Caption for Carousel'
                : 'Generate AI Caption'}
            </>
          )}
        </button>
      )}

      {/* Caption Results - Card style */}
      {mediaItem.results.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <SparklesIcon className="w-4 h-4 text-primary-500" />
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              AI Suggestions
            </span>
          </div>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {mediaItem.results.slice(0, 2).map((result, idx) => {
              const isSelected = mediaItem.captionText === result.caption + '\n\n' + (result.hashtags || []).join(' ');
              return (
                <button
                  key={idx}
                  onClick={() => handleSelectCaption(result)}
                  className={`w-full text-left p-3 rounded-xl transition-all ${
                    isSelected
                      ? 'bg-gradient-to-r from-primary-50 to-indigo-50 dark:from-primary-900/30 dark:to-indigo-900/30 border-2 border-primary-400 dark:border-primary-600 shadow-md'
                      : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-sm'
                  }`}
                >
                  <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-2">
                    {result.caption}
                  </p>
                  {result.hashtags && result.hashtags.length > 0 && (
                    <p className="text-primary-600 dark:text-primary-400 mt-1.5 text-xs truncate">
                      {result.hashtags.join(' ')}
                    </p>
                  )}
                  {isSelected && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-primary-600 dark:text-primary-400 font-medium">
                      <CheckCircleIcon className="w-3.5 h-3.5" />
                      Selected
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* AI Action Buttons - Modern style */}
      {user && user.plan !== 'Free' && (
        <div className="mb-4 p-3 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
            AI Tools
          </label>
          <div className="flex gap-2">
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
                showToast('Upgrade to Pro or Elite to unlock Ideas for this content', 'info');
                setActivePage('pricing');
                return;
              }
              if (isFinite(limit) && used >= limit) {
                showToast('Monthly Ideas for this content limit reached. Upgrade to Elite for unlimited access.', 'info');
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
            className={`flex-1 px-3 py-2.5 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              !mediaItem.previewUrl
                ? 'text-gray-400 dark:text-gray-500 bg-gray-200 dark:bg-gray-700 cursor-not-allowed opacity-50'
                : 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-600 hover:to-cyan-600 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            <LightbulbIcon className="w-4 h-4" />
            <span className="hidden sm:inline">{user?.plan === 'Pro' ? `Ideas (${user.monthlyPredictionsUsed || 0}/5)` : 'Ideas'}</span>
            <span className="sm:hidden">Ideas</span>
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
            className={`flex-1 px-3 py-2.5 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              !mediaItem.previewUrl
                ? 'text-gray-400 dark:text-gray-500 bg-gray-200 dark:bg-gray-700 cursor-not-allowed opacity-50'
                : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            <RefreshIcon className="w-4 h-4" />
            <span className="hidden sm:inline">{user?.plan === 'Pro' ? `Repurpose (${user.monthlyRepurposesUsed || 0}/5)` : 'Repurpose'}</span>
            <span className="sm:hidden">Repurpose</span>
          </button>
          </div>
        </div>
      )}

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

      {/* Action Buttons - Modern bottom bar style */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className={`grid gap-2 ${user?.plan !== 'Caption' ? 'grid-cols-3' : 'grid-cols-2'}`}>
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
            className={`flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl transition-all ${
              user?.plan === 'Free'
                ? 'text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 cursor-not-allowed opacity-50'
                : 'text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 hover:shadow-md disabled:opacity-50'
            }`}
            title={user?.plan === 'Free' ? 'Upgrade to Pro or Elite to save drafts to calendar' : (platformsToPost.length === 0 ? 'Select at least one platform' : 'Save as Draft')}
          >
            <ClipboardCheckIcon className="w-5 h-5" />
            <span className="text-xs font-medium">Draft</span>
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
            className={`flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl transition-all ${
              user?.plan === 'Free'
                ? 'text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 cursor-not-allowed opacity-50'
                : 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:shadow-md disabled:opacity-50'
            }`}
            title={user?.plan === 'Free' ? 'Upgrade to Pro or Elite to access the visual calendar view' : (platformsToPost.length === 0 ? 'Select at least one platform' : 'Add to Calendar')}
          >
            <CalendarIcon className="w-5 h-5" />
            <span className="text-xs font-medium">Schedule</span>
          </button>
          {user?.plan !== 'Caption' && (
            <button
              onClick={() => onPublish(index)}
              disabled={platformsToPost.length === 0}
              className="flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl text-white bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 transition-all hover:shadow-md disabled:opacity-50"
              title={platformsToPost.length === 0 ? 'Select at least one platform' : 'Publish to social'}
            >
              <SendIcon className="w-5 h-5" />
              <span className="text-xs font-medium">Publish</span>
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
