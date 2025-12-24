import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Platform, Post, CalendarEvent } from '../types';
import { useAppContext } from './AppContext';
import { UploadIcon, SparklesIcon, CheckCircleIcon, RefreshIcon, CalendarIcon, TrashIcon, XMarkIcon, EmojiIcon, FaceSmileIcon, CatIcon, PizzaIcon, SoccerBallIcon, CarIcon, LightbulbIcon, HeartIcon, PlusIcon } from './icons/UIIcons';
import { EMOJIS, EMOJI_CATEGORIES, Emoji } from './emojiData';

const categoryIcons: Record<string, React.ReactNode> = {
    FaceSmileIcon: <FaceSmileIcon className="w-5 h-5"/>,
    CatIcon: <CatIcon className="w-5 h-5"/>,
    PizzaIcon: <PizzaIcon className="w-5 h-5"/>,
    SoccerBallIcon: <SoccerBallIcon className="w-5 h-5"/>,
    CarIcon: <CarIcon className="w-5 h-5"/>,
    LightbulbIcon: <LightbulbIcon className="w-5 h-5"/>,
    HeartIcon: <HeartIcon className="w-5 h-5"/>,
};
import { InstagramIcon, TikTokIcon, ThreadsIcon, XIcon, YouTubeIcon, LinkedInIcon, FacebookIcon, PinterestIcon } from './icons/PlatformIcons';
import { db, storage } from '../firebaseConfig';
import { collection, setDoc, doc, getDocs, query, where, deleteDoc } from 'firebase/firestore';
// @ts-ignore
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { scheduleMultiplePosts } from '../src/services/smartSchedulingService';
import { getAnalytics } from '../src/services/geminiService';
import { auth } from '../firebaseConfig';

const platformIcons: Record<Platform, React.ReactElement<{ className?: string }>> = {
  Instagram: <InstagramIcon />,
  TikTok: <TikTokIcon />,
  X: <XIcon />,
  Threads: <ThreadsIcon />,
  YouTube: <YouTubeIcon />,
  LinkedIn: <LinkedInIcon />,
  Facebook: <FacebookIcon />,
  Pinterest: <PinterestIcon />,
};

interface ProcessedMedia {
  id?: string; // Firestore ID for persistence
  file?: File; // Only present for new uploads
  previewUrl: string;
  caption: string;
  hashtags: string[];
  platforms: Platform[];
  goal: string;
  tone: string;
  mediaUrl?: string;
  scheduledDate?: string;
  status: 'pending' | 'analyzing' | 'scheduled' | 'error';
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
}

const fileToBase64 = (file: File): Promise<{ data: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            resolve({ data: result.split(',')[1], mimeType: file.type });
        };
        reader.onerror = error => reject(error);
    });
};

