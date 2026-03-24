import React, { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { auth } from "../firebaseConfig";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import type {
  TreatProduct,
  FanDmThread,
  FanDmMessage,
  StorefrontSocialLinks,
  StorefrontLandingContent,
  StorefrontLegal,
  CreatorMonetization,
  TextStyle,
  FanAuthBranding,
  LandingSectionListMarker,
} from "../types";
import { FanLandingPage } from "./FanLandingPage";
import { FanAuthModal } from "./FanAuthModal";
import { FanMemberFeed, FanMemberSaved } from "./FanMemberFeed";
import { MemberUsernameGateModal } from "./MemberUsernameGateModal";
import { DEFAULT_PRIVACY_POLICY, DEFAULT_TERMS_OF_SERVICE } from "../constants";
import { useAutosizeTextarea } from "../src/hooks/useAutosizeTextarea";
import {
  useUnreadNewMessageNotificationCount,
  clearNewMessageNotificationBadge,
} from "./useUnreadNewMessageNotifications";
import {
  formatDmShortTime,
  formatDmDayCalendarKey,
  formatDmDateDividerLabel,
  formatDmBubbleAuthorLine,
  formatCreatorDmBubblePrimaryLine,
  formatCreatorDmBubbleSecondaryLine,
} from "../src/lib/fanHubDisplay";
import { uploadFanDmAttachment, type DmAttachmentKind } from "../src/lib/dmMediaUpload";
import {
  AUDIO_RECORDER_TIMESLICE_MS,
  createAudioMediaRecorder,
  effectiveBlobType,
  fileExtensionForAudioMime,
  normalizeVoiceRecordingFileType,
  stopMediaRecorderSafe,
} from "../src/lib/browserMediaRecording";
import { AudioLevelMeter } from "./AudioLevelMeter";
import { RecordingDurationLabel } from "./RecordingDurationLabel";
import { DmAudioPlayer } from "./DmAudioPlayer";
import { inferIsAudioFromUrl } from "../src/lib/mediaUrlInfer";
import { FanHubNotificationBell } from "./FanHubNotificationBell";
import { getAvatarCropStyle } from "../src/lib/avatarCrop";
import { resolveStoreCopy } from "../src/lib/storefrontStoreCopy";
import { resolveTipSectionCopy } from "../src/lib/tipSectionCopy";
import { useAppContext } from "./AppContext";
import { isConfiguredCustomStorefrontHost } from "../src/lib/storefrontCustomDomain";
import { usePathname } from "../src/hooks/usePathname";
import { db } from "../firebaseConfig";

export type StorefrontCreator = {
  creatorId: string;
  handle: string;
  displayName: string;
  bio?: string;
  avatar?: string;
  avatarUrl?: string;
  avatarObjectPosition?: string;
  logo?: string;
  logoUrl?: string;
  heroImage?: string;
  heroImageUrl?: string;
  heroTagline?: string;
  heroPromise?: string;
  heroSubline?: string;
  heroSubline2?: string;
  socialLinks?: StorefrontSocialLinks;
  landingContent?: StorefrontLandingContent;
  legal?: StorefrontLegal;
  theme: {
    primary: string;
    background: string;
    text?: string;
    buttonStyle?: string;
    fontFamily?: string;
    accentHover?: string;
    /** Optional; used for themed borders on member UI */
    border?: string;
  };
  heroLayout?: "default" | "centered" | "split" | "splitRight";
  sections: { feed: boolean; treats: boolean; tip?: boolean; messages: boolean; about?: boolean };
  sectionsOrder?: string[];
  /** Guest-visible treats on public landing (no sign-in). */
  publicTreatsOnLanding?: boolean;
  rules?: { boundariesText?: string };
  spicyMode?: boolean;
  monetization?: CreatorMonetization;
  feedSettings?: { hideLikeCounts?: boolean; hideComments?: boolean; hideLikes?: boolean };
  heroMedia?: {
    url: string;
    size?: "small" | "medium" | "large" | "fullBackground";
    backgroundPosition?: string;
    objectPosition?: string;
    landingAvatarLeft?: string;
    landingAvatarBottom?: string;
  }[];
  textStyles?: {
    displayName?: TextStyle;
    bio?: TextStyle;
    heroTagline?: TextStyle;
    heroPromise?: TextStyle;
    perksTitle?: TextStyle;
    perksText?: TextStyle;
    previewTitle?: TextStyle;
    previewText?: TextStyle;
    energyTitle?: TextStyle;
    boundaryTitle?: TextStyle;
    boundaryText?: TextStyle;
  };
  fanAuthBranding?: FanAuthBranding;
};

/**
 * Path → handle + legal subpage.
 * - Default domain: /{handle}, /{handle}/terms|privacy, legacy /u/ /link/
 * - Custom domain (VITE_CUSTOM_STOREFRONT_HOSTS): / → handle from API; /terms|/privacy; /{handle}
 */
function parseHandleFromPath(): { handle: string | null; subpage: "terms" | "privacy" | null } {
  if (typeof window === "undefined") return { handle: null, subpage: null };
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const parts = path.slice(1).split("/").filter(Boolean);

  if (isConfiguredCustomStorefrontHost(window.location.hostname)) {
    if (parts.length === 0) {
      return { handle: null, subpage: null };
    }
    if (parts.length === 1 && (parts[0] === "terms" || parts[0] === "privacy")) {
      return { handle: null, subpage: parts[0] as "terms" | "privacy" };
    }
    if (parts.length === 1 && /^[a-z0-9_]+$/i.test(parts[0])) {
      try {
        return {
          handle: decodeURIComponent(parts[0]).replace("@", "").toLowerCase().trim(),
          subpage: null,
        };
      } catch {
        return { handle: parts[0].replace("@", "").toLowerCase().trim(), subpage: null };
      }
    }
    return { handle: null, subpage: null };
  }

  const legacyMatch = path.match(/^\/(?:u|link)\/([^/]+)/);
  const handleSegment = legacyMatch ? legacyMatch[1] : parts[0];
  if (!handleSegment) return { handle: null, subpage: null };

  const subpageSegment = parts[1]?.toLowerCase();
  const subpage = subpageSegment === "terms" || subpageSegment === "privacy" ? subpageSegment : null;

  try {
    return {
      handle: decodeURIComponent(handleSegment).replace("@", "").toLowerCase().trim(),
      subpage,
    };
  } catch {
    return {
      handle: handleSegment.replace("@", "").toLowerCase().trim(),
      subpage,
    };
  }
}

function normalizeFirebaseStorageObjectPath(url: string): string {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("firebasestorage.googleapis.com")) return url;
    const marker = "/o/";
    const idx = u.pathname.indexOf(marker);
    if (idx < 0) return url;
    const head = u.pathname.slice(0, idx + marker.length);
    const rawObject = u.pathname.slice(idx + marker.length);
    const decoded = decodeURIComponent(rawObject);
    const reencoded = encodeURIComponent(decoded);
    if (reencoded === rawObject) return url;
    return `${u.origin}${head}${reencoded}${u.search}`;
  } catch {
    return url;
  }
}

const TIP_PRESET_AMOUNTS = [5, 10, 25, 50, 100, 250];

const DmPhotoIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const DmMicIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

interface TipSectionProps {
  creatorId: string;
  displayName: string;
  primary: string;
  /** From My Page landing content — same heading as public landing; member-only subline (no “no subscription” default). */
  tipHeading: string;
  tipSubline: string;
  tipSelectedPreset: number | null;
  setTipSelectedPreset: (v: number | null) => void;
  tipCustomAmount: string;
  setTipCustomAmount: (v: string) => void;
  tipLoading: boolean;
  setTipLoading: (v: boolean) => void;
}

