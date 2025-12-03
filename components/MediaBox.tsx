import React, { useState, useRef, useEffect } from 'react';
import { MediaItemState, Platform, CaptionResult } from '../types';
import { generateCaptions } from '../src/services/geminiService';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebaseConfig';
import {
  UploadIcon,
  TrashIcon,
  RefreshIcon,
  SparklesIcon,
  CalendarIcon,
} from './icons/UIIcons';
import { useAppContext } from './AppContext';

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
  onAddNext: () => void;
  isLast: boolean;
  postGoal: string;
  postTone: string;
  canGenerate: boolean;
  onGenerateComplete: () => void;
}

export const MediaBox: React.FC<MediaBoxProps> = ({
  mediaItem,
  index,
  onUpdate,
  onRemove,
  onAddNext,
  isLast,
  postGoal,
  postTone,
  canGenerate,
  onGenerateComplete,
}) => {
  const { user, showToast } = useAppContext();
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileType = file.type.startsWith('image') ? 'image' : 'video';

    try {
      const base64 = await fileToBase64(file);
      const dataUrl = `data:${file.type};base64,${base64}`;

      onUpdate(index, {
        data: base64,
        mimeType: file.type,
        previewUrl: dataUrl,
        type: fileType,
        isGenerated: false,
        results: [],
        captionText: '',
      });

      // Auto-generate captions
      if (canGenerate && user) {
        setTimeout(() => {
          generateCaptionsForMedia(base64, file.type);
        }, 500);
      }
    } catch (error) {
      showToast('Failed to process file.', 'error');
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
        goal: postGoal,
        tone: postTone,
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

  const handleRegenerate = () => {
    if (mediaItem.data) {
      generateCaptionsForMedia(mediaItem.data, mediaItem.mimeType);
    }
  };

  const handleSelectCaption = (result: CaptionResult) => {
    const captionText =
      result.caption + '\n\n' + (result.hashtags || []).join(' ');
    onUpdate(index, { captionText });
  };

  return (
    <div className="relative group">
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border-2 border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700 transition-colors">
        {/* Media Preview */}
        {mediaItem.previewUrl ? (
          <div className="relative w-full h-32 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden mb-3">
            {mediaItem.type === 'image' ? (
              <img
                src={mediaItem.previewUrl}
                alt={`Media ${index + 1}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <video
                src={mediaItem.previewUrl}
                controls
                className="h-full w-full object-cover"
              />
            )}
            <button
              onClick={() => onRemove(index)}
              className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-black/90 text-white rounded-full transition-colors"
              title="Remove"
            >
              <TrashIcon className="w-3 h-3" />
            </button>
            {isGenerating && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <RefreshIcon className="w-6 h-6 text-white animate-spin" />
              </div>
            )}
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors mb-3"
          >
            <UploadIcon className="w-8 h-8 text-gray-400 dark:text-primary-500 mb-2" />
            <span className="text-xs text-gray-600 dark:text-gray-400">
              Upload {index === 0 ? 'image or video' : 'another'}
            </span>
          </div>
        )}

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept="image/*,video/*"
        />

        {/* Caption Results */}
        {mediaItem.results.length > 0 && (
          <div className="mb-3 space-y-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                AI Suggestions
              </span>
              <button
                onClick={handleRegenerate}
                disabled={!canGenerate || isGenerating}
                className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 disabled:opacity-50 flex items-center gap-1"
              >
                <RefreshIcon className="w-3 h-3" /> Regenerate
              </button>
            </div>
            <div className="space-y-1 max-h-24 overflow-y-auto">
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
          rows={3}
          className="w-full p-2 text-xs border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 resize-none"
        />

        {/* Schedule Date */}
        {mediaItem.scheduledDate && (
          <div className="mt-2 flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
            <CalendarIcon className="w-3 h-3" />
            <span>
              {new Date(mediaItem.scheduledDate).toLocaleString([], {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </span>
          </div>
        )}

        {/* Add Next Button */}
        {isLast && mediaItem.previewUrl && (
          <button
            onClick={onAddNext}
            className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800 rounded-md hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
          >
            <UploadIcon className="w-4 h-4" />
            Add Another
          </button>
        )}
      </div>
    </div>
  );
};

