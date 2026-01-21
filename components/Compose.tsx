import React, { useState, useRef, useEffect, useMemo } from 'react';
import { generateCaptions, generateReply, saveGeneratedContent, analyzePostForPlatforms } from "../src/services/geminiService";
import { CaptionResult, Platform, MediaItem, Client, User, HashtagSet, Post, CalendarEvent } from '../types';
import { OFFLINE_MODE } from '../constants';
import {
  SparklesIcon,
  UploadIcon,
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
  DownloadIcon,
  XMarkIcon,
  CopyIcon,
} from './icons/UIIcons';
import {
  InstagramIcon,
  TikTokIcon,
  ThreadsIcon,
  XIcon,
  YouTubeIcon,
  LinkedInIcon,
  PinterestIcon,
  FacebookIcon
} from './icons/PlatformIcons';
import { lazy, Suspense } from 'react';

// Lazy load heavy generators for code splitting
const ImageGenerator = lazy(() => import('./ImageGenerator').then(module => ({ default: module.ImageGenerator })));
const VideoGenerator = lazy(() => import('./VideoGenerator').then(module => ({ default: module.VideoGenerator })));
import { UpgradePrompt } from './UpgradePrompt';
import { useAppContext } from './AppContext';
import { MobilePreviewModal } from './MobilePreviewModal';
import { MediaBox } from './MediaBox';
import { auth, db, storage } from '../firebaseConfig';
import { collection, setDoc, doc, getDocs, deleteDoc, query, where, getDoc, orderBy, Timestamp, addDoc } from 'firebase/firestore';
// @ts-ignore
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { scheduleMultiplePosts, analyzeOptimalPostingTimes } from '../src/services/smartSchedulingService';
import { getAnalytics } from '../src/services/geminiService';
import { MediaItemState } from '../types';
import { publishInstagramPost, publishTweet, publishPinterestPin } from '../src/services/socialMediaService';
import { PinterestBoardSelectionModal } from './PinterestBoardSelectionModal';
import { hasCalendarAccess } from '../src/utils/planAccess';

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
  Pinterest: <PinterestIcon />,
};

