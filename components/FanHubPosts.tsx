import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useAppContext } from "./AppContext";
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter,
  setDoc,
  doc,
  getDoc,
  updateDoc,
  deleteField,
  deleteDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
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
import { usePremiumStudioTab } from "./PremiumStudioLayout";
import { EmojiButton } from "./EmojiPicker";
import { useCreatorHandle } from "../src/hooks/useCreatorHandle";
import { canUseSjHeartEmoji } from "../src/lib/customEmoji";
import { maybeTrimVideoForCaption } from "../src/lib/videoCaptionClip";
import { resolveApiUrl, DEV_API_404_USER_HINT } from "../src/lib/resolveApiUrl";
import type { LiveStreamEventStatus, LiveStreamPromoOnPost } from "../types";
import { hasLiveStreamAccess } from "../src/utils/planAccess";
import { LiveStreamWatchRoom } from "./LiveStreamWatchRoom";
import {
  isProtectedLockedMediaUrl,
  publicMediaUrlsForLockedPost,
  type LockedPostContent,
} from "../src/lib/lockedPostMedia";
import {
  MEDIA_PREVIEW_BLUR_MAX_PX,
  mediaPreviewBlurFilterStyle,
  normalizeMediaPreviewBlurPx,
} from "../src/lib/feedMediaPreviewBlur";
import { fetchCreatorFanPostMedia } from "../src/lib/fetchCreatorFanPostMedia";

const LIVE_STREAM_DOC_STATUSES: LiveStreamEventStatus[] = ["draft", "scheduled", "live", "ended", "cancelled"];

/** After Firestore client fallback for liveStreams, align ticket orders via Admin (scheduled / delivered). */
async function syncLiveStreamTicketOrdersAfterClientFallback(token: string, streamId: string): Promise<void> {
  const sid = streamId.trim();
  if (!sid) return;
  try {
    await fetch(resolveApiUrl("/api/syncLiveStreamTicketOrders"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ streamId: sid }),
    });
  } catch {
    /* non-fatal */
  }
}

/** First vault modal page is small; “Load more” uses startAfter (same index as orderBy). */
const FAN_HUB_VAULT_PAGE = 24;

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