function TipSection({
  creatorId,
  displayName,
  primary,
  tipHeading,
  tipSubline,
  tipSelectedPreset,
  setTipSelectedPreset,
  tipCustomAmount,
  setTipCustomAmount,
  tipLoading,
  setTipLoading,
}: TipSectionProps) {
  const parsedCustomAmount = tipCustomAmount.trim()
    ? Number.parseFloat(tipCustomAmount)
    : NaN;
  const customAmountCents = Number.isFinite(parsedCustomAmount)
    ? Math.round(parsedCustomAmount * 100)
    : 0;
  const amountCents =
    tipSelectedPreset != null
      ? tipSelectedPreset * 100
      : customAmountCents;

  const startTipCheckout = async (cents: number) => {
    if (cents < 100 || cents > 100000) return;
    setTipLoading(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch("/api/createFanCheckoutSession", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          creatorId,
          type: "tip",
          amountCents: cents,
          successUrl: `${base}${window.location.pathname}?tip=success`,
          cancelUrl: `${base}${window.location.pathname}?tip=cancel`,
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      alert(data.error || "Checkout failed. Please try again.");
    } catch {
      alert("Something went wrong. Please try again.");
    } finally {
      setTipLoading(false);
    }
  };

  const handleTip = async () => {
    await startTipCheckout(amountCents);
  };

  return (
    <div className="tip-section-wrap">
      {/* Hero */}
      <div className="tip-hero-section">
        <h2 className="tip-hero-title">{tipHeading}</h2>
        <p className="tip-hero-subtitle">{tipSubline}</p>
      </div>

      {/* Amount Selection */}
      <div className="tip-amounts-section">
        <h3 className="tip-amounts-heading">Choose an amount</h3>
        <div className="tip-presets-grid">
          {TIP_PRESET_AMOUNTS.map((dollars) => (
            <button
              key={dollars}
              type="button"
              className={`tip-preset-btn ${tipSelectedPreset === dollars ? "active" : ""}`}
              onClick={() => {
                setTipSelectedPreset(dollars);
                setTipCustomAmount("");
              }}
              style={
                tipSelectedPreset === dollars
                  ? { backgroundColor: primary, borderColor: primary, color: "#fff" }
                  : {}
              }
            >
              ${dollars}
            </button>
          ))}
        </div>

        <div className="tip-custom-section">
          <label className="tip-custom-label">Or enter custom amount ($)</label>
          <input
            type="number"
            min="1"
            max="1000"
            step="0.01"
            value={tipCustomAmount}
            onChange={(e) => {
              setTipCustomAmount(e.target.value);
              setTipSelectedPreset(null);
            }}
            placeholder="e.g. 15"
            className="tip-custom-input"
          />
        </div>

        <button
          type="button"
          className="tip-cta-btn"
          onClick={handleTip}
          disabled={amountCents < 100 || amountCents > 100000 || tipLoading}
          style={{ backgroundColor: primary }}
        >
          {tipLoading ? "Taking you to checkout…" : `Tip $${(amountCents / 100).toFixed(2)}`}
        </button>
      </div>

      {/* Footer */}
      <div className="tip-footer-section">
        <p className="tip-thanks-text">Thank You!</p>
        <span className="tip-heart-icon">💖</span>
      </div>
    </div>
  );
}

export const FanStorefrontView: React.FC = () => {
  const { showToast } = useAppContext();
  const pathname = usePathname();
  const [handle, setHandle] = useState<string | null>(() => parseHandleFromPath().handle);
  const [legalSubpage, setLegalSubpage] = useState<"terms" | "privacy" | null>(() => parseHandleFromPath().subpage);
  /** False on custom domain until /api/resolveStorefrontDomain returns */
  const [handleResolveComplete, setHandleResolveComplete] = useState(() => {
    if (typeof window === "undefined") return true;
    const p = parseHandleFromPath();
    return !!p.handle || !isConfiguredCustomStorefrontHost(window.location.hostname);
  });
  const [creator, setCreator] = useState<StorefrontCreator | null>(null);
  const [subscribed, setSubscribed] = useState<boolean>(false);
  const [memberUsernameRequired, setMemberUsernameRequired] = useState(false);
  const [cancelMembershipLoading, setCancelMembershipLoading] = useState(false);
  const [cancelMembershipMessage, setCancelMembershipMessage] = useState<string | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [entitlementLoading, setEntitlementLoading] = useState(false);
  /** Bumps when entitlement effect re-runs so stale async completions don't leave loading stuck. */
  const entitlementFetchGen = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"feed" | "treats" | "messages" | "tip" | "saved" | "about">("feed");
  const [tipSelectedPreset, setTipSelectedPreset] = useState<number | null>(null);
  const [tipCustomAmount, setTipCustomAmount] = useState("");
  const [tipLoading, setTipLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(!!auth.currentUser);
  const [unlockedProductIds, setUnlockedProductIds] = useState<string[]>([]);
  const [treatsProducts, setTreatsProducts] = useState<TreatProduct[]>([]);
  const [treatsLoading, setTreatsLoading] = useState(false);
  /** Visible treats on public landing when creator enables guest checkout */
  const [landingTreatsProducts, setLandingTreatsProducts] = useState<TreatProduct[]>([]);
  const [landingTreatsLoading, setLandingTreatsLoading] = useState(false);
  const [guestTreatPurchasingId, setGuestTreatPurchasingId] = useState<string | null>(null);
  const [treatLinkMessage, setTreatLinkMessage] = useState<string | null>(null);
  const pendingGuestLinkBannerShown = useRef(false);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [joiningFree, setJoiningFree] = useState(false);
  const [fanAuthOpen, setFanAuthOpen] = useState(false);
  const [fanAuthView, setFanAuthView] = useState<"login" | "signup">("login");
  const [dmThread, setDmThread] = useState<FanDmThread | null>(null);
  const [dmMessages, setDmMessages] = useState<FanDmMessage[]>([]);
  const [dmLabels, setDmLabels] = useState<{ fan: string; creator: string } | null>(null);
  const [dmLoading, setDmLoading] = useState(false);
  const [dmSending, setDmSending] = useState(false);
  const [dmInput, setDmInput] = useState("");
  const dmMessagesEndRef = useRef<HTMLDivElement | null>(null);
  const { ref: dmTextareaRef } = useAutosizeTextarea(dmInput);
  const dmFileInputRef = useRef<HTMLInputElement | null>(null);
  const dmMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const dmMediaChunksRef = useRef<Blob[]>([]);
  const [dmRecordingVoice, setDmRecordingVoice] = useState(false);
  const [dmVoiceMeterStream, setDmVoiceMeterStream] = useState<MediaStream | null>(null);
  const [dmVoiceMeterKey, setDmVoiceMeterKey] = useState(0);
  const [fanBanned, setFanBanned] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const previewMember = urlParams?.get("preview") === "member";
  /** Logged-in members normally skip landing; creators use this to see the public landing while signed in. */
  const forcePublicLanding = urlParams?.get("landing") === "1";

  const unreadMessageTabCount = useUnreadNewMessageNotificationCount(
    isLoggedIn && creator ? creator.creatorId : false
  );

  const storefrontVisualScore = useCallback((data: Record<string, unknown> | null | undefined): number => {
    if (!data) return -1;
    let score = 0;
    if (typeof data.logo === "string" && data.logo.trim()) score += 8;
    if (typeof data.logoUrl === "string" && data.logoUrl.trim()) score += 8;
    if (typeof data.avatar === "string" && data.avatar.trim()) score += 5;
    if (typeof data.avatarUrl === "string" && data.avatarUrl.trim()) score += 5;
    if (Array.isArray(data.heroMedia) && data.heroMedia.length > 0) score += 6;
    if (typeof data.heroImage === "string" && data.heroImage.trim()) score += 4;
    if (typeof data.heroImageUrl === "string" && data.heroImageUrl.trim()) score += 4;
    if (typeof data.heroTagline === "string" && data.heroTagline.trim()) score += 2;
    if (typeof data.heroPromise === "string" && data.heroPromise.trim()) score += 2;
    if (data.landingContent && typeof data.landingContent === "object") score += 8;
    if (data.textStyles && typeof data.textStyles === "object") score += 8;
    if (data.rules && typeof data.rules === "object") score += 4;
    if (data.theme && typeof data.theme === "object") score += 3;
    if (typeof data.displayName === "string" && data.displayName.trim()) score += 2;
    return score;
  }, []);

  const hasVisibleSocialLinks = useCallback((socialLinks: StorefrontSocialLinks | undefined): boolean => {
    if (!socialLinks || typeof socialLinks !== "object") return false;
    const hasUrl = (url?: string) => typeof url === "string" && url.trim().length > 0;
    if (hasUrl(socialLinks.instagram?.url) && socialLinks.instagram?.show !== false) return true;
    if (hasUrl(socialLinks.x?.url) && socialLinks.x?.show !== false) return true;
    if (hasUrl(socialLinks.tiktok?.url) && socialLinks.tiktok?.show !== false) return true;
    if (hasUrl(socialLinks.youtube?.url) && socialLinks.youtube?.show !== false) return true;
    if (hasUrl(socialLinks.facebook?.url) && socialLinks.facebook?.show !== false) return true;
    const legacyTwitter = (socialLinks as StorefrontSocialLinks & { twitter?: { url?: string; show?: boolean } }).twitter;
    if (hasUrl(legacyTwitter?.url) && legacyTwitter?.show !== false) return true;
    if (Array.isArray(socialLinks.custom)) {
      return socialLinks.custom.some((c) => hasUrl(c?.url) && c?.show !== false);
    }
    return false;
  }, []);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (activeTab !== "messages" || !uid || !creator?.creatorId) return;
    void clearNewMessageNotificationBadge(uid, creator.creatorId);
  }, [activeTab, creator?.creatorId]);

  /** Chat off → Messages tab hidden; leave tab if user was on Messages */
  useEffect(() => {
    if (!creator?.creatorId) return;
    const chatOn = creator.monetization?.chatEnabled !== false;
    if (chatOn || activeTab !== "messages") return;
    const order = creator.sectionsOrder || ["feed", "treats", "tip", "messages", "about"];
    const sec = creator.sections ?? {};
    const next =
      order.find(
        (key) =>
          key !== "saved" &&
          key !== "messages" &&
          (sec as Record<string, boolean>)[key] !== false
      ) ?? "feed";
    setActiveTab(next as "feed" | "treats" | "messages" | "tip" | "saved" | "about");
  }, [
    creator?.creatorId,
    creator?.monetization?.chatEnabled,
    creator?.sectionsOrder,
    creator?.sections,
    activeTab,
  ]);

  useEffect(() => {
    const parsed = parseHandleFromPath();
    setLegalSubpage(parsed.subpage);
    if (parsed.handle) {
      setHandle(parsed.handle);
      setHandleResolveComplete(true);
      return;
    }
    if (!isConfiguredCustomStorefrontHost(window.location.hostname)) {
      setHandle(null);
      setHandleResolveComplete(true);
      return;
    }
    setHandleResolveComplete(false);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/resolveStorefrontDomain?host=${encodeURIComponent(window.location.hostname)}`
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && typeof (data as { handle?: string }).handle === "string") {
          const h = (data as { handle: string }).handle.trim().toLowerCase();
          setHandle(h || null);
        } else {
          setHandle(null);
        }
      } catch {
        if (!cancelled) setHandle(null);
      } finally {
        if (!cancelled) setHandleResolveComplete(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    if (!handleResolveComplete) return;
    if (!handle) {
      setError("Invalid handle");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await fetch(`/api/getCreatorByHandle?handle=${encodeURIComponent(handle)}`);
        if (cancelled) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError((body as { error?: string }).error || "Creator not found");
          setCreator(null);
          setLoading(false);
          return;
        }
        const data = await res.json();
        let resolved = data as StorefrontCreator;
        const missingVisuals =
          !String(resolved.logo ?? "").trim() &&
          !String(resolved.logoUrl ?? "").trim() &&
          !String(resolved.avatar ?? "").trim() &&
          !String(resolved.heroImage ?? "").trim() &&
          !String(resolved.heroImageUrl ?? "").trim() &&
          (!Array.isArray(resolved.heroMedia) || resolved.heroMedia.length === 0);

        if (db) {
          try {
            const q = query(collection(db, "creators"), where("handle", "==", handle));
            const snapByHandle = await getDocs(q);
            if (!snapByHandle.empty) {
              let best = snapByHandle.docs[0].data() as Record<string, unknown>;
              let bestScore = storefrontVisualScore(best);
              for (const d of snapByHandle.docs.slice(1)) {
                const cand = d.data() as Record<string, unknown>;
                const s = storefrontVisualScore(cand);
                if (s > bestScore) {
                  best = cand;
                  bestScore = s;
                }
              }
              const resolvedHasLogo =
                String((resolved as { logo?: string }).logo ?? "").trim() !== "" ||
                String((resolved as { logoUrl?: string }).logoUrl ?? "").trim() !== "";
              if (bestScore > storefrontVisualScore(resolved as unknown as Record<string, unknown>) || !resolvedHasLogo) {
                resolved = {
                  ...resolved,
                  logo:
                    resolved.logo ||
                    (typeof best.logo === "string" ? best.logo : undefined) ||
                    (typeof best.logoUrl === "string" ? best.logoUrl : undefined),
                  logoUrl:
                    resolved.logoUrl ||
                    (typeof best.logoUrl === "string" ? best.logoUrl : undefined),
                  avatar:
                    resolved.avatar ||
                    (typeof best.avatar === "string" ? best.avatar : undefined) ||
                    (typeof best.avatarUrl === "string" ? best.avatarUrl : undefined),
                  avatarObjectPosition:
                    resolved.avatarObjectPosition ||
                    (typeof best.avatarObjectPosition === "string" ? best.avatarObjectPosition : undefined),
                  heroImage:
                    resolved.heroImage ||
                    (typeof best.heroImage === "string" ? best.heroImage : undefined) ||
                    (typeof best.heroImageUrl === "string" ? best.heroImageUrl : undefined),
                  heroImageUrl:
                    resolved.heroImageUrl ||
                    (typeof best.heroImageUrl === "string" ? best.heroImageUrl : undefined),
                  heroMedia:
                    (Array.isArray(resolved.heroMedia) && resolved.heroMedia.length > 0)
                      ? resolved.heroMedia
                      : (Array.isArray(best.heroMedia) ? (best.heroMedia as StorefrontCreator["heroMedia"]) : undefined),
                  heroTagline:
                    resolved.heroTagline ||
                    (typeof best.heroTagline === "string" ? best.heroTagline : undefined),
                  heroPromise:
                    resolved.heroPromise ||
                    (typeof best.heroPromise === "string" ? best.heroPromise : undefined),
                  heroSubline:
                    resolved.heroSubline ||
                    (typeof best.heroSubline === "string" ? best.heroSubline : undefined),
                  heroSubline2:
                    resolved.heroSubline2 ||
                    (typeof best.heroSubline2 === "string" ? best.heroSubline2 : undefined),
                  displayName:
                    resolved.displayName ||
                    (typeof best.displayName === "string" ? best.displayName : undefined),
                  bio:
                    resolved.bio ||
                    (typeof best.bio === "string" ? best.bio : undefined),
                  socialLinks:
                    (hasVisibleSocialLinks(resolved.socialLinks as StorefrontSocialLinks | undefined)
                      ? resolved.socialLinks
                      : undefined) ||
                    (best.socialLinks as StorefrontCreator["socialLinks"] | undefined),
                  landingContent:
                    resolved.landingContent ||
                    (best.landingContent as StorefrontCreator["landingContent"] | undefined),
                  textStyles:
                    resolved.textStyles ||
                    (best.textStyles as StorefrontCreator["textStyles"] | undefined),
                  rules:
                    resolved.rules ||
                    (best.rules as StorefrontCreator["rules"] | undefined),
                  theme:
                    resolved.theme ||
                    (best.theme as StorefrontCreator["theme"] | undefined),
                  heroLayout:
                    resolved.heroLayout ||
                    (best.heroLayout as StorefrontCreator["heroLayout"] | undefined),
                  showDisplayNameOnLanding:
                    typeof best.showDisplayNameOnLanding === "boolean"
                      ? (best.showDisplayNameOnLanding as boolean)
                      : resolved.showDisplayNameOnLanding,
                };
              }
            }
          } catch {
            // Optional fallback only; keep API payload when Firestore read is unavailable.
          }
        }
        // Strong fallback for creator-owned storefront while signed in:
        // use the signed-in creator doc directly when it matches this handle.
        if (db && auth.currentUser?.uid) {
          try {
            const ownDoc = await getDoc(doc(db, "creators", auth.currentUser.uid));
            if (ownDoc.exists()) {
              const own = ownDoc.data() as Record<string, unknown>;
              const ownHandle =
                (typeof own.handle === "string" ? own.handle : "")
                  .replace("@", "")
                  .toLowerCase()
                  .trim();
              if (ownHandle === handle) {
                resolved = {
                  ...resolved,
                  creatorId: auth.currentUser.uid,
                  logo:
                    resolved.logo ||
                    (typeof own.logo === "string" ? own.logo : undefined) ||
                    (typeof own.logoUrl === "string" ? own.logoUrl : undefined),
                  logoUrl:
                    resolved.logoUrl ||
                    (typeof own.logoUrl === "string" ? own.logoUrl : undefined),
                  avatar:
                    resolved.avatar ||
                    (typeof own.avatar === "string" ? own.avatar : undefined) ||
                    (typeof own.avatarUrl === "string" ? own.avatarUrl : undefined),
                  avatarObjectPosition:
                    resolved.avatarObjectPosition ||
                    (typeof own.avatarObjectPosition === "string" ? own.avatarObjectPosition : undefined),
                  heroImage:
                    resolved.heroImage ||
                    (typeof own.heroImage === "string" ? own.heroImage : undefined) ||
                    (typeof own.heroImageUrl === "string" ? own.heroImageUrl : undefined),
                  heroImageUrl:
                    resolved.heroImageUrl ||
                    (typeof own.heroImageUrl === "string" ? own.heroImageUrl : undefined),
                  heroMedia:
                    (Array.isArray(resolved.heroMedia) && resolved.heroMedia.length > 0)
                      ? resolved.heroMedia
                      : (Array.isArray(own.heroMedia) ? (own.heroMedia as StorefrontCreator["heroMedia"]) : undefined),
                  heroTagline:
                    resolved.heroTagline ||
                    (typeof own.heroTagline === "string" ? own.heroTagline : undefined),
                  heroPromise:
                    resolved.heroPromise ||
                    (typeof own.heroPromise === "string" ? own.heroPromise : undefined),
                  heroSubline:
                    resolved.heroSubline ||
                    (typeof own.heroSubline === "string" ? own.heroSubline : undefined),
                  heroSubline2:
                    resolved.heroSubline2 ||
                    (typeof own.heroSubline2 === "string" ? own.heroSubline2 : undefined),
                  displayName:
                    resolved.displayName ||
                    (typeof own.displayName === "string" ? own.displayName : undefined),
                  bio:
                    resolved.bio ||
                    (typeof own.bio === "string" ? own.bio : undefined),
                  socialLinks:
                    (hasVisibleSocialLinks(resolved.socialLinks as StorefrontSocialLinks | undefined)
                      ? resolved.socialLinks
                      : undefined) ||
                    (own.socialLinks as StorefrontCreator["socialLinks"] | undefined),
                  landingContent:
                    resolved.landingContent ||
                    (own.landingContent as StorefrontCreator["landingContent"] | undefined),
                  textStyles:
                    resolved.textStyles ||
                    (own.textStyles as StorefrontCreator["textStyles"] | undefined),
                  rules:
                    resolved.rules ||
                    (own.rules as StorefrontCreator["rules"] | undefined),
                  theme:
                    resolved.theme ||
                    (own.theme as StorefrontCreator["theme"] | undefined),
                  heroLayout:
                    resolved.heroLayout ||
                    (own.heroLayout as StorefrontCreator["heroLayout"] | undefined),
                  showDisplayNameOnLanding:
                    typeof own.showDisplayNameOnLanding === "boolean"
                      ? (own.showDisplayNameOnLanding as boolean)
                      : resolved.showDisplayNameOnLanding,
                };
              }
            }
          } catch {
            // Optional fallback only.
          }
        }
        // Member/live fallback too: if logo is missing but the signed-in creator doc for this handle has one,
        // merge it so header branding stays consistent with My Page save state.
        if (db && auth.currentUser?.uid) {
          const resolvedHasLogoNow =
            String((resolved as { logo?: string }).logo ?? "").trim() !== "" ||
            String((resolved as { logoUrl?: string }).logoUrl ?? "").trim() !== "";
          if (!resolvedHasLogoNow) {
            try {
              const ownDoc = await getDoc(doc(db, "creators", auth.currentUser.uid));
              if (ownDoc.exists()) {
                const own = ownDoc.data() as Record<string, unknown>;
                const ownHandle =
                  (typeof own.handle === "string" ? own.handle : "")
                    .replace("@", "")
                    .toLowerCase()
                    .trim();
                const ownLogo =
                  (typeof own.logo === "string" ? own.logo.trim() : "") ||
                  (typeof own.logoUrl === "string" ? own.logoUrl.trim() : "");
                if (ownHandle === handle && ownLogo) {
                  resolved = {
                    ...resolved,
                    logo: ownLogo,
                    logoUrl: ownLogo,
                  };
                }
              }
            } catch {
              // Optional fallback only.
            }
          }
        }
        const resolvedLogo = String((resolved as { logo?: string }).logo ?? "").trim();
        const resolvedLogoUrl = String((resolved as { logoUrl?: string }).logoUrl ?? "").trim();
        if (!resolvedLogo && resolvedLogoUrl) {
          resolved = { ...resolved, logo: resolvedLogoUrl };
        } else if (resolvedLogo && !resolvedLogoUrl) {
          resolved = { ...resolved, logoUrl: resolvedLogo };
        }
        setCreator(resolved);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError("Failed to load creator");
          setCreator(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [handle, handleResolveComplete, storefrontVisualScore, hasVisibleSocialLinks, isLoggedIn, forcePublicLanding]);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => setIsLoggedIn(!!u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!profileMenuRef.current) return;
      if (!profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileMenuOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [profileMenuOpen]);

  useEffect(() => {
    if (!creator?.creatorId || !isLoggedIn) {
      setSubscribed(false);
      setMemberUsernameRequired(false);
      setEntitlementLoading(false);
      return;
    }

    const gen = ++entitlementFetchGen.current;
    setEntitlementLoading(true);

    (async () => {
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
        const res = await fetch(
          `/api/getFanEntitlement?creatorId=${encodeURIComponent(creator.creatorId)}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        );
        const data = await res.json().catch(() => ({}));
        if (gen !== entitlementFetchGen.current) return;
        setSubscribed(!!(data as { subscribed?: boolean }).subscribed);
        setMemberUsernameRequired(!!(data as { memberUsernameRequired?: boolean }).memberUsernameRequired);
        setUnlockedProductIds(Array.isArray((data as { unlockedProductIds?: string[] }).unlockedProductIds) ? (data as { unlockedProductIds: string[] }).unlockedProductIds : []);
      } catch {
        if (gen === entitlementFetchGen.current) {
          setSubscribed(false);
          setMemberUsernameRequired(false);
        }
      } finally {
        if (gen === entitlementFetchGen.current) {
          setEntitlementLoading(false);
        }
      }
    })();
  }, [creator?.creatorId, isLoggedIn]);

  const fetchTreats = useCallback(async () => {
    if (!creator?.creatorId) return;
    setTreatsLoading(true);
    try {
      const res = await fetch(
        `/api/products?creatorId=${encodeURIComponent(creator.creatorId)}&context=member`
      );
      if (!res.ok) return;
      const data = await res.json();
      setTreatsProducts(Array.isArray(data.products) ? data.products : []);
    } catch {
      setTreatsProducts([]);
    } finally {
      setTreatsLoading(false);
    }
  }, [creator?.creatorId]);

  useEffect(() => {
    if (activeTab === "treats" && creator?.creatorId) fetchTreats();
  }, [activeTab, creator?.creatorId, fetchTreats]);

  const onPublicLanding =
    !previewMember && (!isLoggedIn || !subscribed);

  useEffect(() => {
    if (
      !creator?.creatorId ||
      creator.sections?.treats === false ||
      !onPublicLanding
    ) {
      if (!onPublicLanding) setLandingTreatsProducts([]);
      return;
    }
    let cancelled = false;
    setLandingTreatsLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/products?creatorId=${encodeURIComponent(creator.creatorId)}&context=landing`
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) {
          setLandingTreatsProducts(Array.isArray(data.products) ? data.products : []);
        }
      } catch {
        if (!cancelled) setLandingTreatsProducts([]);
      } finally {
        if (!cancelled) setLandingTreatsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    creator?.creatorId,
    creator?.sections?.treats,
    onPublicLanding,
  ]);

  /** Guest checkout returned from Stripe but fan is not signed in yet — prompt before claim can run. */
  useEffect(() => {
    if (typeof window === "undefined" || isLoggedIn || pendingGuestLinkBannerShown.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("treat_success") !== "1" || !params.get("session_id")) return;
    pendingGuestLinkBannerShown.current = true;
    setTreatLinkMessage(
      "Payment successful. Sign in or create an account using the same email you used at checkout — we'll link your purchase to this account automatically."
    );
  }, [isLoggedIn]);

  useEffect(() => {
    if (typeof window === "undefined" || !creator?.creatorId || !isLoggedIn || !auth.currentUser) return;
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("session_id");
    const ok = params.get("treat_success") === "1";
    if (!sid || !ok) return;

    let cancelled = false;
    (async () => {
      try {
        const token = await auth.currentUser!.getIdToken(true);
        const res = await fetch("/api/claimGuestPurchase", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ sessionId: sid }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          const merged = (data as { merged?: boolean }).merged;
          setTreatLinkMessage(
            merged
              ? "Your purchase is linked to your account. You'll see it in your member area; you can still subscribe anytime for full access."
              : "You're all set — this purchase was already linked to your account."
          );
          const gen = ++entitlementFetchGen.current;
          try {
            const entRes = await fetch(
              `/api/getFanEntitlement?creatorId=${encodeURIComponent(creator.creatorId)}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            const ent = await entRes.json().catch(() => ({}));
            if (gen === entitlementFetchGen.current) {
              setSubscribed(!!(ent as { subscribed?: boolean }).subscribed);
              setUnlockedProductIds(
                Array.isArray((ent as { unlockedProductIds?: string[] }).unlockedProductIds)
                  ? (ent as { unlockedProductIds: string[] }).unlockedProductIds
                  : []
              );
            }
          } catch {
            /* ignore */
          }
        } else {
          setTreatLinkMessage((data as { error?: string }).error || "Could not link purchase to your account.");
        }
        const url = new URL(window.location.href);
        url.searchParams.delete("session_id");
        url.searchParams.delete("treat_success");
        const qs = url.searchParams.toString();
        window.history.replaceState({}, "", url.pathname + (qs ? `?${qs}` : ""));
      } catch {
        if (!cancelled) setTreatLinkMessage("Could not link purchase. Try again or contact support.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [creator?.creatorId, isLoggedIn]);

  const handleGuestTreatPurchase = async (productId: string) => {
    if (!creator?.creatorId) return;
    setGuestTreatPurchasingId(productId);
    try {
      const base = `${window.location.origin}${window.location.pathname}`;
      const res = await fetch("/api/createFanCheckoutSession", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorId: creator.creatorId,
          type: "product",
          productId,
          guestProduct: true,
          successUrl: `${base}?treat_success=1&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: base,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Checkout failed");
      const url = (data as { url?: string }).url;
      if (url) window.location.href = url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Checkout could not start. Please try again.";
      showToast?.(msg, "error");
    } finally {
      setGuestTreatPurchasingId(null);
    }
  };

  const handleSubscribe = async () => {
    if (!creator?.creatorId || !auth.currentUser) {
      setFanAuthView("login");
      setFanAuthOpen(true);
      return;
    }
    setSubscribing(true);
    try {
      const token = await auth.currentUser.getIdToken(true);
      const res = await fetch("/api/createFanCheckoutSession", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          creatorId: creator.creatorId,
          type: "subscription",
          successUrl: window.location.href,
          cancelUrl: window.location.href,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Checkout failed");
      const url = (data as { url?: string }).url;
      if (url) window.location.href = url;
    } catch {
      // could toast
    } finally {
      setSubscribing(false);
    }
  };

  const handleJoinFree = async () => {
    if (!creator?.creatorId || !auth.currentUser) {
      setFanAuthView("signup");
      setFanAuthOpen(true);
      return;
    }
    setJoiningFree(true);
    try {
      const token = await auth.currentUser.getIdToken(true);
      const res = await fetch("/api/joinFreeMembership", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ creatorId: creator.creatorId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Failed to join");
      // Successfully joined — sync entitlement (username may still be required)
      setSubscribed(true);
      try {
        const token2 = await auth.currentUser.getIdToken(true);
        const entRes = await fetch(
          `/api/getFanEntitlement?creatorId=${encodeURIComponent(creator.creatorId)}`,
          { headers: { Authorization: `Bearer ${token2}` } }
        );
        const ent = await entRes.json().catch(() => ({}));
        setMemberUsernameRequired(!!(ent as { memberUsernameRequired?: boolean }).memberUsernameRequired);
      } catch {
        /* keep prior state */
      }
    } catch (e) {
      console.error("Failed to join free membership:", e);
    } finally {
      setJoiningFree(false);
    }
  };

  const handlePurchase = async (productId: string) => {
    if (!creator?.creatorId || !auth.currentUser) return;
    setPurchasingId(productId);
    try {
      const token = await auth.currentUser.getIdToken(true);
      const res = await fetch("/api/createFanCheckoutSession", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          creatorId: creator.creatorId,
          type: "product",
          productId,
          successUrl: window.location.href,
          cancelUrl: window.location.href,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Checkout failed");
      const url = (data as { url?: string }).url;
      if (url) window.location.href = url;
    } catch {
      // could toast
    } finally {
      setPurchasingId(null);
    }
  };

  const formatPrice = (cents: number) => "$" + (cents / 100).toFixed(2);

  const handleCancelMembership = async () => {
    if (!creator?.creatorId || !auth.currentUser) return;
    if (!window.confirm("Cancel your membership? You'll keep access until the end of your current billing period.")) return;
    setCancelMembershipLoading(true);
    setCancelMembershipMessage(null);
    try {
      const token = await auth.currentUser.getIdToken(true);
      const res = await fetch("/api/fanCancelCreatorSubscription", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ creatorId: creator.creatorId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Failed to cancel");
      const endDate = (data as { currentPeriodEnd?: string }).currentPeriodEnd;
      const msg = endDate
        ? `Membership will end on ${new Date(endDate).toLocaleDateString()}. You keep access until then.`
        : "Membership set to cancel at the end of your billing period.";
      setCancelMembershipMessage(msg);
    } catch (e) {
      setCancelMembershipMessage(e instanceof Error ? e.message : "Failed to cancel membership.");
    } finally {
      setCancelMembershipLoading(false);
    }
  };

  const handleOpenProfile = () => {
    setProfileMenuOpen(false);
    setActiveTab("about");
  };

  const handleSendProblem = () => {
    setProfileMenuOpen(false);
    const subject = encodeURIComponent(`Problem report for @${creator?.handle ?? ""}`);
    const body = encodeURIComponent(
      `Creator: @${creator?.handle ?? ""}\nPage: ${typeof window !== "undefined" ? window.location.href : ""}\n\nDescribe the issue:`
    );
    window.location.href = `mailto:support@engagesuite.ai?subject=${subject}&body=${body}`;
  };

  const handleLogout = async () => {
    setProfileMenuOpen(false);
    try {
      await auth.signOut();
      setIsLoggedIn(false);
      if (creator?.handle) window.location.href = `/${creator.handle}`;
    } catch {
      showToast("Could not log out. Try again.", "error");
    }
  };

  const fetchDmThreadAndMessages = useCallback(async () => {
    if (!creator?.creatorId || !auth.currentUser || activeTab !== "messages") return;
    setDmLoading(true);
    try {
      const token = await auth.currentUser.getIdToken(true);
      const [threadsRes, bannedRes] = await Promise.all([
        fetch("/api/fanDmThreads?as=fan", { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/checkFanBanned?creatorId=${encodeURIComponent(creator.creatorId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const threadsData = await threadsRes.json().catch(() => ({}));
      const bannedData = await bannedRes.json().catch(() => ({}));
      setFanBanned(!!(bannedData as { banned?: boolean }).banned);
      const threads = (threadsData.threads as FanDmThread[]) || [];
      const withCreator = threads.find((t) => t.creatorId === creator.creatorId);
      setDmThread(withCreator || null);
      if (withCreator) {
        const msgRes = await fetch(
          `/api/fanDmMessages?threadId=${encodeURIComponent(withCreator.id)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const msgData = await msgRes.json().catch(() => ({}));
        setDmMessages(Array.isArray(msgData.messages) ? msgData.messages : []);
        const raw = msgData.labels as { fan?: unknown; creator?: unknown } | undefined;
        setDmLabels(
          raw && typeof raw.fan === "string" && typeof raw.creator === "string"
            ? { fan: raw.fan, creator: raw.creator }
            : null
        );
      } else {
        setDmMessages([]);
        setDmLabels(null);
      }
    } catch {
      setDmThread(null);
      setDmMessages([]);
      setDmLabels(null);
    } finally {
      setDmLoading(false);
    }
  }, [creator?.creatorId, activeTab]);

  useEffect(() => {
    if (activeTab === "messages" && creator?.creatorId && isLoggedIn) fetchDmThreadAndMessages();
  }, [activeTab, creator?.creatorId, isLoggedIn, fetchDmThreadAndMessages]);

  useEffect(() => {
    if (activeTab !== "messages" || dmLoading) return;
    requestAnimationFrame(() => dmMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" }));
  }, [activeTab, dmMessages, dmLoading]);

  useEffect(() => {
    return () => {
      const r = dmMediaRecorderRef.current;
      if (r && r.state !== "inactive") {
        r.onstop = null;
        stopMediaRecorderSafe(r);
      }
    };
  }, []);

  const sendDmWithPayload = async (
    content: string,
    attachmentUrl?: string,
    attachmentType?: DmAttachmentKind
  ) => {
    if (!creator?.creatorId || !auth.currentUser) return;
    if (!content.trim() && !attachmentUrl) return;
    setDmSending(true);
    const prevInput = dmInput;
    setDmInput("");
    try {
      const token = await auth.currentUser.getIdToken(true);
      const body: Record<string, string> = {
        creatorId: creator.creatorId,
        fanId: auth.currentUser.uid,
        content: content.trim(),
      };
      if (dmThread) body.threadId = dmThread.id;
      if (attachmentUrl) {
        body.attachmentUrl = attachmentUrl;
        if (attachmentType) body.attachmentType = attachmentType;
      }
      const res = await fetch("/api/fanDmSend", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Failed to send");
      await fetchDmThreadAndMessages();
      requestAnimationFrame(() => dmMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch {
      setDmInput(prevInput);
    } finally {
      setDmSending(false);
    }
  };

  const sendDm = async () => {
    if (!creator?.creatorId || !auth.currentUser || !dmInput.trim()) return;
    await sendDmWithPayload(dmInput.trim());
  };

  const onDmFileSelected: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !auth.currentUser) return;
    const videoOn = creator?.monetization?.videoEnabled !== false;
    if (!videoOn && file.type.startsWith("video/")) {
      showToast?.("This creator doesn’t accept video attachments in DMs.", "info");
      return;
    }
    const caption = dmInput.trim();
    try {
      const { url, attachmentType } = await uploadFanDmAttachment(auth.currentUser.uid, file);
      await sendDmWithPayload(caption, url, attachmentType);
    } catch {
      /* silent */
    }
  };

  const stopDmRecording = useCallback(() => {
    const rec = dmMediaRecorderRef.current;
    if (!rec || rec.state === "inactive") {
      setDmRecordingVoice(false);
      setDmVoiceMeterStream(null);
      return;
    }
    stopMediaRecorderSafe(rec);
  }, []);

  const startDmVoiceRecording = async () => {
    if (!auth.currentUser || !creator?.creatorId || dmRecordingVoice) return;
    let stream: MediaStream | null = null;
    try {
      try {
        const permissionStatus = await navigator.permissions.query({ name: "microphone" as PermissionName });
        if (permissionStatus.state === "denied") return;
      } catch {
        /* permissions.query unsupported */
      }

      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setDmVoiceMeterStream(stream);
      setDmVoiceMeterKey((k) => k + 1);
      const rec = createAudioMediaRecorder(stream);
      const requestedMime = rec.mimeType || undefined;
      dmMediaChunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size) dmMediaChunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        setDmVoiceMeterStream(null);
        stream.getTracks().forEach((t) => t.stop());
        setDmRecordingVoice(false);
        dmMediaRecorderRef.current = null;
        const chunks = dmMediaChunksRef.current;
        dmMediaChunksRef.current = [];
        const uid = auth.currentUser?.uid;
        if (!chunks.length || !uid) return;
        const blobType = effectiveBlobType(rec, requestedMime);
        const blob = new Blob(chunks, { type: blobType });
        if (blob.size < 256) return;
        const fileType = normalizeVoiceRecordingFileType(blobType);
        const ext = fileExtensionForAudioMime(fileType);
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: fileType });
        try {
          const { url } = await uploadFanDmAttachment(uid, file);
          await sendDmWithPayload("", url, "audio");
        } catch {
          /* silent */
        }
      };
      dmMediaRecorderRef.current = rec;
      rec.start(AUDIO_RECORDER_TIMESLICE_MS);
      setDmRecordingVoice(true);
    } catch {
      setDmVoiceMeterStream(null);
    }
  };

  const toggleDmVoice = () => {
    if (dmRecordingVoice) stopDmRecording();
    else void startDmVoiceRecording();
  };

  /* Neutral theme defaults - creators should customize */
  const defaultBg = "#fafafa";
  const defaultPrimary = "#6366f1";
  const headerLogoRaw =
    (creator?.logo && String(creator.logo).trim()) ||
    (creator?.logoUrl && String(creator.logoUrl).trim()) ||
    "";
  const headerLogoCandidates = React.useMemo(() => {
    if (!headerLogoRaw) return [] as string[];
    const normalized = normalizeFirebaseStorageObjectPath(headerLogoRaw);
    return normalized !== headerLogoRaw ? [headerLogoRaw, normalized] : [headerLogoRaw];
  }, [headerLogoRaw]);
  const [headerLogoIndex, setHeaderLogoIndex] = useState(0);
  const [headerLogoFailed, setHeaderLogoFailed] = useState(false);
  useEffect(() => {
    setHeaderLogoIndex(0);
    setHeaderLogoFailed(false);
  }, [headerLogoRaw]);
  const headerLogoSrc = headerLogoCandidates[headerLogoIndex];
  const showHeaderLogo = Boolean(headerLogoSrc) && !headerLogoFailed;
  const onHeaderLogoError = useCallback(() => {
    const next = headerLogoIndex + 1;
    if (next < headerLogoCandidates.length) {
      setHeaderLogoIndex(next);
      return;
    }
    setHeaderLogoFailed(true);
  }, [headerLogoIndex, headerLogoCandidates.length]);

  if (loading) {
    return (
      <div className="stormij-theme storefront-landing-wrap min-h-screen flex items-center justify-center">
        <div className="text-center" style={{ color: "var(--text-muted)" }}>
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-[var(--accent)] border-t-transparent mx-auto mb-3" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (error || !creator) {
    return (
      <div className="stormij-theme storefront-landing-wrap min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md px-4" style={{ color: "var(--text)" }}>
          <h1 className="text-xl font-semibold mb-2">Not found</h1>
          <p style={{ color: "var(--text-muted)" }}>{error || "This creator page doesn't exist."}</p>
        </div>
      </div>
    );
  }

  const { theme, displayName, avatar, logo, bio, sections, sectionsOrder, rules, landingContent, monetization } = creator;
  const creatorAvatarRaw =
    (typeof avatar === "string" && avatar.trim() ? avatar.trim() : "") ||
    (typeof creator.avatarUrl === "string" && creator.avatarUrl.trim() ? creator.avatarUrl.trim() : "");
  const creatorAvatar = creatorAvatarRaw
    ? normalizeFirebaseStorageObjectPath(creatorAvatarRaw) || creatorAvatarRaw
    : "";
  const memberAvatar = auth.currentUser?.photoURL || creatorAvatar || "";
  const memberAvatarInitial = (auth.currentUser?.displayName || auth.currentUser?.email || "U").trim().charAt(0).toUpperCase();
  const chatEnabled = monetization?.chatEnabled !== false;
  const videoEnabled = monetization?.videoEnabled !== false;
  const storeCopy = resolveStoreCopy(landingContent);
  const guidelinesSectionTitle =
    (landingContent?.boundaryTitle && landingContent.boundaryTitle.trim()) || "Community Guidelines";
  const rulesBoundariesRaw = rules?.boundariesText;
  const guidelinesFromRulesOnly =
    typeof rulesBoundariesRaw === "string" && rulesBoundariesRaw.trim() !== "";
  const memberGuidelinesIntro = guidelinesFromRulesOnly
    ? rulesBoundariesRaw.trim()
    : (landingContent?.boundaryText || "").trim();
  const memberGuidelinesLines = guidelinesFromRulesOnly
    ? []
    : (landingContent?.boundaryLines ?? []).filter((l) => String(l).trim());
  const showMemberGuidelines = !!(memberGuidelinesIntro || memberGuidelinesLines.length > 0);
  const tipMemberCopy = resolveTipSectionCopy(landingContent, "member");
  const avatarCropStyle: React.CSSProperties = getAvatarCropStyle(creator.avatarObjectPosition);
  const creatorDmPrimary = formatCreatorDmBubblePrimaryLine(displayName, creator.handle);
  const creatorDmSecondary = formatCreatorDmBubbleSecondaryLine(displayName, creator.handle);

  // Member view background - uses creator theme or neutral default
  const bg = theme?.background || defaultBg;
  const primary = theme?.primary || defaultPrimary;

  // Nav tabs: order from sectionsOrder, filtered by sections; hide Messages when chat disabled; always include Saved at the end
  const memberTabKeys = (sectionsOrder || ["feed", "treats", "tip", "messages", "about"])
    .filter((key) => key !== "saved" && (sections as Record<string, boolean>)?.[key] !== false)
    .filter((key) => key !== "messages" || chatEnabled);
  const navLabels: Record<string, string> = {
    feed: "Home",
    treats: storeCopy.memberStoreTitle,
    tip: "Tip",
    messages: "Messages",
    saved: "Saved",
    about: "About",
  };

  // Render legal pages (Terms/Privacy) if subpage is set
  if (legalSubpage) {
    const legalText = legalSubpage === "terms" 
      ? (creator.legal?.termsText || DEFAULT_TERMS_OF_SERVICE)
      : (creator.legal?.privacyText || DEFAULT_PRIVACY_POLICY);
    const legalTitle = legalSubpage === "terms" ? "Terms of Service" : "Privacy Policy";
    const lastUpdated = legalSubpage === "terms" 
      ? creator.legal?.termsLastUpdated 
      : creator.legal?.privacyLastUpdated;

    return (
      <div 
        className="min-h-screen py-8 px-4"
        style={{ backgroundColor: bg }}
      >
        <div className="max-w-3xl mx-auto">
          {/* Back link */}
          <a 
            href={`/${creator.handle}`}
            className="inline-flex items-center gap-2 text-sm mb-6 hover:opacity-80 transition"
            style={{ color: primary }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to {displayName}
          </a>

          {/* Legal content card */}
          <div 
            className="rounded-2xl p-6 md:p-8"
            style={{ 
              backgroundColor: "white",
              boxShadow: "0 4px 24px rgba(0,0,0,0.06)"
            }}
          >
            {/* Header */}
            <div className="mb-6 pb-6 border-b" style={{ borderColor: `${primary}22` }}>
              <div className="flex items-center gap-3 mb-3">
                {creatorAvatar && (
                  <img src={creatorAvatar} alt="" className="w-10 h-10 rounded-full object-cover" style={avatarCropStyle} />
                )}
                <span className="text-sm font-medium" style={{ color: "#666" }}>{displayName}</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold" style={{ color: "#1a1a1a" }}>
                {legalTitle}
              </h1>
              {lastUpdated && (
                <p className="text-sm mt-2" style={{ color: "#888" }}>
                  Last updated: {lastUpdated}
                </p>
              )}
            </div>

            {/* Legal text content */}
            <div 
              className="prose prose-lg max-w-none"
              style={{ color: "#333" }}
            >
              {legalText.split('\n\n').map((paragraph, i) => {
                // Check if this is a heading (all caps or starts with a heading marker)
                const isHeading = /^[A-Z][A-Z\s—–-]+$/.test(paragraph.trim()) || 
                                  paragraph.trim().match(/^#{1,3}\s/);
                
                if (isHeading) {
                  const headingText = paragraph.replace(/^#{1,3}\s/, '').trim();
                  return (
                    <h2 
                      key={i} 
                      className="text-lg font-bold mt-8 mb-4"
                      style={{ color: "#1a1a1a" }}
                    >
                      {headingText}
                    </h2>
                  );
                }
                
                return (
                  <p key={i} className="mb-4 leading-relaxed" style={{ lineHeight: "1.75" }}>
                    {paragraph}
                  </p>
                );
              })}
            </div>

            {/* Footer */}
            <div className="mt-8 pt-6 border-t text-center" style={{ borderColor: `${primary}22` }}>
              <a 
                href={`/${creator.handle}`}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-medium transition hover:opacity-90"
                style={{ backgroundColor: primary, color: "white" }}
              >
                Return to {displayName}'s page
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isViewingOwnStorefront =
    !!creator?.creatorId && !!auth.currentUser?.uid && auth.currentUser.uid === creator.creatorId;
  const showLanding = previewMember
    ? false
    : forcePublicLanding || isViewingOwnStorefront || !isLoggedIn || !subscribed;

  const storefrontTermsPath =
    typeof window !== "undefined" && isConfiguredCustomStorefrontHost(window.location.hostname)
      ? "/terms"
      : `/${creator.handle}/terms`;
  const storefrontPrivacyPath =
    typeof window !== "undefined" && isConfiguredCustomStorefrontHost(window.location.hostname)
      ? "/privacy"
      : `/${creator.handle}/privacy`;

  if (showLanding) {
    return (
      <>
        <FanLandingPage
          creator={creator}
          onSubscribe={handleSubscribe}
          onJoinFree={handleJoinFree}
          onOpenFanAuth={(view) => {
            setFanAuthView(view);
            setFanAuthOpen(true);
          }}
          subscribing={subscribing}
          joiningFree={joiningFree}
          isLoggedIn={isLoggedIn}
          publicTreatsOnLanding={creator.publicTreatsOnLanding === true}
          sectionsTreatsEnabled={creator.sections?.treats !== false}
          landingTreatProducts={landingTreatsProducts}
          landingTreatsLoading={landingTreatsLoading}
          onGuestPurchaseTreat={handleGuestTreatPurchase}
          guestTreatPurchasingId={guestTreatPurchasingId}
          treatLinkAccountMessage={treatLinkMessage}
          termsHref={storefrontTermsPath}
          privacyHref={storefrontPrivacyPath}
          homeHref="/"
        />
        {fanAuthOpen && (
          <FanAuthModal
            isOpen={fanAuthOpen}
            onClose={() => setFanAuthOpen(false)}
            initialView={fanAuthView}
            creatorId={creator.creatorId}
            displayName={displayName}
            logo={creator.logo || creator.logoUrl}
            avatar={creator.avatar}
            themePrimary={creator.theme?.primary}
            themeText={creator.theme?.text}
            fontFamily={creator.theme?.fontFamily}
            branding={creator.fanAuthBranding ?? null}
            termsHref={storefrontTermsPath}
            privacyHref={storefrontPrivacyPath}
            freeAccessEnabled={creator.monetization?.freeAccessEnabled === true}
          />
        )}
      </>
    );
  }

  const globalFont = theme?.fontFamily || "Inter, sans-serif";

  return (
    <div
      className="min-h-screen stormij-theme"
      style={{ 
        fontFamily: globalFont,
        backgroundColor: bg,
        "--fan-primary": primary,
        "--fan-accent": primary,
        "--fan-accent-hover": theme?.accentHover ?? primary,
        "--fan-bg": bg,
        "--fan-text": theme?.text || "#1f2937",
        "--fan-border": theme?.border || "rgba(201, 112, 130, 0.2)",
      } as React.CSSProperties}
    >
      {memberUsernameRequired && creator && !previewMember && (
        <MemberUsernameGateModal
          creatorId={creator.creatorId}
          creatorDisplayName={displayName}
          primaryColor={primary}
          textColor={theme?.text}
          onComplete={() => setMemberUsernameRequired(false)}
        />
      )}
      {/* Member Header */}
      <header
        className="storefront-member-header storefront-member-header--leftnav"
        style={{ backgroundColor: `${primary}14` }}
      >
        <div className="storefront-member-header-row flex items-center justify-between px-4 sm:px-6 py-3 gap-2 min-w-0 max-w-[1360px] mx-auto w-full">
          <div className="storefront-header-left">
            {showHeaderLogo ? (
              <img
                key={headerLogoSrc}
                src={headerLogoSrc}
                alt={displayName}
                className="storefront-header-logo"
                onError={onHeaderLogoError}
              />
            ) : (
              <div className="storefront-header-wordmark" aria-label={`${displayName} logo`}>
                <span className="storefront-header-wordmark-main">
                  {creator.handle?.toLowerCase() === "stormijxo" ? "STORMI J XO" : (displayName || "Creator").toUpperCase()}
                </span>
                <span className="storefront-header-wordmark-sub">
                  {(creator.fanAuthBranding?.communityName || "Inner Circle").trim() || "Inner Circle"}
                </span>
              </div>
            )}
          </div>
          <nav className="storefront-header-nav">
            {memberTabKeys.map((key) => {
              const isTip = key === "tip";
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={`storefront-nav-btn ${isTip ? "storefront-nav-tip" : ""} ${activeTab === key ? "active" : ""}`}
                  title={key === "saved" ? "Saved posts" : undefined}
                >
                  {key === "feed" && (
                    <svg className="storefront-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                  )}
                  {key === "treats" && (
                    <svg className="storefront-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 12 20 22 4 22 4 12" />
                      <rect x="2" y="7" width="20" height="5" />
                      <line x1="12" y1="22" x2="12" y2="7" />
                      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                    </svg>
                  )}
                  {key === "tip" && (
                    <svg className="storefront-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  )}
                  {key === "messages" && (
                    <svg className="storefront-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  )}
                  {key === "saved" && (
                    <svg className="storefront-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                  )}
                  {key === "about" && (
                    <svg className="storefront-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4M12 8h.01" />
                    </svg>
                  )}
                  <span className="inline-flex items-center gap-1">
                    {navLabels[key] || key}
                    {key === "messages" && unreadMessageTabCount > 0 ? (
                      <span
                        className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-none inline-flex items-center justify-center text-white"
                        style={{ backgroundColor: primary }}
                        aria-label={`${unreadMessageTabCount} unread messages`}
                      >
                        {unreadMessageTabCount > 9 ? "9+" : unreadMessageTabCount}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
            <div className="storefront-header-actions">
              {isLoggedIn && (
                <FanHubNotificationBell
                  accentColor={primary}
                  iconColor={theme?.text || "#6f4858"}
                  className="storefront-header-notify-bell"
                />
              )}
              <div className="storefront-profile-menu-wrap" ref={profileMenuRef}>
                <button
                  type="button"
                  className="storefront-profile-menu-trigger"
                  onClick={() => setProfileMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={profileMenuOpen}
                  title="Profile menu"
                >
                  {memberAvatar ? (
                    <img src={memberAvatar} alt="" className="storefront-profile-menu-avatar" style={avatarCropStyle} />
                  ) : (
                    <span className="storefront-profile-menu-avatar storefront-profile-menu-avatar-fallback">{memberAvatarInitial}</span>
                  )}
                </button>
                {profileMenuOpen && (
                  <div className="storefront-profile-menu-dropdown" role="menu">
                    <button type="button" role="menuitem" className="storefront-profile-menu-item" onClick={handleOpenProfile}>
                      Your profile
                    </button>
                    <button type="button" role="menuitem" className="storefront-profile-menu-item" onClick={handleSendProblem}>
                      Send a problem
                    </button>
                    <button type="button" role="menuitem" className="storefront-profile-menu-item" onClick={handleLogout}>
                      Log out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </nav>
        </div>
      </header>

      {cancelMembershipMessage && (
        <div className="storefront-cancel-message" role="alert" style={{ backgroundColor: `${primary}18`, color: theme?.text || "#1f2937" }}>
          {cancelMembershipMessage}
        </div>
      )}

      {!entitlementLoading && (
        <div className="fan-member-content">
            {activeTab === "feed" && (
              <FanMemberFeed
                creatorId={creator.creatorId}
                displayName={displayName}
                avatar={creatorAvatar}
                avatarObjectPosition={creator.avatarObjectPosition}
                primary={primary}
                feedSettings={creator.feedSettings}
                fanId={auth.currentUser?.uid}
                onOpenSaved={() => setActiveTab("saved")}
              />
            )}
            {activeTab === "saved" && (
              <FanMemberSaved
                creatorId={creator.creatorId}
                displayName={displayName}
                avatar={creatorAvatar}
                avatarObjectPosition={creator.avatarObjectPosition}
                primary={primary}
                feedSettings={creator.feedSettings}
                fanId={auth.currentUser?.uid}
              />
            )}
            {activeTab === "treats" && (
              <div className="fan-member-treats">
                {treatsLoading ? (
                  <p className="fan-member-loading">{storeCopy.memberStoreLoadingMessage}</p>
                ) : treatsProducts.length === 0 ? (
                  <p className="fan-member-empty">{storeCopy.memberStoreEmptyMessage}</p>
                ) : (
                  <div className="fan-member-treats-grid">
                    {treatsProducts.map((p) => {
                      const owned = unlockedProductIds.includes(p.id);
                      return (
                        <div key={p.id} className="fan-member-treat-card">
                          <p className="fan-member-treat-type">{p.type.replace(/_/g, " ")}</p>
                          <h3 className="fan-member-treat-title">{p.title}</h3>
                          {p.description && (
                            <p className="fan-member-treat-desc">{p.description}</p>
                          )}
                          <p className="fan-member-treat-price">{formatPrice(p.priceCents)}</p>
                          <div className="fan-member-treat-action">
                            {owned ? (
                              <span className="fan-member-treat-owned">Purchased</span>
                            ) : (
                              <button
                                type="button"
                                disabled={!!purchasingId}
                                onClick={() => handlePurchase(p.id)}
                                className="fan-member-treat-buy"
                                style={{ backgroundColor: primary }}
                              >
                                {purchasingId === p.id ? "Processing…" : "Purchase"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {activeTab === "messages" && (
              <div className="fan-member-messages">
                {!isLoggedIn ? (
                  <p className="fan-member-empty">Log in to message {displayName}.</p>
                ) : dmLoading ? (
                  <p className="fan-member-loading">Loading...</p>
                ) : fanBanned ? (
                  <p className="fan-member-banned">You cannot message this creator.</p>
                ) : (
                  <>
                    <p className="fan-member-messages-title">Conversation with {displayName}</p>
                    <div className="fan-member-messages-list">
                      {dmMessages.length === 0 ? (
                        <p className="fan-member-messages-empty">No messages yet. Say hi below.</p>
                      ) : (
                        dmMessages.map((m, i) => {
                          const fanUid = auth.currentUser?.uid;
                          const isFan = dmThread
                            ? m.senderId === dmThread.fanId
                            : m.senderId === fanUid;
                          const prev = dmMessages[i - 1];
                          const showDayDivider =
                            !prev ||
                            formatDmDayCalendarKey(prev.createdAt) !== formatDmDayCalendarKey(m.createdAt);
                          const dividerLabel = formatDmDateDividerLabel(m.createdAt);
                          const timeStr = formatDmShortTime(m.createdAt);
                          const fanLine = formatDmBubbleAuthorLine(dmLabels?.fan || "You");
                          return (
                            <Fragment key={m.id}>
                              {showDayDivider && dividerLabel ? (
                                <div className="fh-dm-date-divider" role="separator">
                                  <span className="fh-dm-date-divider__line" aria-hidden />
                                  <span className="fh-dm-date-divider__label">{dividerLabel}</span>
                                  <span className="fh-dm-date-divider__line" aria-hidden />
                                </div>
                              ) : null}
                              <div
                                className={`fan-member-message ${isFan ? "fan-member-message-sent" : "fan-member-message-received"}`}
                              >
                                <div
                                  className={`fh-dm-chat-row ${isFan ? "fh-dm-chat-row--out" : "fh-dm-chat-row--in"}`}
                                >
                                  <div
                                    className={`fh-dm-bubble-wrap ${isFan ? "fh-dm-bubble-wrap--out" : "fh-dm-bubble-wrap--in"}`}
                                  >
                                    <div className={`fh-dm-bubble ${isFan ? "fh-dm-bubble--me" : "fh-dm-bubble--them"}`}>
                                      {isFan ? (
                                        <div className="fh-dm-bubble__head fh-dm-bubble__head--primary">{fanLine}</div>
                                      ) : (
                                        <div className="fh-dm-bubble__head-stack">
                                          <div className="fh-dm-bubble__head fh-dm-bubble__head--primary">{creatorDmPrimary}</div>
                                          {creatorDmSecondary ? (
                                            <div className="fh-dm-bubble__head fh-dm-bubble__head--secondary">
                                              {creatorDmSecondary}
                                            </div>
                                          ) : null}
                                        </div>
                                      )}
                                      <div className="fh-dm-bubble__body">
                                        {m.attachmentUrl && m.attachmentType === "image" ? (
                                          <div className="fh-dm-attachment">
                                            <img src={m.attachmentUrl} alt="" loading="lazy" />
                                          </div>
                                        ) : null}
                                        {m.attachmentUrl && m.attachmentType === "video" ? (
                                          <div className="fh-dm-attachment">
                                            <video src={m.attachmentUrl} controls playsInline />
                                          </div>
                                        ) : null}
                                        {m.attachmentUrl &&
                                        (m.attachmentType === "audio" ||
                                          (inferIsAudioFromUrl(m.attachmentUrl) &&
                                            m.attachmentType !== "image" &&
                                            m.attachmentType !== "video")) ? (
                                          <div className="fh-dm-attachment">
                                            <DmAudioPlayer src={m.attachmentUrl} className="w-full max-w-sm" />
                                          </div>
                                        ) : null}
                                        {m.content?.trim() ? m.content : null}
                                        {!m.content?.trim() && !m.attachmentUrl ? (
                                          <span className="italic opacity-70">(empty message)</span>
                                        ) : null}
                                      </div>
                                      {isFan && timeStr ? (
                                        <div className="fh-dm-bubble__foot fh-dm-bubble__foot--me">
                                          {timeStr}
                                          {m.read ? (
                                            <span className="fh-dm-bubble__receipt" title="Creator has seen this">
                                              {" "}
                                              — Read
                                            </span>
                                          ) : (
                                            <span
                                              className="fh-dm-bubble__receipt fh-dm-bubble__receipt--unread"
                                              title="Not read yet"
                                            >
                                              {" "}
                                              — Unread
                                            </span>
                                          )}
                                        </div>
                                      ) : null}
                                    </div>
                                    {!isFan && timeStr ? (
                                      <div className="fh-dm-meta-below">{timeStr}</div>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            </Fragment>
                          );
                        })
                      )}
                      <div ref={dmMessagesEndRef} aria-hidden />
                    </div>
                    <div className="fan-member-messages-compose-wrap">
                      {dmRecordingVoice && dmVoiceMeterStream ? (
                        <div className="w-full space-y-1">
                          <RecordingDurationLabel active={dmRecordingVoice} />
                          <AudioLevelMeter key={`dm-fan-voice-${dmVoiceMeterKey}`} stream={dmVoiceMeterStream} barColor={primary} />
                        </div>
                      ) : null}
                      <div className="fan-member-messages-compose">
                      <input
                        ref={dmFileInputRef}
                        type="file"
                        accept={videoEnabled ? "image/*,video/*" : "image/*"}
                        className="hidden"
                        onChange={onDmFileSelected}
                      />
                      <div className="fh-dm-compose-actions">
                        <button
                          type="button"
                          className="fh-dm-compose-icon"
                          title={videoEnabled ? "Photo or video" : "Photo"}
                          aria-label={videoEnabled ? "Upload photo or video" : "Upload photo"}
                          disabled={dmSending || fanBanned}
                          onClick={() => dmFileInputRef.current?.click()}
                        >
                          <DmPhotoIcon />
                        </button>
                        <button
                          type="button"
                          className={`fh-dm-compose-icon ${dmRecordingVoice ? "fh-dm-compose-icon--recording" : ""}`}
                          title={dmRecordingVoice ? "Stop and send" : "Voice message"}
                          aria-label={dmRecordingVoice ? "Stop recording" : "Record voice"}
                          disabled={dmSending || fanBanned}
                          onClick={() => toggleDmVoice()}
                        >
                          <DmMicIcon />
                        </button>
                      </div>
                      <textarea
                        ref={dmTextareaRef}
                        rows={1}
                        value={dmInput}
                        onChange={(e) => setDmInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void sendDm();
                          }
                        }}
                        placeholder="Message"
                        className="fan-member-messages-input"
                      />
                      <button
                        type="button"
                        disabled={dmSending || !dmInput.trim()}
                        onClick={sendDm}
                        className="fan-member-messages-send"
                        style={{ backgroundColor: primary }}
                      >
                        {dmSending ? "Sending…" : "Send"}
                      </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            {activeTab === "tip" && (
              <TipSection
                creatorId={creator.creatorId}
                displayName={displayName}
                primary={primary}
                tipHeading={tipMemberCopy.heading}
                tipSubline={tipMemberCopy.subline}
                tipSelectedPreset={tipSelectedPreset}
                setTipSelectedPreset={setTipSelectedPreset}
                tipCustomAmount={tipCustomAmount}
                setTipCustomAmount={setTipCustomAmount}
                tipLoading={tipLoading}
                setTipLoading={setTipLoading}
              />
            )}
            {activeTab === "about" && (
              <div className="fan-member-about">
                <h2 className="fan-member-about-title">About {displayName}</h2>
                {bio && (
                  <div className="fan-member-about-section">
                    <p className="fan-member-about-bio">{bio}</p>
                  </div>
                )}
                {showMemberGuidelines ? (
                  <div className="fan-member-about-section">
                    <h3 className="fan-member-about-heading">{guidelinesSectionTitle}</h3>
                    {memberGuidelinesIntro ? <p className="fan-member-about-text">{memberGuidelinesIntro}</p> : null}
                    {memberGuidelinesLines.length > 0 ? (
                      <ul className="list-none m-0 mt-2 p-0 space-y-2">
                        {memberGuidelinesLines.map((line, i) => {
                          const marker: LandingSectionListMarker =
                            landingContent?.boundaryLinesMarker ?? "check";
                          if (marker === "none") {
                            return (
                              <li key={i} className="text-sm leading-relaxed" style={{ color: "var(--fan-text-muted)" }}>
                                {line}
                              </li>
                            );
                          }
                          const glyph = marker === "heart" ? "♥" : marker === "dot" ? "•" : "✓";
                          return (
                            <li key={i} className="flex gap-2 items-start text-sm leading-relaxed">
                              <span className="shrink-0 w-4 text-center" style={{ color: primary }}>
                                {glyph}
                              </span>
                              <span style={{ color: "var(--fan-text-muted)" }}>{line}</span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                {!bio && !showMemberGuidelines && (
                  <p className="fan-member-empty">No about or guidelines added yet.</p>
                )}
              </div>
            )}
        </div>
      )}
    </div>
  );
};
