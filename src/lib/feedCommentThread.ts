import { feedCommentAuthorLabel } from "./feedCommentLabel";

/** Stored on post `comments[]` in Firestore. */
export type FeedStoredComment = {
  username?: string;
  author?: string;
  text: string;
  hidden?: boolean;
  authorId?: string;
  isCreatorReply?: boolean;
  authorPhotoURL?: string;
  /** Fan uid when creator replies directly to that fan's comment */
  replyToAuthorId?: string;
  /** Display label e.g. @jax for UI */
  replyToAuthor?: string;
};

export type FeedCommentEntry = {
  comment: FeedStoredComment;
  /** Index in the full post comments array (including hidden) */
  index: number;
};

export type FeedCommentThreadNode = {
  comment: FeedStoredComment;
  index: number;
  replies: Array<{ comment: FeedStoredComment; index: number }>;
};

export function isFeedCommentFromCreator(c: FeedStoredComment, creatorId?: string): boolean {
  if (c.isCreatorReply) return true;
  return !!creatorId && typeof c.authorId === "string" && c.authorId.length > 0 && c.authorId === creatorId;
}

/** Visible comments with stable Firestore indices for reply insertion. */
export function visibleFeedCommentEntries(comments: FeedStoredComment[]): FeedCommentEntry[] {
  return comments
    .map((comment, index) => ({ comment, index }))
    .filter(({ comment }) => !comment.hidden);
}

export function buildFeedCommentThreads(
  entries: FeedCommentEntry[],
  creatorId?: string
): FeedCommentThreadNode[] {
  const roots: FeedCommentThreadNode[] = [];
  const fanRootByAuthorId = new Map<string, FeedCommentThreadNode>();

  for (const { comment, index } of entries) {
    const creator = isFeedCommentFromCreator(comment, creatorId);
    const replyTo = comment.replyToAuthorId?.trim();

    if (creator && replyTo && fanRootByAuthorId.has(replyTo)) {
      fanRootByAuthorId.get(replyTo)!.replies.push({ comment, index });
      continue;
    }

    if (creator && !replyTo) {
      const lastRoot = roots[roots.length - 1];
      if (lastRoot && !isFeedCommentFromCreator(lastRoot.comment, creatorId)) {
        lastRoot.replies.push({ comment, index });
        continue;
      }
      roots.push({ comment, index, replies: [] });
      continue;
    }

    const node: FeedCommentThreadNode = { comment, index, replies: [] };
    roots.push(node);
    if (comment.authorId?.trim() && !creator) {
      fanRootByAuthorId.set(comment.authorId.trim(), node);
    }
  }

  return roots;
}

export function fanCommentReplyTarget(
  comment: FeedStoredComment,
  index: number,
  creatorId?: string
): { index: number; authorId: string; authorLabel: string } | null {
  if (!creatorId) return null;
  if (isFeedCommentFromCreator(comment, creatorId)) return null;
  const authorId = comment.authorId?.trim();
  if (!authorId || authorId === creatorId) return null;
  return {
    index,
    authorId,
    authorLabel: feedCommentAuthorLabel(comment),
  };
}

export function insertCreatorCommentInThread(
  existing: FeedStoredComment[],
  newComment: FeedStoredComment,
  insertAfterIndex: number | null | undefined
): FeedStoredComment[] {
  if (insertAfterIndex == null || insertAfterIndex < 0 || insertAfterIndex >= existing.length) {
    return [...existing, newComment];
  }
  return [...existing.slice(0, insertAfterIndex + 1), newComment, ...existing.slice(insertAfterIndex + 1)];
}

export function countCreatorRepliesToFan(comments: FeedStoredComment[], fanAuthorId: string): number {
  const hasExplicitTargeting = comments.some(
    (c) => c.isCreatorReply && typeof c.replyToAuthorId === "string" && c.replyToAuthorId.length > 0
  );
  if (hasExplicitTargeting) {
    return comments.filter((c) => c.isCreatorReply && c.replyToAuthorId === fanAuthorId).length;
  }
  let count = 0;
  for (let i = 0; i < comments.length; i++) {
    if (comments[i].isCreatorReply && i > 0 && comments[i - 1].authorId === fanAuthorId) count++;
  }
  return count;
}
