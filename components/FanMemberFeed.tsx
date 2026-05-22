"use client";

import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  limit,
  Timestamp,
  doc,
  getDoc,
  setDoc,
  type DocumentData,
  type DocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db, auth } from "../firebaseConfig";
import {
  parseLockedContent,
  isMediaSlotLocked,
  isProtectedLockedMediaUrl,
  type LockedPostContent,
} from "../src/lib/lockedPostMedia";
import { feedSlideMediaBlurStyle, normalizeMediaPreviewBlurPx } from "../src/lib/feedMediaPreviewBlur";
import { resolveFanMemberCommentComposePhotoFromUserDoc } from "../src/lib/fanMemberHubCommentAvatar";
import { getAvatarCropStyle } from "../src/lib/avatarCrop";
import { inferIsVideoFromUrl, normalizePostMediaTypes } from "../src/lib/mediaUrlInfer";
import { getFeedGridCoverMedia, isFeedGridCoverLockedForViewer } from "../src/lib/feedGridCover";
import { FeedCommentListAvatar } from "./FeedCommentAvatar";
import { DmAudioPlayer } from "./DmAudioPlayer";
import { ViewPostModalVideo } from "./ViewPostModalVideo";
import { FeedVideoPlaybackErrorOverlay } from "./FeedVideoPlaybackError";
import { feedCommentAuthorLabel } from "../src/lib/feedCommentLabel";
import { readFanCheckoutFetchResult, FAN_TIP_CHECKOUT_SUCCESS_QS } from "../src/lib/fanCheckoutResponse";
import { useAppContext } from "./AppContext";
import { renderTextWithCustomEmoji, type SjHeartEmojiAccessContext } from "../src/lib/customEmoji";
import {
  captureFanFeedCarouselScrollSnaps,
  restoreFanFeedCarouselScrollSnaps,
  type FanFeedScrollSnap,
} from "../src/lib/fanFeedCarouselScrollRestore";
import { tryFeedVideoPosterSeekOnce } from "../src/lib/feedVideoPosterSeek";
import { resolveApiUrl } from "../src/lib/resolveApiUrl";
import { EmojiIcon } from "./icons/UIIcons";
import { useFanFeedCommentEmojiPicker } from "./fanFeedCommentEmojiPicker";
import type { FanHubPostKind, LiveStreamPromoOnPost } from "../types";
import {
  fanEffectiveStreamStatus,
  mergeLiveStreamPromoWithLiveDocStatus,
  useCreatorLiveStreamStatuses,
} from "../src/hooks/useCreatorLiveStreamStatuses";
import { LiveStreamPromoBanner, type LiveStreamPromoFanAccess } from "./LiveStreamPromoBanner";
import { LiveStreamWatchRoom } from "./LiveStreamWatchRoom";

function liveStreamFanAccess(
  promo: LiveStreamPromoOnPost,
  ctx: {
    fanId?: string;
    fanPageAdminBypass: boolean;
    unlockedStreamIds: Set<string>;
    paidSubscriberTicketSkip: boolean;
  },
): LiveStreamPromoFanAccess {
  if (ctx.fanPageAdminBypass) return "included";
  if (promo.ticketCents <= 0) return "free";
  if (ctx.unlockedStreamIds.has(promo.streamId)) return "included";
  if (promo.freeForSubscribers && ctx.paidSubscriberTicketSkip) return "included";
  if (!ctx.fanId) return "sign_in";
  return "checkout";
}

const feedImageDownloadGuardProps = {
  draggable: false as const,
  onContextMenu: (e: React.MouseEvent<HTMLImageElement>) => e.preventDefault(),
};

const feedVideoDownloadGuardProps = {
  controlsList: "nodownload noplaybackrate noremoteplayback" as const,
  onContextMenu: (e: React.MouseEvent<HTMLVideoElement>) => e.preventDefault(),
};

/** Same tap threshold as FanHubFeed feed-card video */
const FEED_VIDEO_TAP_MAX_PX = 14;

const MemberFeedVideoPlayIcon = () => (
  <svg className="feed-card-play-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M8 5v14l11-7L8 5z" />
  </svg>
);

const MemberFeedVolumeOnIcon = () => (
  <svg className="feed-card-sound-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
);

const MemberFeedVolumeOffIcon = () => (
  <svg className="feed-card-sound-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </svg>
);

const SAVED_BY_CREATOR_KEY = "savedPostIdsByCreator";
const INLINE_COMMENT_PREVIEW_MAX = 120;
const EMPTY_FAN_POST_UNLOCK_SET = new Set<string>();

const FEED_TIP_PRESET_USD = [5, 10, 25, 50, 100, 250] as const;

function isLocalCheckoutHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h.endsWith(".local");
}

function buildTipCheckoutReturnUrl(pathname: string, search: string, hash = ""): string | undefined {
  if (typeof window === "undefined") return undefined;
  if (isLocalCheckoutHost(window.location.hostname)) {
    return `https://echoflux.ai${pathname}${search}${hash}`;
  }
  return `${window.location.origin}${pathname}${search}${hash}`;
}

function buildPostUnlockCheckoutReturnUrls(): { successUrl?: string; cancelUrl?: string } {
  if (typeof window === "undefined") return {};
  const u = new URL(window.location.href);
  const p = new URLSearchParams(u.search.startsWith("?") ? u.search.slice(1) : u.search);
  p.set("post_unlock", "1");
  const enc = p.toString();
  const qs = enc ? `${enc}&session_id={CHECKOUT_SESSION_ID}` : `post_unlock=1&session_id={CHECKOUT_SESSION_ID}`;
  const successUrl = buildTipCheckoutReturnUrl(u.pathname, `?${qs}`, u.hash || "");
  const c = new URL(window.location.href);
  const cancelUrl = buildTipCheckoutReturnUrl(c.pathname, c.search, c.hash || "");
  return { successUrl, cancelUrl };
}

async function startFanPostUnlockCheckoutSession(creatorId: string, postId: string): Promise<string> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
  if (!token) throw new Error("Sign in to unlock this post.");
  const { successUrl, cancelUrl } = buildPostUnlockCheckoutReturnUrls();
  const res = await fetch(resolveApiUrl("/api/createFanCheckoutSession"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      creatorId,
      type: "post_unlock",
      postId,
      ...(successUrl ? { successUrl } : {}),
      ...(cancelUrl ? { cancelUrl } : {}),
    }),
  });
  const { ok, url, error } = await readFanCheckoutFetchResult(res);
  if (!ok || !url) throw new Error(error || "Checkout failed. Please try again.");
  return url;
}

type UnlockedFanPostMediaFetchResult =
  | { ok: true; mediaUrls: string[]; mediaTypes: ("image" | "video")[] }
  | { ok: false; status?: number };

async function fetchUnlockedFanPostMedia(
  creatorId: string,
  postId: string,
): Promise<UnlockedFanPostMediaFetchResult> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
  if (!token) return { ok: false };
  const qs = new URLSearchParams({ creatorId, postId });
  const res = await fetch(resolveApiUrl(`/api/fanPostMedia?${qs.toString()}`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    return { ok: false, status: res.status };
  }
  const data = await res.json().catch(() => null) as {
    mediaUrls?: unknown;
    mediaTypes?: unknown;
  } | null;
  const rawUrls = Array.isArray(data?.mediaUrls)
    ? data.mediaUrls.filter((u): u is string => typeof u === "string" && !!u.trim())
    : [];
  const rawTypes = Array.isArray(data?.mediaTypes) ? data.mediaTypes.filter((t): t is string => typeof t === "string") : [];
  const zippedUrls: string[] = [];
  const zippedTypesRaw: string[] = [];
  rawUrls.forEach((u, i) => {
    if (isProtectedLockedMediaUrl(u.trim())) return;
    zippedUrls.push(u);
    zippedTypesRaw.push(rawTypes[i] || "image");
  });
  return {
    ok: true,
    mediaUrls: zippedUrls,
    mediaTypes: normalizePostMediaTypes(zippedUrls, zippedTypesRaw),
  };
}

function buildLiveStreamTicketCheckoutReturnUrls(): { successUrl?: string; cancelUrl?: string } {
  if (typeof window === "undefined") return {};
  const u = new URL(window.location.href);
  const p = new URLSearchParams(u.search.startsWith("?") ? u.search.slice(1) : u.search);
  p.set("live_stream_ticket", "1");
  p.set("purchase_sync", "1");
  const enc = p.toString();
  const qs = enc
    ? `${enc}&session_id={CHECKOUT_SESSION_ID}`
    : `live_stream_ticket=1&purchase_sync=1&session_id={CHECKOUT_SESSION_ID}`;
  const successUrl = buildTipCheckoutReturnUrl(u.pathname, `?${qs}`, u.hash || "");
  const c = new URL(window.location.href);
  const cancelUrl = buildTipCheckoutReturnUrl(c.pathname, c.search, c.hash || "");
  return { successUrl, cancelUrl };
}

async function startLiveStreamTicketCheckoutSession(creatorId: string, streamId: string): Promise<string> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
  if (!token) throw new Error("Sign in to get a ticket.");
  const { successUrl, cancelUrl } = buildLiveStreamTicketCheckoutReturnUrls();
  const res = await fetch(resolveApiUrl("/api/createFanCheckoutSession"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      creatorId,
      type: "live_stream_ticket",
      streamId,
      ...(successUrl ? { successUrl } : {}),
      ...(cancelUrl ? { cancelUrl } : {}),
    }),
  });
  const { ok, url, error } = await readFanCheckoutFetchResult(res);
  if (!ok || !url) throw new Error(error || "Checkout failed. Please try again.");
  return url;
}

async function startFanTipCheckoutSession(
  creatorId: string,
  amountCents: number,
  fanEmail?: string,
  postId?: string,
): Promise<string> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken(true) : null;
  const successUrl = buildTipCheckoutReturnUrl(window.location.pathname, `?${FAN_TIP_CHECKOUT_SUCCESS_QS}`);
  const cancelUrl = buildTipCheckoutReturnUrl(window.location.pathname, "?tip=cancel");
  const res = await fetch(resolveApiUrl("/api/createFanCheckoutSession"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      creatorId,
      type: "tip",
      amountCents,
      ...(postId ? { postId } : {}),
      ...(fanEmail ? { fanEmail } : {}),
      ...(successUrl ? { successUrl } : {}),
      ...(cancelUrl ? { cancelUrl } : {}),
    }),
  });
  const { ok, url, error } = await readFanCheckoutFetchResult(res);
  if (!ok || !url) throw new Error(error || "Checkout failed. Please try again.");
  return url;
}

const FeedHeaderGridIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

const FeedHeaderListIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <line x1="8" y1="6" x2="21" y2="6" strokeLinecap="round" />
    <line x1="8" y1="12" x2="21" y2="12" strokeLinecap="round" />
    <line x1="8" y1="18" x2="21" y2="18" strokeLinecap="round" />
    <circle cx="4" cy="6" r="1.2" />
    <circle cx="4" cy="12" r="1.2" />
    <circle cx="4" cy="18" r="1.2" />
  </svg>
);

const FeedHeaderBackIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Main feed: left = list↔grid; Saved tab: left = back to feed; right = Saved Posts count / current */
function FanFeedHeaderChrome({
  savedCount,
  onLeftClick,
  leftTitle,
  leftAriaLabel,
  leftIcon,
  feedLayoutMode,
  savedLinkVariant,
  onOpenSaved,
}: {
  savedCount: number;
  onLeftClick: () => void;
  leftTitle: string;
  leftAriaLabel: string;
  leftIcon: "grid-toggle" | "back";
  /** When set (main feed only), exposes layout for a11y + debugging; matches Fan Hub admin toggle. */
  feedLayoutMode?: "feed" | "grid";
  savedLinkVariant: "go-to-saved" | "current-saved";
  onOpenSaved?: () => void;
}) {
  const isGridToggle = leftIcon === "grid-toggle";
  const resolvedToggleTitle =
    feedLayoutMode === "grid" ? "Switch to feed view" : "Switch to grid view";
  const effectiveTitle = isGridToggle ? resolvedToggleTitle : leftTitle;
  const effectiveAriaLabel = isGridToggle ? resolvedToggleTitle : leftAriaLabel;

  return (
    <div className="fan-hub-feed-chrome -mx-1 mb-1">
      <div className="feed-header-wrap">
        <div className="feed-header">
          <button
            type="button"
            className="feed-view-toggle"
            title={effectiveTitle}
            aria-label={effectiveAriaLabel}
            aria-pressed={isGridToggle && feedLayoutMode ? feedLayoutMode === "grid" : undefined}
            data-feed-layout-toggle="true"
            data-feed-layout={isGridToggle && feedLayoutMode ? feedLayoutMode : undefined}
            data-feed-header-action={isGridToggle ? "toggle-layout" : "back-to-feed"}
            onClick={onLeftClick}
          >
            {leftIcon === "back" ? (
              <FeedHeaderBackIcon />
            ) : feedLayoutMode === "grid" ? (
              <FeedHeaderListIcon />
            ) : (
              <FeedHeaderGridIcon />
            )}
          </button>
          <div className="feed-header-right">
            {savedLinkVariant === "go-to-saved" ? (
              <button type="button" className="feed-saved-link" onClick={() => onOpenSaved?.()}>
                Saved Posts ({savedCount})
              </button>
            ) : (
              <span className="feed-saved-link feed-saved-link--current" aria-current="page">
                Saved Posts ({savedCount})
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getInlineCommentPreview(text: string): { preview: string; truncated: boolean } {
  const raw = String(text || "");
  if (raw.length <= INLINE_COMMENT_PREVIEW_MAX) {
    return { preview: raw, truncated: false };
  }
  return { preview: `${raw.slice(0, INLINE_COMMENT_PREVIEW_MAX).trimEnd()}...`, truncated: true };
}

/** Same `white-space: pre-wrap` + caption styling as Fan Hub `FeedCard`. */
function MemberFeedCaptionBody({
  displayName,
  primary,
  content,
  sjHeartEmojiCtx,
}: {
  displayName: string;
  primary: string;
  content: string | undefined;
  sjHeartEmojiCtx: SjHeartEmojiAccessContext;
}) {
  return (
    <p className="feed-card-caption">
      <span className="caption-username" style={{ color: primary }}>
        {displayName}
      </span>
      {renderTextWithCustomEmoji(content ?? "", sjHeartEmojiCtx)}
    </p>
  );
}

/** Same icons as FanHubFeed / stormij-fanhub — multi-media count badge */
const MediaImageIcon = () => (
  <svg
    className="feed-card-count-icon"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
    <circle cx="8.5" cy="10" r="1.5" />
    <path d="M21 15l-4.5-4.5a1 1 0 0 0-1.4 0L9 16.6" />
  </svg>
);

const MediaVideoIcon = () => (
  <svg
    className="feed-card-count-icon"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="3" y="6" width="13" height="12" rx="2" ry="2" />
    <path d="M16 10l5-3v10l-5-3z" />
  </svg>
);

const PlayIcon = () => (
  <svg className="feed-card-play-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M8 5v14l11-7z" />
  </svg>
);

function MemberFeedGridVideoThumbnail({ src, hoverActive }: { src: string; hoverActive: boolean }) {
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

const CarouselChevronLeft = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

const CarouselChevronRight = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 18l6-6-6-6" />
  </svg>
);

/** Visible comments from Firestore (non-hidden) */
export type FanMemberPostComment = {
  author: string;
  text: string;
  authorId?: string;
  isCreatorReply?: boolean;
  /** From Firestore when present (HTTPS); client shows initials if missing/failed load */
  authorPhotoURL?: string;
};

type FanMemberPostPoll = {
  question: string;
  options: string[];
  optionVotes?: number[];
  votesByFan?: Record<string, number>;
};

type FanMemberPostTipGoal = {
  description: string;
  targetCents: number;
  raisedCents: number;
};

interface Post {
  id: string;
  content: string;
  mediaUrls: string[];
  mediaTypes: ("image" | "video")[];
  createdAt: Date;
  likesCount: number;
  commentsCount: number;
  /** Parsed when loading a post doc — used in View post modal */
  commentsList?: FanMemberPostComment[];
  poll?: FanMemberPostPoll;
  tipGoal?: FanMemberPostTipGoal;
  captionStyle?: "static" | "scroll-up" | "scroll-across" | "dissolve";
  overlayText?: string;
  overlayTextColor?: string;
  overlayTextSize?: number;
  overlayHighlight?: boolean;
  overlayItalic?: boolean;
  pinned?: boolean;
  hideComments?: boolean;
  hideLikes?: boolean;
  hideLikeCounts?: boolean;
  lockedContent?: LockedPostContent;
  audioUrls?: string[];
  likedBy?: string[];
  /** Firestore path for the doc this row was merged from (informational; likes use API). */
  feedFirestorePath?: string;
  postKind?: FanHubPostKind;
  liveStreamPromo?: LiveStreamPromoOnPost;
  /** Teaser blur on public preview while locked for this viewer */
  mediaPreviewBlurPx?: number;
}

function isPublishedFanMemberPostStatus(raw: unknown): boolean {
  if (raw == null || raw === "") return true; // Legacy Fan Hub posts did not always store status.
  return String(raw).trim().toLowerCase() === "published";
}

function parseLiveStreamPromoMember(data: DocumentData): LiveStreamPromoOnPost | undefined {
  const raw = data.liveStreamPromo;
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

function parseFanMemberPostPoll(data: DocumentData): FanMemberPostPoll | undefined {
  const raw = data.poll;
  if (!raw || typeof raw !== "object") return undefined;
  const poll = raw as Record<string, unknown>;
  const question = typeof poll.question === "string" ? poll.question.trim() : "";
  const options = Array.isArray(poll.options)
    ? poll.options
        .filter((option): option is string => typeof option === "string" && !!option.trim())
        .map((option) => option.trim())
    : [];
  if (!question || options.length < 2) return undefined;
  const optionVotes = Array.isArray(poll.optionVotes)
    ? poll.optionVotes.map((vote) => (typeof vote === "number" && Number.isFinite(vote) ? Math.max(0, Math.round(vote)) : 0))
    : undefined;
  const votesByFanRaw = poll.votesByFan && typeof poll.votesByFan === "object" ? poll.votesByFan as Record<string, unknown> : {};
  const votesByFan = Object.fromEntries(
    Object.entries(votesByFanRaw)
      .filter(([, vote]) => typeof vote === "number" && Number.isFinite(vote))
      .map(([fan, vote]) => [fan, Math.max(0, Math.round(vote as number))])
  );
  return {
    question,
    options,
    ...(optionVotes ? { optionVotes: optionVotes.slice(0, options.length) } : {}),
    ...(Object.keys(votesByFan).length > 0 ? { votesByFan } : {}),
  };
}

function parseFanMemberPostTipGoal(data: DocumentData): FanMemberPostTipGoal | undefined {
  const raw = data.tipGoal;
  if (!raw || typeof raw !== "object") return undefined;
  const tipGoal = raw as Record<string, unknown>;
  const description = typeof tipGoal.description === "string" ? tipGoal.description.trim() : "";
  const targetCents =
    typeof tipGoal.targetCents === "number" && Number.isFinite(tipGoal.targetCents)
      ? Math.max(0, Math.round(tipGoal.targetCents))
      : 0;
  if (!description || targetCents <= 0) return undefined;
  const raisedCents =
    typeof tipGoal.raisedCents === "number" && Number.isFinite(tipGoal.raisedCents)
      ? Math.max(0, Math.round(tipGoal.raisedCents))
      : 0;
  return { description, targetCents, raisedCents };
}

function FanMemberPostPollView({
  poll,
  fanId,
  onVote,
}: {
  poll?: FanMemberPostPoll;
  fanId?: string;
  onVote?: (optionIndex: number) => void | Promise<void>;
}) {
  if (!poll?.question || poll.options.length < 2) return null;
  const votes = poll.optionVotes ?? poll.options.map(() => 0);
  const total = votes.reduce((sum, vote) => sum + vote, 0);
  const votedIndex = fanId ? poll.votesByFan?.[fanId] : undefined;
  const hasVoted = typeof votedIndex === "number";
  const canVote = !!onVote && !hasVoted;
  return (
    <div className="feed-card-poll">
      <p className="feed-card-poll-question">{poll.question}</p>
      <ul className="feed-card-poll-options">
        {poll.options.map((option, index) => {
          const voteCount = votes[index] ?? 0;
          const percent = total > 0 ? Math.round((voteCount / total) * 100) : 0;
          return (
            <li
              key={`${option}-${index}`}
              className={`feed-card-poll-option${hasVoted && votedIndex === index ? " feed-card-poll-option--selected" : ""}`}
            >
              <button
                type="button"
                className="feed-card-poll-option-button"
                onClick={() => void onVote?.(index)}
                disabled={!canVote}
                aria-pressed={hasVoted && votedIndex === index}
              >
                <span className="feed-card-poll-option-label">{option}</span>
                <span className="feed-card-poll-option-meta">
                  {total > 0 ? `${percent}%` : "0%"}
                  {hasVoted && votedIndex === index ? " · Your vote" : ""}
                </span>
              </button>
              {total > 0 ? <div className="feed-card-poll-option-bar" style={{ width: `${percent}%` }} aria-hidden /> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FanMemberPostTipGoalView({
  tipGoal,
  primary,
  showTipButton,
  onSendTip,
}: {
  tipGoal?: FanMemberPostTipGoal;
  primary: string;
  showTipButton: boolean;
  onSendTip?: () => void;
}) {
  if (!tipGoal || tipGoal.targetCents <= 0) return null;
  const percent = Math.min(100, Math.round((tipGoal.raisedCents / tipGoal.targetCents) * 100));
  return (
    <div className="feed-card-tip-goal">
      <p className="feed-card-tip-goal-desc">{tipGoal.description}</p>
      <div className="feed-card-tip-goal-bar-wrap">
        <div className="feed-card-tip-goal-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="feed-card-tip-goal-raised">
          ${(tipGoal.raisedCents / 100).toFixed(2)} of ${(tipGoal.targetCents / 100).toFixed(2)}
        </p>
        {showTipButton && onSendTip ? (
          <button
            type="button"
            className="feed-card-send-tip"
            aria-label={`Send a tip toward ${tipGoal.description}`}
            onClick={onSendTip}
            style={{ backgroundColor: primary, borderColor: primary, color: "#fff" }}
          >
            <span className="tip-currency">$</span>
            <span>SEND TIP</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

function FanMemberCaptionOverlay({
  post,
  sjHeartEmojiCtx,
}: {
  post: Post;
  sjHeartEmojiCtx: SjHeartEmojiAccessContext;
}) {
  const captionStyle = post.captionStyle ?? "static";
  const caption = post.overlayText?.trim() || (captionStyle !== "static" ? post.content?.trim() || "" : "");
  if (!caption) return null;
  const textStyle: React.CSSProperties = {
    ...(typeof post.overlayTextSize === "number" && post.overlayTextSize > 0 ? { fontSize: `${post.overlayTextSize}px` } : {}),
    ...(post.overlayTextColor ? { color: post.overlayTextColor } : {}),
    ...(post.overlayItalic ? { fontStyle: "italic" } : {}),
    ...(post.overlayHighlight
      ? {
          backgroundColor: "rgba(0, 0, 0, 0.45)",
          borderRadius: "999px",
          padding: "0.25rem 0.7rem",
        }
      : {}),
  };
  return (
    <div className={`feed-card-caption-overlay feed-card-caption-overlay-${captionStyle}`} aria-hidden>
      <span className="feed-card-caption-overlay-text" style={textStyle}>
        {renderTextWithCustomEmoji(caption, sjHeartEmojiCtx)}
      </span>
    </div>
  );
}

export interface FanFeedVisibilitySettings {
  hideLikeCounts?: boolean;
  hideComments?: boolean;
  hideLikes?: boolean;
  hideTipButton?: boolean;
}

interface FanMemberFeedProps {
  creatorId: string;
  /** Storefront URL handle — used for SJ custom emoji visibility */
  creatorHandle?: string;
  displayName: string;
  avatar?: string;
  /** CSS object-position for circular avatar (matches storefront “pan avatar”). */
  avatarObjectPosition?: string;
  primary?: string;
  feedSettings?: FanFeedVisibilitySettings;
  /** Logged-in fan's uid; when set, bookmarks are persisted and loaded from Firestore */
  fanId?: string;
  /** Post IDs this fan has paid to unlock (from getFanEntitlement). */
  unlockedFanPostIds?: string[];
  /** Live stream event ids the fan purchased a ticket for (`live_stream_ticket` checkout). */
  unlockedLiveStreamIds?: string[];
  /** Paid membership (not free tier): used with `freeForSubscribers` stream promos to skip ticket. */
  liveStreamPaidMemberTicketSkip?: boolean;
  /** Server-granted QA access: show all locked media as unlocked (see FAN_PAGE_ADMIN_MEMBER_* env). */
  fanPageAdminBypass?: boolean;
  /** `?preview=member`: show creator-test live promo posts like Fan Hub admin preview (not real fans). */
  previewMember?: boolean;
  /** Optional member-header shortcut to open Saved tab. */
  onOpenSaved?: () => void;
  /** When false, hide the feed “Send tip” control (creator disabled Tips section). */
  tipsEnabled?: boolean;
  /** Same heading/subline as the full Tip tab (from My Page / resolveTipSectionCopy). */
  tipHeading?: string;
  tipSubline?: string;
  /**
   * When provided (possibly `""`), comment compose avatar uses this URL instead of resolving `users/{fanId}` internally.
   * Parent should pass FanStorefrontView `memberAvatar` (and treat failed loads like the header).
   */
  hubViewerComposeAvatarUrl?: string;
}

const DEMO_POSTS: Post[] = [
  {
    id: "demo-1",
    content: "Good morning everyone 🌸 Starting the day with some coffee and journaling. What's everyone up to today?",
    mediaUrls: ["https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&h=600&fit=crop"],
    mediaTypes: ["image"],
    createdAt: new Date(Date.now() - 1000 * 60 * 30), // 30 mins ago
    likesCount: 42,
    commentsCount: 8,
  },
  {
    id: "demo-2",
    content: "Behind the scenes from yesterday's shoot 📸 We had so much fun with this one. Can't wait to share more!",
    mediaUrls: ["https://images.unsplash.com/photo-1516575334481-f85287c2c82d?w=600&h=600&fit=crop"],
    mediaTypes: ["image"],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4), // 4 hours ago
    likesCount: 128,
    commentsCount: 23,
  },
  {
    id: "demo-3",
    content: "Quick life update: Been working on something really exciting that I'll share with you all soon. Hint: it involves a trip ✈️",
    mediaUrls: ["https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&h=600&fit=crop"],
    mediaTypes: ["image"],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
    likesCount: 89,
    commentsCount: 15,
  },
  {
    id: "demo-4",
    content: "Thinking about doing a Q&A session this week. Drop your questions below and I'll answer them in my next post 💬",
    mediaUrls: [],
    mediaTypes: [],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48), // 2 days ago
    likesCount: 156,
    commentsCount: 67,
  },
  {
    id: "demo-5",
    content: "New content dropping this weekend! 🎉 Make sure your notifications are on so you don't miss it.",
    mediaUrls: ["https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&h=600&fit=crop"],
    mediaTypes: ["image"],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72), // 3 days ago
    likesCount: 203,
    commentsCount: 34,
  },
  {
    id: "demo-locked-multi",
    content: "Locked set — first image is your free preview 🔒",
    mediaUrls: [
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400&h=400&fit=crop",
    ],
    mediaTypes: ["image", "image", "image"],
    lockedContent: { enabled: true, priceCents: 999, previewMediaIndex: 0 },
    createdAt: new Date(Date.now() - 1000 * 60 * 120),
    likesCount: 12,
    commentsCount: 2,
  },
];

function postFromFirestore(
  snap: DocumentSnapshot<DocumentData>,
  opts?: { allowCreatorTestLivePromos?: boolean },
): Post | null {
  if (!snap.exists()) return null;
  const docId = snap.id;
  const data = snap.data();
  if (!isPublishedFanMemberPostStatus(data.status)) return null;
  const createdAt =
    data.createdAt instanceof Timestamp
      ? data.createdAt.toDate()
      : new Date((data.createdAt as string) || Date.now());
  const mediaUrls: string[] = Array.isArray(data.mediaUrls)
    ? (data.mediaUrls as string[]).filter((u) => typeof u === "string" && u)
    : data.mediaUrl
      ? [String(data.mediaUrl)]
      : [];
  const rawTypes = Array.isArray(data.mediaTypes) ? (data.mediaTypes as string[]) : [];
  const mediaTypes = normalizePostMediaTypes(mediaUrls, rawTypes);
  const audioUrls: string[] = Array.isArray(data.audioUrls)
    ? (data.audioUrls as string[]).filter((u) => typeof u === "string" && u.trim())
    : [];
  const rawComments = Array.isArray(data.comments) ? (data.comments as unknown[]) : [];
  const commentsList: FanMemberPostComment[] = [];
  for (const c of rawComments) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    if (o.hidden) continue;
    const text = typeof o.text === "string" ? o.text.trim() : "";
    if (!text) continue;
    const author = feedCommentAuthorLabel({
      username: typeof o.username === "string" ? o.username : undefined,
      author: typeof o.author === "string" ? o.author : undefined,
      isCreatorReply: !!o.isCreatorReply,
    });
    const authorPhotoRaw =
      (typeof (o as { authorPhotoURL?: string }).authorPhotoURL === "string" &&
        (o as { authorPhotoURL?: string }).authorPhotoURL!.trim()) ||
      (typeof o.photoURL === "string" && o.photoURL.trim()) ||
      (typeof o.avatarUrl === "string" && o.avatarUrl.trim()) ||
      "";
    commentsList.push({
      author,
      text,
      ...(typeof o.authorId === "string" && o.authorId.trim() ? { authorId: o.authorId.trim() } : {}),
      isCreatorReply: !!o.isCreatorReply,
      ...(authorPhotoRaw ? { authorPhotoURL: authorPhotoRaw } : {}),
    });
  }
  const lc = parseLockedContent(data.lockedContent);
  const commentsCountFallback =
    commentsList.length > 0
      ? commentsList.length
      : typeof data.commentsCount === "number"
        ? data.commentsCount
        : rawComments.length;
  const likedByRaw = Array.isArray(data.likedBy) ? (data.likedBy as unknown[]) : [];
  const likedBy = likedByRaw.map((v) => String(v));
  const liveStreamPromo = parseLiveStreamPromoMember(data);
  const poll = parseFanMemberPostPoll(data);
  const tipGoal = parseFanMemberPostTipGoal(data);
  if (liveStreamPromo?.creatorTestOnly && !opts?.allowCreatorTestLivePromos) {
    return null;
  }
  let postKind: FanHubPostKind | undefined;
  if (liveStreamPromo) {
    postKind = "live_stream_promo";
  } else if (data.postKind === "standard") {
    postKind = "standard";
  }
  return {
    id: docId,
    content: (data.body as string) || (data.content as string) || "",
    mediaUrls,
    mediaTypes,
    audioUrls: audioUrls.length ? audioUrls : undefined,
    createdAt,
    likesCount:
      typeof data.likeCount === "number" ? data.likeCount : (data.likesCount as number) || 0,
    commentsCount: commentsCountFallback,
    commentsList: commentsList.length > 0 ? commentsList : undefined,
    poll,
    tipGoal,
    captionStyle: (data.captionStyle as Post["captionStyle"]) ?? "static",
    overlayText: typeof data.overlayText === "string" ? data.overlayText : undefined,
    overlayTextColor: typeof data.overlayTextColor === "string" ? data.overlayTextColor : undefined,
    overlayTextSize: typeof data.overlayTextSize === "number" ? data.overlayTextSize : 18,
    overlayHighlight: !!data.overlayHighlight,
    overlayItalic: !!data.overlayItalic,
    pinned: !!(data.pinned as boolean),
    hideComments: data.hideComments as boolean | undefined,
    hideLikes: data.hideLikes as boolean | undefined,
    hideLikeCounts: data.hideLikeCounts as boolean | undefined,
    lockedContent: lc,
    likedBy: likedBy.length > 0 ? likedBy : undefined,
    feedFirestorePath: snap.ref.path,
    postKind,
    liveStreamPromo,
    mediaPreviewBlurPx: (() => {
      const b = normalizeMediaPreviewBlurPx(data.mediaPreviewBlurPx);
      return b > 0 ? b : undefined;
    })(),
  };
}

function FanMemberPostMedia({
  post,
  primary,
  variant = "feed",
  splitModal = false,
  creatorId,
  fanId,
  unlockedFanPostIds,
  fanPageAdminBypass = false,
  unlockingPostId = null,
  onUnlockPost,
  onUnlockNeedSignIn,
  sjHeartEmojiCtx,
}: {
  post: Post;
  primary: string;
  /** `detail` = larger view-post modal (taller/wider than feed card) */
  variant?: "feed" | "detail";
  /** Same media chrome as creator View post (split modal): modal classes + loop video */
  splitModal?: boolean;
  creatorId?: string;
  fanId?: string;
  unlockedFanPostIds?: Set<string>;
  fanPageAdminBypass?: boolean;
  unlockingPostId?: string | null;
  onUnlockPost?: (postId: string) => void | Promise<void>;
  /** Shown when user taps Unlock but fanId is missing (e.g. auth still restoring). */
  onUnlockNeedSignIn?: (message: string) => void;
  sjHeartEmojiCtx: SjHeartEmojiAccessContext;
}) {
  const [resolvedMedia, setResolvedMedia] = useState<{
    postId: string;
    mediaUrls: string[];
    mediaTypes: ("image" | "video")[];
  } | null>(null);
  const [unlockMediaLoadFailed, setUnlockMediaLoadFailed] = useState(false);
  const shouldResolveProtectedMedia =
    !!creatorId &&
    (fanPageAdminBypass || (unlockedFanPostIds ?? EMPTY_FAN_POST_UNLOCK_SET).has(post.id)) &&
    post.mediaUrls.some(isProtectedLockedMediaUrl);
  const urls =
    resolvedMedia?.postId === post.id && resolvedMedia.mediaUrls.length > 0
      ? resolvedMedia.mediaUrls
      : post.mediaUrls;
  const types =
    resolvedMedia?.postId === post.id && resolvedMedia.mediaUrls.length > 0
      ? resolvedMedia.mediaTypes
      : post.mediaTypes;
  const n = urls.length;
  const isDemoPost = post.id.startsWith("demo-");
  const idSet = unlockedFanPostIds ?? EMPTY_FAN_POST_UNLOCK_SET;
  const postUnlocked = fanPageAdminBypass || idSet.has(post.id);
  const lockedCfg = !postUnlocked && post.lockedContent?.enabled ? post.lockedContent : undefined;

  const [mediaIndex, setMediaIndex] = useState(0);
  const carouselRootRef = useRef<HTMLDivElement>(null);
  const scrollRestoreSnapsRef = useRef<FanFeedScrollSnap[] | null>(null);
  const videoPosterSeekDoneRef = useRef(false);
  const [memberVideoDecodeError, setMemberVideoDecodeError] = useState(false);

  useEffect(() => {
    setMediaIndex(0);
    setResolvedMedia(null);
    setUnlockMediaLoadFailed(false);
  }, [post.id]);

  useEffect(() => {
    if (!shouldResolveProtectedMedia || !creatorId) {
      setUnlockMediaLoadFailed(false);
      return;
    }
    setUnlockMediaLoadFailed(false);
    let cancelled = false;
    void fetchUnlockedFanPostMedia(creatorId, post.id)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setUnlockMediaLoadFailed(true);
          return;
        }
        if (!result.mediaUrls.length) {
          setUnlockMediaLoadFailed(true);
          return;
        }
        setUnlockMediaLoadFailed(false);
        setResolvedMedia({
          postId: post.id,
          mediaUrls: result.mediaUrls,
          mediaTypes: result.mediaTypes,
        });
      })
      .catch(() => {
        if (!cancelled) setUnlockMediaLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [creatorId, post.id, shouldResolveProtectedMedia]);

  useEffect(() => {
    setMediaIndex((i) => Math.min(i, Math.max(0, n - 1)));
  }, [n]);

  useLayoutEffect(() => {
    const snaps = scrollRestoreSnapsRef.current;
    if (!snaps?.length) return;
    scrollRestoreSnapsRef.current = null;
    restoreFanFeedCarouselScrollSnaps(snaps);
    // Scroll anchoring / focus can adjust scroll after layout; restore again on the next frame(s).
    const id = window.requestAnimationFrame(() => {
      restoreFanFeedCarouselScrollSnaps(snaps);
      window.requestAnimationFrame(() => restoreFanFeedCarouselScrollSnaps(snaps));
    });
    return () => window.cancelAnimationFrame(id);
  }, [mediaIndex]);

  const mediaTotals = useMemo(() => {
    return urls.reduce(
      (acc, url, index) => {
        const explicitType = types[index];
        const detectedType =
          explicitType === "video" || inferIsVideoFromUrl(url || "") ? "video" : "image";
        if (detectedType === "video") acc.videos += 1;
        else acc.images += 1;
        return acc;
      },
      { images: 0, videos: 0 }
    );
  }, [urls, types]);

  const goPrev = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (n <= 1) return;
      scrollRestoreSnapsRef.current = captureFanFeedCarouselScrollSnaps(carouselRootRef.current);
      setMediaIndex((i) => Math.max(0, i - 1));
      (e.currentTarget as HTMLButtonElement).blur();
    },
    [n]
  );

  const goNext = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (n <= 1) return;
      scrollRestoreSnapsRef.current = captureFanFeedCarouselScrollSnaps(carouselRootRef.current);
      setMediaIndex((i) => Math.min(n - 1, i + 1));
      (e.currentTarget as HTMLButtonElement).blur();
    },
    [n]
  );

  /** Stops focus-on-click from scrolling the focused control into view (esp. inside nested scrollers). */
  const onCarouselControlMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const onCarouselControlPointerDownCapture = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "mouse") e.preventDefault();
  }, []);

  const onCarouselKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (n <= 1) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        scrollRestoreSnapsRef.current = captureFanFeedCarouselScrollSnaps(carouselRootRef.current);
        setMediaIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        scrollRestoreSnapsRef.current = captureFanFeedCarouselScrollSnaps(carouselRootRef.current);
        setMediaIndex((i) => Math.min(n - 1, i + 1));
      }
    },
    [n]
  );

  const goToSlide = useCallback((i: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    scrollRestoreSnapsRef.current = captureFanFeedCarouselScrollSnaps(carouselRootRef.current);
    setMediaIndex(i);
    (e.currentTarget as HTMLButtonElement).blur();
  }, []);

  const idx = n > 0 ? Math.min(mediaIndex, n - 1) : 0;
  const currentUrl = n > 0 ? urls[idx] : "";
  const currentProtectedPlaceholder = isProtectedLockedMediaUrl(currentUrl);
  const currentIsVideo =
    n > 0 && (types[idx] === "video" || (!currentProtectedPlaceholder && inferIsVideoFromUrl(currentUrl)));
  const activeVideoSrcKey =
    currentIsVideo && currentUrl ? (currentUrl.split("#")[0]?.trim() ?? "") : "";

  const lockedCurrent =
    n === 0
      ? false
      : isMediaSlotLocked(lockedCfg, idx, n) || (!!lockedCfg && currentProtectedPlaceholder);

  const postHasPaywallLock = !!post.lockedContent?.enabled;
  const viewerUnlockedPaywall = postHasPaywallLock && postUnlocked;

  const teaserBlurStyle = useMemo(
    () =>
      feedSlideMediaBlurStyle(post.mediaPreviewBlurPx, lockedCfg, viewerUnlockedPaywall, idx, urls),
    [post.mediaPreviewBlurPx, lockedCfg, viewerUnlockedPaywall, idx, urls],
  );

  const useInteractiveMemberFeedVideo =
    !splitModal &&
    variant === "feed" &&
    n > 0 &&
    currentIsVideo &&
    !lockedCurrent &&
    !currentProtectedPlaceholder;

  const memberFeedVideoRef = useRef<HTMLVideoElement | null>(null);
  const memberFeedVideoTouchStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const memberFeedVideoSuppressClickRef = useRef(false);
  const [memberFeedVideoPlaying, setMemberFeedVideoPlaying] = useState(false);
  const [memberFeedVideoMuted, setMemberFeedVideoMuted] = useState(true);
  const [memberFeedVideoHover, setMemberFeedVideoHover] = useState(false);

  useEffect(() => {
    videoPosterSeekDoneRef.current = false;
    setMemberVideoDecodeError(false);
  }, [idx, activeVideoSrcKey]);

  useEffect(() => {
    const v = memberFeedVideoRef.current;
    if (!v) return;
    v.muted = memberFeedVideoMuted;
  }, [memberFeedVideoMuted]);

  useEffect(() => {
    void memberFeedVideoRef.current?.pause();
    setMemberFeedVideoPlaying(false);
    setMemberFeedVideoHover(false);
  }, [idx]);

  useEffect(() => {
    if (!currentIsVideo) setMemberFeedVideoHover(false);
  }, [currentIsVideo]);

  useEffect(() => {
    if (!useInteractiveMemberFeedVideo || memberVideoDecodeError) {
      const v = memberFeedVideoRef.current;
      if (v && !v.paused) v.pause();
      setMemberFeedVideoPlaying(false);
      setMemberFeedVideoHover(false);
      return;
    }
    const v = memberFeedVideoRef.current;
    if (!v) return;
    if (memberFeedVideoHover) {
      void v.play().catch(() => {});
    } else {
      v.pause();
      setMemberFeedVideoPlaying(false);
      try {
        v.currentTime = 0;
      } catch {
        /* ignore */
      }
      videoPosterSeekDoneRef.current = false;
      tryFeedVideoPosterSeekOnce(v, videoPosterSeekDoneRef);
    }
  }, [memberFeedVideoHover, useInteractiveMemberFeedVideo, activeVideoSrcKey, idx, memberVideoDecodeError]);

  const toggleMemberFeedVideoPlay = useCallback(() => {
    if (memberVideoDecodeError) return;
    const v = memberFeedVideoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, [memberVideoDecodeError]);

  const memberVideoAreaClick = useCallback(
    (e: React.MouseEvent) => {
      if (memberFeedVideoSuppressClickRef.current) {
        memberFeedVideoSuppressClickRef.current = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      toggleMemberFeedVideoPlay();
    },
    [toggleMemberFeedVideoPlay],
  );

  const memberVideoAreaPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    memberFeedVideoTouchStartRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
  }, []);

  const memberVideoAreaPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
      const start = memberFeedVideoTouchStartRef.current;
      memberFeedVideoTouchStartRef.current = null;
      if (!start || start.pointerId !== e.pointerId) return;
      const dx = Math.abs(e.clientX - start.x);
      const dy = Math.abs(e.clientY - start.y);
      if (dx > FEED_VIDEO_TAP_MAX_PX || dy > FEED_VIDEO_TAP_MAX_PX) return;
      e.preventDefault();
      memberFeedVideoSuppressClickRef.current = true;
      toggleMemberFeedVideoPlay();
    },
    [toggleMemberFeedVideoPlay],
  );

  const memberVideoAreaPointerCancel = useCallback(() => {
    memberFeedVideoTouchStartRef.current = null;
  }, []);

  const memberVideoAreaKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      toggleMemberFeedVideoPlay();
    },
    [toggleMemberFeedVideoPlay],
  );

  if (n === 0) return null;

  const totalSlots = mediaTotals.images + mediaTotals.videos;
  const showMultiBadge = totalSlots > 1;
  const showCarousel = n > 1;

  const badgeAria = [
    mediaTotals.images > 0
      ? `${mediaTotals.images} ${mediaTotals.images === 1 ? "image" : "images"}`
      : "",
    mediaTotals.videos > 0
      ? `${mediaTotals.videos} ${mediaTotals.videos === 1 ? "video" : "videos"}`
      : "",
  ]
    .filter(Boolean)
    .join(", ");

  const slideLabel = `Slide ${idx + 1} of ${n}`;

  const unlockOfferEligible =
    typeof post.lockedContent?.priceCents === "number" &&
    post.lockedContent.priceCents >= 50 &&
    !!creatorId &&
    !!onUnlockPost &&
    !isDemoPost;

  const lockPriceCents = post.lockedContent?.priceCents;
  const hasLockPriceLabel =
    typeof lockPriceCents === "number" && Number.isFinite(lockPriceCents) && lockPriceCents > 0;
  const lockPriceText = hasLockPriceLabel ? `Unlock $${(lockPriceCents / 100).toFixed(2)}` : null;
  const lockBlurOverlayPx = normalizeMediaPreviewBlurPx(post.mediaPreviewBlurPx);

  const rootClass = splitModal
    ? `feed-comments-modal-media-wrap fan-feed-media-carousel${
        showCarousel ? " feed-comments-modal-media-wrap--carousel" : ""
      }${currentIsVideo ? " feed-card-media-wrap-video" : ""}${
        lockedCurrent ? " fan-feed-media-cell--locked" : ""
      }`
    : `feed-card-media-wrap fan-feed-media-carousel${
        variant === "detail" ? " fan-member-post-media--detail" : ""
      }${currentIsVideo ? " feed-card-media-wrap-video" : ""}${
        lockedCurrent ? " fan-feed-media-cell--locked" : ""
      }`;

  return (
    <div
      ref={carouselRootRef}
      role={
        showCarousel ? "group" : useInteractiveMemberFeedVideo ? "button" : undefined
      }
      aria-roledescription={showCarousel ? "carousel" : undefined}
      aria-label={
        showCarousel
          ? `Post media, ${slideLabel}`
          : useInteractiveMemberFeedVideo
            ? memberVideoDecodeError
              ? "Video cannot be played in this browser"
              : memberFeedVideoPlaying
                ? "Pause video"
                : "Play video"
            : undefined
      }
      tabIndex={showCarousel || useInteractiveMemberFeedVideo ? 0 : undefined}
      onKeyDown={(e) => {
        if (useInteractiveMemberFeedVideo && (e.key === "Enter" || e.key === " ")) {
          memberVideoAreaKeyDown(e);
          return;
        }
        if (showCarousel) onCarouselKeyDown(e);
      }}
      onMouseEnter={useInteractiveMemberFeedVideo ? () => setMemberFeedVideoHover(true) : undefined}
      onMouseLeave={useInteractiveMemberFeedVideo ? () => setMemberFeedVideoHover(false) : undefined}
      onClick={useInteractiveMemberFeedVideo ? memberVideoAreaClick : undefined}
      onPointerDown={useInteractiveMemberFeedVideo ? memberVideoAreaPointerDown : undefined}
      onPointerUp={useInteractiveMemberFeedVideo ? memberVideoAreaPointerUp : undefined}
      onPointerCancel={useInteractiveMemberFeedVideo ? memberVideoAreaPointerCancel : undefined}
      className={rootClass}
    >
      {showCarousel ? (
        <span className="sr-only" aria-live="polite">
          {slideLabel}
        </span>
      ) : null}
      {currentProtectedPlaceholder || lockedCurrent ? (
        <div
          className={splitModal ? "feed-comments-modal-media fan-feed-media-protected-placeholder" : "feed-card-media fan-feed-media-protected-placeholder"}
          aria-hidden
        />
      ) : currentIsVideo ? (
        splitModal ? (
          <ViewPostModalVideo
            src={currentUrl}
            videoKey={`${post.id}-member-modal-v-${idx}`}
            accentHex={primary}
            mediaBlurStyle={teaserBlurStyle}
          />
        ) : useInteractiveMemberFeedVideo ? (
          <>
            <video
              ref={memberFeedVideoRef}
              key={`${post.id}-v-${idx}`}
              src={currentUrl.split("#")[0]}
              muted={memberFeedVideoMuted}
              loop
              playsInline
              className="feed-card-media feed-card-media-video"
              style={teaserBlurStyle}
              preload="metadata"
              {...feedVideoDownloadGuardProps}
              onLoadedMetadata={(e) => {
                tryFeedVideoPosterSeekOnce(e.currentTarget, videoPosterSeekDoneRef);
              }}
              onError={() => setMemberVideoDecodeError(true)}
              onPlay={() => setMemberFeedVideoPlaying(true)}
              onPause={() => setMemberFeedVideoPlaying(false)}
              onVolumeChange={(e) => setMemberFeedVideoMuted(e.currentTarget.muted)}
            />
            {!memberVideoDecodeError && !memberFeedVideoPlaying && (
              <span className="feed-card-play-overlay" aria-hidden>
                <MemberFeedVideoPlayIcon />
              </span>
            )}
            {!memberVideoDecodeError && (
              <button
                type="button"
                className={`feed-card-sound-toggle${memberFeedVideoMuted ? " muted" : ""}`}
                aria-label={memberFeedVideoMuted ? "Unmute video" : "Mute video"}
                title={memberFeedVideoMuted ? "Unmute" : "Mute"}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMemberFeedVideoMuted((prev) => !prev);
                }}
              >
                {memberFeedVideoMuted ? <MemberFeedVolumeOffIcon /> : <MemberFeedVolumeOnIcon />}
              </button>
            )}
            {memberVideoDecodeError && currentUrl ? <FeedVideoPlaybackErrorOverlay videoSrc={currentUrl} /> : null}
          </>
        ) : (
          <>
            <video
              key={`${post.id}-v-${idx}`}
              src={currentUrl.split("#")[0]}
              controls
              className="feed-card-media feed-card-media-video"
              style={teaserBlurStyle}
              playsInline
              preload="metadata"
              {...feedVideoDownloadGuardProps}
              onLoadedMetadata={(e) => {
                tryFeedVideoPosterSeekOnce(e.currentTarget, videoPosterSeekDoneRef);
              }}
              onError={() => setMemberVideoDecodeError(true)}
            />
            {memberVideoDecodeError ? <FeedVideoPlaybackErrorOverlay videoSrc={currentUrl} /> : null}
          </>
        )
      ) : (
        <img
          key={`${post.id}-i-${idx}`}
          src={currentUrl}
          alt=""
          className={splitModal ? "feed-comments-modal-media" : "feed-card-media"}
          style={teaserBlurStyle}
          loading={idx === 0 ? "lazy" : "eager"}
          {...feedImageDownloadGuardProps}
        />
      )}
      <FanMemberCaptionOverlay post={post} sjHeartEmojiCtx={sjHeartEmojiCtx} />
      {lockedCurrent && (
        <div
          className={`fan-feed-media-lock-overlay${unlockOfferEligible ? " fan-feed-media-lock-overlay--center-unlock" : ""}${
            lockBlurOverlayPx > 0 ? " fan-feed-media-lock-overlay--teaser-blur" : ""
          }`}
          role="region"
          aria-label="Locked media"
          onContextMenu={(e) => e.preventDefault()}
        >
          {!unlockOfferEligible ? (
            <>
              <span className="fan-feed-media-lock-icon" aria-hidden>
                🔒
              </span>
              <span className="fan-feed-media-lock-text" style={{ color: primary }}>
                {lockPriceText ?? (isDemoPost ? "Preview (demo)" : "Locked")}
              </span>
            </>
          ) : (
            <div className="fan-feed-media-lock-unlock-stack fan-feed-media-lock-unlock-stack--overlay-center">
              <span className="fan-feed-media-lock-icon fan-feed-media-lock-icon--in-stack" aria-hidden>
                🔒
              </span>
              <button
                type="button"
                className="fan-feed-media-lock-unlock-btn fan-feed-media-lock-unlock-btn--prominent"
                style={{
                  borderColor: "#ffffff",
                  color: "#fff",
                  background: `linear-gradient(135deg, ${primary} 0%, color-mix(in srgb, ${primary} 72%, #000) 100%)`,
                }}
                disabled={unlockingPostId === post.id}
                aria-label={`Unlock for ${(post.lockedContent!.priceCents / 100).toFixed(2)} dollars`}
                onPointerDownCapture={(e) => e.stopPropagation()}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (!fanId) {
                    onUnlockNeedSignIn?.("Sign in to unlock this post.");
                    return;
                  }
                  void onUnlockPost!(post.id);
                }}
              >
                {unlockingPostId === post.id
                  ? "Unlock…"
                  : !fanId
                    ? "Sign in to unlock"
                    : `Unlock $${(post.lockedContent!.priceCents / 100).toFixed(2)}`}
              </button>
            </div>
          )}
        </div>
      )}
      {postUnlocked && currentProtectedPlaceholder && unlockMediaLoadFailed && (
        <div className="fan-feed-media-unlock-failed-overlay" role="status">
          Could not load media after unlock. Try refreshing—if it persists, ask the creator to re-save this post in Fan Hub Posts.
        </div>
      )}
      {showCarousel && (
        <>
          {idx > 0 ? (
            <button
              type="button"
              className="fan-feed-media-carousel-btn fan-feed-media-carousel-btn--prev"
              aria-label="Previous image or video"
              onPointerDownCapture={onCarouselControlPointerDownCapture}
              onMouseDown={onCarouselControlMouseDown}
              onClick={goPrev}
            >
              <CarouselChevronLeft />
            </button>
          ) : null}
          {idx < n - 1 ? (
            <button
              type="button"
              className="fan-feed-media-carousel-btn fan-feed-media-carousel-btn--next"
              aria-label="Next image or video"
              onPointerDownCapture={onCarouselControlPointerDownCapture}
              onMouseDown={onCarouselControlMouseDown}
              onClick={goNext}
            >
              <CarouselChevronRight />
            </button>
          ) : null}
          <div
            className={splitModal ? "feed-comments-modal-carousel-dots" : "fan-feed-media-carousel-dots"}
            role="tablist"
            aria-label="Slides"
          >
            {urls.map((_, i) => (
              <button
                key={`${post.id}-dot-${i}`}
                type="button"
                role="tab"
                aria-selected={i === idx}
                className={
                  splitModal
                    ? `feed-comments-modal-carousel-dot${i === idx ? " feed-comments-modal-carousel-dot--active" : ""}`
                    : `fan-feed-media-carousel-dot${i === idx ? " fan-feed-media-carousel-dot--active" : ""}`
                }
                style={i === idx ? { backgroundColor: primary } : undefined}
                aria-label={`Go to slide ${i + 1}`}
                onPointerDownCapture={onCarouselControlPointerDownCapture}
                onMouseDown={onCarouselControlMouseDown}
                onClick={(e) => goToSlide(i, e)}
              />
            ))}
          </div>
        </>
      )}
      {showMultiBadge && (
        <span className="feed-card-count" aria-label={badgeAria}>
          {mediaTotals.images > 0 && (
            <span className="feed-card-count-item">
              <MediaImageIcon />
              {mediaTotals.images} {mediaTotals.images === 1 ? "image" : "images"}
            </span>
          )}
          {mediaTotals.videos > 0 && (
            <span className="feed-card-count-item">
              <MediaVideoIcon />
              {mediaTotals.videos} {mediaTotals.videos === 1 ? "video" : "videos"}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

/** Same storage paths as FanHubFeed: creators fanPosts, creators posts, users/{creatorId}/posts (+ demo IDs). */
async function fetchMemberPostById(
  creatorId: string,
  postId: string,
  opts?: { allowCreatorTestLivePromos?: boolean },
): Promise<Post | null> {
  if (!db) return null;
  const demo = DEMO_POSTS.find((p) => p.id === postId);
  if (demo) return demo;
  const refs = [
    doc(db, "creators", creatorId, "fanPosts", postId),
    doc(db, "creators", creatorId, "posts", postId),
    doc(db, "users", creatorId, "posts", postId),
  ];
  for (const ref of refs) {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const p = postFromFirestore(snap, opts);
      if (p) return p;
    }
  }
  return null;
}

async function voteForFanMemberPostPoll({
  creatorId,
  post,
  optionIndex,
}: {
  creatorId: string;
  post: Post;
  optionIndex: number;
}) {
  if (!post.poll || optionIndex < 0 || optionIndex >= post.poll.options.length) {
    throw new Error("That poll option is no longer available.");
  }
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
  const res = await fetch(resolveApiUrl("/api/voteFanPostPoll"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ creatorId, postId: post.id, optionIndex }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Could not save your vote.");
}

/** Published post payload for member “Purchases” rows (unlocked feed content). */
export async function fetchFanMemberPostForPurchases(
  creatorId: string,
  postId: string
): Promise<{
  id: string;
  body: string;
  mediaUrls: string[];
  mediaTypes: ("image" | "video")[];
  audioUrls: string[];
} | null> {
  const p = await fetchMemberPostById(creatorId, postId);
  if (!p) return null;
  return {
    id: p.id,
    body: p.content,
    mediaUrls: p.mediaUrls,
    mediaTypes: p.mediaTypes,
    audioUrls: p.audioUrls ?? [],
  };
}

function useMemberPostDetail(
  creatorId: string | undefined,
  viewPostId: string | null,
  opts?: { allowCreatorTestLivePromos?: boolean },
) {
  const [detailPost, setDetailPost] = useState<Post | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRev, setDetailRev] = useState(0);

  const reload = useCallback(() => {
    setDetailRev((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!viewPostId || !creatorId || !db) {
      setDetailPost(null);
      setDetailLoading(false);
      return;
    }

    if (viewPostId.startsWith("demo-")) {
      const demo = DEMO_POSTS.find((p) => p.id === viewPostId) ?? null;
      setDetailPost(demo);
      setDetailLoading(false);
      return;
    }

    let unsub: Unsubscribe | undefined;
    let cancelled = false;

    setDetailLoading(true);
    setDetailPost(null);

    const refs = [
      doc(db, "creators", creatorId, "fanPosts", viewPostId),
      doc(db, "creators", creatorId, "posts", viewPostId),
      doc(db, "users", creatorId, "posts", viewPostId),
    ];

    void (async () => {
      let foundRef: (typeof refs)[number] | null = null;
      for (const r of refs) {
        try {
          const s = await getDoc(r);
          if (s.exists()) {
            foundRef = r;
            const p = postFromFirestore(s, { allowCreatorTestLivePromos: opts?.allowCreatorTestLivePromos });
            if (!cancelled) setDetailPost(p);
            break;
          }
        } catch {
          continue;
        }
      }
      if (cancelled) return;
      if (!foundRef) {
        setDetailPost(null);
        setDetailLoading(false);
        return;
      }
      if (cancelled) return;
      unsub = onSnapshot(foundRef, (snap) => {
        if (!snap.exists()) {
          setDetailPost(null);
          return;
        }
        setDetailPost(postFromFirestore(snap, { allowCreatorTestLivePromos: opts?.allowCreatorTestLivePromos }));
      });
      setDetailLoading(false);
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [viewPostId, creatorId, detailRev, opts?.allowCreatorTestLivePromos]);

  return { detailPost, detailLoading, reload };
}

function formatPostCalendarDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Expanded inline comments on the fan home feed — same emoji picker UX as creator / view-post modal. */
function FanMemberInlineCommentRow({
  postId,
  expanded,
  commentDraft,
  setCommentDraft,
  fanId,
  commentSending,
  primary,
  submitComment,
  sjHeartEmojiCtx,
}: {
  postId: string;
  expanded: boolean;
  commentDraft: Record<string, string>;
  setCommentDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  fanId?: string;
  commentSending: string | null;
  primary: string;
  submitComment: (id: string) => void | Promise<void>;
  sjHeartEmojiCtx: SjHeartEmojiAccessContext;
}) {
  const draft = commentDraft[postId] ?? "";
  const setText = useCallback(
    (next: string) => setCommentDraft((prev) => ({ ...prev, [postId]: next })),
    [postId, setCommentDraft]
  );
  const emoji = useFanFeedCommentEmojiPicker({
    composeSurfaceOpen: expanded,
    commentText: draft,
    setCommentText: setText,
    maxLength: 500,
    sjHeartEmojiCtx,
  });
  const sending = commentSending === postId;
  const busy = !!commentSending;
  return (
    <>
      <div className="fan-feed-comment-input-wrap">
        <div className="feed-comments-modal-compose-input-wrap fan-feed-comment-compose-slot">
          <div ref={emoji.composeFieldRef} className="feed-comments-modal-compose-field">
            <input
              ref={emoji.commentInputRef}
              type="text"
              className="fan-feed-comment-input fan-feed-comment-input--with-emoji"
              placeholder="Write a comment..."
              value={draft}
              onChange={(e) => setCommentDraft((prev) => ({ ...prev, [postId]: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && void submitComment(postId)}
              disabled={!fanId || busy}
              maxLength={500}
            />
            <button
              type="button"
              ref={emoji.composeEmojiButtonRef}
              className="feed-comments-modal-compose-emoji-btn"
              aria-label="Add emoji"
              aria-expanded={emoji.composeEmojiPickerOpen}
              onClick={(e) => {
                e.stopPropagation();
                emoji.setComposeEmojiPickerOpen((o) => !o);
              }}
            >
              <EmojiIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
        <button
          type="button"
          className="fan-feed-comment-send"
          style={{ backgroundColor: primary }}
          onClick={() => void submitComment(postId)}
          disabled={!fanId || !draft.trim() || busy}
        >
          {sending ? "…" : "Send"}
        </button>
      </div>
      {emoji.emojiPickerPortal}
    </>
  );
}

function FanMemberPostDetailModal({
  open,
  onClose,
  post,
  loading,
  displayName,
  creatorAvatar,
  creatorAvatarCropStyle,
  primary,
  creatorId,
  fanId,
  fanPhotoURL,
  fanDisplayName,
  feedSettings,
  commentDraft,
  setCommentDraft,
  commentSending,
  onSubmitComment,
  onReloadAfterComment,
  backLabel = "Back to Home",
  unlockedFanPostIds,
  unlockedLiveStreamIds,
  liveStreamPaidMemberTicketSkip = false,
  liveStreamCheckoutStreamId = null,
  onLiveStreamTicket,
  onLiveStreamSignIn,
  onLiveStreamWatch,
  tipsEnabled = true,
  onSendTip,
  unlockingPostId,
  onUnlockPost,
  onUnlockNeedSignIn,
  onPollVote,
  sjHeartEmojiCtx,
  fanPageAdminBypass = false,
}: {
  open: boolean;
  onClose: () => void;
  post: Post | null;
  loading: boolean;
  displayName: string;
  /** Creator storefront avatar (My Page upload) */
  creatorAvatar?: string;
  creatorAvatarCropStyle: React.CSSProperties;
  primary: string;
  creatorId: string;
  fanId?: string;
  /** Fan profile / auth photo for comment compose */
  fanPhotoURL?: string;
  fanDisplayName?: string;
  feedSettings?: FanFeedVisibilitySettings;
  commentDraft: Record<string, string>;
  setCommentDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  commentSending: string | null;
  /** When omitted (e.g. Saved tab), comments are read-only */
  onSubmitComment?: (postId: string, afterSuccess?: () => void) => void | Promise<void>;
  onReloadAfterComment: () => void | Promise<void>;
  /** e.g. "Back to Saved" on the Saved tab */
  backLabel?: string;
  unlockedFanPostIds?: Set<string>;
  unlockedLiveStreamIds?: Set<string>;
  liveStreamPaidMemberTicketSkip?: boolean;
  liveStreamCheckoutStreamId?: string | null;
  onLiveStreamTicket?: (streamId: string) => void | Promise<void>;
  onLiveStreamSignIn?: () => void;
  onLiveStreamWatch?: (promo: LiveStreamPromoOnPost) => void;
  tipsEnabled?: boolean;
  onSendTip?: (postId?: string) => void;
  fanPageAdminBypass?: boolean;
  unlockingPostId?: string | null;
  onUnlockPost?: (postId: string) => void | Promise<void>;
  onUnlockNeedSignIn?: (message: string) => void;
  onPollVote?: (post: Post, optionIndex: number) => void | Promise<void>;
  sjHeartEmojiCtx: SjHeartEmojiAccessContext;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const pidForPicker = post?.id ?? "";
  const commentsVisibleForCompose = !!(post && !post.hideComments && !feedSettings?.hideComments);
  const composeSurfaceOpen = open && !!post && !!onSubmitComment && commentsVisibleForCompose;
  const draftForPicker = open && post ? (commentDraft[pidForPicker] ?? "") : "";
  const setDraftForPicker = useCallback(
    (next: string) => {
      const id = post?.id;
      if (!id) return;
      setCommentDraft((prev) => ({ ...prev, [id]: next }));
    },
    [post?.id, setCommentDraft]
  );
  const memberModalEmoji = useFanFeedCommentEmojiPicker({
    composeSurfaceOpen,
    commentText: draftForPicker,
    setCommentText: setDraftForPicker,
    maxLength: 500,
    sjHeartEmojiCtx,
  });

  if (!open) return null;

  const pid = post?.id ?? "";
  const draft = commentDraft[pid] ?? "";
  const commentsVisible = post && !post.hideComments && !feedSettings?.hideComments;
  const hasMedia = !!post && post.mediaUrls.length > 0;

  return (
    <>
    <div
      className="fan-member-post-modal-backdrop fan-member-post-modal-backdrop--detail"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="fan-member-post-modal fan-member-post-modal--detail fan-member-post-modal--viewpost-split"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fan-member-viewpost-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="feed-comments-modal feed-comments-modal--stack">
          <div className="feed-comments-modal-head">
            <div className="fan-member-viewpost-head-row">
              <button type="button" className="fan-member-viewpost-back" onClick={onClose}>
                ← {backLabel}
              </button>
              {creatorAvatar ? (
                <img
                  src={creatorAvatar}
                  alt=""
                  className="fan-member-viewpost-creator-avatar"
                  style={creatorAvatarCropStyle}
                />
              ) : (
                <span className="fan-member-viewpost-creator-avatar fan-member-viewpost-creator-avatar--placeholder" aria-hidden>
                  {displayName.trim().charAt(0).toUpperCase() || "?"}
                </span>
              )}
              <p id="fan-member-viewpost-modal-title" className="feed-comments-modal-head-title">
                {displayName}
              </p>
            </div>
            <button type="button" className="feed-comments-modal-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>

          {loading ? (
            <div className="feed-comments-modal-content feed-comments-modal-content--stack no-media fan-member-viewpost-loading-wrap">
              <p className="fan-member-post-modal-loading">Loading…</p>
            </div>
          ) : !post ? (
            <div className="feed-comments-modal-content feed-comments-modal-content--stack no-media fan-member-viewpost-loading-wrap">
              <p className="fan-member-post-modal-loading">This post isn&apos;t available.</p>
            </div>
          ) : (
            <div className={`feed-comments-modal-content feed-comments-modal-content--stack${hasMedia ? "" : " no-media"}`}>
              <span className="sr-only">Post by {displayName}</span>
              {hasMedia ? (
                <FanMemberPostMedia
                  post={post}
                  primary={primary}
                  splitModal
                  creatorId={creatorId}
                  fanId={fanId}
                  unlockedFanPostIds={unlockedFanPostIds}
                  fanPageAdminBypass={fanPageAdminBypass}
                  unlockingPostId={unlockingPostId}
                  onUnlockPost={onUnlockPost}
                  onUnlockNeedSignIn={onUnlockNeedSignIn}
                  sjHeartEmojiCtx={sjHeartEmojiCtx}
                />
              ) : null}
                <div className="feed-comments-modal-panel">
                {post.postKind === "live_stream_promo" && post.liveStreamPromo?.streamId ? (
                  <div className="feed-comments-modal-live-promo">
                    <LiveStreamPromoBanner
                      promo={post.liveStreamPromo}
                      accentHex={primary}
                      fanAccess={liveStreamFanAccess(post.liveStreamPromo, {
                        fanId,
                        fanPageAdminBypass,
                        unlockedStreamIds: unlockedLiveStreamIds ?? new Set(),
                        paidSubscriberTicketSkip: liveStreamPaidMemberTicketSkip,
                      })}
                      ticketLoading={liveStreamCheckoutStreamId === post.liveStreamPromo.streamId}
                      onGetTicket={() => void onLiveStreamTicket?.(post.liveStreamPromo!.streamId)}
                      onSignIn={onLiveStreamSignIn}
                      onWatchLive={() => onLiveStreamWatch?.(post.liveStreamPromo!)}
                    />
                  </div>
                ) : null}
                {post.content?.trim() ? (
                  <div className="feed-comments-modal-post-body">
                    <p className="feed-card-caption m-0">{renderTextWithCustomEmoji(post.content, sjHeartEmojiCtx)}</p>
                    <p className="fan-member-viewpost-date-inline">{formatPostCalendarDate(post.createdAt)}</p>
                  </div>
                ) : (
                  <div className="feed-comments-modal-post-body feed-comments-modal-post-body--date-only">
                    <p className="fan-member-viewpost-date-inline">{formatPostCalendarDate(post.createdAt)}</p>
                  </div>
                )}
                <FanMemberPostPollView poll={post.poll} fanId={fanId} onVote={(idx) => onPollVote?.(post, idx)} />
                <FanMemberPostTipGoalView
                  tipGoal={post.tipGoal}
                  primary={primary}
                  showTipButton={!(feedSettings?.hideTipButton) && tipsEnabled}
                  onSendTip={() => onSendTip?.(post.id)}
                />
                {post.audioUrls && post.audioUrls.length > 0 ? (
                  <div className="fan-member-post-modal-audio fan-member-post-modal-audio--in-split">
                    {post.audioUrls.map((url) => (
                      <DmAudioPlayer key={`modal-${post.id}-a-${url.slice(-24)}`} src={url} className="w-full" />
                    ))}
                  </div>
                ) : null}
                {commentsVisible ? (
                  <>
                    <div className="feed-comments-modal-list">
                      {!post.commentsList?.length ? (
                        <p className="feed-comments-modal-empty">No comments yet.</p>
                      ) : (
                        post.commentsList.map((c, idx) => {
                          const isCreatorComment =
                            !!c.isCreatorReply ||
                            (!!creatorId &&
                              typeof c.authorId === "string" &&
                              c.authorId.length > 0 &&
                              c.authorId === creatorId);
                          return (
                            <div className="feed-comments-modal-item" key={`${post.id}-c-${idx}`}>
                              <FeedCommentListAvatar authorLabel={c.author} photoURL={c.authorPhotoURL} />
                              <div className="feed-comments-modal-item-body">
                                <p className="feed-comments-modal-text">
                                  <span className="feed-comments-modal-comment-author-row">
                                    <span className="comment-username">{c.author}</span>
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
                                  <span className="feed-comments-modal-comment-body">
                                    {renderTextWithCustomEmoji(c.text, sjHeartEmojiCtx)}
                                  </span>
                                </p>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                    {onSubmitComment ? (
                      <form
                        className="feed-comments-modal-compose"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (fanId && draft.trim()) void onSubmitComment(pid, () => void onReloadAfterComment());
                        }}
                      >
                        <div className="feed-comments-modal-item-avatar feed-comments-modal-compose-avatar" aria-hidden>
                          {fanId && fanPhotoURL ? (
                            <img src={fanPhotoURL} alt="" className="feed-comments-modal-compose-avatar-img" />
                          ) : (
                            <span>
                              {fanId
                                ? (fanDisplayName || "You").trim().charAt(0).toUpperCase() || "?"
                                : "?"}
                            </span>
                          )}
                        </div>
                        <div className="feed-comments-modal-compose-input-wrap">
                          <div ref={memberModalEmoji.composeFieldRef} className="feed-comments-modal-compose-field">
                            <input
                              ref={memberModalEmoji.commentInputRef}
                              type="text"
                              className="feed-comments-modal-compose-input"
                              placeholder={fanId ? "Write a comment..." : "Log in to comment"}
                              value={draft}
                              onChange={(e) => setCommentDraft((prev) => ({ ...prev, [pid]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && fanId && draft.trim() && onSubmitComment) {
                                  e.preventDefault();
                                  void onSubmitComment(pid, () => void onReloadAfterComment());
                                }
                              }}
                              disabled={!fanId || commentSending === pid}
                              aria-label="Write a comment"
                              maxLength={500}
                            />
                            <button
                              type="button"
                              ref={memberModalEmoji.composeEmojiButtonRef}
                              className="feed-comments-modal-compose-emoji-btn"
                              aria-label="Add emoji"
                              aria-expanded={memberModalEmoji.composeEmojiPickerOpen}
                              onClick={(e) => {
                                e.stopPropagation();
                                memberModalEmoji.setComposeEmojiPickerOpen((o) => !o);
                              }}
                            >
                              <EmojiIcon className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                        <button
                          type="submit"
                          className="feed-comments-modal-compose-send"
                          disabled={!fanId || !draft.trim() || commentSending === pid}
                        >
                          {commentSending === pid ? "..." : "Post"}
                        </button>
                      </form>
                    ) : (
                      <p className="feed-comments-modal-empty fan-member-viewpost-readonly-hint">
                        Use the Home feed to add a comment.
                      </p>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    {memberModalEmoji.emojiPickerPortal}
    </>
  );
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type MemberFeedBucketKey = "fanPosts" | "creatorPosts" | "userPosts";

function mergeMemberFeedBuckets(buckets: Record<MemberFeedBucketKey, Map<string, Post>>): Post[] {
  const final = new Map<string, Post>();
  // Same-ID docs can exist under legacy paths; Fan Hub composer writes canonical data to
  // `creators/.../fanPosts` (e.g. `liveStreamPromo`). Apply buckets lowest → highest priority
  // so fanPosts wins — matches FanHubFeed (user posts first, then fanPosts overwrites).
  buckets.userPosts.forEach((p, id) => final.set(id, p));
  buckets.creatorPosts.forEach((p, id) => final.set(id, p));
  buckets.fanPosts.forEach((p, id) => final.set(id, p));
  const list = Array.from(final.values());
  list.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
  return list;
}

export const FanMemberFeed: React.FC<FanMemberFeedProps> = ({
  creatorId,
  creatorHandle,
  displayName,
  avatar,
  avatarObjectPosition,
  primary = "#6366f1",
  feedSettings,
  fanId,
  unlockedFanPostIds: unlockedFanPostIdsProp = [],
  unlockedLiveStreamIds: unlockedLiveStreamIdsProp = [],
  liveStreamPaidMemberTicketSkip = false,
  fanPageAdminBypass = false,
  previewMember = false,
  onOpenSaved,
  tipsEnabled = true,
  tipHeading = "Support this creator",
  tipSubline = "Choose an amount to send support.",
  hubViewerComposeAvatarUrl,
}) => {
  const allowCreatorTestLivePromos = fanPageAdminBypass || previewMember;
  const { showToast, user } = useAppContext();
  const sjHeartEmojiCtx = useMemo<SjHeartEmojiAccessContext>(
    () => ({
      creatorHandle,
      viewerIsAdmin: user?.role === "Admin",
    }),
    [creatorHandle, user?.role]
  );
  const unlockedFanPostIdSet = useMemo(() => new Set(unlockedFanPostIdsProp), [unlockedFanPostIdsProp]);
  const unlockedLiveStreamIdSet = useMemo(
    () => new Set(unlockedLiveStreamIdsProp),
    [unlockedLiveStreamIdsProp],
  );
  const avatarCropStyle: React.CSSProperties = getAvatarCropStyle(avatarObjectPosition);
  const creatorAvatarSrc = typeof avatar === "string" && avatar.trim() ? avatar.trim() : undefined;
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [likeSavingPostId, setLikeSavingPostId] = useState<string | null>(null);
  const likeInFlightRef = useRef<string | null>(null);
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Set<string>>(new Set());
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [expandedInlineCommentKeys, setExpandedInlineCommentKeys] = useState<Set<string>>(new Set());
  const [bookmarkSaving, setBookmarkSaving] = useState(false);
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [commentSending, setCommentSending] = useState<string | null>(null);
  const [viewPostId, setViewPostId] = useState<string | null>(null);
  const [tipSheetOpen, setTipSheetOpen] = useState(false);
  const [tipSelectedPreset, setTipSelectedPreset] = useState<number | null>(null);
  const [tipCustomAmount, setTipCustomAmount] = useState("");
  const [tipGoalPostId, setTipGoalPostId] = useState<string | null>(null);
  const [tipLoading, setTipLoading] = useState(false);
  const [unlockingPostId, setUnlockingPostId] = useState<string | null>(null);
  const [liveStreamCheckoutStreamId, setLiveStreamCheckoutStreamId] = useState<string | null>(null);
  const [liveStreamWatch, setLiveStreamWatch] = useState<{ streamId: string; title: string } | null>(null);
  const [viewMode, setViewMode] = useState<"feed" | "grid">("feed");
  const [gridHoveredVideoPostId, setGridHoveredVideoPostId] = useState<string | null>(null);
  const { detailPost, detailLoading, reload: reloadDetailPost } = useMemberPostDetail(creatorId, viewPostId, {
    allowCreatorTestLivePromos,
  });
  const liveStreamStreamIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of posts) {
      if (p.postKind === "live_stream_promo" && p.liveStreamPromo?.streamId) ids.add(p.liveStreamPromo.streamId);
    }
    if (detailPost?.postKind === "live_stream_promo" && detailPost.liveStreamPromo?.streamId) {
      ids.add(detailPost.liveStreamPromo.streamId);
    }
    return [...ids].sort();
  }, [posts, detailPost]);
  const liveStreamStatusMap = useCreatorLiveStreamStatuses(creatorId, liveStreamStreamIds);
  const mergeLivePromo = useCallback(
    (promo: LiveStreamPromoOnPost) => mergeLiveStreamPromoWithLiveDocStatus(promo, liveStreamStatusMap),
    [liveStreamStatusMap],
  );
  const detailPostForModal = useMemo(() => {
    if (!detailPost?.liveStreamPromo?.streamId) return detailPost;
    return {
      ...detailPost,
      liveStreamPromo: mergeLiveStreamPromoWithLiveDocStatus(detailPost.liveStreamPromo, liveStreamStatusMap),
    };
  }, [detailPost, liveStreamStatusMap]);
  const [fanPublicProfile, setFanPublicProfile] = useState<{ photoURL?: string; displayName?: string }>({});

  const fanPhotoResolved =
    hubViewerComposeAvatarUrl !== undefined
      ? hubViewerComposeAvatarUrl.trim() || undefined
      : fanPublicProfile.photoURL?.trim() || undefined;
  const fanNameResolved =
    fanPublicProfile.displayName?.trim() ||
    auth.currentUser?.displayName?.trim() ||
    undefined;

  const handleLiveStreamTicket = useCallback(
    async (streamId: string) => {
      if (!creatorId || liveStreamCheckoutStreamId) return;
      setLiveStreamCheckoutStreamId(streamId);
      try {
        const url = await startLiveStreamTicketCheckoutSession(creatorId, streamId);
        window.location.href = url;
      } catch (e) {
        showToast?.(e instanceof Error ? e.message : "Could not start checkout.", "error");
        setLiveStreamCheckoutStreamId(null);
      }
    },
    [creatorId, liveStreamCheckoutStreamId, showToast],
  );

  const handleLiveStreamWatch = useCallback(
    (promo: LiveStreamPromoOnPost) => {
      const merged = mergeLiveStreamPromoWithLiveDocStatus(promo, liveStreamStatusMap);
      const st = String(fanEffectiveStreamStatus(merged) ?? merged.streamStatus ?? "")
        .trim()
        .toLowerCase();
      if (st === "ended" || st === "cancelled") {
        showToast?.("This stream has ended.", "info");
        return;
      }
      if (st !== "live") {
        showToast?.("The broadcast isn’t live right now.", "info");
        return;
      }
      setLiveStreamWatch({
        streamId: merged.streamId,
        title: merged.title?.trim() || "Live stream",
      });
    },
    [liveStreamStatusMap, showToast],
  );

  useEffect(() => {
    if (!liveStreamWatch) return;
    const fromMap = liveStreamStatusMap[liveStreamWatch.streamId];
    const fromDetail =
      detailPost?.liveStreamPromo?.streamId === liveStreamWatch.streamId
        ? detailPost.liveStreamPromo.streamStatus
        : undefined;
    const fromPost = posts.find((p) => p.liveStreamPromo?.streamId === liveStreamWatch.streamId)?.liveStreamPromo;
    const promoMerged = fromPost?.streamId
      ? mergeLiveStreamPromoWithLiveDocStatus(fromPost, liveStreamStatusMap)
      : undefined;
    const stRaw = fromMap || fromDetail || fromPost?.streamStatus || "";
    const stEff = promoMerged ? fanEffectiveStreamStatus(promoMerged) : undefined;
    const st = String(stEff ?? stRaw ?? "")
      .trim()
      .toLowerCase();
    if (st === "ended" || st === "cancelled") {
      setLiveStreamWatch(null);
      showToast?.("The live stream has ended.", "info");
    }
  }, [posts, detailPost, liveStreamStatusMap, liveStreamWatch, showToast]);

  const feedBucketsRef = useRef<Record<MemberFeedBucketKey, Map<string, Post>>>({
    fanPosts: new Map(),
    creatorPosts: new Map(),
    userPosts: new Map(),
  });
  const feedInitialBucketsLoadedRef = useRef<Set<MemberFeedBucketKey>>(new Set());

  const rebalanceMemberFeed = useCallback(() => {
    if (feedInitialBucketsLoadedRef.current.size < 3) return;
    const list = mergeMemberFeedBuckets(feedBucketsRef.current);
    setPosts(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!creatorId || !db) {
      setPosts([]);
      setLoading(false);
      return;
    }

    feedBucketsRef.current = {
      fanPosts: new Map(),
      creatorPosts: new Map(),
      userPosts: new Map(),
    };
    feedInitialBucketsLoadedRef.current = new Set();
    setLoading(true);

    const attach = (key: MemberFeedBucketKey, path: [string, string, string]): Unsubscribe => {
      const postsRef = collection(db, path[0], path[1], path[2]);
      const q = query(postsRef, orderBy("createdAt", "desc"), limit(22));
      return onSnapshot(
        q,
        (snap) => {
          const m = new Map<string, Post>();
          snap.docs.forEach((d) => {
            const p = postFromFirestore(d, { allowCreatorTestLivePromos });
            if (p) m.set(p.id, p);
          });
          feedBucketsRef.current[key] = m;
          feedInitialBucketsLoadedRef.current.add(key);
          rebalanceMemberFeed();
        },
        () => {
          feedBucketsRef.current[key] = new Map();
          feedInitialBucketsLoadedRef.current.add(key);
          rebalanceMemberFeed();
        },
      );
    };

    const unsubs = [
      attach("fanPosts", ["creators", creatorId, "fanPosts"]),
      attach("creatorPosts", ["creators", creatorId, "posts"]),
      attach("userPosts", ["users", creatorId, "posts"]),
    ];

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [creatorId, rebalanceMemberFeed, allowCreatorTestLivePromos]);

  useEffect(() => {
    if (viewMode !== "grid") setGridHoveredVideoPostId(null);
  }, [viewMode]);

  useEffect(() => {
    if (!fanId || !db) {
      setFanPublicProfile({});
      setBookmarkedPosts(new Set());
      return;
    }
    let cancelled = false;
    const userRef = doc(db, "users", fanId);
    const unsub = onSnapshot(userRef, (snap) => {
      if (cancelled) return;
      if (!snap.exists()) {
        setBookmarkedPosts(new Set());
        const photo = resolveFanMemberCommentComposePhotoFromUserDoc(
          false,
          {},
          auth.currentUser?.photoURL
        );
        const name =
          typeof auth.currentUser?.displayName === "string" && auth.currentUser.displayName.trim()
            ? auth.currentUser.displayName.trim()
            : undefined;
        setFanPublicProfile({ photoURL: photo, displayName: name });
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      if (creatorId) {
        const byCreator = (data[SAVED_BY_CREATOR_KEY] as Record<string, string[]>) || {};
        const ids = byCreator[creatorId];
        setBookmarkedPosts(new Set(Array.isArray(ids) ? ids : []));
      } else {
        setBookmarkedPosts(new Set());
      }
      const photo = resolveFanMemberCommentComposePhotoFromUserDoc(
        true,
        data,
        auth.currentUser?.photoURL
      );
      const name =
        typeof data.displayName === "string" && data.displayName.trim()
          ? data.displayName.trim()
          : undefined;
      setFanPublicProfile({ photoURL: photo, displayName: name });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [fanId, creatorId]);

  useEffect(() => {
    if (!tipSheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTipSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [tipSheetOpen]);

  const openTipSheet = useCallback((postId?: string) => {
    setTipGoalPostId(postId || null);
    setTipSelectedPreset(null);
    setTipCustomAmount("");
    setTipSheetOpen(true);
  }, []);

  const tipAmountCents = useMemo(() => {
    const parsed = tipCustomAmount.trim() ? Number.parseFloat(tipCustomAmount) : NaN;
    const custom = Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
    return tipSelectedPreset != null ? tipSelectedPreset * 100 : custom;
  }, [tipSelectedPreset, tipCustomAmount]);

  const submitTipFromSheet = useCallback(async () => {
    if (tipAmountCents < 100 || tipAmountCents > 100_000) return;
    let anonymousTipEmail = "";
    if (!auth.currentUser) {
      const entered = window.prompt("Enter your email for checkout:");
      anonymousTipEmail = (entered || "").trim().toLowerCase();
      if (!anonymousTipEmail) return;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(anonymousTipEmail)) {
        showToast?.("Enter a valid email to continue checkout.", "error");
        return;
      }
    }
    setTipLoading(true);
    try {
      const url = await startFanTipCheckoutSession(creatorId, tipAmountCents, anonymousTipEmail || undefined, tipGoalPostId || undefined);
      window.location.href = url;
    } catch (e) {
      showToast?.(e instanceof Error ? e.message : "Could not start checkout.", "error");
    } finally {
      setTipLoading(false);
    }
  }, [creatorId, tipAmountCents, tipGoalPostId, showToast]);

  const handleUnlockPost = useCallback(
    async (postId: string) => {
      if (!creatorId || unlockingPostId) return;
      setUnlockingPostId(postId);
      try {
        const url = await startFanPostUnlockCheckoutSession(creatorId, postId);
        window.location.href = url;
      } catch (e) {
        showToast?.(e instanceof Error ? e.message : "Could not start checkout.", "error");
        setUnlockingPostId(null);
      }
    },
    [creatorId, unlockingPostId, showToast]
  );

  const handlePollVote = useCallback(
    async (post: Post, optionIndex: number) => {
      if (!fanId) {
        showToast?.("Sign in to vote in polls.", "error");
        return;
      }
      if (post.id.startsWith("demo-")) {
        showToast?.("Preview polls can’t be voted on.", "info");
        return;
      }
      if (typeof post.poll?.votesByFan?.[fanId] === "number") {
        showToast?.("You already voted in this poll.", "info");
        return;
      }
      try {
        await voteForFanMemberPostPoll({ creatorId, post, optionIndex });
      } catch (e) {
        console.error("Failed to vote in poll", e);
        showToast?.(e instanceof Error ? e.message : "Couldn’t save your vote.", "error");
      }
    },
    [creatorId, fanId, showToast]
  );

  const submitComment = useCallback(
    async (postId: string, afterSuccess?: () => void | Promise<void>) => {
      const text = (commentDraft[postId] ?? "").trim();
      if (!text || !fanId || commentSending) return;
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      setCommentSending(postId);
      try {
        const res = await fetch(resolveApiUrl("/api/addCommentToPost"), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            creatorId,
            postId,
            text,
            authorDisplayName: fanNameResolved ?? auth.currentUser?.displayName ?? undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.success) {
          setCommentDraft((prev) => ({ ...prev, [postId]: "" }));
          await afterSuccess?.();
        }
      } catch (err) {
        console.error("Failed to add comment", err);
      } finally {
        setCommentSending(null);
      }
    },
    [creatorId, fanId, commentDraft, commentSending, fanNameResolved]
  );

  const toggleBookmark = useCallback(
    async (postId: string) => {
      setBookmarkedPosts((prev) => {
        const next = new Set(prev);
        if (next.has(postId)) next.delete(postId);
        else next.add(postId);
        return next;
      });
      if (!fanId || !creatorId || !db) return;
      setBookmarkSaving(true);
      try {
        const userRef = doc(db, "users", fanId);
        const snap = await getDoc(userRef);
        const data = (snap.exists() ? snap.data() : {}) as Record<string, unknown>;
        const byCreator = { ...((data[SAVED_BY_CREATOR_KEY] as Record<string, string[]>) || {}) };
        const current = byCreator[creatorId] || [];
        const next = current.includes(postId) ? current.filter((id) => id !== postId) : [...current, postId];
        byCreator[creatorId] = next;
        await setDoc(userRef, { [SAVED_BY_CREATOR_KEY]: byCreator }, { merge: true });
      } catch (err) {
        console.error("Failed to save bookmark", err);
        setBookmarkedPosts((prev) => {
          const next = new Set(prev);
          if (next.has(postId)) next.delete(postId);
          else next.add(postId);
          return next;
        });
      } finally {
        setBookmarkSaving(false);
      }
    },
    [fanId, creatorId]
  );

  const toggleLike = useCallback(
    async (post: Post) => {
      if (!fanId) {
        showToast?.("Sign in to like posts.", "error");
        return;
      }
      if (post.id.startsWith("demo-")) {
        showToast?.("Preview posts can’t be liked.", "info");
        return;
      }
      if (likeInFlightRef.current) return;
      likeInFlightRef.current = post.id;
      setLikeSavingPostId(post.id);
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) {
          showToast?.("Sign in to like posts.", "error");
          return;
        }
        const res = await fetch(resolveApiUrl("/api/togglePostLike"), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ creatorId, postId: post.id }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          likedBy?: string[];
          likeCount?: number;
          error?: string;
          note?: string;
        };
        if (!res.ok || !data.success) {
          showToast?.(data.note || data.error || "Couldn’t update like.", "error");
          return;
        }
        const lb = Array.isArray(data.likedBy) ? data.likedBy.map(String) : [];
        const lc = typeof data.likeCount === "number" ? data.likeCount : lb.length;
        setPosts((prev) =>
          prev.map((p) => (p.id === post.id ? { ...p, likedBy: lb, likesCount: lc } : p))
        );
        if (viewPostId === post.id) void reloadDetailPost();
      } catch (e) {
        console.error(e);
        showToast?.("Couldn’t update like.", "error");
      } finally {
        if (likeInFlightRef.current === post.id) likeInFlightRef.current = null;
        setLikeSavingPostId(null);
      }
    },
    [fanId, creatorId, showToast, viewPostId, reloadDetailPost]
  );

  const toggleComments = (postId: string) => {
    setExpandedComments((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="fan-feed-loading">
        <div className="fan-feed-spinner" />
        <p>Loading posts...</p>
      </div>
    );
  }

  return (
    <div className="fan-member-feed">
      <FanFeedHeaderChrome
        savedCount={bookmarkedPosts.size}
        onLeftClick={() => setViewMode((m) => (m === "feed" ? "grid" : "feed"))}
        leftTitle={viewMode === "feed" ? "Switch to grid view" : "Switch to feed view"}
        leftAriaLabel={viewMode === "feed" ? "Switch to grid view" : "Switch to feed view"}
        leftIcon="grid-toggle"
        feedLayoutMode={viewMode}
        savedLinkVariant="go-to-saved"
        onOpenSaved={onOpenSaved}
      />

      {viewMode === "feed" ? (
      <div className="fan-feed-posts">
        {posts.length === 0 ? (
          <div className="fan-feed-empty">
            <p>No posts yet. Check back soon!</p>
          </div>
        ) : (
          posts.map((post) => (
            <article key={post.id} className="feed-card">
              <div className="feed-card-header">
                <div className="feed-card-avatar">
                  {creatorAvatarSrc ? (
                    <img src={creatorAvatarSrc} alt="" className="feed-card-avatar-img" style={avatarCropStyle} />
                  ) : (
                    <span className="feed-card-avatar-initial">{displayName?.charAt(0) || "?"}</span>
                  )}
                </div>
                <div className="feed-card-creator">
                  <span className="feed-card-username">{displayName}</span>
                </div>
                <span className="feed-card-time">{formatTimeAgo(post.createdAt)}</span>
              </div>

              <FanMemberPostMedia
                post={post}
                primary={primary}
                creatorId={creatorId}
                fanId={fanId}
                unlockedFanPostIds={unlockedFanPostIdSet}
                fanPageAdminBypass={fanPageAdminBypass}
                unlockingPostId={unlockingPostId}
                onUnlockPost={handleUnlockPost}
                onUnlockNeedSignIn={(m) => showToast?.(m, "error")}
                sjHeartEmojiCtx={sjHeartEmojiCtx}
              />

              {post.audioUrls && post.audioUrls.length > 0 ? (
                <div className="fan-feed-post-audio mt-2 space-y-2 px-1">
                  {post.audioUrls.map((url) => (
                    <DmAudioPlayer key={`${post.id}-a-${url.slice(-24)}`} src={url} className="w-full" />
                  ))}
                </div>
              ) : null}

              {post.postKind === "live_stream_promo" && post.liveStreamPromo?.streamId ? (
                <div className="feed-card-live-stream-promo-wrap fan-feed-live-stream-promo">
                  <LiveStreamPromoBanner
                    promo={mergeLivePromo(post.liveStreamPromo)}
                    accentHex={primary}
                    fanAccess={liveStreamFanAccess(mergeLivePromo(post.liveStreamPromo), {
                      fanId,
                      fanPageAdminBypass,
                      unlockedStreamIds: unlockedLiveStreamIdSet,
                      paidSubscriberTicketSkip: liveStreamPaidMemberTicketSkip,
                    })}
                    ticketLoading={liveStreamCheckoutStreamId === post.liveStreamPromo.streamId}
                    onGetTicket={() => void handleLiveStreamTicket(post.liveStreamPromo!.streamId)}
                    onSignIn={() => showToast?.("Sign in to get a ticket.", "error")}
                    onWatchLive={() => handleLiveStreamWatch(post.liveStreamPromo!)}
                  />
                </div>
              ) : null}

              <div className="feed-card-body">
                <MemberFeedCaptionBody
                  displayName={displayName}
                  primary={primary}
                  content={post.content}
                  sjHeartEmojiCtx={sjHeartEmojiCtx}
                />
                <FanMemberPostPollView poll={post.poll} fanId={fanId} onVote={(idx) => handlePollVote(post, idx)} />
                <FanMemberPostTipGoalView
                  tipGoal={post.tipGoal}
                  primary={primary}
                  showTipButton={!feedSettings?.hideTipButton && tipsEnabled}
                  onSendTip={() => openTipSheet(post.id)}
                />
              </div>

              <div className="feed-card-actions">
                {!(feedSettings?.hideLikes || post.hideLikes) && (
                  <button
                    type="button"
                    className="feed-card-action-link"
                    aria-pressed={!!fanId && (post.likedBy ?? []).includes(fanId)}
                    disabled={!fanId || likeSavingPostId === post.id}
                    onClick={() => void toggleLike(post)}
                    style={
                      fanId && (post.likedBy ?? []).includes(fanId) ? { color: primary } : undefined
                    }
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill={fanId && (post.likedBy ?? []).includes(fanId) ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                    {!(feedSettings?.hideLikeCounts || post.hideLikeCounts) && post.likesCount > 0 && (
                      <span className="feed-card-action-count">{post.likesCount}</span>
                    )}
                  </button>
                )}

                {!(feedSettings?.hideComments || post.hideComments) && (
                  <button
                    type="button"
                    className="feed-card-action-link"
                    onClick={() => toggleComments(post.id)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                    </svg>
                    {Math.max(post.commentsCount || 0, (post.commentsList ?? []).length) > 0 ? (
                      <span className="feed-card-action-count">
                        {Math.max(post.commentsCount || 0, (post.commentsList ?? []).length)}
                      </span>
                    ) : null}
                  </button>
                )}

                {!post.tipGoal && !feedSettings?.hideTipButton && tipsEnabled && (
                  <button
                    type="button"
                    className="feed-card-send-tip"
                    aria-label="Send a tip"
                    aria-haspopup="dialog"
                    aria-expanded={tipSheetOpen}
                    onClick={() => openTipSheet()}
                  >
                    <span className="tip-currency">$</span>
                    <span>SEND TIP</span>
                  </button>
                )}

                <button
                  type="button"
                  className={`feed-card-action-btn bookmark-btn ${bookmarkedPosts.has(post.id) ? "liked" : ""}`}
                  onClick={() => toggleBookmark(post.id)}
                  disabled={bookmarkSaving}
                  style={bookmarkedPosts.has(post.id) ? { color: primary } : undefined}
                  title={bookmarkedPosts.has(post.id) ? "Unsave post" : "Save post"}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill={bookmarkedPosts.has(post.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                </button>
              </div>

              {!(feedSettings?.hideComments || post.hideComments) && (
                <div className="fan-feed-post-footer">
                  {Math.max(post.commentsCount || 0, (post.commentsList ?? []).length) > 0 && (
                    <button
                      type="button"
                      className="fan-feed-view-comments-link"
                      onClick={() => setViewPostId(post.id)}
                    >
                      View all {Math.max(post.commentsCount || 0, (post.commentsList ?? []).length)} comments
                    </button>
                  )}
                  {post.commentsCount === 0 && (post.commentsList ?? []).length === 0 && (
                    <p className="fan-feed-post-comments-teaser">No comments yet.</p>
                  )}
                  {(post.commentsList ?? []).slice(0, 2).map((c, idx) => {
                    const inlineKey = `${post.id}-inline-c-${idx}`;
                    const expanded = expandedInlineCommentKeys.has(inlineKey);
                    const { preview, truncated } = getInlineCommentPreview(c.text);
                    return (
                    <p key={inlineKey} className="fan-feed-inline-comment-preview m-0 text-sm" style={{ color: "var(--fan-text, #1f2937)" }}>
                      <span style={{ fontWeight: 600, marginRight: "0.35rem" }}>{c.author}</span>
                      {expanded || !truncated
                        ? renderTextWithCustomEmoji(c.text, sjHeartEmojiCtx)
                        : renderTextWithCustomEmoji(preview, sjHeartEmojiCtx)}
                      {truncated ? (
                        <button
                          type="button"
                          className="fan-feed-view-post-link"
                          style={{ marginLeft: "0.35rem" }}
                          onClick={() =>
                            setExpandedInlineCommentKeys((prev) => {
                              const next = new Set(prev);
                              if (next.has(inlineKey)) next.delete(inlineKey);
                              else next.add(inlineKey);
                              return next;
                            })
                          }
                        >
                          {expanded ? "less" : "more"}
                        </button>
                      ) : null}
                    </p>
                  );})}
                  <button
                    type="button"
                    className="fan-feed-view-post-link"
                    onClick={() => setViewPostId(post.id)}
                  >
                    View post
                  </button>
                </div>
              )}

              {!(feedSettings?.hideComments || post.hideComments) && expandedComments.has(post.id) && (
                <div className="fan-feed-comments">
                  <FanMemberInlineCommentRow
                    postId={post.id}
                    expanded={expandedComments.has(post.id)}
                    commentDraft={commentDraft}
                    setCommentDraft={setCommentDraft}
                    fanId={fanId}
                    commentSending={commentSending}
                    primary={primary}
                    submitComment={submitComment}
                    sjHeartEmojiCtx={sjHeartEmojiCtx}
                  />
                  <div className="fan-feed-comments-list">
                    {!(post.commentsList && post.commentsList.length > 0) ? (
                      <p className="fan-feed-no-comments">No comments yet. Be the first!</p>
                    ) : (
                      post.commentsList.map((c, cidx) => {
                        const isCreatorComment =
                          !!c.isCreatorReply ||
                          (!!creatorId &&
                            typeof c.authorId === "string" &&
                            c.authorId.length > 0 &&
                            c.authorId === creatorId);
                        return (
                          <div key={`${post.id}-exp-${cidx}`} className="fan-feed-comment">
                            <div className="fan-feed-comment-row">
                              <span className="fan-feed-comment-author">{c.author}</span>
                              <span
                                className={
                                  isCreatorComment
                                    ? "feed-comments-modal-role-badge feed-comments-modal-role-badge--creator"
                                    : "feed-comments-modal-role-badge feed-comments-modal-role-badge--fan"
                                }
                              >
                                {isCreatorComment ? "Creator" : "Fan"}
                              </span>
                            </div>
                            <p className="fan-feed-comment-text m-0 mt-1">
                              {renderTextWithCustomEmoji(c.text, sjHeartEmojiCtx)}
                            </p>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </article>
          ))
        )}
      </div>
      ) : (
        <>
          {posts.length === 0 ? (
            <div className="fan-feed-empty">
              <p>No posts yet. Check back soon!</p>
            </div>
          ) : (
            <div className="feed-grid">
              {posts.map((post) => {
                const { url: coverUrl, isVideo: coverIsVideo } = getFeedGridCoverMedia(post);
                const coverEntitled =
                  fanPageAdminBypass || unlockedFanPostIdSet.has(post.id);
                const coverLockedTile = isFeedGridCoverLockedForViewer(post, coverEntitled);
                return (
                  <button
                    key={post.id}
                    type="button"
                    className="feed-grid-item"
                    onClick={() => setViewPostId(post.id)}
                    onMouseEnter={() => {
                      if (coverIsVideo && !coverLockedTile) setGridHoveredVideoPostId(post.id);
                    }}
                    onMouseLeave={() => setGridHoveredVideoPostId(null)}
                  >
                    {coverLockedTile ? (
                      <div className="feed-grid-item-locked-cover" aria-hidden>
                        <span className="feed-grid-item-locked-cover-icon">🔒</span>
                      </div>
                    ) : coverUrl ? (
                      coverIsVideo ? (
                        <MemberFeedGridVideoThumbnail
                          src={coverUrl}
                          hoverActive={gridHoveredVideoPostId === post.id}
                        />
                      ) : (
                        <img src={coverUrl} alt="" loading="lazy" {...feedImageDownloadGuardProps} />
                      )
                    ) : (
                      <div className="feed-grid-item-text">{post.content?.slice(0, 100) || "Post"}</div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {tipSheetOpen ? (
        <div
          className="fan-member-post-modal-backdrop fan-feed-tip-sheet-backdrop"
          role="presentation"
          onClick={() => !tipLoading && setTipSheetOpen(false)}
        >
          <div
            className="fan-feed-tip-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fan-feed-tip-sheet-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="fan-feed-tip-sheet__head">
              <div>
                <h2 id="fan-feed-tip-sheet-title" className="fan-feed-tip-sheet__title">
                  {tipHeading}
                </h2>
                <p className="fan-feed-tip-sheet__sub">{tipSubline}</p>
              </div>
              <button
                type="button"
                className="feed-comments-modal-close"
                disabled={tipLoading}
                onClick={() => setTipSheetOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="tip-amounts-heading" style={{ marginTop: 0 }}>
              Choose an amount
            </p>
            <div className="tip-presets-grid">
              {FEED_TIP_PRESET_USD.map((dollars) => (
                <button
                  key={dollars}
                  type="button"
                  className={`tip-preset-btn ${tipSelectedPreset === dollars ? "active" : ""}`}
                  disabled={tipLoading}
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
              <label className="tip-custom-label" htmlFor="fan-feed-tip-custom">
                Or enter custom amount ($)
              </label>
              <input
                id="fan-feed-tip-custom"
                type="number"
                min={1}
                max={1000}
                step="0.01"
                value={tipCustomAmount}
                disabled={tipLoading}
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
              onClick={() => void submitTipFromSheet()}
              disabled={tipAmountCents < 100 || tipAmountCents > 100_000 || tipLoading}
              style={{ backgroundColor: primary }}
            >
              {tipLoading ? "Taking you to checkout…" : `Tip $${(tipAmountCents / 100).toFixed(2)}`}
            </button>
          </div>
        </div>
      ) : null}

      <FanMemberPostDetailModal
        open={viewPostId !== null}
        onClose={() => setViewPostId(null)}
        post={detailPostForModal}
        loading={detailLoading}
        displayName={displayName}
        creatorAvatar={avatar}
        creatorAvatarCropStyle={avatarCropStyle}
        primary={primary}
        creatorId={creatorId}
        fanId={fanId}
        fanPhotoURL={fanPhotoResolved}
        fanDisplayName={fanNameResolved}
        feedSettings={feedSettings}
        commentDraft={commentDraft}
        setCommentDraft={setCommentDraft}
        commentSending={commentSending}
        onSubmitComment={submitComment}
        onReloadAfterComment={reloadDetailPost}
        unlockedFanPostIds={unlockedFanPostIdSet}
        unlockingPostId={unlockingPostId}
        onUnlockPost={handleUnlockPost}
        onUnlockNeedSignIn={(m) => showToast?.(m, "error")}
        onPollVote={handlePollVote}
        sjHeartEmojiCtx={sjHeartEmojiCtx}
        fanPageAdminBypass={fanPageAdminBypass}
        unlockedLiveStreamIds={unlockedLiveStreamIdSet}
        liveStreamPaidMemberTicketSkip={liveStreamPaidMemberTicketSkip}
        liveStreamCheckoutStreamId={liveStreamCheckoutStreamId}
        onLiveStreamTicket={handleLiveStreamTicket}
        onLiveStreamSignIn={() => showToast?.("Sign in to get a ticket.", "error")}
        onLiveStreamWatch={handleLiveStreamWatch}
        tipsEnabled={tipsEnabled}
        onSendTip={(postId) => openTipSheet(postId)}
      />

      {liveStreamWatch ? (
        <LiveStreamWatchRoom
          creatorId={creatorId}
          streamId={liveStreamWatch.streamId}
          title={liveStreamWatch.title}
          onClose={() => setLiveStreamWatch(null)}
        />
      ) : null}
    </div>
  );
};

/** Saved posts view for a fan: loads savedPostIdsByCreator[creatorId] and fetches each post */
interface FanMemberSavedProps {
  creatorId: string;
  creatorHandle?: string;
  displayName: string;
  avatar?: string;
  avatarObjectPosition?: string;
  primary?: string;
  feedSettings?: FanFeedVisibilitySettings;
  fanId: string | undefined;
  unlockedFanPostIds?: string[];
  unlockedLiveStreamIds?: string[];
  liveStreamPaidMemberTicketSkip?: boolean;
  fanPageAdminBypass?: boolean;
  previewMember?: boolean;
  /** Navigate back to the home feed from the Saved tab. */
  onBackToFeed: () => void;
  /**
   * When provided (possibly `""`), comment compose avatar uses this URL instead of resolving `users/{fanId}` internally.
   */
  hubViewerComposeAvatarUrl?: string;
}

export const FanMemberSaved: React.FC<FanMemberSavedProps> = ({
  creatorId,
  creatorHandle,
  displayName,
  avatar,
  avatarObjectPosition,
  primary = "#6366f1",
  feedSettings,
  fanId,
  unlockedFanPostIds: unlockedFanPostIdsSaved = [],
  unlockedLiveStreamIds: unlockedLiveStreamIdsSaved = [],
  liveStreamPaidMemberTicketSkip = false,
  fanPageAdminBypass = false,
  previewMember = false,
  onBackToFeed,
  hubViewerComposeAvatarUrl,
}) => {
  const allowCreatorTestLivePromosSaved = fanPageAdminBypass || previewMember;
  const { showToast: showToastSaved, user: userSaved } = useAppContext();
  const sjHeartEmojiCtxSaved = useMemo<SjHeartEmojiAccessContext>(
    () => ({
      creatorHandle,
      viewerIsAdmin: userSaved?.role === "Admin",
    }),
    [creatorHandle, userSaved?.role]
  );
  const unlockedFanPostIdSetSaved = useMemo(() => new Set(unlockedFanPostIdsSaved), [unlockedFanPostIdsSaved]);
  const unlockedLiveStreamIdSetSaved = useMemo(
    () => new Set(unlockedLiveStreamIdsSaved),
    [unlockedLiveStreamIdsSaved],
  );
  const [unlockingPostIdSaved, setUnlockingPostIdSaved] = useState<string | null>(null);
  const [liveStreamCheckoutStreamIdSaved, setLiveStreamCheckoutStreamIdSaved] = useState<string | null>(null);

  const handleLiveStreamTicketSaved = useCallback(
    async (streamId: string) => {
      if (!creatorId || liveStreamCheckoutStreamIdSaved) return;
      setLiveStreamCheckoutStreamIdSaved(streamId);
      try {
        const url = await startLiveStreamTicketCheckoutSession(creatorId, streamId);
        window.location.href = url;
      } catch (e) {
        showToastSaved?.(e instanceof Error ? e.message : "Could not start checkout.", "error");
        setLiveStreamCheckoutStreamIdSaved(null);
      }
    },
    [creatorId, liveStreamCheckoutStreamIdSaved, showToastSaved],
  );
  const handleUnlockPostSaved = useCallback(
    async (postId: string) => {
      if (!creatorId || unlockingPostIdSaved) return;
      setUnlockingPostIdSaved(postId);
      try {
        const url = await startFanPostUnlockCheckoutSession(creatorId, postId);
        window.location.href = url;
      } catch (e) {
        showToastSaved?.(e instanceof Error ? e.message : "Could not start checkout.", "error");
        setUnlockingPostIdSaved(null);
      }
    },
    [creatorId, unlockingPostIdSaved, showToastSaved]
  );

  const handlePollVoteSaved = useCallback(
    async (post: Post, optionIndex: number) => {
      if (!fanId) {
        showToastSaved?.("Sign in to vote in polls.", "error");
        return;
      }
      if (typeof post.poll?.votesByFan?.[fanId] === "number") {
        showToastSaved?.("You already voted in this poll.", "info");
        return;
      }
      try {
        await voteForFanMemberPostPoll({ creatorId, post, optionIndex });
      } catch (e) {
        console.error("Failed to vote in poll", e);
        showToastSaved?.(e instanceof Error ? e.message : "Couldn’t save your vote.", "error");
      }
    },
    [creatorId, fanId, showToastSaved]
  );
  const avatarCropStyle: React.CSSProperties = getAvatarCropStyle(avatarObjectPosition);
  const creatorAvatarSrc = typeof avatar === "string" && avatar.trim() ? avatar.trim() : undefined;
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [unsavingId, setUnsavingId] = useState<string | null>(null);
  const [viewPostId, setViewPostId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const { detailPost, detailLoading, reload: reloadDetailPost } = useMemberPostDetail(creatorId, viewPostId, {
    allowCreatorTestLivePromos: allowCreatorTestLivePromosSaved,
  });
  const liveStreamStreamIdsSaved = useMemo(() => {
    const ids = new Set<string>();
    for (const p of posts) {
      if (p.postKind === "live_stream_promo" && p.liveStreamPromo?.streamId) ids.add(p.liveStreamPromo.streamId);
    }
    if (detailPost?.postKind === "live_stream_promo" && detailPost.liveStreamPromo?.streamId) {
      ids.add(detailPost.liveStreamPromo.streamId);
    }
    return [...ids].sort();
  }, [posts, detailPost]);
  const liveStreamStatusMapSaved = useCreatorLiveStreamStatuses(creatorId, liveStreamStreamIdsSaved);
  const mergeLivePromoSaved = useCallback(
    (promo: LiveStreamPromoOnPost) => mergeLiveStreamPromoWithLiveDocStatus(promo, liveStreamStatusMapSaved),
    [liveStreamStatusMapSaved],
  );
  const detailPostForModalSaved = useMemo(() => {
    if (!detailPost?.liveStreamPromo?.streamId) return detailPost;
    return {
      ...detailPost,
      liveStreamPromo: mergeLiveStreamPromoWithLiveDocStatus(detailPost.liveStreamPromo, liveStreamStatusMapSaved),
    };
  }, [detailPost, liveStreamStatusMapSaved]);
  const [liveStreamWatchSaved, setLiveStreamWatchSaved] = useState<{ streamId: string; title: string } | null>(null);
  const handleLiveStreamWatchSaved = useCallback(
    (promo: LiveStreamPromoOnPost) => {
      const merged = mergeLiveStreamPromoWithLiveDocStatus(promo, liveStreamStatusMapSaved);
      const st = String(fanEffectiveStreamStatus(merged) ?? merged.streamStatus ?? "")
        .trim()
        .toLowerCase();
      if (st === "ended" || st === "cancelled") {
        showToastSaved?.("This stream has ended.", "info");
        return;
      }
      if (st !== "live") {
        showToastSaved?.("The broadcast isn’t live right now.", "info");
        return;
      }
      setLiveStreamWatchSaved({
        streamId: merged.streamId,
        title: merged.title?.trim() || "Live stream",
      });
    },
    [liveStreamStatusMapSaved, showToastSaved],
  );

  useEffect(() => {
    if (!liveStreamWatchSaved) return;
    const fromMap = liveStreamStatusMapSaved[liveStreamWatchSaved.streamId];
    const fromDetail =
      detailPost?.liveStreamPromo?.streamId === liveStreamWatchSaved.streamId
        ? detailPost.liveStreamPromo.streamStatus
        : undefined;
    const fromPost = posts.find((p) => p.liveStreamPromo?.streamId === liveStreamWatchSaved.streamId)?.liveStreamPromo;
    const promoMerged = fromPost?.streamId
      ? mergeLiveStreamPromoWithLiveDocStatus(fromPost, liveStreamStatusMapSaved)
      : undefined;
    const stRaw = fromMap || fromDetail || fromPost?.streamStatus || "";
    const stEff = promoMerged ? fanEffectiveStreamStatus(promoMerged) : undefined;
    const st = String(stEff ?? stRaw ?? "")
      .trim()
      .toLowerCase();
    if (st === "ended" || st === "cancelled") {
      setLiveStreamWatchSaved(null);
      showToastSaved?.("The live stream has ended.", "info");
    }
  }, [posts, detailPost, liveStreamStatusMapSaved, liveStreamWatchSaved, showToastSaved]);

  const [fanPublicProfile, setFanPublicProfile] = useState<{ photoURL?: string; displayName?: string }>({});
  const [expandedInlineCommentKeys, setExpandedInlineCommentKeys] = useState<Set<string>>(new Set());
  const [savedBookmarkCount, setSavedBookmarkCount] = useState(0);

  useEffect(() => {
    if (!fanId || !db) {
      setFanPublicProfile({});
      return;
    }
    let cancelled = false;
    const userRef = doc(db, "users", fanId);
    const unsub = onSnapshot(userRef, (snap) => {
      if (cancelled) return;
      if (!snap.exists()) {
        const photo = resolveFanMemberCommentComposePhotoFromUserDoc(
          false,
          {},
          auth.currentUser?.photoURL
        );
        const name =
          typeof auth.currentUser?.displayName === "string" && auth.currentUser.displayName.trim()
            ? auth.currentUser.displayName.trim()
            : undefined;
        setFanPublicProfile({ photoURL: photo, displayName: name });
        return;
      }
      const d = snap.data() as Record<string, unknown>;
      const photo = resolveFanMemberCommentComposePhotoFromUserDoc(
        true,
        d,
        auth.currentUser?.photoURL
      );
      const name =
        typeof d.displayName === "string" && d.displayName.trim() ? d.displayName.trim() : undefined;
      setFanPublicProfile({ photoURL: photo, displayName: name });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [fanId]);

  const fanPhotoResolved =
    hubViewerComposeAvatarUrl !== undefined
      ? hubViewerComposeAvatarUrl.trim() || undefined
      : fanPublicProfile.photoURL?.trim() || undefined;
  const fanNameResolved =
    fanPublicProfile.displayName?.trim() ||
    auth.currentUser?.displayName?.trim() ||
    undefined;

  const handleUnsave = useCallback(
    async (postId: string) => {
      if (!fanId || !creatorId || !db) return;
      setUnsavingId(postId);
      try {
        const userRef = doc(db, "users", fanId);
        const snap = await getDoc(userRef);
        const data = (snap.exists() ? snap.data() : {}) as Record<string, unknown>;
        const byCreator = { ...((data[SAVED_BY_CREATOR_KEY] as Record<string, string[]>) || {}) };
        const current = byCreator[creatorId] || [];
        byCreator[creatorId] = current.filter((id) => id !== postId);
        await setDoc(userRef, { [SAVED_BY_CREATOR_KEY]: byCreator }, { merge: true });
        setPosts((prev) => prev.filter((p) => p.id !== postId));
        setSavedBookmarkCount((c) => Math.max(0, c - 1));
      } catch (err) {
        console.error("Failed to unsave", err);
      } finally {
        setUnsavingId(null);
      }
    },
    [fanId, creatorId]
  );

  useEffect(() => {
    if (!fanId || !creatorId || !db) {
      setPosts([]);
      setSavedBookmarkCount(0);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getDoc(doc(db, "users", fanId))
      .then((snap) => {
        if (cancelled) return;
        const data = (snap.exists() ? snap.data() : {}) as Record<string, unknown>;
        const byCreator = (data[SAVED_BY_CREATOR_KEY] as Record<string, string[]>) || {};
        const ids = byCreator[creatorId];
        const n = Array.isArray(ids) ? ids.length : 0;
        setSavedBookmarkCount(n);
        if (!Array.isArray(ids) || ids.length === 0) {
          setPosts([]);
          setLoading(false);
          return;
        }
        return Promise.all(
          ids.map((postId) =>
            fetchMemberPostById(creatorId, postId, { allowCreatorTestLivePromos: allowCreatorTestLivePromosSaved }),
          ),
        ).then((resolved) => {
          if (cancelled) return;
          const list = resolved.filter((p): p is Post => p != null);
          list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          setPosts(list);
        });
      })
      .catch(() => {
        if (!cancelled) setPosts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [fanId, creatorId, allowCreatorTestLivePromosSaved]);

  const savedPostsWatchKey = useMemo(
    () =>
      [...posts]
        .map((p) => `${p.id}\0${p.feedFirestorePath ?? ""}`)
        .sort()
        .join("\x1f"),
    [posts],
  );

  useEffect(() => {
    if (!db || !creatorId || !savedPostsWatchKey) return;
    const entries = savedPostsWatchKey.split("\x1f").map((segment) => {
      const i = segment.indexOf("\0");
      if (i <= 0) return null;
      return { id: segment.slice(0, i), path: segment.slice(i + 1) };
    }).filter((x): x is { id: string; path: string } => x != null && x.path.length > 0);

    const unsubs: Unsubscribe[] = [];
    for (const { id, path } of entries) {
      const segs = path.split("/").filter(Boolean);
      if (segs.length < 4) continue;
      try {
        const dref = doc(db, ...(segs as [string, ...string[]]));
        unsubs.push(
          onSnapshot(dref, (snap) => {
            const next = postFromFirestore(snap, { allowCreatorTestLivePromos: allowCreatorTestLivePromosSaved });
            if (!next) return;
            setPosts((prev) => prev.map((row) => (row.id === id ? next : row)));
          }),
        );
      } catch {
        /* invalid path */
      }
    }
    return () => unsubs.forEach((u) => u());
  }, [creatorId, savedPostsWatchKey, allowCreatorTestLivePromosSaved]);

  if (!fanId) {
    return (
      <div className="fan-member-feed">
        <div className="fan-feed-header">
          <h2 className="fan-feed-title">Saved</h2>
          <p className="fan-feed-subtitle">Log in to view your saved posts.</p>
        </div>
        <div className="fan-feed-empty">
          <p>Log in to view your saved posts.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="fan-member-feed">
        <FanFeedHeaderChrome
          savedCount={savedBookmarkCount}
          onLeftClick={onBackToFeed}
          leftTitle="Back to feed"
          leftAriaLabel="Back to feed"
          leftIcon="back"
          savedLinkVariant="current-saved"
        />
        <div className="fan-feed-loading">
          <div className="fan-feed-spinner" />
          <p>Loading saved posts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fan-member-feed">
      <FanFeedHeaderChrome
        savedCount={savedBookmarkCount}
        onLeftClick={onBackToFeed}
        leftTitle="Back to feed"
        leftAriaLabel="Back to feed"
        leftIcon="back"
        savedLinkVariant="current-saved"
      />
      <div className="fan-feed-header pt-1">
        <p className="fan-feed-subtitle m-0 text-center">Posts you saved from {displayName}</p>
      </div>
      <div className="fan-feed-posts">
        {posts.length === 0 ? (
          <div className="fan-feed-empty">
            <p>No saved posts yet. Save posts from the feed to see them here.</p>
          </div>
        ) : (
          posts.map((post) => (
            <article key={post.id} className="fan-feed-post">
              <div className="fan-feed-post-header">
                <div className="fan-feed-post-avatar">
                  {creatorAvatarSrc ? (
                    <img src={creatorAvatarSrc} alt="" className="fan-feed-avatar-img" style={avatarCropStyle} />
                  ) : (
                    <span className="fan-feed-avatar-placeholder">{displayName?.charAt(0) || "?"}</span>
                  )}
                </div>
                <div className="fan-feed-post-meta">
                  <span className="fan-feed-post-author">{displayName}</span>
                  <span className="fan-feed-post-time">{formatTimeAgo(post.createdAt)}</span>
                </div>
              </div>
              <FanMemberPostMedia
                post={post}
                primary={primary}
                creatorId={creatorId}
                fanId={fanId}
                unlockedFanPostIds={unlockedFanPostIdSetSaved}
                fanPageAdminBypass={fanPageAdminBypass}
                unlockingPostId={unlockingPostIdSaved}
                onUnlockPost={handleUnlockPostSaved}
                onUnlockNeedSignIn={(m) => showToastSaved?.(m, "error")}
                sjHeartEmojiCtx={sjHeartEmojiCtxSaved}
              />
              {post.postKind === "live_stream_promo" && post.liveStreamPromo?.streamId ? (
                <div className="feed-card-live-stream-promo-wrap fan-feed-live-stream-promo px-1">
                  <LiveStreamPromoBanner
                    promo={mergeLivePromoSaved(post.liveStreamPromo)}
                    accentHex={primary}
                    fanAccess={liveStreamFanAccess(mergeLivePromoSaved(post.liveStreamPromo), {
                      fanId,
                      fanPageAdminBypass,
                      unlockedStreamIds: unlockedLiveStreamIdSetSaved,
                      paidSubscriberTicketSkip: liveStreamPaidMemberTicketSkip,
                    })}
                    ticketLoading={liveStreamCheckoutStreamIdSaved === post.liveStreamPromo.streamId}
                    onGetTicket={() => void handleLiveStreamTicketSaved(post.liveStreamPromo!.streamId)}
                    onSignIn={() => showToastSaved?.("Sign in to get a ticket.", "error")}
                    onWatchLive={() => handleLiveStreamWatchSaved(post.liveStreamPromo!)}
                  />
                </div>
              ) : null}
              <div className="fan-feed-post-content">
                <MemberFeedCaptionBody
                  displayName={displayName}
                  primary={primary}
                  content={post.content}
                  sjHeartEmojiCtx={sjHeartEmojiCtxSaved}
                />
                <FanMemberPostPollView poll={post.poll} fanId={fanId} onVote={(idx) => handlePollVoteSaved(post, idx)} />
                <FanMemberPostTipGoalView
                  tipGoal={post.tipGoal}
                  primary={primary}
                  showTipButton={false}
                />
              </div>
              <div className="fan-feed-post-actions">
                <button
                  type="button"
                  className="fan-feed-action-btn fan-feed-action-active"
                  onClick={() => handleUnsave(post.id)}
                  disabled={unsavingId === post.id}
                  style={{ color: primary }}
                  title="Remove from saved"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                  <span>{unsavingId === post.id ? "Removing…" : "Saved"}</span>
                </button>
              </div>
              {!(feedSettings?.hideComments || post.hideComments) && (
                <div className="fan-feed-post-footer">
                  {Math.max(post.commentsCount || 0, (post.commentsList ?? []).length) > 0 && (
                    <button
                      type="button"
                      className="fan-feed-view-comments-link"
                      onClick={() => setViewPostId(post.id)}
                    >
                      View all {Math.max(post.commentsCount || 0, (post.commentsList ?? []).length)} comments
                    </button>
                  )}
                  {post.commentsCount === 0 && (post.commentsList ?? []).length === 0 && (
                    <p className="fan-feed-post-comments-teaser">No comments yet.</p>
                  )}
                  {(post.commentsList ?? []).slice(0, 2).map((c, idx) => {
                    const inlineKey = `${post.id}-saved-inline-c-${idx}`;
                    const expanded = expandedInlineCommentKeys.has(inlineKey);
                    const { preview, truncated } = getInlineCommentPreview(c.text);
                    return (
                    <p key={inlineKey} className="fan-feed-inline-comment-preview m-0 text-sm" style={{ color: "var(--fan-text, #1f2937)" }}>
                      <span style={{ fontWeight: 600, marginRight: "0.35rem" }}>{c.author}</span>
                      {expanded || !truncated
                        ? renderTextWithCustomEmoji(c.text, sjHeartEmojiCtxSaved)
                        : renderTextWithCustomEmoji(preview, sjHeartEmojiCtxSaved)}
                      {truncated ? (
                        <button
                          type="button"
                          className="fan-feed-view-post-link"
                          style={{ marginLeft: "0.35rem" }}
                          onClick={() =>
                            setExpandedInlineCommentKeys((prev) => {
                              const next = new Set(prev);
                              if (next.has(inlineKey)) next.delete(inlineKey);
                              else next.add(inlineKey);
                              return next;
                            })
                          }
                        >
                          {expanded ? "less" : "more"}
                        </button>
                      ) : null}
                    </p>
                  );})}
                  <button
                    type="button"
                    className="fan-feed-view-post-link"
                    onClick={() => setViewPostId(post.id)}
                  >
                    View post
                  </button>
                </div>
              )}
            </article>
          ))
        )}
      </div>

      <FanMemberPostDetailModal
        open={viewPostId !== null}
        onClose={() => setViewPostId(null)}
        post={detailPostForModalSaved}
        loading={detailLoading}
        displayName={displayName}
        creatorAvatar={avatar}
        creatorAvatarCropStyle={avatarCropStyle}
        primary={primary}
        creatorId={creatorId}
        fanId={fanId}
        fanPhotoURL={fanPhotoResolved}
        fanDisplayName={fanNameResolved}
        feedSettings={feedSettings}
        commentDraft={commentDraft}
        setCommentDraft={setCommentDraft}
        commentSending={null}
        onReloadAfterComment={reloadDetailPost}
        backLabel="Back to Saved"
        unlockedFanPostIds={unlockedFanPostIdSetSaved}
        unlockingPostId={unlockingPostIdSaved}
        onUnlockPost={handleUnlockPostSaved}
        onUnlockNeedSignIn={(m) => showToastSaved?.(m, "error")}
        onPollVote={handlePollVoteSaved}
        sjHeartEmojiCtx={sjHeartEmojiCtxSaved}
        fanPageAdminBypass={fanPageAdminBypass}
        unlockedLiveStreamIds={unlockedLiveStreamIdSetSaved}
        liveStreamPaidMemberTicketSkip={liveStreamPaidMemberTicketSkip}
        liveStreamCheckoutStreamId={liveStreamCheckoutStreamIdSaved}
        onLiveStreamTicket={handleLiveStreamTicketSaved}
        onLiveStreamSignIn={() => showToastSaved?.("Sign in to get a ticket.", "error")}
        onLiveStreamWatch={handleLiveStreamWatchSaved}
      />

      {liveStreamWatchSaved ? (
        <LiveStreamWatchRoom
          creatorId={creatorId}
          streamId={liveStreamWatchSaved.streamId}
          title={liveStreamWatchSaved.title}
          onClose={() => setLiveStreamWatchSaved(null)}
        />
      ) : null}
    </div>
  );
};
