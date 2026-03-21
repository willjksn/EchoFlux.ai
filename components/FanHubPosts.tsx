import React, { useState, useRef, useCallback, useEffect } from "react";
import { useAppContext } from "./AppContext";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, limit, setDoc, doc } from "firebase/firestore";
import { db, storage, auth } from "../firebaseConfig";
import {
  AUDIO_RECORDER_TIMESLICE_MS,
  VIDEO_RECORDER_TIMESLICE_MS,
  createAudioMediaRecorder,
  createVideoMediaRecorder,
  effectiveBlobType,
  fileExtensionForAudioMime,
  fileExtensionForVideoMime,
  normalizeVoiceRecordingFileType,
  stopMediaRecorderSafe,
  waitUntilVideoTrackLive,
} from "../src/lib/browserMediaRecording";
import { AudioLevelMeter } from "./AudioLevelMeter";
import { FanHubFeed, type FeedPost } from "./FanHubFeed";
import { EmojiButton } from "./EmojiPicker";

type CaptionStyle = "static" | "scroll-up" | "scroll-across" | "dissolve";
type AiTone = "" | "flirty" | "casual" | "motivational" | "premium" | "playful" | "mysterious" | "confident" | "custom";

interface MediaItem {
  url: string;
  file?: File;
  type: "image" | "video" | "audio";
  alt?: string;
  fromVault?: boolean;
}

interface VaultItem {
  url: string;
  path: string;
  name: string;
  type: "image" | "video" | "audio";
}

const AI_TONES: { id: AiTone; label: string }[] = [
  { id: "", label: "Default" },
  { id: "flirty", label: "Flirty" },
  { id: "casual", label: "Casual" },
  { id: "motivational", label: "Motivational" },
  { id: "premium", label: "Premium" },
  { id: "playful", label: "Playful" },
  { id: "mysterious", label: "Mysterious" },
  { id: "confident", label: "Confident" },
  { id: "custom", label: "Custom..." },
];

// Icons
const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const UploadIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);

const FolderIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
);

const MicIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
  </svg>
);

const VideoCamIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const SparklesIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

const LockIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

const UnlockIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
  </svg>
);

const PollIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const TipIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const TextIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const CloseIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const ChevronLeftIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

const StopIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

const CalendarIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