/** Live thumbnail for blur strength while composing (first image or video on the post). */
function FanHubComposerBlurPreview({
  preview,
  blurPx,
  variant = "neutral",
}: {
  preview: { url: string; type: "image" | "video" } | null;
  blurPx: number;
  variant?: "neutral" | "primary";
}) {
  const px = normalizeMediaPreviewBlurPx(blurPx);
  const blurStyle = mediaPreviewBlurFilterStyle(px);
  const shell =
    variant === "primary"
      ? "border border-primary-200/90 dark:border-primary-800 bg-primary-50/40 dark:bg-primary-950/25"
      : "border border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-900/40";
  const caption =
    variant === "primary"
      ? "text-[10px] font-medium uppercase tracking-wide text-primary-700 dark:text-primary-300 border-b border-primary-200/80 dark:border-primary-800 bg-primary-50/90 dark:bg-primary-950/40"
      : "text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200/80 dark:border-gray-600 bg-gray-100/90 dark:bg-gray-800/80";

  if (!preview?.url) {
    return (
      <p className={`text-[11px] m-0 leading-snug ${variant === "primary" ? "text-primary-600/90 dark:text-primary-400/90" : "text-gray-500 dark:text-gray-400"}`}>
        Attach an image or video to see how blur looks.
      </p>
    );
  }

  return (
    <div className={`rounded-lg overflow-hidden max-w-[220px] ${shell}`}>
      <p className={`px-2.5 py-1.5 ${caption}`}>Blur preview</p>
      <div className="relative aspect-video max-h-[132px] w-full bg-black/10 dark:bg-black/30">
        {preview.type === "image" ? (
          <img
            src={preview.url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            style={blurStyle}
          />
        ) : (
          <video
            src={preview.url}
            muted
            playsInline
            preload="metadata"
            className="absolute inset-0 h-full w-full object-cover"
            style={blurStyle}
          />
        )}
      </div>
      <p className={`text-[10px] px-2 py-1.5 m-0 ${variant === "primary" ? "text-primary-600/85 dark:text-primary-400/85" : "text-gray-500 dark:text-gray-400"}`}>
        Matches fan feed blur (~{px}px).
      </p>
    </div>
  );
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
    className={`relative inline-block h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 ${
      checked ? "bg-primary-500" : "bg-gray-200 dark:bg-gray-600"
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
  disabled?: boolean;
}> = ({ label, labelId, checked, onCheckedChange, disabled }) => (
  <div className="flex items-center justify-between gap-3 min-w-0">
    <span id={labelId} className="text-sm text-gray-600 dark:text-gray-400">
      {label}
    </span>
    <FanHubSwitch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-labelledby={labelId} />
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
 * Resolve attached Fan Hub media for caption generation: preserves composer order, supports
 * multiple locals/blobs (via `mediaSlots`) and multiple HTTPS URLs (`mediaUrls`).
 */
async function resolveFanHubCaptionMedia(
  items: MediaItem[],
): Promise<
  | { mediaUrl: string }
  | { mediaUrls: string[] }
  | { mediaData: { data: string; mimeType: string } }
  | {
      mediaSlots: Array<
        | { type: "url"; url: string }
        | { type: "inline"; mediaData: { data: string; mimeType: string } }
      >;
    }
  | null
> {
  const visual = items.filter((m) => m.type === "image" || m.type === "video").slice(0, 6);
  if (visual.length === 0) return null;

  const slots: Array<
    | { type: "url"; url: string }
    | { type: "inline"; mediaData: { data: string; mimeType: string } }
  > = [];

  for (const m of visual) {
    const url = typeof m.url === "string" ? m.url.trim() : "";
    if (url.startsWith("https://") || url.startsWith("http://")) {
      slots.push({ type: "url", url });
      continue;
    }
    if (m.file) {
      const mime = m.file.type || (m.type === "video" ? "video/mp4" : "image/jpeg");
      const data = await fanHubFileToBase64Data(m.file);
      slots.push({ type: "inline", mediaData: { data, mimeType: mime } });
      continue;
    }
    if (url.startsWith("blob:")) {
      const { data, mimeType: blobMime } = await fanHubBlobUrlToBase64(url);
      const mime =
        blobMime && blobMime !== "application/octet-stream"
          ? blobMime
          : m.type === "video"
            ? "video/mp4"
            : "image/jpeg";
      slots.push({ type: "inline", mediaData: { data, mimeType: mime } });
      continue;
    }
    return null;
  }

  if (slots.length === 0) return null;

  if (slots.length === 1) {
    const s = slots[0]!;
    if (s.type === "url") return { mediaUrl: s.url };
    return { mediaData: s.mediaData };
  }

  const allUrl = slots.every((x) => x.type === "url");
  if (allUrl) {
    return { mediaUrls: slots.map((s) => (s as { type: "url"; url: string }).url) };
  }

  return { mediaSlots: slots };
}

function fanHubCaptionMediaFingerprint(items: MediaItem[]): string {
  const visual = items.filter((m) => m.type === "image" || m.type === "video");
  if (visual.length === 0) return "no-visual-media";
  return visual
    .map((item, index) => {
      const file = item.file;
      const fileKey = file
        ? `${file.name}:${file.size}:${file.lastModified}:${file.type}`
        : "";
      const urlKey = item.url ? item.url.split("?")[0].slice(-140) : "";
      return `${index}:${item.type}:${fileKey || urlKey || "unknown"}`;
    })
    .join("|");
}

const FAN_HUB_CAPTION_HISTORY_STORAGE_KEY = "echoflux:fan-hub-caption-history:v1";

function readStoredFanHubCaptionHistory(mediaFingerprint: string): string[] {
  if (typeof window === "undefined" || !mediaFingerprint) return [];
  try {
    const raw = window.localStorage.getItem(FAN_HUB_CAPTION_HISTORY_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const captions = parsed[mediaFingerprint];
    return Array.isArray(captions)
      ? captions.filter((c): c is string => typeof c === "string" && c.trim().length > 0).slice(-16)
      : [];
  } catch {
    return [];
  }
}

function rememberStoredFanHubCaption(mediaFingerprint: string, caption: string) {
  if (typeof window === "undefined" || !mediaFingerprint || !caption.trim()) return;
  try {
    const raw = window.localStorage.getItem(FAN_HUB_CAPTION_HISTORY_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    const merged = [...(Array.isArray(parsed[mediaFingerprint]) ? parsed[mediaFingerprint] : []), caption]
      .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
      .slice(-16);
    const nextEntries = Object.entries({ ...parsed, [mediaFingerprint]: merged }).slice(-80);
    window.localStorage.setItem(FAN_HUB_CAPTION_HISTORY_STORAGE_KEY, JSON.stringify(Object.fromEntries(nextEntries)));
  } catch {
    /* local storage should never block caption generation */
  }
}

export const FanHubPosts: React.FC = () => {
  const { user, showToast, setActivePage } = useAppContext();
  const premiumTab = usePremiumStudioTab();
  const pendingFeedPostId = premiumTab?.pendingFeedPostId ?? null;
  const clearPendingFeedPostId = premiumTab?.clearPendingFeedPostId;
  const [feedDeeplinkPostId, setFeedDeeplinkPostId] = useState<string | null>(null);

  useEffect(() => {
    const pid = pendingFeedPostId?.trim();
    if (!pid) return;
    setFeedDeeplinkPostId(pid);
    clearPendingFeedPostId?.();
  }, [pendingFeedPostId, clearPendingFeedPostId]);

  const [showComposer, setShowComposer] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const editingPostPollRef = useRef<FeedPost["poll"] | null>(null);
  const editingPostTipGoalRef = useRef<FeedPost["tipGoal"] | null>(null);
  
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
  const [vaultLoadingMore, setVaultLoadingMore] = useState(false);
  const [vaultHasMore, setVaultHasMore] = useState(false);
  const vaultCursorRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  /** If false, index on uploadedAt may be missing — only first page (no startAfter). */
  const vaultOrderSupportedRef = useRef(true);
  const vaultGateRef = useRef({ hasMore: false, loadingMore: false, loading: false });
  vaultGateRef.current.hasMore = vaultHasMore;
  vaultGateRef.current.loadingMore = vaultLoadingMore;
  vaultGateRef.current.loading = loadingVault;
  
  // Caption
  const [caption, setCaption] = useState("");
  const [aiTone, setAiTone] = useState<AiTone>("");
  const [customTone, setCustomTone] = useState("");
  const [usePersonality, setUsePersonality] = useState(true);
  const [generating, setGenerating] = useState(false);
  const generatedCaptionHistoryRef = useRef<Map<string, string[]>>(new Map());
  
  // Locked content
  const [lockEnabled, setLockEnabled] = useState(false);
  const [lockPrice, setLockPrice] = useState("");
  /** Which attached media index is the public teaser when post is locked (multi-media only). */
  const [lockPreviewMediaIndex, setLockPreviewMediaIndex] = useState(0);
  /** Teaser / stylistic blur on image & video (optional; works with or without pay-to-unlock). */
  const [mediaPreviewBlurPx, setMediaPreviewBlurPx] = useState(0);
  const [mediaPreviewBlurEnabled, setMediaPreviewBlurEnabled] = useState(false);

  /** Frame shown in blur slider preview (teaser slot when paywall + multi-media). */
  const blurPreviewMediaSource = useMemo((): { url: string; type: "image" | "video" } | null => {
    const visualEntries = media.filter((item) => item.type === "image" || item.type === "video");
    if (!visualEntries.length) return null;

    if (lockEnabled && media.length > 1) {
      const idx = Math.min(Math.max(0, lockPreviewMediaIndex), media.length - 1);
      const picked = media[idx];
      if (picked && (picked.type === "image" || picked.type === "video")) {
        return { url: picked.url, type: picked.type };
      }
    }

    const first = visualEntries[0]!;
    return { url: first.url, type: first.type };
  }, [media, lockEnabled, lockPreviewMediaIndex]);
  
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
  /** When Pro edits an existing live-stream post: keep promo payload without calling stream APIs */
  const liveStreamPreserveRef = useRef<{
    postKind: "live_stream_promo";
    liveStreamPromo: LiveStreamPromoOnPost;
  } | null>(null);

  /** Caption/media optional when a valid poll replaces body content (parity with postData.poll). */
  const hasStandaloneFanHubPollReady = useMemo(
    () =>
      !liveStreamPromoEnabled &&
      pollEnabled &&
      pollQuestion.trim().length > 0 &&
      pollOptions.filter((o) => o.trim()).length >= 2,
    [liveStreamPromoEnabled, pollEnabled, pollQuestion, pollOptions],
  );

  const hasFanHubPublishableComposerContent = useMemo(
    () =>
      caption.trim().length > 0 || media.length > 0 || hasStandaloneFanHubPollReady,
    [caption, media.length, hasStandaloneFanHubPollReady],
  );

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

  const uploadFileWithProgress = useCallback(
    async (
      storagePath: string,
      file: File,
      fileIndex: number,
      totalFiles: number,
    ): Promise<string> => {
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, file, { contentType: file.type });

      return new Promise((resolve, reject) => {
        uploadTask.on(
          "state_changed",
          (snapshot) => {
            const currentFileProgress =
              snapshot.totalBytes > 0 ? snapshot.bytesTransferred / snapshot.totalBytes : 0;
            const aggregateProgress = ((fileIndex + currentFileProgress) / Math.max(1, totalFiles)) * 100;
            setUploadProgress(Math.min(99, Math.max(0, Math.round(aggregateProgress))));
          },
          reject,
          () => {
            setUploadProgress(Math.min(100, Math.round(((fileIndex + 1) / Math.max(1, totalFiles)) * 100)));
            void getDownloadURL(uploadTask.snapshot.ref).then(resolve, reject);
          },
        );
      });
    },
    [],
  );
  
  // Publishing
  const [publishing, setPublishing] = useState(false);
  
  // Scheduling
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showLiveStreamHelpModal, setShowLiveStreamHelpModal] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const creatorId = user?.uid || user?.id;
  const creatorCanLiveStream = hasLiveStreamAccess(user);
  const liveStreamFieldsLocked = liveStreamPromoEnabled && !creatorCanLiveStream;
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
      if (!hasLiveStreamAccess(user)) {
        showToast?.("Live streaming is available on Elite.", "info");
        return;
      }
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
        const data = (await res.json().catch(() => ({}))) as { error?: string; hint?: string };
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error(`Live stream API not found (404). ${DEV_API_404_USER_HINT}`);
          }
          const detail = [data.error, data.hint].filter((s): s is string => !!s?.trim()).join(" — ");
          throw new Error(detail || "Request failed");
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
    [liveStreamEditStreamId, showToast, user],
  );

  // Load vault items from the user's media library (My Vault - sidebar "Vault")
  const loadVault = useCallback(async (mode: "reset" | "more") => {
      if (!user?.id) return;
      if (mode === "more") {
        const g = vaultGateRef.current;
        if (!g.hasMore || g.loadingMore || g.loading) return;
        if (!vaultOrderSupportedRef.current || !vaultCursorRef.current) return;
      }
      if (mode === "reset") {
        vaultCursorRef.current = null;
        vaultOrderSupportedRef.current = true;
      }
      if (mode === "more") setVaultLoadingMore(true);
      else setLoadingVault(true);
      try {
        const vaultRef = collection(db, "users", user.id, "media_library");
        const pageSize = FAN_HUB_VAULT_PAGE;
        let snapshot;
        if (vaultOrderSupportedRef.current) {
          try {
            const q =
              mode === "more" && vaultCursorRef.current
                ? query(vaultRef, orderBy("uploadedAt", "desc"), startAfter(vaultCursorRef.current), limit(pageSize))
                : query(vaultRef, orderBy("uploadedAt", "desc"), limit(pageSize));
            snapshot = await getDocs(q);
          } catch (err) {
            console.warn("FanHubPosts vault: ordered query failed", err);
            if (mode === "more") {
              showToast?.("Could not load more from vault. Close and reopen the picker, then try again.", "error");
              return;
            }
            vaultOrderSupportedRef.current = false;
            vaultCursorRef.current = null;
            snapshot = await getDocs(query(vaultRef, limit(pageSize)));
          }
        } else {
          snapshot = await getDocs(query(vaultRef, limit(pageSize)));
        }
        const items: VaultItem[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          let mediaType: "image" | "video" | "audio" = "image";
          if (data.type === "video") {
            mediaType = "video";
          } else if (data.type === "audio") {
            mediaType = "audio";
          }
          if (data.url) {
            items.push({
              url: data.url,
              path: data.storagePath || "",
              name: data.name || docSnap.id,
              type: mediaType,
            });
          }
        });
        const docs = snapshot.docs;
        if (vaultOrderSupportedRef.current && docs.length) {
          vaultCursorRef.current = docs[docs.length - 1] ?? null;
        } else if (mode === "reset") {
          vaultCursorRef.current = null;
        }
        const fullPage = docs.length === pageSize;
        setVaultHasMore(vaultOrderSupportedRef.current && fullPage);
        setVaultItems((prev) => (mode === "reset" ? items : [...prev, ...items]));
      } catch (error) {
        console.error("Failed to load vault:", error);
      } finally {
        if (mode === "more") setVaultLoadingMore(false);
        else setLoadingVault(false);
      }
  }, [user?.id, showToast]);

  useEffect(() => {
    if (showVault) {
      void loadVault("reset");
    }
  }, [showVault, loadVault]);

  // Load spiciness level from user settings
  useEffect(() => {
    const loadSpiciness = async () => {
      if (!user?.id) return;
      try {
        const { doc: docRef, getDoc } = await import('firebase/firestore');
        const userDocRef = docRef(db, 'users', user.id);
        const userSnapshot = await getDoc(userDocRef);
        if (userSnapshot.exists()) {
          const data = userSnapshot.data();
          if (data.explicitnessLevel !== undefined) {
            setContentSpiciness(data.explicitnessLevel);
          } else if (typeof data.settings?.tone?.spiciness === "number") {
            setContentSpiciness(Math.max(0, Math.min(10, Math.round(data.settings.tone.spiciness / 10))));
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
        const mediaUrl = await uploadFileWithProgress(storagePath, file, i, files.length);
        
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
          stream?.getTracks().forEach((t) => t.stop());
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
      const mediaFingerprint = fanHubCaptionMediaFingerprint(media);
      const avoidCaptions = Array.from(
        new Set([
          ...readStoredFanHubCaptionHistory(mediaFingerprint),
          ...(generatedCaptionHistoryRef.current.get(mediaFingerprint) ?? []),
        ]),
      ).slice(-16);

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
          creatorPersonality:
            user?.settings?.creatorPersonality?.trim() ||
            ((user as { creatorPersonality?: string } | null | undefined)?.creatorPersonality?.trim()) ||
            undefined,
          mediaFingerprint,
          avoidCaptions,
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
        const previous = generatedCaptionHistoryRef.current.get(mediaFingerprint) ?? [];
        generatedCaptionHistoryRef.current.set(mediaFingerprint, [...previous, generatedCaption].slice(-16));
        rememberStoredFanHubCaption(mediaFingerprint, generatedCaption);
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
  }, [caption, aiTone, customTone, usePersonality, contentSpiciness, showToast, user, media]);

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

    if (liveStreamPromoEnabled && !creatorCanLiveStream) {
      if (!editingPostId || !liveStreamPreserveRef.current) {
        showToast?.("Live stream posts require an Elite plan. Open Pricing from your account to upgrade.", "error");
        return;
      }
    }

    if (!hasFanHubPublishableComposerContent) {
      showToast?.(
        "Add a caption, media, or a poll with a question and at least two choices",
        "error",
      );
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

      if (liveStreamPromoEnabled && creatorCanLiveStream) {
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
              void syncLiveStreamTicketOrdersAfterClientFallback(token, liveStreamEditStreamId);
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
              if (streamIdForPost) void syncLiveStreamTicketOrdersAfterClientFallback(token, streamIdForPost);
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
      
      const lockedContentForPost: LockedPostContent | undefined =
        lockEnabled && lockPrice
          ? {
              enabled: true,
              priceCents: Math.round(parseFloat(lockPrice) * 100),
              ...(uploadedUrls.length > 1
                ? {
                    previewMediaIndex: Math.max(
                      0,
                      Math.min(uploadedUrls.length - 1, lockPreviewMediaIndex)
                    ),
                  }
                : {}),
            }
          : undefined;

      if (lockedContentForPost) {
        const badSlots = uploadedUrls.filter((u) =>
          typeof u === "string" ? isProtectedLockedMediaUrl(u.trim()) : false,
        );
        if (badSlots.length > 0) {
          showToast?.(
            "Locked posts need real upload URLs—not preview placeholders. Re-open this post so media reloads from storage, then save again.",
            "error",
          );
          setPublishing(false);
          return;
        }
      }

      const publicMediaUrls = publicMediaUrlsForLockedPost(uploadedUrls, lockedContentForPost);

      // Build post data. For edits, do not touch engagement or original publish timestamps.
      const postData: Record<string, unknown> = {
        creatorId,
        body: caption,
        mediaUrls: publicMediaUrls,
        mediaTypes,
        // Firestore rejects `undefined`; use [] when there is no audio
        audioUrls,
        status,
        hideLikeCounts,
        hideComments,
        hideLikes,
        showTipButton,
        updatedAt: serverTimestamp(),
      };
      if (!editingPostId) {
        postData.likeCount = 0;
        postData.likedBy = [];
        postData.comments = [];
        postData.createdAt = serverTimestamp();
      }
      
      // Add calendar fields for all posts (for calendar view)
      (postData as Record<string, unknown>).calendarDate = calendarDate;
      (postData as Record<string, unknown>).calendarTime = calendarTime;
      
      // Add scheduling fields
      if (status === "scheduled" && scheduledDateTime) {
        (postData as Record<string, unknown>).scheduledAt = scheduledDateTime;
      }
      
      if (status === "published" && !editingPostId) {
        postData.publishedAt = new Date();
      }
      // Merge writes must not overwrite first-publish time when editing an existing post.
      if (editingPostId) {
        delete (postData as Record<string, unknown>).publishedAt;
      }
      
      // Locked content
      if (lockedContentForPost) {
        postData.lockedContent = lockedContentForPost;
      } else if (editingPostId) {
        postData.lockedContent = deleteField();
      }

      const blurPxCandidate =
        mediaPreviewBlurEnabled &&
        uploadedUrls.length > 0 &&
        media.some((m) => m.type === "image" || m.type === "video")
          ? normalizeMediaPreviewBlurPx(mediaPreviewBlurPx)
          : 0;
      const blurForSave = blurPxCandidate > 0 ? blurPxCandidate : 0;
      if (blurForSave > 0) {
        postData.mediaPreviewBlurPx = blurForSave;
      } else if (editingPostId) {
        postData.mediaPreviewBlurPx = deleteField();
      }
      
      // Poll
      if (!liveStreamPromoEnabled && pollEnabled && pollQuestion.trim() && pollOptions.filter((o) => o.trim()).length >= 2) {
        const cleanOptions = pollOptions.filter((o) => o.trim());
        const previousPoll = editingPostId ? editingPostPollRef.current : null;
        const previousVotes = Array.isArray(previousPoll?.optionVotes) ? previousPoll.optionVotes : [];
        postData.poll = {
          question: pollQuestion,
          options: cleanOptions,
          optionVotes: cleanOptions.map((option, index) =>
            previousPoll?.options?.[index]?.trim() === option.trim()
              ? Math.max(0, Math.round(Number(previousVotes[index] || 0)))
              : 0
          ),
        };
      } else if (editingPostId) {
        postData.poll = deleteField();
      }

      // Tip Goal
      if (!liveStreamPromoEnabled && tipGoalEnabled && tipGoalDescription.trim() && tipGoalAmount) {
        postData.tipGoal = {
          description: tipGoalDescription,
          targetCents: Math.round(parseFloat(tipGoalAmount) * 100),
          raisedCents: editingPostId
            ? Math.max(0, Math.round(Number(editingPostTipGoalRef.current?.raisedCents || 0)))
            : 0,
        };
      } else if (editingPostId) {
        postData.tipGoal = deleteField();
      }
      
      // Text Overlay
      if (overlayEnabled && overlayText.trim()) {
        postData.captionStyle = overlayStyle;
        (postData as Record<string, unknown>).overlayText = overlayText;
        (postData as Record<string, unknown>).overlayTextColor = overlayColor;
        (postData as Record<string, unknown>).overlayTextSize = overlaySize;
        (postData as Record<string, unknown>).overlayHighlight = overlayHighlight;
        (postData as Record<string, unknown>).overlayItalic = overlayItalic;
      } else if (editingPostId) {
        (postData as Record<string, unknown>).captionStyle = "static";
        (postData as Record<string, unknown>).overlayText = deleteField();
        (postData as Record<string, unknown>).overlayTextColor = deleteField();
        (postData as Record<string, unknown>).overlayTextSize = deleteField();
        (postData as Record<string, unknown>).overlayHighlight = deleteField();
        (postData as Record<string, unknown>).overlayItalic = deleteField();
      }

      if (liveStreamPromoEnabled && creatorCanLiveStream && streamIdForPost && streamPromoScheduledIso) {
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
      } else if (editingPostId && liveStreamPreserveRef.current) {
        (postData as Record<string, unknown>).postKind = liveStreamPreserveRef.current.postKind;
        (postData as Record<string, unknown>).liveStreamPromo = { ...liveStreamPreserveRef.current.liveStreamPromo };
      }

      // Save to Firestore (update existing when editing, otherwise create new)
      if (editingPostId) {
        await setDoc(doc(db, "creators", creatorId, "fanPosts", editingPostId), postData, { merge: true });
        const privateMediaRef = doc(db, "creators", creatorId, "fanPostPrivateMedia", editingPostId);
        if (lockedContentForPost) {
          await setDoc(privateMediaRef, {
            creatorId,
            postId: editingPostId,
            mediaUrls: uploadedUrls,
            mediaTypes,
            updatedAt: serverTimestamp(),
          }, { merge: true });
        } else {
          await deleteDoc(privateMediaRef).catch(() => undefined);
        }
      } else {
        const postRef = await addDoc(collection(db, "creators", creatorId, "fanPosts"), postData);
        if (lockedContentForPost) {
          await setDoc(doc(db, "creators", creatorId, "fanPostPrivateMedia", postRef.id), {
            creatorId,
            postId: postRef.id,
            mediaUrls: uploadedUrls,
            mediaTypes,
            updatedAt: serverTimestamp(),
          });
        }
        if (liveStreamPromoEnabled && creatorCanLiveStream && streamIdForPost && !liveStreamEditStreamId) {
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
              void syncLiveStreamTicketOrdersAfterClientFallback(token, streamIdForPost);
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
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("echoflux:fan-posts-updated", { detail: { creatorId } }));
      }
      
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
    setMediaPreviewBlurPx(0);
    setMediaPreviewBlurEnabled(false);
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
    liveStreamPreserveRef.current = null;
    editingPostPollRef.current = null;
    editingPostTipGoalRef.current = null;
    setEditingPostId(null);
  };

  const openComposerForEdit = useCallback(async (post: FeedPost) => {
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

    let urls = Array.isArray(post.mediaUrls) ? post.mediaUrls : [];
    let types = Array.isArray(post.mediaTypes) ? post.mediaTypes : [];
    /** Same as publish path (`user?.uid || user?.id`); `uid` alone is often missing on app user objects. */
    const ownerUid = user?.uid || user?.id;
    if (ownerUid && post.lockedContent?.enabled) {
      const resolved = await fetchCreatorFanPostMedia(ownerUid, post.id).catch(() => null);
      if (resolved?.mediaUrls?.length) {
        const pu: string[] = [];
        const pt: ("image" | "video")[] = [];
        resolved.mediaUrls.forEach((raw, index) => {
          if (typeof raw !== "string") return;
          const s = raw.trim();
          if (!s || isProtectedLockedMediaUrl(s)) return;
          pu.push(raw);
          pt.push(resolved.mediaTypes[index] === "video" ? "video" : "image");
        });
        if (pu.length > 0) {
          urls = pu;
          types = pt;
        }
      }
      const stillHasProtected = urls.some((u) => typeof u === "string" && isProtectedLockedMediaUrl(u.trim()));
      if (stillHasProtected || (post.lockedContent?.enabled && urls.length === 0)) {
        urls = [];
        types = [];
        showToast?.(
          "Could not load original media for this locked post—re-upload photos or video, then publish.",
          "error",
        );
      }
    } else {
      const keptUrls: string[] = [];
      const keptTypes: ("image" | "video")[] = [];
      urls.forEach((u, i) => {
        if (typeof u !== "string") return;
        const t = u.trim();
        if (!t || isProtectedLockedMediaUrl(t)) return;
        keptUrls.push(u);
        keptTypes.push(types[i] === "video" ? "video" : "image");
      });
      urls = keptUrls;
      types = keptTypes;
    }
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
    const blurPxLoaded = normalizeMediaPreviewBlurPx(post.mediaPreviewBlurPx);
    setMediaPreviewBlurPx(blurPxLoaded);
    setMediaPreviewBlurEnabled(blurPxLoaded > 0);
    setPollEnabled(!!post.poll);
    editingPostPollRef.current = post.poll || null;
    setPollQuestion(post.poll?.question || "");
    setPollOptions(
      Array.isArray(post.poll?.options) && post.poll.options.length >= 2
        ? post.poll.options
        : ["", ""]
    );
    setTipGoalEnabled(!!post.tipGoal);
    editingPostTipGoalRef.current = post.tipGoal || null;
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
      if (!hasLiveStreamAccess(user)) {
        const ticketCents =
          typeof promo.ticketCents === "number" && Number.isFinite(promo.ticketCents) ? Math.max(0, Math.round(promo.ticketCents)) : 0;
        liveStreamPreserveRef.current = {
          postKind: "live_stream_promo",
          liveStreamPromo: {
            streamId: promo.streamId,
            title: (promo.title || "").trim(),
            scheduledStart: typeof promo.scheduledStart === "string" ? promo.scheduledStart : "",
            ticketCents,
            streamStatus:
              promo.streamStatus && allowed.includes(promo.streamStatus) ? promo.streamStatus : "scheduled",
            creatorTestOnly: !!promo.creatorTestOnly,
            ...(promo.freeForSubscribers ? { freeForSubscribers: true } : {}),
          },
        };
      } else {
        liveStreamPreserveRef.current = null;
      }
    } else {
      liveStreamPreserveRef.current = null;
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
  }, [user]);

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
            className="bg-gradient-to-b from-primary-50 to-white dark:from-gray-800 dark:to-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl my-8"
            style={{ boxShadow: "0 8px 40px rgba(99, 102, 241, 0.15)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-primary-100 dark:border-gray-700">
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
                    className="w-full px-3 py-2 pr-12 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-500 to-primary-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:from-purple-600 hover:to-primary-600 transition"
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
                      ? "border-primary-400 bg-primary-50 dark:bg-primary-900/20"
                      : "border-gray-300 dark:border-gray-600 hover:border-primary-400"
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
                  <div className={`w-10 h-6 rounded-full transition ${lockEnabled ? "bg-primary-500" : "bg-gray-300 dark:bg-gray-600"}`}>
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
                {media.some((m) => m.type === "image" || m.type === "video") ? (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
                    <FanHubSwitchRow
                      labelId="fanhub-media-blur-enabled-label"
                      label="Blur image / video"
                      checked={mediaPreviewBlurEnabled}
                      onCheckedChange={(next) => {
                        setMediaPreviewBlurEnabled(next);
                        if (next && mediaPreviewBlurPx <= 0) {
                          setMediaPreviewBlurPx(Math.min(8, MEDIA_PREVIEW_BLUR_MAX_PX));
                        }
                      }}
                    />
                    {mediaPreviewBlurEnabled && (
                      <>
                        <div>
                          <label htmlFor="fanhub-media-blur-range" className="text-xs text-gray-600 dark:text-gray-400 block mb-1">
                            Strength ({mediaPreviewBlurPx}px)
                          </label>
                          <input
                            id="fanhub-media-blur-range"
                            type="range"
                            min={1}
                            max={MEDIA_PREVIEW_BLUR_MAX_PX}
                            step={1}
                            value={Math.min(MEDIA_PREVIEW_BLUR_MAX_PX, Math.max(1, mediaPreviewBlurPx))}
                            onChange={(e) => setMediaPreviewBlurPx(Number(e.target.value))}
                            className="w-full max-w-md accent-primary-500"
                            aria-valuetext={`${mediaPreviewBlurPx} pixels blur`}
                          />
                        </div>
                        <FanHubComposerBlurPreview preview={blurPreviewMediaSource} blurPx={mediaPreviewBlurPx} variant="neutral" />
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 m-0 leading-snug">
                          Fans see this blur until you turn it off and save again.
                          With <strong>Pay to unlock</strong>, blur follows the same preview rules as before (clears after purchase).
                        </p>
                      </>
                    )}
                  </div>
                ) : media.length > 0 ? (
                  <p className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 text-[11px] text-gray-500 dark:text-gray-400 m-0">
                    Add an image or video to enable blur (audio-only attachments cannot be blurred).
                  </p>
                ) : null}
              </div>

              {/* Live stream — Elite; Pro sees upgrade + non-interactive control */}
              {creatorCanLiveStream || liveStreamPromoEnabled ? (
                <div className="rounded-xl border border-primary-200/70 dark:border-primary-900/45 bg-gradient-to-br from-primary-50/90 via-white to-primary-50/50 dark:from-gray-800 dark:via-gray-800/95 dark:to-primary-950/25 p-4 shadow-sm ring-1 ring-primary-100/50 dark:ring-primary-900/20">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-500/10 text-primary-600 dark:bg-primary-500/15 dark:text-primary-300">
                        <VideoCamIcon />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">Live stream</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                          {creatorCanLiveStream
                            ? "Adds a stream card to this post. Publish now — schedule the real start time below."
                            : "Stream details are read-only on your plan. You can still edit caption and media; upgrade to Elite to change tickets or broadcast."}
                        </p>
                      </div>
                    </div>
                    {creatorCanLiveStream ? (
                      <button
                        type="button"
                        onClick={() => setShowLiveStreamHelpModal(true)}
                        className="shrink-0 text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 underline-offset-2 hover:underline"
                      >
                        How it works
                      </button>
                    ) : null}
                  </div>
                  {liveStreamFieldsLocked ? (
                    <p className="text-[11px] text-amber-800 dark:text-amber-200/90 bg-amber-50/90 dark:bg-amber-950/35 border border-amber-200/70 dark:border-amber-900/45 rounded-lg px-2.5 py-2 mb-2">
                      Upgrade to Elite to manage live stream settings. Saving keeps your existing stream link.
                    </p>
                  ) : null}
                  <FanHubSwitchRow
                    labelId="fanhub-live-stream-label"
                    label="Turn on live stream for this post"
                    checked={liveStreamPromoEnabled}
                    disabled={liveStreamFieldsLocked}
                    onCheckedChange={(next) => {
                      if (liveStreamFieldsLocked) return;
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
                  {liveStreamPromoEnabled && (
                    <div className="mt-3 space-y-3 border-t border-primary-100/80 dark:border-primary-900/30 pt-3">
                      <input
                        type="text"
                        value={liveStreamTitle}
                        onChange={(e) => setLiveStreamTitle(e.target.value)}
                        placeholder="Stream title on the card"
                        disabled={liveStreamFieldsLocked}
                        readOnly={liveStreamFieldsLocked}
                        className="w-full px-3 py-2 border border-primary-200/80 dark:border-gray-600 rounded-lg bg-white/90 dark:bg-gray-900/50 text-gray-900 dark:text-white text-sm disabled:opacity-60"
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="live-stream-start" className="text-[11px] font-medium text-gray-600 dark:text-gray-400 block mb-1">
                            Go-live time
                          </label>
                          <input
                            id="live-stream-start"
                            type="datetime-local"
                            value={liveStreamStartLocal}
                            onChange={(e) => setLiveStreamStartLocal(e.target.value)}
                            disabled={liveStreamFieldsLocked}
                            readOnly={liveStreamFieldsLocked}
                            className="w-full px-3 py-2 border border-primary-200/80 dark:border-gray-600 rounded-lg bg-white/90 dark:bg-gray-900/50 text-gray-900 dark:text-white text-sm disabled:opacity-60"
                          />
                        </div>
                        <div>
                          <label htmlFor="live-stream-ticket" className="text-[11px] font-medium text-gray-600 dark:text-gray-400 block mb-1">
                            Ticket (USD, 0 = free)
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                            <input
                              id="live-stream-ticket"
                              type="number"
                              min={0}
                              step={0.01}
                              value={liveStreamTicketUsd}
                              onChange={(e) => setLiveStreamTicketUsd(e.target.value)}
                              placeholder="0"
                              disabled={liveStreamFieldsLocked}
                              readOnly={liveStreamFieldsLocked}
                              className="w-full pl-7 pr-3 py-2 border border-primary-200/80 dark:border-gray-600 rounded-lg bg-white/90 dark:bg-gray-900/50 text-gray-900 dark:text-white text-sm disabled:opacity-60"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="rounded-lg border border-primary-200/60 dark:border-gray-600 bg-white/70 dark:bg-gray-900/35 px-3 py-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 pr-2">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Paid members included</p>
                            <p className="text-[11px] leading-snug text-gray-500 dark:text-gray-400 mt-1">
                              Active subscribers to your page can watch without buying a ticket. Only applies when memberships
                              and Stripe Connect are set up.
                            </p>
                          </div>
                          <FanHubSwitch
                            checked={liveStreamFreeForSubs}
                            onCheckedChange={setLiveStreamFreeForSubs}
                            disabled={liveStreamFieldsLocked}
                            aria-label="Paid members included without separate ticket"
                          />
                        </div>
                      </div>
                      <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-900/30 px-3 py-2.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 pr-2">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Rehearsal (hide from fans)</p>
                            <p className="text-[11px] leading-snug text-gray-500 dark:text-gray-400 mt-1">
                              Hides this post from fans. You still see it here and can go live to test.
                            </p>
                          </div>
                          <FanHubSwitch
                            checked={liveStreamCreatorTestOnly}
                            onCheckedChange={setLiveStreamCreatorTestOnly}
                            disabled={liveStreamFieldsLocked}
                            aria-label="Rehearsal hide from fan feed"
                          />
                        </div>
                      </div>
                      {creatorCanLiveStream && liveStreamPromoEnabled && liveStreamEditStreamId ? (
                        <div className="rounded-lg border border-violet-200/70 dark:border-violet-900/40 bg-violet-50/50 dark:bg-violet-950/20 px-3 py-2.5 space-y-2">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-600 dark:text-gray-300">
                            <span className="font-medium text-gray-800 dark:text-gray-100">Broadcast</span>
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                liveStreamComposerStatus === "live"
                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                  : liveStreamComposerStatus === "ended"
                                    ? "bg-gray-500/15 text-gray-600 dark:text-gray-400"
                                    : "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                              }`}
                            >
                              {liveStreamComposerStatus === "live"
                                ? "Live"
                                : liveStreamComposerStatus === "ended"
                                  ? "Ended"
                                  : "Idle"}
                            </span>
                            <span className="text-gray-400 dark:text-gray-500">· Daily.co</span>
                          </div>
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
                      ) : liveStreamPromoEnabled && creatorCanLiveStream ? (
                        <p className="text-[11px] text-amber-700 dark:text-amber-300/90 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 rounded-lg px-2.5 py-2">
                          Publish once to create the stream. Controls also appear on this post in your feed after save.
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/90 dark:bg-gray-800/60 p-4 shadow-sm">
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-200/80 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                      <VideoCamIcon />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">Live streams</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                        Ticketed live broadcasts on your fan page are included on Elite.
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span
                          className="inline-flex cursor-not-allowed select-none items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-400 opacity-80 dark:border-gray-600 dark:bg-gray-900"
                          aria-disabled
                        >
                          Live stream (Elite)
                        </span>
                        <button
                          type="button"
                          onClick={() => setActivePage("pricing")}
                          className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
                        >
                          View pricing
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ===== OPTIONAL FEATURES ===== */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {/* Poll Button */}
                <button
                  type="button"
                  disabled={liveStreamPromoEnabled}
                  onClick={() => setPollEnabled(!pollEnabled)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 border-dashed transition ${
                    pollEnabled
                      ? "border-primary-400 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400"
                      : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-primary-400"
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
                      ? "border-primary-400 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400"
                      : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-primary-400"
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
                      ? "border-primary-400 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400"
                      : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-primary-400"
                  } disabled:opacity-40 disabled:pointer-events-none`}
                >
                  <TextIcon />
                  <span className="text-xs font-medium">Overlay</span>
                </button>

                {creatorCanLiveStream ? (
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
                        ? "border-primary-400 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400"
                        : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-primary-400"
                    }`}
                  >
                    <VideoCamIcon />
                    <span className="text-xs font-medium">Live</span>
                  </button>
                ) : liveStreamPromoEnabled ? (
                  <div
                    className="flex flex-col items-center gap-0.5 p-3 rounded-lg border-2 border-dashed border-primary-400/70 bg-primary-50/50 dark:bg-primary-900/15 text-primary-600 dark:text-primary-400 opacity-75 cursor-not-allowed select-none"
                    title="Live stream editing requires Elite"
                  >
                    <VideoCamIcon />
                    <span className="text-xs font-medium">Live</span>
                    <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">Elite</span>
                  </div>
                ) : (
                  <div
                    className="flex flex-col items-center gap-0.5 p-3 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed select-none opacity-80"
                    title="Live streams are included on Elite"
                  >
                    <VideoCamIcon />
                    <span className="text-xs font-medium">Live</span>
                    <span className="text-[10px] font-semibold text-amber-700/90 dark:text-amber-400">Elite</span>
                  </div>
                )}
              </div>

              {/* Poll Editor */}
              {pollEnabled && (
                <div className="bg-primary-50 dark:bg-primary-900/20 rounded-xl p-4 border border-primary-200 dark:border-primary-800">
                  <h4 className="text-sm font-semibold text-primary-700 dark:text-primary-300 mb-3 flex items-center gap-2">
                    <PollIcon /> Poll
                  </h4>
                  <div className="mb-3 flex items-center gap-2">
                    <input
                      type="text"
                      value={pollQuestion}
                      onChange={(e) => setPollQuestion(e.target.value)}
                      placeholder="Ask a question..."
                      className="min-w-0 flex-1 px-3 py-2 border border-primary-200 dark:border-primary-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                    <EmojiButton includeSjHeartEmoji={includeSjHeartEmoji} onSelect={(emoji) => setPollQuestion((prev) => prev + emoji)} />
                  </div>
                  <div className="space-y-2">
                    {pollOptions.map((option, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={option}
                          onChange={(e) => updatePollOption(index, e.target.value)}
                          placeholder={`Option ${index + 1}`}
                          className="flex-1 px-3 py-2 border border-primary-200 dark:border-primary-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        />
                        <EmojiButton includeSjHeartEmoji={includeSjHeartEmoji} onSelect={(emoji) => updatePollOption(index, `${option}${emoji}`)} />
                        {pollOptions.length > 2 && (
                          <button type="button" onClick={() => removePollOption(index)} className="p-2 text-red-500 hover:text-red-600">
                            <TrashIcon />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {pollOptions.length < 6 && (
                    <button type="button" onClick={addPollOption} className="mt-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 font-medium">
                      + Add Option
                    </button>
                  )}
                </div>
              )}

              {/* Tip Goal Editor */}
              {tipGoalEnabled && (
                <div className="bg-primary-50 dark:bg-primary-900/20 rounded-xl p-4 border border-primary-200 dark:border-primary-800">
                  <h4 className="text-sm font-semibold text-primary-700 dark:text-primary-300 mb-3 flex items-center gap-2">
                    <TipIcon /> Tip Goal
                  </h4>
                  <div className="mb-3 flex items-center gap-2">
                    <input
                      type="text"
                      value={tipGoalDescription}
                      onChange={(e) => setTipGoalDescription(e.target.value)}
                      placeholder="What's the goal? (e.g., Help me reach my goal!)"
                      className="min-w-0 flex-1 px-3 py-2 border border-primary-200 dark:border-primary-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                    <EmojiButton includeSjHeartEmoji={includeSjHeartEmoji} onSelect={(emoji) => setTipGoalDescription((prev) => prev + emoji)} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-primary-700 dark:text-primary-300">Target:</span>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                      <input
                        type="number"
                        min={1}
                        value={tipGoalAmount}
                        onChange={(e) => setTipGoalAmount(e.target.value)}
                        placeholder="0"
                        className="w-28 pl-7 pr-3 py-2 border border-primary-200 dark:border-primary-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Text Overlay Editor */}
              {overlayEnabled && (
                <div className="bg-primary-50 dark:bg-primary-900/20 rounded-xl p-4 border border-primary-200 dark:border-primary-800">
                  <h4 className="text-sm font-semibold text-primary-700 dark:text-primary-300 mb-3 flex items-center gap-2">
                    <TextIcon /> Text Overlay
                  </h4>
                  <div className="mb-3 flex items-start gap-2">
                    <textarea
                      value={overlayText}
                      onChange={(e) => setOverlayText(e.target.value)}
                      placeholder="Text to show on image..."
                      rows={2}
                      className="min-w-0 flex-1 px-3 py-2 border border-primary-200 dark:border-primary-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                    />
                    <EmojiButton includeSjHeartEmoji={includeSjHeartEmoji} onSelect={(emoji) => setOverlayText((prev) => prev + emoji)} />
                  </div>
                  <div className="flex flex-wrap gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-primary-700 dark:text-primary-300">Animation:</span>
                      <select
                        value={overlayStyle}
                        onChange={(e) => setOverlayStyle(e.target.value as CaptionStyle)}
                        className="px-2 py-1 text-sm border border-primary-200 dark:border-primary-700 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                      >
                        <option value="static">Static</option>
                        <option value="scroll-up">Scroll Up</option>
                        <option value="scroll-across">Scroll Across</option>
                        <option value="dissolve">Dissolve</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-primary-700 dark:text-primary-300">Color:</span>
                      <input
                        type="color"
                        value={overlayColor}
                        onChange={(e) => setOverlayColor(e.target.value)}
                        className="w-8 h-8 rounded border border-primary-200 dark:border-primary-700 cursor-pointer"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-primary-700 dark:text-primary-300">Size:</span>
                      <input
                        type="range"
                        min={10}
                        max={72}
                        value={overlaySize}
                        onChange={(e) => setOverlaySize(Number(e.target.value))}
                        className="w-20"
                      />
                      <span className="text-xs text-primary-600">{overlaySize}px</span>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-1.5 text-sm text-primary-700 dark:text-primary-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={overlayHighlight}
                        onChange={(e) => setOverlayHighlight(e.target.checked)}
                        className="rounded border-primary-300 text-primary-500"
                      />
                      Highlight
                    </label>
                    <label className="flex items-center gap-1.5 text-sm text-primary-700 dark:text-primary-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={overlayItalic}
                        onChange={(e) => setOverlayItalic(e.target.checked)}
                        className="rounded border-primary-300 text-primary-500"
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
            <div className="flex items-center justify-between p-5 border-t border-primary-100 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50">
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
                    !hasFanHubPublishableComposerContent
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
                    !hasFanHubPublishableComposerContent ||
                    (liveStreamPromoEnabled && (!liveStreamTitle.trim() || !liveStreamStartLocal.trim()))
                  }
                  className="px-6 py-2.5 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-lg font-semibold disabled:opacity-50 hover:from-primary-600 hover:to-primary-700 transition shadow-lg shadow-primary-500/25"
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
                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-purple-500 to-primary-500 text-white rounded-lg font-semibold disabled:opacity-50 hover:from-purple-600 hover:to-primary-600 transition"
              >
                {publishing ? "Scheduling..." : "Schedule Post"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live stream — creator help */}
      {showLiveStreamHelpModal && (
        <div
          className="fixed inset-0 z-[62] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() => setShowLiveStreamHelpModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="fanhub-live-stream-help-title"
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[min(85vh,32rem)] flex flex-col border border-primary-100 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 p-4 border-b border-primary-100 dark:border-gray-700 bg-gradient-to-r from-primary-50/80 to-white dark:from-primary-950/30 dark:to-gray-800">
              <div className="flex items-start gap-3 min-w-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-300">
                  <VideoCamIcon />
                </span>
                <div>
                  <h3 id="fanhub-live-stream-help-title" className="text-lg font-semibold text-gray-900 dark:text-white">
                    How live streams work
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Quick reference for your Fan Hub broadcast.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLiveStreamHelpModal(false)}
                className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition shrink-0"
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-4 text-sm text-gray-700 dark:text-gray-300">
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400 mb-1.5">
                  Publishing
                </h4>
                <ul className="list-disc list-inside space-y-1 text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
                  <li>This post publishes to your feed now. The stream card shows your title and scheduled go-live time.</li>
                  <li>Use <strong className="text-gray-800 dark:text-gray-200">Go live</strong> when you start.</li>
                </ul>
              </section>
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400 mb-1.5">
                  Ticket price
                </h4>
                <ul className="list-disc list-inside space-y-1 text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
                  <li>Set a dollar amount for a one-time ticket, or <strong className="text-gray-800 dark:text-gray-200">$0</strong> for a free show.</li>
                  <li>Fans who pay get access to that event after checkout.</li>
                </ul>
              </section>
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400 mb-1.5">
                  Paid members included
                </h4>
                <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
                  When this is on, fans with an <strong className="text-gray-800 dark:text-gray-200">active paid subscription</strong> to your
                  page can watch <strong className="text-gray-800 dark:text-gray-200">without buying a ticket</strong>. It only applies if
                  memberships and Stripe Connect are configured so subscriber status is recorded. If you only sell tickets or free entry,
                  you can leave this off.
                </p>
              </section>
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400 mb-1.5">
                  Rehearsal
                </h4>
                <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
                  Hides the post from fans so you can test. You still see it in your creator feed and can go live.
                </p>
              </section>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/80 rounded-b-xl">
              <button
                type="button"
                onClick={() => setShowLiveStreamHelpModal(false)}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-primary-500 to-primary-600 text-white text-sm font-semibold hover:from-primary-600 hover:to-primary-700 shadow-sm"
              >
                Got it
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
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mb-3"></div>
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
                  {vaultItems.map((item) => (
                    <button
                      key={`${item.url}\0${item.path || item.name}`}
                      type="button"
                      onClick={() => addFromVault(item)}
                      className="fh-vault-tile aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 hover:ring-2 hover:ring-primary-500 transition relative group"
                    >
                      {item.type === "video" ? (
                        <>
                          <video
                            src={item.url}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                            preload="metadata"
                          />
                          <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                            </svg>
                          </div>
                        </>
                      ) : item.type === "audio" ? (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 p-2">
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
                        <img
                          src={item.url}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
                        <span className="text-white opacity-0 group-hover:opacity-100 font-medium text-sm bg-primary-500 px-3 py-1 rounded-full shadow-lg">
                          Select
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {vaultItems.length > 0 && vaultHasMore ? (
                <div className="flex justify-center pt-4 pb-1">
                  <button
                    type="button"
                    disabled={vaultLoadingMore || loadingVault}
                    onClick={() => void loadVault("more")}
                    className="text-sm px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    {vaultLoadingMore ? "Loading…" : "Load more from vault"}
                  </button>
                </div>
              ) : null}
            </div>
            <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-center text-sm text-gray-500 dark:text-gray-400">
              Tip: Upload more media from <span className="font-medium text-primary-500">My Vault</span> in the sidebar
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
          liveStreamHostActiveStreamId={liveStreamBroadcast?.streamId ?? null}
          deeplinkScrollToPostId={feedDeeplinkPostId}
          onDeeplinkScrollToPostConsumed={() => setFeedDeeplinkPostId(null)}
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
