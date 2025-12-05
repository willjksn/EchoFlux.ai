import React, { useState, useRef, useEffect, useMemo } from 'react';
import { generateCaptions, generateReply, saveGeneratedContent, analyzePostForPlatforms } from "../src/services/geminiService";
import { CaptionResult, Platform, MediaItem, Client, User, HashtagSet, Post, CalendarEvent } from '../types';
import {
  SparklesIcon,
  UploadIcon,
  VideoIcon,
  ImageIcon,
  ComposeIcon as CaptionIcon,
  SendIcon,
  CheckCircleIcon,
  RedoIcon,
  VoiceIcon,
  TrashIcon,
  RefreshIcon,
  HashtagIcon,
  PlusIcon,
  MobileIcon,
  ClipboardCheckIcon,
  CalendarIcon,
  DownloadIcon
} from './icons/UIIcons';
import {
  InstagramIcon,
  TikTokIcon,
  ThreadsIcon,
  XIcon,
  YouTubeIcon,
  LinkedInIcon,
  FacebookIcon
} from './icons/PlatformIcons';
import { ImageGenerator } from './ImageGenerator';
import { VideoGenerator } from './VideoGenerator';
import { UpgradePrompt } from './UpgradePrompt';
import { useAppContext } from './AppContext';
import { MobilePreviewModal } from './MobilePreviewModal';
import { MediaBox } from './MediaBox';
import { db, storage } from '../firebaseConfig';
import { collection, setDoc, doc, getDocs, deleteDoc, query, where } from 'firebase/firestore';
// @ts-ignore
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { scheduleMultiplePosts, analyzeOptimalPostingTimes } from '../src/services/smartSchedulingService';
import { getAnalytics } from '../src/services/geminiService';
import { MediaItemState } from '../types';

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

const platformIcons: Record<Platform, React.ReactNode> = {
  Instagram: <InstagramIcon />,
  TikTok: <TikTokIcon />,
  X: <XIcon />,
  Threads: <ThreadsIcon />,
  YouTube: <YouTubeIcon />,
  LinkedIn: <LinkedInIcon />,
  Facebook: <FacebookIcon />,
};

const SpeechRecognition =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const isSpeechRecognitionSupported = !!SpeechRecognition;