export const FanHubPosts: React.FC = () => {
  const { user, showToast } = useAppContext();
  const [showComposer, setShowComposer] = useState(false);
  
  // Media state
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Voice recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingCountdown, setRecordingCountdown] = useState<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [voiceMeterStream, setVoiceMeterStream] = useState<MediaStream | null>(null);

  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [isSavingVideo, setIsSavingVideo] = useState(false);
  const [videoLiveStream, setVideoLiveStream] = useState<MediaStream | null>(null);
  const videoMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  
  // Vault
  const [showVault, setShowVault] = useState(false);
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [loadingVault, setLoadingVault] = useState(false);
  
  // Caption
  const [caption, setCaption] = useState("");
  const [aiTone, setAiTone] = useState<AiTone>("");
  const [customTone, setCustomTone] = useState("");
  const [usePersonality, setUsePersonality] = useState(true);
  const [generating, setGenerating] = useState(false);
  
  // Locked content
  const [lockEnabled, setLockEnabled] = useState(false);
  const [lockPrice, setLockPrice] = useState("");
  /** Which attached media index is the public teaser when post is locked (multi-media only). */
  const [lockPreviewMediaIndex, setLockPreviewMediaIndex] = useState(0);
  
  // Poll
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  
  // Tip Goal
  const [tipGoalEnabled, setTipGoalEnabled] = useState(false);
  const [tipGoalDescription, setTipGoalDescription] = useState("");
  const [tipGoalAmount, setTipGoalAmount] = useState("");
  
  // Text Overlay
  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [overlayText, setOverlayText] = useState("");
  const [overlayStyle, setOverlayStyle] = useState<CaptionStyle>("static");
  const [overlayColor, setOverlayColor] = useState("#ffffff");
  const [overlaySize, setOverlaySize] = useState(18);
  const [overlayHighlight, setOverlayHighlight] = useState(false);
  const [overlayItalic, setOverlayItalic] = useState(false);
  
  // Options (per-post visibility for fans)
  const [hideLikeCounts, setHideLikeCounts] = useState(false);
  const [hideComments, setHideComments] = useState(false);
  const [hideLikes, setHideLikes] = useState(false);
  const [showTipButton, setShowTipButton] = useState(true);
  
  // Content Spiciness (1-10) - loaded from user settings
  const [contentSpiciness, setContentSpiciness] = useState(5);
  
  // Publishing
  const [publishing, setPublishing] = useState(false);
  
  // Scheduling
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const creatorId = user?.uid || user?.id;
  
  // Get minimum date (today) for date picker
  const getMinDate = () => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  };
  
  // Get minimum time if date is today
  const getMinTime = () => {
    if (scheduleDate === getMinDate()) {
      const now = new Date();
      return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    }
    return "00:00";
  };

  // Load vault items from the user's media library (My Vault - sidebar "Vault")
  const loadVault = useCallback(async () => {
    if (!user?.id) return;
    setLoadingVault(true);
    try {
      // Load from user's media_library (the main Vault in sidebar)
      const vaultRef = collection(db, "users", user.id, "media_library");
      const q = query(vaultRef, orderBy("uploadedAt", "desc"), limit(100));
      const snapshot = await getDocs(q);
      const items: VaultItem[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        // Determine type from type field (stored as 'image' or 'video')
        let mediaType: "image" | "video" | "audio" = "image";
        if (data.type === "video") {
          mediaType = "video";
        } else if (data.type === "audio") {
          mediaType = "audio";
        }
        
        // Only add if we have a valid URL
        if (data.url) {
          items.push({
            url: data.url,
            path: data.storagePath || "",
            name: data.name || docSnap.id,
            type: mediaType,
          });
        }
      });
      setVaultItems(items);
    } catch (error) {
      console.error("Failed to load vault:", error);
    } finally {
      setLoadingVault(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (showVault) {
      loadVault();
    }
  }, [showVault, loadVault]);

  // Load spiciness level from user settings
  useEffect(() => {
    const loadSpiciness = async () => {
      if (!user?.id) return;
      try {
        const userDoc = await getDocs(query(collection(db, "users"), limit(1)));
        const { doc: docRef, getDoc } = await import('firebase/firestore');
        const userDocRef = docRef(db, 'users', user.id);
        const userSnapshot = await getDoc(userDocRef);
        if (userSnapshot.exists()) {
          const data = userSnapshot.data();
          if (data.explicitnessLevel !== undefined) {
            setContentSpiciness(data.explicitnessLevel);
          }
        }
      } catch (error) {
        // Use default if loading fails
      }
    };
    loadSpiciness();
  }, [user?.id]);

  // Check for pending caption from Premium Studio (New Ideas)
  useEffect(() => {
    const pendingCaption = localStorage.getItem('fanHubPendingCaption');
    if (pendingCaption) {
      setCaption(pendingCaption);
      setShowComposer(true);
      localStorage.removeItem('fanHubPendingCaption');
      showToast?.('Caption loaded from New Ideas!', 'success');
    }
  }, [showToast]);

  // File upload handler - uploads to vault immediately for persistence
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    if (!user?.id) {
      showToast?.("Please sign in to upload files", "error");
      return;
    }
    
    setUploading(true);
    setUploadProgress(0);
    
    const newMedia: MediaItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isVideo = file.type.startsWith("video/");
      const isAudio = file.type.startsWith("audio/");
      const type = isVideo ? "video" : isAudio ? "audio" : "image";
      
      try {
        // Upload to Firebase Storage (vault)
        const timestamp = Date.now();
        const fileName = `${timestamp}_${file.name}`;
        const storagePath = `users/${user.id}/media_library/${fileName}`;
        const storageRef = ref(storage, storagePath);
        
        await uploadBytes(storageRef, file, { contentType: file.type });
        const mediaUrl = await getDownloadURL(storageRef);
        
        // Save to vault (media_library collection)
        const mediaItem = {
          id: timestamp.toString(),
          userId: user.id,
          url: mediaUrl,
          name: file.name,
          type: type as "image" | "video" | "audio",
          mimeType: file.type,
          size: file.size,
          uploadedAt: new Date().toISOString(),
          usedInPosts: [],
          tags: ["fan-hub-upload"],
          folderId: "general",
          storagePath,
        };
        
        await setDoc(doc(db, "users", user.id, "media_library", mediaItem.id), mediaItem);
        
        newMedia.push({
          url: mediaUrl,
          type,
          fromVault: true, // Mark as from vault since it's now saved
        });
        
        setUploadProgress(Math.round(((i + 1) / files.length) * 100));
      } catch (error) {
        console.error("Failed to upload file:", error);
        showToast?.(`Failed to upload ${file.name}`, "error");
      }
    }
    
    if (newMedia.length > 0) {
      setMedia((prev) => [...prev, ...newMedia]);
      showToast?.(`${newMedia.length} file(s) uploaded to vault`, "success");
    }
    
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Add from vault
  const addFromVault = (item: VaultItem) => {
    setMedia((prev) => [
      ...prev,
      { url: item.url, type: item.type, fromVault: true },
    ]);
    setShowVault(false);
  };

  // Voice recording
  const [isSavingVoice, setIsSavingVoice] = useState(false);
  const [isRequestingMic, setIsRequestingMic] = useState(false);
  
  const startRecording = async () => {
    if (isRecordingVideo || isSavingVideo) return;
    try {
      // Check if microphone permission is already granted
      const permissionStatus = await navigator.permissions.query({ name: "microphone" as PermissionName });
      
      if (permissionStatus.state === "denied") {
        showToast?.("Microphone access was denied. Please enable it in your browser settings.", "error");
        return;
      }
      
      // Show requesting state if permission hasn't been granted yet
      if (permissionStatus.state === "prompt") {
        setIsRequestingMic(true);
        showToast?.("Please allow microphone access to record voice notes", "info");
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      setIsRequestingMic(false);
      
      // Countdown
      setRecordingCountdown(3);
      await new Promise((r) => setTimeout(r, 1000));
      setRecordingCountdown(2);
      await new Promise((r) => setTimeout(r, 1000));
      setRecordingCountdown(1);
      await new Promise((r) => setTimeout(r, 1000));
      setRecordingCountdown(null);
      
      setVoiceMeterStream(stream);
      const mediaRecorder = createAudioMediaRecorder(stream);
      const requestedMime = mediaRecorder.mimeType || undefined;
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        setVoiceMeterStream(null);
        stream.getTracks().forEach((t) => t.stop());
        const blobType = effectiveBlobType(mediaRecorder, requestedMime);
        const audioBlob = new Blob(audioChunksRef.current, { type: blobType });
        
        if (!user?.id) {
          showToast?.("Please sign in to save recordings", "error");
          setIsRecording(false);
          return;
        }
        
        if (audioBlob.size < 256) {
          showToast?.("Recording was too short or empty.", "error");
          setIsRecording(false);
          return;
        }
        
        setIsSavingVoice(true);
        
        try {
          const normType = normalizeVoiceRecordingFileType(blobType);
          const ext = fileExtensionForAudioMime(normType);
          const timestamp = Date.now();
          const fileName = `voice_${timestamp}.${ext}`;
          const storagePath = `users/${user.id}/media_library/${fileName}`;
          const storageRef = ref(storage, storagePath);
          
          await uploadBytes(storageRef, audioBlob, { contentType: normType });
          const mediaUrl = await getDownloadURL(storageRef);
          
          const mediaItem = {
            id: timestamp.toString(),
            userId: user.id,
            url: mediaUrl,
            name: fileName,
            type: "audio" as const,
            mimeType: normType,
            size: audioBlob.size,
            uploadedAt: new Date().toISOString(),
            usedInPosts: [],
            tags: ["voice-recording"],
            folderId: "general",
          };
          
          await setDoc(doc(db, "users", user.id, "media_library", mediaItem.id), mediaItem);
          
          setMedia((prev) => [
            ...prev,
            { url: mediaUrl, type: "audio", fromVault: true },
          ]);
          
          showToast?.("Voice saved to vault", "success");
        } catch (error) {
          console.error("Failed to save voice recording:", error);
          showToast?.("Failed to save voice recording", "error");
        } finally {
          setIsSavingVoice(false);
          setIsRecording(false);
        }
      };
      
      mediaRecorder.start(AUDIO_RECORDER_TIMESLICE_MS);
      setIsRecording(true);
    } catch (error: unknown) {
      console.error("Failed to start recording:", error);
      setIsRequestingMic(false);
      setRecordingCountdown(null);
      setVoiceMeterStream(null);
      
      // Provide specific error messages
      if (error instanceof Error) {
        if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
          showToast?.("Microphone access denied. Please allow microphone access in your browser settings.", "error");
        } else if (error.name === "NotFoundError") {
          showToast?.("No microphone found. Please connect a microphone and try again.", "error");
        } else {
          showToast?.("Could not access microphone. Please check your settings.", "error");
        }
      } else {
        showToast?.("Could not access microphone", "error");
      }
    }
  };

  const stopRecording = () => {
    stopMediaRecorderSafe(mediaRecorderRef.current);
  };

  const stopVideoRecording = () => {
    stopMediaRecorderSafe(videoMediaRecorderRef.current);
  };

  const startVideoRecording = async () => {
    if (!user?.id || isRecordingVideo || isRecording || isSavingVideo) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      setVideoLiveStream(stream);
      await waitUntilVideoTrackLive(stream);
      await new Promise((r) => setTimeout(r, 250));

      const rec = createVideoMediaRecorder(stream);
      const requestedMime = rec.mimeType || undefined;
      videoMediaRecorderRef.current = rec;
      videoChunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) videoChunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        setVideoLiveStream(null);
        stream.getTracks().forEach((t) => t.stop());
        setIsRecordingVideo(false);
        videoMediaRecorderRef.current = null;
        const chunks = videoChunksRef.current;
        videoChunksRef.current = [];
        if (!chunks.length || !user?.id) return;
        const blobType = effectiveBlobType(rec, requestedMime);
        const videoBlob = new Blob(chunks, { type: blobType });
        if (videoBlob.size < 512) {
          showToast?.("Video was too short or empty.", "error");
          return;
        }
        setIsSavingVideo(true);
        try {
          const ext = fileExtensionForVideoMime(blobType);
          const timestamp = Date.now();
          const fileName = `camera_${timestamp}.${ext}`;
          const storagePath = `users/${user.id}/media_library/${fileName}`;
          const storageRef = ref(storage, storagePath);
          await uploadBytes(storageRef, videoBlob, { contentType: blobType || `video/${ext}` });
          const mediaUrl = await getDownloadURL(storageRef);
          const mediaItem = {
            id: timestamp.toString(),
            userId: user.id,
            url: mediaUrl,
            name: fileName,
            type: "video" as const,
            mimeType: blobType || `video/${ext}`,
            size: videoBlob.size,
            uploadedAt: new Date().toISOString(),
            usedInPosts: [],
            tags: ["camera-recording"],
            folderId: "general",
          };
          await setDoc(doc(db, "users", user.id, "media_library", mediaItem.id), mediaItem);
          setMedia((prev) => [...prev, { url: mediaUrl, type: "video", fromVault: true }]);
          showToast?.("Video saved to vault", "success");
        } catch (err) {
          console.error(err);
          showToast?.("Failed to save video recording", "error");
        } finally {
          setIsSavingVideo(false);
        }
      };
      rec.start(VIDEO_RECORDER_TIMESLICE_MS);
      setIsRecordingVideo(true);
    } catch {
      setVideoLiveStream(null);
      showToast?.("Camera or microphone permission denied, or not available on this device.", "error");
    }
  };

  useEffect(() => {
    const el = videoPreviewRef.current;
    const s = videoLiveStream;
    if (el && s) {
      el.srcObject = s;
      el.muted = true;
      void el.play().catch(() => {});
    } else if (el) {
      el.srcObject = null;
    }
  }, [videoLiveStream]);

  // Remove media
  const removeMedia = (index: number) => {
    setMedia((prev) => {
      const item = prev[index];
      if (item.url.startsWith("blob:")) {
        URL.revokeObjectURL(item.url);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  // Reorder media
  const moveMedia = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= media.length) return;
    
    setMedia((prev) => {
      const arr = [...prev];
      [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
      return arr;
    });
  };

  // AI Caption generation
  const generateCaption = useCallback(async (mode: "generate" | "suggest") => {
    // For suggest mode, require existing caption text
    if (mode === "suggest" && !caption.trim()) {
      showToast?.("Add some text first to get AI suggestions", "error");
      return;
    }
    
    setGenerating(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      if (!token) throw new Error("Not authenticated");
      
      // Use custom tone text if "custom" is selected, otherwise use the preset
      const effectiveTone = aiTone === "custom" && customTone.trim() ? customTone.trim() : (aiTone || "flirty");
      
      // Build prompt based on mode and spiciness
      const spicyLevel = contentSpiciness;
      const spicyGuidance = spicyLevel <= 3 
        ? "Keep it clean and wholesome, appropriate for all audiences."
        : spicyLevel <= 6 
        ? "Be flirty and teasing, suggestive but tasteful."
        : spicyLevel <= 8 
        ? "Be bold and provocative, push boundaries with spicy content."
        : "Be very explicit and adult-oriented, no holding back.";
      
      // IMPORTANT: If there's any text in the caption box, use it as direction for the AI
      // Even in "generate" mode, the user's input should guide what gets generated
      const userInput = caption.trim();
      let promptText: string;
      
      if (mode === "suggest" && userInput) {
        // AI Suggest mode - user typed keywords/topic, generate a caption ABOUT that topic
        promptText = `The creator typed: "${userInput}"

Write an engaging caption for their fan page post that is SPECIFICALLY ABOUT "${userInput}".

CRITICAL REQUIREMENTS:
- The caption MUST be about "${userInput}" - use this exact word/phrase in the caption
- If they typed a body part (like "boobs", "ass", etc.), the caption should reference that body part directly
- If they typed a theme (like "beach", "gym", etc.), the caption should be about that theme
- DO NOT ignore what they typed - it's the main subject of the post

${spicyGuidance}
DO NOT say "link in bio" - this is their own page.
DO NOT include hashtags.
Write 2-4 sentences that are engaging and on-topic.`;
      } else if (userInput) {
        // Generate mode WITH user input - same logic
        promptText = `The creator wants a caption about: "${userInput}"

Write an engaging caption for their fan page post that is SPECIFICALLY ABOUT "${userInput}".

CRITICAL REQUIREMENTS:
- The caption MUST be about "${userInput}" - use this exact word/phrase in the caption
- If they typed a body part, the caption should reference that body part directly
- If they typed a theme, the caption should be about that theme
- DO NOT ignore what they typed - it's the main subject of the post

${spicyGuidance}
DO NOT say "link in bio" - this is their own page.
DO NOT include hashtags.
Write 2-4 sentences that are engaging and on-topic.`;
      } else {
        // Generate mode without any input - generic caption
        promptText = `Write an engaging, unique caption for this fan page post. 
${spicyGuidance} 
Be creative and different each time.
DO NOT say "link in bio" - this is their own page.
DO NOT include hashtags.`;
      }
      
      const res = await fetch("/api/generateCaptions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          promptText,
          platforms: ["my page"],
          tone: effectiveTone,
          usePersonality,
          toneSettings: { 
            spiciness: spicyLevel * 10,
            // Add randomness seed to ensure unique results
            randomSeed: Date.now(),
          },
        }),
      });
      
      if (!res.ok) throw new Error("Failed to generate caption");
      
      const data = await res.json();
      // API returns array of captions
      const generatedCaption = Array.isArray(data) && data[0]?.caption ? data[0].caption : data.caption;
      if (generatedCaption) {
        // Always replace the caption, don't append
        setCaption(generatedCaption);
        showToast?.("Caption generated!", "success");
      }
    } catch (error) {
      console.error("Caption generation error:", error);
      showToast?.("Failed to generate caption", "error");
    } finally {
      setGenerating(false);
    }
  }, [caption, aiTone, customTone, usePersonality, contentSpiciness, showToast]);

  // Poll handlers
  const addPollOption = () => {
    if (pollOptions.length < 6) {
      setPollOptions([...pollOptions, ""]);
    }
  };

  const updatePollOption = (index: number, value: string) => {
    const updated = [...pollOptions];
    updated[index] = value;
    setPollOptions(updated);
  };

  const removePollOption = (index: number) => {
    if (pollOptions.length > 2) {
      setPollOptions(pollOptions.filter((_, i) => i !== index));
    }
  };

  // Publish
  const handlePublish = async (status: "published" | "draft" | "scheduled" = "published", scheduledDateTime?: Date) => {
    if (!creatorId) {
      showToast?.("Please sign in", "error");
      return;
    }
    
    if (!caption.trim() && media.length === 0) {
      showToast?.("Add a caption or media", "error");
      return;
    }
    
    if (status === "scheduled" && !scheduledDateTime) {
      showToast?.("Please select a date and time", "error");
      return;
    }
    
    setPublishing(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      if (!token) throw new Error("Not authenticated");
      
      // Upload media files
      const uploadedUrls: string[] = [];
      const mediaTypes: ("image" | "video")[] = [];
      const audioUrls: string[] = [];
      
      for (const item of media) {
        if (item.fromVault) {
          // Already uploaded, use URL directly
          if (item.type === "audio") {
            audioUrls.push(item.url);
          } else {
            uploadedUrls.push(item.url);
            mediaTypes.push(item.type as "image" | "video");
          }
        } else if (item.file) {
          // Upload new file
          const fileRef = ref(storage, `fan_posts/${creatorId}/${Date.now()}_${item.file.name}`);
          await uploadBytes(fileRef, item.file);
          const url = await getDownloadURL(fileRef);
          
          if (item.type === "audio") {
            audioUrls.push(url);
          } else {
            uploadedUrls.push(url);
            mediaTypes.push(item.type as "image" | "video");
          }
        }
      }
      
      // Get calendar date from scheduled time or now
      const postDate = scheduledDateTime || new Date();
      const calendarDate = postDate.toISOString().split("T")[0]; // YYYY-MM-DD
      const calendarTime = `${String(postDate.getHours()).padStart(2, "0")}:${String(postDate.getMinutes()).padStart(2, "0")}`; // HH:MM
      
      // Build post data
      const postData: Partial<FeedPost> & { creatorId: string; createdAt: ReturnType<typeof serverTimestamp> } = {
        creatorId,
        body: caption,
        mediaUrls: uploadedUrls,
        mediaTypes,
        audioUrls: audioUrls.length > 0 ? audioUrls : undefined,
        likeCount: 0,
        likedBy: [],
        comments: [],
        status,
        hideLikeCounts,
        hideComments,
        hideLikes,
        showTipButton,
        createdAt: serverTimestamp(),
      };
      
      // Add calendar fields for all posts (for calendar view)
      (postData as Record<string, unknown>).calendarDate = calendarDate;
      (postData as Record<string, unknown>).calendarTime = calendarTime;
      
      // Add scheduling fields
      if (status === "scheduled" && scheduledDateTime) {
        (postData as Record<string, unknown>).scheduledAt = scheduledDateTime;
      }
      
      if (status === "published") {
        (postData as Record<string, unknown>).publishedAt = new Date();
      }
      
      // Locked content
      if (lockEnabled && lockPrice) {
        const previewIdx =
          uploadedUrls.length > 1
            ? Math.max(0, Math.min(uploadedUrls.length - 1, lockPreviewMediaIndex))
            : 0;
        (postData as Record<string, unknown>).lockedContent = {
          enabled: true,
          priceCents: Math.round(parseFloat(lockPrice) * 100),
          ...(uploadedUrls.length > 1 ? { previewMediaIndex: previewIdx } : {}),
        };
      }
      
      // Poll
      if (pollEnabled && pollQuestion.trim() && pollOptions.filter((o) => o.trim()).length >= 2) {
        postData.poll = {
          question: pollQuestion,
          options: pollOptions.filter((o) => o.trim()),
          optionVotes: pollOptions.filter((o) => o.trim()).map(() => 0),
        };
      }
      
      // Tip Goal
      if (tipGoalEnabled && tipGoalDescription.trim() && tipGoalAmount) {
        postData.tipGoal = {
          description: tipGoalDescription,
          targetCents: Math.round(parseFloat(tipGoalAmount) * 100),
          raisedCents: 0,
        };
      }
      
      // Text Overlay
      if (overlayEnabled && overlayText.trim()) {
        postData.captionStyle = overlayStyle;
        (postData as Record<string, unknown>).overlayText = overlayText;
        (postData as Record<string, unknown>).overlayTextColor = overlayColor;
        (postData as Record<string, unknown>).overlayTextSize = overlaySize;
        (postData as Record<string, unknown>).overlayHighlight = overlayHighlight;
        (postData as Record<string, unknown>).overlayItalic = overlayItalic;
      }
      
      // Save to Firestore
      await addDoc(collection(db, "creators", creatorId, "fanPosts"), postData);
      
      const message = status === "draft" 
        ? "Draft saved" 
        : status === "scheduled" 
          ? `Scheduled for ${postDate.toLocaleDateString()} at ${calendarTime}`
          : "Post published!";
      showToast?.(message, "success");
      
      // Reset form
      resetForm();
      setShowComposer(false);
      setShowScheduleModal(false);
      
    } catch (error) {
      console.error("Publish error:", error);
      showToast?.("Failed to publish post", "error");
    } finally {
      setPublishing(false);
    }
  };
  
  // Handle schedule confirmation
  const handleScheduleConfirm = () => {
    if (!scheduleDate || !scheduleTime) {
      showToast?.("Please select both date and time", "error");
      return;
    }
    
    const scheduledDateTime = new Date(`${scheduleDate}T${scheduleTime}`);
    if (scheduledDateTime <= new Date()) {
      showToast?.("Scheduled time must be in the future", "error");
      return;
    }
    
    handlePublish("scheduled", scheduledDateTime);
  };

  const resetForm = () => {
    stopMediaRecorderSafe(mediaRecorderRef.current);
    stopMediaRecorderSafe(videoMediaRecorderRef.current);
    setVoiceMeterStream((prev) => {
      prev?.getTracks().forEach((t) => t.stop());
      return null;
    });
    setVideoLiveStream((prev) => {
      prev?.getTracks().forEach((t) => t.stop());
      return null;
    });
    setIsRecording(false);
    setIsRecordingVideo(false);
    setRecordingCountdown(null);
    media.forEach((item) => {
      if (item.url.startsWith("blob:")) URL.revokeObjectURL(item.url);
    });
    setMedia([]);
    setCaption("");
    setAiTone("");
    setCustomTone("");
    setLockEnabled(false);
    setLockPrice("");
    setLockPreviewMediaIndex(0);
    setPollEnabled(false);
    setPollQuestion("");
    setPollOptions(["", ""]);
    setTipGoalEnabled(false);
    setTipGoalDescription("");
    setTipGoalAmount("");
    setOverlayEnabled(false);
    setOverlayText("");
    setOverlayStyle("static");
    setOverlayColor("#ffffff");
    setOverlaySize(18);
    setOverlayHighlight(false);
    setOverlayItalic(false);
    setHideLikeCounts(false);
    setHideComments(false);
    setHideLikes(false);
    setShowTipButton(true);
    setScheduleDate("");
    setScheduleTime("");
  };

  if (!user) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        Please sign in to manage posts.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Fan Page Posts</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Create and manage posts for your fan page feed</p>
        </div>
        <button
          type="button"
          onClick={() => setShowComposer(true)}
          className="flex items-center gap-2 px-4 py-2 fh-btn transition font-medium"
        >
          <PlusIcon />
          New Post
        </button>
      </div>

      {/* Post Composer */}
      {showComposer && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
          <div 
            className="bg-gradient-to-b from-pink-50 to-white dark:from-gray-800 dark:to-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl my-8"
            style={{ boxShadow: "0 8px 40px rgba(212, 85, 139, 0.15)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-pink-100 dark:border-gray-700">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Create Post</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Share with your fans</p>
              </div>
              <button
                type="button"
                onClick={() => { setShowComposer(false); resetForm(); }}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <CloseIcon />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-5">
              
              {/* ===== MEDIA SECTION ===== */}
              <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Media</h4>
                
                {/* Media Thumbnails */}
                {media.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {media.map((item, index) => (
                      <div key={index} className="relative group">
                        <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600">
                          {item.type === "video" ? (
                            <video src={item.url} className="w-full h-full object-cover" />
                          ) : item.type === "audio" ? (
                            <div className="w-full h-full flex items-center justify-center bg-purple-100 dark:bg-purple-900/30">
                              <MicIcon />
                            </div>
                          ) : (
                            <img src={item.url} alt="" className="w-full h-full object-cover" />
                          )}
                          {item.fromVault && (
                            <div className="absolute top-1 left-1 bg-blue-500 text-white text-[9px] px-1 rounded">VAULT</div>
                          )}
                        </div>
                        {/* Controls */}
                        <div className="absolute -top-2 -right-2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition">
                          <button
                            type="button"
                            onClick={() => removeMedia(index)}
                            className="p-1 bg-red-500 text-white rounded-full shadow hover:bg-red-600"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                        <div className="absolute bottom-1 left-1 right-1 flex justify-between opacity-0 group-hover:opacity-100 transition">
                          {index > 0 && (
                            <button
                              type="button"
                              onClick={() => moveMedia(index, -1)}
                              className="p-0.5 bg-black/50 text-white rounded"
                            >
                              <ChevronLeftIcon />
                            </button>
                          )}
                          {index < media.length - 1 && (
                            <button
                              type="button"
                              onClick={() => moveMedia(index, 1)}
                              className="p-0.5 bg-black/50 text-white rounded ml-auto"
                            >
                              <ChevronRightIcon />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {isRecording && voiceMeterStream ? (
                  <div className="mb-3 max-w-md">
                    <AudioLevelMeter stream={voiceMeterStream} />
                  </div>
                ) : null}
                {isRecordingVideo && videoLiveStream ? (
                  <div className="mb-3 rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden bg-black">
                    <video
                      ref={videoPreviewRef}
                      className="w-full max-h-60 object-cover"
                      playsInline
                      muted
                      aria-label="Camera preview while recording"
                    />
                    <div className="p-2 bg-gray-900/95 border-t border-gray-700">
                      <AudioLevelMeter stream={videoLiveStream} barColor="#f472b6" />
                    </div>
                  </div>
                ) : null}

                {/* Media Buttons */}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-medium transition"
                  >
                    <UploadIcon />
                    {uploading ? `Uploading ${uploadProgress}%` : "Upload"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowVault(true)}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-medium transition"
                  >
                    <FolderIcon />
                    From Vault
                  </button>
                  {isSavingVoice ? (
                    <div className="flex items-center gap-2 px-3 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg text-sm font-medium">
                      <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                      Saving to vault...
                    </div>
                  ) : isRequestingMic ? (
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg text-sm font-medium">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                      Allow microphone...
                    </div>
                  ) : !isRecording && recordingCountdown === null ? (
                    <button
                      type="button"
                      onClick={startRecording}
                      disabled={isRecordingVideo || isSavingVideo}
                      className="flex items-center gap-2 px-3 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-900/50 text-sm font-medium transition disabled:opacity-45 disabled:pointer-events-none"
                    >
                      <MicIcon />
                      Record Voice
                    </button>
                  ) : recordingCountdown !== null ? (
                    <div className="flex items-center gap-2 px-3 py-2 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-lg text-sm font-medium">
                      Starting in {recordingCountdown}...
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="flex items-center gap-2 px-3 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 text-sm font-medium transition animate-pulse"
                    >
                      <StopIcon />
                      Stop Recording
                    </button>
                  )}
                  {isSavingVideo ? (
                    <div className="flex items-center gap-2 px-3 py-2 bg-rose-100 dark:bg-rose-900/30 text-rose-800 dark:text-rose-200 rounded-lg text-sm font-medium">
                      <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                      Saving video to vault…
                    </div>
                  ) : isRecordingVideo ? (
                    <button
                      type="button"
                      onClick={stopVideoRecording}
                      className="flex items-center gap-2 px-3 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 text-sm font-medium transition animate-pulse"
                    >
                      <StopIcon />
                      Stop & save video
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void startVideoRecording()}
                      disabled={
                        uploading ||
                        isRecording ||
                        recordingCountdown !== null ||
                        isSavingVoice ||
                        isRequestingMic
                      }
                      className="flex items-center gap-2 px-3 py-2 bg-rose-100 dark:bg-rose-900/30 text-rose-800 dark:text-rose-200 rounded-lg hover:bg-rose-200 dark:hover:bg-rose-900/50 text-sm font-medium transition disabled:opacity-45 disabled:pointer-events-none"
                    >
                      <VideoCamIcon />
                      Record video (camera)
                    </button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,audio/*"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              {/* ===== CAPTION SECTION ===== */}
              <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Caption</h4>
                
                <div className="relative mb-3">
                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Write your caption..."
                    rows={4}
                    maxLength={2200}
                    className="w-full px-3 py-2 pr-12 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  />
                  <div className="absolute right-2 top-2">
                    <EmojiButton onSelect={(emoji) => setCaption((prev) => prev + emoji)} />
                  </div>
                  <div className="absolute right-2 bottom-2 text-xs text-gray-400">
                    {caption.length}/2200
                  </div>
                </div>
                
                {/* AI Tools */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => generateCaption("generate")}
                    disabled={generating || media.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:from-purple-600 hover:to-pink-600 transition"
                  >
                    <SparklesIcon />
                    {generating ? "Generating..." : "Generate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => generateCaption("suggest")}
                    disabled={generating || !caption.trim()}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      caption.trim() 
                        ? "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600" 
                        : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-50"
                    }`}
                    title={!caption.trim() ? "Add some text first to get AI suggestions" : "Improve your caption with AI"}
                  >
                    <SparklesIcon />
                    {generating ? "..." : "AI Suggest"}
                  </button>
                  <select
                    value={aiTone}
                    onChange={(e) => setAiTone(e.target.value as AiTone)}
                    className="px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                  >
                    {AI_TONES.map((tone) => (
                      <option key={tone.id} value={tone.id}>{tone.label}</option>
                    ))}
                  </select>
                  {aiTone === "custom" && (
                    <input
                      type="text"
                      value={customTone}
                      onChange={(e) => setCustomTone(e.target.value)}
                      placeholder="e.g., sassy, dreamy..."
                      className="px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 w-32"
                    />
                  )}
                  <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={usePersonality}
                      onChange={(e) => setUsePersonality(e.target.checked)}
                      className="rounded border-gray-300 text-pink-500 focus:ring-pink-500"
                    />
                    Use Personality
                  </label>
                </div>
                
              </div>

              {/* ===== LOCK / PAID CONTENT ===== */}
              <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setLockEnabled(!lockEnabled)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border-2 border-dashed transition ${
                    lockEnabled
                      ? "border-pink-400 bg-pink-50 dark:bg-pink-900/20"
                      : "border-gray-300 dark:border-gray-600 hover:border-pink-400"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {lockEnabled ? <LockIcon /> : <UnlockIcon />}
                    <div className="text-left">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {lockEnabled ? "Locked Content" : "Lock this post"}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Fans pay to unlock media
                      </p>
                    </div>
                  </div>
                  <div className={`w-10 h-6 rounded-full transition ${lockEnabled ? "bg-pink-500" : "bg-gray-300 dark:bg-gray-600"}`}>
                    <div className={`w-5 h-5 bg-white rounded-full shadow transform transition ${lockEnabled ? "translate-x-4" : "translate-x-0.5"} mt-0.5`} />
                  </div>
                </button>
                
                {lockEnabled && (
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Price:</span>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                        <input
                          type="number"
                          min={1}
                          max={1000}
                          step={0.01}
                          value={lockPrice}
                          onChange={(e) => setLockPrice(e.target.value)}
                          placeholder="0.00"
                          className="w-28 pl-7 pr-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                      <span className="text-xs text-gray-400">($1 - $1000)</span>
                    </div>
                    {media.length > 1 && (
                      <div>
                        <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1">
                          Public preview — which media stays visible (others show locked until purchase)
                        </label>
                        <select
                          value={Math.min(lockPreviewMediaIndex, Math.max(0, media.length - 1))}
                          onChange={(e) => setLockPreviewMediaIndex(Number(e.target.value))}
                          className="w-full max-w-xs px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        >
                          {media.map((_, i) => (
                            <option key={i} value={i}>
                              Media #{i + 1}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ===== OPTIONAL FEATURES ===== */}
              <div className="grid grid-cols-3 gap-2">
                {/* Poll Button */}
                <button
                  type="button"
                  onClick={() => setPollEnabled(!pollEnabled)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 border-dashed transition ${
                    pollEnabled
                      ? "border-pink-400 bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400"
                      : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-pink-400"
                  }`}
                >
                  <PollIcon />
                  <span className="text-xs font-medium">Poll</span>
                </button>
                
                {/* Tip Goal Button */}
                <button
                  type="button"
                  onClick={() => setTipGoalEnabled(!tipGoalEnabled)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 border-dashed transition ${
                    tipGoalEnabled
                      ? "border-pink-400 bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400"
                      : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-pink-400"
                  }`}
                >
                  <TipIcon />
                  <span className="text-xs font-medium">Tip Goal</span>
                </button>
                
                {/* Text Overlay Button */}
                <button
                  type="button"
                  onClick={() => setOverlayEnabled(!overlayEnabled)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 border-dashed transition ${
                    overlayEnabled
                      ? "border-pink-400 bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400"
                      : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-pink-400"
                  }`}
                >
                  <TextIcon />
                  <span className="text-xs font-medium">Overlay</span>
                </button>
              </div>

              {/* Poll Editor */}
              {pollEnabled && (
                <div className="bg-pink-50 dark:bg-pink-900/20 rounded-xl p-4 border border-pink-200 dark:border-pink-800">
                  <h4 className="text-sm font-semibold text-pink-700 dark:text-pink-300 mb-3 flex items-center gap-2">
                    <PollIcon /> Poll
                  </h4>
                  <input
                    type="text"
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    placeholder="Ask a question..."
                    className="w-full px-3 py-2 mb-3 border border-pink-200 dark:border-pink-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                  <div className="space-y-2">
                    {pollOptions.map((option, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={option}
                          onChange={(e) => updatePollOption(index, e.target.value)}
                          placeholder={`Option ${index + 1}`}
                          className="flex-1 px-3 py-2 border border-pink-200 dark:border-pink-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        />
                        {pollOptions.length > 2 && (
                          <button type="button" onClick={() => removePollOption(index)} className="p-2 text-red-500 hover:text-red-600">
                            <TrashIcon />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {pollOptions.length < 6 && (
                    <button type="button" onClick={addPollOption} className="mt-2 text-sm text-pink-600 dark:text-pink-400 hover:text-pink-700 font-medium">
                      + Add Option
                    </button>
                  )}
                </div>
              )}

              {/* Tip Goal Editor */}
              {tipGoalEnabled && (
                <div className="bg-pink-50 dark:bg-pink-900/20 rounded-xl p-4 border border-pink-200 dark:border-pink-800">
                  <h4 className="text-sm font-semibold text-pink-700 dark:text-pink-300 mb-3 flex items-center gap-2">
                    <TipIcon /> Tip Goal
                  </h4>
                  <input
                    type="text"
                    value={tipGoalDescription}
                    onChange={(e) => setTipGoalDescription(e.target.value)}
                    placeholder="What's the goal? (e.g., Help me reach my goal!)"
                    className="w-full px-3 py-2 mb-3 border border-pink-200 dark:border-pink-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-pink-700 dark:text-pink-300">Target:</span>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                      <input
                        type="number"
                        min={1}
                        value={tipGoalAmount}
                        onChange={(e) => setTipGoalAmount(e.target.value)}
                        placeholder="0"
                        className="w-28 pl-7 pr-3 py-2 border border-pink-200 dark:border-pink-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Text Overlay Editor */}
              {overlayEnabled && (
                <div className="bg-pink-50 dark:bg-pink-900/20 rounded-xl p-4 border border-pink-200 dark:border-pink-800">
                  <h4 className="text-sm font-semibold text-pink-700 dark:text-pink-300 mb-3 flex items-center gap-2">
                    <TextIcon /> Text Overlay
                  </h4>
                  <textarea
                    value={overlayText}
                    onChange={(e) => setOverlayText(e.target.value)}
                    placeholder="Text to show on image..."
                    rows={2}
                    className="w-full px-3 py-2 mb-3 border border-pink-200 dark:border-pink-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                  />
                  <div className="flex flex-wrap gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-pink-700 dark:text-pink-300">Animation:</span>
                      <select
                        value={overlayStyle}
                        onChange={(e) => setOverlayStyle(e.target.value as CaptionStyle)}
                        className="px-2 py-1 text-sm border border-pink-200 dark:border-pink-700 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                      >
                        <option value="static">Static</option>
                        <option value="scroll-up">Scroll Up</option>
                        <option value="scroll-across">Scroll Across</option>
                        <option value="dissolve">Dissolve</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-pink-700 dark:text-pink-300">Color:</span>
                      <input
                        type="color"
                        value={overlayColor}
                        onChange={(e) => setOverlayColor(e.target.value)}
                        className="w-8 h-8 rounded border border-pink-200 dark:border-pink-700 cursor-pointer"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-pink-700 dark:text-pink-300">Size:</span>
                      <input
                        type="range"
                        min={10}
                        max={72}
                        value={overlaySize}
                        onChange={(e) => setOverlaySize(Number(e.target.value))}
                        className="w-20"
                      />
                      <span className="text-xs text-pink-600">{overlaySize}px</span>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-1.5 text-sm text-pink-700 dark:text-pink-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={overlayHighlight}
                        onChange={(e) => setOverlayHighlight(e.target.checked)}
                        className="rounded border-pink-300 text-pink-500"
                      />
                      Highlight
                    </label>
                    <label className="flex items-center gap-1.5 text-sm text-pink-700 dark:text-pink-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={overlayItalic}
                        onChange={(e) => setOverlayItalic(e.target.checked)}
                        className="rounded border-pink-300 text-pink-500"
                      />
                      Italic
                    </label>
                  </div>
                </div>
              )}

              {/* ===== DISPLAY OPTIONS (per-post; fans see heart but not count when "Hide like counts" is on) ===== */}
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showTipButton}
                    onChange={(e) => setShowTipButton(e.target.checked)}
                    className="rounded border-gray-300 text-pink-500 focus:ring-pink-500"
                  />
                  Show Tip Button
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hideLikeCounts}
                    onChange={(e) => setHideLikeCounts(e.target.checked)}
                    className="rounded border-gray-300 text-pink-500 focus:ring-pink-500"
                  />
                  Hide like counts
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hideComments}
                    onChange={(e) => setHideComments(e.target.checked)}
                    className="rounded border-gray-300 text-pink-500 focus:ring-pink-500"
                  />
                  Hide Comments
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hideLikes}
                    onChange={(e) => setHideLikes(e.target.checked)}
                    className="rounded border-gray-300 text-pink-500 focus:ring-pink-500"
                  />
                  Hide Likes
                </label>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-5 border-t border-pink-100 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50">
              <button
                type="button"
                onClick={() => handlePublish("draft")}
                disabled={publishing}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium transition"
              >
                Save as Draft
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(true)}
                  disabled={publishing || (!caption.trim() && media.length === 0)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-600 transition"
                >
                  <CalendarIcon />
                  Schedule
                </button>
                <button
                  type="button"
                  onClick={() => handlePublish("published")}
                  disabled={publishing || (!caption.trim() && media.length === 0)}
                  className="px-6 py-2.5 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-lg font-semibold disabled:opacity-50 hover:from-pink-600 hover:to-rose-600 transition shadow-lg shadow-pink-500/25"
                >
                  {publishing ? "Publishing..." : "Publish Now"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <CalendarIcon />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Schedule Post</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Date
                </label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  min={getMinDate()}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Time
                </label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  min={getMinTime()}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              
              {scheduleDate && scheduleTime && (
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
                  <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
                    <ClockIcon />
                    <span className="text-sm font-medium">
                      Scheduled for {new Date(`${scheduleDate}T${scheduleTime}`).toLocaleString(undefined, {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl">
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleScheduleConfirm}
                disabled={publishing || !scheduleDate || !scheduleTime}
                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-semibold disabled:opacity-50 hover:from-purple-600 hover:to-pink-600 transition"
              >
                {publishing ? "Scheduling..." : "Schedule Post"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vault Modal */}
      {showVault && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <FolderIcon />
                  My Vault
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {vaultItems.length} items • Select media for your post
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowVault(false)}
                className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingVault ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500 mb-3"></div>
                  <p className="text-gray-500 dark:text-gray-400">Loading your vault...</p>
                </div>
              ) : vaultItems.length === 0 ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                    <FolderIcon />
                  </div>
                  <p className="font-medium">Your vault is empty</p>
                  <p className="text-sm mt-1">Upload media to My Vault in the sidebar to get started</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {vaultItems.map((item, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => addFromVault(item)}
                      className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 hover:ring-2 hover:ring-pink-500 transition relative group"
                    >
                      {item.type === "video" ? (
                        <>
                          <video src={item.url} className="w-full h-full object-cover" />
                          <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                            </svg>
                          </div>
                        </>
                      ) : item.type === "audio" ? (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 p-2">
                          <MicIcon />
                          <audio
                            src={item.url}
                            controls
                            className="w-full mt-2"
                            style={{ height: '24px' }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      ) : (
                        <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
                        <span className="text-white opacity-0 group-hover:opacity-100 font-medium text-sm bg-pink-500 px-3 py-1 rounded-full shadow-lg">
                          Select
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-center text-sm text-gray-500 dark:text-gray-400">
              Tip: Upload more media from <span className="font-medium text-pink-500">My Vault</span> in the sidebar
            </div>
          </div>
        </div>
      )}

      {/* Feed Admin View */}
      <FanHubFeed isAdminMode />
    </div>
  );
};
