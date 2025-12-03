import React, { useState, useRef, useEffect, useMemo } from 'react';
import { generateCaptions, generateReply, saveGeneratedContent } from "../src/services/geminiService";
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
import { collection, setDoc, doc } from 'firebase/firestore';
// @ts-ignore
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { scheduleMultiplePosts } from '../src/services/smartSchedulingService';
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

  // Persist mediaItems to localStorage
  useEffect(() => {
    if (composeState.mediaItems.length > 0) {
      const itemsToSave = composeState.mediaItems.map(item => ({
        ...item,
        // Don't persist base64 data (too large), only keep previewUrl
        data: item.previewUrl.startsWith('http') ? '' : item.data,
      }));
      localStorage.setItem('compose_mediaItems', JSON.stringify(itemsToSave));
    }
  }, [composeState.mediaItems]);

  // Load mediaItems from localStorage on mount
  useEffect(() => {
    if (user && composeState.mediaItems.length === 0) {
      try {
        const saved = localStorage.getItem('compose_mediaItems');
        if (saved) {
          const items = JSON.parse(saved) as MediaItemState[];
          // Only load items that have previewUrls (media was uploaded)
          const validItems = items.filter(item => item.previewUrl);
          if (validItems.length > 0) {
            setComposeState(prev => ({
              ...prev,
              mediaItems: validItems,
            }));
          }
        }
      } catch (e) {
        console.error('Failed to load saved media items:', e);
      }
    }
  }, [user?.id]);

  // Clear localStorage when all items are removed
  useEffect(() => {
    if (composeState.mediaItems.length === 0) {
      localStorage.removeItem('compose_mediaItems');
    }
  }, [composeState.mediaItems.length]);

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

  const handleRemoveMediaItem = (index: number) => {
    setComposeState(prev => ({
      ...prev,
      mediaItems: prev.mediaItems.filter((_, i) => i !== index),
    }));
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

    const platformsToPost = (Object.keys(selectedPlatforms) as Platform[]).filter(
      p => selectedPlatforms[p]
    );
    if (platformsToPost.length === 0) {
      showToast('Please select at least one platform.', 'error');
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

    const platformsToPost = (Object.keys(selectedPlatforms) as Platform[]).filter(
      p => selectedPlatforms[p]
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

    const platformsToPost = (Object.keys(selectedPlatforms) as Platform[]).filter(
      p => selectedPlatforms[p]
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

      return await getDownloadURL(storageRef);
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
        {/* Toggle for auto-generating captions - only for legacy single media mode */}
        {composeState.mediaItems.length === 0 && (
          <div className="mt-3 flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoGenerateCaptions}
                onChange={(e) => setAutoGenerateCaptions(e.target.checked)}
                className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 dark:focus:ring-primary-400 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Auto-generate captions when uploading images
              </span>
            </label>
          </div>
        )}
      </div>

      {/* Media Upload Boxes */}
      <div className="space-y-6">
        {composeState.mediaItems.length > 0 && (
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={handleScheduleAll}
                disabled={selectedIndices.size === 0 || isSaving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 rounded-md hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors disabled:opacity-50"
              >
                <CalendarIcon className="w-4 h-4" />
                Schedule All ({selectedIndices.size})
              </button>
              <button
                onClick={handleDeleteAll}
                disabled={selectedIndices.size === 0}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
              >
                <TrashIcon className="w-4 h-4" />
                Delete All ({selectedIndices.size})
              </button>
            </div>
            <button
              onClick={handleGenerateBestTimes}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 rounded-md hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors disabled:opacity-50"
            >
              <SparklesIcon className="w-4 h-4" />
              {isLoading ? 'Generating...' : 'Generate Best Times (AI)'}
            </button>
          </div>
        )}

        {composeState.mediaItems.length === 0 ? (
          <div
            onClick={handleAddMediaBox}
            className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md border-2 border-dashed border-gray-300 dark:border-gray-600 cursor-pointer hover:border-primary-400 dark:hover:border-primary-600 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="p-4 bg-primary-100 dark:bg-primary-900/30 rounded-full">
                <UploadIcon className="w-8 h-8 text-primary-600 dark:text-primary-400" />
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  Upload Image or Video
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Click to add your first post
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="relative">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                  selectedPlatforms={selectedPlatforms}
                />
              ))}
              {/* Add Image/Video button beside boxes */}
              {composeState.mediaItems.some(item => item.previewUrl) && (
                <div className="flex items-center">
                  <button
                    onClick={handleAddMediaBox}
                    className="w-full h-full min-h-[200px] flex flex-col items-center justify-center gap-3 px-4 py-6 text-sm font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 border-2 border-dashed border-primary-300 dark:border-primary-700 rounded-xl hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
                  >
                    <PlusIcon className="w-8 h-8" />
                    <span>Add Image/Video</span>
                  </button>
                </div>
              )}
            </div>
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

        {/* Hashtag Manager */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="text-primary-600 dark:text-primary-400">
                <HashtagIcon />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Hashtag Manager
              </h3>
            </div>
            <button
              onClick={() => setIsHashtagPopoverOpen(!isHashtagPopoverOpen)}
              className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
            >
              {isHashtagPopoverOpen ? 'Hide' : 'Manage'}
            </button>
          </div>

          {isHashtagPopoverOpen && (
            <div className="space-y-4">
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {hashtagSets && hashtagSets.length > 0 ? (
                  hashtagSets.map(set => (
                    <div
                      key={set.id}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                    >
                      <div className="flex-1">
                        <span className="font-semibold text-sm text-gray-900 dark:text-white">
                          {set.name}
                        </span>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {set.tags.join(' ')}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          // Insert into first media box with caption, or show toast
                          const firstBoxWithCaption = composeState.mediaItems.findIndex(
                            item => item.previewUrl && item.captionText.trim()
                          );
                          if (firstBoxWithCaption !== -1) {
                            handleUpdateMediaItem(firstBoxWithCaption, {
                              captionText: composeState.mediaItems[firstBoxWithCaption].captionText + '\n\n' + set.tags.join(' ')
                            });
                            showToast(`Added hashtags to Post ${firstBoxWithCaption + 1}`, 'success');
                          } else {
                            showToast('Add a caption to a post first to insert hashtags', 'error');
                          }
                        }}
                        className="ml-3 px-3 py-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 rounded-md hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
                      >
                        Use
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                    No saved hashtag sets yet. Create one below.
                  </p>
                )}
              </div>

              <div className="border-t pt-4 dark:border-gray-700">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                  Create New Hashtag Set
                </h4>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newHashtagSetName}
                    onChange={e => setNewHashtagSetName(e.target.value)}
                    placeholder="Set Name (e.g. Tech, Fashion, Food)"
                    className="w-full p-2 text-sm border rounded-md dark:bg-gray-900 dark:border-gray-600 dark:text-white"
                  />
                  <input
                    type="text"
                    value={newHashtagSetTags}
                    onChange={e => setNewHashtagSetTags(e.target.value)}
                    placeholder="#hashtag1 #hashtag2 #hashtag3"
                    className="w-full p-2 text-sm border rounded-md dark:bg-gray-900 dark:border-gray-600 dark:text-white"
                  />
                  <button
                    onClick={handleCreateHashtagSet}
                    className="w-full flex justify-center items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 transition-colors"
                  >
                    <PlusIcon className="w-4 h-4" /> Save Hashtag Set
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Platforms */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Publish to
            </label>
            <div className="mt-2 flex flex-wrap gap-3">
              {(Object.keys(platformIcons) as Platform[]).map(platform => (
                <button
                  key={platform}
                  onClick={() => handlePlatformToggle(platform)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-colors ${
                    selectedPlatforms[platform]
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                      : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className="dark:text-white">
                    {platformIcons[platform]}
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {platform}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Scheduling */}
          {isScheduling && (
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
          )}

          {/* Footer actions */}
          <div className="flex flex-wrap justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            {composeState.mediaItems.length > 0 ? (
              <>
                {/* Batch actions */}
                <button
                  onClick={() => setIsPreviewOpen(true)}
                  disabled={composeState.mediaItems.length === 0}
                  className="flex items-center gap-2 px-4 py-2 text-base font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  <MobileIcon className="w-5 h-5" /> Preview
                </button>
                {isScheduling && (
                  <button
                    onClick={() => handleBulkSchedule(false)}
                    disabled={composeState.mediaItems.length === 0 || isSaving}
                    className="flex items-center gap-2 px-6 py-2 text-base font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50"
                  >
                    {isSaving ? <RefreshIcon className="animate-spin" /> : null}
                    <CalendarIcon className="w-5 h-5" /> Bulk Schedule ({composeState.mediaItems.length})
                  </button>
                )}
                {!isScheduling && (
                  <button
                    onClick={() => handleBulkSchedule(true)}
                    disabled={composeState.mediaItems.length === 0 || isSaving}
                    className="flex items-center gap-2 px-6 py-2 text-base font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    {isSaving ? <RefreshIcon className="animate-spin" /> : null}
                    <SendIcon className="w-5 h-5" /> Publish All ({composeState.mediaItems.length})
                  </button>
                )}
                <button
                  onClick={() => setIsScheduling(prev => !prev)}
                  className={`flex items-center gap-2 px-6 py-2 text-base font-medium text-white rounded-md transition-colors ${
                    isScheduling ? 'bg-gray-500 hover:bg-gray-600' : 'bg-purple-600 hover:bg-purple-700'
                  }`}
                >
                  <CalendarIcon className="w-5 h-5" />{' '}
                  {isScheduling ? 'Cancel Schedule' : 'Schedule'}
                </button>
              </>
            ) : (
              <>
                {/* Single post actions (legacy) */}
                <button
                  onClick={() => setIsPreviewOpen(true)}
                  disabled={!hasContent}
                  className="flex items-center gap-2 px-4 py-2 text-base font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  <MobileIcon className="w-5 h-5" /> Preview
                </button>
                <button
                  onClick={() => handleSaveToWorkflow('Draft')}
                  disabled={!hasContent || isSaving}
                  className="flex items-center gap-2 px-4 py-2 text-base font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  {isSaving ? <RefreshIcon className="animate-spin" /> : null}
                  Save Draft
                </button>
                {isAdminOrAgency && (
                  <button
                    onClick={() => handleSaveToWorkflow('In Review')}
                    disabled={!hasContent || isSaving}
                    className="flex items-center gap-2 px-4 py-2 text-base font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-900/20 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-50"
                  >
                    {isSaving ? <RefreshIcon className="animate-spin" /> : null}
                    <ClipboardCheckIcon className="w-5 h-5" /> Submit for Review
                  </button>
                )}
                {isAdminOrAgency && isScheduling && (
                  <button
                    onClick={() => {
                      if (!scheduleDate) {
                        showToast('Please select a date and time to schedule for review.', 'error');
                        return;
                      }
                      handleScheduleForReview(scheduleDate);
                    }}
                    disabled={!hasContent || !scheduleDate || isSaving}
                    className="flex items-center gap-2 px-4 py-2 text-base font-medium text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-900 bg-purple-50 dark:bg-purple-900/20 rounded-md hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors disabled:opacity-50"
                  >
                    {isSaving ? <RefreshIcon className="animate-spin" /> : null}
                    <CalendarIcon className="w-5 h-5" /> Schedule for Review
                  </button>
                )}
                <button
                  onClick={() => setIsScheduling(prev => !prev)}
                  className={`flex items-center gap-2 px-6 py-2 text-base font-medium text-white rounded-md transition-colors ${
                    isScheduling ? 'bg-gray-500 hover:bg-gray-600' : 'bg-purple-600 hover:bg-purple-700'
                  }`}
                >
                  <CalendarIcon className="w-5 h-5" />{' '}
                  {isScheduling ? 'Cancel Schedule' : 'Schedule'}
                </button>
                {!isScheduling && (
                  <button
                    onClick={handlePublish}
                    className="flex items-center gap-2 px-6 py-2 text-base font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                  >
                    <SendIcon className="w-5 h-5" /> Publish Now
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
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
        // Business users: Only Growth and Agency plans
        if (isBusiness) {
          if (isAgency) {
            return (
              <ImageGenerator
                onGenerate={handleImageGeneration}
                onGenerateCaptions={handleGenerateCaptionsForImage}
                initialPrompt={initialPrompt}
              />
            );
          }
          if (isGrowth) {
            // Growth plan gets limited image generations (same as Pro for now)
            if (monthlyImageUsed < 50) {
              return (
                <ImageGenerator
                  onGenerate={handleImageGeneration}
                  onGenerateCaptions={handleGenerateCaptionsForImage}
                  usageLeft={50 - monthlyImageUsed}
                  initialPrompt={initialPrompt}
                />
              );
            }
          }
          // Business Starter users see upgrade prompt - we're already in isBusiness block
          return (
            <UpgradePrompt
              featureName="AI Image Generation"
              onUpgradeClick={() => setActivePage('pricing')}
              userType="Business"
            />
          );
        }
        // Creator users: Pro, Elite, Agency plans
        if (isAgency) {
          return (
            <ImageGenerator
              onGenerate={handleImageGeneration}
              onGenerateCaptions={handleGenerateCaptionsForImage}
              initialPrompt={initialPrompt}
            />
          );
        }
        if (isElite && monthlyImageUsed < 500) {
          return (
            <ImageGenerator
              onGenerate={handleImageGeneration}
              onGenerateCaptions={handleGenerateCaptionsForImage}
              usageLeft={500 - monthlyImageUsed}
              initialPrompt={initialPrompt}
            />
          );
        }
        if (isPro && monthlyImageUsed < 50) {
          return (
            <ImageGenerator
              onGenerate={handleImageGeneration}
              onGenerateCaptions={handleGenerateCaptionsForImage}
              usageLeft={50 - monthlyImageUsed}
              initialPrompt={initialPrompt}
            />
          );
        }
        // Creator users who don't have access
        return (
          <UpgradePrompt
            featureName="AI Image Generation"
            onUpgradeClick={() => setActivePage('pricing')}
            userType={userType}
          />
        );
      case 'video':
        // Business users: Only Growth and Agency plans
        if (isBusiness) {
          if (isAgency && monthlyVideoUsed < 50) {
            return (
              <VideoGenerator
                onGenerate={handleVideoGeneration}
                usageLeft={50 - monthlyVideoUsed}
              />
            );
          }
          if (isGrowth && monthlyVideoUsed < 1) {
            return (
              <VideoGenerator
                onGenerate={handleVideoGeneration}
                usageLeft={1 - monthlyVideoUsed}
              />
            );
          }
          // Business Starter users see upgrade prompt - we're already in isBusiness block
          return (
            <UpgradePrompt
              featureName="AI Video Generation"
              onUpgradeClick={() => setActivePage('pricing')}
              userType="Business"
            />
          );
        }
        // Creator users: Pro, Elite, Agency plans
        if (isElite && monthlyVideoUsed < 25) {
          return (
            <VideoGenerator
              onGenerate={handleVideoGeneration}
              usageLeft={25 - monthlyVideoUsed}
            />
          );
        }
        if (isAgency && monthlyVideoUsed < 50) {
          return (
            <VideoGenerator
              onGenerate={handleVideoGeneration}
              usageLeft={50 - monthlyVideoUsed}
            />
          );
        }
        if (isPro && monthlyVideoUsed < 1) {
          return (
            <VideoGenerator
              onGenerate={handleVideoGeneration}
              usageLeft={1 - monthlyVideoUsed}
            />
          );
        }
        // Creator users who don't have access
        return (
          <UpgradePrompt
            featureName="AI Video Generation"
            onUpgradeClick={() => setActivePage('pricing')}
            userType={userType}
          />
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
