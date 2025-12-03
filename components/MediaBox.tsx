import React, { useState, useRef } from 'react';
import { MediaItemState, CaptionResult } from '../types';
import { generateCaptions } from '../src/services/geminiService';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebaseConfig';
import {
  UploadIcon,
  TrashIcon,
  RefreshIcon,
  CalendarIcon,
  PlusIcon,
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
  canGenerate: boolean;
  onGenerateComplete: () => void;
  goalOptions: { value: string; label: string }[];
  toneOptions: { value: string; label: string }[];
  autoGenerateCaptions: boolean;
}

export const MediaBox: React.FC<MediaBoxProps> = ({
  mediaItem,
  index,
  onUpdate,
  onRemove,
  onAddNext,
  isLast,
  canGenerate,
  onGenerateComplete,
  goalOptions,
  toneOptions,
  autoGenerateCaptions,
}) => {
  const { user, showToast } = useAppContext();
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

      // Auto-generate captions if enabled
      if (autoGenerateCaptions && canGenerate && user) {
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
    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700 transition-colors">
      {/* Header with Remove button */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Post {index + 1}
        </span>
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
        <div className="relative w-full h-40 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden mb-3">
          {mediaItem.type === 'image' ? (
            <img
              src={mediaItem.previewUrl}
              alt={`Post ${index + 1}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <video
              src={mediaItem.previewUrl}
              controls
              className="h-full w-full object-cover"
            />
          )}
          {isGenerating && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <RefreshIcon className="w-6 h-6 text-white animate-spin" />
            </div>
          )}
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors mb-3"
        >
          <UploadIcon className="w-10 h-10 text-gray-400 dark:text-primary-500 mb-2" />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Upload image or video
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

      {/* Caption Results */}
      {mediaItem.results.length > 0 && (
        <div className="mb-3 space-y-2">
          <div className="flex items-center justify-between">
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
        rows={3}
        className="w-full p-2 text-xs border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 resize-none mb-3"
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

      {/* Add Next Button */}
      {isLast && mediaItem.previewUrl && (
        <button
          onClick={onAddNext}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30 border-2 border-dashed border-primary-300 dark:border-primary-700 rounded-md hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
        >
          <PlusIcon className="w-5 h-5" />
          Add Image/Video
        </button>
      )}
    </div>
  );
};
