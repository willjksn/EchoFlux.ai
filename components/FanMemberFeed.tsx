"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
  limit,
  Timestamp,
  doc,
  getDoc,
  setDoc,
  type DocumentData,
} from "firebase/firestore";
import { db, auth } from "../firebaseConfig";
import {
  parseLockedContent,
  isMediaSlotLocked,
  type LockedPostContent,
} from "../src/lib/lockedPostMedia";
import { getAvatarCropStyle } from "../src/lib/avatarCrop";
import { inferIsVideoFromUrl, normalizePostMediaTypes } from "../src/lib/mediaUrlInfer";
import { DmAudioPlayer } from "./DmAudioPlayer";
import { ViewPostModalVideo } from "./ViewPostModalVideo";
import { feedCommentAuthorLabel, feedCommentAuthorInitial } from "../src/lib/feedCommentLabel";

const SAVED_BY_CREATOR_KEY = "savedPostIdsByCreator";

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
export type FanMemberPostComment = { author: string; text: string };

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
  pinned?: boolean;
  hideComments?: boolean;
  hideLikes?: boolean;
  hideLikeCounts?: boolean;
  lockedContent?: LockedPostContent;
  audioUrls?: string[];
}

export interface FanFeedVisibilitySettings {
  hideLikeCounts?: boolean;
  hideComments?: boolean;
  hideLikes?: boolean;
}

interface FanMemberFeedProps {
  creatorId: string;
  displayName: string;
  avatar?: string;
  /** CSS object-position for circular avatar (matches storefront “pan avatar”). */
  avatarObjectPosition?: string;
  primary?: string;
  feedSettings?: FanFeedVisibilitySettings;
  /** Logged-in fan's uid; when set, bookmarks are persisted and loaded from Firestore */
  fanId?: string;
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

function postFromFirestore(docId: string, data: DocumentData): Post | null {
  const status = (data.status as string) || "published";
  if (status === "draft") return null;
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
    commentsList.push({ author, text });
  }
  const lc = parseLockedContent(data.lockedContent);
  const commentsCountFallback =
    commentsList.length > 0
      ? commentsList.length
      : typeof data.commentsCount === "number"
        ? data.commentsCount
        : rawComments.length;
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
    pinned: !!(data.pinned as boolean),
    hideComments: data.hideComments as boolean | undefined,
    hideLikes: data.hideLikes as boolean | undefined,
    hideLikeCounts: data.hideLikeCounts as boolean | undefined,
    lockedContent: lc,
  };
}

