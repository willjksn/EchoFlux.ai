"use client";

import React, { useState, useEffect, useCallback } from "react";
import { collection, getDocs, orderBy, query, limit, Timestamp, doc, getDoc, setDoc } from "firebase/firestore";
import { db, auth } from "../firebaseConfig";

const SAVED_BY_CREATOR_KEY = "savedPostIdsByCreator";

interface Post {
  id: string;
  content: string;
  mediaUrl?: string;
  mediaType?: "image" | "video";
  createdAt: Date;
  likesCount: number;
  commentsCount: number;
  pinned?: boolean;
  hideComments?: boolean;
  hideLikes?: boolean;
  hideLikeCounts?: boolean;
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
  primary?: string;
  feedSettings?: FanFeedVisibilitySettings;
  /** Logged-in fan's uid; when set, bookmarks are persisted and loaded from Firestore */
  fanId?: string;
}

const DEMO_POSTS: Post[] = [
  {
    id: "demo-1",
    content: "Good morning everyone 🌸 Starting the day with some coffee and journaling. What's everyone up to today?",
    mediaUrl: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&h=600&fit=crop",
    mediaType: "image",
    createdAt: new Date(Date.now() - 1000 * 60 * 30), // 30 mins ago
    likesCount: 42,
    commentsCount: 8,
  },
  {
    id: "demo-2",
    content: "Behind the scenes from yesterday's shoot 📸 We had so much fun with this one. Can't wait to share more!",
    mediaUrl: "https://images.unsplash.com/photo-1516575334481-f85287c2c82d?w=600&h=600&fit=crop",
    mediaType: "image",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4), // 4 hours ago
    likesCount: 128,
    commentsCount: 23,
  },
  {
    id: "demo-3",
    content: "Quick life update: Been working on something really exciting that I'll share with you all soon. Hint: it involves a trip ✈️",
    mediaUrl: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&h=600&fit=crop",
    mediaType: "image",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
    likesCount: 89,
    commentsCount: 15,
  },
  {
    id: "demo-4",
    content: "Thinking about doing a Q&A session this week. Drop your questions below and I'll answer them in my next post 💬",
    mediaUrl: "",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48), // 2 days ago
    likesCount: 156,
    commentsCount: 67,
  },
  {
    id: "demo-5",
    content: "New content dropping this weekend! 🎉 Make sure your notifications are on so you don't miss it.",
    mediaUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&h=600&fit=crop",
    mediaType: "image",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72), // 3 days ago
    likesCount: 203,
    commentsCount: 34,
  },
];

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
  primary = "#6366f1",
  feedSettings,
  fanId,
}) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Set<string>>(new Set());
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [bookmarkSaving, setBookmarkSaving] = useState(false);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const postsRef = collection(db, `creators/${creatorId}/posts`);
      const q = query(postsRef, orderBy("createdAt", "desc"), limit(20));
      const snapshot = await getDocs(q);

      const realPosts: Post[] = [];
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const status = (data.status as string) || "published";
        if (status === "draft") return;
        const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date((data.createdAt as string) || Date.now());
        const mediaUrls = data.mediaUrls as string[] | undefined;
        const mediaTypes = data.mediaTypes as ("image" | "video")[] | undefined;
        const comments = (data.comments as { text: string }[]) || [];
        realPosts.push({
          id: docSnap.id,
          content: (data.body as string) || (data.content as string) || "",
          mediaUrl: mediaUrls?.[0] || (data.mediaUrl as string) || "",
          mediaType: mediaTypes?.[0] || (data.mediaType as "image" | "video"),
          createdAt,
          likesCount: typeof data.likeCount === "number" ? data.likeCount : (data.likesCount as number) || 0,
          commentsCount: comments.length || (data.commentsCount as number) || 0,
          pinned: !!(data.pinned as boolean),
          hideComments: data.hideComments as boolean | undefined,
          hideLikes: data.hideLikes as boolean | undefined,
          hideLikeCounts: data.hideLikeCounts as boolean | undefined,
        });
      });
      realPosts.sort((a, b) => (a.pinned && !b.pinned ? -1 : !a.pinned && b.pinned ? 1 : 0));

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
    if (!fanId || !creatorId || !db) return;
    getDoc(doc(db, "users", fanId))
      .then((snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as Record<string, unknown>;
        const byCreator = (data[SAVED_BY_CREATOR_KEY] as Record<string, string[]>) || {};
        const ids = byCreator[creatorId];
        setBookmarkedPosts(new Set(Array.isArray(ids) ? ids : []));
      })
      .catch(() => {});
  }, [fanId, creatorId]);

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
                    <img src={avatar} alt="" className="fan-feed-avatar-img" />
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

              {post.mediaUrl && (
                <div className="fan-feed-post-media">
                  {post.mediaType === "video" ? (
                    <video src={post.mediaUrl} controls className="fan-feed-media-video" />
                  ) : (
                    <img src={post.mediaUrl} alt="" className="fan-feed-media-image" />
                  )}
                </div>
              )}

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

              {!(feedSettings?.hideComments || post.hideComments) && expandedComments.has(post.id) && (
                <div className="fan-feed-comments">
                  <div className="fan-feed-comment-input-wrap">
                    <input
                      type="text"
                      className="fan-feed-comment-input"
                      placeholder="Write a comment..."
                    />
                    <button
                      type="button"
                      className="fan-feed-comment-send"
                      style={{ backgroundColor: primary }}
                    >
                      Send
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
    </div>
  );
};

