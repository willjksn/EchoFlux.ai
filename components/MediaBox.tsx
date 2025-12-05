import React, { useState, useRef } from 'react';
import { MediaItemState, CaptionResult, Platform } from '../types';
import { generateCaptions } from '../src/services/geminiService';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebaseConfig';
import {
  UploadIcon,
  TrashIcon,
  RefreshIcon,
  CalendarIcon,
  SendIcon,
  MobileIcon,
  ImageIcon,
  PlusIcon,
} from './icons/UIIcons';
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
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { VideoIcon } from './icons/UIIcons';

const platformIcons: Record<Platform, React.ReactNode> = {
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
  platformIcons: Record<Platform, React.ReactNode>;
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
  platformIcons,
}) => {
  const { user, showToast, setActivePage } = useAppContext();
  const [isGenerating, setIsGenerating] = useState(false);
  const [showMediaLibraryModal, setShowMediaLibraryModal] = useState(false);
  const [libraryMediaItems, setLibraryMediaItems] = useState<MediaLibraryItem[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    const fileType = file.type.startsWith('image') ? 'image' : 'video';

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

      // Convert to base64 for storage (optional, but kept for compatibility)
      const base64 = await fileToBase64(file);

      onUpdate(index, {
        data: base64,
        mimeType: file.type,
        previewUrl: firebaseUrl, // Use Firebase URL instead of blob/data URL
        type: fileType,
        isGenerated: false,
        results: [],
        captionText: '',
      });
    } catch (error) {
      showToast('Failed to upload file.', 'error');
      console.error(error);
    }
  };

  const generateCaptionsForMedia = async (base64Data: string, mimeType: string) => {
    if (!canGenerate || !user) return;

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

      const res = await generateCaptions({
        mediaUrl,
        goal: mediaItem.postGoal,
        tone: mediaItem.postTone,
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
        <div className="relative w-full h-32 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden mb-3 flex items-center justify-center">
          {mediaItem.type === 'image' ? (
            <img
              src={mediaItem.previewUrl}
              alt={`Post ${index + 1}`}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <video
              src={mediaItem.previewUrl}
              controls
              className="max-h-full max-w-full object-contain"
            />
          )}
          {isGenerating && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <RefreshIcon className="w-6 h-6 text-white animate-spin" />
            </div>
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
      <textarea
        value={mediaItem.captionText}
        onChange={e => onUpdate(index, { captionText: e.target.value })}
        placeholder="Write caption or select AI suggestion..."
        rows={4}
        className="w-full p-2.5 text-sm border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 resize-y mb-3"
      />

      {/* Schedule Date */}
      {mediaItem.scheduledDate && (
        <div className="mb-3 flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
          <CalendarIcon className="w-3 h-3" />
          <span>
            {new Date(mediaItem.scheduledDate).toLocaleString([], {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </span>
        </div>
      )}

      {/* Platform Selection */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
          Publish to
        </label>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(platformIcons) as Platform[]).map(platform => (
            <button
              key={platform}
              onClick={() => {
                const currentPlatforms = mediaItem.selectedPlatforms || {};
                onUpdate(index, {
                  selectedPlatforms: {
                    ...currentPlatforms,
                    [platform]: !currentPlatforms[platform],
                  },
                });
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

      {/* Preview Button - Always visible if media exists */}
      {mediaItem.previewUrl && (
        <button
          onClick={() => onPreview(index)}
          className="w-full mb-3 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          <MobileIcon className="w-3 h-3" /> Preview
        </button>
      )}

      {/* Action Buttons */}
      {hasContent && (
        <div className="flex flex-col gap-2">
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
        </div>
      )}

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
    </div>
  );
};