function FanMemberPostMedia({
  post,
  primary,
  variant = "feed",
  splitModal = false,
}: {
  post: Post;
  primary: string;
  /** `detail` = larger view-post modal (taller/wider than feed card) */
  variant?: "feed" | "detail";
  /** Same media chrome as creator View post (split modal): modal classes + loop video */
  splitModal?: boolean;
}) {
  const urls = post.mediaUrls;
  const types = post.mediaTypes;
  const n = urls.length;
  const lockedCfg = post.lockedContent?.enabled ? post.lockedContent : undefined;

  const [mediaIndex, setMediaIndex] = useState(0);

  useEffect(() => {
    setMediaIndex(0);
  }, [post.id]);

  useEffect(() => {
    setMediaIndex((i) => Math.min(i, Math.max(0, n - 1)));
  }, [n]);

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
      setMediaIndex((i) => Math.max(0, i - 1));
    },
    [n]
  );

  const goNext = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (n <= 1) return;
      setMediaIndex((i) => Math.min(n - 1, i + 1));
    },
    [n]
  );

  const onCarouselKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (n <= 1) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setMediaIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setMediaIndex((i) => Math.min(n - 1, i + 1));
      }
    },
    [n]
  );

  if (n === 0) return null;

  const idx = Math.min(mediaIndex, n - 1);
  const currentUrl = urls[idx];
  const currentIsVideo = types[idx] === "video" || inferIsVideoFromUrl(currentUrl);
  const lockedCurrent = isMediaSlotLocked(lockedCfg, idx, n);

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
      role={showCarousel ? "group" : undefined}
      aria-roledescription={showCarousel ? "carousel" : undefined}
      aria-label={showCarousel ? `Post media, ${slideLabel}` : undefined}
      tabIndex={showCarousel ? 0 : undefined}
      onKeyDown={showCarousel ? onCarouselKeyDown : undefined}
      className={rootClass}
    >
      {showCarousel ? (
        <span className="sr-only" aria-live="polite">
          {slideLabel}
        </span>
      ) : null}
      {currentIsVideo ? (
        lockedCurrent ? (
          <video
            key={`${post.id}-v-${idx}`}
            src={currentUrl}
            controls={false}
            className={splitModal ? "feed-comments-modal-media feed-comments-modal-media-video" : "feed-card-media feed-card-media-video"}
            playsInline
            preload="metadata"
          />
        ) : splitModal ? (
          <ViewPostModalVideo
            src={currentUrl}
            videoKey={`${post.id}-member-modal-v-${idx}`}
            accentHex={primary}
          />
        ) : (
          <video
            key={`${post.id}-v-${idx}`}
            src={currentUrl}
            controls
            className="feed-card-media feed-card-media-video"
            playsInline
            preload="metadata"
          />
        )
      ) : (
        <img
          key={`${post.id}-i-${idx}`}
          src={currentUrl}
          alt=""
          className={splitModal ? "feed-comments-modal-media" : "feed-card-media"}
          loading={idx === 0 ? "lazy" : "eager"}
        />
      )}
      {lockedCurrent && (
        <div className="fan-feed-media-lock-overlay">
          <span className="fan-feed-media-lock-icon" aria-hidden>
            🔒
          </span>
          <span className="fan-feed-media-lock-text" style={{ color: primary }}>
            {post.lockedContent?.priceCents != null && post.lockedContent.priceCents > 0
              ? `Unlock $${(post.lockedContent.priceCents / 100).toFixed(2)}`
              : "Locked"}
          </span>
        </div>
      )}
      {showCarousel && (
        <>
          {idx > 0 ? (
            <button
              type="button"
              className="fan-feed-media-carousel-btn fan-feed-media-carousel-btn--prev"
              aria-label="Previous image or video"
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
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setMediaIndex(i);
                }}
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

function useMemberPostDetail(creatorId: string | undefined, viewPostId: string | null) {
  const [detailPost, setDetailPost] = useState<Post | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!viewPostId || !creatorId || !db) {
      setDetailPost(null);
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    setDetailPost(null);
    try {
      let found: Post | null = null;
      for (const col of ["fanPosts", "posts"] as const) {
        const snap = await getDoc(doc(db, "creators", creatorId, col, viewPostId));
        if (snap.exists()) {
          const p = postFromFirestore(snap.id, snap.data());
          if (p) {
            found = p;
            break;
          }
        }
      }
      setDetailPost(found);
    } finally {
      setDetailLoading(false);
    }
  }, [viewPostId, creatorId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { detailPost, detailLoading, reload };
}

function formatPostCalendarDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
  creatorId: _creatorId,
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

  if (!open) return null;

  const pid = post?.id ?? "";
  const draft = commentDraft[pid] ?? "";
  const commentsVisible = post && !post.hideComments && !feedSettings?.hideComments;
  const hasMedia = !!post && post.mediaUrls.length > 0;

  return (
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
              {hasMedia ? <FanMemberPostMedia post={post} primary={primary} splitModal /> : null}
              <div className="feed-comments-modal-panel">
                {post.content?.trim() ? (
                  <div className="feed-comments-modal-post-body">
                    <p>{post.content}</p>
                    <p className="fan-member-viewpost-date-inline">{formatPostCalendarDate(post.createdAt)}</p>
                  </div>
                ) : (
                  <div className="feed-comments-modal-post-body feed-comments-modal-post-body--date-only">
                    <p className="fan-member-viewpost-date-inline">{formatPostCalendarDate(post.createdAt)}</p>
                  </div>
                )}
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
                        post.commentsList.map((c, idx) => (
                          <div className="feed-comments-modal-item" key={`${post.id}-c-${idx}`}>
                            <div className="feed-comments-modal-item-avatar" aria-hidden>
                              <span>{feedCommentAuthorInitial(c.author)}</span>
                            </div>
                            <div className="feed-comments-modal-item-body">
                              <p className="feed-comments-modal-text">
                                <span className="comment-username">{c.author}</span>
                                <span className="feed-comments-modal-comment-body">{c.text}</span>
                              </p>
                            </div>
                          </div>
                        ))
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
                          <input
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
                          />
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

export const FanMemberFeed: React.FC<FanMemberFeedProps> = ({
  creatorId,
  displayName,
  avatar,
  avatarObjectPosition,
  primary = "#6366f1",
  feedSettings,
  fanId,
}) => {
  const avatarCropStyle: React.CSSProperties = getAvatarCropStyle(avatarObjectPosition);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Set<string>>(new Set());
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [bookmarkSaving, setBookmarkSaving] = useState(false);
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [commentSending, setCommentSending] = useState<string | null>(null);
  const [viewPostId, setViewPostId] = useState<string | null>(null);
  const { detailPost, detailLoading, reload: reloadDetailPost } = useMemberPostDetail(creatorId, viewPostId);
  const [fanPublicProfile, setFanPublicProfile] = useState<{ photoURL?: string; displayName?: string }>({});

  const fanPhotoResolved =
    fanPublicProfile.photoURL?.trim() || auth.currentUser?.photoURL?.trim() || undefined;
  const fanNameResolved =
    fanPublicProfile.displayName?.trim() ||
    auth.currentUser?.displayName?.trim() ||
    undefined;

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const tryCollections = [
        collection(db, "creators", creatorId, "fanPosts"),
        collection(db, "creators", creatorId, "posts"),
      ];
      let realPosts: Post[] = [];
      for (const postsRef of tryCollections) {
        const q = query(postsRef, orderBy("createdAt", "desc"), limit(20));
        const snapshot = await getDocs(q);
        const batch: Post[] = [];
        snapshot.docs.forEach((docSnap) => {
          const p = postFromFirestore(docSnap.id, docSnap.data());
          if (p) batch.push(p);
        });
        batch.sort((a, b) => (a.pinned && !b.pinned ? -1 : !a.pinned && b.pinned ? 1 : 0));
        if (batch.length > 0) {
          realPosts = batch;
          break;
        }
      }

      if (realPosts.length === 0) {
        setPosts(DEMO_POSTS);
      } else {
        setPosts(realPosts);
      }
    } catch (err) {
      console.error("Error fetching posts:", err);
      setPosts(DEMO_POSTS);
    } finally {
      setLoading(false);
    }
  }, [creatorId]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  useEffect(() => {
    if (!fanId || !db) {
      setFanPublicProfile({});
      setBookmarkedPosts(new Set());
      return;
    }
    let cancelled = false;
    getDoc(doc(db, "users", fanId))
      .then((snap) => {
        if (cancelled) return;
        if (!snap.exists()) {
          setFanPublicProfile({});
          setBookmarkedPosts(new Set());
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
        const photo =
          typeof data.photoURL === "string" && data.photoURL.trim()
            ? data.photoURL.trim()
            : typeof data.avatar === "string" && data.avatar.trim()
              ? data.avatar.trim()
              : undefined;
        const name =
          typeof data.displayName === "string" && data.displayName.trim()
            ? data.displayName.trim()
            : undefined;
        setFanPublicProfile({ photoURL: photo, displayName: name });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fanId, creatorId]);

  const submitComment = useCallback(
    async (postId: string, afterSuccess?: () => void | Promise<void>) => {
      const text = (commentDraft[postId] ?? "").trim();
      if (!text || !fanId || commentSending) return;
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      setCommentSending(postId);
      try {
        const res = await fetch("/api/addCommentToPost", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            creatorId,
            postId,
            text,
            authorDisplayName: auth.currentUser?.displayName ?? undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.success) {
          setCommentDraft((prev) => ({ ...prev, [postId]: "" }));
          fetchPosts();
          await afterSuccess?.();
        }
      } catch (err) {
        console.error("Failed to add comment", err);
      } finally {
        setCommentSending(null);
      }
    },
    [creatorId, fanId, commentDraft, commentSending, fetchPosts]
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

  const toggleLike = (postId: string) => {
    setLikedPosts((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
    // Update local like count for UI feedback
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, likesCount: likedPosts.has(postId) ? p.likesCount - 1 : p.likesCount + 1 }
          : p
      )
    );
  };

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
      <div className="fan-feed-header">
        <h2 className="fan-feed-title">Latest Posts</h2>
        <p className="fan-feed-subtitle">Exclusive content for members only</p>
      </div>

      <div className="fan-feed-posts">
        {posts.length === 0 ? (
          <div className="fan-feed-empty">
            <p>No posts yet. Check back soon!</p>
          </div>
        ) : (
          posts.map((post) => (
            <article key={post.id} className="fan-feed-post">
              <div className="fan-feed-post-header">
                <div className="fan-feed-post-avatar">
                  {avatar ? (
                    <img src={avatar} alt="" className="fan-feed-avatar-img" style={avatarCropStyle} />
                  ) : (
                    <span className="fan-feed-avatar-placeholder">{displayName?.charAt(0) || "?"}</span>
                  )}
                </div>
                <div className="fan-feed-post-meta">
                  <span className="fan-feed-post-author">{displayName}</span>
                  <span className="fan-feed-post-time">{formatTimeAgo(post.createdAt)}</span>
                </div>
                <button type="button" className="fan-feed-post-menu" aria-label="More options">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="12" cy="19" r="2" />
                  </svg>
                </button>
              </div>

              <div className="fan-feed-post-content">
                <p>{post.content}</p>
              </div>

              <FanMemberPostMedia post={post} primary={primary} />

              {post.audioUrls && post.audioUrls.length > 0 ? (
                <div className="fan-feed-post-audio mt-2 space-y-2 px-1">
                  {post.audioUrls.map((url) => (
                    <DmAudioPlayer key={`${post.id}-a-${url.slice(-24)}`} src={url} className="w-full" />
                  ))}
                </div>
              ) : null}

              <div className="fan-feed-post-actions">
                {!(feedSettings?.hideLikes || post.hideLikes) && (
                  <button
                    type="button"
                    className={`fan-feed-action-btn ${likedPosts.has(post.id) ? "fan-feed-action-active" : ""}`}
                    onClick={() => toggleLike(post.id)}
                    style={likedPosts.has(post.id) ? { color: primary } : undefined}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={likedPosts.has(post.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                    {!(feedSettings?.hideLikeCounts || post.hideLikeCounts) && (
                      <span>{post.likesCount + (likedPosts.has(post.id) ? 1 : 0)}</span>
                    )}
                  </button>
                )}

                {!(feedSettings?.hideComments || post.hideComments) && (
                  <button
                    type="button"
                    className="fan-feed-action-btn"
                    onClick={() => toggleComments(post.id)}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                    </svg>
                    <span>{post.commentsCount}</span>
                  </button>
                )}

                <button
                  type="button"
                  className={`fan-feed-action-btn ${bookmarkedPosts.has(post.id) ? "fan-feed-action-active" : ""}`}
                  onClick={() => toggleBookmark(post.id)}
                  disabled={bookmarkSaving}
                  style={bookmarkedPosts.has(post.id) ? { color: primary } : undefined}
                  title={bookmarkedPosts.has(post.id) ? "Unsave post" : "Save post"}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill={bookmarkedPosts.has(post.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                </button>

                <button type="button" className="fan-feed-action-btn fan-feed-share-btn">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                </button>
              </div>

              <div className="fan-feed-post-footer">
                {!(feedSettings?.hideComments || post.hideComments) && (
                  <p className="fan-feed-post-comments-teaser">
                    {post.commentsCount === 0
                      ? "No comments yet."
                      : `${post.commentsCount} comment${post.commentsCount === 1 ? "" : "s"}`}
                  </p>
                )}
                <button
                  type="button"
                  className="fan-feed-view-post-link"
                  style={{ color: primary }}
                  onClick={() => setViewPostId(post.id)}
                >
                  View post
                </button>
              </div>

              {!(feedSettings?.hideComments || post.hideComments) && expandedComments.has(post.id) && (
                <div className="fan-feed-comments">
                  <div className="fan-feed-comment-input-wrap">
                    <input
                      type="text"
                      className="fan-feed-comment-input"
                      placeholder="Write a comment..."
                      value={commentDraft[post.id] ?? ""}
                      onChange={(e) => setCommentDraft((prev) => ({ ...prev, [post.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && submitComment(post.id)}
                      disabled={!fanId || !!commentSending}
                    />
                    <button
                      type="button"
                      className="fan-feed-comment-send"
                      style={{ backgroundColor: primary }}
                      onClick={() => submitComment(post.id)}
                      disabled={!fanId || !(commentDraft[post.id] ?? "").trim() || !!commentSending}
                    >
                      {commentSending === post.id ? "…" : "Send"}
                    </button>
                  </div>
                  <div className="fan-feed-comments-list">
                    <p className="fan-feed-no-comments">No comments yet. Be the first!</p>
                  </div>
                </div>
              )}
            </article>
          ))
        )}
      </div>

      <FanMemberPostDetailModal
        open={viewPostId !== null}
        onClose={() => setViewPostId(null)}
        post={detailPost}
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
      />
    </div>
  );
};

/** Saved posts view for a fan: loads savedPostIdsByCreator[creatorId] and fetches each post */
interface FanMemberSavedProps {
  creatorId: string;
  displayName: string;
  avatar?: string;
  avatarObjectPosition?: string;
  primary?: string;
  feedSettings?: FanFeedVisibilitySettings;
  fanId: string | undefined;
}

export const FanMemberSaved: React.FC<FanMemberSavedProps> = ({
  creatorId,
  displayName,
  avatar,
  avatarObjectPosition,
  primary = "#6366f1",
  feedSettings,
  fanId,
}) => {
  const avatarCropStyle: React.CSSProperties = getAvatarCropStyle(avatarObjectPosition);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [unsavingId, setUnsavingId] = useState<string | null>(null);
  const [viewPostId, setViewPostId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const { detailPost, detailLoading, reload: reloadDetailPost } = useMemberPostDetail(creatorId, viewPostId);
  const [fanPublicProfile, setFanPublicProfile] = useState<{ photoURL?: string; displayName?: string }>({});

  useEffect(() => {
    if (!fanId || !db) {
      setFanPublicProfile({});
      return;
    }
    let cancelled = false;
    getDoc(doc(db, "users", fanId))
      .then((snap) => {
        if (cancelled || !snap.exists()) return;
        const d = snap.data() as Record<string, unknown>;
        const photo =
          typeof d.photoURL === "string" && d.photoURL.trim()
            ? d.photoURL.trim()
            : typeof d.avatar === "string" && d.avatar.trim()
              ? d.avatar.trim()
              : undefined;
        const name =
          typeof d.displayName === "string" && d.displayName.trim() ? d.displayName.trim() : undefined;
        setFanPublicProfile({ photoURL: photo, displayName: name });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fanId]);

  const fanPhotoResolved =
    fanPublicProfile.photoURL?.trim() || auth.currentUser?.photoURL?.trim() || undefined;
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
        if (!Array.isArray(ids) || ids.length === 0) {
          setPosts([]);
          setLoading(false);
          return;
        }
        return Promise.all(
          ids.map(async (postId) => {
            const fanPostSnap = await getDoc(doc(db!, "creators", creatorId, "fanPosts", postId));
            if (fanPostSnap.exists()) return { postId, snap: fanPostSnap };
            const legacySnap = await getDoc(doc(db!, "creators", creatorId, "posts", postId));
            return { postId, snap: legacySnap };
          })
        ).then((results) => {
          if (cancelled) return;
          const list: Post[] = [];
          results.forEach(({ postId, snap }) => {
            if (!snap.exists()) return;
            const p = postFromFirestore(postId, snap.data());
            if (p) list.push(p);
          });
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
  }, [fanId, creatorId]);

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
      <div className="fan-feed-loading">
        <div className="fan-feed-spinner" />
        <p>Loading saved posts...</p>
      </div>
    );
  }

  return (
    <div className="fan-member-feed">
      <div className="fan-feed-header">
        <h2 className="fan-feed-title">Saved</h2>
        <p className="fan-feed-subtitle">Posts you saved from {displayName}</p>
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
                  {avatar ? (
                    <img src={avatar} alt="" className="fan-feed-avatar-img" style={avatarCropStyle} />
                  ) : (
                    <span className="fan-feed-avatar-placeholder">{displayName?.charAt(0) || "?"}</span>
                  )}
                </div>
                <div className="fan-feed-post-meta">
                  <span className="fan-feed-post-author">{displayName}</span>
                  <span className="fan-feed-post-time">{formatTimeAgo(post.createdAt)}</span>
                </div>
              </div>
              <div className="fan-feed-post-content">
                <p>{post.content}</p>
              </div>
              <FanMemberPostMedia post={post} primary={primary} />
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
              <div className="fan-feed-post-footer">
                {!(feedSettings?.hideComments || post.hideComments) && (
                  <p className="fan-feed-post-comments-teaser">
                    {post.commentsCount === 0
                      ? "No comments yet."
                      : `${post.commentsCount} comment${post.commentsCount === 1 ? "" : "s"}`}
                  </p>
                )}
                <button
                  type="button"
                  className="fan-feed-view-post-link"
                  style={{ color: primary }}
                  onClick={() => setViewPostId(post.id)}
                >
                  View post
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      <FanMemberPostDetailModal
        open={viewPostId !== null}
        onClose={() => setViewPostId(null)}
        post={detailPost}
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
      />
    </div>
  );
};
