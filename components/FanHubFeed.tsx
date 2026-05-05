import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAppContext } from "./AppContext";
import { ECHOFLUX_ELITE_MONTHLY_USD } from "../constants";
import { hasEliteAccess } from "../src/utils/planAccess";
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  doc,
  runTransaction,
  getDoc,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  setDoc,
  deleteField,
  type QueryDocumentSnapshot,
  type DocumentData,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { isMediaSlotLocked, isProtectedLockedMediaUrl, type LockedPostContent } from "../src/lib/lockedPostMedia";
import { getAvatarCropStyle } from "../src/lib/avatarCrop";
import { inferIsVideoFromUrl, normalizePostMediaTypes } from "../src/lib/mediaUrlInfer";
import { getFeedGridCoverMedia } from "../src/lib/feedGridCover";
import { ViewPostModalVideo } from "./ViewPostModalVideo";
import { FeedVideoPlaybackErrorOverlay } from "./FeedVideoPlaybackError";
import {
  fanMemberListLabel,
  feedCommentAuthorLabel,
  feedCommentAuthorInitial,
} from "../src/lib/feedCommentLabel";
import { renderTextWithCustomEmoji, type SjHeartEmojiAccessContext } from "../src/lib/customEmoji";
import { EmojiIcon } from "./icons/UIIcons";
import { useFanFeedCommentEmojiPicker } from "./fanFeedCommentEmojiPicker";
import {
  captureFanFeedCarouselScrollSnaps,
  restoreFanFeedCarouselScrollSnaps,
} from "../src/lib/fanFeedCarouselScrollRestore";
import { tryFeedVideoPosterSeekOnce } from "../src/lib/feedVideoPosterSeek";
import {
  feedSlideMediaBlurStyle,
  mediaPreviewBlurFilterStyle,
  normalizeMediaPreviewBlurPx,
} from "../src/lib/feedMediaPreviewBlur";
import { fetchCreatorFanPostMedia } from "../src/lib/fetchCreatorFanPostMedia";
import type { FanHubPostKind, LiveStreamPromoOnPost } from "../types";
import { LiveStreamPromoBanner, type LiveStreamCreatorBroadcastProps } from "./LiveStreamPromoBanner";

const feedImageDownloadGuardProps = {
  draggable: false as const,
  onContextMenu: (e: React.MouseEvent<HTMLImageElement>) => e.preventDefault(),
};

const feedVideoDownloadGuardProps = {
  controlsList: "nodownload noplaybackrate noremoteplayback" as const,
  onContextMenu: (e: React.MouseEvent<HTMLVideoElement>) => e.preventDefault(),
};

function pickUserDocPhotoUrl(d: Record<string, unknown> | undefined): string | undefined {
  if (!d) return undefined;
  for (const k of ["photoURL", "avatarUrl", "avatar", "photoUrl"] as const) {
    const v = d[k];
    if (typeof v === "string" && v.trim()) {
      const u = v.trim();
      if (u.startsWith("http") || u.startsWith("//") || u.startsWith("data:")) return u;
    }
  }
  return undefined;
}

/** Avatar in “who liked” modal — photo with initial fallback. */
function FanFeedLikerAvatar({ photoURL, label }: { photoURL?: string; label: string }) {
  const [broken, setBroken] = useState(false);
  const showImg = Boolean(photoURL && !broken);
  return (
    <span className="feed-likers-modal-card__avatar">
      {showImg ? (
        <img
          src={photoURL}
          alt=""
          className="feed-likers-modal-card__avatar-img"
          {...feedImageDownloadGuardProps}
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="feed-likers-modal-card__avatar-initial" aria-hidden>
          {feedCommentAuthorInitial(label)}
        </span>
      )}
    </span>
  );
}

/** Themed multi-media count pill — tints border/background/shadow from creator storefront `theme.primary` */
function normalizeThemePrimary(hex: string | undefined): string | undefined {
  if (!hex || typeof hex !== "string") return undefined;
  let h = hex.trim();
  if (!h) return undefined;
  if (!h.startsWith("#")) h = `#${h}`;
  if (/^#[0-9a-fA-F]{3}$/.test(h)) {
    const a = h[1];
    const b = h[2];
    const c = h[3];
    h = `#${a}${a}${b}${b}${c}${c}`;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(h)) return undefined;
  return h;
}

function feedCardCountThemedStyle(primaryHex: string | undefined): React.CSSProperties | undefined {
  const hex = normalizeThemePrimary(primaryHex);
  if (!hex) return undefined;
  const n = parseInt(hex.slice(1), 16);
  if (Number.isNaN(n)) return undefined;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const bgR = Math.round(255 * 0.78 + r * 0.22);
  const bgG = Math.round(255 * 0.78 + g * 0.22);
  const bgB = Math.round(255 * 0.78 + b * 0.22);
  const tr = Math.max(0, Math.min(255, Math.round(r * 0.52)));
  const tg = Math.max(0, Math.min(255, Math.round(g * 0.52)));
  const tb = Math.max(0, Math.min(255, Math.round(b * 0.52)));
  const textRgb = `rgb(${tr},${tg},${tb})`;
  return {
    color: textRgb,
    borderColor: `rgba(${r},${g},${b},0.38)`,
    background: `rgb(${bgR},${bgG},${bgB})`,
    boxShadow: `0 2px 10px rgba(${r},${g},${b},0.16)`,
    ["--feed-card-count-divider" as string]: `rgba(${tr},${tg},${tb},0.38)`,
  };
}

export type FeedVisibilitySettings = {
  hideLikeCounts: boolean;
  hideComments: boolean;
  hideLikes: boolean;
  hideTipButton: boolean;
  /** Elite: AI auto-reply to comments (max 2 replies per fan per post; random chance for non-supporters) */
  autoReplyAI?: boolean;
  /** Elite: 0–100, chance to reply to a comment when not from a tipper/buyer (e.g. 25 = 25%) */
  autoReplyChance?: number;
};

export type FeedPost = {
  id: string;
  body: string;
  mediaUrls: string[];
  mediaTypes?: ("image" | "video")[];
  audioUrls?: string[];
  createdAt?: { toDate: () => Date } | string;
  likeCount: number;
  likedBy?: string[];
  comments: { username?: string; author?: string; text: string; hidden?: boolean; authorId?: string; isCreatorReply?: boolean }[];
  captionStyle?: "static" | "scroll-up" | "scroll-across" | "dissolve";
  overlayText?: string;
  overlayTextColor?: string;
  overlayTextSize?: number;
  overlayHighlight?: boolean;
  overlayItalic?: boolean;
  hideComments?: boolean;
  hideLikes?: boolean;
  hideLikeCounts?: boolean;
  showTipButton?: boolean;
  poll?: { question: string; options: string[]; optionVotes?: number[] };
  tipGoal?: { description: string; targetCents: number; raisedCents: number };
  lockedContent?: LockedPostContent;
  /** Optional blur on image/video (see `feedSlideMediaBlurStyle`). */
  mediaPreviewBlurPx?: number;
  status?: "published" | "scheduled" | "draft";
  pinned?: boolean;
  pinnedAt?: { toDate: () => Date } | string;
  calendarDate?: string;
  calendarTime?: string;
  scheduledAt?: { toDate: () => Date } | Date | null;
  publishedAt?: { toDate: () => Date } | Date | null;
  /** Firestore document path for like/comment writes (subcollection doc the feed loaded). */
  feedFirestorePath?: string;
  postKind?: FanHubPostKind;
  liveStreamPromo?: LiveStreamPromoOnPost;
};

function parseLiveStreamPromoFromDoc(d: DocumentData): LiveStreamPromoOnPost | undefined {
  const raw = d.liveStreamPromo;
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const streamId = typeof o.streamId === "string" ? o.streamId.trim() : "";
  if (!streamId) return undefined;
  const ticketCents =
    typeof o.ticketCents === "number" && Number.isFinite(o.ticketCents)
      ? Math.max(0, Math.round(o.ticketCents))
      : 0;
  const promo: LiveStreamPromoOnPost = { streamId, ticketCents };
  if (typeof o.title === "string" && o.title.trim()) promo.title = o.title.trim();
  if (typeof o.scheduledStart === "string" && o.scheduledStart.trim()) {
    promo.scheduledStart = o.scheduledStart.trim();
  }
  if (o.freeForSubscribers === true) promo.freeForSubscribers = true;
  if (o.creatorTestOnly === true) promo.creatorTestOnly = true;
  const ss = typeof o.streamStatus === "string" ? o.streamStatus.trim().toLowerCase() : "";
  const allowed = ["draft", "scheduled", "live", "ended", "cancelled"] as const;
  if (allowed.includes(ss as (typeof allowed)[number])) {
    promo.streamStatus = ss as (typeof allowed)[number];
  }
  return promo;
}

function feedPostCreatedMs(p: FeedPost): number {
  const c = p.createdAt;
  if (!c) return 0;
  if (typeof c === "string") return new Date(c).getTime() || 0;
  try {
    return (c as { toDate?: () => Date }).toDate?.()?.getTime() ?? 0;
  } catch {
    return 0;
  }
}

/** Map Firestore doc → FeedPost; supports Compose (`content`, `Published`) + Fan Hub Posts (`fanPosts`). */
function firestoreDocToFeedPost(docSnap: QueryDocumentSnapshot<DocumentData>, isAdminMode: boolean): FeedPost | null {
  const d = docSnap.data();
  const raw = d.status;
  const s = String(raw ?? "published").trim().toLowerCase();
  let status: NonNullable<FeedPost["status"]> = "published";
  if (s === "draft") status = "draft";
  else if (s === "scheduled") status = "scheduled";
  else status = "published";
  if (status !== "published") return null;

  const createdRaw = d.createdAt ?? d.publishedAt;
  let createdAt: FeedPost["createdAt"] = new Date().toISOString();
  if (
    createdRaw &&
    typeof createdRaw === "object" &&
    "toDate" in createdRaw &&
    typeof (createdRaw as { toDate: () => Date }).toDate === "function"
  ) {
    createdAt = createdRaw as { toDate: () => Date };
  } else if (typeof createdRaw === "string") {
    createdAt = createdRaw;
  }

  let rawMediaUrls: string[] = Array.isArray(d.mediaUrls)
    ? (d.mediaUrls as string[]).filter((u): u is string => typeof u === "string" && !!u.trim())
    : [];
  if (rawMediaUrls.length === 0 && d.mediaUrl) {
    rawMediaUrls = [String(d.mediaUrl)];
  }

  const liveStreamPromo = parseLiveStreamPromoFromDoc(d);
  let postKind: FanHubPostKind | undefined;
  if (liveStreamPromo) {
    postKind = "live_stream_promo";
  } else if (d.postKind === "standard") {
    postKind = "standard";
  }

  if (liveStreamPromo?.creatorTestOnly && !isAdminMode) {
    return null;
  }

  return {
    id: docSnap.id,
    body: (d.body as string) ?? (d.caption as string) ?? (d.content as string) ?? "",
    mediaUrls: rawMediaUrls,
    mediaTypes: normalizePostMediaTypes(rawMediaUrls, (d.mediaTypes as string[]) ?? []),
    audioUrls: (d.audioUrls as string[]) ?? [],
    createdAt,
    likeCount: typeof d.likeCount === "number" ? d.likeCount : typeof d.likesCount === "number" ? d.likesCount : 0,
    likedBy: (d.likedBy as string[]) ?? [],
    comments: (d.comments as FeedPost["comments"]) ?? [],
    captionStyle: (d.captionStyle as FeedPost["captionStyle"]) ?? "static",
    overlayText: typeof d.overlayText === "string" ? d.overlayText : undefined,
    overlayTextColor: typeof d.overlayTextColor === "string" ? d.overlayTextColor : undefined,
    overlayTextSize: typeof d.overlayTextSize === "number" ? d.overlayTextSize : 18,
    overlayHighlight: !!d.overlayHighlight,
    overlayItalic: !!d.overlayItalic,
    hideComments: !!d.hideComments,
    hideLikes: !!d.hideLikes,
    hideLikeCounts: !!d.hideLikeCounts,
    showTipButton: d.showTipButton !== false,
    poll: d.poll as FeedPost["poll"] | undefined,
    tipGoal: d.tipGoal as FeedPost["tipGoal"] | undefined,
    lockedContent: d.lockedContent as FeedPost["lockedContent"] | undefined,
    mediaPreviewBlurPx: (() => {
      const b = normalizeMediaPreviewBlurPx(d.mediaPreviewBlurPx);
      return b > 0 ? b : undefined;
    })(),
    status,
    pinned: !!d.pinned,
    pinnedAt: d.pinnedAt as FeedPost["pinnedAt"],
    feedFirestorePath: docSnap.ref.path,
    postKind,
    liveStreamPromo,
  };
}

