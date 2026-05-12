import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAppContext } from "./AppContext";
import { auth, db, storage } from "../firebaseConfig";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter,
  where,
  doc,
  setDoc,
  type Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { formatFanDisplayLabel, safeUsernameForHandle } from "../src/lib/fanHubDisplay";
import { useCreatorFanHubTheme } from "../src/hooks/useCreatorFanHubTheme";
import { isJointLiveSessionProductId, jointSessionKindFromProductId } from "../src/lib/treatSessionClassification";
import { usePremiumStudioTab } from "./PremiumStudioLayout";
import VideoCallRoom from "./VideoCallRoom";
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

type ScheduleStatus = "pending" | "scheduled" | "completed" | "cancelled";

type Purchase = {
  id: string;
  email: string;
  /** Firebase auth uid when the fan checked out signed-in (not guest). */
  fanMemberId: string;
  fanUsername: string | null;
  fanName: string | null;
  productName: string;
  treatType: string;
  amountCents: number;
  createdAt: Date;
  scheduleStatus: ScheduleStatus;
  scheduledDate: string | null;
  scheduledTime: string | null;
  deliveryStatus: "pending" | "delivered";
  deliveryType: "video" | "image" | "audio" | "text" | null;
  deliveryText: string | null;
  deliveryUrl: string | null;
  deliveredAt: Date | null;
  isDemo?: boolean;
  orderType?: string;
};

type VaultItem = {
  url: string;
  name: string;
  type: "image" | "video" | "audio";
  uploadedAt?: string;
};

function formatDateShort(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatScheduleDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatTime12h(timeStr: string | null): string {
  if (!timeStr || !timeStr.trim()) return "";
  const [h, min] = timeStr.split(":").map(Number);
  const hour = h ?? 0;
  const minute = min ?? 0;
  if (hour === 0) return `12:${String(minute).padStart(2, "0")} AM`;
  if (hour < 12) return `${hour}:${String(minute).padStart(2, "0")} AM`;
  if (hour === 12) return `12:${String(minute).padStart(2, "0")} PM`;
  return `${hour - 12}:${String(minute).padStart(2, "0")} PM`;
}

function formatAmount(cents: number): string {
  return "$" + (cents / 100).toFixed(2);
}

function isTipPurchase(p: Purchase): boolean {
  const orderType = (p.orderType || "").trim().toLowerCase();
  const treatType = (p.treatType || "").trim().toLowerCase();
  const productName = (p.productName || "").trim().toLowerCase();
  return orderType === "tip" || treatType === "tip" || productName === "tip";
}

function purchaseFanLabel(p: Purchase): string {
  const username = safeUsernameForHandle(p.fanUsername);
  const email = p.email?.trim();
  if (username && !isEmailDerivedUsername(username, email || null)) return `@${username}`;
  const nameLabel = formatFanDisplayLabel(
    {
      displayName: p.fanName,
      name: p.fanName,
    },
    { fallback: "Member" },
  );
  if (nameLabel !== "Member") return nameLabel;
  if (email && email.includes("@")) return email;
  return nameLabel;
}

function emailFromUnknown(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  const exact = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  if (exact) return trimmed;
  const embedded = trimmed.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0];
  return embedded ? embedded.toLowerCase() : null;
}

function isEmailDerivedUsername(username: string, email: string | null): boolean {
  if (!email) return false;
  const normalizedUsername = username.replace(/^@/, "").trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();
  const compactEmail = normalizedEmail.replace(/[^a-z0-9_]/g, "");
  const [local, domain = ""] = normalizedEmail.split("@");
  const compactDomain = domain.replace(/[^a-z0-9_]/g, "");
  return normalizedUsername === compactEmail || normalizedUsername === `${local}${compactDomain}`;
}

function usernameFromFanRecord(data: Record<string, unknown>, email: string | null): string | null {
  for (const key of ["username", "memberUsername", "fanUsername", "handle", "instagram_handle", "instagramHandle"]) {
    const value = data[key];
    if (typeof value !== "string" || !value.trim()) continue;
    const username = safeUsernameForHandle(value.replace(/^@/, ""));
    if (username && isEmailDerivedUsername(username, email)) continue;
    if (username) return username;
  }
  return null;
}

function nameFromFanRecord(data: Record<string, unknown>, email: string | null): string | null {
  for (const key of ["displayName", "fanName", "name"]) {
    const value = data[key];
    if (typeof value !== "string" || !value.trim()) continue;
    const label = formatFanDisplayLabel(
      {
        displayName: value,
        name: value,
        email,
      },
      { fallback: "Member" },
    );
    if (label !== "Member") return label;
  }
  return null;
}

function isSubscriptionPurchase(p: Purchase): boolean {
  const orderType = (p.orderType || "").trim().toLowerCase();
  const treatType = (p.treatType || "").trim().toLowerCase();
  const productName = (p.productName || "").trim().toLowerCase();
  return (
    orderType === "subscription" ||
    treatType === "subscription" ||
    productName.includes("subscription") ||
    productName.includes("membership")
  );
}

function isLiveStreamTicketPurchase(p: Purchase): boolean {
  return (p.orderType || "").trim().toLowerCase() === "live_stream_ticket";
}

function isPostUnlockOrderType(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  return t === "post_unlock" || t === "unlock" || t === "unlock_media";
}

/** Paid feed unlock — entitlement is applied immediately; no calendar or delivery workflow. */
function isPostUnlockPurchase(p: Purchase): boolean {
  return isPostUnlockOrderType(p.orderType || "") || isPostUnlockOrderType(String(p.treatType || ""));
}

/** Past scheduled start + grace: treat ticket as fulfilled if Firestore still says pending/scheduled/live-synced. */
const LIVE_STREAM_TICKET_STALE_AFTER_MS = 6 * 60 * 60 * 1000;

function utcMsFromOrderScheduleParts(dateStr: string | null, timeStr: string | null): number | null {
  if (!dateStr || !timeStr?.trim()) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  if (![y, m, d].every((n) => Number.isFinite(n))) return null;
  const ms = Date.UTC(y, (m ?? 1) - 1, d ?? 1, Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0, 0, 0);
  return Number.isFinite(ms) ? ms : null;
}

function liveStreamTicketPurchaseEffective(p: Purchase): {
  scheduleStatus: ScheduleStatus;
  deliveryStatus: "pending" | "delivered";
} {
  if (!isLiveStreamTicketPurchase(p)) {
    return { scheduleStatus: p.scheduleStatus, deliveryStatus: p.deliveryStatus };
  }
  if (p.scheduleStatus === "cancelled") {
    return { scheduleStatus: p.scheduleStatus, deliveryStatus: p.deliveryStatus };
  }
  if (p.scheduleStatus === "completed" || p.deliveryStatus === "delivered") {
    return { scheduleStatus: p.scheduleStatus, deliveryStatus: p.deliveryStatus };
  }
  const ms = utcMsFromOrderScheduleParts(p.scheduledDate, p.scheduledTime);
  if (ms != null && Date.now() > ms + LIVE_STREAM_TICKET_STALE_AFTER_MS) {
    return { scheduleStatus: "completed", deliveryStatus: "delivered" };
  }
  return { scheduleStatus: p.scheduleStatus, deliveryStatus: p.deliveryStatus };
}

function purchaseEffectiveForUi(p: Purchase): {
  scheduleStatus: ScheduleStatus;
  deliveryStatus: "pending" | "delivered";
} {
  if (isPostUnlockPurchase(p)) {
    return { scheduleStatus: "completed", deliveryStatus: "delivered" };
  }
  const ls = liveStreamTicketPurchaseEffective(p);
  if (isLiveStreamTicketPurchase(p)) return ls;
  return { scheduleStatus: p.scheduleStatus, deliveryStatus: p.deliveryStatus };
}

/** Compact list row — mirrors member “Your purchases” minimize view. */
function creatorPurchaseTypeLabel(p: Purchase): string {
  if (isTipPurchase(p)) return "Tip";
  if (isSubscriptionPurchase(p)) return "Membership";
  const t = (p.orderType || "").trim().toLowerCase();
  if (t === "post_unlock") return "Feed unlock";
  if (t === "live_stream_ticket") return "Live stream";
  return "Product";
}

function creatorPurchaseStatusLine(p: Purchase): string {
  const eff = purchaseEffectiveForUi(p);
  if (isTipPurchase(p)) return "Tip received";
  if (isSubscriptionPurchase(p)) return "Subscription payment";
  if (isPostUnlockPurchase(p)) return "Unlocked in feed";
  if (isLiveStreamTicketPurchase(p)) {
    if (eff.deliveryStatus === "delivered" || eff.scheduleStatus === "completed") return "Delivered";
    if (eff.scheduleStatus === "scheduled") return "Scheduled";
    if (eff.scheduleStatus === "cancelled") return "Cancelled";
    if (eff.scheduleStatus === "pending") return "Pending";
  }
  if (eff.deliveryStatus === "delivered") return "Delivered";
  if (eff.scheduleStatus === "pending") return "Needs scheduling";
  if (eff.scheduleStatus === "scheduled") return "Scheduled";
  if (eff.scheduleStatus === "completed") return "Completed";
  return "—";
}

function toLocalScheduleParts(date: Date): { date: string; time: string } {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return { date: `${y}-${m}-${d}`, time: `${hh}:${mm}` };
}