const CaptionGenerator: React.FC = () => {
  const {
    user,
    setUser,
    showToast,
    settings,
    selectedClient,
    clients,
    composeState,
    setComposeState,
    hashtagSets,
    setHashtagSets,
    composeContext,
    addCalendarEvent
  } = useAppContext();

  // Error boundary - prevent blank page
  if (!user) {
    return (
      <div className="text-center p-8">
        <p className="text-gray-600 dark:text-gray-400">Please sign in to use Compose.</p>
      </div>
    );
  }

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoGenerateCaptions, setAutoGenerateCaptions] = useState(false); // Toggle for auto-generating captions (unchecked by default)
  const [selectedPlatforms, setSelectedPlatforms] = useState<Record<Platform, boolean>>({
    Instagram: false,
    TikTok: false,
    X: false,
    Threads: false,
    YouTube: false,
    LinkedIn: false,
    Facebook: false
  });
  const [isPublished, setIsPublished] = useState(false);

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Remix state
  const [isRemixModalOpen, setIsRemixModalOpen] = useState(false);
  const [remixTargetPlatform, setRemixTargetPlatform] = useState<Platform>('X');
  const [remixSourceText, setRemixSourceText] = useState('');
  const [isRemixing, setIsRemixing] = useState(false);

  // Hashtag state
  const [isHashtagPopoverOpen, setIsHashtagPopoverOpen] = useState(false);
  const [newHashtagSetName, setNewHashtagSetName] = useState('');
  const [newHashtagSetTags, setNewHashtagSetTags] = useState('');

  // Preview state
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewMediaIndex, setPreviewMediaIndex] = useState<number | null>(null);

  // Scheduling state
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');

  // Selected checkboxes for bulk actions
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  // AI Auto-Schedule state
  const [isAIAutoScheduleModalOpen, setIsAIAutoScheduleModalOpen] = useState(false);
  const [aiRecommendations, setAIRecommendations] = useState<Array<{
    index: number;
    item: MediaItemState;
    recommendedPlatforms: Array<{ platform: Platform; score: number; reason: string }>;
    suggestedTime?: string;
  }>>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [autoConfirmEnabled, setAutoConfirmEnabled] = useState(false);

  // Plan + role logic
  const isAgency = user?.plan === 'Agency' || user?.plan === 'Elite';
  const isBusiness = user?.userType === 'Business';
  const isAgencyPlan = user?.plan === 'Agency';
  const isAdminOrAgency = user?.role === 'Admin' || user?.plan === 'Agency';

  // Caption limits including new plans, with safe default
  const captionLimits = useMemo(
    () => ({
      Free: 50,
      Pro: 500,
      Elite: 1500,
      Agency: Infinity,
      Starter: 1000,
      Growth: 2500
    }),
    []
  );

  const planKey =
    (user?.plan as keyof typeof captionLimits) && captionLimits[user!.plan as keyof typeof captionLimits] !== undefined
      ? (user!.plan as keyof typeof captionLimits)
      : 'Free';

  const limit = captionLimits[planKey];
  const usage = user?.monthlyCaptionGenerationsUsed || 0;
  const canGenerate = usage < limit;
  const usageLeft = limit - usage;

  // Dynamic goal/tone options
  const userPlan = user?.plan || 'Free';
  const isStarterOrGrowth = userPlan === 'Starter' || userPlan === 'Growth';
  const showAdvancedOptions = !isBusiness || isAgencyPlan; // Hide for Business Starter/Growth, show for Agency and all Creators
  
  const goalOptions = useMemo(
    () => [
      { value: 'engagement', label: 'Increase Engagement' },
      { value: 'sales', label: 'Drive Sales' },
      { value: 'awareness', label: 'Build Awareness' },
      // Followers option: Hide for Business Starter/Growth, show for Agency and all Creators
      ...(showAdvancedOptions
        ? [{ value: 'followers', label: 'Increase Followers/Fans' }]
        : [])
    ],
    [showAdvancedOptions]
  );

  const toneOptions = useMemo(
    () => [
      { value: 'friendly', label: 'Friendly' },
      { value: 'witty', label: 'Witty' },
      { value: 'inspirational', label: 'Inspirational' },
      { value: 'professional', label: 'Professional' },
      // Sexy tones: Hide for Business Starter/Growth, show for Agency and all Creators
      ...(showAdvancedOptions
        ? [
            { value: 'sexy-bold', label: 'Sexy / Bold' },
            { value: 'sexy-explicit', label: 'Sexy / Explicit' }
          ]
        : [])
    ],
    [showAdvancedOptions]
  );

  useEffect(() => {
    if (composeContext?.platform) {
      setSelectedPlatforms(prev => ({ ...prev, [composeContext.platform!]: true }));
    }
    if (composeContext?.date) {
      setIsScheduling(true);
      setScheduleDate(new Date(composeContext.date).toISOString().slice(0, 16));
    }
  }, [composeContext]);

  useEffect(() => {
    if (!isSpeechRecognitionSupported) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setComposeState(prev => ({
        ...prev,
        captionText: (prev.captionText ? prev.captionText + ' ' : '') + transcript
      }));
      setIsListening(false);
      textareaRef.current?.focus();
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
  }, [setComposeState]);

  const handleMicClick = () => {
    if (!isSpeechRecognitionSupported || !recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const handlePlatformToggle = (platform: Platform) => {
    setSelectedPlatforms(prev => ({ ...prev, [platform]: !prev[platform] }));
  };

  const resetCompose = () => {
    handleClearMedia();
    setIsScheduling(false);
    setScheduleDate('');
    setComposeState(prev => ({ ...prev, mediaItems: [] }));
    setSelectedPlatforms({
      Instagram: false,
      TikTok: false,
      X: false,
      Threads: false,
      YouTube: false,
      LinkedIn: false,
      Facebook: false
    });
  };

  // Track deleted media item IDs to prevent re-saving
  const deletedMediaIdsRef = useRef<Set<string>>(new Set());

  // Persist mediaItems to Firestore
  useEffect(() => {
    if (!user || composeState.mediaItems.length === 0) {
      // Clear Firestore if no items
      if (user && composeState.mediaItems.length === 0) {
        // Don't delete here - let individual deletions handle it
      }
      return;
    }

    const saveMediaItems = async () => {
      for (const item of composeState.mediaItems) {
        // Skip items with blob URLs - they won't work after reload
        if (item.previewUrl && (item.previewUrl.startsWith('blob:') || item.previewUrl.startsWith('data:'))) {
          continue;
        }

        // Skip deleted items
        if (item.id && deletedMediaIdsRef.current.has(item.id)) {
          continue;
        }

        try {
          const itemData: any = {
            previewUrl: item.previewUrl,
            captionText: item.captionText || '',
            postGoal: item.postGoal || 'engagement',
            postTone: item.postTone || 'friendly',
            selectedPlatforms: item.selectedPlatforms || {},
            results: item.results || [],
            type: item.type || 'image',
            mimeType: item.mimeType || '',
            scheduledDate: item.scheduledDate || null,
            updatedAt: new Date().toISOString(),
          };

          if (item.id) {
            // Update existing
            await setDoc(doc(db, 'users', user.id, 'compose_media', item.id), itemData);
          } else {
            // Create new
            const newId = Date.now().toString();
            await setDoc(doc(db, 'users', user.id, 'compose_media', newId), {
              ...itemData,
              createdAt: new Date().toISOString(),
            });
            // Update local state with ID
            setComposeState(prev => ({
              ...prev,
              mediaItems: prev.mediaItems.map(m => 
                m.previewUrl === item.previewUrl && !m.id ? { ...m, id: newId } : m
              ),
            }));
          }
        } catch (error) {
          console.error('Failed to save media item:', error);
        }
      }
    };

    saveMediaItems();
  }, [composeState.mediaItems, user]);

  // Load mediaItems from Firestore on mount
  useEffect(() => {
    if (!user) return;

    let mounted = true;

    const loadMediaItems = async () => {
      try {
        const composeRef = collection(db, 'users', user.id, 'compose_media');
        const snapshot = await getDocs(composeRef);
        
        if (!mounted) return;
        
        const loadedItems: MediaItemState[] = [];
        snapshot.forEach((docSnapshot) => {
          const data = docSnapshot.data();
          // Skip items with blob URLs
          if (data.previewUrl && (data.previewUrl.startsWith('blob:') || data.previewUrl.startsWith('data:'))) {
            return;
          }
          
          loadedItems.push({
            id: docSnapshot.id,
            previewUrl: data.previewUrl || '',
            captionText: data.captionText || '',
            postGoal: data.postGoal || 'engagement',
            postTone: data.postTone || 'friendly',
            selectedPlatforms: data.selectedPlatforms || {
              Instagram: false,
              TikTok: false,
              X: false,
              Threads: false,
              YouTube: false,
              LinkedIn: false,
              Facebook: false,
            },
            results: data.results || [],
            type: data.type || 'image',
            mimeType: data.mimeType || '',
            scheduledDate: data.scheduledDate || undefined,
            data: '', // Don't load base64 data
          });
        });
        
        if (mounted && loadedItems.length > 0) {
          setComposeState(prev => ({
            ...prev,
            mediaItems: loadedItems,
          }));
        }
      } catch (error) {
        console.error('Failed to load compose media items:', error);
      }
    };

    loadMediaItems();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  // Clear localStorage when all items are removed
  useEffect(() => {
    if (composeState.mediaItems.length === 0) {
      localStorage.removeItem('compose_mediaItems');
    }
  }, [composeState.mediaItems.length]);

  // Check for pending media from Media Library
  useEffect(() => {
    const handleMediaLibraryItem = () => {
      const pendingMedia = localStorage.getItem('pendingMediaFromLibrary');
      if (pendingMedia) {
        try {
          const mediaData = JSON.parse(pendingMedia);
          
          // Use functional update to check for duplicates with latest state
          setComposeState(prev => {
            // Check if this media is already added (prevent duplicates)
            const alreadyExists = prev.mediaItems.some(
              item => item.previewUrl === mediaData.url
            );
            
            if (!alreadyExists) {
              const newMediaItem: MediaItemState = {
                id: Date.now().toString(),
                previewUrl: mediaData.url,
                data: '', // Media Library items are already URLs, no base64 needed
                mimeType: mediaData.mimeType,
                type: mediaData.type,
                results: [],
                captionText: '',
                postGoal: prev.postGoal,
                postTone: prev.postTone,
                selectedPlatforms: {
                  Instagram: false,
                  TikTok: false,
                  X: false,
                  Threads: false,
                  YouTube: false,
                  LinkedIn: false,
                  Facebook: false,
                },
              };
              // Always add to mediaItems array so it shows in a MediaBox
              setTimeout(() => {
                showToast(`Added ${mediaData.name} to compose`, 'success');
              }, 100);
              return {
                ...prev,
                mediaItems: [...prev.mediaItems, newMediaItem],
              };
            }
            return prev;
          });
          
          localStorage.removeItem('pendingMediaFromLibrary');
        } catch (error) {
          console.error('Failed to add media from library:', error);
          localStorage.removeItem('pendingMediaFromLibrary');
        }
      }
    };

    // Check immediately on mount
    handleMediaLibraryItem();
    
    // Also check after delays to catch navigation
    const timeoutId1 = setTimeout(handleMediaLibraryItem, 300);
    const timeoutId2 = setTimeout(handleMediaLibraryItem, 800);
    
    // Listen for custom event from Media Library
    window.addEventListener('mediaLibraryItemAdded', handleMediaLibraryItem);
    
    // Also listen for focus event (when tab becomes active)
    window.addEventListener('focus', handleMediaLibraryItem);
    
    return () => {
      clearTimeout(timeoutId1);
      clearTimeout(timeoutId2);
      window.removeEventListener('mediaLibraryItemAdded', handleMediaLibraryItem);
      window.removeEventListener('focus', handleMediaLibraryItem);
    };
  }, [setComposeState, composeState.postGoal, composeState.postTone, showToast]);

  // Batch upload handlers
  const handleAddMediaBox = () => {
    const newMediaItem: MediaItemState = {
      id: Date.now().toString(),
      previewUrl: '',
      data: '',
      mimeType: '',
      type: 'image',
      results: [],
      captionText: '',
      postGoal: composeState.postGoal,
      postTone: composeState.postTone,
      selectedPlatforms: {
        Instagram: false,
        TikTok: false,
        X: false,
        Threads: false,
        YouTube: false,
        LinkedIn: false,
        Facebook: false,
      },
    };
    setComposeState(prev => ({
      ...prev,
      mediaItems: [...prev.mediaItems, newMediaItem],
    }));
  };

  const handleUpdateMediaItem = (index: number, updates: Partial<MediaItemState>) => {
    setComposeState(prev => ({
      ...prev,
      mediaItems: prev.mediaItems.map((item, i) =>
        i === index ? { ...item, ...updates } : item
      ),
    }));
  };

  const handleRemoveMediaItem = async (index: number) => {
    const item = composeState.mediaItems[index];
    if (!item) return;

    // Track deleted ID to prevent re-saving
    if (item.id) {
      deletedMediaIdsRef.current.add(item.id);
    }

    // Remove from UI
    setComposeState(prev => ({
      ...prev,
      mediaItems: prev.mediaItems.filter((_, i) => i !== index),
    }));

    // Delete from Firestore
    if (item.id && user) {
      try {
        await deleteDoc(doc(db, 'users', user.id, 'compose_media', item.id));
      } catch (error) {
        console.error('Failed to delete from Firestore:', error);
        // Revert on error
        deletedMediaIdsRef.current.delete(item.id);
        setComposeState(prev => ({
          ...prev,
          mediaItems: [...prev.mediaItems.slice(0, index), item, ...prev.mediaItems.slice(index)],
        }));
      }
    }

    // Adjust selected indices
    setSelectedIndices(prev => {
      const newSet = new Set(prev);
      newSet.delete(index);
      // Adjust indices after removal
      const adjusted = new Set<number>();
      newSet.forEach(idx => {
        if (idx > index) adjusted.add(idx - 1);
        else adjusted.add(idx);
      });
      return adjusted;
    });
  };

  const handleToggleSelect = (index: number) => {
    setSelectedIndices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const handleScheduleAll = async () => {
    const selectedItems = Array.from(selectedIndices)
      .map(i => composeState.mediaItems[i])
      .filter(item => item && item.previewUrl && item.captionText.trim());

    if (selectedItems.length === 0) {
      showToast('Please select at least one post with media and caption.', 'error');
      return;
    }

    // Check each item has at least one platform selected
    const itemsWithoutPlatforms = selectedItems.filter(
      item => !Object.values(item.selectedPlatforms || {}).some(p => p)
    );
    if (itemsWithoutPlatforms.length > 0) {
      showToast('Please select at least one platform for each post.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      for (let i = 0; i < selectedItems.length; i++) {
        const item = selectedItems[i];
        const originalIndex = composeState.mediaItems.findIndex(m => m.id === item.id);
        const mediaUrl = item.previewUrl.startsWith('http')
          ? item.previewUrl
          : await uploadMediaItem(item);

        if (!mediaUrl) continue;

        const title = item.captionText.trim()
          ? item.captionText.substring(0, 30) + '...'
          : 'New Post';

        const postId = `${Date.now()}-${i}`;
        const scheduledDate = item.scheduledDate || new Date().toISOString();
        
        // Use each item's own platform selection
        const itemPlatforms = (Object.keys(item.selectedPlatforms || {}) as Platform[]).filter(
          p => item.selectedPlatforms?.[p]
        );

        if (user) {
          const newPost: Post = {
            id: postId,
            content: item.captionText,
            mediaUrl: mediaUrl,
            mediaType: item.type,
            platforms: itemPlatforms,
            status: 'Scheduled',
            author: { name: user.name, avatar: user.avatar },
            comments: [],
            scheduledDate: scheduledDate,
            clientId: selectedClient?.id,
          };

          const safePost = JSON.parse(JSON.stringify(newPost));
          await setDoc(doc(db, 'users', user.id, 'posts', postId), safePost);
        }

        // Create calendar event for each platform
        for (const platform of itemPlatforms) {
          const newEvent: CalendarEvent = {
            id: `cal-${postId}-${platform}`,
            title: title,
            date: scheduledDate,
            type: item.type === 'video' ? 'Reel' : 'Post',
            platform: platform,
            status: 'Scheduled',
            thumbnail: mediaUrl,
          };

          await addCalendarEvent(newEvent);
        }

        // Remove scheduled item from mediaItems
        setComposeState(prev => ({
          ...prev,
          mediaItems: prev.mediaItems.filter((_, idx) => idx !== originalIndex),
        }));
      }

      showToast(`Scheduled ${selectedItems.length} posts!`, 'success');
      setSelectedIndices(new Set());
    } catch (e) {
      console.error(e);
      showToast('Failed to schedule posts.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAll = () => {
    if (selectedIndices.size === 0) {
      showToast('Please select at least one post to delete.', 'error');
      return;
    }

    const indicesToDelete = Array.from(selectedIndices).sort((a, b) => b - a);
    setComposeState(prev => ({
      ...prev,
      mediaItems: prev.mediaItems.filter((_, i) => !selectedIndices.has(i)),
    }));
    setSelectedIndices(new Set());
    showToast(`Deleted ${indicesToDelete.length} post(s).`, 'success');
  };

  const handlePreviewMedia = (index: number) => {
    setPreviewMediaIndex(index);
    setIsPreviewOpen(true);
  };

  const handlePublishMedia = async (index: number) => {
    const item = composeState.mediaItems[index];
    if (!item.previewUrl || !item.captionText.trim()) {
      showToast('Please add media and caption.', 'error');
      return;
    }

    const platformsToPost = (Object.keys(item.selectedPlatforms || {}) as Platform[]).filter(
      p => item.selectedPlatforms?.[p]
    );
    if (platformsToPost.length === 0) {
      showToast('Please select at least one platform.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const mediaUrl = item.previewUrl.startsWith('http')
        ? item.previewUrl
        : await uploadMediaItem(item);

      if (!mediaUrl) {
        showToast('Failed to upload media.', 'error');
        return;
      }

      const title = item.captionText.trim()
        ? item.captionText.substring(0, 30) + '...'
        : 'New Post';

      const postId = Date.now().toString();
      const publishDate = new Date().toISOString();

      if (user) {
        const newPost: Post = {
          id: postId,
          content: item.captionText,
          mediaUrl: mediaUrl,
          mediaType: item.type,
          platforms: platformsToPost,
          status: 'Published',
          author: { name: user.name, avatar: user.avatar },
          comments: [],
          scheduledDate: publishDate,
          clientId: selectedClient?.id,
        };

        const safePost = JSON.parse(JSON.stringify(newPost));
        await setDoc(doc(db, 'users', user.id, 'posts', postId), safePost);
      }

      // Create calendar event for each platform
      for (const platform of platformsToPost) {
        const newEvent: CalendarEvent = {
          id: `cal-${postId}-${platform}`,
          title: title,
          date: publishDate,
          type: item.type === 'video' ? 'Reel' : 'Post',
          platform: platform,
          status: 'Published',
          thumbnail: mediaUrl,
        };
        await addCalendarEvent(newEvent);
      }

      // Remove published item
      setComposeState(prev => ({
        ...prev,
        mediaItems: prev.mediaItems.filter((_, i) => i !== index),
      }));

      showToast(`Published to ${platformsToPost.join(', ')}!`, 'success');
    } catch (e) {
      console.error(e);
      showToast('Failed to publish post.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleScheduleMedia = async (index: number) => {
    const item = composeState.mediaItems[index];
    if (!item.previewUrl || !item.captionText.trim()) {
      showToast('Please add media and caption.', 'error');
      return;
    }

    const platformsToPost = (Object.keys(item.selectedPlatforms || {}) as Platform[]).filter(
      p => item.selectedPlatforms?.[p]
    );
    if (platformsToPost.length === 0) {
      showToast('Please select at least one platform.', 'error');
      return;
    }

    if (!item.scheduledDate) {
      showToast('Please generate best times or set a schedule date.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const mediaUrl = item.previewUrl.startsWith('http')
        ? item.previewUrl
        : await uploadMediaItem(item);

      if (!mediaUrl) {
        showToast('Failed to upload media.', 'error');
        return;
      }

      const title = item.captionText.trim()
        ? item.captionText.substring(0, 30) + '...'
        : 'New Post';

      const postId = Date.now().toString();

      if (user) {
        const newPost: Post = {
          id: postId,
          content: item.captionText,
          mediaUrl: mediaUrl,
          mediaType: item.type,
          platforms: platformsToPost,
          status: 'Scheduled',
          author: { name: user.name, avatar: user.avatar },
          comments: [],
          scheduledDate: item.scheduledDate,
          clientId: selectedClient?.id,
        };

        const safePost = JSON.parse(JSON.stringify(newPost));
        await setDoc(doc(db, 'users', user.id, 'posts', postId), safePost);
      }

      // Create calendar event for each platform
      for (const platform of platformsToPost) {
        const newEvent: CalendarEvent = {
          id: `cal-${postId}-${platform}`,
          title: title,
          date: item.scheduledDate,
          type: item.type === 'video' ? 'Reel' : 'Post',
          platform: platform,
          status: 'Scheduled',
          thumbnail: mediaUrl,
        };
        await addCalendarEvent(newEvent);
      }

      // Remove scheduled item
      setComposeState(prev => ({
        ...prev,
        mediaItems: prev.mediaItems.filter((_, i) => i !== index),
      }));

      showToast(`Scheduled for ${new Date(item.scheduledDate).toLocaleString()}!`, 'success');
    } catch (e) {
      console.error(e);
      showToast('Failed to schedule post.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateBestTimes = async () => {
    if (composeState.mediaItems.length === 0) {
      showToast('Please add at least one media item first.', 'error');
      return;
    }

    const platformsToPost = (Object.keys(selectedPlatforms) as Platform[]).filter(
      p => selectedPlatforms[p]
    );
    if (platformsToPost.length === 0) {
      showToast('Please select at least one platform.', 'error');
      return;
    }

    setIsLoading(true);
    try {
      // Fetch analytics data
      const analytics = await getAnalytics('30d', 'All');
      
      // Generate optimal times for all posts
      const scheduledDates = scheduleMultiplePosts(
        composeState.mediaItems.length,
        1, // Start from week 1
        analytics,
        platformsToPost[0], // Use first selected platform
        {
          avoidClumping: true,
          minHoursBetween: 2,
          preferBusinessHours: true,
        }
      );

      // Update each media item with its scheduled date
      setComposeState(prev => ({
        ...prev,
        mediaItems: prev.mediaItems.map((item, index) => ({
          ...item,
          scheduledDate: scheduledDates[index] || new Date().toISOString(),
        })),
      }));

      showToast(`Generated optimal times for ${composeState.mediaItems.length} posts!`, 'success');
    } catch (error) {
      console.error('Failed to generate best times:', error);
      showToast('Failed to generate optimal times. Using default schedule.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBulkSchedule = async (publishNow: boolean = false) => {
    const platformsToPost = (Object.keys(selectedPlatforms) as Platform[]).filter(
      p => selectedPlatforms[p]
    );
    if (platformsToPost.length === 0) {
      showToast('Please select at least one platform.', 'error');
      return;
    }

    const itemsToProcess = composeState.mediaItems.filter(
      item => item.previewUrl && item.captionText.trim()
    );

    if (itemsToProcess.length === 0) {
      showToast('Please add media and captions.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      for (let i = 0; i < itemsToProcess.length; i++) {
        const item = itemsToProcess[i];
        const mediaUrl = item.previewUrl.startsWith('http')
          ? item.previewUrl
          : await uploadMediaItem(item);

        if (!mediaUrl) continue;

        const title = item.captionText.trim()
          ? item.captionText.substring(0, 30) + '...'
          : 'New Post';

        const postId = `${Date.now()}-${i}`;
        const scheduledDate = publishNow ? new Date().toISOString() : (item.scheduledDate || new Date().toISOString());
        const status = publishNow ? 'Published' : 'Scheduled';

        if (user) {
          const newPost: Post = {
            id: postId,
            content: item.captionText,
            mediaUrl: mediaUrl,
            mediaType: item.type,
            platforms: platformsToPost,
            status: status,
            author: { name: user.name, avatar: user.avatar },
            comments: [],
            scheduledDate: scheduledDate,
            clientId: selectedClient?.id,
          };

          const safePost = JSON.parse(JSON.stringify(newPost));
          await setDoc(doc(db, 'users', user.id, 'posts', postId), safePost);
        }

        // Create calendar event for each platform
        for (const platform of platformsToPost) {
          const newEvent: CalendarEvent = {
            id: `cal-${postId}-${platform}`,
            title: title,
            date: scheduledDate,
            type: item.type === 'video' ? 'Reel' : 'Post',
            platform: platform,
            status: status,
            thumbnail: mediaUrl,
          };

          await addCalendarEvent(newEvent);
        }
      }

      showToast(
        publishNow 
          ? `Published ${itemsToProcess.length} posts!` 
          : `Scheduled ${itemsToProcess.length} posts!`,
        'success'
      );
      // Don't reset - keep unscheduled items
    } catch (e) {
      console.error(e);
      showToast(publishNow ? 'Failed to publish posts.' : 'Failed to schedule posts.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const uploadMediaItem = async (item: MediaItemState): Promise<string | undefined> => {
    if (!item.data || !user) return undefined;

    try {
      const timestamp = Date.now();
      const extension = item.mimeType.split('/')[1] || 'bin';
      const storagePath = `users/${user.id}/uploads/${timestamp}.${extension}`;
      const storageRef = ref(storage, storagePath);

      const bytes = base64ToBytes(item.data);
      await uploadBytes(storageRef, bytes, {
        contentType: item.mimeType,
      });

      const mediaUrl = await getDownloadURL(storageRef);

      // Save to media library
      try {
        const mediaLibraryItem = {
          id: timestamp.toString(),
          userId: user.id,
          url: mediaUrl,
          name: `Compose Media ${new Date().toLocaleDateString()}`,
          type: item.type || (item.mimeType.startsWith('image') ? 'image' : 'video'),
          mimeType: item.mimeType,
          size: bytes.length,
          uploadedAt: new Date().toISOString(),
          usedInPosts: [],
          tags: [],
        };
        await setDoc(doc(db, 'users', user.id, 'media_library', mediaLibraryItem.id), mediaLibraryItem);
      } catch (libraryError) {
        // Don't fail the upload if media library save fails
        console.error('Failed to save to media library:', libraryError);
      }

      return mediaUrl;
    } catch (e) {
      console.error('Upload failed:', e);
      return undefined;
    }
  };

  const handleCaptionGenerationComplete = () => {
    if (user) {
      setUser({
        ...user,
        monthlyCaptionGenerationsUsed:
          (user.monthlyCaptionGenerationsUsed || 0) + 1,
      });
    }
  };

  const handleAIAutoSchedule = async () => {
    const selectedItems = Array.from(selectedIndices)
      .map(i => composeState.mediaItems[i])
      .filter(item => item && item.previewUrl && item.captionText.trim());

    if (selectedItems.length === 0) {
      showToast('Please select posts with media and captions.', 'error');
      return;
    }

    setIsAnalyzing(true);
    try {
      const recommendations = await Promise.all(
        selectedItems.map(async (item, idx) => {
          const originalIndex = composeState.mediaItems.findIndex(m => m.id === item.id);
          try {
            // Extract hashtags from caption
            const hashtags = item.captionText.match(/#\w+/g) || [];
            
            const analysis = await analyzePostForPlatforms({
              caption: item.captionText,
              hashtags,
              mediaType: item.type,
              goal: item.postGoal,
              tone: item.postTone,
            });

            // Get optimal time for the top recommended platform
            let suggestedTime: string | undefined;
            if (analysis.recommendations.length > 0) {
              const topPlatform = analysis.recommendations[0].platform as Platform;
              // Use existing smart scheduling logic
              try {
                const analytics = await getAnalytics();
                const optimalTimes = analyzeOptimalPostingTimes(analytics, {
                  platform: topPlatform,
                  avoidClumping: true,
                  minHoursBetween: 2,
                });
                
                if (optimalTimes.length > 0) {
                  const optimal = optimalTimes[0];
                  const now = new Date();
                  const scheduledDate = new Date();
                  scheduledDate.setDate(now.getDate() + (optimal.dayOfWeek - now.getDay() + 7) % 7);
                  scheduledDate.setHours(optimal.hour, optimal.minute, 0, 0);
                  suggestedTime = scheduledDate.toISOString();
                }
              } catch (err) {
                console.error('Failed to get optimal time:', err);
              }
            }

            return {
              index: originalIndex,
              item,
              recommendedPlatforms: analysis.recommendations.map((rec: any) => ({
                platform: rec.platform as Platform,
                score: rec.score || 0,
                reason: rec.reason || 'Good fit for this platform',
              })),
              suggestedTime,
            };
          } catch (err) {
            console.error(`Failed to analyze post ${originalIndex}:`, err);
            // Return default recommendations
            return {
              index: originalIndex,
              item,
              recommendedPlatforms: [
                { platform: 'Instagram' as Platform, score: 80, reason: 'Default recommendation' },
              ],
            };
          }
        })
      );

      setAIRecommendations(recommendations);
      setIsAIAutoScheduleModalOpen(true);
    } catch (error) {
      console.error('AI Auto-Schedule failed:', error);
      showToast('Failed to analyze posts. Please try again.', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplyAISchedule = async () => {
    if (aiRecommendations.length === 0) return;

    setIsSaving(true);
    try {
      const scheduledItems: number[] = [];

      for (const rec of aiRecommendations) {
        const item = composeState.mediaItems[rec.index];
        if (!item || !item.previewUrl || !item.captionText.trim()) continue;

        // Auto-select recommended platforms (top 2-3)
        const topPlatforms = rec.recommendedPlatforms
          .slice(0, 3)
          .map(p => p.platform);

        const updatedPlatforms: Record<Platform, boolean> = {
          Instagram: false,
          TikTok: false,
          X: false,
          Threads: false,
          YouTube: false,
          LinkedIn: false,
          Facebook: false,
        };

        topPlatforms.forEach(platform => {
          updatedPlatforms[platform] = true;
        });

        // Update item with recommended platforms and scheduled date
        handleUpdateMediaItem(rec.index, {
          selectedPlatforms: updatedPlatforms,
          scheduledDate: rec.suggestedTime || new Date().toISOString(),
        });

        // Wait a bit for state to update
        await new Promise(resolve => setTimeout(resolve, 100));

        // Get updated item
        const updatedItem = composeState.mediaItems[rec.index];
        if (!updatedItem) continue;

        const platformsToPost = (Object.keys(updatedItem.selectedPlatforms || {}) as Platform[]).filter(
          p => updatedItem.selectedPlatforms?.[p]
        );

        if (platformsToPost.length === 0) continue;

        const scheduledDate = rec.suggestedTime || new Date().toISOString();

        try {
          const mediaUrl = updatedItem.previewUrl.startsWith('http')
            ? updatedItem.previewUrl
            : await uploadMediaItem(updatedItem);

          if (!mediaUrl) continue;

          const title = updatedItem.captionText.trim()
            ? updatedItem.captionText.substring(0, 30) + '...'
            : 'New Post';

          const postId = `${Date.now()}-${rec.index}`;

          if (user) {
            const newPost: Post = {
              id: postId,
              content: updatedItem.captionText,
              mediaUrl: mediaUrl,
              mediaType: updatedItem.type,
              platforms: platformsToPost,
              status: 'Scheduled',
              author: { name: user.name, avatar: user.avatar },
              comments: [],
              scheduledDate: scheduledDate,
              clientId: selectedClient?.id,
            };

            const safePost = JSON.parse(JSON.stringify(newPost));
            await setDoc(doc(db, 'users', user.id, 'posts', postId), safePost);
          }

          // Create calendar event for each platform
          for (const platform of platformsToPost) {
            const newEvent: CalendarEvent = {
              id: `cal-${postId}-${platform}`,
              title: title,
              date: scheduledDate,
              type: updatedItem.type === 'video' ? 'Reel' : 'Post',
              platform: platform,
              status: 'Scheduled',
              thumbnail: mediaUrl,
            };

            await addCalendarEvent(newEvent);
          }

          scheduledItems.push(rec.index);
        } catch (err) {
          console.error(`Failed to schedule post ${rec.index}:`, err);
        }
      }

      // Remove scheduled items
      setComposeState(prev => ({
        ...prev,
        mediaItems: prev.mediaItems.filter((_, idx) => !scheduledItems.includes(idx)),
      }));

      showToast(`AI scheduled ${scheduledItems.length} post(s)!`, 'success');
      setIsAIAutoScheduleModalOpen(false);
      setAIRecommendations([]);
      setSelectedIndices(new Set());
    } catch (error) {
      console.error('Failed to apply AI schedule:', error);
      showToast('Failed to schedule posts.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkGenerateCaptions = async () => {
    const selectedItems = Array.from(selectedIndices)
      .map(i => composeState.mediaItems[i])
      .filter(item => item && item.previewUrl && !item.results.length);

    if (selectedItems.length === 0) {
      showToast('Please select posts with media that need captions generated.', 'error');
      return;
    }

    if (!canGenerate) {
      showToast('You have reached your monthly caption generation limit.', 'error');
      return;
    }

    setIsLoading(true);
    try {
      for (const item of selectedItems) {
        const index = composeState.mediaItems.findIndex(m => m.id === item.id);
        if (index === -1 || !item.data) continue;

        // Generate captions for this item
        try {
          const timestamp = Date.now();
          const extension = item.mimeType.split('/')[1] || 'png';
          const storagePath = `users/${user!.id}/uploads/${timestamp}.${extension}`;
          const storageRef = ref(storage, storagePath);

          const bytes = base64ToBytes(item.data);
          await uploadBytes(storageRef, bytes, {
            contentType: item.mimeType,
          });

          const mediaUrl = await getDownloadURL(storageRef);

          const res = await generateCaptions({
            mediaUrl,
            goal: item.postGoal,
            tone: item.postTone,
            promptText: undefined,
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

          handleUpdateMediaItem(index, {
            results: generatedResults,
            captionText: firstCaptionText,
          });

          handleCaptionGenerationComplete();
        } catch (err) {
          console.error(`Failed to generate captions for item ${index}:`, err);
        }
      }

      showToast(`Generated captions for ${selectedItems.length} post(s)!`, 'success');
    } catch (error) {
      console.error('Bulk generate failed:', error);
      showToast('Failed to generate some captions.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const uploadMedia = async (): Promise<string | undefined> => {
    if (!composeState.media || !user) return undefined;

    // If already a remote URL, return it
    if (composeState.media.previewUrl.startsWith('http')) {
      return composeState.media.previewUrl;
    }

    if (!composeState.media.data) return undefined;

    try {
      const timestamp = Date.now();
      const extension = composeState.media.mimeType.split('/')[1] || 'bin';
      const storagePath = `users/${user.id}/uploads/${timestamp}.${extension}`;
      const storageRef = ref(storage, storagePath);

      const bytes = base64ToBytes(composeState.media.data);

      await uploadBytes(storageRef, bytes, {
        contentType: composeState.media.mimeType
      });

      const downloadURL = await getDownloadURL(storageRef);
      return downloadURL;
    } catch (e) {
      console.error("Upload failed:", e);
      throw new Error("Failed to upload media.");
    }
  };

  const handlePublish = async () => {
    const platformsToPost = (Object.keys(selectedPlatforms) as Platform[]).filter(
      p => selectedPlatforms[p]
    );
    if (!composeState.captionText.trim() && !composeState.media) {
      showToast('Please write or generate content to post.', 'error');
      return;
    }
    if (platformsToPost.length === 0) {
      showToast('Please select at least one platform to post to.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      let mediaUrl = composeState.media?.previewUrl;
      if (
        composeState.media &&
        composeState.media.data &&
        !composeState.media.previewUrl.startsWith('http')
      ) {
        mediaUrl = await uploadMedia();
      }

      const title = composeState.captionText.trim()
        ? composeState.captionText.substring(0, 30) + '...'
        : 'New Post';

      const postId = Date.now().toString();
      const publishDate = new Date();

      if (user) {
        const newPost: Post = {
          id: postId,
          content: composeState.captionText,
          mediaUrl: mediaUrl,
          mediaType: composeState.media?.type,
          platforms: platformsToPost,
          status: 'Published',
          author: { name: user.name, avatar: user.avatar },
          comments: [],
          scheduledDate: publishDate.toISOString(),
          clientId: selectedClient?.id
        };

        const safePost = JSON.parse(JSON.stringify(newPost));
        await setDoc(doc(db, 'users', user.id, 'posts', postId), safePost);
      }

      // Create calendar event for each platform
      for (const platform of platformsToPost) {
        const newEvent: CalendarEvent = {
          id: `cal-${postId}-${platform}`,
          title: title,
          date: publishDate.toISOString(),
          type: composeState.media?.type === 'video' ? 'Reel' : 'Post',
          platform: platform,
          status: 'Published',
          thumbnail: mediaUrl
        };
        await addCalendarEvent(newEvent);
      }

      platformsToPost.forEach(platform => {
        showToast(`Caption published to ${platform}!`, 'success');
      });

      setIsPublished(true);
      setTimeout(() => {
        setIsPublished(false);
        resetCompose();
      }, 2000);
    } catch (e) {
      console.error(e);
      showToast('Failed to publish post.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleScheduleForReview = async (date: string) => {
    const platformsToPost = (Object.keys(selectedPlatforms) as Platform[]).filter(
      p => selectedPlatforms[p]
    );
    if (!composeState.captionText.trim() && !composeState.media) {
      showToast('Please add content to schedule for review.', 'error');
      return;
    }
    if (platformsToPost.length === 0) {
      showToast('Please select at least one platform.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      let mediaUrl = composeState.media?.previewUrl;
      if (
        composeState.media &&
        composeState.media.data &&
        !composeState.media.previewUrl.startsWith('http')
      ) {
        mediaUrl = await uploadMedia();
      }

      const title = composeState.captionText.trim()
        ? composeState.captionText.substring(0, 30) + '...'
        : 'New Post';

      const postId = Date.now().toString();

      if (user) {
        const newPost: Post = {
          id: postId,
          content: composeState.captionText,
          mediaUrl: mediaUrl,
          mediaType: composeState.media?.type,
          platforms: platformsToPost,
          status: 'In Review',
          author: { name: user.name, avatar: user.avatar },
          comments: [],
          scheduledDate: new Date(date).toISOString(),
          clientId: selectedClient?.id
        };

        const safePost = JSON.parse(JSON.stringify(newPost));
        await setDoc(doc(db, 'users', user.id, 'posts', postId), safePost);
      }

      const newEvent: CalendarEvent = {
        id: `cal-${postId}`,
        title: title,
        date: new Date(date).toISOString(),
        type: composeState.media?.type === 'video' ? 'Reel' : 'Post',
        platform: platformsToPost[0],
        status: 'In Review',
        thumbnail: mediaUrl
      };

      await addCalendarEvent(newEvent);
      showToast(
        `Post scheduled for review on ${new Date(date).toLocaleString([], {
          dateStyle: 'medium',
          timeStyle: 'short'
        })}`,
        'success'
      );
      resetCompose();
    } catch (e) {
      console.error(e);
      showToast("Failed to schedule post for review.", 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSchedule = async (date: string) => {
    const platformsToPost = (Object.keys(selectedPlatforms) as Platform[]).filter(
      p => selectedPlatforms[p]
    );
    if (!composeState.captionText.trim() && !composeState.media) {
      showToast('Please add content to schedule.', 'error');
      return;
    }
    if (platformsToPost.length === 0) {
      showToast('Please select at least one platform.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      let mediaUrl = composeState.media?.previewUrl;
      if (
        composeState.media &&
        composeState.media.data &&
        !composeState.media.previewUrl.startsWith('http')
      ) {
        mediaUrl = await uploadMedia();
      }

      const title = composeState.captionText.trim()
        ? composeState.captionText.substring(0, 30) + '...'
        : 'New Post';

      const postId = Date.now().toString();

      if (user) {
        const newPost: Post = {
          id: postId,
          content: composeState.captionText,
          mediaUrl: mediaUrl,
          mediaType: composeState.media?.type,
          platforms: platformsToPost,
          status: 'Scheduled',
          author: { name: user.name, avatar: user.avatar },
          comments: [],
          scheduledDate: new Date(date).toISOString(),
          clientId: selectedClient?.id
        };

        const safePost = JSON.parse(JSON.stringify(newPost));
        await setDoc(doc(db, 'users', user.id, 'posts', postId), safePost);
      }

      const newEvent: CalendarEvent = {
        id: `cal-${postId}`,
        title: title,
        date: new Date(date).toISOString(),
        type: composeState.media?.type === 'video' ? 'Reel' : 'Post',
        platform: platformsToPost[0],
        status: 'Scheduled',
        thumbnail: mediaUrl
      };

      await addCalendarEvent(newEvent);
      showToast(
        `Post scheduled for ${new Date(date).toLocaleString([], {
          dateStyle: 'medium',
          timeStyle: 'short'
        })}`,
        'success'
      );
      resetCompose();
    } catch (e) {
      console.error(e);
      showToast("Failed to schedule post.", 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSmartSchedule = () => {
    const now = new Date();
    const nextTuesday = new Date(now);
    const dayOfWeek = now.getDay(); // Sunday = 0, Tuesday = 2
    const daysUntilTuesday = (2 - dayOfWeek + 7) % 7;

    nextTuesday.setDate(
      now.getDate() + (daysUntilTuesday === 0 && now.getHours() >= 10 ? 7 : daysUntilTuesday)
    );
    nextTuesday.setHours(10, 0, 0, 0);

    const isoDate = nextTuesday.toISOString();
    setScheduleDate(isoDate.slice(0, 16));
    handleSchedule(isoDate);
  };

  // Download caption as text file
  const handleDownloadCaption = (caption: string, hashtags: string[] = []) => {
    const content = caption + '\n\n' + hashtags.join(' ');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `caption-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Caption downloaded!', 'success');
  };

  // Download image/video
  const handleDownloadImage = () => {
    if (!composeState.media?.previewUrl) return;
    const a = document.createElement('a');
    a.href = composeState.media.previewUrl;
    const extension = composeState.media.type === 'image' ? 'png' : 'mp4';
    a.download = `${composeState.media.type}-${Date.now()}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Media downloaded!', 'success');
  };

  // Save caption to profile
  const handleSaveCaption = async (caption: string, hashtags: string[] = []) => {
    if (!user) return;
    try {
      await saveGeneratedContent('caption', {
        caption,
        hashtags,
        prompt: composeState.media ? 'Image-based caption' : 'Text-based caption',
        goal: composeState.postGoal,
        tone: composeState.postTone,
      });
      showToast('Caption saved to profile!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to save caption', 'error');
    }
  };

  // Save image/video to profile
  const handleSaveImage = async () => {
    if (!user || !composeState.media) return;
    try {
      const contentType = composeState.media.type === 'image' ? 'image' : 'video';
      await saveGeneratedContent(contentType, {
        imageData: composeState.media.data,
        imageUrl: composeState.media.previewUrl,
        videoUrl: composeState.media.type === 'video' ? composeState.media.previewUrl : undefined,
        prompt: 'User uploaded media',
        goal: composeState.postGoal,
        tone: composeState.postTone,
      });
      showToast(`${composeState.media.type === 'image' ? 'Image' : 'Video'} saved to profile!`, 'success');
    } catch (err) {
      console.error(err);
      showToast(`Failed to save ${composeState.media.type}`, 'error');
    }
  };

  const handleSaveToWorkflow = async (status: 'Draft' | 'In Review') => {
    if (!user) return;
    const platformsToPost = (Object.keys(selectedPlatforms) as Platform[]).filter(
      p => selectedPlatforms[p]
    );

    if (!composeState.captionText.trim() && !composeState.media) {
      showToast('Please add content first.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      let mediaUrl = composeState.media?.previewUrl;
      if (
        composeState.media &&
        composeState.media.data &&
        !composeState.media.previewUrl.startsWith('http')
      ) {
        mediaUrl = await uploadMedia();
      }

      const title = composeState.captionText.trim()
        ? composeState.captionText.substring(0, 30) + '...'
        : 'New Post';

      const postId = Date.now().toString();
      const draftDate = new Date();
      // Set draft time to current time, but user can move it later
      draftDate.setHours(12, 0, 0, 0); // Default to noon for drafts

      const newPost: Post = {
        id: postId,
        content: composeState.captionText,
        mediaUrl: mediaUrl,
        mediaType: composeState.media?.type,
        platforms: platformsToPost.length > 0 ? platformsToPost : ['Instagram'],
        status: status,
        author: { name: user?.name || 'User', avatar: user?.avatar || '' },
        comments: [],
        scheduledDate: status === 'Draft' ? draftDate.toISOString() : undefined,
        clientId: selectedClient?.id
      };

      const postsCollectionRef = collection(db, 'users', user.id, 'posts');
      const safePost = JSON.parse(JSON.stringify(newPost));
      await setDoc(doc(postsCollectionRef, newPost.id), safePost);

      // Create calendar event for drafts (In Review posts will be handled by approvals workflow)
      if (status === 'Draft') {
        const platformsForCalendar: Platform[] = platformsToPost.length > 0 ? platformsToPost : ['Instagram' as Platform];
        for (const platform of platformsForCalendar) {
          const newEvent: CalendarEvent = {
            id: `cal-${postId}-${platform}`,
            title: title,
            date: draftDate.toISOString(),
            type: composeState.media?.type === 'video' ? 'Reel' : 'Post',
            platform: platform,
            status: 'Draft',
            thumbnail: mediaUrl
          };
          await addCalendarEvent(newEvent);
        }
      }

      showToast(
        status === 'Draft' ? 'Saved to Drafts!' : 'Submitted for Review!',
        'success'
      );
      resetCompose();
    } catch (e) {
      showToast('Failed to save post.', 'error');
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  // Generate captions using backend response shape (your current working logic)
  const generateForBase64 = async (base64Data: string, mimeType: string) => {
    if (!canGenerate) {
      showToast('You have reached your monthly caption generation limit.', 'error');
      return;
    }
    setIsLoading(true);
    setError(null);
    // Only clear caption text if auto-generate is enabled and there's no existing caption
    setComposeState(prev => ({ 
      ...prev, 
      results: [], 
      captionText: (!autoGenerateCaptions || prev.captionText.trim()) ? prev.captionText : '' 
    }));

    try {
      // Always upload images to Firebase Storage to avoid Vercel payload size limits (4.5MB)
      // Base64 encoding adds ~33% overhead, so even 3MB images can exceed the limit
      if (!user) {
        showToast('Please sign in to generate captions.', 'error');
        setIsLoading(false);
        return;
      }
      
      let mediaUrl: string;
      try {
        const timestamp = Date.now();
        const extension = mimeType.split('/')[1] || 'png';
        const storagePath = `users/${user.id}/uploads/${timestamp}.${extension}`;
        const storageRef = ref(storage, storagePath);
        
        const bytes = base64ToBytes(base64Data);
        await uploadBytes(storageRef, bytes, {
          contentType: mimeType
        });
        
        mediaUrl = await getDownloadURL(storageRef);
      } catch (uploadError) {
        console.error('Upload error:', uploadError);
        const mediaType = mimeType.startsWith('video') ? 'video' : 'image';
        showToast(`Failed to upload ${mediaType}. Please try again.`, 'error');
        setIsLoading(false);
        return;
      }

      const res = await generateCaptions({
        mediaUrl,
        goal: composeState.postGoal,
        tone: composeState.postTone,
        promptText: undefined
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
            hashtags: res.hashtags || []
          }
        ];
      }

      const firstCaptionText =
        generatedResults.length > 0
          ? generatedResults[0].caption +
            '\n\n' +
            (generatedResults[0].hashtags || []).join(' ')
          : '';

      setComposeState(prev => ({
        ...prev,
        results: generatedResults,
        captionText: firstCaptionText
      }));

      if (user) {
        setUser({
          ...user,
          monthlyCaptionGenerationsUsed:
            (user.monthlyCaptionGenerationsUsed || 0) + 1
        });
      }
    } catch (err) {
      console.error(err);
      setError('Failed to generate captions. Ensure your API Key is configured.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Only auto-generate captions if:
    // 1. Auto-generate toggle is enabled
    // 2. Media was just uploaded (has data and previewUrl is a data URL)
    // 3. No existing results
    // 4. No existing caption text (preserve calendar captions)
    if (
      autoGenerateCaptions &&
      composeState.media && 
      composeState.results.length === 0 && 
      composeState.media.data &&
      composeState.media.previewUrl.startsWith('data:') && // Only for newly uploaded images
      !composeState.captionText.trim() // Don't auto-generate if caption text already exists
    ) {
      generateForBase64(composeState.media.data, composeState.media.mimeType);
    }
  }, [composeState.media, autoGenerateCaptions]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileType = file.type.startsWith('image') ? 'image' : 'video';

    try {
      const base64 = await fileToBase64(file);
      const dataUrl = `data:${file.type};base64,${base64}`;

      setComposeState(prev => ({
        ...prev,
        media: { 
          data: base64, 
          mimeType: file.type, 
          previewUrl: dataUrl, 
          type: fileType,
          isGenerated: false // Uploaded file, not generated
        },
        results: [],
        // Preserve existing caption text if auto-generate is disabled or if caption exists
        captionText: (!autoGenerateCaptions || prev.captionText.trim()) ? prev.captionText : ''
      }));
    } catch (error) {
      showToast('Failed to process file.', 'error');
      console.error(error);
    }
  };

  const handleClearMedia = () => {
    setComposeState({
      media: null,
      mediaItems: [],
      results: [],
      captionText: '',
      postGoal: 'engagement',
      postTone: 'friendly'
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRegenerate = () => {
    if (composeState.media && composeState.media.data) {
      generateForBase64(composeState.media.data, composeState.media.mimeType);
    }
  };

  // Remix Logic
  const openRemixModal = (text: string) => {
    setRemixSourceText(text);
    setIsRemixModalOpen(true);
  };

  const handleRemix = async () => {
    setIsRemixing(true);
    try {
      const settingsOverride = {
        ...settings,
        tone: { formality: 50, humor: 50, empathy: 50 }
      };
      const result = await generateReply(
        remixSourceText,
        "content to repurpose",
        remixTargetPlatform,
        settingsOverride
      );
      setComposeState(prev => ({ ...prev, captionText: result }));
      setIsRemixModalOpen(false);
      showToast(`Remixed for ${remixTargetPlatform}!`, 'success');
    } catch (e) {
      showToast('Remix failed.', 'error');
    } finally {
      setIsRemixing(false);
    }
  };

  // Hashtag Logic
  const handleCreateHashtagSet = () => {
    if (!newHashtagSetName || !newHashtagSetTags) return;
    const tags = newHashtagSetTags.split(' ').filter(t => t.startsWith('#'));
    if (tags.length === 0) {
      showToast('Please include hashtags starting with #', 'error');
      return;
    }
    const newSet: HashtagSet = {
      id: Date.now().toString(),
      name: newHashtagSetName,
      tags
    };
    setHashtagSets(prev => [...prev, newSet]);
    setNewHashtagSetName('');
    setNewHashtagSetTags('');
    showToast('Hashtag set saved!', 'success');
  };

  const handleInsertHashtags = (tags: string[], index?: number) => {
    if (index !== undefined) {
      // Insert into specific media box
      handleUpdateMediaItem(index, {
        captionText: composeState.mediaItems[index].captionText + '\n\n' + tags.join(' ')
      });
    } else {
      // Legacy: insert into main caption (for single media mode)
      setComposeState(prev => ({
        ...prev,
        captionText: prev.captionText + '\n\n' + tags.join(' ')
      }));
    }
    setIsHashtagPopoverOpen(false);
  };

  const hasContent = !!composeState.captionText.trim() || !!composeState.media;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Preview Modal */}
      <MobilePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setPreviewMediaIndex(null);
        }}
        caption={
          previewMediaIndex !== null && composeState.mediaItems[previewMediaIndex]
            ? composeState.mediaItems[previewMediaIndex].captionText
            : composeState.captionText
        }
        media={
          previewMediaIndex !== null && composeState.mediaItems[previewMediaIndex]
            ? {
                previewUrl: composeState.mediaItems[previewMediaIndex].previewUrl,
                type: composeState.mediaItems[previewMediaIndex].type,
              }
            : composeState.media
            ? { previewUrl: composeState.media.previewUrl, type: composeState.media.type }
            : null
        }
        user={selectedClient || user}
      />

      {/* AI Auto-Schedule Modal */}
      {isAIAutoScheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                AI Auto-Schedule Recommendations
              </h3>
              <button
                onClick={() => {
                  setIsAIAutoScheduleModalOpen(false);
                  setAIRecommendations([]);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="mb-4 flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="auto-confirm"
                  checked={autoConfirmEnabled}
                  onChange={(e) => setAutoConfirmEnabled(e.target.checked)}
                  className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500"
                />
                <label htmlFor="auto-confirm" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                  Auto-confirm recommendations
                </label>
              </div>
              <button
                onClick={handleApplyAISchedule}
                disabled={isSaving}
                className="px-6 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <RefreshIcon className="animate-spin w-4 h-4" />
                    Scheduling...
                  </>
                ) : (
                  <>
                    <CalendarIcon className="w-4 h-4" />
                    Confirm & Schedule All
                  </>
                )}
              </button>
            </div>

            <div className="space-y-4">
              {aiRecommendations.map((rec) => {
                const item = rec.item;
                const topPlatforms = rec.recommendedPlatforms.slice(0, 3);
                const currentPlatforms = item.selectedPlatforms || {};
                
                return (
                  <div
                    key={rec.index}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-700/50"
                  >
                    <div className="flex gap-4">
                      {/* Media Preview */}
                      <div className="w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-600">
                        {item.previewUrl ? (
                          item.type === 'image' ? (
                            <img
                              src={item.previewUrl}
                              alt={`Post ${rec.index + 1}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <video
                              src={item.previewUrl}
                              className="w-full h-full object-cover"
                            />
                          )
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                            No Media
                          </div>
                        )}
                      </div>

                      {/* Recommendations */}
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold text-gray-900 dark:text-white">
                            Post {rec.index + 1}
                          </h4>
                          {rec.suggestedTime && (
                            <span className="text-xs text-gray-600 dark:text-gray-400">
                              {new Date(rec.suggestedTime).toLocaleString([], {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })}
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                          {item.captionText.substring(0, 100)}...
                        </p>

                        {/* Recommended Platforms */}
                        <div className="mb-3">
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Recommended Platforms:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {topPlatforms.map((platformRec) => {
                              const isSelected = currentPlatforms[platformRec.platform];
                              return (
                                <div
                                  key={platformRec.platform}
                                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs border ${
                                    isSelected
                                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                                  }`}
                                >
                                  <span>{platformIcons[platformRec.platform]}</span>
                                  <span>{platformRec.platform}</span>
                                  <span className="text-xs text-gray-500">
                                    ({platformRec.score}%)
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Platform Reasons */}
                        <div className="space-y-1 mb-2">
                          {topPlatforms.map((platformRec) => (
                            <p
                              key={platformRec.platform}
                              className="text-xs text-gray-600 dark:text-gray-400"
                            >
                              <span className="font-medium">{platformRec.platform}:</span>{' '}
                              {platformRec.reason}
                            </p>
                          ))}
                        </div>

                        {/* Add More Platforms Button */}
                        <button
                          onClick={() => {
                            // Toggle additional platforms - simple implementation
                            const updatedPlatforms = { ...currentPlatforms };
                            // Add Instagram if not already in top recommendations
                            if (!topPlatforms.some(p => p.platform === 'Instagram') && !updatedPlatforms.Instagram) {
                              updatedPlatforms.Instagram = true;
                            } else if (!updatedPlatforms.Facebook) {
                              updatedPlatforms.Facebook = true;
                            }
                            
                            handleUpdateMediaItem(rec.index, {
                              selectedPlatforms: updatedPlatforms,
                            });
                          }}
                          className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                        >
                          + Add another platform
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {autoConfirmEnabled && (
              <div className="mt-6 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  ⚠️ Auto-confirm is enabled. Clicking "Confirm & Schedule All" will automatically schedule all posts with AI recommendations.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Remix Modal */}
      {isRemixModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
              Remix Content
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Transform your caption for another platform.
            </p>

            <div className="grid grid-cols-3 gap-2 mb-6">
              {(['X', 'LinkedIn', 'Instagram', 'TikTok', 'Threads', 'Facebook'] as Platform[]).map(
                p => (
                  <button
                    key={p}
                    onClick={() => setRemixTargetPlatform(p)}
                    className={`p-2 border rounded-lg text-sm ${
                      remixTargetPlatform === p
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/50 text-primary-600'
                        : 'border-gray-200 dark:border-gray-600'
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsRemixModalOpen(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleRemix}
                disabled={isRemixing}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center gap-2"
              >
                {isRemixing && <RefreshIcon className="animate-spin" />}
                Remix
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
          Compose & Schedule
        </h2>
        <p className="mt-2 text-lg text-gray-500 dark:text-gray-400">
          Create content, generate AI captions, and schedule posts.
        </p>
        {isFinite(limit) && (
          <p className="mt-1 text-sm font-semibold text-primary-600 dark:text-primary-400">
            {usageLeft} generations left this month.
          </p>
        )}
      </div>

      {/* Media Upload Boxes */}
      <div className="space-y-6">
        {composeState.mediaItems.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pb-2">
            <button
              onClick={handleBulkGenerateCaptions}
              disabled={selectedIndices.size === 0 || isLoading || !canGenerate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <SparklesIcon className="w-3.5 h-3.5" />
              Generate Captions ({selectedIndices.size})
            </button>
            <button
              onClick={handleScheduleAll}
              disabled={selectedIndices.size === 0 || isSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 rounded-md hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              Schedule All ({selectedIndices.size})
            </button>
            <button
              onClick={handleDeleteAll}
              disabled={selectedIndices.size === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <TrashIcon className="w-3.5 h-3.5" />
              Delete All ({selectedIndices.size})
            </button>
            <button
              onClick={handleGenerateBestTimes}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 rounded-md hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <SparklesIcon className="w-3.5 h-3.5" />
              {isLoading ? 'Generating...' : 'Generate Best Times (AI)'}
            </button>
            <button
              onClick={handleAIAutoSchedule}
              disabled={selectedIndices.size === 0 || isAnalyzing || isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <SparklesIcon className="w-3.5 h-3.5" />
              {isAnalyzing ? 'Analyzing...' : `AI Auto-Schedule (${selectedIndices.size})`}
            </button>
          </div>
        )}

        {/* Always show media boxes - initialize with one empty box if none exist */}
        {composeState.mediaItems.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4">
            <MediaBox
              key="initial"
              mediaItem={{
                id: Date.now().toString(),
                previewUrl: '',
                data: '',
                mimeType: '',
                type: 'image',
                results: [],
                captionText: '',
                postGoal: composeState.postGoal,
                postTone: composeState.postTone,
                selectedPlatforms: {
                  Instagram: false,
                  TikTok: false,
                  X: false,
                  Threads: false,
                  YouTube: false,
                  LinkedIn: false,
                  Facebook: false,
                },
              }}
              index={0}
              onUpdate={(idx, updates) => {
                if (composeState.mediaItems.length === 0) {
                  handleAddMediaBox();
                  setTimeout(() => {
                    handleUpdateMediaItem(0, updates);
                  }, 0);
                } else {
                  handleUpdateMediaItem(idx, updates);
                }
              }}
              onRemove={() => {}}
              canGenerate={canGenerate}
              onGenerateComplete={handleCaptionGenerationComplete}
              goalOptions={goalOptions}
              toneOptions={toneOptions}
              isSelected={false}
              onToggleSelect={() => {}}
              onPreview={handlePreviewMedia}
              onPublish={handlePublishMedia}
              onSchedule={handleScheduleMedia}
              platformIcons={platformIcons}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4">
            {composeState.mediaItems.map((item, index) => (
              <MediaBox
                key={item.id}
                mediaItem={item}
                index={index}
                onUpdate={handleUpdateMediaItem}
                onRemove={handleRemoveMediaItem}
                canGenerate={canGenerate}
                onGenerateComplete={handleCaptionGenerationComplete}
                goalOptions={goalOptions}
                toneOptions={toneOptions}
                isSelected={selectedIndices.has(index)}
                onToggleSelect={handleToggleSelect}
                onPreview={handlePreviewMedia}
                onPublish={handlePublishMedia}
                onSchedule={handleScheduleMedia}
                platformIcons={platformIcons}
              />
            ))}
            {/* Add Image/Video button - Always show compact plus sign */}
            <button
              onClick={handleAddMediaBox}
              className="h-24 flex items-center justify-center text-primary-600 dark:text-primary-400 bg-white dark:bg-gray-800 border-2 border-dashed border-primary-300 dark:border-primary-700 rounded-xl hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors shadow-sm"
              title="Add Image/Video"
            >
              <PlusIcon className="w-8 h-8" />
            </button>
          </div>
        )}
      </div>

      {/* Goal & tone - only show for legacy single media mode */}
      {composeState.mediaItems.length === 0 && composeState.media && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="goal"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Goal of the post
            </label>
            <select
              id="goal"
              value={composeState.postGoal}
              onChange={e => setComposeState(prev => ({ ...prev, postGoal: e.target.value }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
            >
              {goalOptions.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="tone"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Tone of voice
            </label>
            <select
              id="tone"
              value={composeState.postTone}
              onChange={e => setComposeState(prev => ({ ...prev, postTone: e.target.value }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
            >
              {toneOptions.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {error && <p className="text-center text-red-500">{error}</p>}

      {isPublished && (
        <div className="text-center p-8 bg-green-50 dark:bg-green-900/50 rounded-xl">
          <CheckCircleIcon className="w-12 h-12 text-green-500 mx-auto" />
          <h3 className="mt-2 text-xl font-semibold text-green-800 dark:text-green-200">
            Published Successfully!
          </h3>
        </div>
      )}

      {isLoading && (
        <div className="text-center">
          <svg
            className="animate-spin h-8 w-8 text-primary-600 mx-auto"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <p className="mt-2 font-semibold text-gray-700 dark:text-gray-300">
            Generating captions...
          </p>
        </div>
      )}

      {/* Editor & AI suggestions */}
      <div className="space-y-6">
        {composeState.results.length > 0 && (
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                AI Suggestions
              </h3>
              <button
                onClick={handleRegenerate}
                disabled={isLoading || !canGenerate}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-primary-700 dark:text-primary-300 bg-primary-100 dark:bg-primary-900/50 rounded-md hover:bg-primary-200 dark:hover:bg-primary-900 disabled:opacity-50"
              >
                <RedoIcon /> Regenerate
              </button>
            </div>
            {composeState.results.map((result, index) => (
              <div
                key={index}
                className="group relative p-4 rounded-lg transition-colors bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <div
                  onClick={() =>
                    setComposeState(prev => ({
                      ...prev,
                      captionText:
                        result.caption +
                        '\n\n' +
                        (result.hashtags || []).join(' ')
                    }))
                  }
                  className="cursor-pointer"
                >
                  <p className="text-gray-800 dark:text-gray-200">
                    {result.caption}
                  </p>
                  <p className="text-primary-600 dark:text-primary-400 mt-2 text-sm">
                    {(result.hashtags || []).join(' ')}
                  </p>
                </div>
                <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleDownloadCaption(result.caption, result.hashtags);
                    }}
                    className="p-2 bg-white dark:bg-gray-600 rounded-full shadow text-primary-600 dark:text-primary-300"
                    title="Download caption"
                  >
                    <DownloadIcon />
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleSaveCaption(result.caption, result.hashtags);
                    }}
                    className="p-2 bg-white dark:bg-gray-600 rounded-full shadow text-green-600 dark:text-green-300"
                    title="Save to profile"
                  >
                    <CheckCircleIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      openRemixModal(result.caption);
                    }}
                    className="p-2 bg-white dark:bg-gray-600 rounded-full shadow text-primary-600 dark:text-primary-300"
                    title="Remix for another platform"
                  >
                    <RefreshIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scheduling - Legacy single media mode only */}
          {composeState.mediaItems.length === 0 && isScheduling && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md space-y-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg space-y-4 animate-fade-in">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-blue-600 dark:text-white" />
                  <h4 className="font-semibold text-blue-800 dark:text-blue-200">
                    Schedule Post
                  </h4>
                </div>

                <div className="flex flex-col gap-3">
                  <label className="text-sm text-gray-600 dark:text-gray-400">
                    Select Date & Time:
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="datetime-local"
                      value={scheduleDate}
                      onChange={e => setScheduleDate(e.target.value)}
                      className="flex-grow p-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                    />
                    <button
                      onClick={() => handleSchedule(scheduleDate)}
                      disabled={!scheduleDate || isSaving}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium whitespace-nowrap flex items-center gap-2"
                    >
                      {isSaving ? <RefreshIcon className="animate-spin" /> : null}
                      Confirm Schedule
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="h-px bg-blue-200 dark:bg-blue-800 flex-grow"></div>
                  <span className="text-xs text-blue-500 uppercase font-bold">
                    OR
                  </span>
                  <div className="h-px bg-blue-200 dark:bg-blue-800 flex-grow"></div>
                </div>

                <button
                  onClick={handleSmartSchedule}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-purple-700 dark:text-purple-300 bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-900/40 dark:to-blue-900/40 border border-purple-200 dark:border-purple-800 rounded-md hover:shadow-md transition-all"
                >
                  <SparklesIcon className="w-4 h-4" /> Schedule for Best Time (AI)
                </button>
              </div>
            </div>
          )}

    </div>
  );
};

type ComposeTab = 'captions' | 'image' | 'video';

const tabs: { id: ComposeTab; label: string; icon: React.ReactNode }[] = [
  { id: 'captions', label: 'Captions', icon: <CaptionIcon /> },
  { id: 'image', label: 'Image', icon: <ImageIcon /> },
  { id: 'video', label: 'Video', icon: <VideoIcon /> }
];

export const Compose: React.FC = () => {
  const {
    user,
    setUser,
    setActivePage,
    composeContext,
    clearComposeContext,
    setComposeState
  } = useAppContext();
  const [activeTab, setActiveTab] = useState<ComposeTab>('captions');
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (composeContext) {
      if (composeContext.type === 'Reel' || composeContext.type === 'video') {
        setActiveTab('video');
      } else if (composeContext.type === 'Story' || composeContext.type === 'image') {
        setActiveTab('image');
      } else {
        setActiveTab('captions');
        setComposeState(prev => ({ ...prev, captionText: composeContext.topic }));
      }
      setInitialPrompt(composeContext.topic);
      clearComposeContext();
    }
  }, [composeContext, clearComposeContext, setComposeState]);

  // Clear compose state when user changes (new login)
  useEffect(() => {
    if (user) {
      // Reset compose state to ensure clean slate for new users
      setComposeState({
        media: null,
        mediaItems: [],
        results: [],
        captionText: "",
        postGoal: "engagement",
        postTone: "friendly",
      });
    }
  }, [user?.id]); // Only reset when user ID changes (new login)

  const handleGenerateCaptionsForImage = async (base64Data: string) => {
    // Upload image to Firebase Storage first to avoid payload size limits
    if (!user) return;
    
    try {
      const timestamp = Date.now();
      const storagePath = `users/${user.id}/uploads/${timestamp}.png`;
      const storageRef = ref(storage, storagePath);
      
      const bytes = base64ToBytes(base64Data);
      await uploadBytes(storageRef, bytes, {
        contentType: 'image/png'
      });
      
      const downloadURL = await getDownloadURL(storageRef);
      
      setComposeState(prev => ({
        ...prev,
        media: {
          data: base64Data, // Keep base64 for preview
          mimeType: 'image/png',
          previewUrl: downloadURL, // Use Firebase URL
          type: 'image',
          isGenerated: true // Mark as generated
        },
        results: [],
        // Preserve existing caption text if it exists (from calendar)
        captionText: prev.captionText.trim() ? prev.captionText : '',
        postGoal: prev.postGoal || 'engagement',
        postTone: prev.postTone || 'friendly'
      }));
      setActiveTab('captions');
    } catch (error) {
      console.error('Failed to upload image:', error);
      // Fallback to base64 preview if upload fails
      setComposeState(prev => ({
        ...prev,
        media: {
          data: base64Data,
          mimeType: 'image/png',
          previewUrl: `data:image/png;base64,${base64Data}`,
          type: 'image',
          isGenerated: true
        },
        results: [],
        captionText: '',
        postGoal: 'engagement',
        postTone: 'friendly',
      }));
      setActiveTab('captions');
    }
  };

  const handleImageGeneration = () => {
    if (user)
      setUser({
        ...user,
        monthlyImageGenerationsUsed: user.monthlyImageGenerationsUsed + 1
      });
  };

  const handleVideoGeneration = () => {
    if (user)
      setUser({
        ...user,
        monthlyVideoGenerationsUsed: user.monthlyVideoGenerationsUsed + 1
      });
  };

  const renderTabContent = () => {
    const isAdmin = user?.role === 'Admin';
    const isBusiness = user?.userType === 'Business';
    // Get actual userType from context - use explicit check to ensure Business users get correct messages
    const userType: 'Creator' | 'Business' = isBusiness ? 'Business' : 'Creator';
    const userPlan = user?.plan || 'Free';
    const isAgency = (userPlan === 'Agency') || isAdmin;
    const isElite = (userPlan === 'Elite') || isAgency;
    const isPro = (userPlan === 'Pro') || isElite;
    const isGrowth = (userPlan === 'Growth') || isAgency;

    const monthlyImageUsed = user?.monthlyImageGenerationsUsed ?? 0;
    const monthlyVideoUsed = user?.monthlyVideoGenerationsUsed ?? 0;

    switch (activeTab) {
      case 'captions':
        return <CaptionGenerator />;
      case 'image':
        return (
          <div className="text-center p-12 bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-100 dark:border-gray-700">
            <ImageIcon className="w-16 h-16 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Coming Soon</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              AI Image Generation is currently under development.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              Use the Captions tab to upload images and generate captions.
            </p>
          </div>
        );
      case 'video':
        return (
          <div className="text-center p-12 bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-100 dark:border-gray-700">
            <VideoIcon className="w-16 h-16 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Coming Soon</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              AI Video Generation is currently under development.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              Use the Captions tab to upload videos and generate captions.
            </p>
          </div>
        );
      default:
        return <CaptionGenerator />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-center border-b border-gray-200 dark:border-gray-700 mb-8">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-3 px-4 py-3 font-semibold border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>
      {renderTabContent()}
    </div>
  );
};
