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
import { db, storage } from '../firebaseConfig';
import { collection, setDoc, doc } from 'firebase/firestore';
// @ts-ignore
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { scheduleMultiplePosts } from '../src/services/smartSchedulingService';

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

interface CaptionGeneratorProps {
  batchItems: Array<{
    id: string;
    file: File;
    media: { data: string; mimeType: string; previewUrl: string; type: 'image' | 'video' };
    caption: string;
    captionResults: CaptionResult[];
    isLoading: boolean;
    isScheduled: boolean;
    scheduledDate?: string;
    platforms: Platform[];
  }>;
  setBatchItems: React.Dispatch<React.SetStateAction<Array<{
    id: string;
    file: File;
    media: { data: string; mimeType: string; previewUrl: string; type: 'image' | 'video' };
    caption: string;
    captionResults: CaptionResult[];
    isLoading: boolean;
    isScheduled: boolean;
    scheduledDate?: string;
    platforms: Platform[];
  }>>>;
  isBatchMode: boolean;
  setIsBatchMode: React.Dispatch<React.SetStateAction<boolean>>;
  autoPost: boolean;
  setAutoPost: React.Dispatch<React.SetStateAction<boolean>>;
  autoGenerateCaptions: boolean;
  setAutoGenerateCaptions: React.Dispatch<React.SetStateAction<boolean>>;
  generateCaptionForBatchItem: (itemId: string) => Promise<void>;
  handleScheduleBatchItem: (itemId: string, date: string) => Promise<void>;
  handlePostBatchItem: (itemId: string) => Promise<void>;
  handlePostAllBatchItems: () => Promise<void>;
  handleScheduleAllBatchItems: () => Promise<void>;
  handleRemoveBatchItem: (itemId: string) => void;
}

