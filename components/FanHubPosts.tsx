import React, { useState, useRef, useCallback, useEffect } from "react";
import { useAppContext } from "./AppContext";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  orderBy,
  limit,
  setDoc,
  doc,
  getDoc,
  updateDoc,
  deleteField,
  type DocumentData,
} from "firebase/firestore";
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
  waitUntilAudioTrackLive,
} from "../src/lib/browserMediaRecording";
import { AudioLevelMeter } from "./AudioLevelMeter";
import { DmAudioPlayer } from "./DmAudioPlayer";
import { RecordingDurationLabel } from "./RecordingDurationLabel";
import { FanHubFeed, type FeedPost } from "./FanHubFeed";
import { EmojiButton } from "./EmojiPicker";
import { useCreatorHandle } from "../src/hooks/useCreatorHandle";
import { canUseSjHeartEmoji } from "../src/lib/customEmoji";
import { maybeTrimVideoForCaption } from "../src/lib/videoCaptionClip";
import { resolveApiUrl, DEV_API_404_USER_HINT } from "../src/lib/resolveApiUrl";
import type { LiveStreamEventStatus } from "../types";
import { LiveStreamWatchRoom } from "./LiveStreamWatchRoom";

const LIVE_STREAM_DOC_STATUSES: LiveStreamEventStatus[] = ["draft", "scheduled", "live", "ended", "cancelled"];

