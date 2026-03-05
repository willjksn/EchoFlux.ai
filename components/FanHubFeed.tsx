import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useAppContext } from "./AppContext";
import { collection, query, orderBy, limit, getDocs, doc, runTransaction, getDoc, serverTimestamp, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";

export type FeedPost = {
  id: string;
  body: string;
  mediaUrls: string[];
  mediaTypes?: ("image" | "video")[];
  audioUrls?: string[];
  createdAt?: { toDate: () => Date } | string;
  likeCount: number;
  likedBy?: string[];
  comments: { username?: string; author?: string; text: string; hidden?: boolean }[];
  captionStyle?: "static" | "scroll-up" | "scroll-across" | "dissolve";
  overlayText?: string;
  overlayTextColor?: string;
  overlayTextSize?: number;
  overlayHighlight?: boolean;
  overlayItalic?: boolean;
  hideComments?: boolean;
  hideLikes?: boolean;
  showTipButton?: boolean;
  poll?: { question: string; options: string[]; optionVotes?: number[] };
  tipGoal?: { description: string; targetCents: number; raisedCents: number };
  lockedContent?: { enabled: boolean; priceCents: number };
  status?: "published" | "scheduled" | "draft";
  calendarDate?: string;
  calendarTime?: string;
  scheduledAt?: { toDate: () => Date } | Date | null;
  publishedAt?: { toDate: () => Date } | Date | null;
};

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

const PlayIcon = () => (
  <svg className="feed-card-play-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M8 5v14l11-7L8 5z" />
  </svg>
);

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

function FeedCardCaptionOverlay({ caption, style: captionStyle, size }: { caption: string; style?: string; size?: number }) {
  if (!caption?.trim()) return null;
  return (
    <div className={`feed-card-caption-overlay feed-card-caption-overlay-${captionStyle || "static"}`} aria-hidden>
      <span className="feed-card-caption-overlay-text" style={size != null && size > 0 ? { fontSize: `${size}px` } : undefined}>{caption}</span>
    </div>
  );
}

function FeedCard({
  post,
  creatorName,
  creatorAvatar,
  currentUserId,
  savedPostIds,
  onLikeUpdated,
  onCommentsUpdated,
  onSavedUpdated,
  isAdminMode,
  onEditPost,
  onDeletePost,
  onToggleVisibility,
}: {
  post: FeedPost;
  creatorName: string;
  creatorAvatar?: string;
  currentUserId?: string;
  savedPostIds: string[];
  onLikeUpdated?: (postId: string, likedBy: string[], likeCount: number) => void;
  onCommentsUpdated?: (postId: string, comments: FeedPost["comments"]) => void;
  onSavedUpdated?: (savedIds: string[]) => void;
  isAdminMode?: boolean;
  onEditPost?: (postId: string) => void;
  onDeletePost?: (postId: string) => void;
  onToggleVisibility?: (postId: string, currentStatus: string) => void;
}) {
  const firstUrl = post.mediaUrls?.[0];
  const hasTipGoal = !!(post.tipGoal && typeof post.tipGoal.targetCents === "number" && post.tipGoal.targetCents > 0);
  const isVideo = post.mediaTypes?.[0] === "video" || (firstUrl && /\.(mp4|webm|mov|ogg)(\?|$)/i.test(firstUrl));
  const mediaTotals = useMemo(() => {
    const items = Array.isArray(post.mediaUrls) ? post.mediaUrls : [];
    return items.reduce(
      (acc, url, index) => {
        const explicitType = post.mediaTypes?.[index];
        const detectedType =
          explicitType === "video" || /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url || "")
            ? "video"
            : "image";
        if (detectedType === "video") acc.videos += 1;
        else acc.images += 1;
        return acc;
      },
      { images: 0, videos: 0 }
    );
  }, [post.mediaUrls, post.mediaTypes]);

  const dateStr = post.createdAt
    ? typeof post.createdAt === "string"
      ? formatRelative(post.createdAt)
      : (post.createdAt as { toDate: () => Date }).toDate
        ? formatRelative((post.createdAt as { toDate: () => Date }).toDate())
        : ""
    : "";

  const captionStyle = post.captionStyle ?? "static";
  const showCaptionOnMedia = captionStyle !== "static" && post.body?.trim();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [likeSaving, setLikeSaving] = useState(false);
  const [modalComment, setModalComment] = useState("");
  const [modalCommentSaving, setModalCommentSaving] = useState(false);
  const commentInputRef = useRef<HTMLInputElement | null>(null);
  const visibleComments = useMemo(() => post.comments.filter((c) => !c.hidden), [post.comments]);
  const isLiked = !!currentUserId && (post.likedBy ?? []).includes(currentUserId);
  const isSaved = savedPostIds.includes(post.id);
  const feedVideoRef = useRef<HTMLVideoElement | null>(null);
  const [feedVideoPlaying, setFeedVideoPlaying] = useState(false);
  const [feedVideoMuted, setFeedVideoMuted] = useState(true);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const adminMenuRef = useRef<HTMLDivElement | null>(null);

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

  const toggleLike = async () => {
    if (!db || !post.id || !currentUserId || likeSaving) return;
    setLikeSaving(true);
    try {
      const postRef = doc(db, "posts", post.id);
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
      const postRef = doc(db, "posts", post.id);
      const username = creatorName || "User";
      let nextComments: FeedPost["comments"] = post.comments;
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(postRef);
        if (!snap.exists()) throw new Error("Post not found.");
        const data = snap.data() as Record<string, unknown>;
        const existing = Array.isArray(data.comments) ? (data.comments as FeedPost["comments"]) : [];
        nextComments = [...existing, { username, text: text.slice(0, 500) }];
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
    <article className={`feed-card${commentsOpen ? " comments-open" : ""}${!firstUrl ? " feed-card-text-only" : ""}${isAdminMode ? " feed-card-admin" : ""}${isDraft ? " feed-card-draft" : ""}${isScheduled ? " feed-card-scheduled" : ""}`}>
      <div className="feed-card-header">
        <div className="feed-card-avatar">
          {creatorAvatar ? (
            <img src={creatorAvatar} alt="" className="feed-card-avatar-img" />
          ) : (
            <span style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-muted)" }}>
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
                    onEditPost?.(post.id);
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

      {firstUrl ? (
        isVideo ? (
          <div
            className="feed-card-media-wrap feed-card-media-wrap-video"
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.preventDefault();
              const v = feedVideoRef.current;
              if (!v) return;
              if (v.paused) v.play();
              else v.pause();
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              const v = feedVideoRef.current;
              if (!v) return;
              if (v.paused) v.play();
              else v.pause();
            }}
            aria-label={feedVideoPlaying ? "Pause video" : "Play video"}
          >
            <video
              ref={feedVideoRef}
              src={firstUrl.includes("#t=") ? firstUrl : `${firstUrl}#t=0.1`}
              muted={feedVideoMuted}
              playsInline
              className="feed-card-media feed-card-media-video"
              preload="auto"
              onPlay={() => setFeedVideoPlaying(true)}
              onPause={() => setFeedVideoPlaying(false)}
              onVolumeChange={(e) => setFeedVideoMuted(e.currentTarget.muted)}
            />
            {!feedVideoPlaying && (
              <span className="feed-card-play-overlay" aria-hidden>
                <PlayIcon />
              </span>
            )}
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
            {showCaptionOnMedia && (
              <FeedCardCaptionOverlay caption={post.body} style={captionStyle} size={post.overlayTextSize} />
            )}
            {(mediaTotals.images + mediaTotals.videos) > 1 && (
              <span className="feed-card-count">
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
            )}
          </div>
        ) : (
          <div className="feed-card-media-wrap">
            <img src={firstUrl} alt="" className="feed-card-media" loading="lazy" />
            {showCaptionOnMedia && (
              <FeedCardCaptionOverlay caption={post.body} style={captionStyle} size={post.overlayTextSize} />
            )}
            {(mediaTotals.images + mediaTotals.videos) > 1 && (
              <span className="feed-card-count">
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
            )}
          </div>
        )
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
            <span className="feed-card-action-count">{post.likeCount ?? 0}</span>
          </span>
          {!post.hideComments && (
            <button type="button" className="feed-card-action-group feed-card-action-link" aria-label="Comments" onClick={() => setCommentsOpen(true)}>
              <CommentIcon />
              <span className="feed-card-action-count">{visibleComments.length}</span>
            </button>
          )}
          {post.showTipButton !== false && !hasTipGoal && (
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
          {post.body || ""}
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
                      <span className="comment-username">{c.username ?? c.author ?? "user"}</span>
                      {c.text}
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
              <span className="feed-card-action-count">{post.likeCount ?? 0}</span>
            </span>
            {!post.hideComments && (
              <button type="button" className="feed-card-action-group feed-card-action-link" aria-label="Comments" onClick={() => setCommentsOpen(true)}>
                <CommentIcon />
                <span className="feed-card-action-count">{visibleComments.length}</span>
              </button>
            )}
            {post.showTipButton !== false && !hasTipGoal && (
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

      {commentsOpen && (
        <div className="feed-comments-modal-backdrop" role="presentation" onClick={() => setCommentsOpen(false)}>
          <div
            className="feed-comments-modal"
            role="dialog"
            aria-modal="true"
            aria-label="All comments"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="feed-comments-modal-head">
              <h3>Comments</h3>
              <button type="button" className="feed-comments-modal-close" onClick={() => setCommentsOpen(false)} aria-label="Close comments">
                ×
              </button>
            </div>
            <div className={`feed-comments-modal-content${firstUrl ? "" : " no-media"}`}>
              {firstUrl && (
                <div className="feed-comments-modal-media-wrap">
                  {isVideo ? (
                    <video
                      src={firstUrl.includes("#t=") ? firstUrl : `${firstUrl}#t=0.1`}
                      controls
                      playsInline
                      className="feed-comments-modal-media feed-comments-modal-media-video"
                      preload="auto"
                    />
                  ) : (
                    <img src={firstUrl} alt="" className="feed-comments-modal-media" />
                  )}
                </div>
              )}
              <div className="feed-comments-modal-panel">
                <div className="feed-comments-modal-list">
                  {visibleComments.length === 0 ? (
                    <p className="feed-comments-modal-empty">No comments yet.</p>
                  ) : (
                    visibleComments.map((c, idx) => {
                      const authorName = c.username ?? c.author ?? "user";
                      return (
                        <div className="feed-comments-modal-item" key={`${idx}-${c.text.slice(0, 12)}`}>
                          <div className="feed-comments-modal-item-avatar" aria-hidden>
                            <span>{authorName.charAt(0).toUpperCase()}</span>
                          </div>
                          <div className="feed-comments-modal-item-body">
                            <p className="feed-comments-modal-text">
                              <span className="comment-username">{authorName}</span>
                              {c.text}
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
                      <span>{(creatorName || "U").charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="feed-comments-modal-compose-input-wrap">
                      <input
                        ref={commentInputRef}
                        type="text"
                        className="feed-comments-modal-compose-input"
                        value={modalComment}
                        onChange={(e) => setModalComment(e.target.value)}
                        placeholder="Write a comment..."
                        maxLength={500}
                      />
                    </div>
                    <button type="submit" className="feed-comments-modal-compose-send" disabled={modalCommentSaving || !modalComment.trim()}>
                      {modalCommentSaving ? "..." : "Post"}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

export const FanHubFeed: React.FC<{ isAdminMode?: boolean }> = ({ isAdminMode = false }) => {
  const { user, setActivePage } = useAppContext();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedPostIds, setSavedPostIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"feed" | "grid">("feed");
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const creatorId = user?.id;
  const creatorName = (user as { displayName?: string })?.displayName || "You";
  const creatorAvatar = (user as { photoURL?: string })?.photoURL;

  useEffect(() => {
    const loadPosts = async () => {
      if (!creatorId) {
        setPosts(DEMO_POSTS);
        setLoading(false);
        return;
      }
      
      try {
        const postsRef = collection(db, "users", creatorId, "posts");
        const q = query(postsRef, orderBy("createdAt", "desc"), limit(50));
        const snap = await getDocs(q);
        
        const list: FeedPost[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          const status = (d.status as string) ?? "published";
          // In admin mode, show all posts; otherwise only show published
          if (!isAdminMode && status !== "published") return;
          list.push({
            id: docSnap.id,
            body: (d.body as string) ?? (d.caption as string) ?? "",
            mediaUrls: (d.mediaUrls as string[]) ?? (d.mediaUrl ? [d.mediaUrl as string] : []) ?? [],
            mediaTypes: (d.mediaTypes as ("image" | "video")[]) ?? [],
            audioUrls: (d.audioUrls as string[]) ?? [],
            createdAt: d.createdAt as { toDate: () => Date },
            likeCount: typeof d.likeCount === "number" ? d.likeCount : 0,
            likedBy: (d.likedBy as string[]) ?? [],
            comments: (d.comments as FeedPost["comments"]) ?? [],
            captionStyle: (d.captionStyle as FeedPost["captionStyle"]) ?? "static",
            overlayTextSize: typeof d.overlayTextSize === "number" ? d.overlayTextSize : 18,
            hideComments: !!d.hideComments,
            hideLikes: !!d.hideLikes,
            showTipButton: d.showTipButton !== false,
            poll: d.poll as FeedPost["poll"] | undefined,
            tipGoal: d.tipGoal as FeedPost["tipGoal"] | undefined,
            status: status as FeedPost["status"],
          });
        });
        
        // Use demo posts if no real posts exist
        setPosts(list.length > 0 ? list : DEMO_POSTS);
      } catch (err) {
        console.warn("Could not load posts, using demo data:", err);
        setPosts(DEMO_POSTS);
      } finally {
        setLoading(false);
      }
    };
    
    loadPosts();
  }, [creatorId, isAdminMode]);

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
      })
      .catch(() => setSavedPostIds([]));
  }, [creatorId]);

  const handleLikeUpdated = useCallback((postId: string, likedBy: string[], likeCount: number) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, likedBy, likeCount } : p)));
  }, []);

  const handleCommentsUpdated = useCallback((postId: string, comments: FeedPost["comments"]) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, comments } : p)));
  }, []);

  const handleSavedUpdated = useCallback((savedIds: string[]) => {
    setSavedPostIds(savedIds);
  }, []);

  const handleEditPost = useCallback((postId: string) => {
    // Navigate to compose page with edit mode
    // Store the post ID to edit in sessionStorage for the compose page to pick up
    sessionStorage.setItem("editPostId", postId);
    setActivePage?.("compose");
  }, [setActivePage]);

  const handleDeletePost = useCallback(async (postId: string) => {
    if (!db || !creatorId || deletingPostId) return;
    if (!confirm("Delete this post? This cannot be undone.")) return;
    
    setDeletingPostId(postId);
    try {
      // Try both paths - posts collection and user's posts subcollection
      try {
        await deleteDoc(doc(db, "posts", postId));
      } catch {
        await deleteDoc(doc(db, "users", creatorId, "posts", postId));
      }
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
      // Try both paths
      try {
        await updateDoc(doc(db, "posts", postId), { status: newStatus });
      } catch {
        await updateDoc(doc(db, "users", creatorId, "posts", postId), { status: newStatus });
      }
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, status: newStatus } : p));
    } catch (err) {
      console.error("Failed to toggle visibility:", err);
      alert("Failed to update post status. Please try again.");
    }
  }, [creatorId]);

  return (
    <main className="member-feed-main">
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
        <h1 className="feed-title">Feed</h1>
        <button type="button" className="feed-saved-link">
          Saved ({savedPostIds.length})
        </button>
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
                currentUserId={creatorId}
                savedPostIds={savedPostIds}
                onLikeUpdated={handleLikeUpdated}
                onCommentsUpdated={handleCommentsUpdated}
                onSavedUpdated={handleSavedUpdated}
                isAdminMode={isAdminMode}
                onEditPost={handleEditPost}
                onDeletePost={handleDeletePost}
                onToggleVisibility={handleToggleVisibility}
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
              const firstUrl = post.mediaUrls?.[0];
              const isVideo = post.mediaTypes?.[0] === "video" || (firstUrl && /\.(mp4|webm|mov|ogg)(\?|$)/i.test(firstUrl));
              return (
                <button
                  key={post.id}
                  type="button"
                  className="feed-grid-item"
                  onClick={() => setViewMode("feed")}
                >
                  {firstUrl ? (
                    isVideo ? (
                      <video src={firstUrl} muted playsInline preload="metadata" />
                    ) : (
                      <img src={firstUrl} alt="" loading="lazy" />
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
  );
};