/** Saved posts view for a fan: loads savedPostIdsByCreator[creatorId] and fetches each post */
interface FanMemberSavedProps {
  creatorId: string;
  displayName: string;
  avatar?: string;
  primary?: string;
  feedSettings?: FanFeedVisibilitySettings;
  fanId: string | undefined;
}

export const FanMemberSaved: React.FC<FanMemberSavedProps> = ({
  creatorId,
  displayName,
  avatar,
  primary = "#6366f1",
  feedSettings,
  fanId,
}) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [unsavingId, setUnsavingId] = useState<string | null>(null);

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
          ids.map((postId) => getDoc(doc(db!, "creators", creatorId, "posts", postId)))
        ).then((docs) => {
          if (cancelled) return;
          const list: Post[] = [];
          docs.forEach((d, i) => {
            if (!d.exists() || !ids[i]) return;
            const data = d.data();
            const status = (data.status as string) || "published";
            if (status === "draft") return;
            const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date((data.createdAt as string) || Date.now());
            const mediaUrls = data.mediaUrls as string[] | undefined;
            const mediaTypes = data.mediaTypes as ("image" | "video")[] | undefined;
            const comments = (data.comments as { text: string }[]) || [];
            list.push({
              id: ids[i],
              content: (data.body as string) || (data.content as string) || "",
              mediaUrl: mediaUrls?.[0] || (data.mediaUrl as string) || "",
              mediaType: mediaTypes?.[0] || (data.mediaType as "image" | "video"),
              createdAt,
              likesCount: typeof data.likeCount === "number" ? data.likeCount : (data.likesCount as number) || 0,
              commentsCount: comments.length || (data.commentsCount as number) || 0,
              pinned: !!(data.pinned as boolean),
              hideComments: data.hideComments as boolean | undefined,
              hideLikes: data.hideLikes as boolean | undefined,
              hideLikeCounts: data.hideLikeCounts as boolean | undefined,
            });
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
                    <img src={avatar} alt="" className="fan-feed-avatar-img" />
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
              {post.mediaUrl && (
                <div className="fan-feed-post-media">
                  {post.mediaType === "video" ? (
                    <video src={post.mediaUrl} controls className="fan-feed-media-video" />
                  ) : (
                    <img src={post.mediaUrl} alt="" className="fan-feed-media-image" />
                  )}
                </div>
              )}
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
            </article>
          ))
        )}
      </div>
    </div>
  );
};