function vaultUploadedAtMs(raw: Record<string, unknown>): number {
  const u = raw.uploadedAt;
  if (u && typeof u === "object" && "toMillis" in u && typeof (u as Timestamp).toMillis === "function") {
    return (u as Timestamp).toMillis();
  }
  if (typeof u === "string") {
    const t = new Date(u).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

function inferVaultMediaType(raw: Record<string, unknown>, url: string): "image" | "video" | "audio" {
  const t = raw.type;
  if (t === "video" || t === "audio" || t === "image") return t;
  const mime = typeof raw.mimeType === "string" ? raw.mimeType.toLowerCase() : "";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  const path = url.split("?")[0].toLowerCase();
  if (/\.(mp4|mov|webm|m4v|mkv)(\b|$)/.test(path)) return "video";
  if (/\.(mp3|m4a|wav|aac|ogg|flac)(\b|$)/.test(path)) return "audio";
  return "image";
}

function inferDeliveryTypeFromFile(file: File): "video" | "image" | "audio" | null {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/")) return "image";
  const name = file.name.toLowerCase();
  if (/\.(mp4|mov|webm|m4v|mkv)$/.test(name)) return "video";
  if (/\.(mp3|m4a|wav|aac|ogg|flac)$/.test(name)) return "audio";
  if (/\.(jpg|jpeg|png|gif|webp|heic|avif)$/.test(name)) return "image";
  return null;
}

function formatRecordingElapsed(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

// Empty - no demo data for new creators
const DEMO_PURCHASES: Purchase[] = [];

const PURCHASES_VAULT_PAGE = 24;

const PurchasesHelpIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
    />
  </svg>
);

const CloseIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

/**
 * Fan Hub → Purchases: store purchases with scheduling to calendar.
 * Shows pending purchases that need scheduling, and scheduled/completed ones.
 */
export const FanHubPurchases: React.FC = () => {
  const { user, showToast } = useAppContext();
  const tabCtx = usePremiumStudioTab();
  const [purchases, setPurchases] = useState<Purchase[]>(DEMO_PURCHASES);
  const [hiddenPurchaseIds, setHiddenPurchaseIds] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("12:00");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "scheduled" | "completed" | "tips">("all");
  const [purchaseDateRangeDays, setPurchaseDateRangeDays] = useState<7 | 30 | 90>(30);
  const [showPurchasesHelpModal, setShowPurchasesHelpModal] = useState(false);
  const [deliveryEditingId, setDeliveryEditingId] = useState<string | null>(null);
  const [deliveryTypeDraft, setDeliveryTypeDraft] = useState<"video" | "image" | "audio" | "text">("text");
  const [deliveryTextDraft, setDeliveryTextDraft] = useState("");
  const [deliveryUrlDraft, setDeliveryUrlDraft] = useState("");
  const [deliveryUploading, setDeliveryUploading] = useState(false);
  const [deliveryVaultOpen, setDeliveryVaultOpen] = useState(false);
  const [deliveryVaultLoading, setDeliveryVaultLoading] = useState(false);
  const [deliveryVaultLoadingMore, setDeliveryVaultLoadingMore] = useState(false);
  const [deliveryVaultHasMore, setDeliveryVaultHasMore] = useState(false);
  const [deliveryVaultItems, setDeliveryVaultItems] = useState<VaultItem[]>([]);
  const deliveryVaultCursorRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const deliveryVaultOrderSupportedRef = useRef(true);
  const deliveryVaultGateRef = useRef({ hasMore: false, loadingMore: false, loading: false });
  deliveryVaultGateRef.current.hasMore = deliveryVaultHasMore;
  deliveryVaultGateRef.current.loadingMore = deliveryVaultLoadingMore;
  deliveryVaultGateRef.current.loading = deliveryVaultLoading;
  const [purchaseVideoSession, setPurchaseVideoSession] = useState<{ sessionId: string } | null>(null);
  const [startingVideoFromOrderId, setStartingVideoFromOrderId] = useState<string | null>(null);
  const [deliveryRecordingVoice, setDeliveryRecordingVoice] = useState(false);
  const [deliveryRecordingVideo, setDeliveryRecordingVideo] = useState(false);
  const [deliveryVideoStream, setDeliveryVideoStream] = useState<MediaStream | null>(null);
  const deliveryAudioRecorderRef = useRef<MediaRecorder | null>(null);
  const deliveryVideoRecorderRef = useRef<MediaRecorder | null>(null);
  const deliveryAudioChunksRef = useRef<Blob[]>([]);
  const deliveryVideoChunksRef = useRef<Blob[]>([]);
  const deliveryVideoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const deliveryFileInputRef = useRef<HTMLInputElement | null>(null);
  const purchasesRef = useRef<Purchase[]>(purchases);
  /**
   * 3-2-1 countdown before starting MediaRecorder.
   * Camera/mic are opened **on button click** (same user gesture) and held in arm refs so Safari/iOS still allows access after the delay.
   */
  const [deliveryRecordArm, setDeliveryRecordArm] = useState<{
    mode: "audio" | "video";
    remaining: number;
    purchaseId: string;
  } | null>(null);
  const deliveryAudioArmStreamRef = useRef<MediaStream | null>(null);
  const deliveryVideoArmStreamRef = useRef<MediaStream | null>(null);
  const [recordingElapsedSec, setRecordingElapsedSec] = useState(0);

  const stopDeliveryArmStreams = useCallback(() => {
    deliveryAudioArmStreamRef.current?.getTracks().forEach((t) => t.stop());
    deliveryAudioArmStreamRef.current = null;
    deliveryVideoArmStreamRef.current?.getTracks().forEach((t) => t.stop());
    deliveryVideoArmStreamRef.current = null;
  }, []);

  /** Prevents overlapping getUserMedia calls if the user double-clicks Record. */
  const deliveryArmOpeningRef = useRef(false);
  /** Recorded blob + object URL — listen/watch before “Upload & attach for delivery”. */
  const [deliveryPendingMedia, setDeliveryPendingMedia] = useState<{
    kind: "audio" | "video";
    blob: Blob;
    previewUrl: string;
  } | null>(null);
  const deliveryPendingUnmountRef = useRef<typeof deliveryPendingMedia>(null);
  const deliveryPendingLatestRef = useRef<typeof deliveryPendingMedia>(null);
  const hiddenStorageKey = user?.id ? `fanhub_hidden_purchases_${user.id}` : null;
  const hubTheme = useCreatorFanHubTheme(user?.id);

  const purchasesHelpChrome = useMemo(() => {
    const p = hubTheme.primary;
    const a = hubTheme.accentHover || p;
    const borderBase = hubTheme.border || "#e5e7eb";
    const dark =
      typeof document !== "undefined" && document.documentElement.classList.contains("dark");
    return {
      dialogBorder: dark ? `color-mix(in srgb, ${p} 32%, #374151)` : `color-mix(in srgb, ${p} 22%, ${borderBase})`,
      headerBorderBottom: dark ? `color-mix(in srgb, ${p} 28%, #374151)` : `color-mix(in srgb, ${p} 18%, ${borderBase})`,
      headerBg: dark
        ? `linear-gradient(to right, color-mix(in srgb, ${p} 14%, rgb(31 41 55)), rgb(31 41 55))`
        : `linear-gradient(to right, color-mix(in srgb, ${p} 10%, #ffffff), #ffffff)`,
      iconBg: `color-mix(in srgb, ${p} 14%, transparent)`,
      iconColor: p,
      accentText: p,
      btnBg: `linear-gradient(to right, ${p}, ${a})`,
    };
  }, [hubTheme, showPurchasesHelpModal]);

  const creatorPurchasesCompactKey = useMemo(
    () => (user?.id ? `fanhubCreatorPurchasesCompact:${user.id}` : null),
    [user?.id],
  );
  const [creatorPurchasesListCompact, setCreatorPurchasesListCompact] = useState(false);
  const setCreatorPurchasesListCompactPersisted = useCallback(
    (compact: boolean) => {
      setCreatorPurchasesListCompact(compact);
      if (!creatorPurchasesCompactKey || typeof window === "undefined") return;
      try {
        if (compact) window.localStorage.setItem(creatorPurchasesCompactKey, "1");
        else window.localStorage.removeItem(creatorPurchasesCompactKey);
      } catch {
        /* ignore */
      }
    },
    [creatorPurchasesCompactKey],
  );
  useEffect(() => {
    if (!creatorPurchasesCompactKey || typeof window === "undefined") return;
    try {
      setCreatorPurchasesListCompact(window.localStorage.getItem(creatorPurchasesCompactKey) === "1");
    } catch {
      setCreatorPurchasesListCompact(false);
    }
  }, [creatorPurchasesCompactKey]);

  useEffect(() => {
    purchasesRef.current = purchases;
  }, [purchases]);

  const discardPendingDeliveryMedia = useCallback(() => {
    setDeliveryPendingMedia((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    deliveryPendingLatestRef.current = null;
  }, []);
  useEffect(() => {
    deliveryPendingUnmountRef.current = deliveryPendingMedia;
    deliveryPendingLatestRef.current = deliveryPendingMedia;
  }, [deliveryPendingMedia]);
  useEffect(() => {
    return () => {
      const p = deliveryPendingUnmountRef.current;
      if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl);
    };
  }, []);

  useEffect(() => {
    if (!hiddenStorageKey || typeof window === "undefined") {
      setHiddenPurchaseIds(new Set());
      return;
    }
    try {
      const raw = window.localStorage.getItem(hiddenStorageKey);
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      setHiddenPurchaseIds(new Set(Array.isArray(parsed) ? parsed : []));
    } catch {
      setHiddenPurchaseIds(new Set());
    }
  }, [hiddenStorageKey]);

  useEffect(() => {
    if (!hiddenStorageKey || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(hiddenStorageKey, JSON.stringify(Array.from(hiddenPurchaseIds)));
    } catch {
      // ignore storage failures
    }
  }, [hiddenStorageKey, hiddenPurchaseIds]);

  const fetchPurchases = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch("/api/creatorOrders?limit=200", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data.orders) ? data.orders : [];
        const fanUsernameByEmail = new Map<string, string>();
        const fanNameByEmail = new Map<string, string>();
        try {
          const fansSnap = await getDocs(collection(db, "creators", user.id, "fans"));
          fansSnap.forEach((fanDoc) => {
            const fanData = fanDoc.data() as Record<string, unknown>;
            const email =
              emailFromUnknown(fanData.email) ||
              emailFromUnknown(fanData.fanEmail) ||
              emailFromUnknown(fanDoc.id);
            if (!email) return;
            if (!fanUsernameByEmail.has(email)) {
              const username = usernameFromFanRecord(fanData, email);
              if (username) fanUsernameByEmail.set(email, username);
            }
            if (!fanNameByEmail.has(email)) {
              const fanName = nameFromFanRecord(fanData, email);
              if (fanName) fanNameByEmail.set(email, fanName);
            }
          });
        } catch (fanLookupErr) {
          if (import.meta.env.DEV) console.warn("FanHubPurchases fan username lookup failed", fanLookupErr);
        }
        const realPurchases: Purchase[] = list.map((o: any) => {
          const orderType = typeof o.type === "string" ? o.type : "";
          const normalizedType = orderType.trim().toLowerCase();
          const productKey =
            typeof o.productId === "string" ? o.productId.trim().toLowerCase() : "";
          const isNonDeliverableOrder =
            normalizedType === "tip" ||
            normalizedType === "subscription" ||
            isPostUnlockOrderType(normalizedType) ||
            isPostUnlockOrderType(productKey);
          const fanIdRaw = typeof o.fanId === "string" ? o.fanId.trim() : "";
          const email = o.fanEmail || fanIdRaw || "Unknown";
          const emailKey = emailFromUnknown(email);
          const apiUsername = typeof o.fanUsername === "string" && o.fanUsername.trim() ? o.fanUsername.trim() : null;
          const fanUsername =
            apiUsername && !isEmailDerivedUsername(apiUsername, emailKey)
              ? apiUsername
              : emailKey
                ? fanUsernameByEmail.get(emailKey) || null
                : null;
          return {
            id: o.id,
            email,
            fanMemberId: fanIdRaw && !fanIdRaw.startsWith("guest_") ? fanIdRaw : "",
            fanUsername,
            fanName: o.fanName || (emailKey ? fanNameByEmail.get(emailKey) : null) || null,
            productName: o.productTitle || o.type || "Purchase",
            treatType: o.productId || o.type,
            amountCents: o.amountCents || 0,
            createdAt: new Date(o.createdAt),
            scheduleStatus: isNonDeliverableOrder ? "completed" : ((o.scheduleStatus as ScheduleStatus) || "pending"),
            scheduledDate: o.scheduledDate || null,
            scheduledTime: o.scheduledTime || null,
            deliveryStatus: isNonDeliverableOrder ? "delivered" : (o.deliveryStatus === "delivered" ? "delivered" : "pending"),
            deliveryType:
              o.deliveryType === "video" ||
              o.deliveryType === "image" ||
              o.deliveryType === "audio" ||
              o.deliveryType === "text"
                ? o.deliveryType
                : null,
            deliveryText: typeof o.deliveryText === "string" ? o.deliveryText : null,
            deliveryUrl: typeof o.deliveryUrl === "string" ? o.deliveryUrl : null,
            deliveredAt: o.deliveredAt ? new Date(o.deliveredAt) : null,
            isDemo: false,
            orderType,
          };
        });
        setPurchases(realPurchases);
      } else {
        const errBody = await res.text().catch(() => "");
        showToast?.(`Could not load purchases (${res.status}). Try Refresh.`, "error");
        if (import.meta.env.DEV) console.warn("creatorOrders failed", res.status, errBody);
      }
    } catch (e) {
      showToast?.("Could not load purchases.", "error");
      if (import.meta.env.DEV) console.warn("creatorOrders error", e);
    } finally {
      setLoading(false);
    }
  }, [user?.id, showToast]);

  const loadDeliveryVault = useCallback(
    async (mode: "reset" | "more") => {
      if (!user?.id) return;
      if (mode === "more") {
        const g = deliveryVaultGateRef.current;
        if (!g.hasMore || g.loadingMore || g.loading) return;
        if (!deliveryVaultOrderSupportedRef.current || !deliveryVaultCursorRef.current) return;
      }
      if (mode === "reset") {
        deliveryVaultCursorRef.current = null;
        deliveryVaultOrderSupportedRef.current = true;
      }
      if (mode === "more") setDeliveryVaultLoadingMore(true);
      else setDeliveryVaultLoading(true);
      try {
        const col = collection(db, "users", user.id, "media_library");
        const pageSize = PURCHASES_VAULT_PAGE;
        let snap;
        if (deliveryVaultOrderSupportedRef.current) {
          try {
            const q =
              mode === "more" && deliveryVaultCursorRef.current
                ? query(col, orderBy("uploadedAt", "desc"), startAfter(deliveryVaultCursorRef.current), limit(pageSize))
                : query(col, orderBy("uploadedAt", "desc"), limit(pageSize));
            snap = await getDocs(q);
          } catch {
            if (mode === "more") {
              showToast?.("Could not load more from vault. Close and reopen the picker, then try again.", "error");
              return;
            }
            deliveryVaultOrderSupportedRef.current = false;
            deliveryVaultCursorRef.current = null;
            snap = await getDocs(query(col, limit(pageSize)));
          }
        } else {
          snap = await getDocs(query(col, limit(pageSize)));
        }
        const items: VaultItem[] = [];
        for (const d of snap.docs) {
          const raw = d.data() as Record<string, unknown>;
          if (typeof raw.url !== "string" || !raw.url.trim()) continue;
          const t = inferVaultMediaType(raw, raw.url);
          const ms = vaultUploadedAtMs(raw);
          items.push({
            url: raw.url,
            name: typeof raw.name === "string" && raw.name.trim() ? raw.name : d.id,
            type: t,
            uploadedAt: ms ? new Date(ms).toISOString() : undefined,
          });
        }
        items.sort((a, b) => {
          const ta = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
          const tb = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
          return tb - ta;
        });
        const docs = snap.docs;
        if (deliveryVaultOrderSupportedRef.current && docs.length) {
          deliveryVaultCursorRef.current = docs[docs.length - 1] ?? null;
        } else if (mode === "reset") {
          deliveryVaultCursorRef.current = null;
        }
        setDeliveryVaultHasMore(deliveryVaultOrderSupportedRef.current && docs.length === pageSize);
        setDeliveryVaultItems((prev) => (mode === "reset" ? items : [...prev, ...items]));
      } catch (e) {
        showToast?.(e instanceof Error ? e.message : "Could not load Vault items.", "error");
      } finally {
        if (mode === "more") setDeliveryVaultLoadingMore(false);
        else setDeliveryVaultLoading(false);
      }
    },
    [showToast, user?.id]
  );

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  const openDmWithFan = useCallback(
    (fanMemberId: string) => {
      if (!user?.id || !fanMemberId.trim()) return;
      const threadId = [user.id, fanMemberId.trim()].sort().join("_");
      tabCtx?.openMessagesForThread(threadId);
      showToast?.("Opening Messages…", "success");
    },
    [user?.id, tabCtx, showToast]
  );

  const startVideoFromScheduledOrder = useCallback(
    async (p: Purchase) => {
      if (!user?.id || !p.fanMemberId) {
        showToast?.("This fan must be signed in to start a video call.", "error");
        return;
      }
      setStartingVideoFromOrderId(p.id);
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
        if (!token) throw new Error("Please sign in again.");
        const res = await fetch("/api/liveVideoChat?action=fromOrder", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ orderId: p.id, creatorId: user.id }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; sessionId?: string };
        if (!res.ok) throw new Error(data.error || "Could not start video call");
        if (!data.sessionId) throw new Error("No session returned");
        setPurchaseVideoSession({ sessionId: data.sessionId });
        showToast?.("Video call started — your fan was notified to join.", "success");
      } catch (e) {
        showToast?.(e instanceof Error ? e.message : "Failed to start video call", "error");
      } finally {
        setStartingVideoFromOrderId(null);
      }
    },
    [user?.id, showToast]
  );

  const startEdit = (p: Purchase) => {
    setEditingId(p.id);
    setScheduleDate(p.scheduledDate ?? "");
    setScheduleTime(p.scheduledTime ?? "12:00");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setScheduleDate("");
    setScheduleTime("12:00");
  };

  const upsertTreatCalendarEvent = useCallback(
    async (
      p: Purchase,
      scheduledAt: Date,
      status: "scheduled" | "delivered",
      reminderTime: string,
      delivery?: { type?: "video" | "image" | "audio" | "text"; url?: string | null; text?: string | null }
    ): Promise<boolean> => {
      if (p.isDemo || !db || !user?.id) return true;
      try {
        const treatTypeMap: Record<string, "video_call" | "chat_session" | "voice_note" | "custom_video" | "other"> = {
          live_video_5m: "video_call",
          live_video_10m: "video_call",
          live_video_15m: "video_call",
          live_video_30m: "video_call",
          live_video_45m: "video_call",
          live_video_60m: "video_call",
          live_chat_5m: "chat_session",
          live_chat_15m: "chat_session",
          live_chat_30m: "chat_session",
          live_chat_45m: "chat_session",
          live_chat_60m: "chat_session",
          live_chat_1h: "chat_session",
          chat_session: "chat_session",
          voice_note_30s: "voice_note",
          voice_note_60s: "voice_note",
          custom_video_reply: "custom_video",
          private_video_reply: "custom_video",
        };
        const durationMatch = p.treatType?.match(/(\d+)m$/);
        const durationMinutes = durationMatch ? parseInt(durationMatch[1], 10) : undefined;
        const calendarTreatType = treatTypeMap[p.treatType] || "other";
        const titlePrefix =
          status === "delivered"
            ? "✅ Delivered"
            : calendarTreatType === "video_call"
              ? "📹 Video Call"
              : calendarTreatType === "chat_session"
                ? "💬 Chat Session"
                : "🎁 Store";
        const fanLabel = purchaseFanLabel(p);
        const payload: Record<string, unknown> = {
          title: `${titlePrefix}: ${fanLabel}`,
          date: scheduledAt.toISOString(),
          reminderType: "treat",
          contentType: "custom",
          description: `${p.productName} for ${fanLabel}`,
          reminderTime,
          userId: user.id,
          treatPurchaseId: p.id,
          treatType: calendarTreatType,
          treatStatus: status,
          fanId: p.email,
          fanName: fanLabel,
          fanEmail: p.email,
          fanMemberUid: p.fanMemberId || null,
          deliveryType: delivery?.type || null,
          deliveryUrl: delivery?.url || null,
          deliveryText: delivery?.text || null,
          updatedAt: new Date().toISOString(),
        };
        if (typeof durationMinutes === "number" && Number.isFinite(durationMinutes)) {
          payload.treatDurationMinutes = durationMinutes;
        }
        const eventsRef = collection(db, "users", user.id, "onlyfans_calendar_events");
        const existingSnap = await getDocs(query(eventsRef, where("treatPurchaseId", "==", p.id), limit(1)));
        if (!existingSnap.empty) {
          await setDoc(doc(db, "users", user.id, "onlyfans_calendar_events", existingSnap.docs[0].id), payload, { merge: true });
        } else {
          await addDoc(eventsRef, { ...payload, createdAt: new Date().toISOString() });
        }
        return true;
      } catch (err) {
        console.error("Failed to sync treat calendar event:", err);
        return false;
      }
    },
    [user?.id]
  );

  const handleSchedule = async (p: Purchase) => {
    if (!scheduleDate.trim()) {
      showToast?.("Please pick a date.", "error");
      return;
    }
    setSavingId(p.id);

    // Parse time
    const [h, min] = scheduleTime.split(":").map(Number);
    const timeHHmm = `${String(h ?? 0).padStart(2, "0")}:${String(min ?? 0).padStart(2, "0")}`;
    const scheduledAt = new Date(scheduleDate);
    scheduledAt.setHours(h ?? 0, min ?? 0, 0, 0);

    if (!p.isDemo) {
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
        const scheduleRes = await fetch("/api/updateCreatorOrderSchedule", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            orderId: p.id,
            scheduleStatus: "scheduled",
            scheduledDate: scheduleDate.trim(),
            scheduledTime: timeHHmm,
            scheduledStartIso: scheduledAt.toISOString(),
          }),
        });
        if (!scheduleRes.ok) {
          const j = (await scheduleRes.json().catch(() => ({}))) as { error?: string };
          showToast?.(j.error || "Could not save schedule", "error");
          setSavingId(null);
          return;
        }
      } catch {
        showToast?.("Could not save schedule.", "error");
        setSavingId(null);
        return;
      }
    }

    setPurchases((prev) =>
      prev.map((purchase) =>
        purchase.id === p.id
          ? {
              ...purchase,
              scheduleStatus: "scheduled" as ScheduleStatus,
              scheduledDate: scheduleDate.trim(),
              scheduledTime: timeHHmm,
            }
          : purchase
      )
    );

    const calendarSynced = await upsertTreatCalendarEvent(p, scheduledAt, "scheduled", timeHHmm);

    setEditingId(null);
    setScheduleDate("");
    setScheduleTime("12:00");
    setSavingId(null);
    showToast?.(
      calendarSynced ? "Scheduled and synced to calendar." : "Schedule saved, but calendar sync failed.",
      calendarSynced ? "success" : "error"
    );
  };

  const markCompleted = async (p: Purchase) => {
    if (!p.isDemo) {
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
        const scheduleRes = await fetch("/api/updateCreatorOrderSchedule", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            orderId: p.id,
            scheduleStatus: "completed",
          }),
        });
        if (!scheduleRes.ok) {
          showToast?.("Could not update order.", "error");
          return;
        }
      } catch {
        showToast?.("Could not update order.", "error");
        return;
      }
    }
    setPurchases((prev) =>
      prev.map((purchase) =>
        purchase.id === p.id
          ? { ...purchase, scheduleStatus: "completed" as ScheduleStatus }
          : purchase
      )
    );
    showToast?.("Marked as completed.", "success");
  };

  const openDeliveryEditor = (p: Purchase) => {
    discardPendingDeliveryMedia();
    stopDeliveryArmStreams();
    setDeliveryVideoStream(null);
    setDeliveryRecordArm(null);
    setDeliveryEditingId(p.id);
    setDeliveryTypeDraft(p.deliveryType || "text");
    setDeliveryTextDraft(p.deliveryText || "");
    setDeliveryUrlDraft(p.deliveryUrl || "");
  };

  const cancelDeliveryEditor = () => {
    stopMediaRecorderSafe(deliveryAudioRecorderRef.current);
    stopMediaRecorderSafe(deliveryVideoRecorderRef.current);
    stopDeliveryArmStreams();
    deliveryVideoStream?.getTracks().forEach((t) => t.stop());
    deliveryAudioRecorderRef.current = null;
    deliveryVideoRecorderRef.current = null;
    deliveryAudioChunksRef.current = [];
    deliveryVideoChunksRef.current = [];
    setDeliveryVideoStream(null);
    setDeliveryRecordingVoice(false);
    setDeliveryRecordingVideo(false);
    setDeliveryRecordArm(null);
    setDeliveryEditingId(null);
    setDeliveryTypeDraft("text");
    setDeliveryTextDraft("");
    setDeliveryUrlDraft("");
    setDeliveryUploading(false);
    setDeliveryVaultOpen(false);
    setDeliveryVaultItems([]);
    setDeliveryVaultLoading(false);
    discardPendingDeliveryMedia();
  };

  const handleUploadDeliveryMedia = async (
    p: Purchase,
    file: File,
    opts?: { deliveryType?: "video" | "image" | "audio" | "text" }
  ) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      showToast?.("You need to be signed in to upload delivery media.", "error");
      return;
    }
    const inferred = inferDeliveryTypeFromFile(file);
    const draftType = opts?.deliveryType ?? deliveryTypeDraft;
    setDeliveryUploading(true);
    try {
      const ext = (
        file.name.split(".").pop() ||
        (file.type.includes("audio") ? "m4a" : file.type.includes("image") ? "jpg" : "mp4")
      ).toLowerCase();
      const path = `users/${uid}/orderDeliveries/${p.id}/${Date.now()}.${ext}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file, {
        contentType:
          file.type ||
          (draftType === "audio"
            ? "audio/mpeg"
            : draftType === "image"
              ? "image/jpeg"
              : "video/mp4"),
      });
      const url = await getDownloadURL(storageRef);
      const nextType = inferred || draftType;
      if (nextType === "video" || nextType === "image" || nextType === "audio") {
        setDeliveryTypeDraft(nextType);
      }
      setDeliveryUrlDraft(url);
      showToast?.("Delivery media uploaded.", "success");
    } catch (e) {
      setDeliveryUrlDraft("");
      showToast?.(e instanceof Error ? e.message : "Could not upload delivery media.", "error");
    } finally {
      setDeliveryUploading(false);
    }
  };

  const commitPendingDeliveryMediaUpload = async (p: Purchase) => {
    const pending = deliveryPendingLatestRef.current;
    if (!pending) return;
    const { kind, blob, previewUrl } = pending;
    URL.revokeObjectURL(previewUrl);
    deliveryPendingLatestRef.current = null;
    setDeliveryPendingMedia(null);
    const rawType =
      blob.type || (kind === "audio" ? "audio/webm" : "video/webm");
    const audioType =
      kind === "audio" ? normalizeVoiceRecordingFileType(rawType) : rawType;
    const ext =
      kind === "audio" ? fileExtensionForAudioMime(audioType) : fileExtensionForVideoMime(rawType);
    const file = new File([blob], `${kind}-delivery-${Date.now()}.${ext}`, {
      type: kind === "audio" ? audioType : rawType,
    });
    await handleUploadDeliveryMedia(p, file, {
      deliveryType: kind === "audio" ? "audio" : "video",
    });
  };

  const runDeliveryVoiceRecordingFromStream = async (p: Purchase, stream: MediaStream) => {
    if (!auth.currentUser?.uid || deliveryRecordingVoice || deliveryUploading) {
      stream.getTracks().forEach((t) => t.stop());
      deliveryAudioArmStreamRef.current = null;
      if (deliveryUploading) showToast?.("Wait for the upload to finish, then try again.", "error");
      return;
    }
    try {
      const rec = createAudioMediaRecorder(stream);
      deliveryAudioRecorderRef.current = rec;
      deliveryAudioChunksRef.current = [];
      const requestedMime = rec.mimeType || undefined;
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) deliveryAudioChunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        deliveryAudioArmStreamRef.current = null;
        setDeliveryRecordingVoice(false);
        const chunks = deliveryAudioChunksRef.current;
        deliveryAudioChunksRef.current = [];
        if (!chunks.length) return;
        const blobType = normalizeVoiceRecordingFileType(effectiveBlobType(rec, requestedMime));
        const blob = new Blob(chunks, { type: blobType });
        if (blob.size < 256) return;
        setDeliveryPendingMedia((prev) => {
          if (prev) URL.revokeObjectURL(prev.previewUrl);
          const next = {
            kind: "audio" as const,
            blob,
            previewUrl: URL.createObjectURL(blob),
          };
          deliveryPendingLatestRef.current = next;
          return next;
        });
      };
      rec.start(AUDIO_RECORDER_TIMESLICE_MS);
      setDeliveryRecordingVoice(true);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      deliveryAudioArmStreamRef.current = null;
      showToast?.("Could not start voice recording. Check microphone permissions.", "error");
    }
  };

  const stopDeliveryVoiceRecording = () => {
    stopMediaRecorderSafe(deliveryAudioRecorderRef.current);
    deliveryAudioRecorderRef.current = null;
  };

  const runDeliveryVideoRecordingFromStream = async (p: Purchase, stream: MediaStream) => {
    if (!auth.currentUser?.uid || deliveryRecordingVideo || deliveryUploading) {
      stream.getTracks().forEach((t) => t.stop());
      deliveryVideoArmStreamRef.current = null;
      setDeliveryVideoStream(null);
      if (deliveryUploading) showToast?.("Wait for the upload to finish, then try again.", "error");
      return;
    }
    try {
      await waitUntilVideoTrackLive(stream);
      setDeliveryVideoStream(stream);
      const rec = createVideoMediaRecorder(stream);
      deliveryVideoRecorderRef.current = rec;
      deliveryVideoChunksRef.current = [];
      const requestedMime = rec.mimeType || undefined;
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) deliveryVideoChunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        deliveryVideoArmStreamRef.current = null;
        setDeliveryVideoStream(null);
        setDeliveryRecordingVideo(false);
        const chunks = deliveryVideoChunksRef.current;
        deliveryVideoChunksRef.current = [];
        if (!chunks.length) return;
        const blobType = effectiveBlobType(rec, requestedMime);
        const blob = new Blob(chunks, { type: blobType });
        if (blob.size < 512) return;
        setDeliveryPendingMedia((prev) => {
          if (prev) URL.revokeObjectURL(prev.previewUrl);
          const next = {
            kind: "video" as const,
            blob,
            previewUrl: URL.createObjectURL(blob),
          };
          deliveryPendingLatestRef.current = next;
          return next;
        });
      };
      rec.start(VIDEO_RECORDER_TIMESLICE_MS);
      setDeliveryRecordingVideo(true);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      deliveryVideoArmStreamRef.current = null;
      setDeliveryVideoStream(null);
      showToast?.("Could not start camera recording. Check camera/mic permissions.", "error");
    }
  };

  useEffect(() => {
    if (!deliveryRecordArm) return;
    if (deliveryRecordArm.remaining === 0) {
      const mode = deliveryRecordArm.mode;
      const purchaseId = deliveryRecordArm.purchaseId;
      setDeliveryRecordArm(null);
      const row = purchasesRef.current.find((x) => x.id === purchaseId);
      if (!row) {
        showToast?.("Could not find this order. Refresh purchases and try again.", "error");
        stopDeliveryArmStreams();
        setDeliveryVideoStream(null);
        return;
      }
      if (mode === "audio") {
        const stream = deliveryAudioArmStreamRef.current;
        if (!stream || !stream.getAudioTracks().some((t) => t.readyState === "live")) {
          showToast?.("Microphone was closed. Tap Record voice again.", "error");
          stopDeliveryArmStreams();
          return;
        }
        void runDeliveryVoiceRecordingFromStream(row, stream);
      } else {
        const stream = deliveryVideoArmStreamRef.current;
        if (!stream || !stream.getVideoTracks().some((t) => t.readyState === "live")) {
          showToast?.("Camera was closed. Tap Record video again.", "error");
          stopDeliveryArmStreams();
          setDeliveryVideoStream(null);
          return;
        }
        void runDeliveryVideoRecordingFromStream(row, stream);
      }
      return;
    }
    const id = window.setTimeout(() => {
      setDeliveryRecordArm((a) => (a ? { ...a, remaining: a.remaining - 1 } : null));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [deliveryRecordArm, stopDeliveryArmStreams]);

  const toggleDeliveryVoiceRecording = (p: Purchase) => {
    if (deliveryRecordingVoice) {
      stopDeliveryVoiceRecording();
      return;
    }
    if (deliveryRecordArm) {
      if (deliveryRecordArm.mode === "audio") stopDeliveryArmStreams();
      setDeliveryRecordArm(null);
      return;
    }
    if (!auth.currentUser?.uid || deliveryUploading) {
      showToast?.("You need to be signed in to record.", "error");
      return;
    }
    if (deliveryEditingId !== p.id) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast?.("Microphone is not available in this browser.", "error");
      return;
    }
    if (deliveryArmOpeningRef.current) return;
    discardPendingDeliveryMedia();
    deliveryArmOpeningRef.current = true;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        deliveryAudioArmStreamRef.current = stream;
        setDeliveryRecordArm({ mode: "audio", remaining: 3, purchaseId: p.id });
      } catch {
        showToast?.("Could not open microphone. Check permissions.", "error");
      } finally {
        deliveryArmOpeningRef.current = false;
      }
    })();
  };

  const toggleDeliveryVideoRecording = (p: Purchase) => {
    if (deliveryRecordingVideo) {
      stopDeliveryVideoRecording();
      return;
    }
    if (deliveryRecordArm) {
      if (deliveryRecordArm.mode === "video") {
        stopDeliveryArmStreams();
        setDeliveryVideoStream(null);
      }
      setDeliveryRecordArm(null);
      return;
    }
    if (!auth.currentUser?.uid || deliveryUploading) {
      showToast?.("You need to be signed in to record.", "error");
      return;
    }
    if (deliveryEditingId !== p.id) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast?.("Camera is not available in this browser.", "error");
      return;
    }
    if (deliveryArmOpeningRef.current) return;
    discardPendingDeliveryMedia();
    deliveryArmOpeningRef.current = true;
    void (async () => {
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" },
            audio: true,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        }
        deliveryVideoArmStreamRef.current = stream;
        setDeliveryVideoStream(stream);
        if (deliveryTypeDraft !== "video") setDeliveryTypeDraft("video");
        setDeliveryRecordArm({ mode: "video", remaining: 3, purchaseId: p.id });
      } catch {
        deliveryVideoArmStreamRef.current = null;
        setDeliveryVideoStream(null);
        showToast?.("Could not open camera. Check permissions.", "error");
      } finally {
        deliveryArmOpeningRef.current = false;
      }
    })();
  };

  const stopDeliveryVideoRecording = () => {
    stopMediaRecorderSafe(deliveryVideoRecorderRef.current);
    deliveryVideoRecorderRef.current = null;
  };

  useEffect(() => {
    if (!deliveryRecordingVoice && !deliveryRecordingVideo) {
      setRecordingElapsedSec(0);
      return;
    }
    setRecordingElapsedSec(0);
    const id = window.setInterval(() => {
      setRecordingElapsedSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [deliveryRecordingVoice, deliveryRecordingVideo]);

  useEffect(() => {
    const el = deliveryVideoPreviewRef.current;
    if (!el) return;
    if (deliveryVideoStream) {
      el.srcObject = deliveryVideoStream;
      el.muted = true;
      void el.play().catch(() => {});
      return;
    }
    el.srcObject = null;
  }, [deliveryVideoStream, deliveryRecordingVideo]);

  useEffect(() => {
    return () => {
      stopMediaRecorderSafe(deliveryAudioRecorderRef.current);
      stopMediaRecorderSafe(deliveryVideoRecorderRef.current);
      deliveryVideoStream?.getTracks().forEach((t) => t.stop());
    };
  }, [deliveryVideoStream]);

  const saveDelivery = async (p: Purchase) => {
    const nextType = deliveryTypeDraft;
    const nextText = deliveryTextDraft.trim();
    const nextUrl = String(deliveryUrlDraft ?? "").trim();
    if (deliveryPendingMedia) {
      showToast?.('Preview your recording, then tap "Upload & attach for delivery", or discard it.', "error");
      return;
    }
    if ((nextType === "video" || nextType === "image" || nextType === "audio") && !nextUrl) {
      showToast?.("Upload, record, or select media from Vault before saving delivery.", "error");
      return;
    }
    if (nextType === "text" && !nextText) {
      showToast?.("Please add delivery text.", "error");
      return;
    }
    setSavingId(p.id);
    try {
      const deliveredNow = new Date();
      const deliveredSchedule = toLocalScheduleParts(deliveredNow);
      const nextScheduleStatus: ScheduleStatus = p.scheduleStatus === "completed" ? "completed" : "scheduled";
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch("/api/updateCreatorOrderSchedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          orderId: p.id,
          deliveryStatus: "delivered",
          deliveryType: nextType,
          deliveryText: nextType === "text" ? nextText : null,
          deliveryUrl: nextType === "text" ? null : nextUrl,
          scheduleStatus: nextScheduleStatus,
          scheduledDate: deliveredSchedule.date,
          scheduledTime: deliveredSchedule.time,
        }),
      });
      const payload = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) {
        showToast?.(payload.error || "Could not save delivery.", "error");
        return;
      }
      setPurchases((prev) =>
        prev.map((x) =>
          x.id === p.id
            ? {
                ...x,
                deliveryStatus: "delivered",
                deliveryType: nextType,
                deliveryText: nextType === "text" ? nextText : null,
                deliveryUrl: nextType === "text" ? null : nextUrl,
                deliveredAt: deliveredNow,
                scheduleStatus: nextScheduleStatus,
                scheduledDate: deliveredSchedule.date,
                scheduledTime: deliveredSchedule.time,
              }
            : x
        )
      );
      const calendarSynced = await upsertTreatCalendarEvent(p, deliveredNow, "delivered", deliveredSchedule.time, {
        type: nextType,
        url: nextType === "text" ? null : nextUrl,
        text: nextType === "text" ? nextText : null,
      });
      showToast?.(
        calendarSynced ? "Delivered and synced to calendar." : "Delivery saved, but calendar sync failed.",
        calendarSynced ? "success" : "error"
      );
      cancelDeliveryEditor();
    } catch (e) {
      showToast?.(e instanceof Error ? e.message : "Could not save delivery.", "error");
    } finally {
      setSavingId(null);
    }
  };

  const hidePurchase = useCallback((purchaseId: string) => {
    setHiddenPurchaseIds((prev) => {
      const next = new Set(prev);
      next.add(purchaseId);
      return next;
    });
  }, []);

  const unhidePurchase = useCallback((purchaseId: string) => {
    setHiddenPurchaseIds((prev) => {
      const next = new Set(prev);
      next.delete(purchaseId);
      return next;
    });
  }, []);

  const hideNonActionablePurchases = useCallback(() => {
    const targetIds = purchases
      .filter((p) => {
        const tipPurchase = isTipPurchase(p);
        const subscriptionPurchase = isSubscriptionPurchase(p);
        const postUnlockPurchase = isPostUnlockPurchase(p);
        const nonDeliverablePurchase = tipPurchase || subscriptionPurchase || postUnlockPurchase;
        const pe = purchaseEffectiveForUi(p);
        return nonDeliverablePurchase || pe.scheduleStatus === "completed" || pe.deliveryStatus === "delivered";
      })
      .map((p) => p.id);
    if (targetIds.length === 0) {
      showToast?.("No completed purchases to hide.", "info");
      return;
    }
    setHiddenPurchaseIds((prev) => {
      const next = new Set(prev);
      targetIds.forEach((id) => next.add(id));
      return next;
    });
    showToast?.(`Hidden ${targetIds.length} purchase${targetIds.length === 1 ? "" : "s"}.`, "success");
  }, [purchases, showToast]);

  const unhideAllPurchases = useCallback(() => {
    setHiddenPurchaseIds(new Set());
    showToast?.("All hidden purchases are visible again.", "success");
  }, [showToast]);

  const purchaseDateRangeCutoffMs = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - purchaseDateRangeDays);
    return d.getTime();
  }, [purchaseDateRangeDays]);

  const purchasesInDateRange = useMemo(
    () => purchases.filter((p) => p.createdAt.getTime() >= purchaseDateRangeCutoffMs),
    [purchases, purchaseDateRangeCutoffMs],
  );

  const filteredPurchases = purchasesInDateRange.filter((p) => {
    if (!showHidden && hiddenPurchaseIds.has(p.id)) return false;
    if (filterStatus === "all") return true;
    if (filterStatus === "tips") return isTipPurchase(p);
    return purchaseEffectiveForUi(p).scheduleStatus === filterStatus;
  });

  const hiddenCount = purchases.filter((p) => hiddenPurchaseIds.has(p.id)).length;
  const pendingCount = purchasesInDateRange.filter(
    (p) => purchaseEffectiveForUi(p).scheduleStatus === "pending",
  ).length;
  const scheduledCount = purchasesInDateRange.filter(
    (p) => purchaseEffectiveForUi(p).scheduleStatus === "scheduled",
  ).length;
  const tipsCount = purchasesInDateRange.filter((p) => isTipPurchase(p)).length;

  if (!user?.id) {
    return (
      <div className="purchases-page">
        <p className="purchases-empty">Sign in to view purchases.</p>
      </div>
    );
  }

  if (purchaseVideoSession) {
    return (
      <VideoCallRoom
        sessionId={purchaseVideoSession.sessionId}
        creatorId={user.id}
        onLeave={() => setPurchaseVideoSession(null)}
        onSessionEnd={() => setPurchaseVideoSession(null)}
      />
    );
  }

  return (
    <div className="purchases-page">
      <header className="purchases-header">
        <div className="purchases-header-copy">
          <h1 className="purchases-title">Purchases</h1>
          <div className="purchases-intro-head">
            <p className="purchases-subtitle-lead">
              Store orders and tips land here. Schedule sessions so they show on your calendar — fans get reminders for
              live video and timed chat when you schedule.
            </p>
            <button
              type="button"
              onClick={() => setShowPurchasesHelpModal(true)}
              className="purchases-how-it-works-btn"
            >
              How it works
            </button>
          </div>
        </div>
        <div className="purchases-header-actions">
          <label htmlFor="fanhub-purchases-date-range" className="purchases-range-label">
            Period
          </label>
          <select
            id="fanhub-purchases-date-range"
            className="purchases-range-select"
            value={purchaseDateRangeDays}
            onChange={(e) => setPurchaseDateRangeDays(Number(e.target.value) as 7 | 30 | 90)}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            type="button"
            onClick={() => hideNonActionablePurchases()}
            className="purchases-btn purchases-btn-secondary"
          >
            Hide completed
          </button>
          {hiddenCount > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowHidden((v) => !v)}
                className="purchases-btn purchases-btn-secondary"
              >
                {showHidden ? `Hide hidden (${hiddenCount})` : `Show hidden (${hiddenCount})`}
              </button>
              <button
                type="button"
                onClick={() => unhideAllPurchases()}
                className="purchases-btn purchases-btn-secondary"
              >
                Unhide all
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => fetchPurchases()}
            disabled={loading}
            className="purchases-btn purchases-btn-secondary"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </header>

      {showPurchasesHelpModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() => setShowPurchasesHelpModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="fanhub-purchases-help-title"
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[min(85vh,34rem)] flex flex-col border"
            style={{ borderColor: purchasesHelpChrome.dialogBorder }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-start justify-between gap-3 p-4 border-b"
              style={{
                borderBottomColor: purchasesHelpChrome.headerBorderBottom,
                background: purchasesHelpChrome.headerBg,
              }}
            >
              <div className="flex items-start gap-3 min-w-0">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                  style={{
                    backgroundColor: purchasesHelpChrome.iconBg,
                    color: purchasesHelpChrome.iconColor,
                  }}
                >
                  <PurchasesHelpIcon />
                </span>
                <div>
                  <h2 id="fanhub-purchases-help-title" className="text-lg font-semibold text-gray-900 dark:text-white">
                    How purchases &amp; scheduling work
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Fan Hub → Purchases
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPurchasesHelpModal(false)}
                className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition shrink-0"
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-4 text-sm text-gray-700 dark:text-gray-300">
              <section>
                <h3
                  className="text-xs font-semibold uppercase tracking-wide mb-1.5"
                  style={{ color: purchasesHelpChrome.accentText }}
                >
                  What appears here
                </h3>
                <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
                  Treats and store orders from your fans show as rows — tips, memberships, unlocks, and session-style
                  products. Use filters to focus on what needs action.
                </p>
              </section>
              <section>
                <h3
                  className="text-xs font-semibold uppercase tracking-wide mb-1.5"
                  style={{ color: purchasesHelpChrome.accentText }}
                >
                  Scheduling &amp; calendar
                </h3>
                <ul className="list-disc list-inside space-y-1 text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
                  <li>
                    Pick a <strong className="text-gray-800 dark:text-gray-200">date and time</strong>, then{" "}
                    <strong className="text-gray-800 dark:text-gray-200">Schedule</strong> — it adds to your{" "}
                    <a
                      href="/calendar"
                      className="font-medium hover:underline"
                      style={{ color: hubTheme.primary }}
                    >
                      calendar
                    </a>
                    .
                  </li>
                </ul>
              </section>
              <section>
                <h3
                  className="text-xs font-semibold uppercase tracking-wide mb-1.5"
                  style={{ color: purchasesHelpChrome.accentText }}
                >
                  When fans get notified
                </h3>
                <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
                  Fans are notified when you schedule a <strong className="text-gray-800 dark:text-gray-200">live video call</strong>{" "}
                  or <strong className="text-gray-800 dark:text-gray-200">timed chat session</strong> — so you can meet at the
                  same time. They also get a reminder about <strong className="text-gray-800 dark:text-gray-200">5 minutes before</strong>{" "}
                  start.
                </p>
              </section>
              <section>
                <h3
                  className="text-xs font-semibold uppercase tracking-wide mb-1.5"
                  style={{ color: purchasesHelpChrome.accentText }}
                >
                  At session time
                </h3>
                <ul className="list-disc list-inside space-y-1 text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
                  <li>
                    <strong className="text-gray-800 dark:text-gray-200">Video calls:</strong> use{" "}
                    <strong className="text-gray-800 dark:text-gray-200">Start video call</strong> on the row (same flow as
                    instant calls).
                  </li>
                  <li>
                    <strong className="text-gray-800 dark:text-gray-200">Chat sessions:</strong> use{" "}
                    <strong className="text-gray-800 dark:text-gray-200">Open messages</strong> to talk in DMs.
                  </li>
                </ul>
              </section>
              <section>
                <h3
                  className="text-xs font-semibold uppercase tracking-wide mb-1.5"
                  style={{ color: purchasesHelpChrome.accentText }}
                >
                  Other treats
                </h3>
                <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
                  Other products stay <strong className="text-gray-800 dark:text-gray-200">calendar-only</strong> for you until
                  you deliver — fans are not pinged on the schedule date alone.
                </p>
              </section>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/80 rounded-b-xl">
              <button
                type="button"
                onClick={() => setShowPurchasesHelpModal(false)}
                className="px-4 py-2 rounded-lg text-white text-sm font-semibold shadow-sm transition-opacity hover:opacity-90"
                style={{ background: purchasesHelpChrome.btnBg }}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Bar */}
      <div className="purchases-stats">
        <div className="purchases-stat">
          <span className="purchases-stat-value purchases-stat-pending">{pendingCount}</span>
          <span className="purchases-stat-label">Needs scheduling</span>
        </div>
        <div className="purchases-stat">
          <span className="purchases-stat-value purchases-stat-scheduled">{scheduledCount}</span>
          <span className="purchases-stat-label">Scheduled</span>
        </div>
        <div className="purchases-stat">
          <span className="purchases-stat-value">{purchasesInDateRange.length}</span>
          <span className="purchases-stat-label">{`Purchases (${purchaseDateRangeDays}d)`}</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="purchases-filters">
        {(["all", "pending", "scheduled", "completed", "tips"] as const).map((status) => (
          <button
            key={status}
            type="button"
            className={`purchases-filter-btn ${filterStatus === status ? "active" : ""}`}
            onClick={() => setFilterStatus(status)}
          >
            {status === "all" ? "All" : status === "tips" ? "Tips" : status.charAt(0).toUpperCase() + status.slice(1)}
            {status === "pending" && pendingCount > 0 && (
              <span className="purchases-filter-badge">{pendingCount}</span>
            )}
            {status === "tips" && tipsCount > 0 && (
              <span className="purchases-filter-badge">{tipsCount}</span>
            )}
          </button>
        ))}
      </div>

      {!loading && filteredPurchases.length > 0 ? (
        <div className="purchases-list-toolbar">
          <button
            type="button"
            className="purchases-btn purchases-btn-secondary"
            onClick={() => setCreatorPurchasesListCompactPersisted(!creatorPurchasesListCompact)}
          >
            {creatorPurchasesListCompact ? "Expand cards" : "Minimize list"}
          </button>
        </div>
      ) : null}

      {/* Purchase Cards */}
      <div
        className={
          creatorPurchasesListCompact && filteredPurchases.length > 0
            ? "purchases-list purchases-list--compact"
            : "purchases-list"
        }
      >
        {filteredPurchases.length === 0 ? (
          <p className="purchases-empty">
            {purchases.length === 0
              ? "No purchases yet. When someone buys from your store, it will appear here."
              : purchasesInDateRange.length === 0
                ? `No purchases in the last ${purchaseDateRangeDays} days. Try a longer period or Refresh.`
                : filterStatus === "all"
                  ? hiddenCount > 0 && !showHidden
                    ? "No purchases visible. Items may be hidden — use Show hidden to reveal them."
                    : "Nothing to show right now."
                  : `No ${filterStatus} purchases in this period.`}
          </p>
        ) : (
          filteredPurchases.map((p) => {
            const tipPurchase = isTipPurchase(p);
            const subscriptionPurchase = isSubscriptionPurchase(p);
            const postUnlockPurchase = isPostUnlockPurchase(p);
            const liveStreamTicketPurchase = isLiveStreamTicketPurchase(p);
            const nonDeliverablePurchase = tipPurchase || subscriptionPurchase || postUnlockPurchase;
            /** Live stream tickets + instant digital orders — no calendar / manual delivery controls. */
            const skipManualFulfillment = nonDeliverablePurchase || liveStreamTicketPurchase;
            const eff = purchaseEffectiveForUi(p);
            const isDelivered = eff.deliveryStatus === "delivered";
            const isPending = eff.scheduleStatus === "pending" && !isDelivered;
            const isScheduled = eff.scheduleStatus === "scheduled";
            const isCompleted = eff.scheduleStatus === "completed";
            const isEditing = editingId === p.id;

            const cardClassName = `purchases-card ${isPending ? "purchases-card-pending" : ""} ${isCompleted ? "purchases-card-completed" : ""} ${isDelivered ? "purchases-card-delivered" : ""}`;
            const cardBody = (
              <>
                <div className="purchases-card-header">
                  <div className="purchases-card-info">
                    <p className="purchases-card-product">{p.productName}</p>
                    <p className="purchases-card-meta">
                      {(() => {
                        const fanLabel = purchaseFanLabel(p);
                        const shouldShowEmail =
                          !!p.email && p.email.includes("@") && fanLabel.toLowerCase() !== p.email.toLowerCase();
                        return (
                          <span>
                            {fanLabel}
                            {shouldShowEmail && (
                              <span className="purchases-card-meta-email"> · {p.email}</span>
                            )}
                          </span>
                        );
                      })()}
                      <span className="purchases-card-amount">{formatAmount(p.amountCents)}</span>
                    </p>
                    <p className="purchases-card-date">
                      Purchased {formatDateShort(p.createdAt)}
                      {p.isDemo && <span className="purchases-demo-badge">Demo</span>}
                    </p>
                  </div>
                  <div className="purchases-card-status">
                    {isPending && (
                      <span className="purchases-status-badge purchases-status-pending">
                        Needs scheduling
                      </span>
                    )}
                    {tipPurchase && (
                      <span className="purchases-status-badge purchases-status-completed">
                        Tip received
                      </span>
                    )}
                    {subscriptionPurchase && (
                      <span className="purchases-status-badge purchases-status-completed">
                        Subscription payment
                      </span>
                    )}
                    {postUnlockPurchase && (
                      <span className="purchases-status-badge purchases-status-completed">
                        Unlocked in feed
                      </span>
                    )}
                    {liveStreamTicketPurchase && (
                      <span
                        className={`purchases-status-badge ${
                          isDelivered || isCompleted ? "purchases-status-completed" : "purchases-status-scheduled"
                        }`}
                      >
                        {isDelivered || isCompleted ? "Live stream (completed)" : "Live stream ticket"}
                      </span>
                    )}
                    {!nonDeliverablePurchase && (isScheduled || isDelivered) && (p.scheduledDate || p.deliveredAt) && (
                      <div className="purchases-scheduled-info">
                        {!isDelivered ? (
                          <span className="purchases-status-badge purchases-status-scheduled">Scheduled</span>
                        ) : null}
                        <p className="purchases-scheduled-datetime">
                          {isDelivered ? "Delivered" : "Scheduled"}{" "}
                          {formatScheduleDate(p.scheduledDate || (p.deliveredAt ? toLocalScheduleParts(p.deliveredAt).date : null))} at{" "}
                          {formatTime12h(p.scheduledTime || (p.deliveredAt ? toLocalScheduleParts(p.deliveredAt).time : null))}
                        </p>
                      </div>
                    )}
                    {!nonDeliverablePurchase && isCompleted && (
                      <span className="purchases-status-badge purchases-status-completed">
                        Completed
                      </span>
                    )}
                    {!nonDeliverablePurchase && isDelivered && (
                      <span className="purchases-status-badge purchases-status-delivered">
                        Delivered
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="purchases-card-actions">
                  <button
                    type="button"
                    className="purchases-btn purchases-btn-secondary"
                    onClick={() => (hiddenPurchaseIds.has(p.id) ? unhidePurchase(p.id) : hidePurchase(p.id))}
                  >
                    {hiddenPurchaseIds.has(p.id) ? "Unhide" : "Hide"}
                  </button>
                  {!skipManualFulfillment && !isEditing && !isCompleted && (
                    <>
                      {isScheduled && (
                        <>
                          <button
                            type="button"
                            className="purchases-btn purchases-btn-secondary"
                            onClick={() => startEdit(p)}
                          >
                            Edit
                          </button>
                          {isJointLiveSessionProductId(p.treatType) && p.fanMemberId && (
                            <>
                              {jointSessionKindFromProductId(p.treatType) === "video_call" && (
                                <button
                                  type="button"
                                  className="purchases-btn purchases-btn-primary"
                                  disabled={startingVideoFromOrderId === p.id}
                                  onClick={() => void startVideoFromScheduledOrder(p)}
                                >
                                  {startingVideoFromOrderId === p.id ? "Starting…" : "Start video call"}
                                </button>
                              )}
                              {jointSessionKindFromProductId(p.treatType) === "chat_session" && (
                                <button
                                  type="button"
                                  className="purchases-btn purchases-btn-primary"
                                  onClick={() => openDmWithFan(p.fanMemberId)}
                                >
                                  Open messages
                                </button>
                              )}
                            </>
                          )}
                          <button
                            type="button"
                            className="purchases-btn purchases-btn-success"
                            onClick={() => markCompleted(p)}
                          >
                            Mark Complete
                          </button>
                        </>
                      )}
                      {isPending && (
                        <button
                          type="button"
                          className="purchases-btn purchases-btn-primary"
                          onClick={() => startEdit(p)}
                        >
                          Schedule
                        </button>
                      )}
                    </>
                  )}
                  {!skipManualFulfillment && !isEditing && (
                    <button
                      type="button"
                      className="purchases-btn purchases-btn-primary"
                      onClick={() => openDeliveryEditor(p)}
                    >
                      {p.deliveryStatus === "delivered" ? "Update Delivery" : "Deliver Purchase"}
                    </button>
                  )}
                </div>

                {/* Schedule Form */}
                {(isPending || isEditing) && isEditing && (
                  <div className="purchases-schedule-form">
                    <div className="purchases-schedule-row">
                      <label className="purchases-schedule-label">
                        <span>Date</span>
                        <input
                          type="date"
                          value={scheduleDate}
                          onChange={(e) => setScheduleDate(e.target.value)}
                          className="purchases-schedule-input"
                        />
                      </label>
                      <label className="purchases-schedule-label">
                        <span>Time</span>
                        <input
                          type="time"
                          value={scheduleTime}
                          onChange={(e) => setScheduleTime(e.target.value)}
                          className="purchases-schedule-input"
                        />
                      </label>
                      <button
                        type="button"
                        className="purchases-btn purchases-btn-primary"
                        disabled={savingId === p.id || !scheduleDate.trim()}
                        onClick={() => handleSchedule(p)}
                      >
                        {savingId === p.id ? "Saving…" : isPending && !p.scheduledDate ? "Schedule" : "Save"}
                      </button>
                      <button
                        type="button"
                        className="purchases-btn purchases-btn-secondary"
                        onClick={cancelEdit}
                      >
                        Cancel
                      </button>
                    </div>
                    <p className="purchases-schedule-hint">
                      {isJointLiveSessionProductId(p.treatType) ? (
                        <>
                          Adds this to your <strong>Calendar</strong>. You and the fan get a notification with the date
                          and time, plus a reminder 5 minutes before start.
                        </>
                      ) : (
                        <>
                          Adds this to your <strong>Calendar</strong> for your planning. The fan is{" "}
                          <strong>not</strong> notified — they will be notified when you deliver the purchase.
                        </>
                      )}
                    </p>
                  </div>
                )}

                {deliveryEditingId === p.id && (
                  <div className="purchases-schedule-form">
                    <div className="purchases-delivery-editor">
                      <div className="purchases-delivery-type-row">
                        <label className="purchases-schedule-label" style={{ minWidth: 200, flex: "1 1 200px" }}>
                          <span>Delivery type</span>
                          <select
                            value={deliveryTypeDraft}
                            onChange={(e) => setDeliveryTypeDraft(e.target.value as "video" | "image" | "audio" | "text")}
                            className="purchases-schedule-input"
                          >
                            <option value="text">Text reply</option>
                            <option value="video">Video reply</option>
                            <option value="image">Image</option>
                            <option value="audio">Voice note</option>
                          </select>
                        </label>
                      </div>

                      {(deliveryTypeDraft === "video" || deliveryTypeDraft === "image" || deliveryTypeDraft === "audio") && (
                        <div className="purchases-delivery-section">
                          <p className="purchases-delivery-section-title">Upload or vault</p>
                          <div className="purchases-delivery-toolbar">
                            <input
                              ref={deliveryFileInputRef}
                              type="file"
                              accept={
                                deliveryTypeDraft === "audio"
                                  ? "audio/*"
                                  : deliveryTypeDraft === "image"
                                    ? "image/*"
                                    : "video/*"
                              }
                              disabled={deliveryUploading}
                              onChange={(e) => {
                                const f = e.currentTarget.files?.[0];
                                if (f) {
                                  discardPendingDeliveryMedia();
                                  void handleUploadDeliveryMedia(p, f);
                                }
                                e.currentTarget.value = "";
                              }}
                              style={{
                                position: "absolute",
                                width: 1,
                                height: 1,
                                padding: 0,
                                margin: -1,
                                overflow: "hidden",
                                clip: "rect(0,0,0,0)",
                                whiteSpace: "nowrap",
                                border: 0,
                              }}
                              aria-hidden
                              tabIndex={-1}
                            />
                            <button
                              type="button"
                              className="purchases-btn purchases-btn-secondary"
                              disabled={deliveryUploading}
                              onClick={() => deliveryFileInputRef.current?.click()}
                            >
                              {deliveryUploading ? "Uploading…" : "Upload file"}
                            </button>
                            <button
                              type="button"
                              className="purchases-btn purchases-btn-secondary"
                              disabled={deliveryUploading || deliveryVaultLoading || deliveryVaultLoadingMore}
                              onClick={() => {
                                const next = !deliveryVaultOpen;
                                setDeliveryVaultOpen(next);
                                if (next) void loadDeliveryVault("reset");
                              }}
                            >
                              {deliveryVaultOpen ? "Hide vault" : deliveryVaultLoading ? "Loading…" : "Pick from vault"}
                            </button>
                          </div>
                        </div>
                      )}

                      {deliveryRecordArm && deliveryRecordArm.remaining > 0 ? (
                        <p className="purchases-delivery-countdown" role="status">
                          Recording starts in <strong>{deliveryRecordArm.remaining}</strong>… Tap the same record button
                          again to cancel.
                        </p>
                      ) : null}

                      {deliveryTypeDraft === "audio" ? (
                        <div className="purchases-delivery-section">
                          <p className="purchases-delivery-section-title">Record in browser</p>
                          <div className="purchases-delivery-record-line">
                            <span className="purchases-delivery-record-label">Voice</span>
                            <button
                              type="button"
                              className={`purchases-btn purchases-btn-secondary${deliveryRecordingVoice ? " purchases-btn-recording" : ""}`}
                              disabled={
                                deliveryUploading ||
                                (deliveryRecordArm !== null && deliveryRecordArm.mode !== "audio")
                              }
                              onClick={() => toggleDeliveryVoiceRecording(p)}
                            >
                              {deliveryRecordingVoice ? "Stop" : "Record voice"}
                            </button>
                            {deliveryRecordingVoice ? (
                              <span className="text-sm font-mono tabular-nums opacity-90">
                                {formatRecordingElapsed(recordingElapsedSec)}
                              </span>
                            ) : null}
                          </div>
                          <div className="purchases-delivery-record-line">
                            <span className="purchases-delivery-record-label">Video</span>
                            <button
                              type="button"
                              className={`purchases-btn purchases-btn-secondary${deliveryRecordingVideo ? " purchases-btn-recording" : ""}`}
                              disabled={
                                deliveryUploading ||
                                (deliveryRecordArm !== null && deliveryRecordArm.mode !== "video")
                              }
                              onClick={() => toggleDeliveryVideoRecording(p)}
                            >
                              {deliveryRecordingVideo ? "Stop" : "Record with camera"}
                            </button>
                            {deliveryRecordingVideo ? (
                              <span className="text-sm font-mono tabular-nums opacity-90">
                                {formatRecordingElapsed(recordingElapsedSec)}
                              </span>
                            ) : null}
                          </div>
                          <p className="purchases-delivery-micro-hint">
                            Video delivery switches this order to &quot;Video reply&quot; so fans can play it in-app.
                          </p>
                        </div>
                      ) : null}

                      {deliveryTypeDraft === "video" ? (
                        <div className="purchases-delivery-section">
                          <p className="purchases-delivery-section-title">Record in browser</p>
                          <div className="purchases-delivery-record-line">
                            <button
                              type="button"
                              className={`purchases-btn purchases-btn-secondary${deliveryRecordingVideo ? " purchases-btn-recording" : ""}`}
                              disabled={
                                deliveryUploading ||
                                (deliveryRecordArm !== null && deliveryRecordArm.mode !== "video")
                              }
                              onClick={() => toggleDeliveryVideoRecording(p)}
                            >
                              {deliveryRecordingVideo ? "Stop recording" : "Record with camera"}
                            </button>
                            {deliveryRecordingVideo ? (
                              <span className="text-sm font-mono tabular-nums opacity-90">
                                {formatRecordingElapsed(recordingElapsedSec)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      {deliveryTypeDraft === "image" ? (
                        <div className="purchases-delivery-section">
                          <p className="purchases-delivery-section-title">Or record a video</p>
                          <div className="purchases-delivery-record-line">
                            <button
                              type="button"
                              className={`purchases-btn purchases-btn-secondary${deliveryRecordingVideo ? " purchases-btn-recording" : ""}`}
                              disabled={
                                deliveryUploading ||
                                (deliveryRecordArm !== null && deliveryRecordArm.mode !== "video")
                              }
                              onClick={() => toggleDeliveryVideoRecording(p)}
                            >
                              {deliveryRecordingVideo ? "Stop recording" : "Record with camera"}
                            </button>
                            {deliveryRecordingVideo ? (
                              <span className="text-sm font-mono tabular-nums opacity-90">
                                {formatRecordingElapsed(recordingElapsedSec)}
                              </span>
                            ) : null}
                          </div>
                          <p className="purchases-delivery-micro-hint">
                            Switches delivery to video so fans can play your recording in-app.
                          </p>
                        </div>
                      ) : null}
                    </div>
                    {deliveryVaultOpen ? (
                      <div
                        className="purchases-schedule-input"
                        style={{ marginTop: "0.5rem", maxHeight: 240, overflowY: "auto", padding: "0.5rem" }}
                      >
                        {deliveryVaultLoading ? (
                          <p className="m-0 text-sm opacity-75">Loading vault...</p>
                        ) : deliveryVaultItems.length === 0 ? (
                          <p className="m-0 text-sm opacity-75">
                            No items in your Vault yet. Add media from the Vault / Media Library, then try again.
                          </p>
                        ) : (
                          <div style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
                            {deliveryVaultItems.map((item) => (
                              <button
                                key={`${item.url}-${item.name}`}
                                type="button"
                                className="purchases-btn purchases-btn-secondary fh-vault-tile"
                                style={{ display: "block", textAlign: "left", minHeight: 90 }}
                                onClick={() => {
                                  discardPendingDeliveryMedia();
                                  setDeliveryTypeDraft(item.type);
                                  setDeliveryUrlDraft(item.url);
                                  setDeliveryVaultOpen(false);
                                  showToast?.(`Selected ${item.type} from Vault.`, "success");
                                }}
                              >
                                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>{item.type}</div>
                                <div style={{ fontSize: 12, lineHeight: 1.3, wordBreak: "break-word" }}>{item.name}</div>
                              </button>
                            ))}
                            {deliveryVaultHasMore ? (
                              <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "center", paddingTop: 6 }}>
                                <button
                                  type="button"
                                  className="purchases-btn purchases-btn-secondary"
                                  disabled={deliveryVaultLoadingMore || deliveryVaultLoading}
                                  onClick={() => void loadDeliveryVault("more")}
                                >
                                  {deliveryVaultLoadingMore ? "Loading…" : "Load more from vault"}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ) : null}
                    {deliveryVideoStream ? (
                      <video
                        ref={deliveryVideoPreviewRef}
                        autoPlay
                        muted
                        playsInline
                        className="purchases-schedule-input"
                        style={{ width: "100%", marginTop: "0.5rem", borderRadius: 10 }}
                      />
                    ) : null}
                    {deliveryPendingMedia?.kind === "audio" ? (
                      <div
                        className="purchases-schedule-input"
                        style={{ marginTop: "0.75rem", padding: "0.75rem", borderRadius: 10 }}
                      >
                        <p className="m-0 text-sm font-medium" style={{ marginBottom: "0.5rem" }}>
                          Listen before you deliver
                        </p>
                        <audio
                          key={deliveryPendingMedia.previewUrl}
                          src={deliveryPendingMedia.previewUrl}
                          controls
                          className="w-full"
                          style={{ maxHeight: 48 }}
                        />
                        <div className="purchases-schedule-row" style={{ marginTop: "0.5rem", gap: "0.5rem" }}>
                          <button
                            type="button"
                            className="purchases-btn purchases-btn-primary"
                            disabled={deliveryUploading}
                            onClick={() => void commitPendingDeliveryMediaUpload(p)}
                          >
                            {deliveryUploading ? "Uploading…" : "Upload & attach for delivery"}
                          </button>
                          <button
                            type="button"
                            className="purchases-btn purchases-btn-secondary"
                            disabled={deliveryUploading}
                            onClick={discardPendingDeliveryMedia}
                          >
                            Discard recording
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {deliveryPendingMedia?.kind === "video" ? (
                      <div
                        className="purchases-schedule-input"
                        style={{ marginTop: "0.75rem", padding: "0.75rem", borderRadius: 10 }}
                      >
                        <p className="m-0 text-sm font-medium" style={{ marginBottom: "0.5rem" }}>
                          Preview before you deliver
                        </p>
                        <video
                          key={deliveryPendingMedia.previewUrl}
                          src={deliveryPendingMedia.previewUrl}
                          controls
                          playsInline
                          className="w-full"
                          style={{ marginTop: "0.25rem", borderRadius: 10, maxHeight: 320, background: "#000" }}
                        />
                        <div className="purchases-schedule-row" style={{ marginTop: "0.5rem", gap: "0.5rem" }}>
                          <button
                            type="button"
                            className="purchases-btn purchases-btn-primary"
                            disabled={deliveryUploading}
                            onClick={() => void commitPendingDeliveryMediaUpload(p)}
                          >
                            {deliveryUploading ? "Uploading…" : "Upload & attach for delivery"}
                          </button>
                          <button
                            type="button"
                            className="purchases-btn purchases-btn-secondary"
                            disabled={deliveryUploading}
                            onClick={discardPendingDeliveryMedia}
                          >
                            Discard recording
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {!deliveryPendingMedia && deliveryTypeDraft === "audio" && deliveryUrlDraft ? (
                      <div style={{ marginTop: "0.75rem" }}>
                        <p className="m-0 text-xs opacity-80" style={{ marginBottom: "0.35rem" }}>
                          Attached audio
                        </p>
                        <audio
                          key={deliveryUrlDraft}
                          src={deliveryUrlDraft}
                          controls
                          className="w-full purchases-schedule-input"
                          style={{ maxHeight: 48 }}
                        />
                      </div>
                    ) : null}
                    {!deliveryPendingMedia && deliveryTypeDraft === "video" && deliveryUrlDraft ? (
                      <div style={{ marginTop: "0.75rem" }}>
                        <p className="m-0 text-xs opacity-80" style={{ marginBottom: "0.35rem" }}>
                          Attached video
                        </p>
                        <video
                          key={deliveryUrlDraft}
                          src={deliveryUrlDraft}
                          controls
                          playsInline
                          className="w-full purchases-schedule-input"
                          style={{ borderRadius: 10, maxHeight: 320, background: "#000" }}
                        />
                      </div>
                    ) : null}
                    {deliveryTypeDraft === "text" ? (
                      <textarea
                        value={deliveryTextDraft}
                        onChange={(e) => setDeliveryTextDraft(e.target.value)}
                        placeholder="Write the delivery message or script..."
                        className="purchases-schedule-input"
                        rows={4}
                        style={{ width: "100%", marginTop: "0.5rem" }}
                      />
                    ) : (
                      <p className="purchases-schedule-hint" style={{ marginTop: "0.5rem" }}>
                        {deliveryPendingMedia
                          ? "When you are happy with the preview, upload to attach — then save delivery."
                          : deliveryUrlDraft
                            ? "Media attached and ready to deliver. Save when you are done."
                            : "No media attached yet. Use Upload, From Vault, or Record to attach media."}
                      </p>
                    )}
                    <div className="purchases-schedule-row" style={{ marginTop: "0.5rem" }}>
                      <button
                        type="button"
                        className="purchases-btn purchases-btn-primary"
                        disabled={savingId === p.id || deliveryUploading}
                        onClick={() => void saveDelivery(p)}
                      >
                        {savingId === p.id ? "Saving…" : "Save Delivery"}
                      </button>
                      <button type="button" className="purchases-btn purchases-btn-secondary" onClick={cancelDeliveryEditor}>
                        Cancel
                      </button>
                    </div>
                    <p className="purchases-schedule-hint">
                      Fans will see this in Purchases and can play/read in-app.
                    </p>
                  </div>
                )}
              </>
            );
            return creatorPurchasesListCompact ? (
              <details key={p.id} className="fan-member-purchase-compact">
                <summary className="fan-member-purchase-compact-summary">
                  <span className="fan-member-purchase-compact-type">{creatorPurchaseTypeLabel(p)}</span>
                  <span className="fan-member-purchase-compact-title">{p.productName}</span>
                  <span className="fan-member-purchase-compact-status">{creatorPurchaseStatusLine(p)}</span>
                  <span className="fan-member-purchase-compact-price">{formatAmount(p.amountCents)}</span>
                </summary>
                <div className="fan-member-purchase-compact-body">
                  <div className={cardClassName}>{cardBody}</div>
                </div>
              </details>
            ) : (
              <div key={p.id} className={cardClassName}>
                {cardBody}
              </div>
            );
          })
        )}
      </div>

      {/* Calendar — short reference (details are in the header intro) */}
      <div className="purchases-calendar-info">
        <h3>Calendar</h3>
        <ul>
          <li>
            <span className="purchases-dot purchases-dot-treat" aria-hidden />
            <span>
              <strong>Scheduled</strong> = purple badge; <strong>delivered</strong> = green badge.
            </span>
          </li>
          <li>
            <span className="purchases-dot purchases-dot-session" aria-hidden />
            <span>
              <strong>Live video</strong> &amp; <strong>timed chat</strong> — saving a date/time adds it to your
              calendar and notifies you and the fan (including a 5‑minute reminder).
            </span>
          </li>
          <li>
            <span className="purchases-dot purchases-dot-delivered" aria-hidden />
            <span>
              <strong>Async treats</strong> (voice note, custom video, etc.) — the date is for your planning; fans are
              notified when you <strong>deliver</strong>, not on the scheduled date.
            </span>
          </li>
          <li>
            <span className="purchases-dot purchases-dot-muted" aria-hidden />
            <span>Change the time anytime from this page or from Calendar.</span>
          </li>
        </ul>
      </div>
    </div>
  );
};