const emptyPlatforms: Record<Platform, boolean> = {
  Instagram: false,
  TikTok: false,
  X: false,
  Threads: false,
  YouTube: false,
  LinkedIn: false,
  Facebook: false,
  Pinterest: false,
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
    setComposeContext,
    addCalendarEvent,
    setActivePage,
    setPosts,
    socialAccounts,
    activePage
  } = useAppContext();

  // Error boundary - prevent blank page
  if (!user) {
    return (
      <div className="text-center p-8">
        <p className="text-gray-600 dark:text-gray-400">Please sign in to write captions.</p>
      </div>
    );
  }

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoGenerateCaptions, setAutoGenerateCaptions] = useState(false); // Toggle for auto-generating captions (unchecked by default)
  const [selectedPlatforms, setSelectedPlatforms] = useState<Partial<Record<Platform, boolean>>>({
    ...emptyPlatforms
  });
  const [isPublished, setIsPublished] = useState(false);
  const [usePersonality, setUsePersonality] = useState(false); // Toggle for using creator personality
  const [useFavoriteHashtags, setUseFavoriteHashtags] = useState(false); // Toggle for using favorite hashtags

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftLoadedRef = useRef(false);

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
  const pendingScheduleDateRef = useRef<string | null>(null);
  const hasAppliedPendingScheduleRef = useRef(false);

  // Selected checkboxes for bulk actions
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  const userId = user.id;

  // AI Auto-Schedule state
  const [isAIAutoScheduleModalOpen, setIsAIAutoScheduleModalOpen] = useState(false);
  const [aiRecommendations, setAIRecommendations] = useState<Array<{
    index: number;
    item: MediaItemState;
    recommendedPlatforms: Array<{ platform: Platform; score: number; reason: string }>;
    suggestedTime?: string;
  }>>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Upgrade modal state
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [upgradeModalReason, setUpgradeModalReason] = useState<'limit' | 'feature'>('limit');
  
  // Pinterest board selection
  const [isPinterestBoardModalOpen, setIsPinterestBoardModalOpen] = useState(false);
  const [selectedPinterestBoardId, setSelectedPinterestBoardId] = useState<string | null>(null);
  const [selectedPinterestBoardName, setSelectedPinterestBoardName] = useState<string | null>(null);
  
  // History state for predict, repurpose, and gap analysis
  const [predictHistory, setPredictHistory] = useState<any[]>([]);
  const [repurposeHistory, setRepurposeHistory] = useState<any[]>([]);
  const [gapAnalysisHistory, setGapAnalysisHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Predict, Repurpose, and Gap Analysis modals (for history viewing)
  const [predictResult, setPredictResult] = useState<any>(null);
  const [showPredictModal, setShowPredictModal] = useState(false);
  const [repurposeResult, setRepurposeResult] = useState<any>(null);
  const [showRepurposeModal, setShowRepurposeModal] = useState(false);
  const [gapAnalysisResult, setGapAnalysisResult] = useState<any>(null);
  const [showGapAnalysisModal, setShowGapAnalysisModal] = useState(false);
  const [isAnalyzingGaps, setIsAnalyzingGaps] = useState(false);

  const loadHistory = async () => {
    if (!user?.id) return;
    setLoadingHistory(true);
    try {
      // Load predict history
      const predictRef = collection(db, 'users', user.id, 'compose_predict_history');
      const predictQuery = query(predictRef, orderBy('createdAt', 'desc'));
      const predictSnapshot = await getDocs(predictQuery);
      const predictItems: any[] = [];
      predictSnapshot.forEach((doc) => {
        predictItems.push({ id: doc.id, ...doc.data() });
      });
      setPredictHistory(predictItems.slice(0, 10)); // Keep only last 10

      // Load repurpose history
      const repurposeRef = collection(db, 'users', user.id, 'compose_repurpose_history');
      const repurposeQuery = query(repurposeRef, orderBy('createdAt', 'desc'));
      const repurposeSnapshot = await getDocs(repurposeQuery);
      const repurposeItems: any[] = [];
      repurposeSnapshot.forEach((doc) => {
        repurposeItems.push({ id: doc.id, ...doc.data() });
      });
      setRepurposeHistory(repurposeItems.slice(0, 10)); // Keep only last 10

      // Load gap analysis history (shared with dashboard - uses content_gap_analysis_history)
      const gapAnalysisRef = collection(db, 'users', user.id, 'content_gap_analysis_history');
      try {
        const gapAnalysisQuery = query(gapAnalysisRef, orderBy('createdAt', 'desc'));
        const gapAnalysisSnapshot = await getDocs(gapAnalysisQuery);
        const gapAnalysisItems: any[] = [];
        gapAnalysisSnapshot.forEach((doc) => {
          gapAnalysisItems.push({ id: doc.id, ...doc.data() });
        });
        setGapAnalysisHistory(gapAnalysisItems.slice(0, 10)); // Keep only last 10
      } catch (error: any) {
        // Fallback: try without orderBy if index is missing
        if (error.code === 'failed-precondition' || error.message?.includes('index')) {
          const fallbackQuery = query(gapAnalysisRef);
          const fallbackSnapshot = await getDocs(fallbackQuery);
          const gapAnalysisItems: any[] = [];
          fallbackSnapshot.forEach((doc) => {
            gapAnalysisItems.push({ id: doc.id, ...doc.data() });
          });
          // Sort manually by createdAt
          gapAnalysisItems.sort((a, b) => {
            const aTime = a.createdAt?.toDate?.()?.getTime() || a.createdAt || 0;
            const bTime = b.createdAt?.toDate?.()?.getTime() || b.createdAt || 0;
            return bTime - aTime;
          });
          setGapAnalysisHistory(gapAnalysisItems.slice(0, 10));
        }
      }
    } catch (error: any) {
      console.error('Error loading history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Handle analyze content gaps
  const handleAnalyzeContentGaps = async () => {
    if (!user?.id) {
      showToast('Please sign in to analyze content gaps', 'error');
      return;
    }
    // Enforce Pro monthly limits (server also enforces)
    const monthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const isNewMonth = user.composeInsightsUsageMonth !== monthKey;
    const currentGapsUsed = isNewMonth ? 0 : (user.monthlyContentGapsUsed || 0);
    const gapsLimit = user.role === 'Admin' || user.plan === 'Elite' || user.plan === 'Agency' || user.plan === 'OnlyFansStudio'
      ? Infinity
      : user.plan === 'Pro'
        ? 2
        : 0;

    if (!isFinite(gapsLimit) ? false : currentGapsUsed >= gapsLimit) {
      showToast('Monthly limit reached. Upgrade to Elite for unlimited access.', 'info');
      setActivePage('pricing');
      return;
    }
    if (gapsLimit === 0) {
      showToast("Upgrade to Pro or Elite to unlock What's Missing", 'info');
      setActivePage('pricing');
      return;
    }

    setIsAnalyzingGaps(true);
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
        throw new Error('Failed to analyze content gaps');
      }

      const data = await response.json();
      if (data.success && user) {
        // Optimistically bump local usage so UI indicators update immediately.
        const newMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        const monthChanged = user.composeInsightsUsageMonth !== newMonthKey;
        const base: any = monthChanged
          ? { monthlyContentGapsUsed: 0, monthlyPredictionsUsed: 0, monthlyRepurposesUsed: 0, composeInsightsUsageMonth: newMonthKey }
          : { composeInsightsUsageMonth: user.composeInsightsUsageMonth || newMonthKey };
        await setUser({
          id: user.id,
          ...base,
          monthlyContentGapsUsed: (monthChanged ? 0 : (user.monthlyContentGapsUsed || 0)) + 1,
        } as Partial<User>);

        setGapAnalysisResult(data);
        setShowGapAnalysisModal(true);
        // Auto-save to content gap analysis history (shared with dashboard)
        try {
          await addDoc(collection(db, 'users', user.id, 'content_gap_analysis_history'), {
            type: 'gap_analysis',
            title: `What's Missing - ${new Date().toLocaleDateString()}`,
            data: data,
            createdAt: Timestamp.now(),
          });
          loadHistory(); // Reload history to show the new analysis
        } catch (saveError) {
          console.error('Failed to auto-save content gap analysis:', saveError);
        }
        showToast('Content gap analysis complete!', 'success');
      }
    } catch (error: any) {
      console.error('Error analyzing content gaps:', error);
      showToast(error.message || 'Failed to analyze content gaps', 'error');
    } finally {
      setIsAnalyzingGaps(false);
    }
  };

  const [pendingPinterestPublish, setPendingPinterestPublish] = useState<{
    mediaUrl: string;
    title: string;
    description: string;
  } | null>(null);

  // Load history on mount and when history is updated
  useEffect(() => {
    if (user?.id) {
      loadHistory();
    }
    
    // Listen for history reload events from MediaBox
    const handleHistoryReload = () => {
      loadHistory();
    };
    window.addEventListener('composeHistoryReload', handleHistoryReload);
    
    return () => {
      window.removeEventListener('composeHistoryReload', handleHistoryReload);
    };
  }, [user?.id]);

  // Plan + role logic
  const isAgency = user?.plan === 'Agency' || user?.plan === 'Elite';
  const isBusiness = user?.userType === 'Business';
  const isAgencyPlan = user?.plan === 'Agency';
  const isAdminOrAgency = user?.role === 'Admin' || user?.plan === 'Agency';

  // Caption limits including new plans, with safe default
  const captionLimits = useMemo(
    () => ({
      Free: 10, // Free plan: 10 AI captions/month
      Caption: 100, // Caption Pro plan: 100 captions/month
      Pro: 500,
      Elite: 1500,
      Agency: 10000, // Agency plan: 10,000 captions/month (soft cap, overage fees apply)
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
    if (composeContext?.captionText) {
      // Pre-fill caption text from opportunity
      setComposeState(prev => ({
        ...prev,
        captionText: composeContext.captionText || prev.captionText
      }));
    }
    if (composeContext?.hashtags) {
      // Hashtags are available - they'll be used when generating captions
    }
    
    // Check for scheduled date from Calendar (via localStorage)
    const composeScheduledDate = localStorage.getItem('composeScheduledDate');
    if (composeScheduledDate) {
      // Store for the next media item schedule picker (MediaBox)
      // Use local timezone to avoid date shifting issues
      const [year, month, day] = composeScheduledDate.split('-').map(Number);
      const localDate = new Date(year, month - 1, day, 12, 0, 0); // month is 0-indexed
      const pendingIso = localDate.toISOString();
      
      console.log('Compose: Reading scheduled date from localStorage:', {
        composeScheduledDate,
        year,
        month,
        day,
        localDate: localDate.toString(),
        pendingIso,
        dateString: localDate.toISOString().slice(0, 16)
      });
      
      pendingScheduleDateRef.current = pendingIso;

      // If no media items yet, add an empty box with the schedule prefilled
      if (!hasAppliedPendingScheduleRef.current && composeState.mediaItems.length === 0) {
        hasAppliedPendingScheduleRef.current = true;
        setComposeState(prev => ({
          ...prev,
          mediaItems: [
            {
              id: Date.now().toString(),
              previewUrl: '',
              data: '',
              mimeType: '',
              type: 'image',
              results: [],
              captionText: '',
              scheduledDate: pendingIso,
              postGoal: prev.postGoal,
              postTone: prev.postTone,
              selectedPlatforms: { ...emptyPlatforms },
            },
          ],
        }));
        console.log('Compose: Created mediaItem with scheduledDate:', pendingIso);
      }

      localStorage.removeItem('composeScheduledDate'); // Clear after use
    }
  }, [composeContext, composeState.mediaItems.length, setComposeState]);

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
      Facebook: false,
      Pinterest: false
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
            selectedMusic: item.selectedMusic || null,
            musicNote: item.musicNote || null,
            instagramPostType: item.instagramPostType || null,
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

  // Load draft post from Workflow if navigating from there
  useEffect(() => {
    const checkForDraft = () => {
      const draftPostData = localStorage.getItem('draftPostToEdit');
      // Only load draft if we're on the compose page and have user data, and haven't already loaded a draft
      if (draftPostData && user && activePage === 'compose' && !draftLoadedRef.current) {
        try {
          const draftPost = JSON.parse(draftPostData);
          
          // Log the draft data for debugging
          console.log('Compose: Loading draft post:', {
            id: draftPost.id,
            hasMediaUrl: !!draftPost.mediaUrl,
            mediaUrl: draftPost.mediaUrl,
            hasContent: !!draftPost.content,
            content: draftPost.content?.substring(0, 50),
            mediaType: draftPost.mediaType,
            platforms: draftPost.platforms,
            activePage: activePage,
          });
          
          // Create a MediaItemState from the draft post
          // Handle both mediaUrl (string) and mediaUrls (array) for multi-image posts
          const primaryMediaUrl = draftPost.mediaUrl || (draftPost.mediaUrls && draftPost.mediaUrls.length > 0 ? draftPost.mediaUrls[0] : '');
          const additionalImages = draftPost.mediaUrls && draftPost.mediaUrls.length > 1 
            ? draftPost.mediaUrls.slice(1).map((url: string, idx: number) => ({
                id: `${draftPost.id}-additional-${idx}`,
                previewUrl: url,
                data: '',
                mimeType: draftPost.mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
              }))
            : undefined;
          
          const mediaItem: MediaItemState = {
            id: draftPost.id,
            previewUrl: primaryMediaUrl || '',
            data: '', // Empty data is fine - MediaBox will use previewUrl for Firebase URLs
            mimeType: draftPost.mediaType === 'video' ? 'video/mp4' : (draftPost.mediaType === 'image' ? 'image/jpeg' : 'image/jpeg'),
            type: (draftPost.mediaType || 'image') as 'image' | 'video',
            results: [],
            captionText: draftPost.content || '',
            postGoal: draftPost.postGoal || 'engagement',
            postTone: draftPost.postTone || 'friendly',
            selectedPlatforms: draftPost.platforms?.reduce((acc: Record<Platform, boolean>, p: Platform) => {
              acc[p] = true;
              return acc;
            }, { ...emptyPlatforms }) || { ...emptyPlatforms },
            scheduledDate: draftPost.scheduledDate || undefined,
            additionalImages: additionalImages,
          };
          
          console.log('Compose: Created media item:', {
            previewUrl: mediaItem.previewUrl,
            captionText: mediaItem.captionText?.substring(0, 50),
            type: mediaItem.type,
            hasPreviewUrl: !!mediaItem.previewUrl,
            additionalImages: mediaItem.additionalImages?.length || 0,
          });
          
          // Set compose state with the draft media item
          // Use functional update to ensure we're working with latest state
          setComposeState(prev => {
            // Clear any existing media items and set the draft
            return {
              ...prev,
              media: null, // Clear single media if present
              mediaItems: [mediaItem], // Set draft as media item
              postGoal: draftPost.postGoal || prev.postGoal,
              postTone: draftPost.postTone || prev.postTone,
            };
          });
          
          // Mark draft as loaded to prevent Firestore from overwriting
          draftLoadedRef.current = true;
          
          showToast('Draft loaded. Continue editing.', 'success');
          
          // Clear localStorage after successful load
          localStorage.removeItem('draftPostToEdit');
        } catch (error) {
          console.error('Failed to load draft post:', error);
          showToast('Failed to load draft. Please try again.', 'error');
          localStorage.removeItem('draftPostToEdit');
        }
      } else if (draftPostData && activePage !== 'compose') {
        // Draft data exists but we're not on compose page yet - wait for navigation
        console.log('Compose: Draft data found but not on compose page yet, waiting...', { activePage });
      }
    };
    
    // Check immediately when component mounts (if on compose page)
    if (activePage === 'compose') {
      checkForDraft();
    }
    
    // Also check after delays to catch navigation and ensure page is ready
    const timeoutId1 = setTimeout(() => {
      if (activePage === 'compose') {
        checkForDraft();
      }
    }, 100);
    const timeoutId2 = setTimeout(() => {
      if (activePage === 'compose') {
        checkForDraft();
      }
    }, 500);
    const timeoutId3 = setTimeout(() => {
      if (activePage === 'compose') {
        checkForDraft();
      }
    }, 1000); // Longer delay to ensure page is fully loaded
    
    // Listen for page visibility changes and storage changes
    const handleVisibilityChange = () => {
      if (!document.hidden && activePage === 'compose') {
        checkForDraft();
      }
    };
    
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'draftPostToEdit' && e.newValue && activePage === 'compose') {
        checkForDraft();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      clearTimeout(timeoutId1);
      clearTimeout(timeoutId2);
      clearTimeout(timeoutId3);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [user, showToast, setComposeState, activePage]);

  // Reset draft loaded ref when leaving compose page
  useEffect(() => {
    if (activePage !== 'compose') {
      draftLoadedRef.current = false;
    }
  }, [activePage]);

  // Load mediaItems from Firestore on mount
  // But only if there's no draft to load (draft loading takes priority)
  useEffect(() => {
    if (!user || activePage !== 'compose') return;

    // Wait a bit to let draft loading happen first
    const timeoutId = setTimeout(() => {
      // Don't load from Firestore if a draft was already loaded
      if (draftLoadedRef.current) {
        return;
      }
      
      // Also check localStorage as a backup
      const draftPostData = localStorage.getItem('draftPostToEdit');
      if (draftPostData) {
        // Draft will be loaded by the other useEffect, so skip this
        return;
      }

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
              instagramPostType: data.instagramPostType,
              type: data.type || 'image',
              mimeType: data.mimeType || '',
              scheduledDate: data.scheduledDate || undefined,
              selectedMusic: data.selectedMusic || undefined,
              musicNote: data.musicNote || undefined,
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
    }, 500); // Wait 500ms for draft loading to complete

    return () => {
      clearTimeout(timeoutId);
    };
  }, [user?.id]);

  // Clear localStorage when all items are removed
  useEffect(() => {
    if (composeState.mediaItems.length === 0) {
      localStorage.removeItem('compose_mediaItems');
    }
  }, [composeState.mediaItems.length]);

  // Check for opportunity-generated content
  useEffect(() => {
    if (!user?.id) return;
    
    const opportunityContent = localStorage.getItem(`opportunity_generated_content_${user.id}`);
    if (opportunityContent) {
      try {
        const data = JSON.parse(opportunityContent);
        if (data.captions && data.captions.length > 0) {
          // Load first caption into compose state
          setComposeState(prev => ({
            ...prev,
            captionText: data.captions[0].caption || '',
            postGoal: 'engagement',
            postTone: 'friendly',
          }));
          
          // Set compose context with opportunity data
          setComposeContext({
            topic: data.opportunity?.title || '',
            platform: data.platform as Platform || undefined,
          });
          
          showToast('AI-generated content loaded!', 'success');
          localStorage.removeItem(`opportunity_generated_content_${user.id}`);
        }
      } catch (error) {
        console.error('Failed to load opportunity content:', error);
        localStorage.removeItem(`opportunity_generated_content_${user.id}`);
      }
    }
  }, [user?.id, showToast, setComposeState, setComposeContext]);

  // Check for pending media from Media Library
  useEffect(() => {
    const handleMediaLibraryItem = () => {
      const pendingMedia = localStorage.getItem('pendingMediaFromLibrary');
      if (pendingMedia) {
        try {
          const mediaData = JSON.parse(pendingMedia);
          
          // Use functional update to check for duplicates with latest state
          const pendingScheduledDate = pendingScheduleDateRef.current;
          if (pendingScheduledDate) {
            pendingScheduleDateRef.current = null;
          }
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
                scheduledDate: pendingScheduledDate || undefined,
                postGoal: prev.postGoal,
                postTone: prev.postTone,
                selectedPlatforms: { ...emptyPlatforms },
              };
              // Always add to mediaItems array so it shows in a MediaBox
              setTimeout(() => {
                showToast(`Added ${mediaData.name} to compose`, 'success');
              }, 100);
              return {
                ...prev,
                mediaItems: [...prev.mediaItems, newMediaItem],
              };
            } else {
              // If already exists, still show toast but don't add duplicate
              setTimeout(() => {
                showToast(`${mediaData.name} is already in compose`, 'success');
              }, 100);
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
    const timeoutId3 = setTimeout(handleMediaLibraryItem, 1500);
    
    // Listen for custom event from Media Library
    window.addEventListener('mediaLibraryItemAdded', handleMediaLibraryItem);
    
    // Also listen for focus event (when tab becomes active)
    window.addEventListener('focus', handleMediaLibraryItem);
    
    // Listen for page visibility changes
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        handleMediaLibraryItem();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearTimeout(timeoutId1);
      clearTimeout(timeoutId2);
      clearTimeout(timeoutId3);
      window.removeEventListener('mediaLibraryItemAdded', handleMediaLibraryItem);
      window.removeEventListener('focus', handleMediaLibraryItem);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [setComposeState, composeState.postGoal, composeState.postTone, showToast]);

  // Batch upload handlers
  const handleAddMediaBox = () => {
    const pendingScheduledDate = pendingScheduleDateRef.current;
    if (pendingScheduledDate) {
      pendingScheduleDateRef.current = null;
    }
    const newMediaItem: MediaItemState = {
      id: Date.now().toString(),
      previewUrl: '',
      data: '',
      mimeType: '',
      type: 'image',
      results: [],
      captionText: '',
      scheduledDate: pendingScheduledDate || undefined,
      postGoal: composeState.postGoal,
      postTone: composeState.postTone,
      selectedPlatforms: { ...emptyPlatforms },
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
        let mediaUrl = item.previewUrl.startsWith('http')
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
            timestamp: new Date().toISOString(),
          } as Post & { timestamp: string };

          const safePost = JSON.parse(JSON.stringify(newPost));
          await setDoc(doc(db, 'users', user.id, 'posts', postId), safePost);
        }

        // Don't create calendar events manually - Calendar component auto-creates from posts with scheduledDate

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
    if (OFFLINE_MODE) {
      showToast(
        'Scheduling to social platforms is disabled in this version. You can still use the calendar and campaigns to plan content, then post manually.',
        'error'
      );
      return;
    }
    const item = composeState.mediaItems[index];
    // Prevent double-publishing
    if (isSaving) {
      console.log('Already publishing, ignoring duplicate request');
      return;
    }
    
    // Block Caption plan from publishing (caption generation only)
    if (user?.plan === 'Caption') {
      showToast('Caption Pro plan is for caption generation only. Upgrade to Pro or higher to publish posts.', 'error');
      setActivePage('pricing');
      return;
    }
    
    // Allow text-only posts (announcements without media)
    if (!item.captionText.trim()) {
      showToast('Please add a caption.', 'error');
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
      // Upload media only if it exists
      let mediaUrl: string | undefined = undefined;
      let mediaUrls: string[] | undefined = undefined;
      if (item.previewUrl) {
        // Check if it's already a full HTTP/HTTPS URL (not blob or data URL)
        if (item.previewUrl.startsWith('http://') || item.previewUrl.startsWith('https://')) {
          mediaUrl = item.previewUrl;
        } else {
          // For blob URLs or data URLs, we need to upload
          mediaUrl = await uploadMediaItem(item);
        }

        if (!mediaUrl) {
          showToast('Failed to upload media.', 'error');
          return;
        }
        
        // Set mediaUrls array for multi-image support
        mediaUrls = [mediaUrl];
      }

      // Validate media was uploaded if preview exists
      if (item.previewUrl && !mediaUrl) {
        showToast('Failed to upload media. Please try again.', 'error');
        setIsSaving(false);
        return;
      }

      const title = item.captionText.trim()
        ? item.captionText.substring(0, 30) + '...'
        : 'New Post';

      // Check if this is a draft being edited (has item.id from draft post)
      const isDraftEdit = item.id && item.id.length > 0;
      const postId = isDraftEdit ? item.id : Date.now().toString();
      const publishDate = new Date().toISOString();
      
      // Ensure published posts have a scheduledDate so Calendar can create events from them
      const postScheduledDate = item.scheduledDate || publishDate;

      if (user) {
        // If editing a draft, check if post exists and delete draft calendar events
        if (isDraftEdit) {
          // Delete ALL draft calendar events for this post
          try {
            const calendarEventsRef = collection(db, 'users', user.id, 'calendar_events');
            const calendarSnapshot = await getDocs(calendarEventsRef);
            const eventsToDelete: string[] = [];
            
            calendarSnapshot.forEach((eventDoc) => {
              const eventId = eventDoc.id;
              // Check if this event is related to this post
              if (eventId.includes(postId)) {
                // Delete if it's a draft event or if it's a calendar event for this post
                if (eventId.startsWith('draft-') || eventId.startsWith(`cal-${postId}-`)) {
                  eventsToDelete.push(eventId);
                }
              }
            });
            
            // Delete all matching events
            for (const eventId of eventsToDelete) {
              try {
                await deleteDoc(doc(db, 'users', user.id, 'calendar_events', eventId));
              } catch (e) {
                // Event might not exist, ignore
              }
            }
          } catch (error) {
            console.error('Failed to delete draft calendar events:', error);
          }
        }

        const newPost: Post = {
          id: postId,
          content: item.captionText,
          mediaUrl: mediaUrl, // Primary image (for backward compatibility)
          mediaUrls: mediaUrls, // Multiple images array
          mediaType: item.type,
          platforms: platformsToPost,
          status: 'Published',
          author: { name: user.name, avatar: user.avatar },
          comments: [],
          scheduledDate: publishDate,
          clientId: selectedClient?.id,
          timestamp: new Date().toISOString(),
        } as Post & { timestamp: string };

        const safePost = JSON.parse(JSON.stringify(newPost));
        await setDoc(doc(db, 'users', user.id, 'posts', postId), safePost);
      }

      // Publish to Instagram if selected
      const hasInstagram = platformsToPost.includes('Instagram');
      if (hasInstagram && mediaUrl) {
        try {
          // Determine Instagram media type
          let instagramMediaType: 'IMAGE' | 'REELS' | 'VIDEO' = 'IMAGE';
          if (item.type === 'video') {
            instagramMediaType = item.instagramPostType === 'Reel' ? 'REELS' : 'VIDEO';
          }

          // Publish to Instagram (with multiple images support for carousel)
          const additionalImageUrls = mediaUrls && mediaUrls.length > 1 ? mediaUrls.slice(1) : undefined;
          const result = await publishInstagramPost(
            mediaUrl,
            item.captionText,
            instagramMediaType,
            undefined, // scheduledPublishTime (not used for immediate publish)
            additionalImageUrls // For carousel posts
          );

          if (result.status === 'published') {
            console.log('Published to Instagram:', result.mediaId);
          }
        } catch (instagramError: any) {
          console.error('Failed to publish to Instagram:', instagramError);
          // Continue with other platforms even if Instagram fails
          showToast(`Failed to publish to Instagram: ${instagramError.message || 'Please check your connection'}. Other platforms published successfully.`, 'error');
        }
      }

      // Publish to X (Twitter) if selected
      const hasX = platformsToPost.includes('X');
      if (hasX) {
        try {
          // Log media URL before publishing to X for debugging
          console.log('Publishing to X with mediaUrl:', mediaUrl);
          console.log('Publishing to X with mediaUrls:', mediaUrls);
          if (mediaUrl && (mediaUrl.includes('flux.ai') || !mediaUrl.includes('firebase'))) {
            console.warn('WARNING: Unexpected media URL format:', mediaUrl);
          }
          
          // Publish to X (with multiple images support)
          const xMediaUrls = mediaUrls && mediaUrls.length > 0 ? mediaUrls : (mediaUrl ? [mediaUrl] : undefined);
          const result = await publishTweet(
            item.captionText,
            mediaUrl || undefined, // Single URL for backward compatibility
            item.type === 'video' ? 'video' : item.type === 'image' ? 'image' : undefined,
            xMediaUrls // Multiple URLs for multi-image posts
          );

          console.log('Published to X:', result.tweetId);
        } catch (xError: any) {
          console.error('Failed to publish to X:', xError);
          // Continue with other platforms even if X fails
          showToast(`Failed to publish to X: ${xError.message || 'Please check your connection'}. Other platforms published successfully.`, 'error');
        }
      }

      // Publish to Pinterest if selected
      const hasPinterest = platformsToPost.includes('Pinterest');
      if (hasPinterest && mediaUrl && item.type === 'image') {
        // Extract title from caption (first line or first 100 chars)
        const title = item.captionText.split('\n')[0].substring(0, 100) || 'New Pin';
        const description = item.captionText.substring(0, 8000);
        
        // If board already selected, publish immediately
        if (selectedPinterestBoardId) {
          try {
            await publishPinterestPin(mediaUrl, title, description, selectedPinterestBoardId);
            showToast(`Successfully published to Pinterest!`, 'success');
          } catch (pinterestError: any) {
            console.error('Failed to publish to Pinterest:', pinterestError);
            showToast(`Failed to publish to Pinterest: ${pinterestError.message || 'Please check your connection'}. Other platforms published successfully.`, 'error');
          }
        } else {
          // Show board selection modal
          setPendingPinterestPublish({ mediaUrl, title, description });
          setIsPinterestBoardModalOpen(true);
          // Note: Publishing will continue after board selection
        }
      } else if (hasPinterest && item.type !== 'image') {
        // Pinterest only supports images for now
        showToast('Pinterest only supports image pins. Video pins are not yet supported.', 'error');
      }

      // Don't create calendar events manually - Calendar component auto-creates from posts
      // This prevents duplicate events in the calendar

      // Remove published item from compose page IMMEDIATELY
      // Use functional update to ensure we're working with latest state
      setComposeState(prev => {
        const newItems = prev.mediaItems.filter((_, i) => i !== index);
        return {
          ...prev,
          mediaItems: newItems,
        };
      });

      // Refresh posts to update UI
      if (setPosts) {
        try {
          const postsRef = collection(db, 'users', user.id, 'posts');
          const snapshot = await getDocs(postsRef);
          const updatedPosts: Post[] = [];
          snapshot.forEach((doc) => {
            updatedPosts.push({
              id: doc.id,
              ...doc.data(),
            } as Post);
          });
          setPosts(updatedPosts);
        } catch (error) {
          console.error('Failed to refresh posts:', error);
        }
      }

      // Build success message - only mention Instagram if it was selected but not connected
      let successMessage = `Published to ${platformsToPost.join(', ')}!`;
      
      // Check if Instagram was selected but not connected
      if (hasInstagram && platformsToPost.includes('Instagram')) {
        const instagramConnected = socialAccounts?.Instagram?.connected;
        if (!instagramConnected) {
          successMessage += ' (Note: Instagram requires account connection)';
        }
      }
      
      showToast(successMessage, 'success');
    } catch (e) {
      console.error(e);
      showToast('Failed to publish post.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleScheduleMedia = async (index: number) => {
    if (OFFLINE_MODE) {
      showToast('Scheduling to social platforms is disabled in this version. You can still use the calendar and campaigns to plan content, then post manually.', 'error');
      return;
    }
    const item = composeState.mediaItems[index];
    
    // Block Caption plan from scheduling (caption generation only)
    if (user?.plan === 'Caption') {
      showToast('Caption Pro plan is for caption generation only. Upgrade to Pro or higher to schedule posts.', 'error');
      setActivePage('pricing');
      return;
    }
    
    // Allow text-only posts (announcements without media)
    if (!item.captionText.trim()) {
      showToast('Please add a caption.', 'error');
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
      // Upload primary media
      let mediaUrl: string | undefined = undefined;
      let mediaUrls: string[] | undefined = undefined;
      
      if (item.previewUrl) {
        mediaUrl = item.previewUrl.startsWith('http')
          ? item.previewUrl
          : await uploadMediaItem(item);

        if (!mediaUrl) {
          showToast('Failed to upload media.', 'error');
          return;
        }
      }
      
      // Upload additional images if they exist
      if (item.additionalImages && item.additionalImages.length > 0) {
        const uploadedUrls: string[] = [];
        for (const additionalImg of item.additionalImages) {
          let imgUrl: string | undefined = undefined;
          
          if (additionalImg.previewUrl.startsWith('http://') || additionalImg.previewUrl.startsWith('https://')) {
            imgUrl = additionalImg.previewUrl;
          } else if (additionalImg.data) {
            // Upload additional image
            const timestamp = Date.now();
            const extension = additionalImg.mimeType.split('/')[1] || 'png';
            const storagePath = `users/${user.id}/uploads/${timestamp}.${extension}`;
            const storageRef = ref(storage, storagePath);
            
            const bytes = base64ToBytes(additionalImg.data);
            await uploadBytes(storageRef, bytes, {
              contentType: additionalImg.mimeType,
            });
            
            imgUrl = await getDownloadURL(storageRef);
          }
          
          if (imgUrl) {
            uploadedUrls.push(imgUrl);
          }
        }
        
        if (uploadedUrls.length > 0) {
          // Combine primary image with additional images
          mediaUrls = [mediaUrl, ...uploadedUrls].filter(Boolean) as string[];
          // Keep mediaUrl for backward compatibility
          mediaUrl = mediaUrls[0];
        }
      }

      const title = item.captionText.trim()
        ? item.captionText.substring(0, 30) + '...'
        : 'New Post';

      // Check if this is a draft being edited (has item.id from draft post)
      const isDraftEdit = item.id && item.id.length > 0;
      const postId = isDraftEdit ? item.id : Date.now().toString();

      if (user) {
        // If editing a draft, check if post exists and delete draft calendar events
        if (isDraftEdit) {
          // Delete ALL draft calendar events for this post
          try {
            const calendarEventsRef = collection(db, 'users', user.id, 'calendar_events');
            const calendarSnapshot = await getDocs(calendarEventsRef);
            const eventsToDelete: string[] = [];
            
            calendarSnapshot.forEach((eventDoc) => {
              const eventId = eventDoc.id;
              // Check if this event is related to this post
              if (eventId.includes(postId)) {
                // Delete if it's a draft event or if it's a calendar event for this post
                if (eventId.startsWith('draft-') || eventId.startsWith(`cal-${postId}-`)) {
                  eventsToDelete.push(eventId);
                }
              }
            });
            
            // Delete all matching events
            for (const eventId of eventsToDelete) {
              try {
                await deleteDoc(doc(db, 'users', user.id, 'calendar_events', eventId));
              } catch (e) {
                // Event might not exist, ignore
              }
            }
          } catch (error) {
            console.error('Failed to delete draft calendar events:', error);
          }
        }

        const newPost: Post = {
          id: postId,
          content: item.captionText,
          mediaUrl: mediaUrl, // Primary image (for backward compatibility)
          mediaUrls: mediaUrls, // Multiple images array
          mediaType: item.type,
          platforms: platformsToPost,
          status: 'Scheduled',
          author: { name: user.name, avatar: user.avatar },
          comments: [],
          scheduledDate: item.scheduledDate,
          clientId: selectedClient?.id,
          timestamp: new Date().toISOString(),
        } as Post & { timestamp: string };

        const safePost = JSON.parse(JSON.stringify(newPost));
        await setDoc(doc(db, 'users', user.id, 'posts', postId), safePost);
      }

      // Schedule to Instagram if selected
      const hasInstagram = platformsToPost.includes('Instagram');
      if (hasInstagram && mediaUrl) {
        try {
          let instagramMediaType: 'IMAGE' | 'REELS' | 'VIDEO' = 'IMAGE';
          if (item.type === 'video') {
            instagramMediaType = item.instagramPostType === 'Reel' ? 'REELS' : 'VIDEO';
          }

          // Schedule using Instagram's scheduled posting
          const result = await publishInstagramPost(
            mediaUrl,
            item.captionText,
            instagramMediaType,
            item.scheduledDate // Pass scheduled time
          );

          if (result.status === 'scheduled') {
            console.log('Scheduled to Instagram:', result.containerId);
          }
        } catch (instagramError: any) {
          console.error('Failed to schedule to Instagram:', instagramError);
          // Continue with other platforms even if Instagram fails
          showToast(`Failed to schedule to Instagram: ${instagramError.message || 'Please check your connection'}. Other platforms scheduled successfully.`, 'error');
        }
      }

      // Note: Calendar events are derived from Posts collection
      // The scheduled post will automatically appear in the calendar
      // No need to create separate calendar events (prevents duplicates)

      // Remove scheduled item from compose page IMMEDIATELY
      setComposeState(prev => {
        const filteredItems = prev.mediaItems.filter((_, i) => i !== index);
        return {
          ...prev,
          mediaItems: filteredItems,
        };
      });

      // Refresh posts to update UI
      if (setPosts) {
        try {
          const postsRef = collection(db, 'users', user.id, 'posts');
          const snapshot = await getDocs(postsRef);
          const updatedPosts: Post[] = [];
          snapshot.forEach((doc) => {
            updatedPosts.push({
              id: doc.id,
              ...doc.data(),
            } as Post);
          });
          setPosts(updatedPosts);
        } catch (error) {
          console.error('Failed to refresh posts:', error);
        }
      }

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

    // Check if any media item has platforms selected
    const itemsWithPlatforms = composeState.mediaItems.filter(item => {
      const platforms = (Object.keys(item.selectedPlatforms || {}) as Platform[]).filter(
        p => item.selectedPlatforms?.[p]
      );
      return platforms.length > 0;
    });

    if (itemsWithPlatforms.length === 0) {
      showToast('Please select at least one platform for your media items.', 'error');
      return;
    }

    // Get platforms from the first item with platforms (or use all unique platforms)
    const allPlatforms = new Set<Platform>();
    composeState.mediaItems.forEach(item => {
      (Object.keys(item.selectedPlatforms || {}) as Platform[]).forEach(p => {
        if (item.selectedPlatforms?.[p]) {
          allPlatforms.add(p);
        }
      });
    });
    const platformsToPost = Array.from(allPlatforms);

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

        // Publish to Instagram if selected and publishing now
        const hasInstagram = platformsToPost.includes('Instagram');
        if (hasInstagram && mediaUrl) {
          if (publishNow) {
            // Publish immediately
            try {
              let instagramMediaType: 'IMAGE' | 'REELS' | 'VIDEO' = 'IMAGE';
              if (item.type === 'video') {
                instagramMediaType = item.instagramPostType === 'Reel' ? 'REELS' : 'VIDEO';
              }

              const result = await publishInstagramPost(
                mediaUrl,
                item.captionText,
                instagramMediaType
              );

              if (result.status === 'published') {
                console.log(`Published post ${i + 1} to Instagram:`, result.mediaId);
              }
            } catch (instagramError: any) {
              console.error(`Failed to publish post ${i + 1} to Instagram:`, instagramError);
              // Continue with other platforms
            }
          } else {
            // Schedule for later using Instagram's scheduled posting
            try {
              let instagramMediaType: 'IMAGE' | 'REELS' | 'VIDEO' = 'IMAGE';
              if (item.type === 'video') {
                instagramMediaType = item.instagramPostType === 'Reel' ? 'REELS' : 'VIDEO';
              }

              // Get additional images for carousel if available
              const itemMediaUrls = (item as any).mediaUrls || (mediaUrl ? [mediaUrl] : []);
              const additionalImageUrls = itemMediaUrls.length > 1 ? itemMediaUrls.slice(1) : undefined;
              
              const result = await publishInstagramPost(
                mediaUrl,
                item.captionText,
                instagramMediaType,
                scheduledDate // Pass scheduled time
              );

              if (result.status === 'scheduled') {
                console.log(`Scheduled post ${i + 1} to Instagram:`, result.containerId);
              }
            } catch (instagramError: any) {
              console.error(`Failed to schedule post ${i + 1} to Instagram:`, instagramError);
              // Continue with other platforms
            }
          }
        }

        // Publish to X (Twitter) if selected
        const hasX = platformsToPost.includes('X');
        if (hasX && publishNow) {
          // Note: X API doesn't support native scheduling, so we only publish immediately
          try {
            const result = await publishTweet(
              item.captionText,
              mediaUrl || undefined,
              item.type === 'video' ? 'video' : item.type === 'image' ? 'image' : undefined
            );

            console.log(`Published post ${i + 1} to X:`, result.tweetId);
          } catch (xError: any) {
            console.error(`Failed to publish post ${i + 1} to X:`, xError);
            // Continue with other platforms
          }
        }

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
            timestamp: new Date().toISOString(),
          } as Post & { timestamp: string };

          const safePost = JSON.parse(JSON.stringify(newPost));
          await setDoc(doc(db, 'users', user.id, 'posts', postId), safePost);
        }

        // Note: Calendar events are automatically derived from posts with scheduledDate
        // No need to create separate calendar events - Calendar component reads from posts
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
    if (!user) return undefined;
    
    // If previewUrl is already a full HTTP/HTTPS URL, return it directly (no need to re-upload)
    if (item.previewUrl && (item.previewUrl.startsWith('http://') || item.previewUrl.startsWith('https://'))) {
      console.log('uploadMediaItem: Using existing URL:', item.previewUrl);
      return item.previewUrl;
    }
    
    // Handle blob URLs - convert to base64 data
    if (item.previewUrl && item.previewUrl.startsWith('blob:')) {
      try {
        // Fetch the blob and convert to base64
        const response = await fetch(item.previewUrl);
        const blob = await response.blob();
        const reader = new FileReader();
        
        const base64Data = await new Promise<string>((resolve, reject) => {
          reader.onloadend = () => {
            const base64 = reader.result as string;
            // Remove data URL prefix (e.g., "data:image/png;base64,")
            const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
            resolve(base64Data);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        
        // Update item.data with the base64 data
        item.data = base64Data;
        // Update mimeType if not set
        if (!item.mimeType && blob.type) {
          item.mimeType = blob.type;
        }
      } catch (error) {
        console.error('Failed to convert blob URL to base64:', error);
        return undefined;
      }
    }
    
    // If no data to upload, return undefined
    if (!item.data) {
      console.warn('uploadMediaItem: No data to upload and previewUrl is not a full URL:', item.previewUrl);
      return undefined;
    }

    try {
      const timestamp = Date.now();
      const extension = item.mimeType.split('/')[1] || 'bin';
      const storagePath = `users/${user.id}/uploads/${timestamp}.${extension}`;
      const storageRef = ref(storage, storagePath);

      const bytes = base64ToBytes(item.data);
      await uploadBytes(storageRef, bytes, {
        contentType: item.mimeType,
      });

      let mediaUrl = await getDownloadURL(storageRef);
      
      // Validate the URL is correct and doesn't contain unexpected domains
      if (!mediaUrl || !mediaUrl.startsWith('http')) {
        throw new Error('Invalid download URL returned from Firebase Storage');
      }
      
      // Log URL for debugging (check for wrong domains)
      if (mediaUrl.includes('flux.ai') && !mediaUrl.includes('firebase')) {
        console.error('WARNING: Unexpected domain in media URL:', mediaUrl);
      }
      
      console.log('uploadMediaItem: Uploaded to:', mediaUrl);
      return mediaUrl;

      // Process video with music if music is selected and it's a video
      // Only for TikTok and YouTube (not Instagram)
      if (item.type === 'video' && item.selectedMusic?.url) {
        const platformsToPost = (Object.keys(item.selectedPlatforms || {}) as Platform[]).filter(
          p => item.selectedPlatforms?.[p]
        );
        
        // Check if TikTok or YouTube is selected (not Instagram)
        const hasTikTokOrYouTube = platformsToPost.some(p => 
          p === 'TikTok' || p === 'YouTube'
        );
        const hasInstagram = platformsToPost.includes('Instagram');

        if (hasTikTokOrYouTube && !hasInstagram) {
          // Process video with music for TikTok/YouTube
          try {
            const response = await fetch('/api/processVideoWithMusic', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                videoUrl: mediaUrl,
                  musicUrl: item.selectedMusic?.url || '',
                platforms: platformsToPost,
              }),
            });

            const result = await response.json();
            if (result.success && result.processedVideoUrl) {
              mediaUrl = result.processedVideoUrl;
              showToast('Music added to video successfully!', 'success');
            } else if (result.note) {
              // Video processing not fully implemented yet
              console.log('Video processing note:', result.note);
              showToast('Music selection saved. Video processing will be available soon.', 'success');
            }
          } catch (processError) {
            console.error('Failed to process video with music:', processError);
            // Continue with original video if processing fails
            showToast('Music selection saved. Video processing will be available soon.', 'success');
          }
        } else if (hasInstagram) {
          // Instagram reminder
          showToast('For Instagram Reels, add music manually when posting. Music selection saved.', 'success');
        }
      }

      // Save to media library
      try {
        const mediaLibraryItem = {
          id: timestamp.toString(),
          userId: userId,
          url: mediaUrl,
          name: `Compose Media ${new Date().toLocaleDateString()}`,
          type: item.type || (item.mimeType.startsWith('image') ? 'image' : 'video'),
          mimeType: item.mimeType,
          size: bytes.length,
          uploadedAt: new Date().toISOString(),
          usedInPosts: [],
          tags: [],
        };
        await setDoc(doc(db, 'users', userId, 'media_library', mediaLibraryItem.id), mediaLibraryItem);
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

  const handleCaptionGenerationComplete = async () => {
    if (user) {
      await setUser({
        id: user.id,
        monthlyCaptionGenerationsUsed:
          (user.monthlyCaptionGenerationsUsed || 0) + 1,
      } as Partial<User>);
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

  const handleAIAutoScheduleSingle = async (index: number) => {
    const item = composeState.mediaItems[index];
    if (!item || !item.previewUrl || !item.captionText.trim()) {
      showToast('Please add media and caption first.', 'error');
      return;
    }

    setIsAnalyzing(true);
    try {
      // Extract hashtags from caption
      const hashtags = item.captionText.match(/#\w+/g) || [];
      
      // Analyze post for best platforms
      const analysis = await analyzePostForPlatforms({
        caption: item.captionText,
        hashtags,
        mediaType: item.type,
        goal: item.postGoal,
        tone: item.postTone,
      });

      // Get top recommended platforms (top 2-3)
      const topPlatforms = analysis.recommendations
        .slice(0, 3)
        .map((rec: any) => rec.platform as Platform);

      if (topPlatforms.length === 0) {
        showToast('Could not determine best platforms. Please select manually.', 'error');
        return;
      }

      // Update platforms
      const updatedPlatforms: Record<Platform, boolean> = {
        Instagram: false,
        TikTok: false,
        X: false,
        Threads: false,
        YouTube: false,
        LinkedIn: false,
        Facebook: false,
        Pinterest: false,
      };

      topPlatforms.forEach((platform: Platform) => {
        updatedPlatforms[platform] = true;
      });

      // Get optimal times for each platform using real-time data
      let bestScheduledDate: string | undefined;
      try {
        // Import real-time posting service
        const { getRealTimePostingData } = await import('../src/services/realTimePostingService');
        const analytics = await getAnalytics();
        
        // Find the best time across all recommended platforms
        const allOptimalTimes: Array<{ platform: Platform; time: Date; score: number }> = [];
        
        for (const platform of topPlatforms) {
          // Determine content type from media item
          const contentType = item.type === 'video' 
            ? (platform === 'TikTok' || platform === 'YouTube' ? 'short_video' : 'reel')
            : (item.type === 'image' ? 'single_image' : 'text');
          
          // Get real-time posting data for this platform and content type
          const realTimeData = await getRealTimePostingData(platform, {
            contentType,
            useCache: true,
            cacheDuration: 60, // Cache for 60 minutes
          });
          
          // Also get analytics-based optimal times as fallback
          const optimalTimes = analyzeOptimalPostingTimes(analytics, {
            platform: platform,
            avoidClumping: true,
            minHoursBetween: 2,
          });
          
          // Use real-time data if available, otherwise fall back to analytics
          const bestDays = realTimeData.optimalDays.length > 0 
            ? realTimeData.optimalDays 
            : optimalTimes.map(t => t.dayOfWeek);
          const bestHours = realTimeData.optimalHours.length > 0
            ? realTimeData.optimalHours
            : optimalTimes.map(t => t.hour);
          
          if (bestDays.length > 0 && bestHours.length > 0) {
            // Find the next optimal time
            const now = new Date();
            const scheduledDate = new Date();
            
            // Find next optimal day
            const currentDay = now.getDay();
            const nextOptimalDay = bestDays.find(d => d >= currentDay) || bestDays[0];
            const daysToAdd = (nextOptimalDay - currentDay + 7) % 7;
            if (daysToAdd === 0 && !bestDays.includes(currentDay)) {
              scheduledDate.setDate(now.getDate() + 7);
            } else {
              scheduledDate.setDate(now.getDate() + daysToAdd);
            }
            
            // Set to best hour
            const bestHour = bestHours[0];
            scheduledDate.setHours(bestHour, 0, 0, 0);
            
            // Ensure it's in the future
            if (scheduledDate < now) {
              scheduledDate.setDate(scheduledDate.getDate() + 1);
            }
            
            // Score based on platform recommendation and real-time engagement
            const platformRec = analysis.recommendations.find((r: any) => r.platform === platform);
            const platformScore = platformRec?.score || 50;
            const engagementBoost = realTimeData.currentEngagementScore || 50;
            const trendBoost = realTimeData.trendDirection === 'up' ? 10 : 0;
            
            allOptimalTimes.push({
              platform,
              time: scheduledDate,
              score: platformScore + (engagementBoost / 2) + trendBoost,
            });
          }
        }
        
        // Sort by score and pick the best time
        if (allOptimalTimes.length > 0) {
          allOptimalTimes.sort((a, b) => b.score - a.score);
          bestScheduledDate = allOptimalTimes[0].time.toISOString();
        } else {
          // Fallback: schedule for tomorrow at a good time
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(14, 0, 0, 0); // 2 PM default
          bestScheduledDate = tomorrow.toISOString();
        }
      } catch (err) {
        console.error('Failed to get optimal time:', err);
        // Fallback: schedule for tomorrow at 2 PM
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(14, 0, 0, 0);
        bestScheduledDate = tomorrow.toISOString();
      }

      // Update the item with recommended platforms and scheduled date
      handleUpdateMediaItem(index, {
        selectedPlatforms: updatedPlatforms,
        scheduledDate: bestScheduledDate,
      });

      // Wait a bit for state to update
      await new Promise(resolve => setTimeout(resolve, 200));

      // Now schedule the post
      await handleScheduleMedia(index);
      
      showToast(`AI scheduled post for ${new Date(bestScheduledDate).toLocaleString()} on ${topPlatforms.join(', ')}`, 'success');
    } catch (error) {
      console.error('AI Auto-Schedule failed:', error);
      showToast('Failed to auto-schedule post. Please try again.', 'error');
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

        const updatedPlatforms: Record<Platform, boolean> = { ...emptyPlatforms };

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

          // Don't create calendar events manually - Calendar component auto-creates from posts

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
      // Show upgrade modal instead of just toast
      setUpgradeModalReason('limit');
      setIsUpgradeModalOpen(true);
      return;
    }

    setIsLoading(true);
    try {
      for (const item of selectedItems) {
        const index = composeState.mediaItems.findIndex(m => m.id === item.id);
        if (index === -1 || !item.previewUrl) continue;

        // Generate captions for this item
        try {
          let mediaUrl = item.previewUrl;
          
          // If previewUrl is already a Firebase URL (starts with http), use it directly
          // Otherwise, if we have base64 data, upload it first
          if (!mediaUrl.startsWith('http') && item.data) {
            const timestamp = Date.now();
            const extension = item.mimeType.split('/')[1] || 'png';
            const storagePath = `users/${user!.id}/uploads/${timestamp}.${extension}`;
            const storageRef = ref(storage, storagePath);

            const bytes = base64ToBytes(item.data);
            await uploadBytes(storageRef, bytes, {
              contentType: item.mimeType,
            });

            mediaUrl = await getDownloadURL(storageRef);
          } else if (!mediaUrl.startsWith('http')) {
            // If we don't have data and previewUrl is not a URL, skip
            showToast(`Media item ${index + 1} needs to be uploaded first.`, 'error');
            continue;
          }

          // Get single selected platform for platform-optimized captions
          const selectedPlatform = (Object.keys(item.selectedPlatforms || {}) as Platform[]).find(
            p => item.selectedPlatforms?.[p]
          );
          
          if (!selectedPlatform) {
            showToast(`Media item ${index + 1}: Please select a platform first`, 'error');
            continue;
          }
          
          const res = await generateCaptions({
            mediaUrl: mediaUrl,
            goal: item.postGoal,
            tone: item.postTone,
            promptText: undefined,
            platforms: [selectedPlatform], // Pass single platform for platform-optimized caption generation
            usePersonality: usePersonality && settings.creatorPersonality ? true : false,
            useFavoriteHashtags: useFavoriteHashtags && settings.favoriteHashtags ? true : false,
            creatorPersonality: usePersonality ? settings.creatorPersonality || null : null,
            favoriteHashtags: useFavoriteHashtags ? settings.favoriteHashtags || null : null,
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
    // Check both single media and mediaItems array
    const hasMedia = composeState.media || (composeState.mediaItems && composeState.mediaItems.length > 0);
    if (!composeState.captionText.trim() && !hasMedia) {
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
      
      // If no media from single media, check mediaItems
      if (!mediaUrl && composeState.mediaItems && composeState.mediaItems.length > 0) {
        const firstItem = composeState.mediaItems[0];
        if (firstItem.previewUrl) {
          mediaUrl = firstItem.previewUrl.startsWith('http') 
            ? firstItem.previewUrl 
            : await uploadMediaItem(firstItem);
        }
      }

      const title = composeState.captionText.trim()
        ? composeState.captionText.substring(0, 30) + '...'
        : 'New Post';

      const postId = Date.now().toString();
      const publishDate = new Date();

      if (user) {
        // Determine media type from either single media or first mediaItem
        const mediaType = composeState.media?.type || (composeState.mediaItems && composeState.mediaItems.length > 0 ? composeState.mediaItems[0].type : undefined);
        
        const newPost: Post = {
          id: postId,
          content: composeState.captionText,
          mediaUrl: mediaUrl,
          mediaType: mediaType,
          platforms: platformsToPost,
          status: 'Published',
          author: { name: user.name, avatar: user.avatar },
          comments: [],
          scheduledDate: publishDate.toISOString(),
          clientId: selectedClient?.id,
          timestamp: new Date().toISOString(),
        } as Post & { timestamp: string };

        const safePost = JSON.parse(JSON.stringify(newPost));
        await setDoc(doc(db, 'users', user.id, 'posts', postId), safePost);
      }

      // Don't create calendar events manually - Calendar component auto-creates from posts

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

  // Helper function to convert datetime-local string to ISO string preserving local time
  const convertLocalDateTimeToISO = (dateTimeLocal: string): string => {
    // datetime-local format: "YYYY-MM-DDTHH:mm" (local time, no timezone)
    // Create a Date object - JavaScript will interpret this as local time
    const localDate = new Date(dateTimeLocal);
    // Convert to ISO string (UTC) - this preserves the intended local time
    return localDate.toISOString();
  };

  const handleScheduleForReview = async (date: string) => {
    const platformsToPost = (Object.keys(selectedPlatforms) as Platform[]).filter(
      p => selectedPlatforms[p]
    );
    // Check both single media and mediaItems array
    const hasMedia = composeState.media || (composeState.mediaItems && composeState.mediaItems.length > 0);
    if (!composeState.captionText.trim() && !hasMedia) {
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
      
      // If no media from single media, check mediaItems
      if (!mediaUrl && composeState.mediaItems && composeState.mediaItems.length > 0) {
        const firstItem = composeState.mediaItems[0];
        if (firstItem.previewUrl) {
          mediaUrl = firstItem.previewUrl.startsWith('http') 
            ? firstItem.previewUrl 
            : await uploadMediaItem(firstItem);
        }
      }

      const title = composeState.captionText.trim()
        ? composeState.captionText.substring(0, 30) + '...'
        : 'New Post';

      const postId = Date.now().toString();

      if (user) {
        // Determine media type from either single media or first mediaItem
        const mediaType = composeState.media?.type || (composeState.mediaItems && composeState.mediaItems.length > 0 ? composeState.mediaItems[0].type : undefined);
        
        const newPost: Post = {
          id: postId,
          content: composeState.captionText,
          mediaUrl: mediaUrl,
          mediaType: mediaType,
          platforms: platformsToPost,
          status: 'In Review',
          author: { name: user.name, avatar: user.avatar },
          comments: [],
          scheduledDate: convertLocalDateTimeToISO(date),
          clientId: selectedClient?.id,
          timestamp: new Date().toISOString(),
        } as Post & { timestamp: string };

        const safePost = JSON.parse(JSON.stringify(newPost));
        await setDoc(doc(db, 'users', user.id, 'posts', postId), safePost);
      }

      // Don't create calendar event manually - Calendar component auto-creates from posts
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
    // Check both single media and mediaItems array
    const hasMedia = composeState.media || (composeState.mediaItems && composeState.mediaItems.length > 0);
    if (!composeState.captionText.trim() && !hasMedia) {
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
      
      // If no media from single media, check mediaItems
      if (!mediaUrl && composeState.mediaItems && composeState.mediaItems.length > 0) {
        const firstItem = composeState.mediaItems[0];
        if (firstItem.previewUrl) {
          mediaUrl = firstItem.previewUrl.startsWith('http') 
            ? firstItem.previewUrl 
            : await uploadMediaItem(firstItem);
        }
      }

      const title = composeState.captionText.trim()
        ? composeState.captionText.substring(0, 30) + '...'
        : 'New Post';

      const postId = Date.now().toString();

      if (user) {
        // Determine media type from either single media or first mediaItem
        const mediaType = composeState.media?.type || (composeState.mediaItems && composeState.mediaItems.length > 0 ? composeState.mediaItems[0].type : undefined);
        
        const newPost: Post = {
          id: postId,
          content: composeState.captionText,
          mediaUrl: mediaUrl,
          mediaType: mediaType,
          platforms: platformsToPost,
          status: 'Scheduled',
          author: { name: user.name, avatar: user.avatar },
          comments: [],
          scheduledDate: convertLocalDateTimeToISO(date),
          clientId: selectedClient?.id,
          timestamp: new Date().toISOString(),
        } as Post & { timestamp: string };

        const safePost = JSON.parse(JSON.stringify(newPost));
        await setDoc(doc(db, 'users', user.id, 'posts', postId), safePost);
      }

      // Determine media type from either single media or first mediaItem
      const mediaTypeForEvent = composeState.media?.type || (composeState.mediaItems && composeState.mediaItems.length > 0 ? composeState.mediaItems[0].type : undefined);
      
      const newEvent: CalendarEvent = {
        id: `cal-${postId}`,
        title: title,
        date: convertLocalDateTimeToISO(date),
        type: mediaTypeForEvent === 'video' ? 'Reel' : 'Post',
        platform: platformsToPost[0],
        status: 'Scheduled',
        thumbnail: mediaUrl
      };

      // Don't create calendar event manually - Calendar component auto-creates from posts
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
    a.remove();
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
    a.remove();
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

  const handleSaveToWorkflowMedia = async (index: number, status: 'Draft' | 'Scheduled') => {
    const item = composeState.mediaItems[index];
    // Allow text-only posts (announcements without media)
    if (!item.captionText.trim()) {
      showToast('Please add a caption.', 'error');
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
      // Upload media only if it exists
      let mediaUrl: string | undefined = undefined;
      if (item.previewUrl) {
        mediaUrl = item.previewUrl.startsWith('http')
          ? item.previewUrl
          : await uploadMediaItem(item);

        if (!mediaUrl) {
          showToast('Failed to upload media.', 'error');
          return;
        }
      }

      const title = item.captionText.trim()
        ? item.captionText.substring(0, 30) + '...'
        : 'New Post';

      // Check if this is a draft being edited (has item.id from draft post)
      const isDraftEdit = item.id && item.id.length > 0;
      const postId = isDraftEdit ? item.id : Date.now().toString();
      const draftDate = new Date();
      draftDate.setHours(12, 0, 0, 0);

      if (user) {
        // If editing a draft and scheduling it, delete draft calendar events
        if (isDraftEdit && status === 'Scheduled') {
          // Delete ALL draft calendar events for this post
          try {
            const calendarEventsRef = collection(db, 'users', user.id, 'calendar_events');
            const calendarSnapshot = await getDocs(calendarEventsRef);
            const eventsToDelete: string[] = [];
            
            calendarSnapshot.forEach((eventDoc) => {
              const eventId = eventDoc.id;
              // Check if this event is related to this post
              if (eventId.includes(postId)) {
                // Delete if it's a draft event or if it's a calendar event for this post
                if (eventId.startsWith('draft-') || eventId.startsWith(`cal-${postId}-`)) {
                  eventsToDelete.push(eventId);
                }
              }
            });
            
            // Delete all matching events
            for (const eventId of eventsToDelete) {
              try {
                await deleteDoc(doc(db, 'users', user.id, 'calendar_events', eventId));
              } catch (e) {
                // Event might not exist, ignore
              }
            }
          } catch (error) {
            console.error('Failed to delete draft calendar events:', error);
          }
        }

        // Set scheduled date - use item's scheduledDate if available, otherwise default to tomorrow
        let scheduledDate: string | undefined;
        if (status === 'Scheduled') {
          if (item.scheduledDate) {
            scheduledDate = item.scheduledDate;
          } else {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(14, 0, 0, 0); // Default to 2 PM tomorrow
            scheduledDate = tomorrow.toISOString();
          }
        } else if (status === 'Draft') {
          scheduledDate = draftDate.toISOString(); // Drafts also get a suggested date
        }

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
          timestamp: new Date().toISOString(), // Add timestamp for Firestore ordering
        } as Post & { timestamp: string };

        const safePost = JSON.parse(JSON.stringify(newPost));
        await setDoc(doc(db, 'users', user.id, 'posts', postId), safePost);

        // Note: Calendar events are automatically derived from posts with scheduledDate
        // No need to create separate calendar events - Calendar component reads from posts
      }

      // Remove from mediaItems after saving AND delete from Firestore
      // Do this IMMEDIATELY to ensure UI updates
      const itemToRemove = composeState.mediaItems[index];
      
      // Delete from Firestore if it has an ID
      if (itemToRemove?.id && user) {
        try {
          await deleteDoc(doc(db, 'users', user.id, 'compose_media', itemToRemove.id));
        } catch (error) {
          console.error('Failed to delete media item from Firestore:', error);
          // Continue anyway - we'll remove it from UI
        }
      }
      
      // Remove from UI state
      setComposeState(prev => {
        const newItems = prev.mediaItems.filter((_, idx) => idx !== index);
        return {
          ...prev,
          mediaItems: newItems,
        };
      });

      // Small delay to ensure state update is processed
      await new Promise(resolve => setTimeout(resolve, 100));

      if (status === 'Scheduled') {
        if (!hasCalendarAccess(user)) {
          showToast('Upgrade to Pro or Elite to access the calendar', 'info');
          setActivePage('pricing');
        } else {
          showToast('Added to Calendar!', 'success');
          setActivePage('calendar');
        }
      } else {
        showToast('Saved to Drafts!', 'success');
        setActivePage('approvals');
      }
      
      // Refresh posts in context
      if (setPosts) {
        try {
          const postsRef = collection(db, 'users', user.id, 'posts');
          const snapshot = await getDocs(postsRef);
          const updatedPosts: Post[] = [];
          snapshot.forEach((doc) => {
            updatedPosts.push({
              id: doc.id,
              ...doc.data(),
            } as Post);
          });
          setPosts(updatedPosts);
        } catch (error) {
          console.error('Failed to refresh posts:', error);
        }
      }
    } catch (e) {
      console.error(e);
      showToast('Failed to save to workflow.', 'error');
    } finally {
      setIsSaving(false);
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
        clientId: selectedClient?.id,
        timestamp: new Date().toISOString(),
      } as Post & { timestamp: string };

      const postsCollectionRef = collection(db, 'users', user.id, 'posts');
      const safePost = JSON.parse(JSON.stringify(newPost));
      await setDoc(doc(postsCollectionRef, newPost.id), safePost);

      // Note: Calendar events are now derived from Posts, not created separately
      // Draft posts with scheduledDate will appear in Calendar automatically

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
      // Show upgrade modal instead of just toast
      setUpgradeModalReason('limit');
      setIsUpgradeModalOpen(true);
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

      // Get selected platforms from first media item (if any) for platform-specific hashtags
      const firstItemPlatforms = composeState.mediaItems.length > 0 
        ? (Object.keys(composeState.mediaItems[0].selectedPlatforms || {}) as Platform[]).filter(
            p => composeState.mediaItems[0].selectedPlatforms?.[p]
          )
        : [];
      
      const res = await generateCaptions({
        mediaUrl,
        goal: composeState.postGoal,
        tone: composeState.postTone,
        promptText: undefined,
        platforms: firstItemPlatforms.length > 0 ? firstItemPlatforms : undefined, // Pass platforms for hashtag generation
        usePersonality: usePersonality && settings.creatorPersonality ? true : false,
        useFavoriteHashtags: useFavoriteHashtags && settings.favoriteHashtags ? true : false,
        creatorPersonality: usePersonality ? settings.creatorPersonality || null : null,
        favoriteHashtags: useFavoriteHashtags ? settings.favoriteHashtags || null : null,
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
        await setUser({
          id: user.id,
          monthlyCaptionGenerationsUsed:
            (user.monthlyCaptionGenerationsUsed || 0) + 1
        } as Partial<User>);
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

    // Better video detection - check both mimeType and file extension
    const isVideo = file.type.startsWith('video/') || 
                    /\.(mp4|mov|avi|wmv|flv|webm|mkv|m4v)$/i.test(file.name);
    const fileType = isVideo ? 'video' : 'image';

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
      {/* Pinterest Board Selection Modal */}
      <PinterestBoardSelectionModal
        isOpen={isPinterestBoardModalOpen}
        onClose={() => {
          setIsPinterestBoardModalOpen(false);
          setPendingPinterestPublish(null);
        }}
        onSelect={async (boardId: string, boardName: string) => {
          setSelectedPinterestBoardId(boardId);
          setSelectedPinterestBoardName(boardName);
          
          // If there's pending publish, complete it
          if (pendingPinterestPublish) {
            try {
              await publishPinterestPin(
                pendingPinterestPublish.mediaUrl,
                pendingPinterestPublish.title,
                pendingPinterestPublish.description,
                boardId
              );
              showToast(`Successfully published to Pinterest board "${boardName}"!`, 'success');
              setPendingPinterestPublish(null);
            } catch (pinterestError: any) {
              console.error('Failed to publish to Pinterest:', pinterestError);
              showToast(`Failed to publish to Pinterest: ${pinterestError.message || 'Please check your connection'}.`, 'error');
            }
          }
        }}
        currentBoardId={selectedPinterestBoardId || undefined}
      />

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
              <div />
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

      {/* Upgrade Modal - Shows when limit is reached */}
      {isUpgradeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400 mb-4">
                <SparklesIcon className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                {upgradeModalReason === 'limit' ? 'You\'ve Reached Your Limit!' : 'Upgrade to Unlock More'}
              </h3>
              {upgradeModalReason === 'limit' && (
                <>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    You've used all {limit} of your monthly caption generations on the <strong>{user?.plan}</strong> plan.
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-500 mb-6">
                    Upgrade to get more generations and unlock additional features!
                  </p>
                </>
              )}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={() => {
                    setIsUpgradeModalOpen(false);
                    setActivePage('pricing');
                  }}
                  className="px-6 py-3 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition-colors"
                >
                  View Plans & Upgrade
                </button>
                <button
                  onClick={() => setIsUpgradeModalOpen(false)}
                  className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Maybe Later
                </button>
              </div>
              {user?.plan === 'Free' && (
                <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                  💡 <strong>Tip:</strong> Upgrade to Caption Pro ($9/mo) for 100 captions/month, or Pro ($29/mo) for unlimited features!
                </p>
              )}
              {user?.plan === 'Caption' && (
                <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                  💡 <strong>Tip:</strong> Upgrade to Pro ($29/mo) for 500 captions/month and unlock publishing, scheduling, and more features!
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
          Write Captions & Schedule
        </h2>
        <p className="mt-2 text-lg text-gray-500 dark:text-gray-400">
          Post a pic, get caption ideas, and schedule it.
        </p>
        {isFinite(limit) && (
          <p className="mt-1 text-sm font-semibold text-primary-600 dark:text-primary-400">
            {usageLeft} generations left this month.
          </p>
        )}
      </div>

      {/* Predict & Repurpose History */}
      {user?.plan !== 'Free' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recent: What's Missing, What To Post Next & Repurposes</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Usage this month:{' '}
                <span className="font-semibold text-purple-700 dark:text-purple-300">
                  What's Missing {user.plan === 'Pro' ? `${user.monthlyContentGapsUsed || 0}/2` : `${user.monthlyContentGapsUsed || 0}${(user.plan === 'Elite' || user.plan === 'Agency' || user.role === 'Admin') ? ' (unlimited)' : ''}`}
                </span>
                {' • '}
                <span className="font-semibold text-blue-700 dark:text-blue-300">
                  What To Post Next {user.plan === 'Pro' ? `${user.monthlyPredictionsUsed || 0}/5` : `${user.monthlyPredictionsUsed || 0}${(user.plan === 'Elite' || user.plan === 'Agency' || user.role === 'Admin') ? ' (unlimited)' : ''}`}
                </span>
                {' • '}
                <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                  Repurpose {user.plan === 'Pro' ? `${user.monthlyRepurposesUsed || 0}/5` : `${user.monthlyRepurposesUsed || 0}${(user.plan === 'Elite' || user.plan === 'Agency' || user.role === 'Admin') ? ' (unlimited)' : ''}`}
                </span>
              </p>
            </div>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
            >
              {showHistory ? 'Hide' : 'Show'} History
            </button>
          </div>
          {showHistory && (
          <>
            {(predictHistory.length === 0 && repurposeHistory.length === 0 && gapAnalysisHistory.length === 0) ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <p className="text-sm">No what's missing checks, what to post next, or repurposes yet.</p>
                <p className="text-xs mt-1">Use the What's Missing, What To Post Next, or Repurpose buttons on your posts to see history here.</p>
              </div>
            ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {/* Predict History */}
              {predictHistory.map((item) => {
                const prediction = item.data?.prediction || {};
                const level = prediction.level || 'Medium';
                const score = prediction.score || 50;
                const mediaUrl = item.data?.mediaUrl;
                const mediaType = item.data?.mediaType || 'image';
                const ideas = item.data?.ideas || item.data?.postIdeas || item.data?.nextPostIdeas;
                const hasIdeas = Array.isArray(ideas) && ideas.length > 0;
                const ideaTitle = hasIdeas ? (ideas[0]?.title || 'Post idea') : '';
                const summary = item.data?.summary || '';
                return (
                  <div
                    key={item.id}
                    className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                  >
                    <div className="flex items-start justify-between mb-2 gap-3">
                      {mediaUrl && (
                        <div className="flex-shrink-0">
                          {mediaType === 'video' ? (
                            <video src={mediaUrl} className="w-16 h-16 object-cover rounded border border-gray-200 dark:border-gray-600" />
                          ) : (
                            <img src={mediaUrl} alt="Preview" className="w-16 h-16 object-cover rounded border border-gray-200 dark:border-gray-600" />
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">WHAT TO POST NEXT</span>
                          {!hasIdeas && (
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              level === 'High' ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300' :
                              level === 'Medium' ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300' :
                              'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                            }`}>
                              {level} ({score}/100)
                            </span>
                          )}
                          {hasIdeas && (
                            <span className="text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                              {ideas.length} ideas
                            </span>
                          )}
                        </div>
                        {hasIdeas ? (
                          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                            {ideaTitle}{summary ? ` — ${summary}` : ''}
                          </p>
                        ) : (
                          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                            {item.data?.originalCaption?.substring(0, 100)}...
                          </p>
                        )}
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          {item.createdAt?.toDate?.() ? new Date(item.createdAt.toDate()).toLocaleString() : 'Recently'}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setPredictResult(item.data);
                          setShowPredictModal(true);
                        }}
                        className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 ml-2 flex-shrink-0"
                      >
                        View
                      </button>
                    </div>
                  </div>
                );
              })}
              
              {/* Repurpose History */}
              {repurposeHistory.map((item) => {
                const platforms = item.data?.repurposedContent?.length || 0;
                const mediaUrl = item.data?.mediaUrl;
                const mediaType = item.data?.mediaType || 'image';
                return (
                  <div
                    key={item.id}
                    className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                  >
                    <div className="flex items-start justify-between mb-2 gap-3">
                      {mediaUrl && (
                        <div className="flex-shrink-0">
                          {mediaType === 'video' ? (
                            <video src={mediaUrl} className="w-16 h-16 object-cover rounded border border-gray-200 dark:border-gray-600" />
                          ) : (
                            <img src={mediaUrl} alt="Preview" className="w-16 h-16 object-cover rounded border border-gray-200 dark:border-gray-600" />
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">REPURPOSE</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {platforms} platforms
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                          {item.data?.originalContent?.substring(0, 100)}...
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          {item.createdAt?.toDate?.() ? new Date(item.createdAt.toDate()).toLocaleString() : 'Recently'}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setRepurposeResult(item.data);
                          setShowRepurposeModal(true);
                        }}
                        className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 ml-2 flex-shrink-0"
                      >
                        View
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Gap Analysis History */}
              {gapAnalysisHistory.map((item) => {
                const summary = item.data?.summary || item.title || "What's Missing";
                return (
                  <div
                    key={item.id}
                    className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                  >
                    <div className="flex items-start justify-between mb-2 gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">CONTENT GAP ANALYSIS</span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                          {summary.substring(0, 100)}...
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          {item.createdAt?.toDate?.() ? new Date(item.createdAt.toDate()).toLocaleString() : (item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Recently')}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setGapAnalysisResult(item.data);
                          setShowGapAnalysisModal(true);
                        }}
                        className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 ml-2 flex-shrink-0"
                      >
                        View
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </>
          )}
        </div>
      )}

      {/* Tone & Goal Controls - Only show for Caption plan */}
      {user?.plan === 'Caption' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Goal Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Post Goal
              </label>
              <select
                value={composeState.postGoal}
                onChange={(e) => setComposeState(prev => ({ ...prev, postGoal: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                {goalOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Tone Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Tone
              </label>
              <select
                value={composeState.postTone}
                onChange={(e) => setComposeState(prev => ({ ...prev, postTone: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                {toneOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            These settings apply to all new caption generations. You can also customize tone in Settings → AI Training.
          </p>
        </div>
      )}

      {/* Media Upload Boxes */}
      <div className="space-y-6">


        {/* Always show media boxes - initialize with one empty box if none exist */}
        {composeState.mediaItems.length === 0 ? (
          <div className="flex justify-center">
            <div className="w-full max-w-md">
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
                selectedPlatforms: { ...emptyPlatforms },
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
              onSaveToWorkflow={handleSaveToWorkflowMedia}
              onAIAutoSchedule={async (idx) => {
                await handleAIAutoScheduleSingle(idx);
              }}
              platformIcons={platformIcons}
              onUpgradeClick={() => {
                setUpgradeModalReason('limit');
                setIsUpgradeModalOpen(true);
              }}
              onAnalyzeContentGaps={handleAnalyzeContentGaps}
              isAnalyzingGaps={isAnalyzingGaps}
              usePersonality={usePersonality}
              useFavoriteHashtags={useFavoriteHashtags}
              creatorPersonality={settings.creatorPersonality}
              favoriteHashtags={settings.favoriteHashtags}
              onTogglePersonality={() => setUsePersonality(prev => !prev)}
              onToggleHashtags={() => setUseFavoriteHashtags(prev => !prev)}
            />
            </div>
          </div>
        ) : composeState.mediaItems.length === 1 ? (
          <div className="flex justify-center">
            <div className="w-full max-w-md">
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
                  onSaveToWorkflow={handleSaveToWorkflowMedia}
                  onAIAutoSchedule={async (idx) => {
                    // Select this item and trigger AI Auto Schedule
                    setSelectedIndices(new Set([idx]));
                    await handleAIAutoSchedule();
                  }}
                  platformIcons={platformIcons}
                  onUpgradeClick={() => {
                    setUpgradeModalReason('limit');
                    setIsUpgradeModalOpen(true);
                  }}
                  onAnalyzeContentGaps={handleAnalyzeContentGaps}
                  isAnalyzingGaps={isAnalyzingGaps}
                  usePersonality={usePersonality}
                  useFavoriteHashtags={useFavoriteHashtags}
                  creatorPersonality={settings.creatorPersonality}
                  favoriteHashtags={settings.favoriteHashtags}
                  onTogglePersonality={() => setUsePersonality(prev => !prev)}
                  onToggleHashtags={() => setUseFavoriteHashtags(prev => !prev)}
                />
              ))}
              {/* Add Image/Video button - Outside the image box */}
              <button
                onClick={handleAddMediaBox}
                className="mt-4 h-24 w-full flex items-center justify-center gap-2 text-primary-600 dark:text-primary-400 bg-white dark:bg-gray-800 border-2 border-dashed border-primary-300 dark:border-primary-700 rounded-xl hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors shadow-sm"
                title="Add Image/Video"
              >
                <PlusIcon className="w-6 h-6" />
                <span className="text-sm font-medium whitespace-nowrap">image/video</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 justify-items-start">
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
                onSaveToWorkflow={handleSaveToWorkflowMedia}
                onAIAutoSchedule={async (idx) => {
                  // Select this item and trigger AI Auto Schedule
                  setSelectedIndices(new Set([idx]));
                  await handleAIAutoSchedule();
                }}
                platformIcons={platformIcons}
                onUpgradeClick={() => {
                  setUpgradeModalReason('limit');
                  setIsUpgradeModalOpen(true);
                }}
                onAnalyzeContentGaps={handleAnalyzeContentGaps}
                isAnalyzingGaps={isAnalyzingGaps}
                usePersonality={usePersonality}
                useFavoriteHashtags={useFavoriteHashtags}
                creatorPersonality={settings.creatorPersonality}
                favoriteHashtags={settings.favoriteHashtags}
                onTogglePersonality={() => setUsePersonality(prev => !prev)}
                onToggleHashtags={() => setUseFavoriteHashtags(prev => !prev)}
              />
            ))}
            {/* Add Image/Video button - Outside the image boxes */}
            <button
              onClick={handleAddMediaBox}
              className="h-24 w-full flex flex-col items-center justify-center gap-2 text-primary-600 dark:text-primary-400 bg-white dark:bg-gray-800 border-2 border-dashed border-primary-300 dark:border-primary-700 rounded-xl hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors shadow-sm"
              title="Add Image/Video"
            >
              <PlusIcon className="w-6 h-6" />
              <span className="text-xs font-medium whitespace-nowrap">image/video</span>
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
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      const fullText = `${result.caption}\n\n${(result.hashtags || []).join(' ')}`;
                      navigator.clipboard.writeText(fullText);
                      showToast('Caption copied to clipboard!', 'success');
                    }}
                    className="mt-3 flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 bg-primary-50 dark:bg-primary-900/30 rounded-md hover:bg-primary-100 dark:hover:bg-primary-900/50"
                  >
                    <CopyIcon className="w-4 h-4" /> Copy Caption & Hashtags
                  </button>
                </div>
                <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      const fullText = `${result.caption}\n\n${(result.hashtags || []).join(' ')}`;
                      navigator.clipboard.writeText(fullText);
                      showToast('Caption copied to clipboard!', 'success');
                    }}
                    className="p-2 bg-white dark:bg-gray-600 rounded-full shadow text-primary-600 dark:text-primary-300"
                    title="Copy caption and hashtags"
                  >
                    <CopyIcon className="w-4 h-4" />
                  </button>
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
                    className="flex-grow p-2 border rounded-md bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                    style={{ colorScheme: 'dark' }}
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

      {/* Predict Modal (for history) */}
      {showPredictModal && predictResult && (
        <PredictModal
          result={predictResult}
          onClose={() => {
            setShowPredictModal(false);
            loadHistory(); // Reload history when modal closes
          }}
          onCopy={(text) => {
            navigator.clipboard.writeText(text);
            showToast('Copied to clipboard!', 'success');
          }}
        />
      )}

      {/* Repurpose Modal (for history) */}
      {showRepurposeModal && repurposeResult && (
        <RepurposeModal
          result={repurposeResult}
          onClose={() => {
            setShowRepurposeModal(false);
            loadHistory(); // Reload history when modal closes
          }}
          onCopy={(text) => {
            navigator.clipboard.writeText(text);
            showToast('Copied to clipboard!', 'success');
          }}
        />
      )}

      {/* Gap Analysis Modal */}
      {showGapAnalysisModal && gapAnalysisResult && (
        <GapAnalysisModal
          analysis={gapAnalysisResult}
          onClose={() => {
            setShowGapAnalysisModal(false);
            loadHistory(); // Reload history when modal closes
          }}
        />
      )}
    </div>
  );
};

type ComposeTab = 'captions' | 'image' | 'video';

const tabs: { id: ComposeTab; label: string; icon: React.ReactNode }[] = [
  { id: 'captions', label: 'Captions', icon: <CaptionIcon /> },
];

export const Compose: React.FC = () => {
  const {
    user,
    setUser,
    setActivePage,
    composeContext,
    clearComposeContext,
    setComposeState,
    showToast
  } = useAppContext();
  const [activeTab, setActiveTab] = useState<ComposeTab>('captions');
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>(undefined);
  
  // Predict and Repurpose modals (for history viewing)
  const [predictResult, setPredictResult] = useState<any>(null);
  const [showPredictModal, setShowPredictModal] = useState(false);
  const [repurposeResult, setRepurposeResult] = useState<any>(null);
  const [showRepurposeModal, setShowRepurposeModal] = useState(false);
  

  useEffect(() => {
    if (composeContext) {
      setActiveTab('captions');
      setComposeState(prev => ({ ...prev, captionText: composeContext.topic }));
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

  const handleImageGeneration = async () => {
    if (user) {
      await setUser({
        id: user.id,
        monthlyImageGenerationsUsed: (user.monthlyImageGenerationsUsed || 0) + 1
      } as Partial<User>);
    }
  };

  const handleVideoGeneration = async () => {
    if (user) {
      await setUser({
        id: user.id,
        monthlyVideoGenerationsUsed: (user.monthlyVideoGenerationsUsed || 0) + 1
      } as Partial<User>);
    }
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
          <div className="p-6 text-center text-gray-500 dark:text-gray-400">
            Image generation is temporarily disabled while we focus on stability.
          </div>
        );
      case 'video':
        return (
          <div className="p-6 text-center text-gray-500 dark:text-gray-400">
            Video generation is temporarily disabled while we focus on stability.
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

// Predict Modal Component (shared with MediaBox and CaptionGenerator)
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
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

// Gap Analysis Modal Component
const GapAnalysisModal: React.FC<{ analysis: any; onClose: () => void }> = ({ analysis, onClose }) => {
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
          {/* Summary */}
          {analysis.summary && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-blue-900 dark:text-blue-200">{analysis.summary}</p>
            </div>
          )}

          {/* Gaps */}
          {analysis.gaps && analysis.gaps.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Identified Gaps</h3>
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
                        {gap.severity?.toUpperCase() || 'LOW'}
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

          {/* Suggestions */}
          {analysis.suggestions && analysis.suggestions.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Content Suggestions to Fill Gaps</h3>
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
                        {suggestion.priority?.toUpperCase() || 'LOW'}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{suggestion.type}</span>
                    </div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{suggestion.title}</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">{suggestion.captionOutline}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2">
                      {suggestion.platform && <span>{suggestion.platform}</span>}
                      {suggestion.platform && suggestion.format && <span>•</span>}
                      {suggestion.format && <span>{suggestion.format}</span>}
                    </div>
                    {suggestion.whyThisFillsGap && <p className="text-xs text-gray-700 dark:text-gray-300 italic">{suggestion.whyThisFillsGap}</p>}
                    {suggestion.trendRelevance && (
                      <p className="text-xs text-primary-600 dark:text-primary-400 mt-1">
                        🔥 {suggestion.trendRelevance}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
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

// Repurpose Modal Component (shared with MediaBox)
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