function feedPostDocumentRef(post: FeedPost) {
  const path = post.feedFirestorePath?.trim();
  if (path) {
    const segs = path.split("/").filter(Boolean);
    if (segs.length >= 2 && segs.length % 2 === 0) {
      return doc(db, ...(segs as [string, ...string[]]));
    }
  }
  return doc(db, "posts", post.id);
}

const EditIcon = () => (
  <svg className="admin-action-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const DeleteIcon = () => (
  <svg className="admin-action-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const ToggleVisibilityIcon = ({ visible }: { visible: boolean }) => (
  visible ? (
    <svg className="admin-action-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg className="admin-action-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
);

const DotsMenuIcon = () => (
  <svg className="admin-dots-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="5" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="19" r="2" />
  </svg>
);

const PinIcon = () => (
  <svg className="admin-action-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 17v5" />
    <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78 9.02a1 1 0 0 0 1.78.91l1.78-9.02a2 2 0 0 1 1.11-1.79z" />
    <path d="M15 10.76a2 2 0 0 0 1.11 1.79l1.78 9.02a1 1 0 0 1-1.78.91l-1.78-9.02a2 2 0 0 0-1.11-1.79z" />
    <path d="M5 8h14v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8z" />
    <path d="M12 2v4" />
  </svg>
);

const HeartOutline = () => (
  <svg className="heart-outline" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

const HeartFilled = () => (
  <svg className="heart-filled" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

const CommentIcon = () => (
  <svg className="feed-card-comment-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const BookmarkOutline = () => (
  <svg className="bookmark-outline" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);

const BookmarkFilled = () => (
  <svg className="bookmark-filled" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);

const GridIcon = () => (
  <svg className="icon-grid" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
  </svg>
);

const TipIcon = () => (
  <span className="feed-card-tip-icon feed-card-tip-dollar" aria-hidden>$</span>
);

const FEED_VIDEO_TAP_MAX_PX = 14;

const PlayIcon = () => (
  <svg className="feed-card-play-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M8 5v14l11-7L8 5z" />
  </svg>
);

/** Grid cover: poster frame at rest; plays muted loop while `hoverActive` (desktop hover). */
function FeedGridVideoThumbnail({ src, hoverActive }: { src: string; hoverActive: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const posterSeekDoneRef = useRef(false);
  const clean = src.split("#")[0]?.trim() || src;
  const [hidePlayOverlay, setHidePlayOverlay] = useState(false);

  useEffect(() => {
    posterSeekDoneRef.current = false;
  }, [clean]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let cancelled = false;
    if (hoverActive) {
      void v.play().then(() => {
        if (!cancelled) setHidePlayOverlay(true);
      }).catch(() => {});
    } else {
      v.pause();
      setHidePlayOverlay(false);
      try {
        v.currentTime = 0;
      } catch {
        /* ignore */
      }
      posterSeekDoneRef.current = false;
      tryFeedVideoPosterSeekOnce(v, posterSeekDoneRef);
    }
    return () => {
      cancelled = true;
    };
  }, [hoverActive, clean]);

  return (
    <>
      <video
        ref={videoRef}
        src={clean}
        muted
        loop
        playsInline
        preload="metadata"
        {...feedVideoDownloadGuardProps}
        onLoadedMetadata={(e) => {
          tryFeedVideoPosterSeekOnce(e.currentTarget, posterSeekDoneRef);
        }}
      />
      <span
        className={`feed-grid-video-overlay${hidePlayOverlay ? " feed-grid-video-overlay--hidden" : ""}`}
        aria-hidden
      >
        <PlayIcon />
      </span>
    </>
  );
}

const VolumeOnIcon = () => (
  <svg className="feed-card-sound-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
);

const VolumeOffIcon = () => (
  <svg className="feed-card-sound-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </svg>
);

const MediaImageIcon = () => (
  <svg className="feed-card-count-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
    <circle cx="8.5" cy="10" r="1.5" />
    <path d="M21 15l-4.5-4.5a1 1 0 0 0-1.4 0L9 16.6" />
  </svg>
);

const MediaVideoIcon = () => (
  <svg className="feed-card-count-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="6" width="13" height="12" rx="2" ry="2" />
    <path d="M16 10l5-3v10l-5-3z" />
  </svg>
);

const FeedCarouselChevronLeft = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

const FeedCarouselChevronRight = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 18l6-6-6-6" />
  </svg>
);

function formatRelative(dateInput: Date | string | { toDate?: () => Date } | null | undefined): string {
  let date: Date | null = null;
  if (dateInput instanceof Date) date = dateInput;
  else if (typeof dateInput === "string") date = new Date(dateInput);
  else if (dateInput && typeof (dateInput as { toDate?: () => Date }).toDate === "function")
    date = (dateInput as { toDate: () => Date }).toDate();
  if (!date || Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  if (diffMs < 60000) return "Just now";
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)} min${Math.floor(diffMs / 60000) !== 1 ? "s" : ""}`;
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)} hr${Math.floor(diffMs / 3600000) !== 1 ? "s" : ""}`;
  if (diffMs < 604800000) return `${Math.floor(diffMs / 86400000)} day${Math.floor(diffMs / 86400000) !== 1 ? "s" : ""}`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const DEMO_POSTS: FeedPost[] = [
  {
    id: "demo-1",
    body: "Good morning everyone 🌸 Starting the day with some coffee and journaling. What's everyone up to today?",
    mediaUrls: ["https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&h=800&fit=crop"],
    mediaTypes: ["image"],
    audioUrls: [],
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    likeCount: 42,
    likedBy: [],
    comments: [
      { username: "sarah_m", text: "Love this! ☕" },
      { username: "jake22", text: "Same here, coffee is life" },
    ],
    showTipButton: true,
  },
  {
    id: "demo-2",
    body: "Behind the scenes from yesterday's shoot 📸 We had so much fun with this one. Can't wait to share more!",
    mediaUrls: ["https://images.unsplash.com/photo-1516575334481-f85287c2c82d?w=600&h=800&fit=crop"],
    mediaTypes: ["image"],
    audioUrls: [],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    likeCount: 128,
    likedBy: [],
    comments: [
      { username: "photofan", text: "These are amazing!" },
      { username: "creativemind", text: "Can't wait to see more 🔥" },
      { username: "artlover", text: "Stunning work as always" },
    ],
    showTipButton: true,
  },
  {
    id: "demo-3",
    body: "Quick life update: Been working on something really exciting that I'll share with you all soon. Hint: it involves a trip ✈️",
    mediaUrls: ["https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&h=800&fit=crop"],
    mediaTypes: ["image"],
    audioUrls: [],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    likeCount: 89,
    likedBy: [],
    comments: [
      { username: "traveler99", text: "Where are you going?!" },
    ],
    showTipButton: true,
  },
  {
    id: "demo-4",
    body: "Thinking about doing a Q&A session this week. Drop your questions below and I'll answer them in my next post 💬\n\nNo question is off limits (within reason 😉)",
    mediaUrls: [],
    mediaTypes: [],
    audioUrls: [],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    likeCount: 156,
    likedBy: [],
    comments: [
      { username: "curious_cat", text: "What's your morning routine?" },
      { username: "newfan", text: "How did you get started?" },
      { username: "longtime_supporter", text: "What's your favorite memory from this year?" },
    ],
    showTipButton: true,
  },
  {
    id: "demo-5",
    body: "New content dropping this weekend! 🎉 Make sure your notifications are on so you don't miss it.",
    mediaUrls: ["https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&h=800&fit=crop"],
    mediaTypes: ["image"],
    audioUrls: [],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    likeCount: 203,
    likedBy: [],
    comments: [],
    showTipButton: true,
  },
];

function FeedCardCaptionOverlay({
  caption,
  style: captionStyle,
  size,
  color,
  highlight,
  italic,
  sjHeartEmojiCtx,
}: {
  caption: string;
  style?: string;
  size?: number;
  color?: string;
  highlight?: boolean;
  italic?: boolean;
  sjHeartEmojiCtx: SjHeartEmojiAccessContext;
}) {
  if (!caption?.trim()) return null;
  const textStyle: React.CSSProperties = {
    ...(size != null && size > 0 ? { fontSize: `${size}px` } : {}),
    ...(color ? { color } : {}),
    ...(italic ? { fontStyle: "italic" } : {}),
    ...(highlight
      ? {
          backgroundColor: "rgba(0, 0, 0, 0.45)",
          borderRadius: "999px",
          padding: "0.25rem 0.7rem",
        }
      : {}),
  };
  return (
    <div className={`feed-card-caption-overlay feed-card-caption-overlay-${captionStyle || "static"}`} aria-hidden>
      <span className="feed-card-caption-overlay-text" style={textStyle}>
        {renderTextWithCustomEmoji(caption, sjHeartEmojiCtx)}
      </span>
    </div>
  );
}

function FeedCard({
  post,
  creatorName,
  creatorAvatar,
  avatarObjectPosition,
  currentUserId,
  savedPostIds,
  onLikeUpdated,
  onCommentsUpdated,
  onSavedUpdated,
  isAdminMode,
  onEditPost,
  onDeletePost,
  onToggleVisibility,
  onTogglePin,
  creatorThemePrimary,
  hideTipButtons,
  sjHeartEmojiCtx,
  openCommentsRequested,
  onOpenCommentsRequestConsumed,
  onCommentsOpenChange,
  creatorFanPreviewUrl,
  liveStreamCreatorBroadcast,
  liveStreamHostActiveStreamId,
}: {
  post: FeedPost;
  creatorName: string;
  creatorAvatar?: string;
  /** Matches storefront / My Page circular crop */
  avatarObjectPosition?: string;
  currentUserId?: string;
  savedPostIds: string[];
  onLikeUpdated?: (postId: string, likedBy: string[], likeCount: number) => void;
  onCommentsUpdated?: (postId: string, comments: FeedPost["comments"]) => void;
  onSavedUpdated?: (savedIds: string[]) => void;
  isAdminMode?: boolean;
  onEditPost?: (post: FeedPost) => void;
  onDeletePost?: (postId: string) => void;
  onToggleVisibility?: (postId: string, currentStatus: string) => void;
  onTogglePin?: (postId: string, currentlyPinned: boolean) => void;
  /** From `creators/{id}.theme.primary` — tints the multi-media count badge */
  creatorThemePrimary?: string;
  /** Global creator visibility setting applied to all posts for fans. */
  hideTipButtons?: boolean;
  sjHeartEmojiCtx: SjHeartEmojiAccessContext;
  openCommentsRequested?: boolean;
  onOpenCommentsRequestConsumed?: () => void;
  onCommentsOpenChange?: (isOpen: boolean) => void;
  /** Creator feed: `/{handle}?preview=member` on current origin when handle is saved */
  creatorFanPreviewUrl?: string;
  /** Creator dashboard: inline Go live / End / Open broadcast on live-stream cards */
  liveStreamCreatorBroadcast?: Omit<LiveStreamCreatorBroadcastProps, "streamId">;
  /** Matches `liveStreamBroadcast` in Fan Hub — enables host buttons before Firestore sync */
  liveStreamHostActiveStreamId?: string | null;
}) {
  const countBadgeStyle = useMemo(
    () => feedCardCountThemedStyle(creatorThemePrimary),
    [creatorThemePrimary]
  );
  const countBadgeClass =
    countBadgeStyle != null ? "feed-card-count feed-card-count--themed" : "feed-card-count";
  const viewPostLinkColor = normalizeThemePrimary(creatorThemePrimary);

  const urls = useMemo(
    () =>
      Array.isArray(post.mediaUrls)
        ? post.mediaUrls.filter((u): u is string => typeof u === "string" && !!u.trim())
        : [],
    [post.mediaUrls]
  );
  const firstUrl = urls[0];
  const mediaCount = urls.length;
  const [mediaSlideIndex, setMediaSlideIndex] = useState(0);

  useEffect(() => {
    setMediaSlideIndex(0);
  }, [post.id]);

  useEffect(() => {
    setMediaSlideIndex((i) => Math.min(i, Math.max(0, mediaCount - 1)));
  }, [mediaCount]);

  const slideIdx = mediaCount > 0 ? Math.min(mediaSlideIndex, mediaCount - 1) : 0;
  const currentUrl = urls[slideIdx];
  const currentProtectedPlaceholder = isProtectedLockedMediaUrl(currentUrl);
  const currentIsVideo =
    !!currentUrl &&
    (post.mediaTypes?.[slideIdx] === "video" || (!currentProtectedPlaceholder && inferIsVideoFromUrl(currentUrl)));
  const showMediaCarousel = mediaCount > 1;
  const lockedCurrent =
    isMediaSlotLocked(post.lockedContent, slideIdx, mediaCount) ||
    (!!post.lockedContent?.enabled && currentProtectedPlaceholder);
  const lockPriceCents = post.lockedContent?.priceCents;
  const lockPriceText =
    typeof lockPriceCents === "number" && Number.isFinite(lockPriceCents) && lockPriceCents > 0
      ? `Unlock $${(lockPriceCents / 100).toFixed(2)}`
      : "Locked";

  const blurPxNorm = normalizeMediaPreviewBlurPx(post.mediaPreviewBlurPx);
  const [adminResolvedMedia, setAdminResolvedMedia] = useState<{
    mediaUrls: string[];
    mediaTypes: ("image" | "video")[];
  } | null>(null);

  useEffect(() => {
    if (!isAdminMode || !currentUserId || !post.lockedContent?.enabled || blurPxNorm <= 0) {
      setAdminResolvedMedia(null);
      return;
    }
    let cancelled = false;
    void fetchCreatorFanPostMedia(currentUserId, post.id).then((res) => {
      if (cancelled || !res?.mediaUrls?.length) return;
      setAdminResolvedMedia({ mediaUrls: res.mediaUrls, mediaTypes: res.mediaTypes });
    });
    return () => {
      cancelled = true;
    };
  }, [isAdminMode, currentUserId, post.id, post.lockedContent?.enabled, blurPxNorm]);

  const adminRevealUrl = adminResolvedMedia?.mediaUrls[slideIdx];
  const adminRevealType = adminResolvedMedia?.mediaTypes[slideIdx];
  const showAdminLockedBlurPreview =
    isAdminMode &&
    blurPxNorm > 0 &&
    !!adminRevealUrl &&
    !isProtectedLockedMediaUrl(adminRevealUrl);
  const adminPlaceholderBlurStyle =
    showAdminLockedBlurPreview && blurPxNorm > 0 ? mediaPreviewBlurFilterStyle(blurPxNorm) : undefined;

  const hasTipGoal = !!(post.tipGoal && typeof post.tipGoal.targetCents === "number" && post.tipGoal.targetCents > 0);
  const mediaTotals = useMemo(() => {
    const items = urls;
    return items.reduce(
      (acc, url, index) => {
        const explicitType = post.mediaTypes?.[index];
        const detectedType =
          explicitType === "video" || inferIsVideoFromUrl(url || "") ? "video" : "image";
        if (detectedType === "video") acc.videos += 1;
        else acc.images += 1;
        return acc;
      },
      { images: 0, videos: 0 }
    );
  }, [urls, post.mediaTypes]);

  const dateStr = post.createdAt
    ? typeof post.createdAt === "string"
      ? formatRelative(post.createdAt)
      : (post.createdAt as { toDate: () => Date }).toDate
        ? formatRelative((post.createdAt as { toDate: () => Date }).toDate())
        : ""
    : "";

  const captionStyle = post.captionStyle ?? "static";
  const overlayCaption = post.overlayText?.trim() || (captionStyle !== "static" ? post.body?.trim() || "" : "");
  const showCaptionOnMedia = !!overlayCaption;
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [modalMediaIndex, setModalMediaIndex] = useState(0);
  const [likeSaving, setLikeSaving] = useState(false);
  const [modalComment, setModalComment] = useState("");
  const [modalCommentSaving, setModalCommentSaving] = useState(false);
  const commentEmoji = useFanFeedCommentEmojiPicker({
    composeSurfaceOpen: commentsOpen,
    commentText: modalComment,
    setCommentText: setModalComment,
    maxLength: 500,
    sjHeartEmojiCtx,
  });
  const prevCommentsOpenRef = useRef(false);
  const hasOpenedCommentsRef = useRef(false);
  const visibleComments = useMemo(() => post.comments.filter((c) => !c.hidden), [post.comments]);
  const isLiked = !!currentUserId && (post.likedBy ?? []).includes(currentUserId);
  const isSaved = savedPostIds.includes(post.id);
  const feedVideoRef = useRef<HTMLVideoElement | null>(null);
  const feedVideoPosterSeekDoneRef = useRef(false);
  const videoTouchStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const suppressVideoClickAfterTouchRef = useRef(false);
  const carouselRootRef = useRef<HTMLDivElement | null>(null);
  const feedCarouselScrollSnapsRef = useRef<ReturnType<typeof captureFanFeedCarouselScrollSnaps> | null>(null);
  const [feedVideoPlaying, setFeedVideoPlaying] = useState(false);
  const [feedVideoMuted, setFeedVideoMuted] = useState(true);
  const [feedVideoDecodeError, setFeedVideoDecodeError] = useState(false);
  /** Desktop hover preview: play muted loop while pointer is over the feed video area (like grid thumbnails). */
  const [feedVideoMediaHover, setFeedVideoMediaHover] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const adminMenuRef = useRef<HTMLDivElement | null>(null);
  const [likersOpen, setLikersOpen] = useState(false);
  const [likerRows, setLikerRows] = useState<{ uid: string; label: string; photoURL?: string }[]>([]);
  const [likersLoading, setLikersLoading] = useState(false);

  const inFeedCarouselClass = showMediaCarousel ? " fan-feed-media-carousel" : "";

  useEffect(() => {
    if (!likersOpen || !db) return;
    const raw = Array.isArray(post.likedBy) ? post.likedBy : [];
    const ids = [...new Set(raw.map((x) => String(x).trim()).filter(Boolean))].slice(0, 100);
    if (ids.length === 0) {
      setLikerRows([]);
      setLikersLoading(false);
      return;
    }
    setLikersLoading(true);
    let cancelled = false;
    void (async () => {
      const rows = await Promise.all(
        ids.map(async (uid) => {
          try {
            const snap = await getDoc(doc(db, "users", uid));
            const d = snap.data() as Record<string, unknown> | undefined;
            const label = fanMemberListLabel(d, uid);
            const photoURL = pickUserDocPhotoUrl(d);
            return { uid, label, ...(photoURL ? { photoURL } : {}) };
          } catch {
            return { uid, label: `User ${uid.slice(0, 8)}…` };
          }
        })
      );
      if (!cancelled) {
        setLikerRows(rows);
        setLikersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [likersOpen, post.likedBy, post.id]);

  const likeCount = post.likeCount ?? 0;
  const likersListAvailable = (post.likedBy?.length ?? 0) > 0;
  const likeCountInteractive = Boolean(isAdminMode && likeCount > 0 && likersListAvailable);

  useEffect(() => {
    if (!commentsOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [commentsOpen]);

  useEffect(() => {
    if (!openCommentsRequested) return;
    setCommentsOpen(true);
    onOpenCommentsRequestConsumed?.();
  }, [openCommentsRequested, onOpenCommentsRequestConsumed]);

  useEffect(() => {
    if (commentsOpen) {
      hasOpenedCommentsRef.current = true;
      onCommentsOpenChange?.(true);
      return;
    }
    // Ignore initial "closed" state on mount; only notify close after modal has opened.
    if (!hasOpenedCommentsRef.current) return;
    onCommentsOpenChange?.(false);
  }, [commentsOpen, onCommentsOpenChange]);

  useEffect(() => {
    hasOpenedCommentsRef.current = false;
  }, [post.id]);

  /** When the modal opens, start on the same slide as the in-feed carousel (independent index while open). */
  useEffect(() => {
    if (commentsOpen && !prevCommentsOpenRef.current) {
      setModalMediaIndex(slideIdx);
    }
    prevCommentsOpenRef.current = commentsOpen;
  }, [commentsOpen, slideIdx]);

  useEffect(() => {
    setModalMediaIndex((i) => Math.min(i, Math.max(0, mediaCount - 1)));
  }, [mediaCount]);

  useEffect(() => {
    if (!adminMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (adminMenuRef.current && !adminMenuRef.current.contains(e.target as Node)) {
        setAdminMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [adminMenuOpen]);

  const isPublished = post.status === "published" || !post.status;
  const isDraft = post.status === "draft";
  const isScheduled = post.status === "scheduled";

  useEffect(() => {
    const v = feedVideoRef.current;
    if (!v) return;
    v.muted = feedVideoMuted;
  }, [feedVideoMuted]);

  useEffect(() => {
    feedVideoPosterSeekDoneRef.current = false;
    setFeedVideoDecodeError(false);
  }, [slideIdx, currentUrl]);

  useEffect(() => {
    const v = feedVideoRef.current;
    if (!v) return;
    void v.pause();
    setFeedVideoPlaying(false);
  }, [slideIdx]);

  useEffect(() => {
    if (!currentIsVideo) setFeedVideoMediaHover(false);
  }, [currentIsVideo]);

  useEffect(() => {
    if (commentsOpen) setFeedVideoMediaHover(false);
  }, [commentsOpen]);

  useEffect(() => {
    if (!currentIsVideo || feedVideoDecodeError) return;
    const v = feedVideoRef.current;
    if (!v) return;
    if (feedVideoMediaHover) {
      void v.play().catch(() => {});
    } else {
      v.pause();
      setFeedVideoPlaying(false);
      try {
        v.currentTime = 0;
      } catch {
        /* ignore */
      }
      feedVideoPosterSeekDoneRef.current = false;
      tryFeedVideoPosterSeekOnce(v, feedVideoPosterSeekDoneRef);
    }
  }, [feedVideoMediaHover, currentIsVideo, currentUrl, slideIdx, feedVideoDecodeError]);

  useLayoutEffect(() => {
    const snaps = feedCarouselScrollSnapsRef.current;
    if (!snaps?.length) return;
    feedCarouselScrollSnapsRef.current = null;
    restoreFanFeedCarouselScrollSnaps(snaps);
    const id = window.requestAnimationFrame(() => {
      restoreFanFeedCarouselScrollSnaps(snaps);
      window.requestAnimationFrame(() => restoreFanFeedCarouselScrollSnaps(snaps));
    });
    return () => window.cancelAnimationFrame(id);
  }, [slideIdx]);

  const carouselPrev = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (mediaCount <= 1) return;
      feedCarouselScrollSnapsRef.current = captureFanFeedCarouselScrollSnaps(carouselRootRef.current);
      setMediaSlideIndex((i) => Math.max(0, i - 1));
      (e.currentTarget as HTMLButtonElement).blur();
    },
    [mediaCount]
  );

  const carouselNext = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (mediaCount <= 1) return;
      feedCarouselScrollSnapsRef.current = captureFanFeedCarouselScrollSnaps(carouselRootRef.current);
      setMediaSlideIndex((i) => Math.min(mediaCount - 1, i + 1));
      (e.currentTarget as HTMLButtonElement).blur();
    },
    [mediaCount]
  );

  const modalCarouselPrev = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (mediaCount <= 1) return;
      setModalMediaIndex((i) => Math.max(0, i - 1));
    },
    [mediaCount]
  );

  const modalCarouselNext = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (mediaCount <= 1) return;
      setModalMediaIndex((i) => Math.min(mediaCount - 1, i + 1));
    },
    [mediaCount]
  );

  const suppressCarouselControlMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const modalIdx = mediaCount > 0 ? Math.min(modalMediaIndex, mediaCount - 1) : 0;
  const modalUrl = urls[modalIdx];
  const modalIsVideo =
    !!modalUrl && (post.mediaTypes?.[modalIdx] === "video" || inferIsVideoFromUrl(modalUrl));

  const lockedCfgForBlur = post.lockedContent?.enabled ? post.lockedContent : undefined;
  const feedSlideBlurStyle = feedSlideMediaBlurStyle(
    post.mediaPreviewBlurPx,
    lockedCfgForBlur,
    false,
    slideIdx,
    urls,
  );
  const modalSlideBlurStyle = feedSlideMediaBlurStyle(
    post.mediaPreviewBlurPx,
    lockedCfgForBlur,
    false,
    modalIdx,
    urls,
  );

  const toggleFeedVideoPlay = useCallback(() => {
    if (feedVideoDecodeError) return;
    const v = feedVideoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, [feedVideoDecodeError]);

  const videoAreaClick = useCallback(
    (e: React.MouseEvent) => {
      if (suppressVideoClickAfterTouchRef.current) {
        suppressVideoClickAfterTouchRef.current = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      toggleFeedVideoPlay();
    },
    [toggleFeedVideoPlay]
  );

  const videoAreaPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    videoTouchStartRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
  }, []);

  const videoAreaPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
      const start = videoTouchStartRef.current;
      videoTouchStartRef.current = null;
      if (!start || start.pointerId !== e.pointerId) return;
      const dx = Math.abs(e.clientX - start.x);
      const dy = Math.abs(e.clientY - start.y);
      if (dx > FEED_VIDEO_TAP_MAX_PX || dy > FEED_VIDEO_TAP_MAX_PX) return;
      e.preventDefault();
      suppressVideoClickAfterTouchRef.current = true;
      toggleFeedVideoPlay();
    },
    [toggleFeedVideoPlay]
  );

  const videoAreaPointerCancel = useCallback(() => {
    videoTouchStartRef.current = null;
  }, []);

  const videoAreaKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      toggleFeedVideoPlay();
    },
    [toggleFeedVideoPlay]
  );

  const pauseFeedVideo = useCallback(() => {
    const v = feedVideoRef.current;
    if (!v) return;
    if (!v.paused) v.pause();
    setFeedVideoPlaying(false);
  }, []);

  useEffect(() => {
    if (!commentsOpen) return;
    pauseFeedVideo();
  }, [commentsOpen, pauseFeedVideo]);

  const renderCountBadge = () =>
    (mediaTotals.images + mediaTotals.videos) > 1 ? (
      <span
        className={countBadgeClass}
        style={countBadgeStyle}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {mediaTotals.images > 0 && (
          <span className="feed-card-count-item">
            <MediaImageIcon />
            {mediaTotals.images}
          </span>
        )}
        {mediaTotals.videos > 0 && (
          <span className="feed-card-count-item">
            <MediaVideoIcon />
            {mediaTotals.videos}
          </span>
        )}
      </span>
    ) : null;

  const renderCarouselArrows = () =>
    showMediaCarousel ? (
      <>
        {slideIdx > 0 ? (
          <button
            type="button"
            className="fan-feed-media-carousel-btn fan-feed-media-carousel-btn--prev"
            aria-label="Previous image or video"
            onMouseDown={suppressCarouselControlMouseDown}
            onClick={carouselPrev}
          >
            <FeedCarouselChevronLeft />
          </button>
        ) : null}
        {slideIdx < mediaCount - 1 ? (
          <button
            type="button"
            className="fan-feed-media-carousel-btn fan-feed-media-carousel-btn--next"
            aria-label="Next image or video"
            onMouseDown={suppressCarouselControlMouseDown}
            onClick={carouselNext}
          >
            <FeedCarouselChevronRight />
          </button>
        ) : null}
      </>
    ) : null;

  const toggleLike = async () => {
    if (!db || !post.id || !currentUserId || likeSaving) return;
    setLikeSaving(true);
    try {
      const postRef = feedPostDocumentRef(post);
      let nextLikedBy = post.likedBy ?? [];
      let nextLikeCount = post.likeCount ?? 0;
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(postRef);
        if (!snap.exists()) throw new Error("Post not found.");
        const data = snap.data() as Record<string, unknown>;
        const existingLikedBy = Array.isArray(data.likedBy)
          ? (data.likedBy as unknown[]).map((v) => String(v))
          : [];
        const hasLiked = existingLikedBy.includes(currentUserId);
        nextLikedBy = hasLiked ? existingLikedBy.filter((v) => v !== currentUserId) : [...existingLikedBy, currentUserId];
        nextLikeCount = nextLikedBy.length;
        tx.update(postRef, { likedBy: nextLikedBy, likeCount: nextLikeCount });
      });
      onLikeUpdated?.(post.id, nextLikedBy, nextLikeCount);
    } finally {
      setLikeSaving(false);
    }
  };

  const submitModalComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !post.id || !currentUserId) return;
    const text = modalComment.trim();
    if (!text || modalCommentSaving) return;
    setModalCommentSaving(true);
    try {
      const postRef = feedPostDocumentRef(post);
      const username = creatorName || "User";
      let nextComments: FeedPost["comments"] = post.comments;
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(postRef);
        if (!snap.exists()) throw new Error("Post not found.");
        const data = snap.data() as Record<string, unknown>;
        const existing = Array.isArray(data.comments) ? (data.comments as FeedPost["comments"]) : [];
        nextComments = [...existing, { username, author: username, text: text.slice(0, 500), authorId: currentUserId, isCreatorReply: true }];
        tx.update(postRef, { comments: nextComments });
      });
      onCommentsUpdated?.(post.id, nextComments);
      setModalComment("");
    } finally {
      setModalCommentSaving(false);
    }
  };

  const toggleSavePost = async () => {
    if (!db || !currentUserId || !post.id) return;
    const userRef = doc(db, "users", currentUserId);
    let nextSaved = savedPostIds;
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      const data = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
      const existing = Array.isArray(data.savedPostIds)
        ? (data.savedPostIds as unknown[]).map((v) => String(v))
        : [];
      const has = existing.includes(post.id);
      nextSaved = has ? existing.filter((id) => id !== post.id) : [...existing, post.id];
      tx.set(
        userRef,
        {
          savedPostIds: nextSaved,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
    onSavedUpdated?.(nextSaved);
  };

  return (
    <article
      data-feed-post-id={post.id}
      className={`feed-card${commentsOpen ? " comments-open" : ""}${!firstUrl ? " feed-card-text-only" : ""}${isAdminMode ? " feed-card-admin" : ""}${isDraft ? " feed-card-draft" : ""}${isScheduled ? " feed-card-scheduled" : ""}`}
    >
      <div className="feed-card-header">
        <div className="feed-card-avatar">
          {creatorAvatar ? (
            <img
              src={creatorAvatar}
              alt=""
              className="feed-card-avatar-img"
              style={getAvatarCropStyle(avatarObjectPosition)}
            />
          ) : (
            <span className="feed-card-avatar-initial" aria-hidden>
              {(creatorName || "?")[0].toUpperCase()}
            </span>
          )}
        </div>
        <div className="feed-card-creator">
          <span className="feed-card-username">{creatorName || "Creator"}</span>
          {isAdminMode && (isDraft || isScheduled) && (
            <span className={`feed-card-status-badge${isDraft ? " draft" : " scheduled"}`}>
              {isDraft ? "Draft" : "Scheduled"}
            </span>
          )}
        </div>
        <span className="feed-card-time">{dateStr}</span>
        
        {isAdminMode && (
          <div className="feed-card-header-menu-wrap" ref={adminMenuRef}>
            <button
              type="button"
              className="feed-card-dots-btn"
              aria-label="Post options"
              aria-expanded={adminMenuOpen}
              aria-haspopup="true"
              onClick={() => setAdminMenuOpen(!adminMenuOpen)}
            >
              <DotsMenuIcon />
            </button>
            {adminMenuOpen && (
              <div className="feed-card-admin-menu">
                <button
                  type="button"
                  className="feed-card-admin-menu-item"
                  onClick={() => {
                    setAdminMenuOpen(false);
                    onTogglePin?.(post.id, !!post.pinned);
                  }}
                >
                  <PinIcon />
                  {post.pinned ? "Unpin from profile" : "Pin to profile"}
                </button>
                <button
                  type="button"
                  className="feed-card-admin-menu-item"
                  onClick={() => {
                    setAdminMenuOpen(false);
                    onEditPost?.(post);
                  }}
                >
                  <EditIcon />
                  Edit Post
                </button>
                <button
                  type="button"
                  className="feed-card-admin-menu-item"
                  onClick={() => {
                    setAdminMenuOpen(false);
                    onToggleVisibility?.(post.id, post.status || "published");
                  }}
                >
                  <ToggleVisibilityIcon visible={isPublished} />
                  {isPublished ? "Unpublish" : "Publish"}
                </button>
                <button
                  type="button"
                  className="feed-card-admin-menu-item feed-card-admin-menu-item-danger"
                  onClick={() => {
                    setAdminMenuOpen(false);
                    onDeletePost?.(post.id);
                  }}
                >
                  <DeleteIcon />
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {currentUrl ? (
        currentProtectedPlaceholder ? (
          <div
            ref={carouselRootRef}
            className={`feed-card-media-wrap${inFeedCarouselClass}${lockedCurrent ? " fan-feed-media-cell--locked" : ""}`}
          >
            {showAdminLockedBlurPreview && adminRevealUrl ? (
              adminRevealType === "video" ? (
                <video
                  key={`${post.id}-admin-blur-v-${slideIdx}`}
                  src={adminRevealUrl.split("#")[0]}
                  muted
                  playsInline
                  preload="metadata"
                  className="feed-card-media feed-card-media-video"
                  style={adminPlaceholderBlurStyle}
                  aria-hidden
                  {...feedVideoDownloadGuardProps}
                />
              ) : (
                <img
                  key={`${post.id}-admin-blur-i-${slideIdx}`}
                  src={adminRevealUrl}
                  alt=""
                  className="feed-card-media"
                  style={adminPlaceholderBlurStyle}
                  loading={slideIdx === 0 ? "lazy" : "eager"}
                  aria-hidden
                  {...feedImageDownloadGuardProps}
                />
              )
            ) : (
              <div className="feed-card-media fan-feed-media-protected-placeholder" aria-hidden />
            )}
            {showCaptionOnMedia && (
              <FeedCardCaptionOverlay
                caption={overlayCaption}
                style={captionStyle}
                size={post.overlayTextSize}
                color={post.overlayTextColor}
                highlight={post.overlayHighlight}
                italic={post.overlayItalic}
                sjHeartEmojiCtx={sjHeartEmojiCtx}
              />
            )}
            {renderCarouselArrows()}
            {renderCountBadge()}
            {lockedCurrent ? (
              <>
                <div
                  className={`fan-feed-media-lock-overlay${blurPxNorm > 0 ? " fan-feed-media-lock-overlay--teaser-blur" : ""}`}
                  role="region"
                  aria-label="Locked media"
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <span className="fan-feed-media-lock-icon" aria-hidden>
                    🔒
                  </span>
                  <span className="fan-feed-media-lock-hint">
                    Fans will see the paid unlock button here.
                  </span>
                </div>
                {creatorFanPreviewUrl ? (
                  <div className="fan-feed-media-lock-unlock-hit fan-feed-media-lock-unlock-hit--solo">
                    <div className="fan-feed-media-lock-unlock-stack">
                      <span className="fan-feed-media-lock-unlock-label">Pay to unlock</span>
                      <button
                        type="button"
                        className="fan-feed-media-lock-unlock-btn fan-feed-media-lock-unlock-btn--prominent"
                        style={{
                          borderColor: "#ffffff",
                          color: "#fff",
                          background: `linear-gradient(135deg, ${viewPostLinkColor} 0%, color-mix(in srgb, ${viewPostLinkColor} 72%, #000) 100%)`,
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          window.open(creatorFanPreviewUrl, "_blank", "noopener,noreferrer");
                        }}
                      >
                        Preview {lockPriceText}
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : currentIsVideo ? (
          <div
            ref={carouselRootRef}
            className={`feed-card-media-wrap feed-card-media-wrap-video${inFeedCarouselClass}`}
            role="button"
            tabIndex={0}
            onMouseEnter={() => setFeedVideoMediaHover(true)}
            onMouseLeave={() => setFeedVideoMediaHover(false)}
            onClick={videoAreaClick}
            onPointerDown={videoAreaPointerDown}
            onPointerUp={videoAreaPointerUp}
            onPointerCancel={videoAreaPointerCancel}
            onKeyDown={videoAreaKeyDown}
            aria-label={
              feedVideoDecodeError
                ? "Video cannot be played in this browser"
                : feedVideoPlaying
                  ? "Pause video"
                  : "Play video"
            }
          >
            <video
              key={`${post.id}-hub-v-${slideIdx}`}
              ref={feedVideoRef}
              src={currentUrl.split("#")[0]}
              muted={feedVideoMuted}
              loop
              playsInline
              className="feed-card-media feed-card-media-video"
              style={feedSlideBlurStyle}
              preload="metadata"
              {...feedVideoDownloadGuardProps}
              onLoadedMetadata={(e) => {
                tryFeedVideoPosterSeekOnce(e.currentTarget, feedVideoPosterSeekDoneRef);
              }}
              onError={() => setFeedVideoDecodeError(true)}
              onPlay={() => setFeedVideoPlaying(true)}
              onPause={() => setFeedVideoPlaying(false)}
              onVolumeChange={(e) => setFeedVideoMuted(e.currentTarget.muted)}
            />
            {!feedVideoDecodeError && !feedVideoPlaying && (
              <span className="feed-card-play-overlay" aria-hidden>
                <PlayIcon />
              </span>
            )}
            {!feedVideoDecodeError && (
              <button
                type="button"
                className={`feed-card-sound-toggle${feedVideoMuted ? " muted" : ""}`}
                aria-label={feedVideoMuted ? "Unmute video" : "Mute video"}
                title={feedVideoMuted ? "Unmute" : "Mute"}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setFeedVideoMuted((prev) => !prev);
                }}
              >
                {feedVideoMuted ? <VolumeOffIcon /> : <VolumeOnIcon />}
              </button>
            )}
            {feedVideoDecodeError && currentUrl ? <FeedVideoPlaybackErrorOverlay videoSrc={currentUrl} /> : null}
            {showCaptionOnMedia && (
              <FeedCardCaptionOverlay
                caption={overlayCaption}
                style={captionStyle}
                size={post.overlayTextSize}
                color={post.overlayTextColor}
                highlight={post.overlayHighlight}
                italic={post.overlayItalic}
                sjHeartEmojiCtx={sjHeartEmojiCtx}
              />
            )}
            {renderCarouselArrows()}
            {renderCountBadge()}
          </div>
        ) : (
          <div ref={carouselRootRef} className={`feed-card-media-wrap${inFeedCarouselClass}`}>
            <img
              key={`${post.id}-hub-i-${slideIdx}`}
              src={currentUrl}
              alt=""
              className="feed-card-media"
              style={feedSlideBlurStyle}
              loading={slideIdx === 0 ? "lazy" : "eager"}
              {...feedImageDownloadGuardProps}
            />
            {showCaptionOnMedia && (
              <FeedCardCaptionOverlay
                caption={overlayCaption}
                style={captionStyle}
                size={post.overlayTextSize}
                color={post.overlayTextColor}
                highlight={post.overlayHighlight}
                italic={post.overlayItalic}
                sjHeartEmojiCtx={sjHeartEmojiCtx}
              />
            )}
            {renderCarouselArrows()}
            {renderCountBadge()}
          </div>
        )
      ) : null}

      {post.postKind === "live_stream_promo" && post.liveStreamPromo?.streamId ? (
        <div className="feed-card-live-stream-promo-wrap">
          <LiveStreamPromoBanner
            variant="creator"
            promo={post.liveStreamPromo}
            accentHex={creatorThemePrimary}
            creatorFanPreviewUrl={creatorFanPreviewUrl}
            creatorBroadcast={
              isAdminMode && liveStreamCreatorBroadcast && post.liveStreamPromo.streamId
                ? { streamId: post.liveStreamPromo.streamId, ...liveStreamCreatorBroadcast }
                : undefined
            }
            onOpenStreamControls={isAdminMode && onEditPost ? () => onEditPost(post) : undefined}
            hostActiveStreamId={isAdminMode ? liveStreamHostActiveStreamId : undefined}
          />
        </div>
      ) : null}

      {Array.isArray(post.audioUrls) && post.audioUrls.length > 0 && (
        <div className="feed-card-body" style={{ paddingTop: firstUrl ? 0 : undefined }}>
          {post.audioUrls.map((url, index) => (
            <audio
              key={`post-audio-${post.id}-${index}`}
              src={url}
              controls
              controlsList="nodownload noplaybackrate noremoteplayback"
              onContextMenu={(e) => e.preventDefault()}
              style={{ width: "100%", marginTop: index === 0 ? 0 : "0.5rem" }}
            />
          ))}
        </div>
      )}

      {firstUrl && !post.hideLikes && (
        <div className="feed-card-actions">
          <span className="feed-card-action-group">
            <button
              type="button"
              className={`feed-card-action-btn${isLiked ? " liked" : ""}`}
              aria-label="Like"
              onClick={toggleLike}
              disabled={!currentUserId || likeSaving}
            >
              <HeartOutline />
              <HeartFilled />
            </button>
            {likeCountInteractive ? (
              <button
                type="button"
                className="feed-card-action-count feed-card-action-count--clickable"
                onClick={() => setLikersOpen(true)}
                aria-label={`${likeCount} likes — who liked`}
              >
                {likeCount}
              </button>
            ) : (
              <span className="feed-card-action-count">{likeCount}</span>
            )}
          </span>
          {!post.hideComments && (
            <button type="button" className="feed-card-action-group feed-card-action-link" aria-label="Comments" onClick={() => setCommentsOpen(true)}>
              <CommentIcon />
              <span className="feed-card-action-count">{visibleComments.length}</span>
            </button>
          )}
          {post.showTipButton !== false && !hasTipGoal && !hideTipButtons && (
            <button
              type="button"
              className="feed-card-action-group feed-card-action-link feed-card-send-tip"
              aria-label="Send tip"
            >
              <TipIcon />
              <span className="feed-card-send-tip-text">SEND TIP</span>
            </button>
          )}
          <button
            type="button"
            className={`feed-card-action-btn bookmark-btn${isSaved ? " bookmarked" : ""}`}
            aria-label={isSaved ? "Unsave post" : "Save post"}
            onClick={toggleSavePost}
            disabled={!currentUserId}
          >
            <BookmarkOutline />
            <BookmarkFilled />
          </button>
        </div>
      )}

      <div className="feed-card-body">
        <p className="feed-card-caption">
          <span className="caption-username">{creatorName}</span>
          {renderTextWithCustomEmoji(post.body || "", sjHeartEmojiCtx)}
        </p>
        {post.poll && post.poll.question && post.poll.options?.length >= 2 && (
          <div className="feed-card-poll">
            <p className="feed-card-poll-question">{post.poll.question}</p>
            <ul className="feed-card-poll-options">
              {(() => {
                const votes = post.poll.optionVotes ?? post.poll.options.map(() => 0);
                const total = votes.reduce((a, b) => a + b, 0);
                return post.poll.options.map((opt, i) => {
                  const v = votes[i] ?? 0;
                  const pct = total > 0 ? Math.round((v / total) * 100) : 0;
                  return (
                    <li key={i} className="feed-card-poll-option">
                      <span className="feed-card-poll-option-label">{opt}</span>
                      <span className="feed-card-poll-option-meta">
                        {total > 0 ? `${pct}%` : "0%"}
                      </span>
                      {total > 0 && (
                        <div className="feed-card-poll-option-bar" style={{ width: `${pct}%` }} aria-hidden />
                      )}
                    </li>
                  );
                });
              })()}
            </ul>
          </div>
        )}
        {post.tipGoal && post.tipGoal.targetCents > 0 && (
          <div className="feed-card-tip-goal">
            <p className="feed-card-tip-goal-desc">{post.tipGoal.description}</p>
            <div className="feed-card-tip-goal-bar-wrap">
              <div
                className="feed-card-tip-goal-bar-fill"
                style={{
                  width: `${Math.min(100, (post.tipGoal.raisedCents / post.tipGoal.targetCents) * 100)}%`,
                }}
              />
            </div>
            <p className="feed-card-tip-goal-raised">
              ${(post.tipGoal.raisedCents / 100).toFixed(2)} of ${(post.tipGoal.targetCents / 100).toFixed(2)}
            </p>
          </div>
        )}
        {!post.hideComments && (
          <>
            {visibleComments.length > 0 && (
              <button type="button" className="feed-card-view-comments" onClick={() => setCommentsOpen(true)}>
                View all {visibleComments.length} comments
              </button>
            )}
            {(firstUrl || visibleComments.length > 0) && (
              <div className="feed-card-comments-list">
                {visibleComments.length === 0 ? (
                  <div className="feed-card-comment feed-card-comment-empty">No comments yet.</div>
                ) : (
                  visibleComments.slice(0, 2).map((c, i) => (
                    <div key={i} className="feed-card-comment">
                      <span className="comment-username">{feedCommentAuthorLabel(c)}</span>
                      {renderTextWithCustomEmoji(c.text, sjHeartEmojiCtx)}
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>

      {!firstUrl && !post.hideLikes && (
        <div className="feed-card-text-only-footer">
          <div className="feed-card-actions">
            <span className="feed-card-action-group">
              <button
                type="button"
                className={`feed-card-action-btn${isLiked ? " liked" : ""}`}
                aria-label="Like"
                onClick={toggleLike}
                disabled={!currentUserId || likeSaving}
              >
                <HeartOutline />
                <HeartFilled />
              </button>
              {likeCountInteractive ? (
                <button
                  type="button"
                  className="feed-card-action-count feed-card-action-count--clickable"
                  onClick={() => setLikersOpen(true)}
                  aria-label={`${likeCount} likes — who liked`}
                >
                  {likeCount}
                </button>
              ) : (
                <span className="feed-card-action-count">{likeCount}</span>
              )}
            </span>
            {!post.hideComments && (
              <button type="button" className="feed-card-action-group feed-card-action-link" aria-label="Comments" onClick={() => setCommentsOpen(true)}>
                <CommentIcon />
                <span className="feed-card-action-count">{visibleComments.length}</span>
              </button>
            )}
            {post.showTipButton !== false && !hasTipGoal && !hideTipButtons && (
              <button
                type="button"
                className="feed-card-action-group feed-card-action-link feed-card-send-tip"
                aria-label="Send tip"
              >
                <TipIcon />
                <span className="feed-card-send-tip-text">SEND TIP</span>
              </button>
            )}
            <button
              type="button"
              className={`feed-card-action-btn bookmark-btn${isSaved ? " bookmarked" : ""}`}
              aria-label={isSaved ? "Unsave post" : "Save post"}
              onClick={toggleSavePost}
              disabled={!currentUserId}
            >
              <BookmarkOutline />
              <BookmarkFilled />
            </button>
          </div>
        </div>
      )}

      <div className="feed-card-view-post-footer">
        <button
          type="button"
          className="feed-card-view-post-link"
          style={viewPostLinkColor ? { color: viewPostLinkColor } : undefined}
          onClick={() => setCommentsOpen(true)}
        >
          View post
        </button>
      </div>

      {commentsOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="feed-comments-modal-backdrop feed-comments-modal-backdrop--portal"
            role="presentation"
            onClick={() => setCommentsOpen(false)}
          >
            <div
              className="feed-comments-modal feed-comments-modal--stack"
              role="dialog"
              aria-modal="true"
              aria-labelledby={`feed-comments-modal-title-${post.id}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="feed-comments-modal-head">
                <p id={`feed-comments-modal-title-${post.id}`} className="feed-comments-modal-head-title">
                  {creatorName || "Post"}
                </p>
                <button type="button" className="feed-comments-modal-close" onClick={() => setCommentsOpen(false)} aria-label="Close">
                  ×
                </button>
              </div>
              <div className={`feed-comments-modal-content feed-comments-modal-content--stack${firstUrl ? "" : " no-media"}`}>
                {firstUrl && modalUrl && (
                  <div
                    className={`feed-comments-modal-media-wrap${showMediaCarousel ? " feed-comments-modal-media-wrap--carousel" : ""}`}
                    role={showMediaCarousel ? "group" : undefined}
                    aria-roledescription={showMediaCarousel ? "carousel" : undefined}
                    aria-label={showMediaCarousel ? `Post media, slide ${modalIdx + 1} of ${mediaCount}` : undefined}
                  >
                    {modalIsVideo ? (
                      <ViewPostModalVideo
                        src={modalUrl}
                        videoKey={`${post.id}-modal-v-${modalIdx}`}
                        accentHex={viewPostLinkColor}
                        mediaBlurStyle={modalSlideBlurStyle}
                      />
                    ) : (
                      <img
                        key={`${post.id}-modal-i-${modalIdx}`}
                        src={modalUrl}
                        alt=""
                        className="feed-comments-modal-media"
                        style={modalSlideBlurStyle}
                        loading="eager"
                        {...feedImageDownloadGuardProps}
                      />
                    )}
                    {showMediaCarousel ? (
                      <>
                        {modalIdx > 0 ? (
                          <button
                            type="button"
                            className="fan-feed-media-carousel-btn fan-feed-media-carousel-btn--prev"
                            aria-label="Previous image or video"
                            onMouseDown={suppressCarouselControlMouseDown}
                            onClick={modalCarouselPrev}
                          >
                            <FeedCarouselChevronLeft />
                          </button>
                        ) : null}
                        {modalIdx < mediaCount - 1 ? (
                          <button
                            type="button"
                            className="fan-feed-media-carousel-btn fan-feed-media-carousel-btn--next"
                            aria-label="Next image or video"
                            onMouseDown={suppressCarouselControlMouseDown}
                            onClick={modalCarouselNext}
                          >
                            <FeedCarouselChevronRight />
                          </button>
                        ) : null}
                        <div className="feed-comments-modal-carousel-dots" role="tablist" aria-label="Slides">
                          {urls.map((_, i) => (
                            <button
                              key={`${post.id}-dot-${i}`}
                              type="button"
                              role="tab"
                              aria-selected={i === modalIdx}
                              className={`feed-comments-modal-carousel-dot${i === modalIdx ? " feed-comments-modal-carousel-dot--active" : ""}`}
                              style={
                                i === modalIdx && viewPostLinkColor
                                  ? { backgroundColor: viewPostLinkColor }
                                  : undefined
                              }
                              aria-label={`Go to slide ${i + 1}`}
                              onMouseDown={suppressCarouselControlMouseDown}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setModalMediaIndex(i);
                              }}
                            />
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
                <div className="feed-comments-modal-panel">
                  {post.postKind === "live_stream_promo" && post.liveStreamPromo?.streamId ? (
                    <div className="feed-comments-modal-live-promo">
                      <LiveStreamPromoBanner
                        variant="creator"
                        promo={post.liveStreamPromo}
                        accentHex={viewPostLinkColor}
                        creatorFanPreviewUrl={creatorFanPreviewUrl}
                        creatorBroadcast={
                          isAdminMode && liveStreamCreatorBroadcast && post.liveStreamPromo.streamId
                            ? { streamId: post.liveStreamPromo.streamId, ...liveStreamCreatorBroadcast }
                            : undefined
                        }
                        onOpenStreamControls={isAdminMode && onEditPost ? () => onEditPost(post) : undefined}
                        hostActiveStreamId={isAdminMode ? liveStreamHostActiveStreamId : undefined}
                      />
                    </div>
                  ) : null}
                  {post.body?.trim() ? (
                    <div className="feed-comments-modal-post-body">
                      <p>{renderTextWithCustomEmoji(post.body, sjHeartEmojiCtx)}</p>
                    </div>
                  ) : null}
                  <div className="feed-comments-modal-list">
                    {visibleComments.length === 0 ? (
                      <p className="feed-comments-modal-empty">No comments yet.</p>
                    ) : (
                      visibleComments.map((c, idx) => {
                        const authorName = feedCommentAuthorLabel(c);
                        const isCreatorComment =
                          !!c.isCreatorReply ||
                          (!!currentUserId &&
                            typeof c.authorId === "string" &&
                            c.authorId.length > 0 &&
                            c.authorId === currentUserId);
                        return (
                          <div className="feed-comments-modal-item" key={`${idx}-${c.text.slice(0, 12)}`}>
                            <div className="feed-comments-modal-item-avatar" aria-hidden>
                              <span>{feedCommentAuthorInitial(authorName)}</span>
                            </div>
                            <div className="feed-comments-modal-item-body">
                              <p className="feed-comments-modal-text">
                                <span className="feed-comments-modal-comment-author-row">
                                  <span className="comment-username">{authorName}</span>
                                  <span
                                    className={
                                      isCreatorComment
                                        ? "feed-comments-modal-role-badge feed-comments-modal-role-badge--creator"
                                        : "feed-comments-modal-role-badge feed-comments-modal-role-badge--fan"
                                    }
                                  >
                                    {isCreatorComment ? "Creator" : "Fan"}
                                  </span>
                                </span>
                                <span className="feed-comments-modal-comment-body">{renderTextWithCustomEmoji(c.text, sjHeartEmojiCtx)}</span>
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  {currentUserId && (
                    <form className="feed-comments-modal-compose" onSubmit={submitModalComment}>
                      <div className="feed-comments-modal-item-avatar feed-comments-modal-compose-avatar" aria-hidden>
                        {creatorAvatar ? (
                          <img
                            src={creatorAvatar}
                            alt=""
                            className="feed-comments-modal-compose-avatar-img"
                            style={getAvatarCropStyle(avatarObjectPosition)}
                          />
                        ) : (
                          <span>{(creatorName || "?").charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="feed-comments-modal-compose-input-wrap">
                        <div ref={commentEmoji.composeFieldRef} className="feed-comments-modal-compose-field">
                          <input
                            ref={commentEmoji.commentInputRef}
                            type="text"
                            className="feed-comments-modal-compose-input"
                            value={modalComment}
                            onChange={(e) => setModalComment(e.target.value)}
                            placeholder="Write a comment..."
                            maxLength={500}
                          />
                          <button
                            ref={commentEmoji.composeEmojiButtonRef}
                            type="button"
                            className="feed-comments-modal-compose-emoji-btn"
                            aria-label="Add emoji"
                            aria-expanded={commentEmoji.composeEmojiPickerOpen}
                            onClick={(e) => {
                              e.stopPropagation();
                              commentEmoji.setComposeEmojiPickerOpen((o) => !o);
                            }}
                          >
                            <EmojiIcon className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                      <button type="submit" className="feed-comments-modal-compose-send" disabled={modalCommentSaving || !modalComment.trim()}>
                        {modalCommentSaving ? "..." : "Post"}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
      {likersOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="feed-comments-modal-backdrop feed-comments-modal-backdrop--portal feed-likers-modal-backdrop"
            role="presentation"
            onClick={() => setLikersOpen(false)}
          >
            <div
              className="feed-likers-modal-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby={`feed-likers-modal-title-${post.id}`}
              onClick={(e) => e.stopPropagation()}
              style={
                viewPostLinkColor
                  ? ({ "--fh-likers-accent": viewPostLinkColor } as React.CSSProperties)
                  : undefined
              }
            >
              <div className="feed-likers-modal-card__accent" aria-hidden />
              <div className="feed-likers-modal-card__head">
                <p id={`feed-likers-modal-title-${post.id}`} className="feed-likers-modal-card__title">
                  People who liked this
                </p>
                <button
                  type="button"
                  className="feed-likers-modal-card__close"
                  onClick={() => setLikersOpen(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className="feed-likers-modal-card__body">
                {likersLoading ? (
                  <p className="feed-likers-modal-card__empty">Loading…</p>
                ) : likerRows.length === 0 ? (
                  <p className="feed-likers-modal-card__empty">No likers found.</p>
                ) : (
                  <ul className="feed-likers-modal-card__list">
                    {likerRows.map((row) => (
                      <li key={row.uid} className="feed-likers-modal-card__item">
                        <FanFeedLikerAvatar photoURL={row.photoURL} label={row.label} />
                        <span className="feed-likers-modal-card__item-label">{row.label}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
      {commentEmoji.emojiPickerPortal}
    </article>
  );
}

export const FanHubFeed: React.FC<{
  isAdminMode?: boolean;
  onEditPostRequest?: (post: FeedPost) => void;
  liveStreamCreatorBroadcast?: Omit<LiveStreamCreatorBroadcastProps, "streamId">;
  liveStreamHostActiveStreamId?: string | null;
  /** From Fan Hub notification bell: scroll feed list to this post. */
  deeplinkScrollToPostId?: string | null;
  onDeeplinkScrollToPostConsumed?: () => void;
}> = ({
  isAdminMode = false,
  onEditPostRequest,
  liveStreamCreatorBroadcast,
  liveStreamHostActiveStreamId,
  deeplinkScrollToPostId = null,
  onDeeplinkScrollToPostConsumed,
}) => {
  const { user, setActivePage, showToast, openPaymentModal } = useAppContext();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedPostIds, setSavedPostIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"feed" | "grid">("feed");
  const [gridHoveredVideoPostId, setGridHoveredVideoPostId] = useState<string | null>(null);

  useEffect(() => {
    if (viewMode !== "grid") setGridHoveredVideoPostId(null);
  }, [viewMode]);
  const [openPostIdFromGrid, setOpenPostIdFromGrid] = useState<string | null>(null);
  const [returnToGridAfterPostId, setReturnToGridAfterPostId] = useState<string | null>(null);

  useEffect(() => {
    const raw = deeplinkScrollToPostId?.trim();
    if (!raw || typeof document === "undefined") return;
    setViewMode("feed");
    const t = window.setTimeout(() => {
      try {
        const el = Array.from(document.querySelectorAll("[data-feed-post-id]")).find(
          (node) => node.getAttribute("data-feed-post-id") === raw
        );
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {
        /* ignore */
      }
      onDeeplinkScrollToPostConsumed?.();
    }, 120);
    return () => window.clearTimeout(t);
  }, [deeplinkScrollToPostId, onDeeplinkScrollToPostConsumed]);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [feedSettings, setFeedSettings] = useState<FeedVisibilitySettings>({
    hideLikeCounts: false,
    hideComments: false,
    hideLikes: false,
    hideTipButton: false,
    autoReplyAI: false,
    autoReplyChance: 25,
  });
  const [feedSettingsSaving, setFeedSettingsSaving] = useState(false);
  const [creatorStorefront, setCreatorStorefront] = useState<{
    displayName?: string;
    avatar?: string;
    avatarObjectPosition?: string;
    /** Storefront theme primary (hex) for feed UI accents */
    themePrimary?: string;
    handle?: string;
  }>({});
  const creatorId = user?.id;
  const canUseAIReplies = hasEliteAccess(user);
  const creatorName =
    creatorStorefront.displayName?.trim() ||
    (user as { displayName?: string })?.displayName?.trim() ||
    "Creator";
  const creatorAvatar =
    creatorStorefront.avatar?.trim() || (user as { photoURL?: string })?.photoURL || undefined;
  const avatarObjectPosition = creatorStorefront.avatarObjectPosition;

  const sjHeartEmojiCtx = useMemo<SjHeartEmojiAccessContext>(
    () => ({
      creatorHandle: creatorStorefront.handle,
      viewerIsAdmin: user?.role === "Admin",
    }),
    [creatorStorefront.handle, user?.role]
  );

  /** Same tab as My Page → Member preview: `/{handle}?preview=member` on this app origin (not hardcoded witme.io). */
  const creatorFanPreviewUrl = useMemo(() => {
    const h = creatorStorefront.handle?.trim().replace(/^@/, "") ?? "";
    if (!h || h === "preview") return undefined;
    if (typeof window === "undefined") return undefined;
    return `${window.location.origin}/${encodeURIComponent(h)}?preview=member`;
  }, [creatorStorefront.handle]);

  useEffect(() => {
    if (!creatorId || !db) {
      setCreatorStorefront({});
      return;
    }
    let cancelled = false;
    getDoc(doc(db, "creators", creatorId))
      .then((snap) => {
        if (cancelled || !snap.exists()) return;
        const d = snap.data() as Record<string, unknown>;
        const theme = d.theme as { primary?: string } | undefined;
        const tp = theme?.primary;
        setCreatorStorefront({
          displayName: typeof d.displayName === "string" ? d.displayName : undefined,
          avatar: typeof d.avatar === "string" ? d.avatar : undefined,
          avatarObjectPosition:
            typeof d.avatarObjectPosition === "string" ? d.avatarObjectPosition : undefined,
          themePrimary: typeof tp === "string" && tp.trim() ? tp.trim() : undefined,
          handle: typeof d.handle === "string" && d.handle.trim() ? d.handle.trim() : undefined,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [creatorId]);

  const loadPosts = useCallback(async () => {
    if (!creatorId) {
      setPosts(DEMO_POSTS);
      setLoading(false);
      return;
    }
      
      try {
        const userQ = query(collection(db, "users", creatorId, "posts"), orderBy("createdAt", "desc"), limit(50));
        const fanQ = query(
          collection(db, "creators", creatorId, "fanPosts"),
          orderBy("createdAt", "desc"),
          limit(50)
        );

        const [userSnap, fanSnapResult] = await Promise.all([
          getDocs(userQ),
          getDocs(fanQ).catch((fanErr) => {
            console.warn("Fan Hub: fanPosts query failed (index may be missing):", fanErr);
            return null;
          }),
        ]);

        const fanSnap = fanSnapResult;

        const byId = new Map<string, FeedPost>();
        userSnap.forEach((docSnap) => {
          const fp = firestoreDocToFeedPost(docSnap, isAdminMode);
          if (fp) byId.set(fp.id, fp);
        });
        fanSnap?.forEach((docSnap) => {
          const fp = firestoreDocToFeedPost(docSnap, isAdminMode);
          if (fp) byId.set(fp.id, fp);
        });

        const list = Array.from(byId.values());
        list.sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          return feedPostCreatedMs(b) - feedPostCreatedMs(a);
        });
        setPosts(list.length > 0 ? list : DEMO_POSTS);
      } catch (err) {
        console.warn("Could not load posts, using demo data:", err);
        setPosts(DEMO_POSTS);
      } finally {
        setLoading(false);
      }
  }, [creatorId, isAdminMode]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    if (!creatorId) return undefined;
    const userQ = query(collection(db, "users", creatorId, "posts"), orderBy("createdAt", "desc"), limit(50));
    const fanQ = query(collection(db, "creators", creatorId, "fanPosts"), orderBy("createdAt", "desc"), limit(50));
    const unsubUser = onSnapshot(
      userQ,
      () => void loadPosts(),
      (err) => console.warn("Fan Hub: user posts listener failed:", err),
    );
    const unsubFan = onSnapshot(
      fanQ,
      () => void loadPosts(),
      (err) => console.warn("Fan Hub: fanPosts listener failed:", err),
    );
    return () => {
      unsubUser();
      unsubFan();
    };
  }, [creatorId, loadPosts]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handlePostsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ creatorId?: string }>).detail;
      if (!detail?.creatorId || detail.creatorId === creatorId) {
        void loadPosts();
      }
    };
    window.addEventListener("echoflux:fan-posts-updated", handlePostsUpdated);
    return () => window.removeEventListener("echoflux:fan-posts-updated", handlePostsUpdated);
  }, [creatorId, loadPosts]);

  useEffect(() => {
    if (!db || !creatorId) {
      setSavedPostIds([]);
      return;
    }
    getDoc(doc(db, "users", creatorId))
      .then((snap) => {
        const d = snap.exists() ? snap.data() : {};
        const ids = Array.isArray(d.savedPostIds) ? (d.savedPostIds as unknown[]).map((v) => String(v)) : [];
        setSavedPostIds(ids);
        const fs = (d.fanHubFeedSettings as Partial<FeedVisibilitySettings>) || {};
        setFeedSettings({
          hideLikeCounts: !!fs.hideLikeCounts,
          hideComments: !!fs.hideComments,
          hideLikes: !!fs.hideLikes,
          hideTipButton: !!fs.hideTipButton,
          autoReplyAI: !!fs.autoReplyAI,
          autoReplyChance: typeof fs.autoReplyChance === "number" ? Math.max(0, Math.min(100, fs.autoReplyChance)) : 25,
        });
      })
      .catch(() => setSavedPostIds([]));
  }, [creatorId]);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSettingsRef = useRef<FeedVisibilitySettings | null>(null);

  const persistFeedSettings = useCallback(
    async (toSave: FeedVisibilitySettings) => {
      if (!db || !creatorId) return;
      setFeedSettingsSaving(true);
      try {
        await setDoc(doc(db, "users", creatorId), { fanHubFeedSettings: toSave }, { merge: true });
        await setDoc(doc(db, "creators", creatorId), { feedSettings: toSave }, { merge: true });
      } catch (err) {
        console.error("Failed to save feed settings", err);
        showToast?.("Failed to save visibility settings", "error");
      } finally {
        setFeedSettingsSaving(false);
      }
    },
    [creatorId, showToast]
  );

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const saveFeedSettings = useCallback(
    (next: FeedVisibilitySettings, options?: { debounce?: boolean }) => {
      if (!db || !creatorId) return;
      const previous = feedSettings;
      setFeedSettings(next);

      if (options?.debounce) {
        pendingSettingsRef.current = next;
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
          saveTimeoutRef.current = null;
          const toSave = pendingSettingsRef.current;
          pendingSettingsRef.current = null;
          if (toSave) void persistFeedSettings(toSave);
        }, 300);
        return;
      }

      if (feedSettingsSaving) return;
      setFeedSettingsSaving(true);
      (async () => {
        try {
          await setDoc(doc(db, "users", creatorId), { fanHubFeedSettings: next }, { merge: true });
          await setDoc(doc(db, "creators", creatorId), { feedSettings: next }, { merge: true });
        } catch (err) {
          console.error("Failed to save feed settings", err);
          setFeedSettings(previous);
          showToast?.("Failed to save visibility settings", "error");
        } finally {
          setFeedSettingsSaving(false);
        }
      })();
    },
    [creatorId, feedSettingsSaving, feedSettings, showToast, persistFeedSettings]
  );

  const handleLikeUpdated = useCallback((postId: string, likedBy: string[], likeCount: number) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, likedBy, likeCount } : p)));
  }, []);

  const handleCommentsUpdated = useCallback((postId: string, comments: FeedPost["comments"]) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, comments } : p)));
  }, []);

  const handleSavedUpdated = useCallback((savedIds: string[]) => {
    setSavedPostIds(savedIds);
  }, []);

  const handleEditPost = useCallback(
    (post: FeedPost) => {
      // Prefer in-place editor when host component provides one.
      if (onEditPostRequest) {
        onEditPostRequest(post);
        return;
      }
      // Fallback for older shells: route to global compose page.
      sessionStorage.setItem("editPostId", post.id);
      setActivePage?.("compose");
    },
    [onEditPostRequest, setActivePage]
  );

  const handleDeletePost = useCallback(async (postId: string) => {
    if (!db || !creatorId || deletingPostId) return;
    if (!confirm("Delete this post? This cannot be undone.")) return;
    
    setDeletingPostId(postId);
    try {
      const refs = [
        doc(db, "posts", postId),
        doc(db, "users", creatorId, "posts", postId),
        doc(db, "creators", creatorId, "posts", postId),
        doc(db, "creators", creatorId, "fanPosts", postId),
      ];
      await Promise.all(refs.map((r) => deleteDoc(r).catch(() => undefined)));
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err) {
      console.error("Failed to delete post:", err);
      alert("Failed to delete post. Please try again.");
    } finally {
      setDeletingPostId(null);
    }
  }, [creatorId, deletingPostId]);

  const handleToggleVisibility = useCallback(async (postId: string, currentStatus: string) => {
    if (!db || !creatorId) return;
    
    const newStatus = currentStatus === "published" ? "draft" : "published";
    try {
      const refs = [
        doc(db, "posts", postId),
        doc(db, "users", creatorId, "posts", postId),
        doc(db, "creators", creatorId, "posts", postId),
        doc(db, "creators", creatorId, "fanPosts", postId),
      ];
      await Promise.all(
        refs.map(async (r) => {
          const s = await getDoc(r);
          if (s.exists()) await updateDoc(r, { status: newStatus });
        })
      );
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status: newStatus } : p)));
    } catch (err) {
      console.error("Failed to toggle visibility:", err);
      alert("Failed to update post status. Please try again.");
    }
  }, [creatorId]);

  const handleTogglePin = useCallback(
    async (postId: string, currentlyPinned: boolean) => {
      if (!db || !creatorId) return;
      const newPinned = !currentlyPinned;
      setPosts((prev) => {
        const next = prev.map((p) => {
          if (p.id === postId) return { ...p, pinned: newPinned };
          if (newPinned && p.pinned) return { ...p, pinned: false };
          return p;
        });
        next.sort((a, b) => (a.pinned && !b.pinned ? -1 : !a.pinned && b.pinned ? 1 : 0));
        return next;
      });
      try {
        const syncPin = async (pid: string, pinned: boolean) => {
          const refs = [
            doc(db, "posts", pid),
            doc(db, "users", creatorId, "posts", pid),
            doc(db, "creators", creatorId, "posts", pid),
            doc(db, "creators", creatorId, "fanPosts", pid),
          ];
          const updates = pinned
            ? { pinned: true, pinnedAt: serverTimestamp() }
            : { pinned: false, pinnedAt: deleteField() };
          await Promise.all(
            refs.map(async (r) => {
              const s = await getDoc(r);
              if (s.exists()) await updateDoc(r, updates);
            })
          );
        };
        if (newPinned) {
          const otherPinned = posts.filter((p) => p.pinned && p.id !== postId);
          await Promise.all(otherPinned.map((p) => syncPin(p.id, false)));
          await syncPin(postId, true);
        } else {
          await syncPin(postId, false);
        }
      } catch (err) {
        console.error("Failed to toggle pin:", err);
        setPosts((prev) => {
          const list = prev.map((p) => (p.id === postId ? { ...p, pinned: currentlyPinned } : p));
          list.sort((a, b) => (a.pinned && !b.pinned ? -1 : !a.pinned && b.pinned ? 1 : 0));
          return list;
        });
        showToast?.("Failed to update pin", "error");
      }
    },
    [creatorId, posts, showToast]
  );

  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const visibilityRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!visibilityOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (visibilityRef.current && !visibilityRef.current.contains(e.target as Node)) setVisibilityOpen(false);
    };
    document.addEventListener("click", handleClickOutside, true);
    return () => document.removeEventListener("click", handleClickOutside, true);
  }, [visibilityOpen]);

  return (
    <div className="fan-hub-feed-chrome">
    <main className="member-feed-main" aria-label="Fan Hub posts">
      <div className="feed-header-wrap">
        <div className="feed-header">
          <button
            type="button"
            className="feed-view-toggle"
            title={viewMode === "feed" ? "Switch to grid view" : "Switch to feed view"}
            aria-label={viewMode === "feed" ? "Switch to grid view" : "Switch to feed view"}
            onClick={() => setViewMode(viewMode === "feed" ? "grid" : "feed")}
          >
            <GridIcon />
          </button>
          <div className="feed-header-right">
            {isAdminMode && (
              <div className="feed-header-visibility-dropdown" ref={visibilityRef}>
                <button
                  type="button"
                  className="feed-header-visibility-btn"
                  onClick={() => setVisibilityOpen((o) => !o)}
                  aria-expanded={visibilityOpen}
                  aria-haspopup="true"
                >
                  Visibility
                </button>
                {visibilityOpen && (
                  <div className="feed-header-visibility-popover" aria-label="Visibility for fans">
                    <span className="feed-header-visibility-label">Visibility for fans</span>
                    <div className="feed-header-toggle-row">
                      <span className="feed-header-toggle-label">Like counts</span>
                      <div className="feed-header-toggle-segment" role="group" aria-label="Like counts visibility">
                        <button
                          type="button"
                          className={`feed-header-toggle-option${!feedSettings.hideLikeCounts ? " active" : ""}`}
                          onClick={() => saveFeedSettings({ ...feedSettings, hideLikeCounts: false })}
                          aria-pressed={!feedSettings.hideLikeCounts}
                        >
                          Show
                        </button>
                        <button
                          type="button"
                          className={`feed-header-toggle-option${feedSettings.hideLikeCounts ? " active" : ""}`}
                          onClick={() => saveFeedSettings({ ...feedSettings, hideLikeCounts: true })}
                          aria-pressed={feedSettings.hideLikeCounts}
                        >
                          Hide
                        </button>
                      </div>
                    </div>
                    <div className="feed-header-toggle-row">
                      <span className="feed-header-toggle-label">Comments</span>
                      <div className="feed-header-toggle-segment" role="group" aria-label="Comments visibility">
                        <button
                          type="button"
                          className={`feed-header-toggle-option${!feedSettings.hideComments ? " active" : ""}`}
                          onClick={() => saveFeedSettings({ ...feedSettings, hideComments: false })}
                          aria-pressed={!feedSettings.hideComments}
                        >
                          Show
                        </button>
                        <button
                          type="button"
                          className={`feed-header-toggle-option${feedSettings.hideComments ? " active" : ""}`}
                          onClick={() => saveFeedSettings({ ...feedSettings, hideComments: true })}
                          aria-pressed={feedSettings.hideComments}
                        >
                          Hide
                        </button>
                      </div>
                    </div>
                    <div className="feed-header-toggle-row">
                      <span className="feed-header-toggle-label">Likes</span>
                      <div className="feed-header-toggle-segment" role="group" aria-label="Likes visibility">
                        <button
                          type="button"
                          className={`feed-header-toggle-option${!feedSettings.hideLikes ? " active" : ""}`}
                          onClick={() => saveFeedSettings({ ...feedSettings, hideLikes: false })}
                          aria-pressed={!feedSettings.hideLikes}
                        >
                          Show
                        </button>
                        <button
                          type="button"
                          className={`feed-header-toggle-option${feedSettings.hideLikes ? " active" : ""}`}
                          onClick={() => saveFeedSettings({ ...feedSettings, hideLikes: true })}
                          aria-pressed={feedSettings.hideLikes}
                        >
                          Hide
                        </button>
                      </div>
                    </div>
                    <div className="feed-header-toggle-row">
                      <span className="feed-header-toggle-label">Tip button</span>
                      <div className="feed-header-toggle-segment" role="group" aria-label="Tip button visibility">
                        <button
                          type="button"
                          className={`feed-header-toggle-option${!feedSettings.hideTipButton ? " active" : ""}`}
                          onClick={() => saveFeedSettings({ ...feedSettings, hideTipButton: false })}
                          aria-pressed={!feedSettings.hideTipButton}
                        >
                          Show
                        </button>
                        <button
                          type="button"
                          className={`feed-header-toggle-option${feedSettings.hideTipButton ? " active" : ""}`}
                          onClick={() => saveFeedSettings({ ...feedSettings, hideTipButton: true })}
                          aria-pressed={feedSettings.hideTipButton}
                        >
                          Hide
                        </button>
                      </div>
                    </div>
                    {/* Elite: AI comment replies */}
                    <div className="feed-header-ai-replies mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                      <span className="feed-header-visibility-label block mb-2">AI comment replies</span>
                      {canUseAIReplies ? (
                        <>
                          <div className="feed-header-toggle-row">
                            <span className="feed-header-toggle-label">AI replies</span>
                            <div className="feed-header-toggle-segment" role="group" aria-label="AI comment replies">
                              <button
                                type="button"
                                className={`feed-header-toggle-option${!!feedSettings.autoReplyAI ? " active" : ""}`}
                                onClick={() => saveFeedSettings({ ...feedSettings, autoReplyAI: true })}
                                aria-pressed={!!feedSettings.autoReplyAI}
                              >
                                On
                              </button>
                              <button
                                type="button"
                                className={`feed-header-toggle-option${!feedSettings.autoReplyAI ? " active" : ""}`}
                                onClick={() => saveFeedSettings({ ...feedSettings, autoReplyAI: false })}
                                aria-pressed={!feedSettings.autoReplyAI}
                              >
                                Off
                              </button>
                            </div>
                          </div>
                          <p className="feed-header-toggle-help">
                            Uses your tone, max 2 replies per fan per post.
                          </p>
                          {feedSettings.autoReplyAI && (
                            <div className="mt-2">
                              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                                Reply chance for other comments (fans who tipped or bought treats are always prioritized): {feedSettings.autoReplyChance ?? 25}%
                              </label>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                step={5}
                                value={feedSettings.autoReplyChance ?? 25}
                                onChange={(e) => saveFeedSettings({ ...feedSettings, autoReplyChance: Number(e.target.value) }, { debounce: true })}
                                className="w-full h-2 rounded-lg appearance-none bg-gray-200 dark:bg-gray-600 fh-range"
                              />
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Elite only — upgrade to unlock AI replies.</p>
                          <button
                            type="button"
                            className="text-xs font-medium fh-link hover:underline"
                            onClick={() => { openPaymentModal?.({ name: "Elite", price: ECHOFLUX_ELITE_MONTHLY_USD, cycle: "monthly" }); }}
                          >
                            Upgrade to Elite
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <button type="button" className="feed-saved-link">
              Saved Posts ({savedPostIds.length})
            </button>
          </div>
        </div>
      </div>

      {loading && <p className="feed-loading">Loading…</p>}

      {viewMode === "feed" ? (
        <>
          {!loading && posts.length === 0 && (
            <p className="feed-empty">No posts yet. Create content to show here.</p>
          )}
          <div className="feed-list">
            {!loading && posts.map((post) => (
              <FeedCard
                key={post.id}
                post={post}
                creatorName={creatorName}
                creatorAvatar={creatorAvatar}
                avatarObjectPosition={avatarObjectPosition}
                currentUserId={creatorId}
                savedPostIds={savedPostIds}
                onLikeUpdated={handleLikeUpdated}
                onCommentsUpdated={handleCommentsUpdated}
                onSavedUpdated={handleSavedUpdated}
                isAdminMode={isAdminMode}
                onEditPost={handleEditPost}
                onDeletePost={handleDeletePost}
                onToggleVisibility={handleToggleVisibility}
                onTogglePin={handleTogglePin}
                creatorThemePrimary={creatorStorefront.themePrimary}
                hideTipButtons={feedSettings.hideTipButton}
                sjHeartEmojiCtx={sjHeartEmojiCtx}
                openCommentsRequested={openPostIdFromGrid === post.id}
                onOpenCommentsRequestConsumed={() =>
                  setOpenPostIdFromGrid((prev) => (prev === post.id ? null : prev))
                }
                onCommentsOpenChange={(isOpen) => {
                  if (!isOpen && returnToGridAfterPostId === post.id) {
                    setViewMode("grid");
                    setReturnToGridAfterPostId(null);
                  }
                }}
                creatorFanPreviewUrl={isAdminMode ? creatorFanPreviewUrl : undefined}
                liveStreamCreatorBroadcast={isAdminMode ? liveStreamCreatorBroadcast : undefined}
                liveStreamHostActiveStreamId={isAdminMode ? liveStreamHostActiveStreamId : undefined}
              />
            ))}
          </div>
        </>
      ) : (
        <>
          {!loading && posts.length === 0 && (
            <p className="feed-empty">No posts yet. Create content to show here.</p>
          )}
          <div className="feed-grid">
            {!loading && posts.map((post) => {
              const { url: coverUrl, isVideo: coverIsVideo } = getFeedGridCoverMedia(post);
              return (
                <button
                  key={post.id}
                  type="button"
                  className="feed-grid-item"
                  onClick={() => {
                    setReturnToGridAfterPostId(post.id);
                    setOpenPostIdFromGrid(post.id);
                    setViewMode("feed");
                  }}
                  onMouseEnter={() => {
                    if (coverIsVideo) setGridHoveredVideoPostId(post.id);
                  }}
                  onMouseLeave={() => setGridHoveredVideoPostId(null)}
                  aria-label="Open post"
                >
                  {coverUrl ? (
                    coverIsVideo ? (
                      <FeedGridVideoThumbnail
                        src={coverUrl}
                        hoverActive={gridHoveredVideoPostId === post.id}
                      />
                    ) : (
                      <img src={coverUrl} alt="" loading="lazy" {...feedImageDownloadGuardProps} />
                    )
                  ) : (
                    <div className="feed-grid-item-text">{post.body?.slice(0, 100)}</div>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </main>
    </div>
  );
};
