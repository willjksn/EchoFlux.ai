import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Platform, Post, CalendarEvent } from '../types';
import { useAppContext } from './AppContext';
import { UploadIcon, SparklesIcon, CheckCircleIcon, RefreshIcon, CalendarIcon } from './icons/UIIcons';
import { InstagramIcon, TikTokIcon, ThreadsIcon, XIcon, YouTubeIcon, LinkedInIcon, FacebookIcon } from './icons/PlatformIcons';
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
  const { user, showToast, addCalendarEvent, setPosts, posts } = useAppContext();
  const [uploadedFiles, setUploadedFiles] = useState<ProcessedMedia[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingIndex, setProcessingIndex] = useState<number | null>(null);
  const [goal, setGoal] = useState('engagement');
  const [tone, setTone] = useState('friendly');
  const [selectedPlatforms, setSelectedPlatforms] = useState<Record<Platform, boolean>>({
    Instagram: true,
    TikTok: false,
    X: false,
    Threads: false,
    YouTube: false,
    LinkedIn: false,
    Facebook: false,
  });
  
  // Filter options for Business Starter/Growth plans
  const isBusiness = user?.userType === 'Business';
  const isAgencyPlan = user?.plan === 'Agency';
  const showAdvancedOptions = !isBusiness || isAgencyPlan; // Hide for Business Starter/Growth, show for Agency and all Creators
  const [showSummary, setShowSummary] = useState(false);
  const [scheduledPosts, setScheduledPosts] = useState<Array<{ media: ProcessedMedia; post: Post; event: CalendarEvent }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

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

  // Save files to Firestore when they change
  useEffect(() => {
    if (!user || isLoading) return;

    const saveFiles = async () => {
      for (const file of uploadedFiles) {
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
      
      // Use selected platforms if any are selected, otherwise use AI recommendations
      const platformsToUse = Object.keys(selectedPlatforms).some(p => selectedPlatforms[p as Platform]) 
        ? (Object.keys(selectedPlatforms).filter(p => selectedPlatforms[p as Platform]) as Platform[])
        : (analysis.platforms || ['Instagram']) as Platform[];
      
      return {
        caption: analysis.caption || '',
        hashtags: analysis.hashtags || [],
        platforms: platformsToUse,
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
    } catch (error) {
      console.error('Automation error:', error);
      showToast('Automation failed. Please try again.', 'error');
    } finally {
      setIsProcessing(false);
      setProcessingIndex(null);
    }
  };

  const handleClear = () => {
    uploadedFiles.forEach(media => {
      URL.revokeObjectURL(media.previewUrl);
    });
    setUploadedFiles([]);
    setScheduledPosts([]);
    setShowSummary(false);
  };

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-full">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Quick Post Automation
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Upload images or videos and let AI automatically create captions, hashtags, select platforms, and schedule posts at optimal times.
          </p>
        </div>

        {/* Settings */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Settings</h3>
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
                <option value="engagement">Increase Engagement</option>
                <option value="sales">Drive Sales</option>
                <option value="awareness">Build Awareness</option>
                <option value="followers">Increase Followers/Fans</option>
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
                <option value="friendly">Friendly</option>
                <option value="witty">Witty</option>
                <option value="inspirational">Inspirational</option>
                <option value="professional">Professional</option>
                {showAdvancedOptions && (
                  <>
                    <option value="sexy-bold">Sexy / Bold</option>
                    <option value="sexy-explicit">Sexy / Explicit</option>
                  </>
                )}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Platforms to Post To
            </label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(platformIcons) as Platform[]).map((platform) => (
                <button
                  key={platform}
                  onClick={() => setSelectedPlatforms(prev => ({ ...prev, [platform]: !prev[platform] }))}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-colors ${
                    selectedPlatforms[platform]
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <span className="w-4 h-4">{platformIcons[platform]}</span>
                  <span className="text-sm font-medium">{platform}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Upload Area */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
          <div
            ref={dropZoneRef}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-12 text-center hover:border-primary-500 dark:hover:border-primary-500 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon className="w-16 h-16 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Drag & Drop Images or Videos
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              or click to browse files
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

          {/* Uploaded Files Preview */}
          {uploadedFiles.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Uploaded Files ({uploadedFiles.length})
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={handleClear}
                    className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                  >
                    Clear All
                  </button>
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

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {uploadedFiles.map((media, index) => {
                  const isVideo = media.mimeType?.startsWith('video/') || (media.file && media.file.type.startsWith('video/'));
                  const fileName = media.fileName || media.file?.name || `Media ${index + 1}`;
                  return (
                  <div
                    key={media.id || index}
                    className="relative border rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-700"
                  >
                    {isVideo ? (
                      <video
                        src={media.previewUrl}
                        className="w-full h-32 object-cover"
                        controls={false}
                      />
                    ) : (
                      <img
                        src={media.previewUrl}
                        alt={`Upload ${index + 1}`}
                        className="w-full h-32 object-cover"
                      />
                    )}
                    <div className="p-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                          {fileName}
                        </span>
                        {media.status === 'analyzing' && (
                          <RefreshIcon className="w-4 h-4 animate-spin text-primary-600" />
                        )}
                        {media.status === 'scheduled' && (
                          <CheckCircleIcon className="w-4 h-4 text-green-600" />
                        )}
                        {media.status === 'error' && (
                          <span className="text-xs text-red-600">Error</span>
                        )}
                      </div>
                      {isProcessing && processingIndex === index && (
                        <div className="text-xs text-primary-600 dark:text-primary-400">
                          Analyzing...
                        </div>
                      )}
                      {media.status === 'scheduled' && (
                        <div className="text-xs text-green-600 dark:text-green-400">
                          Scheduled
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

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
                        <div className="w-24 h-24 flex-shrink-0">
                          {isVideo ? (
                            <video
                              src={media.previewUrl}
                              className="w-full h-full object-cover rounded"
                              controls={false}
                            />
                          ) : (
                            <img
                              src={media.previewUrl}
                              alt={`Post ${index + 1}`}
                              className="w-full h-full object-cover rounded"
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
