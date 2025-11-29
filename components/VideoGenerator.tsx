import React, { useState, useEffect, useRef, useMemo } from 'react';

import {
  generateSpeech,
  generateStoryboard,
  generateCaptions,
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

// --- Disable ALL video generation ---
const VIDEO_DISABLED = true; // UI stays, but actions show “coming soon!”

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
  const [isLoading] = useState(false);
  const [generatedVideoUrl] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState(loadingMessages[0]);

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
    showToast('Video generation coming soon!', 'error');

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
        <div className="space-y-6 opacity-50 pointer-events-none">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              1. Storyboard
            </h3>
            <textarea
              value={storyboardConcept}
              onChange={(e) => setStoryboardConcept(e.target.value)}
              placeholder="Enter video concept..."
              className="w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-700"
              rows={2}
            />
            <button
              onClick={showComingSoon}
              className="mt-3 px-4 py-2 bg-primary-600 text-white rounded-md"
            >
              Coming Soon
            </button>
          </div>
        </div>
      ) : (
        // Simple Mode
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md space-y-4">
          <div>
            <label className="block text-sm mb-1">Prompt</label>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-700"
              placeholder="Describe video..."
            />
          </div>

          <button
            onClick={showComingSoon}
            className="flex items-center justify-center px-6 py-3 text-base font-medium text-white bg-primary-600 rounded-md"
          >
            <SparklesIcon /> Generate (Coming Soon)
          </button>

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
