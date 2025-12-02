import React, { useState, useEffect, useRef, useMemo } from 'react';

import {
  generateSpeech,
  generateStoryboard,
  generateCaptions,
  generateVideo,
  getVideoStatus,
  saveGeneratedContent,
  generateSpeechWithVoice,
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
  const [selectedVoice, setSelectedVoice] = useState<string>('default');
  const [selectedClonedVoiceId, setSelectedClonedVoiceId] = useState<string | null>(null);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(
    null
  );
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);

  // Get cloned voices (voices with elevenLabsVoiceId)
  const clonedVoices = useMemo(() => {
    return userCustomVoices.filter(voice => voice.elevenLabsVoiceId && voice.isCloned);
  }, [userCustomVoices]);

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
    if (!storyboardConcept.trim()) {
      showToast('Please enter a video concept', 'error');
      return;
    }
    setIsStoryboarding(true);
    try {
      const storyboard = await generateStoryboard(storyboardConcept, 'TikTok/Reels/Shorts');
      if (storyboard.frames && storyboard.frames.length > 0) {
        setScenes(
          storyboard.frames.map((frame: any, i: number) => ({
            id: `scene-${Date.now()}-${i}`,
            prompt: frame.description || frame.prompt || '',
            status: 'pending' as const,
            duration: 4,
            order: frame.order || i + 1,
            onScreenText: frame.onScreenText,
            spokenLine: frame.spokenLine,
          }))
        );
        showToast(`Storyboard generated with ${storyboard.frames.length} scenes!`, 'success');
      } else {
        showToast('Failed to generate storyboard. Please try again.', 'error');
      }
    } catch (error: any) {
      console.error('Storyboard generation error:', error);
      showToast(error?.message || 'Failed to generate storyboard', 'error');
    } finally {
      setIsStoryboarding(false);
    }
  };

  const handleGenerateSceneVideo = async (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;

    // Update scene status
    setScenes(prev => prev.map(s => 
      s.id === sceneId ? { ...s, status: 'generating' } : s
    ));

    try {
      const result = await generateVideo(scene.prompt, undefined, aspectRatio);
      
      if (result.operationId) {
        // Poll for this specific scene
        const pollScene = async () => {
          try {
            const status = await getVideoStatus(result.operationId!);
            if (status.status === 'succeeded' && status.videoUrl) {
              setScenes(prev => prev.map(s => 
                s.id === sceneId ? { ...s, status: 'completed', videoUrl: status.videoUrl } : s
              ));
              showToast(`Scene ${scene.order} generated!`, 'success');
            } else if (status.status === 'failed') {
              setScenes(prev => prev.map(s => 
                s.id === sceneId ? { ...s, status: 'failed' } : s
              ));
              showToast(`Scene ${scene.order} generation failed`, 'error');
            } else {
              // Continue polling
              setTimeout(pollScene, 3000);
            }
          } catch (error) {
            setScenes(prev => prev.map(s => 
              s.id === sceneId ? { ...s, status: 'failed' } : s
            ));
          }
        };
        pollScene();
      }
    } catch (error: any) {
      console.error('Scene generation error:', error);
      setScenes(prev => prev.map(s => 
        s.id === sceneId ? { ...s, status: 'failed' } : s
      ));
      showToast(`Failed to generate scene ${scene.order}`, 'error');
    }
  };

  const handleGenerateAllScenes = async () => {
    const pendingScenes = scenes.filter(s => s.status === 'pending');
    if (pendingScenes.length === 0) {
      showToast('No scenes to generate', 'info');
      return;
    }
    
    for (const scene of pendingScenes) {
      await handleGenerateSceneVideo(scene.id);
      // Small delay between scene generations
      await new Promise(resolve => setTimeout(resolve, 1000));
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

  const handleGenerateVoiceover = async () => {
    if (!voiceOverScript.trim()) {
      showToast('Please enter a script for the voiceover', 'error');
      return;
    }

    if (selectedVoice === 'cloned' && !selectedClonedVoiceId) {
      showToast('Please select a cloned voice', 'error');
      return;
    }

    setIsGeneratingAudio(true);
    try {
      let audioData: string;
      let audioMimeType: string = 'audio/mpeg';
      
      if (selectedVoice === 'cloned' && selectedClonedVoiceId) {
        // Use cloned voice - this will mimic YOUR voice speaking the text!
        const result = await generateSpeechWithVoice(
          voiceOverScript,
          selectedClonedVoiceId,
          0.5, // stability
          0.75 // similarity boost
        );
        
        if (result.success && result.audioData) {
          audioData = result.audioData;
          audioMimeType = result.mimeType || 'audio/mpeg';
          const audioBlob = new Blob([
            Uint8Array.from(atob(result.audioData), c => c.charCodeAt(0))
          ], { type: audioMimeType });
          const audioUrl = URL.createObjectURL(audioBlob);
          setGeneratedAudioUrl(audioUrl);
          showToast('Voiceover generated with your cloned voice!', 'success');
          
          // If video is already generated, automatically combine them
          if (generatedVideoUrl) {
            await handleCombineVideoAudio(generatedVideoUrl, audioData, audioMimeType);
          }
        } else {
          throw new Error(result.error || 'Failed to generate voiceover');
        }
      } else {
        // Use default voice (existing implementation)
        audioData = await generateSpeech(voiceOverScript, selectedVoice);
        const audioBlob = new Blob([
          Uint8Array.from(atob(audioData), c => c.charCodeAt(0))
        ], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setGeneratedAudioUrl(audioUrl);
        showToast('Voiceover generated!', 'success');
        
        // If video is already generated, automatically combine them
        if (generatedVideoUrl) {
          await handleCombineVideoAudio(generatedVideoUrl, audioData, audioMimeType);
        }
      }
    } catch (error: any) {
      console.error('Voiceover generation error:', error);
      showToast(error?.message || 'Failed to generate voiceover', 'error');
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const handleCombineVideoAudio = async (videoUrl: string, audioData: string, audioMimeType: string) => {
    try {
      showToast('Combining video with voiceover...', 'info');
      
      // Fetch video as blob
      const videoResponse = await fetch(videoUrl);
      const videoBlob = await videoResponse.blob();
      
      // Create audio blob
      const audioBlob = new Blob([
        Uint8Array.from(atob(audioData), c => c.charCodeAt(0))
      ], { type: audioMimeType });
      
      // Use Web APIs to combine video and audio client-side
      const video = document.createElement('video');
      video.src = URL.createObjectURL(videoBlob);
      video.muted = false;
      
      await new Promise((resolve) => {
        video.onloadedmetadata = () => {
          video.currentTime = 0;
          resolve(undefined);
        };
      });
      
      // Create audio element
      const audio = new Audio(URL.createObjectURL(audioBlob));
      
      await new Promise((resolve) => {
        audio.onloadedmetadata = () => {
          resolve(undefined);
        };
      });
      
      // Create canvas to combine video and audio
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d')!;
      
      // Use MediaRecorder to combine
      const stream = canvas.captureStream(30); // 30 fps
      const audioTrack = (audio as any).captureStream().getAudioTracks()[0];
      if (audioTrack) {
        stream.addTrack(audioTrack);
      }
      
      const recorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9,opus'
      });
      
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      
      recorder.onstop = () => {
        const combinedBlob = new Blob(chunks, { type: 'video/webm' });
        const combinedUrl = URL.createObjectURL(combinedBlob);
        setGeneratedVideoUrl(combinedUrl);
        showToast('Video and voiceover combined successfully!', 'success');
      };
      
      // Draw video frames and record
      recorder.start();
      video.play();
      audio.play();
      
      const drawFrame = () => {
        if (video.ended || video.paused) {
          recorder.stop();
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        requestAnimationFrame(drawFrame);
      };
      
      video.onplay = () => {
        drawFrame();
      };
      
      // Stop when audio ends
      audio.onended = () => {
        video.pause();
        recorder.stop();
      };
      
    } catch (error: any) {
      console.error('Video combination error:', error);
      showToast('Failed to combine video and audio automatically. You can download both files separately.', 'error');
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
          {/* Storyboard Generation */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
            <div className="flex items-center gap-2 mb-4">
              <FilmIcon className="w-5 h-5 text-primary-600" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                1. Generate Storyboard
              </h3>
            </div>
            <textarea
              value={storyboardConcept}
              onChange={(e) => setStoryboardConcept(e.target.value)}
              placeholder="Describe your video concept. For example: 'A 30-second product showcase starting with a close-up, then panning out to show the full product, ending with a call-to-action.'"
              className="w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
              rows={4}
            />
            <button
              onClick={handleGenerateStoryboard}
              disabled={isStoryboarding || !storyboardConcept.trim()}
              className="mt-3 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isStoryboarding ? (
                <>
                  <RefreshIcon className="animate-spin w-4 h-4" />
                  Generating Storyboard...
                </>
              ) : (
                <>
                  <SparklesIcon className="w-4 h-4" />
                  Generate Storyboard
                </>
              )}
            </button>
          </div>

          {/* Scenes List */}
          {scenes.length > 0 && (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  2. Scenes ({scenes.length})
                </h3>
                <button
                  onClick={handleGenerateAllScenes}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm font-medium"
                >
                  Generate All Scenes
                </button>
              </div>
              <div className="space-y-3">
                {scenes.map((scene) => (
                  <div
                    key={scene.id}
                    className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-semibold text-primary-600">
                            Scene {scene.order || scenes.indexOf(scene) + 1}
                          </span>
                          <span
                            className={`text-xs px-2 py-1 rounded ${
                              scene.status === 'completed'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                : scene.status === 'generating'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                                : scene.status === 'failed'
                                ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {scene.status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
                          {scene.prompt}
                        </p>
                        {scene.onScreenText && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            On-screen text: {scene.onScreenText}
                          </p>
                        )}
                        {scene.spokenLine && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Voiceover: {scene.spokenLine}
                          </p>
                        )}
                        {scene.videoUrl && (
                          <div className="mt-2">
                            <video
                              src={scene.videoUrl}
                              controls
                              className="w-full max-w-md rounded"
                              style={{ maxHeight: '200px' }}
                            />
                          </div>
                        )}
                      </div>
                      <div className="ml-4">
                        {scene.status === 'pending' && (
                          <button
                            onClick={() => handleGenerateSceneVideo(scene.id)}
                            className="px-3 py-1.5 bg-primary-600 text-white rounded text-sm hover:bg-primary-700"
                          >
                            Generate
                          </button>
                        )}
                        {scene.status === 'generating' && (
                          <div className="flex items-center gap-2 text-sm text-blue-600">
                            <RefreshIcon className="animate-spin w-4 h-4" />
                            Generating...
                          </div>
                        )}
                        {scene.status === 'completed' && (
                          <CheckCircleIcon className="w-5 h-5 text-green-600" />
                        )}
                        {scene.status === 'failed' && (
                          <button
                            onClick={() => handleGenerateSceneVideo(scene.id)}
                            className="px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
                {generatedAudioUrl && (
                  <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
                    ✓ With Voiceover
                  </div>
                )}
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

          {/* Voiceover Section */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Add Voiceover (Optional)
              </label>
              <button
                onClick={() => setGenerateVoiceOver(!generateVoiceOver)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  generateVoiceOver
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                {generateVoiceOver ? 'Enabled' : 'Enable'}
              </button>
            </div>

            {generateVoiceOver && (
              <div className="space-y-3 mt-3">
                {/* Voice Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Select Voice
                  </label>
                  <select
                    value={selectedVoice}
                    onChange={(e) => {
                      setSelectedVoice(e.target.value);
                      if (e.target.value !== 'cloned') {
                        setSelectedClonedVoiceId(null);
                      }
                    }}
                    className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                  >
                    <option value="default">Default Voice</option>
                    {clonedVoices.length > 0 && (
                      <option value="cloned">My Cloned Voice</option>
                    )}
                  </select>
                </div>

                {/* Cloned Voice Selection */}
                {selectedVoice === 'cloned' && clonedVoices.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Select Cloned Voice
                    </label>
                    <select
                      value={selectedClonedVoiceId || ''}
                      onChange={(e) => setSelectedClonedVoiceId(e.target.value || null)}
                      className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                    >
                      <option value="">Select a voice...</option>
                      {clonedVoices.map((voice) => (
                        <option key={voice.id} value={voice.elevenLabsVoiceId}>
                          {voice.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Script Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Voiceover Script
                  </label>
                  <textarea
                    value={voiceOverScript}
                    onChange={(e) => setVoiceOverScript(e.target.value)}
                    placeholder="Enter the text you want to be spoken in the video..."
                    className="w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
                    rows={3}
                  />
                </div>

                {/* Generate Voiceover Button */}
                <button
                  onClick={handleGenerateVoiceover}
                  disabled={isGeneratingAudio || !voiceOverScript.trim() || (selectedVoice === 'cloned' && !selectedClonedVoiceId)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGeneratingAudio ? (
                    <>
                      <RefreshIcon className="animate-spin w-4 h-4" />
                      Generating Voiceover...
                    </>
                  ) : (
                    <>
                      <VoiceIcon className="w-4 h-4" />
                      Generate Voiceover
                    </>
                  )}
                </button>

                {/* Generated Audio Preview */}
                {generatedAudioUrl && (
                  <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Generated Voiceover:
                    </p>
                    <audio src={generatedAudioUrl} controls className="w-full" />
                    {generatedVideoUrl ? (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                        ✓ Video and voiceover will be automatically combined when you download!
                      </p>
                    ) : (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        Generate a video first, then the voiceover will be automatically added to it.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Caption */}
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Caption</label>
              <button
                onClick={handleGenerateCaption}
                disabled={isCaptionLoading}
                className="flex items-center px-3 py-1.5 text-sm font-medium text-primary-700 dark:text-primary-300 bg-primary-100 dark:bg-primary-900/50 rounded-md hover:bg-primary-200 dark:hover:bg-primary-900 disabled:opacity-50"
              >
                <SparklesIcon className="w-4 h-4" />
                {isCaptionLoading ? 'Generating...' : 'Generate with AI'}
              </button>
            </div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={5}
              className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 dark:text-white"
              placeholder="Caption for your video..."
            />
          </div>
        </div>
      )}
    </div>
  );
};
