import React, { useState, useEffect, useRef, useMemo } from 'react';

import {
  generateSpeech,
  generateStoryboard,
  generateCaptions,
  generateVideo,
  getVideoStatus,
  saveGeneratedContent,
} from '../src/services/geminiService';

import {
  SparklesIcon,
  VideoIcon,
  PlayIcon,
  VoiceIcon,
  UploadIcon,
  TrashIcon,
  SendIcon,
  ImageIcon,
  RedoIcon,
  MobileIcon,
  FilmIcon,
  PlusIcon,
  CheckCircleIcon,
  CalendarIcon,
  DownloadIcon,
} from './icons/UIIcons';
import { useAppContext } from './AppContext';
import { CustomVoice, Platform, VideoScene, CalendarEvent } from '../types';
import {
  InstagramIcon,
  TikTokIcon,
  ThreadsIcon,
  XIcon,
  YouTubeIcon,
  LinkedInIcon,
  FacebookIcon,
} from './icons/PlatformIcons';
import { UpgradePrompt } from './UpgradePrompt';
import { MobilePreviewModal } from './MobilePreviewModal';

// Video generation is now enabled!

const loadingMessages = [
  'Warming up the virtual cameras...',
  'Rendering the digital actors...',
  'This can take a few minutes, please wait...',
];

const SpeechRecognition =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const isSpeechRecognitionSupported = !!SpeechRecognition;

const fileToBase64 = (
  file: File
): Promise<{ data: string; mimeType: string; dataUrl: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve({
        data: result.split(',')[1],
        mimeType: file.type,
        dataUrl: result,
      });
    };
    reader.onerror = (error) => reject(error);
  });
};

interface VideoGeneratorProps {
  onGenerate?: () => void;
  usageLeft?: number;
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

export const VideoGenerator: React.FC<VideoGeneratorProps> = ({
  onGenerate,
  usageLeft,
}) => {
  const {
    user,
    clients,
    showToast,
    userBaseImage,
    userCustomVoices,
    setUserCustomVoices,
    setActivePage,
    openPaymentModal,
    selectedClient,
    addCalendarEvent,
  } = useAppContext();

  const [mode, setMode] = useState<'Simple' | 'Director'>('Simple');

  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState<string>('idle');
  const [loadingMessage, setLoadingMessage] = useState(loadingMessages[0]);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('9:16');

  const [uploadedImage, setUploadedImage] = useState<{
    data: string;
    mimeType: string;
    previewUrl: string;
  } | null>(null);

  const [caption, setCaption] = useState('');
  const [isCaptionLoading, setIsCaptionLoading] = useState(false);

  const [generateVoiceOver, setGenerateVoiceOver] = useState(false);
  const [voiceOverScript, setVoiceOverScript] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('Zephyr');
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(
    null
  );
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);

  const [selectedPlatforms, setSelectedPlatforms] = useState<
    Record<Platform, boolean>
  >({
    Instagram: false,
    TikTok: false,
    X: false,
    Threads: false,
    YouTube: false,
    LinkedIn: false,
    Facebook: false,
  });

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');

  // Director Mode
  const [scenes, setScenes] = useState<VideoScene[]>([]);
  const [storyboardConcept, setStoryboardConcept] = useState('');
  const [isStoryboarding, setIsStoryboarding] = useState(false);

  const recognitionRef = useRef<any>(null);
  const voiceFileRef = useRef<HTMLInputElement | null>(null);
  const imageFileRef = useRef<HTMLInputElement | null>(null);

  if (!user) return null;

  const isBusiness = user.userType === 'Business';
  const isAgencyPlan = user.plan === 'Agency';
  // Director Mode: Available to Creators and Agency plan (can create content for clients)
  // Other Business plans (Starter, Growth) only get Simple Mode
  const showDirectorMode = !isBusiness || isAgencyPlan;

  // Ensure Business users (non-Agency) are always in Simple mode
  useEffect(() => {
    if (isBusiness && !isAgencyPlan && mode === 'Director') {
      setMode('Simple');
    }
  }, [isBusiness, isAgencyPlan, mode]);

  const showComingSoon = () =>
    showToast('Director Mode coming soon!', 'info');