export const Automation: React.FC = () => {
  const { user, showToast, addCalendarEvent, setPosts, posts, setActivePage } = useAppContext();
  const [uploadedFiles, setUploadedFiles] = useState<ProcessedMedia[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingIndex, setProcessingIndex] = useState<number | null>(null);
  const [goal, setGoal] = useState('engagement');
  const [tone, setTone] = useState('friendly');
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>('Instagram');
    
    // Filter options for Business Starter/Growth plans
    const isBusiness = user?.userType === 'Business';
    const isAgencyPlan = user?.plan === 'Agency';
    const showAdvancedOptions = !isBusiness || isAgencyPlan; // Hide for Business Starter/Growth, show for Agency and all Creators
  const [showSummary, setShowSummary] = useState(false);
  const [scheduledPosts, setScheduledPosts] = useState<Array<{ media: ProcessedMedia; post: Post; event: CalendarEvent }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [emojiPickerOpen, setEmojiPickerOpen] = useState<number | null>(null);
  const [emojiSearchTerm, setEmojiSearchTerm] = useState('');
  const [activeEmojiCategory, setActiveEmojiCategory] = useState<Emoji['category']>(EMOJI_CATEGORIES[0].name);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const goalOptions = useMemo(
    () => [
      { value: 'engagement', label: 'Increase Engagement' },
      { value: 'sales', label: 'Drive Sales' },
      { value: 'awareness', label: 'Build Awareness' },
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
      ...(showAdvancedOptions
        ? [
            { value: 'sexy-bold', label: 'Sexy / Bold' },
            { value: 'sexy-explicit', label: 'Sexy / Explicit' }
          ]
        : [])
    ],
    [showAdvancedOptions]
  );

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

  // Close emoji picker when clicking outside
    useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.emoji-picker-container') && !target.closest('.emoji-button')) {
        setEmojiPickerOpen(null);
      }
    };

    if (emojiPickerOpen !== null) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [emojiPickerOpen]);

  // Load persisted automation files from Firestore
  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    let mounted = true;

    const loadPersistedFiles = async () => {
      try {
        const automationRef = collection(db, 'users', user.id, 'automation_files');
        const q = query(automationRef, where('status', 'in', ['pending', 'error']));
        const snapshot = await getDocs(q);
        
        if (!mounted) return;
        
        const persisted: ProcessedMedia[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          const previewUrl = data.mediaUrl || data.previewUrl;
          
          // Skip deleted files
          if (deletedFileIdsRef.current.has(doc.id)) {
            return;
          }
          
          // Skip items with blob URLs - they're invalid and won't work after reload
          if (previewUrl && (previewUrl.startsWith('blob:') || previewUrl.startsWith('data:'))) {
            return; // Skip this item
          }
          
          persisted.push({
            id: doc.id,
            previewUrl: previewUrl || '',
            caption: data.caption || '',
            hashtags: data.hashtags || [],
            platforms: data.platforms || [],
            goal: data.goal || 'engagement',
            tone: data.tone || 'friendly',
            mediaUrl: data.mediaUrl,
            scheduledDate: data.scheduledDate,
            status: data.status || 'pending',
            fileName: data.fileName,
            fileSize: data.fileSize,
            mimeType: data.mimeType,
          });
        });
        
        if (mounted) {
          setUploadedFiles(persisted);
        }
      } catch (error) {
        console.error('Failed to load persisted files:', error);
        if (mounted) {
          showToast('Failed to load saved files', 'error');
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    loadPersistedFiles();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  // Track deleted file IDs to prevent re-saving
  const deletedFileIdsRef = useRef<Set<string>>(new Set());
  
  // Load deleted IDs from localStorage on mount
  useEffect(() => {
    const savedDeletedIds = localStorage.getItem(`automation_deleted_ids_${user?.id}`);
    if (savedDeletedIds) {
      try {
        const ids = JSON.parse(savedDeletedIds);
        deletedFileIdsRef.current = new Set(ids);
      } catch (e) {
        console.error('Failed to load deleted IDs:', e);
      }
    }
  }, [user?.id]);

  // Save files to Firestore when they change
  useEffect(() => {
    if (!user || isLoading) return;

    const saveFiles = async () => {
      for (const file of uploadedFiles) {
        // Skip files that were deleted
        if (file.id && deletedFileIdsRef.current.has(file.id)) {
          continue;
        }

        // Only save files that aren't scheduled yet
        if (file.status === 'pending' || file.status === 'error') {
          try {
            const fileData: any = {
              previewUrl: file.previewUrl,
              caption: file.caption,
              hashtags: file.hashtags,
              platforms: file.platforms,
              goal: file.goal,
              tone: file.tone,
              status: file.status,
              fileName: file.fileName,
              fileSize: file.fileSize,
              mimeType: file.mimeType,
              updatedAt: new Date().toISOString(),
            };

            if (file.mediaUrl) {
              fileData.mediaUrl = file.mediaUrl;
            }

            if (file.id) {
              // Update existing
              await setDoc(doc(db, 'users', user.id, 'automation_files', file.id), fileData);
            } else {
              // Create new
              const newId = Date.now().toString();
              await setDoc(doc(db, 'users', user.id, 'automation_files', newId), {
                ...fileData,
                createdAt: new Date().toISOString(),
              });
              // Update local state with ID
              setUploadedFiles(prev => prev.map(f => 
                f.previewUrl === file.previewUrl ? { ...f, id: newId } : f
              ));
            }
          } catch (error) {
            console.error('Failed to save file:', error);
          }
        } else if (file.id && file.status === 'scheduled') {
          // Delete scheduled files from persistence
          try {
            await deleteDoc(doc(db, 'users', user.id, 'automation_files', file.id));
          } catch (error) {
            console.error('Failed to delete scheduled file:', error);
          }
        }
      }
    };

    saveFiles();
  }, [uploadedFiles, user, isLoading]);

  if (!user) return null;

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0 || !user) return;

    setIsProcessing(true);
    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        // Create temporary preview URL
        const tempPreviewUrl = URL.createObjectURL(file);
        
        // Upload to Firebase Storage immediately
        const timestamp = Date.now();
        const extension = file.type.split('/')[1] || (file.type.startsWith('image') ? 'jpg' : 'mp4');
        const storagePath = `users/${user.id}/automation/${timestamp}.${extension}`;
        const storageRef = ref(storage, storagePath);

        await uploadBytes(storageRef, file, { contentType: file.type });
        const firebaseUrl = await getDownloadURL(storageRef);
        
        // Revoke temporary blob URL
        URL.revokeObjectURL(tempPreviewUrl);

        return {
          file,
          previewUrl: firebaseUrl, // Use Firebase URL instead of blob URL
          caption: '',
          hashtags: [],
          platforms: [],
          goal: goal,
          tone: tone,
          status: 'pending',
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          mediaUrl: firebaseUrl, // Store Firebase URL for later use
        } as ProcessedMedia;
      });

      const newFiles = await Promise.all(uploadPromises);
      setUploadedFiles(prev => [...prev, ...newFiles]);
    } catch (error) {
      console.error('Failed to upload files:', error);
      showToast('Failed to upload files. Please try again.', 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [user, goal, tone, showToast]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const handleUseInCompose = (media: ProcessedMedia) => {
    // Navigate to compose page
    setActivePage('compose');
    
    // Store the media item in localStorage so Compose can pick it up
    const isVideo = media.mimeType?.startsWith('video/') || (media.file && media.file.type.startsWith('video/'));
    const mediaToAdd = {
      url: media.previewUrl,
      type: isVideo ? 'video' : 'image',
      mimeType: media.mimeType || (media.file ? media.file.type : 'image/jpeg'),
      name: media.fileName || media.file?.name || 'Media',
    };
    localStorage.setItem('pendingMediaFromLibrary', JSON.stringify(mediaToAdd));
    
    // Dispatch custom event to trigger import in Compose
    window.dispatchEvent(new CustomEvent('mediaLibraryItemAdded'));
    
    showToast('Media added to Compose page', 'success');
  };

  const analyzeMedia = async (media: ProcessedMedia): Promise<Partial<ProcessedMedia>> => {
    try {
      let mediaUrl = media.mediaUrl;
      
      // If mediaUrl doesn't exist, upload the file
      if (!mediaUrl && media.file) {
        const timestamp = Date.now();
        const ext = media.file.type.split('/')[1] || 'jpg';
        const storagePath = `users/${user.id}/automation/${timestamp}.${ext}`;
        const storageRef = ref(storage, storagePath);
        
        await uploadBytes(storageRef, media.file, { contentType: media.file.type });
        mediaUrl = await getDownloadURL(storageRef);
      } else if (!mediaUrl && media.previewUrl && media.previewUrl.startsWith('http')) {
        // Already uploaded, use previewUrl
        mediaUrl = media.previewUrl;
      }
      
      if (!mediaUrl) {
        throw new Error('No media URL available');
      }

      // Call analyzeMediaForPost API
      const token = await auth.currentUser?.getIdToken(true);
      const response = await fetch('/api/analyzeMediaForPost', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          mediaUrl,
          goal: media.goal,
          tone: media.tone,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to analyze media');
      }

      const analysis = await response.json();
      
      // Use selected platform if one is selected, otherwise use AI recommendations
      const platformToUse = selectedPlatform || (analysis.platforms?.[0] as Platform) || 'Instagram';
      
      return {
        caption: analysis.caption || '',
        hashtags: analysis.hashtags || [],
        platforms: [platformToUse],
        goal: analysis.goal || media.goal,
        tone: analysis.tone || media.tone,
        mediaUrl,
      };
    } catch (error) {
      console.error('Error analyzing media:', error);
      throw error;
    }
  };

  const startAutomation = async () => {
    if (uploadedFiles.length === 0) {
      showToast('Please upload at least one image or video', 'error');
      return;
    }

    setIsProcessing(true);
    const processed: ProcessedMedia[] = [];
    const newScheduledPosts: Array<{ media: ProcessedMedia; post: Post; event: CalendarEvent }> = [];

    try {
      // Get analytics for smart scheduling
      const analytics = await getAnalytics();

      // Process each file
      for (let i = 0; i < uploadedFiles.length; i++) {
        const media = uploadedFiles[i];
        setProcessingIndex(i);

        // Update status to analyzing
        setUploadedFiles(prev => prev.map((m, idx) => 
          idx === i ? { ...m, status: 'analyzing' } : m
        ));

        try {
          // Analyze media with current goal/tone settings
          const analysis = await analyzeMedia({
            ...media,
            goal: goal, // Use current goal setting
            tone: tone, // Use current tone setting
          });
          const updatedMedia: ProcessedMedia = {
            ...media,
            ...analysis,
            goal: goal, // Update with current settings
            tone: tone,
            status: 'pending',
          };

          // Get optimal scheduling times
          const scheduledDates = scheduleMultiplePosts(
            1,
            1, // Start from week 1
            analytics,
            updatedMedia.platforms[0], // Use first recommended platform
            { avoidClumping: true, minHoursBetween: 2 }
          );

          const scheduledDate = scheduledDates[0] || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          updatedMedia.scheduledDate = scheduledDate;

          // Create Post
          const postId = `auto-${Date.now()}-${i}`;
          const post: Post = {
            id: postId,
            content: updatedMedia.caption + '\n\n' + updatedMedia.hashtags.join(' '),
            mediaUrl: updatedMedia.mediaUrl,
            mediaType: media.file.type.startsWith('video/') ? 'video' : 'image',
            platforms: updatedMedia.platforms,
            status: 'Scheduled',
            author: { name: user.name, avatar: user.avatar },
            comments: [],
            scheduledDate,
            createdAt: new Date().toISOString(),
          };

          // Save Post to Firestore
          const postsCollectionRef = collection(db, 'users', user.id, 'posts');
          const safePost = JSON.parse(JSON.stringify(post));
          await setDoc(doc(postsCollectionRef, post.id), safePost);

          // Create CalendarEvent
          const event: CalendarEvent = {
            id: `cal-${postId}`,
            title: updatedMedia.caption.substring(0, 30) + (updatedMedia.caption.length > 30 ? '...' : ''),
            date: scheduledDate,
            type: media.file.type.startsWith('video/') ? 'Reel' : 'Post',
            platform: updatedMedia.platforms[0],
            status: 'Scheduled',
            thumbnail: updatedMedia.mediaUrl,
          };

          await addCalendarEvent(event);

          updatedMedia.status = 'scheduled';
          processed.push(updatedMedia);
          newScheduledPosts.push({ media: updatedMedia, post, event });

          // Update UI
          setUploadedFiles(prev => prev.map((m, idx) => 
            idx === i ? updatedMedia : m
          ));

          showToast(`Processed ${i + 1}/${uploadedFiles.length}`, 'success');
        } catch (error) {
          console.error(`Error processing file ${i + 1}:`, error);
          setUploadedFiles(prev => prev.map((m, idx) => 
            idx === i ? { ...m, status: 'error' } : m
          ));
          showToast(`Failed to process file ${i + 1}`, 'error');
        }
      }

      // Update posts state
      if (newScheduledPosts.length > 0) {
        setPosts(prev => [...prev, ...newScheduledPosts.map(sp => sp.post)]);
      }

      setScheduledPosts(newScheduledPosts);
      setShowSummary(true);
      showToast(`Successfully created and scheduled ${newScheduledPosts.length} posts!`, 'success');
      // Navigate to approvals page to show scheduled posts
      setTimeout(() => {
        setActivePage('approvals');
      }, 2000);
    } catch (error) {
      console.error('Automation error:', error);
      showToast('Automation failed. Please try again.', 'error');
    } finally {
      setIsProcessing(false);
      setProcessingIndex(null);
    }
  };

  const handleDeleteSelected = async () => {
    if (!user || selectedIndices.size === 0) return;
    
    // Get selected files in reverse order to maintain indices
    const selectedFiles = Array.from(selectedIndices).sort((a, b) => b - a);
    
    // Delete selected files from Firestore and track deleted IDs
    const deletePromises = selectedFiles.map(async (index) => {
      const media = uploadedFiles[index];
      if (!media) return;
      
      if (media.id) {
        deletedFileIdsRef.current.add(media.id);
        try {
          await deleteDoc(doc(db, 'users', user.id, 'automation_files', media.id));
        } catch (error) {
          console.error('Failed to delete file:', error);
          deletedFileIdsRef.current.delete(media.id);
        }
      }
      // Revoke blob URLs
      if (media.previewUrl && media.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(media.previewUrl);
      }
    });
    
    await Promise.all(deletePromises);
    
    // Remove selected files from state (in reverse order to maintain indices)
    let newFiles = [...uploadedFiles];
    selectedFiles.forEach(index => {
      newFiles = newFiles.filter((_, i) => i !== index);
    });
    setUploadedFiles(newFiles);
    
    // Persist deleted IDs to localStorage
    if (user) {
      localStorage.setItem(`automation_deleted_ids_${user.id}`, JSON.stringify(Array.from(deletedFileIdsRef.current)));
    }
    
    setSelectedIndices(new Set());
    showToast(`${selectedFiles.length} file(s) deleted`, 'success');
  };

  const handleDeleteMedia = async (index: number) => {
    const media = uploadedFiles[index];
    if (!media) return;

    // Track deleted ID to prevent re-saving
    if (media.id) {
      deletedFileIdsRef.current.add(media.id);
      // Persist deleted ID immediately to prevent re-saving
      if (user) {
        localStorage.setItem(`automation_deleted_ids_${user.id}`, JSON.stringify(Array.from(deletedFileIdsRef.current)));
      }
    }

    // Revoke blob URL if it exists
    if (media.previewUrl && media.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(media.previewUrl);
    }

    // Remove from state immediately (optimistic update)
    const newFiles = uploadedFiles.filter((_, i) => i !== index);
    setUploadedFiles(newFiles);

    // Delete from Firestore (async, but we've already removed from UI)
    if (media.id && user) {
      try {
        await deleteDoc(doc(db, 'users', user.id, 'automation_files', media.id));
        showToast('File deleted successfully', 'success');
      } catch (error) {
        console.error('Failed to delete from Firestore:', error);
        // On error, don't revert - file is already removed from UI
        // Just log the error
        showToast('File removed from view, but deletion from storage failed', 'error');
      }
        } else {
      // If no ID, it's a new file that hasn't been saved yet, so just remove from state
      showToast('File removed', 'success');
        }
    };

  const handleRegenerateCaptions = async (index: number) => {
    const media = uploadedFiles[index];
    if (!media || !user) return;

    try {
      const analysis = await analyzeMedia(media);
      setUploadedFiles(prev => prev.map((m, idx) => 
        idx === index ? { ...m, ...analysis, status: 'pending' } : m
      ));
      showToast('Captions regenerated successfully', 'success');
    } catch (error) {
      console.error('Failed to regenerate captions:', error);
      showToast('Failed to regenerate captions', 'error');
    }
  };

  const handleBulkRegenerateCaptions = async () => {
    if (selectedIndices.size === 0) {
      showToast('Please select at least one image to regenerate captions', 'error');
            return;
        }

    setIsProcessing(true);
            try {
      const indices = Array.from(selectedIndices);
      for (const index of indices) {
        await handleRegenerateCaptions(index);
      }
      showToast(`Regenerated captions for ${indices.length} image(s)`, 'success');
      setSelectedIndices(new Set());
            } catch (error) {
      console.error('Failed to regenerate captions:', error);
      showToast('Failed to regenerate some captions', 'error');
    } finally {
      setIsProcessing(false);
        }
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

  const handleEmojiSelect = (emoji: string, index: number) => {
    setUploadedFiles(prev => prev.map((m, idx) => 
      idx === index ? { ...m, caption: m.caption + emoji } : m
    ));
    setEmojiPickerOpen(null);
  };

  const handleUpdateMediaGoal = (index: number, newGoal: string) => {
    setUploadedFiles(prev => prev.map((m, idx) => 
      idx === index ? { ...m, goal: newGoal } : m
    ));
  };

  const handleUpdateMediaTone = (index: number, newTone: string) => {
    setUploadedFiles(prev => prev.map((m, idx) => 
      idx === index ? { ...m, tone: newTone } : m
    ));
  };

  const handleUpdateMediaCaption = (index: number, newCaption: string) => {
    setUploadedFiles(prev => prev.map((m, idx) => 
      idx === index ? { ...m, caption: newCaption } : m
    ));
    };

    return (
        <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-full">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            AI Content Generation
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Upload images or videos, set your goal and tone, and let AI automatically generate engaging captions and relevant hashtags tailored to your content and target platforms.
          </p>
        </div>

        {/* Settings */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Default Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Goal of the Post
              </label>
              <select
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
              >
                {goalOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Tone of Voice
              </label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
              >
                {toneOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <button
              onClick={async () => {
                if (uploadedFiles.length === 0) {
                  showToast('Please upload media first', 'error');
                  return;
                }
                setIsProcessing(true);
                try {
                  // Generate captions for all uploaded media using default goal and tone
                  for (let i = 0; i < uploadedFiles.length; i++) {
                    const media = uploadedFiles[i];
                    setProcessingIndex(i);
                    const analysis = await analyzeMedia({
                      ...media,
                      goal,
                      tone,
                    });
                    setUploadedFiles(prev => prev.map((m, idx) => 
                      idx === i ? { ...m, ...analysis, goal, tone } : m
                    ));
                  }
                  showToast(`Generated captions for ${uploadedFiles.length} media file(s)`, 'success');
                } catch (error) {
                  console.error('Failed to generate captions:', error);
                  showToast('Failed to generate captions. Please try again.', 'error');
                } finally {
                  setIsProcessing(false);
                  setProcessingIndex(null);
                }
              }}
              disabled={isProcessing || uploadedFiles.length === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <SparklesIcon className="w-4 h-4" />
              {isProcessing ? 'Generating Captions...' : `Generate Captions for All (${uploadedFiles.length})`}
                                </button>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Plan for Platform (Select One)
            </label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(platformIcons) as Platform[]).filter(p => p !== 'OnlyFans').map((platform) => (
                <button
                  key={platform}
                  onClick={() => setSelectedPlatform(platform)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-colors ${
                    selectedPlatform === platform
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium'
                      : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <span className="w-4 h-4">{platformIcons[platform]}</span>
                  <span className="text-sm font-medium">{platform}</span>
                                </button>
              ))}
                            </div>
            {!selectedPlatform && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Please select a platform to generate platform-optimized captions</p>
            )}
                        </div>
                            </div>
            
        {/* Upload Area - Center when no files, compact when files exist */}
        {uploadedFiles.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
            <div
              ref={dropZoneRef}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center hover:border-primary-500 dark:hover:border-primary-500 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadIcon className="w-12 h-12 mx-auto mb-2 text-gray-400 dark:text-gray-500" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Drag & drop or click to upload images/videos
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={(e) => handleFileSelect(e.target.files)}
                className="hidden"
              />
                        </div>
                            </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
            {/* Uploaded Files Preview */}
                            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Uploaded Files ({uploadedFiles.length})
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={startAutomation}
                    disabled={isProcessing}
                    className="flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? (
                      <>
                        <RefreshIcon className="w-4 h-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                                        <>
                        <SparklesIcon className="w-4 h-4" />
                        Start Automation
                                        </>
                                    )}
                    </button>
                            </div>
                        </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {uploadedFiles.map((media, index) => {
                  const isVideo = media.mimeType?.startsWith('video/') || (media.file && media.file.type.startsWith('video/'));
                  const fileName = media.fileName || media.file?.name || `Media ${index + 1}`;
                  const isSelected = selectedIndices.has(index);
                                    return (
                  <div
                    key={media.id || index}
                    className="relative border-2 rounded-lg overflow-hidden bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                  >
                    {/* Header with delete button */}
                    <div className="flex items-center justify-between p-2 border-b border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                          {fileName}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {media.status === 'analyzing' && (
                          <RefreshIcon className="w-4 h-4 animate-spin text-primary-600" />
                        )}
                        {media.status === 'scheduled' && (
                          <CheckCircleIcon className="w-4 h-4 text-green-600" />
                        )}
                        {media.status === 'error' && (
                          <span className="text-xs text-red-600">Error</span>
                        )}
                                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteMedia(index);
                          }}
                          className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          title="Delete"
                        >
                          <XMarkIcon className="w-4 h-4" />
                                        </button>
                            </div>
                        </div>

                    {/* Media Preview */}
                    <div className="relative group">
                      {isVideo ? (
                        <video
                          src={media.previewUrl}
                          className="w-full h-40 object-contain bg-gray-100 dark:bg-gray-700"
                          controls={false}
                        />
                      ) : (
                        <img
                          src={media.previewUrl}
                          alt={`Upload ${index + 1}`}
                          className="w-full h-40 object-contain bg-gray-100 dark:bg-gray-700"
                        />
                      )}
                      {isProcessing && processingIndex === index && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <div className="text-white text-sm">Analyzing...</div>
                                </div>
                      )}
                                        </div>

                    {/* Controls */}
                    <div className="p-3 space-y-3">
                      {/* Goal and Tone Dropdowns */}
                      <div className="grid grid-cols-2 gap-2">
                             <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Goal
                          </label>
                          <select
                            value={media.goal}
                            onChange={(e) => handleUpdateMediaGoal(index, e.target.value)}
                            className="w-full p-1.5 text-xs border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                          >
                            {goalOptions.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                                    </select>
                            </div>
                            <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Tone
                          </label>
                          <select
                            value={media.tone}
                            onChange={(e) => handleUpdateMediaTone(index, e.target.value)}
                            className="w-full p-1.5 text-xs border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                          >
                            {toneOptions.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                                </select>
                            </div>
                        </div>

                      {/* Caption with Emoji Button */}
                                        <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Caption
                                </label>
                        <div className="relative">
                                                <textarea
                            value={media.caption}
                            onChange={(e) => handleUpdateMediaCaption(index, e.target.value)}
                            className="w-full p-2 text-xs border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white resize-y min-h-[100px] max-h-[300px] pr-8 overflow-y-auto"
                            placeholder="Caption will be generated..."
                            rows={4}
                          />
                          <button
                            type="button"
                            onClick={() => setEmojiPickerOpen(emojiPickerOpen === index ? null : index)}
                            className="emoji-button absolute right-2 top-2 p-1 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
                            title="Add emoji"
                          >
                            <EmojiIcon className="w-4 h-4" />
                                                    </button>
                          {emojiPickerOpen === index && (
                            <div className="emoji-picker-container absolute z-20 right-0 top-full mt-1 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-2 flex flex-col border border-gray-200 dark:border-gray-600">
                              <div className="px-1 pb-2">
                                <input
                                  type="text"
                                  placeholder="Search emojis..."
                                  value={emojiSearchTerm}
                                  onChange={e => setEmojiSearchTerm(e.target.value)}
                                  className="w-full p-2 border rounded-md bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-sm"
                                />
                                                </div>
                              <div className="grid grid-cols-8 gap-1 overflow-y-auto max-h-64 pr-1 scrollbar-thin min-h-[200px]">
                                {filteredEmojis.length > 0 ? (
                                  filteredEmojis.map(({ emoji, description }) => (
                                    <button
                                      key={description}
                                      type="button"
                                      onClick={() => handleEmojiSelect(emoji, index)}
                                      className="text-2xl p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 flex justify-center items-center"
                                      title={description}
                                    >
                                      {emoji}
                                    </button>
                                  ))
                                ) : (
                                  <div className="col-span-8 text-center text-gray-500 dark:text-gray-400 py-4 text-sm">
                                    No emojis found
                                                    </div>
                                                )}
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
                    </div>

                      {/* Regenerate Button */}
                      <button
                        onClick={() => handleRegenerateCaptions(index)}
                        disabled={isProcessing}
                        className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                      >
                        <SparklesIcon className="w-3 h-3" />
                        Regenerate Captions
                      </button>
            </div>
        </div>
    );
                })}
                
                {/* Upload Box - Always visible after uploaded files */}
                <div
                  ref={dropZoneRef}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors bg-white dark:bg-gray-800"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <PlusIcon className="w-6 h-6 text-gray-400 dark:text-primary-500" />
                  <span className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    image/video
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    onChange={(e) => handleFileSelect(e.target.files)}
                    className="hidden"
                  />
            </div>
              </div>
            </div>
                        </div>
                    )}

        {/* Summary Modal */}
        {showSummary && scheduledPosts.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    ✅ Posts Created & Scheduled
                  </h2>
                  <button
                    onClick={() => setShowSummary(false)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    ✕
                    </button>
            </div>

                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Successfully created and scheduled {scheduledPosts.length} post{scheduledPosts.length !== 1 ? 's' : ''}:
                </p>

                    <div className="space-y-4">
                  {scheduledPosts.map(({ media, post, event }, index) => {
                    const isVideo = media.mimeType?.startsWith('video/') || (media.file && media.file.type.startsWith('video/'));
                    return (
                    <div
                      key={index}
                      className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-700"
                    >
                      <div className="flex gap-4">
                        <div className="w-24 h-24 flex-shrink-0 bg-gray-100 dark:bg-gray-700 rounded">
                          {isVideo ? (
                            <video
                              src={media.previewUrl}
                              className="w-full h-full object-contain rounded"
                              controls={false}
                            />
                          ) : (
                            <img
                              src={media.previewUrl}
                              alt={`Post ${index + 1}`}
                              className="w-full h-full object-contain rounded"
                            />
                          )}
                                    </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {post.platforms.map(platform => (
                              <div key={platform} className="text-gray-600 dark:text-gray-300" title={platform}>
                                {platformIcons[platform]}
                                        </div>
                                    ))}
                                </div>
                          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2 line-clamp-2">
                            {post.content.substring(0, 100)}...
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <CalendarIcon className="w-4 h-4" />
                            <span>
                              {new Date(post.scheduledDate || '').toLocaleString([], {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })}
                            </span>
                                    </div>
                                    </div>
                                        </div>
                                </div>
                    );
                  })}
            </div>

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => {
                      setShowSummary(false);
                      handleClear();
                    }}
                    className="px-6 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                  >
                    Done
                                    </button>
                                </div>
                            </div>
                        </div>
          </div>
                    )}
            </div>
        </div>
    );
};

export default Automation;
