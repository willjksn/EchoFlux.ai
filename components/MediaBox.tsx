import React, { useState, useRef, useMemo, useEffect } from 'react';
import { MediaItemState, CaptionResult, Platform } from '../types';
import { generateCaptions } from '../src/services/geminiService';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, auth } from '../firebaseConfig';

export interface TrendingSound {
  id: string;
  title: string;
  artist?: string;
  hashtags: string[];
  trendStats: {
    usageCount?: number;
    growthRate?: number;
    peakTime?: string;
  };
  instagramUrl: string;
  thumbnail?: string;
}
import {
  UploadIcon,
  TrashIcon,
  RefreshIcon,
  CalendarIcon,
  SendIcon,
  MobileIcon,
  ImageIcon,
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
import { collection, getDocs, query, orderBy, setDoc, doc } from 'firebase/firestore';
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
  onPublish: (index: number) => void;
  onSchedule: (index: number) => void;
  onSaveToWorkflow: (index: number, status: 'Draft' | 'Approved') => void;
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
}) => {
  const { user, showToast, setActivePage } = useAppContext();
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
  const [trendingSounds, setTrendingSounds] = useState<TrendingSound[]>([]);
  const [isLoadingTrendingSounds, setIsLoadingTrendingSounds] = useState(false);
  const [showTrendingSounds, setShowTrendingSounds] = useState(false);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const captionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const aiHelpRef = useRef<HTMLDivElement>(null);
  const [isAiHelpOpen, setIsAiHelpOpen] = useState(false);
  const [aiHelpPrompt, setAiHelpPrompt] = useState('');
  const [isAiHelpGenerating, setIsAiHelpGenerating] = useState(false);

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

  const fetchTrendingSounds = async () => {
    setIsLoadingTrendingSounds(true);
    try {
      // Get auth token for Instagram Graph API integration
      let authHeader = '';
      if (user) {
        try {
          const { auth } = await import('../firebaseConfig');
          const currentUser = auth.currentUser;
          if (currentUser) {
            const token = await currentUser.getIdToken();
            authHeader = `Bearer ${token}`;
          }
        } catch (authError) {
          console.warn('Could not get auth token:', authError);
        }
      }

      const url = user?.id 
        ? `/api/getTrendingInstagramSounds?userId=${user.id}`
        : '/api/getTrendingInstagramSounds';
      
      const response = await fetch(url, {
        headers: authHeader ? { Authorization: authHeader } : {},
      });
      
      const data = await response.json();
      if (data.success && data.sounds) {
        setTrendingSounds(data.sounds);
      } else {
        showToast('Failed to load trending sounds', 'error');
      }
    } catch (error) {
      console.error('Error fetching trending sounds:', error);
      showToast('Failed to load trending sounds', 'error');
    } finally {
      setIsLoadingTrendingSounds(false);
    }
  };

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

      // Save to media library
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

  const generateCaptionsForMedia = async (base64Data: string, mimeType: string) => {
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
      // Upload to Firebase Storage first
      const timestamp = Date.now();
      const extension = mimeType.split('/')[1] || 'png';
      const storagePath = `users/${user.id}/uploads/${timestamp}.${extension}`;
      const storageRef = ref(storage, storagePath);

      const bytes = base64ToBytes(base64Data);
      await uploadBytes(storageRef, bytes, {
        contentType: mimeType,
      });

      const mediaUrl = await getDownloadURL(storageRef);

      // Get selected platforms for platform-specific hashtags
      const selectedPlatforms = (Object.keys(mediaItem.selectedPlatforms || {}) as Platform[]).filter(
        p => mediaItem.selectedPlatforms?.[p]
      );
      
      const res = await generateCaptions({
        mediaUrl,
        goal: mediaItem.postGoal,
        tone: mediaItem.postTone,
        promptText: undefined,
        platforms: selectedPlatforms.length > 0 ? selectedPlatforms : undefined, // Pass platforms for hashtag generation
      });

      let generatedResults: CaptionResult[] = [];

      if (Array.isArray(res)) {
        generatedResults = res as CaptionResult[];
      } else if (Array.isArray(res?.captions)) {
        generatedResults = res.captions as CaptionResult[];
      } else if (res?.caption) {
        generatedResults = [
          {
            caption: res.caption,
            hashtags: res.hashtags || [],
          },
        ];
      }

      const firstCaptionText =
        generatedResults.length > 0
          ? generatedResults[0].caption +
            '\n\n' +
            (generatedResults[0].hashtags || []).join(' ')
          : '';

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

  const handleGenerate = () => {
    if (mediaItem.data) {
      generateCaptionsForMedia(mediaItem.data, mediaItem.mimeType);
    } else {
      showToast('Please upload media first.', 'error');
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
      // Get Firebase auth token
      const token = auth.currentUser
        ? await auth.currentUser.getIdToken(true)
        : null;

      const response = await fetch('/api/generateText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          prompt: aiHelpPrompt,
          context: {
            goal: mediaItem.postGoal,
            tone: mediaItem.postTone,
            platforms: (Object.keys(mediaItem.selectedPlatforms || {}) as Platform[]).filter(
              p => mediaItem.selectedPlatforms?.[p]
            ),
          },
        }),
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error || data.note || 'Failed to generate text');
      }

      const generatedText = data.text || data.caption || '';
      
      if (generatedText) {
        // Insert generated text into caption (replace if empty, append if not)
        const currentText = mediaItem.captionText || '';
        const newText = currentText.trim() 
          ? currentText + '\n\n' + generatedText 
          : generatedText;
        onUpdate(index, { captionText: newText });
        
        setIsAiHelpOpen(false);
        setAiHelpPrompt('');
      } else {
        throw new Error('No text generated');
      }
    } catch (error: any) {
      console.error('AI Help generation error:', error);
      alert(error?.message || 'Failed to generate text. Please try again.');
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
          <div className="relative w-full h-40 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden mb-2 flex items-center justify-center">
            {mediaItem.type === 'image' ? (
              <img
                src={mediaItem.previewUrl}
                alt={`Post ${index + 1}`}
                className="w-full h-full object-contain"
              />
            ) : (
            <>
              <video
                src={mediaItem.previewUrl}
                className="w-full h-full object-contain"
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
              title="Select from Media Library"
            >
              <ImageIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
              <span className="text-xs text-primary-600 dark:text-primary-400 mt-1">
                Media Library
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

      {/* Generate Button */}
      {mediaItem.previewUrl && !mediaItem.results.length && (
        <button
          onClick={handleGenerate}
          disabled={!canGenerate || isGenerating}
          className="w-full mb-3 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800 rounded-md hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors disabled:opacity-50"
        >
          <RefreshIcon className={`w-3 h-3 ${isGenerating ? 'animate-spin' : ''}`} />
          {isGenerating ? 'Generating...' : '(Re)Generate Captions'}
        </button>
      )}

      {/* Caption Results */}
      {mediaItem.results.length > 0 && (
        <div className="mb-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              AI Suggestions
            </span>
            <button
              onClick={handleGenerate}
              disabled={!canGenerate || isGenerating}
              className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 disabled:opacity-50 flex items-center gap-1"
            >
              <RefreshIcon className={`w-3 h-3 ${isGenerating ? 'animate-spin' : ''}`} />
              (Re)Generate
            </button>
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
          </div>
        )}
      </div>

      {/* Music Selection for Videos */}
      {mediaItem.type === 'video' && (
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
              <div className="font-medium text-gray-800 dark:text-gray-200">{mediaItem.selectedMusic.name}</div>
              <div className="text-gray-600 dark:text-gray-400">{mediaItem.selectedMusic.artist}</div>
              {mediaItem.selectedMusic.genre && (
                <div className="text-gray-500 dark:text-gray-500 mt-1">
                  {mediaItem.selectedMusic.genre} • {mediaItem.selectedMusic.mood}
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
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Schedule Date & Time
        </label>
        <input
          type="datetime-local"
          value={mediaItem.scheduledDate ? new Date(mediaItem.scheduledDate).toISOString().slice(0, 16) : ''}
          onChange={(e) => {
            if (e.target.value) {
              const date = new Date(e.target.value);
              onUpdate(index, { scheduledDate: date.toISOString() });
            } else {
              onUpdate(index, { scheduledDate: undefined });
            }
          }}
          className="w-full p-1.5 text-xs border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
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

      {/* Platform Selection */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
          Publish to
        </label>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(platformIcons) as Platform[]).filter(p => p !== 'OnlyFans').map(platform => (
            <button
              key={platform}
              onClick={() => {
                const currentPlatforms = mediaItem.selectedPlatforms || {};
                const newValue = !currentPlatforms[platform];
                const updates: Partial<MediaItemState> = {
                  selectedPlatforms: {
                    ...currentPlatforms,
                    [platform]: newValue,
                  },
                };
                // Reset Instagram post type if Instagram is deselected
                if (platform === 'Instagram' && !newValue) {
                  updates.instagramPostType = undefined;
                }
                // Auto-set Instagram post type based on media type when Instagram is selected
                if (platform === 'Instagram' && newValue && !mediaItem.instagramPostType) {
                  updates.instagramPostType = mediaItem.type === 'video' ? 'Reel' : 'Post';
                }
                onUpdate(index, updates);
              }}
              className={`flex items-center justify-center gap-1 px-2 py-1 rounded text-xs border transition-colors ${
                mediaItem.selectedPlatforms?.[platform]
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                  : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              <span className="w-3 h-3 flex items-center justify-center flex-shrink-0">{platformIcons[platform]}</span>
              <span className="hidden sm:inline">{platform}</span>
            </button>
          ))}
        </div>
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
                  // Fetch trending sounds when Reel is selected
                  if (postType === 'Reel') {
                    fetchTrendingSounds();
                  }
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

      {/* Trending Sounds for Instagram Reels */}
      {mediaItem.selectedPlatforms?.Instagram && mediaItem.instagramPostType === 'Reel' && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              Trending Sounds
            </label>
            <button
              onClick={() => {
                setShowTrendingSounds(!showTrendingSounds);
                if (!showTrendingSounds && trendingSounds.length === 0) {
                  fetchTrendingSounds();
                }
              }}
              className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
            >
              {showTrendingSounds ? 'Hide' : 'Show'} Trending
            </button>
          </div>
          {showTrendingSounds && (
            <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md p-2 space-y-2">
              {isLoadingTrendingSounds ? (
                <div className="flex items-center justify-center py-4">
                  <RefreshIcon className="w-4 h-4 animate-spin text-primary-600" />
                  <span className="ml-2 text-xs text-gray-600 dark:text-gray-400">Loading trending sounds...</span>
                </div>
              ) : trendingSounds.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">No trending sounds available</p>
              ) : (
                trendingSounds.map((sound) => (
                  <div
                    key={sound.id}
                    className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded-md border border-gray-200 dark:border-gray-600"
                  >
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex-1">
                        <h4 className="text-xs font-semibold text-gray-900 dark:text-white">{sound.title}</h4>
                        {sound.artist && (
                          <p className="text-xs text-gray-600 dark:text-gray-400">{sound.artist}</p>
                        )}
                      </div>
                      <a
                        href={sound.instagramUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium ml-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Use on Instagram →
                      </a>
                    </div>
                    {sound.hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1">
                        {sound.hashtags.slice(0, 3).map((tag: string, idx: number) => (
                          <span key={idx} className="text-xs text-primary-600 dark:text-primary-400">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {sound.trendStats && (
                      <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {sound.trendStats.usageCount && (
                          <span>{sound.trendStats.usageCount.toLocaleString()} uses</span>
                        )}
                        {sound.trendStats.growthRate && (
                          <span className="text-green-600 dark:text-green-400">
                            ↑ {sound.trendStats.growthRate}% growth
                          </span>
                        )}
                        {sound.trendStats.peakTime && (
                          <span>Peak: {sound.trendStats.peakTime}</span>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Preview Button - Always visible if media exists */}
      {mediaItem.previewUrl && (
        <button
          onClick={() => onPreview(index)}
          className="w-full mb-3 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          <MobileIcon className="w-3 h-3" /> Preview
        </button>
      )}

      {/* Action Buttons - Always visible */}
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onSaveToWorkflow(index, 'Draft')}
            disabled={platformsToPost.length === 0}
            className="flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
            title={platformsToPost.length === 0 ? 'Select at least one platform' : 'Save as Draft'}
          >
            <ClipboardCheckIcon className="w-3 h-3" /> Draft
          </button>
          <button
            onClick={() => onSaveToWorkflow(index, 'Approved')}
            disabled={platformsToPost.length === 0}
            className="flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-md hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors disabled:opacity-50"
            title={platformsToPost.length === 0 ? 'Select at least one platform' : 'Save as Approved'}
          >
            <CheckCircleIcon className="w-3 h-3" /> Approved
          </button>
        </div>
        {/* Hide Publish/Schedule buttons for Caption plan (caption generation only) */}
        {user?.plan !== 'Caption' && (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onSchedule(index)}
            disabled={platformsToPost.length === 0}
            className="flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 rounded-md hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors disabled:opacity-50"
            title={platformsToPost.length === 0 ? 'Select at least one platform' : ''}
          >
            <CalendarIcon className="w-3 h-3" /> Schedule
          </button>
          <button
            onClick={() => onPublish(index)}
            disabled={platformsToPost.length === 0}
            className="flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
            title={platformsToPost.length === 0 ? 'Select at least one platform' : ''}
          >
            <SendIcon className="w-3 h-3" /> Publish
          </button>
        </div>
        )}
        {user?.plan === 'Caption' && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-blue-800 dark:text-blue-200">
              <strong>Caption Pro:</strong> This plan is for caption generation only. Select platforms to get platform-specific hashtags. Upgrade to publish/schedule posts.
            </p>
          </div>
        )}
        {/* AI Auto Schedule button */}
        {onAIAutoSchedule && (
          <button
            onClick={() => {
              onAIAutoSchedule(index);
            }}
            disabled={!mediaItem.previewUrl || !mediaItem.captionText.trim() || platformsToPost.length === 0}
            className="w-full flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
            title={!mediaItem.previewUrl || !mediaItem.captionText.trim() ? 'Add media and caption first' : platformsToPost.length === 0 ? 'Select at least one platform' : 'AI Auto Schedule'}
          >
            <SparklesIcon className="w-3 h-3" /> AI Auto Schedule
          </button>
        )}
      </div>

      {/* Media Library Modal */}
      {showMediaLibraryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Select from Media Library</h3>
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
                    Go to Media Library
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
    </div>
  );
};