const CaptionGenerator: React.FC<CaptionGeneratorProps> = ({ 
  batchItems, 
  setBatchItems, 
  isBatchMode, 
  setIsBatchMode,
  autoPost,
  setAutoPost,
  autoGenerateCaptions,
  setAutoGenerateCaptions,
  generateCaptionForBatchItem,
  handleScheduleBatchItem,
  handlePostBatchItem,
  handlePostAllBatchItems,
  handleScheduleAllBatchItems,
  handleRemoveBatchItem
}) => {
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

  // Scheduling state
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');

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
          autoPost: autoPost,
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
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // If single file AND batch mode is OFF, use normal workflow
    if (files.length === 1 && !isBatchMode) {
      const file = files[0];
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
            isGenerated: false
          },
          results: [],
          // Preserve existing caption text if auto-generate is disabled or if caption exists
          captionText: (!autoGenerateCaptions || prev.captionText.trim()) ? prev.captionText : ''
        }));
      } catch (error) {
        showToast('Failed to process file.', 'error');
        console.error(error);
      }
      
      // Clear the input
      if (event.target) {
        event.target.value = '';
      }
      return;
    }

    // Batch mode: process files (multiple files OR batch mode enabled)
    const newItems: typeof batchItems = [];
    const baseTimestamp = Date.now();
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileType = file.type.startsWith('image') ? 'image' : 'video';
      
      try {
        const base64 = await fileToBase64(file);
        // Create proper data URL for preview
        const dataUrl = `data:${file.type};base64,${base64}`;
        
        // Use unique ID with timestamp and index, plus random to ensure uniqueness
        const itemId = `batch_${baseTimestamp}_${i}_${Math.random().toString(36).substr(2, 9)}`;
        newItems.push({
          id: itemId,
          file,
          media: {
            data: base64,
            mimeType: file.type,
            previewUrl: dataUrl, // This should be a valid data URL
            type: fileType
          },
          caption: '',
          captionResults: [],
          isLoading: true,
          isScheduled: false,
          platforms: [],
          postGoal: composeState.postGoal || 'engagement',
          postTone: composeState.postTone || 'friendly'
        });
      } catch (error) {
        console.error(`Failed to process file ${file.name}:`, error);
        showToast(`Failed to process ${file.name}`, 'error');
      }
    }
    
    if (newItems.length > 0) {
      setIsBatchMode(true); // Enable batch mode when items are added
      setBatchItems(prev => [...prev, ...newItems]);
      showToast(`Added ${newItems.length} file${newItems.length > 1 ? 's' : ''} to batch`, 'success');
      
      // Generate captions for each item (process after state update)
      setTimeout(() => {
        newItems.forEach(item => {
          generateCaptionForBatchItem(item.id);
        });
      }, 100);
    }
    
    // Clear the input so the same files can be selected again if needed
    if (event.target) {
      event.target.value = '';
    }
  };


  const handleClearMedia = () => {
    setComposeState({
      media: null,
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

  const handleInsertHashtags = (tags: string[]) => {
    setComposeState(prev => ({
      ...prev,
      captionText: prev.captionText + '\n\n' + tags.join(' ')
    }));
    setIsHashtagPopoverOpen(false);
  };

  const hasContent = !!composeState.captionText.trim() || !!composeState.media;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Preview Modal */}
      <MobilePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        caption={composeState.captionText}
        media={
          composeState.media
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

      {/* Toggles for auto-generating captions and batch mode - MOVED TO TOP */}
      <div className="mb-6 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-md border-2 border-primary-200 dark:border-primary-800">
        <div className="flex items-center gap-6 flex-wrap justify-center">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoGenerateCaptions}
              onChange={(e) => setAutoGenerateCaptions(e.target.checked)}
              className="w-5 h-5 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 dark:focus:ring-primary-400 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Auto-generate captions when uploading images
            </span>
          </label>
        </div>
      </div>

      {/* Hide main compose area when showing individual boxes */}
      {activeTab !== 'captions' && (
        <>
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

          {/* Media upload */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
        {!composeState.media?.previewUrl ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.currentTarget.classList.add('border-primary-500', 'bg-primary-50', 'dark:bg-primary-900/20');
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.currentTarget.classList.remove('border-primary-500', 'bg-primary-50', 'dark:bg-primary-900/20');
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.currentTarget.classList.remove('border-primary-500', 'bg-primary-50', 'dark:bg-primary-900/20');
              
              const files = Array.from(e.dataTransfer.files).filter(
                file => file.type.startsWith('image/') || file.type.startsWith('video/')
              );
              
              if (files.length > 0) {
                // Create a synthetic event to reuse handleFileChange logic
                const syntheticEvent = {
                  target: { files: files as any, value: '' }
                } as React.ChangeEvent<HTMLInputElement>;
                handleFileChange(syntheticEvent);
              } else {
                showToast('Please drop image or video files', 'error');
              }
            }}
            className="flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 dark:border-gray-600 border-dashed rounded-md cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept="image/*,video/*"
              multiple
            />
            <div className="space-y-1 text-center">
              <UploadIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-primary-500" />
              <div className="flex flex-col items-center gap-2">
                <div className="flex text-sm text-gray-600 dark:text-gray-400">
                  <span className="relative font-medium text-primary-600 dark:text-primary-400">
                    {isBatchMode ? 'Upload images/videos for batch' : 'Upload an image or video'}
                  </span>
                  <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {isBatchMode 
                    ? 'Select multiple files - AI will generate captions for each'
                    : 'Images: PNG, JPG, GIF | Videos: MP4, MOV (AI will analyze and generate captions)'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="relative group w-full h-64 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden flex items-center justify-center">
            {composeState.media.type === 'image' ? (
              <img
                src={composeState.media.previewUrl}
                alt="Preview"
                className="h-full w-full object-contain"
              />
            ) : (
              <video
                src={composeState.media.previewUrl}
                controls
                className="h-full w-full object-contain"
              />
            )}
            <div className="absolute top-3 right-3 flex gap-2">
              {/* Only show download/save buttons if media was generated via AI (not just uploaded) */}
              {composeState.media?.isGenerated && (
                <>
                  <button
                    onClick={handleDownloadImage}
                    className="p-2 bg-black/70 hover:bg-black/90 text-white rounded-full transition-colors shadow-lg"
                    title="Download"
                  >
                    <DownloadIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleSaveImage}
                    className="p-2 bg-black/70 hover:bg-black/90 text-white rounded-full transition-colors shadow-lg"
                    title="Save to profile"
                  >
                    <CheckCircleIcon className="w-4 h-4" />
                  </button>
                </>
              )}
              <button
                onClick={handleClearMedia}
                className="p-2 bg-black/70 hover:bg-black/90 text-white rounded-full transition-colors shadow-lg"
                title="Remove"
              >
                <TrashIcon />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Goal & tone with dynamic options */}
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

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md space-y-4">
          <div>
            <label
              htmlFor="caption-input"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Your Post Content
            </label>
            <div className="relative">
              <textarea
                id="caption-input"
                ref={textareaRef}
                value={composeState.captionText}
                onChange={e =>
                  setComposeState(prev => ({
                    ...prev,
                    captionText: e.target.value
                  }))
                }
                rows={6}
                className="w-full p-3 pr-12 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                placeholder="Write your caption here..."
              />
              <div className="absolute top-3 right-3 flex flex-col gap-2">
                {isSpeechRecognitionSupported && (
                  <button
                    onClick={handleMicClick}
                    className={`p-1.5 rounded-full transition-colors ${
                      isListening
                        ? 'bg-red-500 text-white animate-pulse'
                        : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    <VoiceIcon className="w-5 h-5" />
                  </button>
                )}
                <div className="relative">
                  <button
                    onClick={() => setIsHashtagPopoverOpen(!isHashtagPopoverOpen)}
                    className="p-1.5 rounded-full text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600"
                    title="Hashtag Manager"
                  >
                    <HashtagIcon />
                  </button>
                  {isHashtagPopoverOpen && (
                    <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 z-10 border border-gray-200 dark:border-gray-700">
                      <h4 className="font-bold text-sm mb-2">
                        Saved Hashtags
                      </h4>
                      <div className="space-y-2 mb-4 max-h-40 overflow-y-auto">
                        {hashtagSets?.map(set => (
                          <button
                            key={set.id}
                            onClick={() => handleInsertHashtags(set.tags)}
                            className="block w-full text-left text-xs p-2 bg-gray-50 dark:bg-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-600"
                          >
                            <span className="font-semibold">{set.name}</span>
                            <p className="text-gray-500 truncate">
                              {set.tags.join(' ')}
                            </p>
                          </button>
                        ))}
                        {(!hashtagSets || hashtagSets.length === 0) && (
                          <p className="text-xs text-gray-400">
                            No saved sets yet.
                          </p>
                        )}
                      </div>
                      <div className="border-t pt-2 dark:border-gray-700">
                        <input
                          type="text"
                          value={newHashtagSetName}
                          onChange={e => setNewHashtagSetName(e.target.value)}
                          placeholder="Set Name (e.g. Tech)"
                          className="w-full text-xs p-1 border rounded mb-1 dark:bg-gray-900 dark:border-gray-600"
                        />
                        <input
                          type="text"
                          value={newHashtagSetTags}
                          onChange={e => setNewHashtagSetTags(e.target.value)}
                          placeholder="#ai #tech"
                          className="w-full text-xs p-1 border rounded mb-2 dark:bg-gray-900 dark:border-gray-600"
                        />
                        <button
                          onClick={handleCreateHashtagSet}
                          className="w-full flex justify-center items-center gap-1 bg-primary-100 text-primary-700 text-xs py-1 rounded hover:bg-primary-200"
                        >
                          <PlusIcon className="w-3 h-3" /> Save New Set
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Platforms */}
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
                    min={new Date().toISOString().slice(0, 16)}
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
                <div className="flex items-center gap-2 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoPost}
                      onChange={(e) => setAutoPost(e.target.checked)}
                      className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 dark:focus:ring-primary-400 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Auto-post at scheduled time
                    </span>
                  </label>
                  <span className="text-xs text-gray-500 dark:text-gray-400" title="When enabled, the post will automatically be published to selected platforms at the scheduled time">
                    ℹ️
                  </span>
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
          </div>
        </div>
      </div>
    </div>
  );
};

type ComposeTab = 'captions' | 'image' | 'video';

const tabs: { id: ComposeTab; label: string; icon: React.ReactNode }[] = [
  { id: 'captions', label: 'Captions', icon: <CaptionIcon /> },
  { id: 'image', label: 'Image (Coming Soon)', icon: <ImageIcon /> },
  { id: 'video', label: 'Video (Coming Soon)', icon: <VideoIcon /> }
];

export const Compose: React.FC = () => {
  const {
    user,
    setUser,
    setActivePage,
    composeContext,
    clearComposeContext,
    setComposeState,
    showToast,
    selectedClient,
    addCalendarEvent,
    composeState
  } = useAppContext();
  const [activeTab, setActiveTab] = useState<ComposeTab>('captions');
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>(undefined);
  
  // Batch upload state - moved to top level so it can be accessed by batch items UI
  const [batchItems, setBatchItems] = useState<Array<{
    id: string;
    file: File;
    media: { data: string; mimeType: string; previewUrl: string; type: 'image' | 'video' };
    caption: string;
    captionResults: CaptionResult[];
    isLoading: boolean;
    isScheduled: boolean;
    scheduledDate?: string;
    platforms: Platform[];
    postGoal: string;
    postTone: string;
    isSaving?: boolean;
    isPreviewOpen?: boolean;
    scheduleDate?: string;
    isScheduling?: boolean;
  }>>([{
    id: 'initial',
    file: null as any,
    media: { data: '', mimeType: '', previewUrl: '', type: 'image' },
    caption: '',
    captionResults: [],
    isLoading: false,
    isScheduled: false,
    platforms: [],
    postGoal: 'engagement',
    postTone: 'friendly',
    isSaving: false,
    isPreviewOpen: false,
    scheduleDate: '',
    isScheduling: false
  }]);
  const [autoPost, setAutoPost] = useState(true);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [autoGenerateCaptions, setAutoGenerateCaptions] = useState(true);

  // Batch upload functions - moved to top level
  const generateCaptionForBatchItem = async (itemId: string) => {
    const item = batchItems.find(i => i.id === itemId);
    if (!item || !user) {
      // Try again after a short delay if item not found yet
      setTimeout(() => {
        const retryItem = batchItems.find(i => i.id === itemId);
        if (retryItem && user) {
          generateCaptionForBatchItem(itemId);
        }
      }, 200);
      return;
    }

    try {
      // Upload to Firebase Storage
      const timestamp = Date.now();
      const extension = item.media.mimeType.split('/')[1] || 'png';
      const storagePath = `users/${user.id}/uploads/${timestamp}_${itemId}.${extension}`;
      const storageRef = ref(storage, storagePath);
      
      const bytes = base64ToBytes(item.media.data);
      await uploadBytes(storageRef, bytes, {
        contentType: item.media.mimeType
      });
      
      const mediaUrl = await getDownloadURL(storageRef);

      // Generate captions using item's specific goal and tone
      const { generateCaptions } = await import("../src/services/geminiService");
      const res = await generateCaptions({
        mediaUrl,
        goal: item.postGoal || composeState.postGoal || 'engagement',
        tone: item.postTone || composeState.postTone || 'friendly',
        promptText: undefined
      });

      let generatedResults: CaptionResult[] = [];
      if (Array.isArray(res)) {
        generatedResults = res as CaptionResult[];
      } else if (Array.isArray(res?.captions)) {
        generatedResults = res.captions as CaptionResult[];
      } else if (res?.caption) {
        generatedResults = [{
          caption: res.caption,
          hashtags: res.hashtags || []
        }];
      }

      const firstCaptionText = generatedResults.length > 0
        ? generatedResults[0].caption + '\n\n' + (generatedResults[0].hashtags || []).join(' ')
        : '';

      setBatchItems(prev => prev.map(i => 
        i.id === itemId 
          ? { ...i, caption: firstCaptionText, captionResults: generatedResults, isLoading: false }
          : i
      ));
    } catch (err) {
      console.error(`Failed to generate caption for ${itemId}:`, err);
      setBatchItems(prev => prev.map(i => 
        i.id === itemId 
          ? { ...i, isLoading: false }
          : i
      ));
    }
  };

  const handleScheduleBatchItem = async (itemId: string, date: string) => {
    const item = batchItems.find(i => i.id === itemId);
    if (!item || !user) return;
    
    if (!item.caption.trim()) {
      showToast('Please wait for caption generation or add a caption.', 'error');
      return;
    }
    
    if (item.platforms.length === 0) {
      showToast('Please select at least one platform.', 'error');
      return;
    }

    setIsSavingBatch(true);
    try {
      // Upload media if not already uploaded
      const timestamp = Date.now();
      const extension = item.media.mimeType.split('/')[1] || 'png';
      const storagePath = `users/${user.id}/uploads/${timestamp}_${itemId}.${extension}`;
      const storageRef = ref(storage, storagePath);
      
      const bytes = base64ToBytes(item.media.data);
      await uploadBytes(storageRef, bytes, {
        contentType: item.media.mimeType
      });
      
      const mediaUrl = await getDownloadURL(storageRef);

      const title = item.caption.trim()
        ? item.caption.substring(0, 30) + '...'
        : 'New Post';

      const postId = Date.now().toString() + '_' + itemId;

      const newPost: Post = {
        id: postId,
        content: item.caption,
        mediaUrl: mediaUrl,
        mediaType: item.media.type,
        platforms: item.platforms,
        status: 'Scheduled',
        author: { name: user.name, avatar: user.avatar },
        comments: [],
        scheduledDate: new Date(date).toISOString(),
        autoPost: autoPost,
        clientId: selectedClient?.id
      };

      const safePost = JSON.parse(JSON.stringify(newPost));
      await setDoc(doc(db, 'users', user.id, 'posts', postId), safePost);

      // Create calendar event for each platform
      for (const platform of item.platforms) {
        const newEvent: CalendarEvent = {
          id: `cal-${postId}-${platform}`,
          title: title,
          date: new Date(date).toISOString(),
          type: item.media.type === 'video' ? 'Reel' : 'Post',
          platform: platform,
          status: 'Scheduled',
          thumbnail: mediaUrl
        };
        await addCalendarEvent(newEvent);
      }

      setBatchItems(prev => prev.map(i => 
        i.id === itemId 
          ? { ...i, isScheduled: true, scheduledDate: date }
          : i
      ));

      showToast(
        `Post scheduled for ${new Date(date).toLocaleString([], {
          dateStyle: 'medium',
          timeStyle: 'short'
        })}`,
        'success'
      );
    } catch (e) {
      console.error(e);
      showToast("Failed to schedule post.", 'error');
    } finally {
      setIsSavingBatch(false);
    }
  };

  const handlePostBatchItem = async (itemId: string) => {
    const item = batchItems.find(i => i.id === itemId);
    if (!item || !user) return;
    
    if (!item.caption.trim()) {
      showToast('Please wait for caption generation or add a caption.', 'error');
      return;
    }
    
    if (item.platforms.length === 0) {
      showToast('Please select at least one platform.', 'error');
      return;
    }

    setIsSavingBatch(true);
    try {
      // Upload media if not already uploaded
      const timestamp = Date.now();
      const extension = item.media.mimeType.split('/')[1] || 'png';
      const storagePath = `users/${user.id}/uploads/${timestamp}_${itemId}.${extension}`;
      const storageRef = ref(storage, storagePath);
      
      const bytes = base64ToBytes(item.media.data);
      await uploadBytes(storageRef, bytes, {
        contentType: item.media.mimeType
      });
      
      const mediaUrl = await getDownloadURL(storageRef);

      const title = item.caption.trim()
        ? item.caption.substring(0, 30) + '...'
        : 'New Post';

      const postId = Date.now().toString() + '_' + itemId;

      // Post to each selected platform
      const token = await user.getIdToken();
      for (const platform of item.platforms) {
        try {
          const response = await fetch('/api/postToSocial', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              userId: user.id,
              platform: platform,
              content: item.caption,
              mediaUrl: mediaUrl,
              mediaType: item.media.type
            })
          });

          if (!response.ok) {
            const error = await response.text();
            console.error(`Failed to post to ${platform}:`, error);
            showToast(`Failed to post to ${platform}`, 'error');
          } else {
            showToast(`Posted to ${platform}!`, 'success');
          }
        } catch (error) {
          console.error(`Error posting to ${platform}:`, error);
          showToast(`Error posting to ${platform}`, 'error');
        }
      }

      // Save post record
      const newPost: Post = {
        id: postId,
        content: item.caption,
        mediaUrl: mediaUrl,
        mediaType: item.media.type,
        platforms: item.platforms,
        status: 'Published',
        author: { name: user.name, avatar: user.avatar },
        comments: [],
        publishedDate: new Date().toISOString(),
        clientId: selectedClient?.id
      };

      const safePost = JSON.parse(JSON.stringify(newPost));
      await setDoc(doc(db, 'users', user.id, 'posts', postId), safePost);

      // Create calendar event for each platform
      for (const platform of item.platforms) {
        const newEvent: CalendarEvent = {
          id: `cal-${postId}-${platform}`,
          title: title,
          date: new Date().toISOString(),
          type: item.media.type === 'video' ? 'Reel' : 'Post',
          platform: platform,
          status: 'Published',
          thumbnail: mediaUrl
        };
        await addCalendarEvent(newEvent);
      }

      // Remove item from batch after posting
      setBatchItems(prev => prev.filter(i => i.id !== itemId));
      showToast(`Posted to ${item.platforms.length} platform${item.platforms.length > 1 ? 's' : ''}!`, 'success');
    } catch (e) {
      console.error(e);
      showToast("Failed to post.", 'error');
    } finally {
      setIsSavingBatch(false);
    }
  };

  const handlePostAllBatchItems = async () => {
    const itemsToPost = batchItems.filter(item => 
      item.caption.trim() && item.platforms.length > 0 && !item.isLoading
    );

    if (itemsToPost.length === 0) {
      showToast('Please ensure all items have captions and at least one platform selected.', 'error');
      return;
    }

    setIsSavingBatch(true);
    try {
      for (const item of itemsToPost) {
        await handlePostBatchItem(item.id);
      }
      showToast(`Posted ${itemsToPost.length} item${itemsToPost.length > 1 ? 's' : ''} successfully!`, 'success');
    } catch (e) {
      console.error(e);
      showToast('Failed to post some items.', 'error');
    } finally {
      setIsSavingBatch(false);
    }
  };

  const handleScheduleAllBatchItems = async () => {
    const itemsToSchedule = batchItems.filter(item => 
      item.caption.trim() && item.platforms.length > 0 && !item.isLoading && !item.isScheduled
    );

    if (itemsToSchedule.length === 0) {
      showToast('Please ensure all items have captions and at least one platform selected.', 'error');
      return;
    }

    setIsSavingBatch(true);
    try {
      // Get analytics for smart scheduling
      let analytics = null;
      try {
        const token = await user?.getIdToken();
        if (token) {
          const response = await fetch('/api/getAnalytics', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (response.ok) {
            const data = await response.json();
            analytics = data.analytics || null;
          }
        }
      } catch (e) {
        console.log('Could not fetch analytics for smart scheduling, using defaults');
      }

      // Get unique platforms from all items
      const allPlatforms = Array.from(new Set(
        itemsToSchedule.flatMap(item => item.platforms)
      )) as Platform[];

      // Schedule each item intelligently
      const scheduledDates = scheduleMultiplePosts(
        itemsToSchedule.length,
        1, // Start from week 1
        analytics,
        allPlatforms[0], // Use first platform for scheduling logic
        { avoidClumping: true, minHoursBetween: 2 }
      );

      for (let i = 0; i < itemsToSchedule.length; i++) {
        const item = itemsToSchedule[i];
        const scheduledDate = scheduledDates[i] || scheduledDates[0];
        const dateString = new Date(scheduledDate).toISOString().slice(0, 16);
        await handleScheduleBatchItem(item.id, dateString);
      }

      showToast(
        `Scheduled ${itemsToSchedule.length} item${itemsToSchedule.length > 1 ? 's' : ''} at optimal times!`,
        'success'
      );
    } catch (e) {
      console.error(e);
      showToast('Failed to schedule some items.', 'error');
    } finally {
      setIsSavingBatch(false);
    }
  };

  const handleRemoveBatchItem = (itemId: string) => {
    setBatchItems(prev => prev.filter(i => i.id !== itemId));
  };

  // Handler functions for individual box actions
  const handleSaveDraftForItem = async (itemId: string) => {
    const item = batchItems.find(i => i.id === itemId);
    if (!item || !user) return;
    
    setIsSavingBatch(true);
    try {
      let mediaUrl = item.media.previewUrl;
      if (item.media.data && !item.media.previewUrl.startsWith('http')) {
        const timestamp = Date.now();
        const extension = item.media.mimeType.split('/')[1] || 'png';
        const storagePath = `users/${user.id}/uploads/${timestamp}_${itemId}.${extension}`;
        const storageRef = ref(storage, storagePath);
        const bytes = base64ToBytes(item.media.data);
        await uploadBytes(storageRef, bytes, { contentType: item.media.mimeType });
        mediaUrl = await getDownloadURL(storageRef);
      }

      const postId = Date.now().toString() + '_' + itemId;
      const newPost: Post = {
        id: postId,
        content: item.caption,
        mediaUrl: mediaUrl,
        mediaType: item.media.type,
        platforms: item.platforms,
        status: 'Draft',
        author: { name: user.name, avatar: user.avatar },
        comments: [],
        clientId: selectedClient?.id
      };

      await setDoc(doc(db, 'users', user.id, 'posts', postId), JSON.parse(JSON.stringify(newPost)));
      showToast('Draft saved!', 'success');
    } catch (e) {
      console.error(e);
      showToast('Failed to save draft.', 'error');
    } finally {
      setIsSavingBatch(false);
    }
  };

  const handleSubmitForReviewForItem = async (itemId: string) => {
    const item = batchItems.find(i => i.id === itemId);
    if (!item || !user) return;
    
    setIsSavingBatch(true);
    try {
      let mediaUrl = item.media.previewUrl;
      if (item.media.data && !item.media.previewUrl.startsWith('http')) {
        const timestamp = Date.now();
        const extension = item.media.mimeType.split('/')[1] || 'png';
        const storagePath = `users/${user.id}/uploads/${timestamp}_${itemId}.${extension}`;
        const storageRef = ref(storage, storagePath);
        const bytes = base64ToBytes(item.media.data);
        await uploadBytes(storageRef, bytes, { contentType: item.media.mimeType });
        mediaUrl = await getDownloadURL(storageRef);
      }

      const postId = Date.now().toString() + '_' + itemId;
      const newPost: Post = {
        id: postId,
        content: item.caption,
        mediaUrl: mediaUrl,
        mediaType: item.media.type,
        platforms: item.platforms,
        status: 'In Review',
        author: { name: user.name, avatar: user.avatar },
        comments: [],
        clientId: selectedClient?.id
      };

      await setDoc(doc(db, 'users', user.id, 'posts', postId), JSON.parse(JSON.stringify(newPost)));
      showToast('Submitted for review!', 'success');
    } catch (e) {
      console.error(e);
      showToast('Failed to submit for review.', 'error');
    } finally {
      setIsSavingBatch(false);
    }
  };

  const handleSaveHashtagsForItem = async (itemId: string) => {
    const item = batchItems.find(i => i.id === itemId);
    if (!item || !user || !item.caption.trim()) return;
    
    try {
      // Extract hashtags from caption
      const hashtags = item.caption.match(/#[\w]+/g) || [];
      if (hashtags.length === 0) {
        showToast('No hashtags found in caption.', 'info');
        return;
      }

      const setName = `Set ${Date.now()}`;
      await saveGeneratedContent('hashtag', {
        caption: item.caption,
        hashtags: hashtags.map(tag => tag.replace('#', '')),
        prompt: 'Saved from compose',
        goal: item.postGoal,
        tone: item.postTone,
      });
      showToast(`Saved ${hashtags.length} hashtag${hashtags.length > 1 ? 's' : ''}!`, 'success');
    } catch (e) {
      console.error(e);
      showToast('Failed to save hashtags.', 'error');
    }
  };

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
      setComposeState({
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
        postTone: 'friendly'
      });
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
        // Don't render CaptionGenerator - we show individual boxes instead
        return null;
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
        return <CaptionGenerator 
          batchItems={batchItems}
          setBatchItems={setBatchItems}
          isBatchMode={isBatchMode}
          setIsBatchMode={setIsBatchMode}
          autoPost={autoPost}
          setAutoPost={setAutoPost}
          generateCaptionForBatchItem={generateCaptionForBatchItem}
          handleScheduleBatchItem={handleScheduleBatchItem}
          handleRemoveBatchItem={handleRemoveBatchItem}
        />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Auto-generate toggle - ALWAYS VISIBLE AT TOP */}
      {activeTab === 'captions' && (
        <div className="mb-6 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-md border-2 border-primary-200 dark:border-primary-800">
          <div className="flex items-center gap-6 flex-wrap justify-center">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoGenerateCaptions}
                onChange={(e) => setAutoGenerateCaptions(e.target.checked)}
                className="w-5 h-5 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 dark:focus:ring-primary-400 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Auto-generate captions when uploading images
              </span>
            </label>
          </div>
        </div>
      )}
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

      {/* Individual Compose Boxes - Always show, start with one */}
      {activeTab === 'captions' && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md mt-6">
          <div className="text-center mb-6">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
              Compose & Schedule
            </h2>
            <p className="mt-2 text-lg text-gray-500 dark:text-gray-400">
              Create content, generate AI captions, and schedule posts.
            </p>
          </div>
          <div className="flex flex-wrap gap-4 items-start">
            {batchItems.map((item, index) => (
              <div key={item.id} className="flex items-start gap-2">
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900/50 w-80">
                  {/* Media Preview or Upload Area */}
                  {!item.media.previewUrl ? (
                    <div
                      onClick={() => {
                        // Use the main file input ref
                        if (fileInputRef.current) {
                          fileInputRef.current.click();
                        }
                      }}
                      className="relative w-full h-40 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden mb-2 border-2 border-dashed border-gray-300 dark:border-gray-600 cursor-pointer hover:border-primary-500 flex items-center justify-center"
                    >
                      <div className="text-center">
                        <UploadIcon className="w-8 h-8 mx-auto text-gray-400 dark:text-gray-500 mb-2" />
                        <p className="text-xs text-gray-500 dark:text-gray-400">Click to upload</p>
                      </div>
                    </div>
                  ) : (
                    <div className="relative w-full h-40 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden mb-2">
                      {item.isLoading ? (
                        <div className="flex items-center justify-center h-full">
                          <RefreshIcon className="w-6 h-6 animate-spin text-primary-600" />
                        </div>
                      ) : item.media.type === 'image' && item.media.previewUrl ? (
                        <img
                          src={item.media.previewUrl}
                          alt="Preview"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            console.error('Image failed to load:', item.media.previewUrl?.substring(0, 50));
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.parentElement!.innerHTML = '<div class="flex items-center justify-center h-full text-gray-400 text-xs">Failed to load</div>';
                          }}
                        />
                      ) : item.media.type === 'video' && item.media.previewUrl ? (
                        <video
                          src={item.media.previewUrl}
                          className="w-full h-full object-cover"
                          controls
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-gray-400 text-xs">
                          No preview
                        </div>
                      )}
                      <button
                        onClick={() => handleRemoveBatchItem(item.id)}
                        className="absolute top-1 right-1 p-1 bg-black/70 hover:bg-black/90 text-white rounded-full"
                      >
                        <TrashIcon className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {/* Goal and Tone */}
                  <div className="mb-2 space-y-1">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                        Goal
                      </label>
                      <select
                        value={item.postGoal || 'engagement'}
                        onChange={(e) =>
                          setBatchItems(prev =>
                            prev.map(i => i.id === item.id ? { ...i, postGoal: e.target.value } : i)
                          )
                        }
                        className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      >
                        <option value="engagement">Increase Engagement</option>
                        <option value="sales">Drive Sales</option>
                        <option value="awareness">Build Awareness</option>
                        {user?.plan === 'Agency' || user?.plan === 'Elite' || user?.role === 'Admin' ? (
                          <option value="followers">Increase Followers/Fans</option>
                        ) : null}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                        Tone
                      </label>
                      <select
                        value={item.postTone || 'friendly'}
                        onChange={(e) =>
                          setBatchItems(prev =>
                            prev.map(i => i.id === item.id ? { ...i, postTone: e.target.value } : i)
                          )
                        }
                        className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      >
                        <option value="friendly">Friendly</option>
                        <option value="witty">Witty</option>
                        <option value="inspirational">Inspirational</option>
                        <option value="professional">Professional</option>
                        {(user?.plan === 'Agency' || user?.plan === 'Elite' || user?.role === 'Admin' || user?.userType !== 'Business') ? (
                          <>
                            <option value="sexy-bold">Sexy / Bold</option>
                            <option value="sexy-explicit">Sexy / Explicit</option>
                          </>
                        ) : null}
                      </select>
                    </div>
                    <button
                      onClick={() => generateCaptionForBatchItem(item.id)}
                      disabled={item.isLoading}
                      className="w-full px-2 py-1 text-xs bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                    >
                      {item.isLoading ? (
                        <>
                          <RefreshIcon className="w-3 h-3 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <SparklesIcon className="w-3 h-3" />
                          Generate Caption
                        </>
                      )}
                    </button>
                  </div>

                  {/* Caption */}
                  <textarea
                    value={item.caption}
                    onChange={(e) =>
                      setBatchItems(prev =>
                        prev.map(i => i.id === item.id ? { ...i, caption: e.target.value } : i)
                      )
                    }
                    placeholder={item.isLoading ? 'Generating caption...' : 'Edit caption...'}
                    disabled={item.isLoading}
                    className="w-full p-2 text-xs border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white mb-2 min-h-[60px] resize-y"
                  />

                  {/* Platform Selection */}
                  <div className="mb-2">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Platforms
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {(['Instagram', 'TikTok', 'X', 'Threads', 'YouTube', 'LinkedIn', 'Facebook'] as Platform[]).map((platform) => (
                        <button
                          key={platform}
                          onClick={() =>
                            setBatchItems(prev =>
                              prev.map(i =>
                                i.id === item.id
                                  ? {
                                      ...i,
                                      platforms: i.platforms.includes(platform)
                                        ? i.platforms.filter(p => p !== platform)
                                        : [...i.platforms, platform]
                                    }
                                  : i
                              )
                            )
                          }
                          className={`px-1.5 py-0.5 text-xs rounded border ${
                            item.platforms.includes(platform)
                              ? 'bg-primary-100 dark:bg-primary-900/50 border-primary-500 text-primary-700 dark:text-primary-300'
                              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {platform}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-2">
                    <div className="flex gap-1 flex-wrap">
                      <button
                        onClick={() => {
                          // Preview - set compose state and open preview
                          setComposeState({
                            media: item.media.previewUrl ? {
                              data: item.media.data,
                              mimeType: item.media.mimeType,
                              previewUrl: item.media.previewUrl,
                              type: item.media.type,
                              isGenerated: false
                            } : null,
                            captionText: item.caption,
                            results: [],
                            postGoal: item.postGoal,
                            postTone: item.postTone
                          });
                          setIsPreviewOpen(true);
                        }}
                        disabled={!item.caption.trim() && !item.media.previewUrl}
                        className="flex-1 px-2 py-1 text-xs bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                      >
                        <MobileIcon className="w-3 h-3" />
                        Preview
                      </button>
                      <button
                        onClick={() => handleSaveDraftForItem(item.id)}
                        disabled={!item.caption.trim() || item.isLoading || isSavingBatch}
                        className="flex-1 px-2 py-1 text-xs bg-gray-500 text-white rounded-md hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Save Draft
                      </button>
                    </div>
                    {(user?.role === 'Admin' || user?.plan === 'Agency') && (
                      <button
                        onClick={() => handleSubmitForReviewForItem(item.id)}
                        disabled={!item.caption.trim() || item.isLoading || isSavingBatch}
                        className="w-full px-2 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                      >
                        <ClipboardCheckIcon className="w-3 h-3" />
                        Submit for Review
                      </button>
                    )}
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          const now = new Date();
                          now.setHours(now.getHours() + 1);
                          handleScheduleBatchItem(item.id, now.toISOString().slice(0, 16));
                        }}
                        disabled={item.isLoading || !item.caption.trim() || item.platforms.length === 0 || isSavingBatch}
                        className="flex-1 px-2 py-1 text-xs bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                      >
                        <CalendarIcon className="w-3 h-3" />
                        Schedule
                      </button>
                      <button
                        onClick={() => handlePostBatchItem(item.id)}
                        disabled={item.isLoading || !item.caption.trim() || item.platforms.length === 0 || isSavingBatch}
                        className="flex-1 px-2 py-1 text-xs bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                      >
                        <SendIcon className="w-3 h-3" />
                        Publish Now
                      </button>
                    </div>
                    <button
                      onClick={() => handleSaveHashtagsForItem(item.id)}
                      disabled={!item.caption.trim() || item.isLoading}
                      className="w-full px-2 py-1 text-xs bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                    >
                      <HashtagIcon className="w-3 h-3" />
                      Save Hashtags
                    </button>
                    {item.isScheduled && (
                      <div className="text-xs text-green-600 dark:text-green-400 text-center">
                        ✓ Scheduled for {item.scheduledDate ? new Date(item.scheduledDate).toLocaleString([], {
                          dateStyle: 'short',
                          timeStyle: 'short'
                        }) : ''}
                      </div>
                    )}
                  </div>
                </div>
                {/* Plus button to add more */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 w-10 h-10 flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors flex-shrink-0"
                  title="Add another image"
                >
                  <PlusIcon className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                </button>
              </div>
            ))}
            {/* Show plus button if no items yet */}
            {batchItems.length === 0 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-64 h-32 flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                title="Add image to batch"
              >
                <PlusIcon className="w-8 h-8 text-gray-400 dark:text-gray-500" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