  // Poll for video status
  useEffect(() => {
    if (!operationId || videoStatus === 'succeeded' || videoStatus === 'failed') return;

    const pollInterval = setInterval(async () => {
      try {
        const status = await getVideoStatus(operationId);
        setVideoStatus(status.status || 'processing');

        if (status.status === 'succeeded' && status.videoUrl) {
          setGeneratedVideoUrl(status.videoUrl);
          setIsLoading(false);
          setLoadingMessage('Video ready!');
          showToast('Video generated successfully!', 'success');
          if (onGenerate) onGenerate();
        } else if (status.status === 'failed') {
          setIsLoading(false);
          showToast(status.error || 'Video generation failed', 'error');
        }
      } catch (error: any) {
        console.error('Error polling video status:', error);
        // Continue polling on error
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [operationId, videoStatus, onGenerate, showToast]);

  // Rotate loading messages while generating
  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setLoadingMessage(loadingMessages[Math.floor(Math.random() * loadingMessages.length)]);
    }, 5000);
    return () => clearInterval(interval);
  }, [isLoading]);

  const handleMicClick = () => {
    if (!isSpeechRecognitionSupported || !recognitionRef.current) return;
    recognitionRef.current.start();
  };

  const handleImageFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      const { data, mimeType, dataUrl } = await fileToBase64(file);
      setUploadedImage({ data, mimeType, previewUrl: dataUrl });
    }
  };

  const handleGenerateCaption = async () => {
    setIsCaptionLoading(true);
    try {
      const result = await generateCaptions({ promptText: prompt });
      if (Array.isArray(result.captions)) {
        setCaption(result.captions[0].caption || '');
      }
    } catch {}
    setIsCaptionLoading(false);
  };

  const handleGenerateStoryboard = async () => {
    if (!storyboardConcept.trim()) return;
    setIsStoryboarding(true);
    try {
      const storyboard = await generateStoryboard(storyboardConcept);
      setScenes(
        storyboard.prompts.map((txt: string, i: number) => ({
          id: `scene-${Date.now()}-${i}`,
          prompt: txt,
          status: 'pending',
          duration: 4,
        }))
      );
    } finally {
      setIsStoryboarding(false);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      showToast('Please enter a video prompt', 'error');
      return;
    }

    setIsLoading(true);
    setGeneratedVideoUrl(null);
    setVideoStatus('starting');
    setLoadingMessage(loadingMessages[0]);

    try {
      const result = await generateVideo(
        prompt,
        uploadedImage || undefined,
        aspectRatio
      );

      if (result.operationId) {
        setOperationId(result.operationId);
        setVideoStatus(result.status || 'processing');
        showToast('Video generation started. This may take a few minutes...', 'info');
      } else if (result.videoUrl) {
        // Video already ready (unlikely but handle it)
        setGeneratedVideoUrl(result.videoUrl);
        setIsLoading(false);
        showToast('Video generated successfully!', 'success');
        if (onGenerate) onGenerate();
      } else {
        throw new Error('No operation ID or video URL returned');
      }
    } catch (error: any) {
      console.error('Video generation error:', error);
      setIsLoading(false);
      setVideoStatus('failed');
      showToast(error?.message || 'Failed to generate video. Please try again.', 'error');
    }
  };

  const handleDownloadVideo = async () => {
    if (!generatedVideoUrl) return;
    try {
      const response = await fetch(generatedVideoUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `video-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      showToast('Video downloaded!', 'success');
    } catch (error: any) {
      console.error('Download error:', error);
      showToast('Failed to download video', 'error');
    }
  };

  const handleSaveVideo = async () => {
    if (!generatedVideoUrl || !prompt) return;
    try {
      const result = await saveGeneratedContent('video', {
        videoUrl: generatedVideoUrl,
        prompt: prompt,
        aspectRatio: aspectRatio,
        caption: caption,
        createdAt: new Date().toISOString(),
      });
      if (result.success) {
        showToast('Video saved to profile!', 'success');
      } else {
        showToast(result.error || 'Failed to save video', 'error');
      }
    } catch (error: any) {
      console.error('Save error:', error);
      showToast('Failed to save video', 'error');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Preview modal */}
      <MobilePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        caption={caption}
        media={null}
        user={selectedClient || user}
      />

      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
          AI Video Studio (Veo)
        </h2>
        <p className="mt-2 text-lg text-gray-500 dark:text-gray-400">
          {showDirectorMode
            ? 'Create single clips or direct multi-scene videos.'
            : 'Create single video clips for your ads and content.'}
        </p>
      </div>

      {/* Mode toggle - Only show for Creators or Agency plan users */}
      {showDirectorMode && (
      <div className="flex justify-center">
        <div className="bg-gray-100 dark:bg-gray-700 p-1 rounded-lg inline-flex">
          <button
            onClick={() => setMode('Simple')}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              mode === 'Simple'
                ? 'bg-white dark:bg-gray-600 shadow'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            Single Clip
          </button>
          <button
            onClick={() => setMode('Director')}
            className={`px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
              mode === 'Director'
                ? 'bg-white dark:bg-gray-600 shadow'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            <FilmIcon className="w-4 h-4" /> Director Mode
          </button>
        </div>
      </div>
      )}

      {/* Director Mode */}
      {mode === 'Director' ? (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
            <div className="flex items-center gap-2 mb-4">
              <FilmIcon className="w-5 h-5 text-primary-600" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Director Mode - Coming Soon
              </h3>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Director Mode will allow you to create multi-scene videos with storyboards, scene-by-scene editing, and advanced video composition features.
              </p>
            </div>
            <textarea
              value={storyboardConcept}
              onChange={(e) => setStoryboardConcept(e.target.value)}
              placeholder="Enter video concept for storyboard generation..."
              className="w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
              rows={4}
              disabled
            />
            <button
              onClick={showComingSoon}
              disabled
              className="mt-3 px-4 py-2 bg-gray-400 text-white rounded-md cursor-not-allowed opacity-60"
            >
              Coming Soon
            </button>
          </div>
        </div>
      ) : (
        // Simple Mode
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Video Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
              placeholder="Describe the video you want to generate..."
              rows={3}
            />
          </div>

          {/* Aspect Ratio Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Aspect Ratio
            </label>
            <div className="flex gap-2">
              {(['9:16', '16:9', '1:1'] as const).map((ratio) => (
                <button
                  key={ratio}
                  onClick={() => setAspectRatio(ratio)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    aspectRatio === ratio
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {ratio === '9:16' ? 'Vertical (9:16)' : ratio === '16:9' ? 'Horizontal (16:9)' : 'Square (1:1)'}
                </button>
              ))}
            </div>
          </div>

          {/* Image Upload Option */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Base Image (Optional - for image-to-video)
            </label>
            <input
              ref={imageFileRef}
              type="file"
              accept="image/*"
              onChange={handleImageFileChange}
              className="hidden"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={() => imageFileRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                <UploadIcon className="w-4 h-4" /> Upload Image
              </button>
              {uploadedImage && (
                <div className="flex items-center gap-2">
                  <img
                    src={uploadedImage.previewUrl}
                    alt="Preview"
                    className="w-16 h-16 object-cover rounded"
                  />
                  <button
                    onClick={() => setUploadedImage(null)}
                    className="p-1 text-red-600 hover:text-red-700"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={isLoading || !prompt.trim()}
            className="flex items-center justify-center gap-2 px-6 py-3 text-base font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <RefreshIcon className="animate-spin w-5 h-5" />
                Generating...
              </>
            ) : (
              <>
                <SparklesIcon className="w-5 h-5" /> Generate Video
              </>
            )}
          </button>

          {/* Loading Status */}
          {isLoading && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200 font-medium">
                {loadingMessage}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">
                Status: {videoStatus === 'starting' ? 'Starting generation...' : videoStatus === 'processing' ? 'Processing video...' : videoStatus}
              </p>
            </div>
          )}

          {/* Generated Video */}
          {generatedVideoUrl && (
            <div className="space-y-4">
              <div className="relative bg-black rounded-lg overflow-hidden">
                <video
                  src={generatedVideoUrl}
                  controls
                  className="w-full h-auto"
                  style={{ maxHeight: '600px' }}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleDownloadVideo}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-700 dark:bg-gray-600 rounded-md hover:bg-gray-800 dark:hover:bg-gray-500"
                >
                  <DownloadIcon className="w-4 h-4" /> Download
                </button>
                <button
                  onClick={handleSaveVideo}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
                >
                  <CheckCircleIcon className="w-4 h-4" /> Save to Profile
                </button>
                <button
                  onClick={() => {
                    setGeneratedVideoUrl(null);
                    setPrompt('');
                    setCaption('');
                    setUploadedImage(null);
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  <RedoIcon className="w-4 h-4" /> Generate Another
                </button>
              </div>
            </div>
          )}

          {/* Caption */}
          <div className="pt-2 border-t">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium">Caption</label>
              <button
                onClick={handleGenerateCaption}
                disabled={isCaptionLoading}
                className="flex items-center px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-100 rounded-md"
              >
                <SparklesIcon />
                {isCaptionLoading ? 'Generating...' : 'Generate with AI'}
              </button>
            </div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={5}
              className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700"
              placeholder="Caption..."
            />
          </div>
        </div>
      )}
    </div>
  );
};
