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

  // Download image
  const handleDownloadImage = () => {
    if (!composeState.media?.previewUrl) return;
    const a = document.createElement('a');
    a.href = composeState.media.previewUrl;
    a.download = `image-${Date.now()}.${composeState.media.type === 'image' ? 'png' : 'mp4'}`;
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

  // Save image to profile
  const handleSaveImage = async () => {
    if (!user || !composeState.media) return;
    try {
      await saveGeneratedContent('image', {
        imageData: composeState.media.data,
        imageUrl: composeState.media.previewUrl,
        prompt: 'User uploaded image',
        goal: composeState.postGoal,
        tone: composeState.postTone,
      });
      showToast('Image saved to profile!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to save image', 'error');
    }
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
    setComposeState(prev => ({ ...prev, results: [], captionText: '' }));

    try {
      const mediaUrl = `data:${mimeType};base64,${base64Data}`;

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
    if (composeState.media && composeState.results.length === 0 && composeState.media.data) {
      generateForBase64(composeState.media.data, composeState.media.mimeType);
    }
  }, [composeState.media]);

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
        captionText: ''
      }));
    } catch (error) {
      showToast('Failed to process file.', 'error');
      console.error(error);
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
            className="flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 dark:border-gray-600 border-dashed rounded-md cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept="image/*,video/*"
            />
            <div className="space-y-1 text-center">
              <UploadIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-primary-500" />
              <div className="flex text-sm text-gray-600 dark:text-gray-400">
                <span className="relative font-medium text-primary-600 dark:text-primary-400">
                  Upload a file
                </span>
                <p className="pl-1">or drag and drop</p>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Image or Video (Optional)
              </p>
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

  const handleGenerateCaptionsForImage = (base64Data: string) => {
    setComposeState({
      media: {
        data: base64Data,
        mimeType: 'image/png',
        previewUrl: `data:image/png;base64,${base64Data}`,
        type: 'image',
        isGenerated: true // Mark as generated
      },
      results: [],
      captionText: '',
      postGoal: 'engagement',
      postTone: 'friendly'
    });
    setActiveTab('captions');
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