/** When /api/liveStreams returns 404 (route missing on proxy target), write the same shape as the API. */
async function createLiveStreamDocClient(
  creatorId: string,
  fields: {
    title: string;
    scheduledStart: string;
    ticketCents: number;
    freeForSubscribers: boolean;
    creatorTestOnly: boolean;
    description?: string;
  },
): Promise<string> {
  const t = Date.parse(fields.scheduledStart);
  if (!Number.isFinite(t)) throw new Error("scheduledStart must be a valid date");
  const title = fields.title.trim();
  if (!title) throw new Error("title is required");
  const colRef = collection(db, "creators", creatorId, "liveStreams");
  const payload: Record<string, unknown> = {
    creatorId,
    title,
    status: "scheduled",
    scheduledStart: new Date(t).toISOString(),
    ticketCents: Math.max(0, Math.floor(fields.ticketCents)),
    freeForSubscribers: fields.freeForSubscribers,
    creatorTestOnly: fields.creatorTestOnly,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (fields.description?.trim()) payload.description = fields.description.trim();
  const ref = await addDoc(colRef, payload);
  return ref.id;
}

async function updateLiveStreamDocClient(
  creatorId: string,
  streamId: string,
  patch: {
    title?: string;
    scheduledStart?: string;
    ticketCents?: number;
    freeForSubscribers?: boolean;
    creatorTestOnly?: boolean;
    description?: string | null;
    promoPostId?: string;
    status?: LiveStreamEventStatus;
  },
): Promise<void> {
  const ref = doc(db, "creators", creatorId, "liveStreams", streamId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Stream not found");
  const u: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.title != null && patch.title.trim()) u.title = patch.title.trim();
  if (patch.scheduledStart != null && patch.scheduledStart.trim()) {
    const t = Date.parse(patch.scheduledStart);
    if (Number.isFinite(t)) u.scheduledStart = new Date(t).toISOString();
  }
  if (patch.ticketCents != null && Number.isFinite(patch.ticketCents)) {
    u.ticketCents = Math.max(0, Math.floor(patch.ticketCents));
  }
  if (patch.freeForSubscribers != null) u.freeForSubscribers = patch.freeForSubscribers;
  if (patch.creatorTestOnly != null) u.creatorTestOnly = patch.creatorTestOnly;
  if (patch.description !== undefined) {
    u.description = patch.description?.trim() ? patch.description.trim() : deleteField();
  }
  if (patch.promoPostId != null && patch.promoPostId.trim()) u.promoPostId = patch.promoPostId.trim();
  if (patch.status != null && LIVE_STREAM_DOC_STATUSES.includes(patch.status)) u.status = patch.status;
  await updateDoc(ref, u as DocumentData);
}

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

/** Pill switch (same interaction model as What to Post → Personality first). */
const FanHubSwitch: React.FC<{
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}> = ({ checked, onCheckedChange, disabled, "aria-label": ariaLabel, "aria-labelledby": ariaLabelledBy }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    aria-labelledby={ariaLabelledBy}
    disabled={disabled}
    onClick={() => onCheckedChange(!checked)}
    className={`relative inline-block h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 ${
      checked ? "bg-pink-500" : "bg-gray-200 dark:bg-gray-600"
    } disabled:opacity-50 disabled:cursor-not-allowed`}
  >
    {/* Thumb: w-11 (44px) − border-2×2 (8px) = 40px track; 20px knob + 2px inset each side → translate 16px (x-4), not x-5 */}
    <span
      aria-hidden
      className={`pointer-events-none absolute left-0.5 top-0 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ease-in-out ${
        checked ? "translate-x-4" : "translate-x-0"
      }`}
    />
  </button>
);

const FanHubSwitchRow: React.FC<{
  label: string;
  labelId: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}> = ({ label, labelId, checked, onCheckedChange }) => (
  <div className="flex items-center justify-between gap-3 min-w-0">
    <span id={labelId} className="text-sm text-gray-600 dark:text-gray-400">
      {label}
    </span>
    <FanHubSwitch checked={checked} onCheckedChange={onCheckedChange} aria-labelledby={labelId} />
  </div>
);

function fanHubFileToBase64Data(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = reader.result as string;
      resolve(s.includes(",") ? s.split(",")[1]! : s);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function fanHubBlobUrlToBase64(blobUrl: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(blobUrl);
  const blob = await res.blob();
  const mimeType = blob.type || "application/octet-stream";
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return { data: btoa(binary), mimeType };
}

/**
 * First image/video for caption generation — same pattern as Compose (server fetches URL and attaches to Gemini).
 */
async function resolveFanHubCaptionMedia(
  items: MediaItem[]
): Promise<
  | { mediaUrl: string }
  | { mediaUrls: string[] }
  | { mediaData: { data: string; mimeType: string } }
  | null
> {
  const visual = items.filter((m) => m.type === "image" || m.type === "video");
  if (visual.length === 0) return null;

  const httpUrls = [
    ...new Set(
      visual
        .map((m) => (typeof m.url === "string" ? m.url.trim() : ""))
        .filter((u) => u.startsWith("https://") || u.startsWith("http://"))
    ),
  ];

  if (httpUrls.length > 1) {
    return { mediaUrls: httpUrls.slice(0, 6) };
  }
  if (httpUrls.length === 1) {
    return { mediaUrl: httpUrls[0]! };
  }

  const first = visual[0]!;
  if (first.file) {
    const mime =
      first.file.type || (first.type === "video" ? "video/mp4" : "image/jpeg");
    const data = await fanHubFileToBase64Data(first.file);
    return { mediaData: { data, mimeType: mime } };
  }
  if (typeof first.url === "string" && first.url.startsWith("blob:")) {
    const { data, mimeType: blobMime } = await fanHubBlobUrlToBase64(first.url);
    const mime =
      blobMime && blobMime !== "application/octet-stream"
        ? blobMime
        : first.type === "video"
          ? "video/mp4"
          : "image/jpeg";
    return { mediaData: { data, mimeType: mime } };
  }

  return null;
}

export const FanHubPosts: React.FC = () => {
  const { user, showToast } = useAppContext();
  const [showComposer, setShowComposer] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  
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
  /** Remount AudioLevelMeter so AudioContext works reliably in modal / Strict Mode */
  const [voiceMeterKey, setVoiceMeterKey] = useState(0);
  const [videoMeterKey, setVideoMeterKey] = useState(0);

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

  // Live stream promo (feed card + `creators/{id}/liveStreams/{streamId}`)
  const [liveStreamPromoEnabled, setLiveStreamPromoEnabled] = useState(false);
  const [liveStreamTitle, setLiveStreamTitle] = useState("");
  const [liveStreamStartLocal, setLiveStreamStartLocal] = useState("");
  const [liveStreamTicketUsd, setLiveStreamTicketUsd] = useState("");
  const [liveStreamFreeForSubs, setLiveStreamFreeForSubs] = useState(false);
  const [liveStreamEditStreamId, setLiveStreamEditStreamId] = useState<string | null>(null);
  const [liveStreamCreatorTestOnly, setLiveStreamCreatorTestOnly] = useState(false);
  const [liveStreamComposerStatus, setLiveStreamComposerStatus] = useState<LiveStreamEventStatus | null>(null);
  const [liveStreamBroadcast, setLiveStreamBroadcast] = useState<{ streamId: string } | null>(null);
  const [liveStreamDailyBusy, setLiveStreamDailyBusy] = useState<false | "goLive" | "endLive">(false);

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
  const creatorHandleFromDoc = useCreatorHandle(creatorId);
  const includeSjHeartEmoji = canUseSjHeartEmoji({
    creatorHandle: creatorHandleFromDoc,
    viewerIsAdmin: user?.role === "Admin",
  });
  
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

  function isoToDatetimeLocalValue(iso: string | undefined): string {
    if (!iso?.trim()) return "";
    const d = new Date(iso.trim());
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const runLiveStreamDaily = useCallback(
    async (action: "goLive" | "endLive", streamIdOverride?: string) => {
      const streamId = streamIdOverride ?? liveStreamEditStreamId;
      if (!streamId) return;
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        showToast?.("Sign in again to manage the broadcast.", "error");
        return;
      }
      setLiveStreamDailyBusy(action);
      try {
        const res = await fetch(resolveApiUrl("/api/liveStreamDaily"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ action, streamId }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error(`Live stream API not found (404). ${DEV_API_404_USER_HINT}`);
          }
          throw new Error(data.error || "Request failed");
        }
        if (action === "goLive") {
          setLiveStreamComposerStatus("live");
          setLiveStreamBroadcast({ streamId });
        }
        if (action === "endLive") {
          setLiveStreamComposerStatus("ended");
          setLiveStreamBroadcast(null);
        }
        showToast?.(
          action === "goLive"
            ? "Opening your broadcast — allow camera and mic when Daily asks."
            : "Stream ended.",
          "success",
        );
      } catch (e) {
        showToast?.(e instanceof Error ? e.message : "Broadcast request failed", "error");
      } finally {
        setLiveStreamDailyBusy(false);
      }
    },
    [liveStreamEditStreamId, showToast],
  );

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
    let stream: MediaStream | null = null;
    try {
      try {
        const permissionStatus = await navigator.permissions.query({ name: "microphone" as PermissionName });
        if (permissionStatus.state === "denied") {
          showToast?.("Microphone access was denied. Please enable it in your browser settings.", "error");
          return;
        }
        if (permissionStatus.state === "prompt") {
          setIsRequestingMic(true);
          showToast?.("Please allow microphone access to record voice notes", "info");
        }
      } catch {
        /* Safari / some browsers: permissions.query not supported — continue to getUserMedia */
      }

      // Same shape as Vault (proven working); open mic before countdown so the level meter + graph stay active
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getAudioTracks().forEach((t) => {
        t.enabled = true;
      });
      await waitUntilAudioTrackLive(stream);
      if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        setVoiceMeterStream(null);
        showToast?.("No microphone track available. Check browser permissions.", "error");
        return;
      }

      setIsRequestingMic(false);
      setVoiceMeterStream(stream);
      setVoiceMeterKey((k) => k + 1);

      // Countdown (mic already live — meter visible)
      setRecordingCountdown(3);
      await new Promise((r) => setTimeout(r, 1000));
      setRecordingCountdown(2);
      await new Promise((r) => setTimeout(r, 1000));
      setRecordingCountdown(1);
      await new Promise((r) => setTimeout(r, 1000));
      setRecordingCountdown(null);

      const wireVoiceRecorder = (rec: MediaRecorder) => {
        const requestedMime = rec.mimeType || undefined;
        mediaRecorderRef.current = rec;
        audioChunksRef.current = [];

        rec.ondataavailable = (e) => {
          if (e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        rec.onstop = async () => {
          setVoiceMeterStream(null);
          stream.getTracks().forEach((t) => t.stop());
          const blobType = effectiveBlobType(rec, requestedMime);
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
      };

      let primary: MediaRecorder;
      try {
        primary = createAudioMediaRecorder(stream);
      } catch {
        primary = new MediaRecorder(stream);
      }
      wireVoiceRecorder(primary);

      try {
        primary.start(AUDIO_RECORDER_TIMESLICE_MS);
      } catch (startErr) {
        console.warn("FanHubPosts: voice MediaRecorder.start failed, retrying default", startErr);
        const fallback = new MediaRecorder(stream);
        wireVoiceRecorder(fallback);
        try {
          fallback.start(AUDIO_RECORDER_TIMESLICE_MS);
        } catch (e2) {
          console.error("FanHubPosts: voice recorder failed", e2);
          stream.getTracks().forEach((t) => t.stop());
          setVoiceMeterStream(null);
          setIsRecording(false);
          showToast?.("Could not start voice recording. Try another browser or check mic settings.", "error");
          return;
        }
      }
      setIsRecording(true);
    } catch (error: unknown) {
      console.error("Failed to start recording:", error);
      stream?.getTracks().forEach((t) => t.stop());
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
      try {
        const camPerm = await navigator.permissions.query({ name: "camera" as PermissionName });
        if (camPerm.state === "denied") {
          showToast?.("Camera access was denied. Enable it in your browser settings.", "error");
          return;
        }
      } catch {
        /* query unsupported — continue */
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true,
      });
      stream.getVideoTracks().forEach((t) => {
        t.enabled = true;
      });
      stream.getAudioTracks().forEach((t) => {
        t.enabled = true;
      });
      setVideoLiveStream(stream);
      setVideoMeterKey((k) => k + 1);
      await waitUntilVideoTrackLive(stream);
      await waitUntilAudioTrackLive(stream);
      await new Promise((r) => setTimeout(r, 200));

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
    } catch (err: unknown) {
      console.error("startVideoRecording:", err);
      setVideoLiveStream(null);
      const e = err instanceof Error ? err : null;
      if (e?.name === "NotAllowedError" || e?.name === "PermissionDeniedError") {
        showToast?.("Camera/microphone permission denied. Allow access in your browser and try again.", "error");
      } else if (e?.name === "NotFoundError") {
        showToast?.("No camera found on this device.", "error");
      } else if (e?.name === "OverconstrainedError") {
        showToast?.("Camera settings not supported. Try another browser or device.", "error");
      } else {
        showToast?.("Could not start camera recording. Check permissions and try again.", "error");
      }
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
    // Re-run when recording flips on: preview mounts only after `isRecordingVideo` while `videoLiveStream` is unchanged.
  }, [videoLiveStream, isRecordingVideo]);

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
      
      // Generate: never send the current caption box as promptText — that made the model "write about"
      // the previous AI line and feel like an extra sentence. Each Generate is a full fresh caption from
      // the attached media (+ server prompt / personality). Use "AI Suggest" to refine text in the box.
      // Suggest: the box text is explicit direction for the model.
      const userInput = caption.trim();
      let promptText: string | undefined;

      if (mode === "suggest") {
        promptText = `The creator typed: "${userInput}"

Write an engaging caption for their fan page post that is SPECIFICALLY ABOUT "${userInput}".

CRITICAL REQUIREMENTS:
- The caption MUST be about "${userInput}" - use this exact word/phrase in the caption
- If they typed a body part (like "boobs", "ass", etc.), the caption should reference that body part directly
- If they typed a theme (like "beach", "gym", etc.), the caption should be about that theme
- DO NOT ignore what they typed - it's the main subject of the post
- If image/video is attached, stay consistent with what's visible; use their text as the angle, not a generic filler caption.

${spicyGuidance}
DO NOT say "link in bio" - this is their own page.
DO NOT include hashtags.
Write 2-4 sentences that are engaging and on-topic.`;
      } else {
        promptText = undefined;
      }

      let mediaPayload = await resolveFanHubCaptionMedia(media);
      const regenerationNonce = Date.now();

      const visualForCaption = media.filter((m) => m.type === "image" || m.type === "video");
      const singleVideoOnly =
        visualForCaption.length === 1 && visualForCaption[0]!.type === "video";
      let videoDurationSec: number | undefined;
      if (singleVideoOnly) {
        const v = visualForCaption[0]!;
        let vidUrl: string | null = null;
        let revoke: string | null = null;
        try {
          if (typeof v.url === "string" && (v.url.startsWith("https://") || v.url.startsWith("http://"))) {
            vidUrl = v.url;
          } else if (typeof v.url === "string" && v.url.startsWith("blob:")) {
            vidUrl = v.url;
          } else if (v.file) {
            revoke = URL.createObjectURL(v.file);
            vidUrl = revoke;
          }
          if (vidUrl) {
            const trim = await maybeTrimVideoForCaption(vidUrl, true);
            if (!trim.ok) {
              showToast?.(trim.error, "error");
              return;
            }
            if ("mediaData" in trim && trim.mediaData) {
              mediaPayload = { mediaData: trim.mediaData };
            } else if ("mediaUrl" in trim && trim.mediaUrl) {
              mediaPayload = { mediaUrl: trim.mediaUrl };
            }
            if ("videoDurationSec" in trim && trim.videoDurationSec != null && trim.videoDurationSec > 0) {
              videoDurationSec = trim.videoDurationSec;
            }
          }
        } finally {
          if (revoke) URL.revokeObjectURL(revoke);
        }
      }

      const res = await fetch("/api/generateCaptions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...(mediaPayload ?? {}),
          ...(typeof videoDurationSec === "number" && videoDurationSec > 0 ? { videoDurationSec } : {}),
          ...(promptText != null ? { promptText } : {}),
          platforms: ["my page"],
          goal: "Community Engagement",
          tone: effectiveTone,
          usePersonality,
          useFavoriteHashtags: false,
          creatorPersonality: user?.settings?.creatorPersonality?.trim() || undefined,
          toneSettings: {
            spiciness: spicyLevel * 10,
            randomSeed: regenerationNonce,
          },
        }),
      });

      const rawBody = await res.text();
      let data: unknown;
      try {
        data = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        throw new Error("Caption service returned an invalid response. Try again.");
      }

      const apiErrorMessage = (obj: Record<string, unknown> | null): string | undefined => {
        if (!obj) return undefined;
        const note = obj.note;
        const message = obj.message;
        const error = obj.error;
        if (typeof note === "string" && note.trim()) return note.trim();
        if (typeof message === "string" && message.trim()) return message.trim();
        if (typeof error === "string" && error.trim()) return error.trim();
        return undefined;
      };

      if (!res.ok) {
        if (res.status === 413) {
          const note =
            apiErrorMessage(data && typeof data === "object" ? (data as Record<string, unknown>) : null) ||
            "Media is too large to analyze in one request. Try a shorter video or use a smaller file.";
          throw new Error(note);
        }
        if (res.status === 401) {
          throw new Error("Please sign in again.");
        }
        if (res.status === 429) {
          throw new Error("Too many caption requests. Wait a minute and try again.");
        }
        const fromBody = apiErrorMessage(data && typeof data === "object" ? (data as Record<string, unknown>) : null);
        throw new Error(fromBody || `Caption request failed (${res.status}).`);
      }

      // generateCaptions uses withErrorHandling: errors may be HTTP 200 + { success: false, note }
      if (data && typeof data === "object" && data !== null && (data as { success?: boolean }).success === false) {
        const msg =
          apiErrorMessage(data as Record<string, unknown>) || "Caption generation failed. Please try again.";
        throw new Error(msg);
      }
      const pickPlainCaption = (payload: unknown): string | undefined => {
        if (payload == null) return undefined;
        if (typeof payload === "string") {
          const t = payload.trim();
          if (t.startsWith("[") && t.includes('"caption"')) {
            try {
              const arr = JSON.parse(t) as unknown;
              return pickPlainCaption(arr);
            } catch {
              return payload;
            }
          }
          return payload;
        }
        if (Array.isArray(payload) && payload[0] && typeof payload[0] === "object" && payload[0] !== null) {
          const c = (payload[0] as { caption?: unknown }).caption;
          if (typeof c === "string") return c;
        }
        if (typeof payload === "object" && payload !== null && "captions" in payload) {
          const inner = (payload as { captions?: unknown }).captions;
          return pickPlainCaption(inner);
        }
        if (typeof payload === "object" && payload !== null && "caption" in payload) {
          const c = (payload as { caption?: unknown }).caption;
          if (typeof c === "string") return c;
        }
        return undefined;
      };
      const generatedCaption = pickPlainCaption(data);
      if (generatedCaption) {
        // Always replace the caption, don't append
        setCaption(generatedCaption);
        showToast?.("Caption generated!", "success");
      } else {
        throw new Error(
          "No caption was returned. If this keeps happening, check that AI keys are configured on the server.",
        );
      }
    } catch (error) {
      console.error("Caption generation error:", error);
      const msg = error instanceof Error ? error.message : "Failed to generate caption";
      showToast?.(msg, "error");
    } finally {
      setGenerating(false);
    }
  }, [caption, aiTone, customTone, usePersonality, contentSpiciness, showToast, user?.settings?.creatorPersonality, media]);

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

    if (liveStreamPromoEnabled && status !== "published") {
      showToast?.(
        "Live stream promos publish to the feed now. Use “When you go live” for the broadcast time.",
        "error",
      );
      return;
    }

    if (liveStreamPromoEnabled) {
      if (!liveStreamTitle.trim()) {
        showToast?.("Add a stream title", "error");
        return;
      }
      if (!liveStreamStartLocal.trim()) {
        showToast?.("Choose when you go live", "error");
        return;
      }
      if (!Number.isFinite(Date.parse(liveStreamStartLocal))) {
        showToast?.("Invalid go-live time", "error");
        return;
      }
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
      /** Firestore rules use JWT uid for `creators/{uid}/liveStreams` client fallback. */
      const ownerUid = auth.currentUser!.uid;
      if (ownerUid !== creatorId) {
        showToast?.("Session mismatch — sign out and back in, then try again.", "error");
        setPublishing(false);
        return;
      }

      // Upload media files
      const uploadedUrls: string[] = [];
      const mediaTypes: ("image" | "video")[] = [];
      const audioUrls: string[] = [];
      
      for (const item of media) {
        if (item.fromVault) {
          // Already uploaded, use URL directly
          const vaultUrl = typeof item.url === "string" ? item.url.trim() : "";
          if (!vaultUrl) continue;
          if (item.type === "audio") {
            audioUrls.push(vaultUrl);
          } else {
            uploadedUrls.push(vaultUrl);
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

      let streamIdForPost: string | undefined;
      let streamPromoScheduledIso: string | undefined;
      let streamPromoTicketCents = 0;

      if (liveStreamPromoEnabled) {
        streamPromoScheduledIso = new Date(liveStreamStartLocal).toISOString();
        const ticketRaw = liveStreamTicketUsd.trim();
        streamPromoTicketCents = 0;
        if (ticketRaw) {
          const n = parseFloat(ticketRaw);
          if (!Number.isFinite(n) || n < 0) {
            showToast?.("Ticket price must be zero or more", "error");
            setPublishing(false);
            return;
          }
          streamPromoTicketCents = Math.round(n * 100);
        }

        try {
          if (liveStreamEditStreamId) {
            streamIdForPost = liveStreamEditStreamId;
            const up = await fetch(resolveApiUrl("/api/liveStreams"), {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                action: "update",
                streamId: liveStreamEditStreamId,
                title: liveStreamTitle.trim(),
                scheduledStart: streamPromoScheduledIso,
                ticketCents: streamPromoTicketCents,
                freeForSubscribers: liveStreamFreeForSubs,
                creatorTestOnly: liveStreamCreatorTestOnly,
                description: caption.trim() || undefined,
              }),
            });
            const errBody = (await up.json().catch(() => ({}))) as { error?: string };
            if (up.ok) {
              /* ok */
            } else if (up.status === 404) {
              await updateLiveStreamDocClient(ownerUid, liveStreamEditStreamId, {
                title: liveStreamTitle.trim(),
                scheduledStart: streamPromoScheduledIso,
                ticketCents: streamPromoTicketCents,
                freeForSubscribers: liveStreamFreeForSubs,
                creatorTestOnly: liveStreamCreatorTestOnly,
                ...(caption.trim() ? { description: caption.trim() } : {}),
              });
            } else {
              throw new Error(errBody.error || "Could not update stream");
            }
          } else {
            const cr = await fetch(resolveApiUrl("/api/liveStreams"), {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                action: "create",
                title: liveStreamTitle.trim(),
                scheduledStart: streamPromoScheduledIso,
                ticketCents: streamPromoTicketCents,
                freeForSubscribers: liveStreamFreeForSubs,
                creatorTestOnly: liveStreamCreatorTestOnly,
                description: caption.trim() || undefined,
              }),
            });
            const data = (await cr.json().catch(() => ({}))) as { streamId?: string; error?: string };
            if (cr.ok && data.streamId) {
              streamIdForPost = data.streamId;
            } else if (cr.status === 404) {
              streamIdForPost = await createLiveStreamDocClient(ownerUid, {
                title: liveStreamTitle.trim(),
                scheduledStart: streamPromoScheduledIso,
                ticketCents: streamPromoTicketCents,
                freeForSubscribers: liveStreamFreeForSubs,
                creatorTestOnly: liveStreamCreatorTestOnly,
                ...(caption.trim() ? { description: caption.trim() } : {}),
              });
            } else {
              throw new Error(data.error || "Could not create stream");
            }
          }
        } catch (e) {
          console.error(e);
          const code =
            typeof e === "object" && e !== null && "code" in e ? String((e as { code?: string }).code) : "";
          const msg =
            code === "permission-denied"
              ? "Firestore blocked the stream save. Deploy latest firestore.rules (liveStreams) to your Firebase project, or fix DEV_API_PROXY so POST /api/liveStreams is not 404."
              : e instanceof Error
                ? e.message
                : "Stream setup failed";
          showToast?.(msg, "error");
          setPublishing(false);
          return;
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
        // Firestore rejects `undefined`; use [] when there is no audio
        audioUrls,
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
      if (!liveStreamPromoEnabled && pollEnabled && pollQuestion.trim() && pollOptions.filter((o) => o.trim()).length >= 2) {
        postData.poll = {
          question: pollQuestion,
          options: pollOptions.filter((o) => o.trim()),
          optionVotes: pollOptions.filter((o) => o.trim()).map(() => 0),
        };
      }

      // Tip Goal
      if (!liveStreamPromoEnabled && tipGoalEnabled && tipGoalDescription.trim() && tipGoalAmount) {
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

      if (liveStreamPromoEnabled && streamIdForPost && streamPromoScheduledIso) {
        (postData as Record<string, unknown>).postKind = "live_stream_promo";
        (postData as Record<string, unknown>).liveStreamPromo = {
          streamId: streamIdForPost,
          title: liveStreamTitle.trim(),
          scheduledStart: streamPromoScheduledIso,
          ticketCents: streamPromoTicketCents,
          streamStatus: liveStreamComposerStatus ?? "scheduled",
          creatorTestOnly: liveStreamCreatorTestOnly,
          ...(liveStreamFreeForSubs ? { freeForSubscribers: true } : {}),
        };
      }

      // Save to Firestore (update existing when editing, otherwise create new)
      if (editingPostId) {
        await setDoc(doc(db, "creators", creatorId, "fanPosts", editingPostId), postData, { merge: true });
      } else {
        const postRef = await addDoc(collection(db, "creators", creatorId, "fanPosts"), postData);
        if (liveStreamPromoEnabled && streamIdForPost && !liveStreamEditStreamId) {
          try {
            const linkRes = await fetch(resolveApiUrl("/api/liveStreams"), {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                action: "update",
                streamId: streamIdForPost,
                promoPostId: postRef.id,
                creatorTestOnly: liveStreamCreatorTestOnly,
              }),
            });
            if (!linkRes.ok && linkRes.status === 404) {
              await updateLiveStreamDocClient(ownerUid, streamIdForPost, {
                promoPostId: postRef.id,
                creatorTestOnly: liveStreamCreatorTestOnly,
              });
            } else if (!linkRes.ok) {
              console.warn("liveStreams promoPostId link:", linkRes.status);
            }
          } catch (linkErr) {
            console.error("liveStreams promoPostId link:", linkErr);
          }
        }
      }
      
      const message = status === "draft" 
        ? "Draft saved" 
        : status === "scheduled" 
          ? `Scheduled for ${postDate.toLocaleDateString()} at ${calendarTime}`
          : editingPostId
            ? "Post updated"
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
    setLiveStreamPromoEnabled(false);
    setLiveStreamTitle("");
    setLiveStreamStartLocal("");
    setLiveStreamTicketUsd("");
    setLiveStreamFreeForSubs(false);
    setLiveStreamEditStreamId(null);
    setLiveStreamCreatorTestOnly(false);
    setLiveStreamComposerStatus(null);
    setLiveStreamBroadcast(null);
    setLiveStreamDailyBusy(false);
    setEditingPostId(null);
  };

  const openComposerForEdit = useCallback((post: FeedPost) => {
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

    const urls = Array.isArray(post.mediaUrls) ? post.mediaUrls : [];
    const types = Array.isArray(post.mediaTypes) ? post.mediaTypes : [];
    const mediaFromPost: MediaItem[] = urls
      .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
      .map((url, index) => ({
        url,
        type: types[index] === "video" ? "video" : "image",
        fromVault: true,
      }));
    const audioFromPost: MediaItem[] = (Array.isArray(post.audioUrls) ? post.audioUrls : [])
      .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
      .map((url) => ({
        url,
        type: "audio",
        fromVault: true,
      }));

    setMedia([...mediaFromPost, ...audioFromPost]);
    setCaption(post.body || "");
    setHideLikeCounts(!!post.hideLikeCounts);
    setHideComments(!!post.hideComments);
    setHideLikes(!!post.hideLikes);
    setShowTipButton(post.showTipButton !== false);
    setLockEnabled(!!post.lockedContent?.enabled);
    setLockPrice(
      typeof post.lockedContent?.priceCents === "number" && Number.isFinite(post.lockedContent.priceCents)
        ? (post.lockedContent.priceCents / 100).toFixed(2)
        : ""
    );
    setLockPreviewMediaIndex(
      typeof post.lockedContent?.previewMediaIndex === "number" && Number.isFinite(post.lockedContent.previewMediaIndex)
        ? Math.max(0, post.lockedContent.previewMediaIndex)
        : 0
    );
    setPollEnabled(!!post.poll);
    setPollQuestion(post.poll?.question || "");
    setPollOptions(
      Array.isArray(post.poll?.options) && post.poll.options.length >= 2
        ? post.poll.options
        : ["", ""]
    );
    setTipGoalEnabled(!!post.tipGoal);
    setTipGoalDescription(post.tipGoal?.description || "");
    setTipGoalAmount(
      typeof post.tipGoal?.targetCents === "number" && Number.isFinite(post.tipGoal.targetCents)
        ? (post.tipGoal.targetCents / 100).toFixed(2)
        : ""
    );
    const overlayTextValue = typeof post.overlayText === "string" ? post.overlayText : "";
    setOverlayEnabled(overlayTextValue.trim().length > 0);
    setOverlayText(overlayTextValue);
    setOverlayStyle((post.captionStyle as CaptionStyle) || "static");
    setOverlayColor(typeof post.overlayTextColor === "string" ? post.overlayTextColor : "#ffffff");
    setOverlaySize(
      typeof post.overlayTextSize === "number" && Number.isFinite(post.overlayTextSize)
        ? post.overlayTextSize
        : 18
    );
    setOverlayHighlight(!!post.overlayHighlight);
    setOverlayItalic(!!post.overlayItalic);
    const promo = post.liveStreamPromo;
    if (post.postKind === "live_stream_promo" && promo?.streamId) {
      setLiveStreamPromoEnabled(true);
      setLiveStreamEditStreamId(promo.streamId);
      setLiveStreamTitle((promo.title || "").trim());
      setLiveStreamStartLocal(isoToDatetimeLocalValue(promo.scheduledStart));
      setLiveStreamTicketUsd(
        typeof promo.ticketCents === "number" && promo.ticketCents > 0
          ? (promo.ticketCents / 100).toFixed(2)
          : "",
      );
      setLiveStreamFreeForSubs(!!promo.freeForSubscribers);
      setLiveStreamCreatorTestOnly(!!promo.creatorTestOnly);
      const allowed: LiveStreamEventStatus[] = ["draft", "scheduled", "live", "ended", "cancelled"];
      setLiveStreamComposerStatus(
        promo.streamStatus && allowed.includes(promo.streamStatus) ? promo.streamStatus : "scheduled",
      );
    } else {
      setLiveStreamPromoEnabled(false);
      setLiveStreamEditStreamId(null);
      setLiveStreamTitle("");
      setLiveStreamStartLocal("");
      setLiveStreamTicketUsd("");
      setLiveStreamFreeForSubs(false);
      setLiveStreamCreatorTestOnly(false);
      setLiveStreamComposerStatus(null);
    }
    setEditingPostId(post.id);
    setShowComposer(true);
  }, []);

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
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">{editingPostId ? "Edit Post" : "Create Post"}</h3>
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
                    {media.map((item, index) =>
                      item.type === "audio" ? (
                        <div
                          key={`m-${index}-${item.url.slice(-12)}`}
                          className="relative group w-full max-w-md rounded-lg border-2 border-gray-200 dark:border-gray-600 bg-purple-50/80 dark:bg-purple-900/20 p-2"
                        >
                          <div className="flex items-center gap-2 pr-8">
                            <div className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-purple-200 dark:bg-purple-800/50">
                              <MicIcon />
                            </div>
                            <DmAudioPlayer src={item.url} className="flex-1 min-w-0 h-10" />
                          </div>
                          {item.fromVault ? (
                            <div className="absolute top-2 left-2 bg-blue-500 text-white text-[9px] px-1 rounded pointer-events-none">
                              VAULT
                            </div>
                          ) : null}
                          <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition">
                            <button
                              type="button"
                              onClick={() => removeMedia(index)}
                              className="p-1 bg-red-500 text-white rounded-full shadow hover:bg-red-600"
                              aria-label="Remove audio"
                            >
                              <TrashIcon />
                            </button>
                          </div>
                          <div className="flex justify-between mt-1 px-1 opacity-0 group-hover:opacity-100 transition">
                            {index > 0 ? (
                              <button
                                type="button"
                                onClick={() => moveMedia(index, -1)}
                                className="p-0.5 bg-black/40 text-white rounded text-xs"
                              >
                                <ChevronLeftIcon />
                              </button>
                            ) : (
                              <span />
                            )}
                            {index < media.length - 1 ? (
                              <button
                                type="button"
                                onClick={() => moveMedia(index, 1)}
                                className="p-0.5 bg-black/40 text-white rounded text-xs ml-auto"
                              >
                                <ChevronRightIcon />
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <div key={`m-${index}`} className="relative group">
                          <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600">
                            {item.type === "video" ? (
                              <video src={item.url} className="w-full h-full object-cover" />
                            ) : (
                              <img src={item.url} alt="" className="w-full h-full object-cover" />
                            )}
                            {item.fromVault && (
                              <div className="absolute top-1 left-1 bg-blue-500 text-white text-[9px] px-1 rounded">VAULT</div>
                            )}
                          </div>
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
                      )
                    )}
                  </div>
                )}
                
                {voiceMeterStream && (recordingCountdown !== null || isRecording) ? (
                  <div className="mb-3 w-full max-w-md space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <RecordingDurationLabel active={isRecording && recordingCountdown === null} />
                      {recordingCountdown !== null ? (
                        <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                          Get ready… {recordingCountdown}
                        </span>
                      ) : null}
                    </div>
                    <AudioLevelMeter key={`post-voice-${voiceMeterKey}`} stream={voiceMeterStream} />
                  </div>
                ) : null}
                {videoLiveStream ? (
                  <div className="mb-3 rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden bg-black">
                    <div className="flex flex-wrap items-center justify-end gap-2 p-2 bg-black/80 border-b border-gray-700">
                      {!isRecordingVideo ? (
                        <span className="text-xs text-amber-200 mr-auto">Starting camera…</span>
                      ) : null}
                      <RecordingDurationLabel active={isRecordingVideo} />
                    </div>
                    <video
                      ref={videoPreviewRef}
                      className="w-full max-h-60 min-h-[200px] object-cover bg-black"
                      playsInline
                      muted
                      autoPlay
                      aria-label="Camera preview while recording"
                    />
                    <div className="p-2 bg-gray-900/95 border-t border-gray-700">
                      <AudioLevelMeter key={`post-video-${videoMeterKey}`} stream={videoLiveStream} barColor="#f472b6" />
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
                    <EmojiButton includeSjHeartEmoji={includeSjHeartEmoji} onSelect={(emoji) => setCaption((prev) => prev + emoji)} />
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
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      id="fanhub-composer-use-personality-label"
                      className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap"
                    >
                      Personality Override
                    </span>
                    <FanHubSwitch
                      checked={usePersonality}
                      onCheckedChange={setUsePersonality}
                      aria-labelledby="fanhub-composer-use-personality-label"
                    />
                  </div>
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

              {/* Live stream promo */}
              <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <FanHubSwitchRow
                  labelId="fanhub-live-stream-label"
                  label="Live stream promo"
                  checked={liveStreamPromoEnabled}
                  onCheckedChange={(next) => {
                    setLiveStreamPromoEnabled(next);
                    if (next) {
                      setPollEnabled(false);
                      setTipGoalEnabled(false);
                      setOverlayEnabled(false);
                      setLiveStreamComposerStatus("scheduled");
                    } else {
                      setLiveStreamComposerStatus(null);
                      setLiveStreamCreatorTestOnly(false);
                    }
                  }}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Adds a ticket card to this post. The post publishes now; set the real go-live time below.
                </p>
                {liveStreamPromoEnabled && (
                  <div className="mt-3 space-y-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                    <input
                      type="text"
                      value={liveStreamTitle}
                      onChange={(e) => setLiveStreamTitle(e.target.value)}
                      placeholder="Stream title (shown on the card)"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                    <div>
                      <label htmlFor="live-stream-start" className="text-xs text-gray-600 dark:text-gray-400 block mb-1">
                        When you go live
                      </label>
                      <input
                        id="live-stream-start"
                        type="datetime-local"
                        value={liveStreamStartLocal}
                        onChange={(e) => setLiveStreamStartLocal(e.target.value)}
                        className="w-full max-w-xs px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Ticket (optional):</span>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={liveStreamTicketUsd}
                          onChange={(e) => setLiveStreamTicketUsd(e.target.value)}
                          placeholder="0 = free"
                          className="w-32 pl-7 pr-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                    </div>
                    <FanHubSwitchRow
                      labelId="fanhub-live-stream-subs-label"
                      label="Subscribers skip ticket (when billing supports it)"
                      checked={liveStreamFreeForSubs}
                      onCheckedChange={setLiveStreamFreeForSubs}
                    />
                    <FanHubSwitchRow
                      labelId="fanhub-live-stream-test-label"
                      label="Test — hide from fan feed (rehearsal)"
                      checked={liveStreamCreatorTestOnly}
                      onCheckedChange={setLiveStreamCreatorTestOnly}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1">
                      Fans won&apos;t see this post, checkout, or the watch link. You still see it here and can go live with Daily.
                    </p>
                    {liveStreamPromoEnabled && liveStreamEditStreamId ? (
                      <div className="mt-3 space-y-2 border-t border-gray-100 dark:border-gray-700 pt-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Broadcast status:{" "}
                          <span className="font-medium text-gray-700 dark:text-gray-300">
                            {liveStreamComposerStatus === "live"
                              ? "Live"
                              : liveStreamComposerStatus === "ended"
                                ? "Ended"
                                : "Not live"}
                          </span>
                          . Requires Daily.co (<code className="text-[10px]">DAILY_API_KEY</code>).
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={!!liveStreamDailyBusy || liveStreamComposerStatus === "live"}
                            onClick={() => void runLiveStreamDaily("goLive")}
                            className="text-xs px-3 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40"
                          >
                            {liveStreamDailyBusy === "goLive" ? "Starting…" : "Go live"}
                          </button>
                          <button
                            type="button"
                            disabled={!!liveStreamDailyBusy || liveStreamComposerStatus !== "live"}
                            onClick={() => void runLiveStreamDaily("endLive")}
                            className="text-xs px-3 py-2 rounded-lg bg-gray-700 text-white hover:bg-gray-600 disabled:opacity-40"
                          >
                            {liveStreamDailyBusy === "endLive" ? "Ending…" : "End stream"}
                          </button>
                          <button
                            type="button"
                            disabled={liveStreamComposerStatus !== "live"}
                            onClick={() => setLiveStreamBroadcast({ streamId: liveStreamEditStreamId })}
                            className="text-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 disabled:opacity-40"
                          >
                            Open broadcast (host)
                          </button>
                        </div>
                      </div>
                    ) : liveStreamPromoEnabled ? (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                        Save once to create the stream. Broadcast controls show on that post in your feed.
                      </p>
                    ) : null}
                  </div>
                )}
              </div>

              {/* ===== OPTIONAL FEATURES ===== */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {/* Poll Button */}
                <button
                  type="button"
                  disabled={liveStreamPromoEnabled}
                  onClick={() => setPollEnabled(!pollEnabled)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 border-dashed transition ${
                    pollEnabled
                      ? "border-pink-400 bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400"
                      : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-pink-400"
                  } disabled:opacity-40 disabled:pointer-events-none`}
                >
                  <PollIcon />
                  <span className="text-xs font-medium">Poll</span>
                </button>

                {/* Tip Goal Button */}
                <button
                  type="button"
                  disabled={liveStreamPromoEnabled}
                  onClick={() => setTipGoalEnabled(!tipGoalEnabled)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 border-dashed transition ${
                    tipGoalEnabled
                      ? "border-pink-400 bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400"
                      : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-pink-400"
                  } disabled:opacity-40 disabled:pointer-events-none`}
                >
                  <TipIcon />
                  <span className="text-xs font-medium">Tip Goal</span>
                </button>

                {/* Text Overlay Button */}
                <button
                  type="button"
                  disabled={liveStreamPromoEnabled}
                  onClick={() => setOverlayEnabled(!overlayEnabled)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 border-dashed transition ${
                    overlayEnabled
                      ? "border-pink-400 bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400"
                      : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-pink-400"
                  } disabled:opacity-40 disabled:pointer-events-none`}
                >
                  <TextIcon />
                  <span className="text-xs font-medium">Overlay</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const next = !liveStreamPromoEnabled;
                    setLiveStreamPromoEnabled(next);
                    if (next) {
                      setPollEnabled(false);
                      setTipGoalEnabled(false);
                      setOverlayEnabled(false);
                      setLiveStreamComposerStatus("scheduled");
                    } else {
                      setLiveStreamComposerStatus(null);
                      setLiveStreamCreatorTestOnly(false);
                    }
                  }}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 border-dashed transition ${
                    liveStreamPromoEnabled
                      ? "border-pink-400 bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400"
                      : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-pink-400"
                  }`}
                >
                  <VideoCamIcon />
                  <span className="text-xs font-medium">Live</span>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                <FanHubSwitchRow
                  labelId="fanhub-display-tip-label"
                  label="Show Tip Button"
                  checked={showTipButton}
                  onCheckedChange={setShowTipButton}
                />
                <FanHubSwitchRow
                  labelId="fanhub-display-hide-like-counts-label"
                  label="Hide like counts"
                  checked={hideLikeCounts}
                  onCheckedChange={setHideLikeCounts}
                />
                <FanHubSwitchRow
                  labelId="fanhub-display-hide-comments-label"
                  label="Hide Comments"
                  checked={hideComments}
                  onCheckedChange={setHideComments}
                />
                <FanHubSwitchRow
                  labelId="fanhub-display-hide-likes-label"
                  label="Hide Likes"
                  checked={hideLikes}
                  onCheckedChange={setHideLikes}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-5 border-t border-pink-100 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50">
              <button
                type="button"
                onClick={() => handlePublish("draft")}
                disabled={publishing || liveStreamPromoEnabled}
                title={liveStreamPromoEnabled ? "Live stream promos publish immediately" : undefined}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium transition"
              >
                Save as Draft
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(true)}
                  disabled={
                    publishing ||
                    liveStreamPromoEnabled ||
                    (!caption.trim() && media.length === 0)
                  }
                  title={liveStreamPromoEnabled ? "Use go-live time in Live stream promo instead" : undefined}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-600 transition"
                >
                  <CalendarIcon />
                  Schedule
                </button>
                <button
                  type="button"
                  onClick={() => handlePublish("published")}
                  disabled={
                    publishing ||
                    (!caption.trim() && media.length === 0) ||
                    (liveStreamPromoEnabled && (!liveStreamTitle.trim() || !liveStreamStartLocal.trim()))
                  }
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
                disabled={publishing || liveStreamPromoEnabled || !scheduleDate || !scheduleTime}
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

      {/* Feed Admin View — min-w-0 avoids flex children expanding page width/height oddly */}
      <div className="min-w-0">
        <FanHubFeed
          isAdminMode
          onEditPostRequest={openComposerForEdit}
          liveStreamCreatorBroadcast={{
            onGoLive: (streamId) => void runLiveStreamDaily("goLive", streamId),
            onEndStream: (streamId) => void runLiveStreamDaily("endLive", streamId),
            onOpenBroadcast: (streamId) => setLiveStreamBroadcast({ streamId }),
            dailyBusy: liveStreamDailyBusy,
          }}
        />
      </div>

      {liveStreamBroadcast && creatorId ? (
        <LiveStreamWatchRoom
          creatorId={creatorId}
          streamId={liveStreamBroadcast.streamId}
          title={liveStreamTitle.trim() || undefined}
          onClose={() => setLiveStreamBroadcast(null)}
        />
      ) : null}
    </div>
  );
};
