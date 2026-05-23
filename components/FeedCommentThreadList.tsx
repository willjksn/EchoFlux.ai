import React from "react";
import { FeedCommentListAvatar } from "./FeedCommentAvatar";
import { feedCommentAuthorLabel } from "../src/lib/feedCommentLabel";
import { renderTextWithCustomEmoji, type SjHeartEmojiAccessContext } from "../src/lib/customEmoji";
import {
  buildFeedCommentThreads,
  isFeedCommentFromCreator,
  type FeedCommentEntry,
  type FeedStoredComment,
} from "../src/lib/feedCommentThread";

type ReplyTarget = { index: number; authorId: string; authorLabel: string };

export function FeedCommentThreadList({
  entries,
  creatorId,
  sjHeartEmojiCtx,
  allowCreatorReplyToFan,
  onReplyToFan,
}: {
  entries: FeedCommentEntry[];
  creatorId?: string;
  sjHeartEmojiCtx: SjHeartEmojiAccessContext;
  allowCreatorReplyToFan?: boolean;
  onReplyToFan?: (target: ReplyTarget) => void;
}) {
  const threads = buildFeedCommentThreads(entries, creatorId);

  const renderRow = (
    c: FeedStoredComment,
    index: number,
    opts: { isReply?: boolean; showReplyAction?: boolean }
  ) => {
    const authorName = feedCommentAuthorLabel(c);
    const isCreatorComment = isFeedCommentFromCreator(c, creatorId);
    const replyToLabel = c.replyToAuthor?.trim();

    return (
      <div
        className={`feed-comments-modal-item${opts.isReply ? " feed-comments-modal-item--reply" : ""}`}
        key={`${index}-${c.text.slice(0, 12)}`}
      >
        <FeedCommentListAvatar authorLabel={authorName} photoURL={c.authorPhotoURL} />
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
            {replyToLabel ? (
              <span className="feed-comments-modal-reply-to">
                Replying to <span className="feed-comments-modal-reply-to-target">{replyToLabel}</span>
              </span>
            ) : null}
            <span className="feed-comments-modal-comment-body">{renderTextWithCustomEmoji(c.text, sjHeartEmojiCtx)}</span>
          </p>
          {opts.showReplyAction && onReplyToFan ? (
            <button
              type="button"
              className="feed-comments-modal-reply-btn"
              onClick={() => {
                const authorId = c.authorId?.trim();
                if (!authorId) return;
                onReplyToFan({ index, authorId, authorLabel: authorName });
              }}
            >
              Reply
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <>
      {threads.map((thread) => {
        const rootIsCreator = isFeedCommentFromCreator(thread.comment, creatorId);
        return (
        <div className="feed-comments-modal-thread" key={`thread-${thread.index}`}>
          {renderRow(thread.comment, thread.index, {
            showReplyAction:
              !!allowCreatorReplyToFan &&
              !!onReplyToFan &&
              !!thread.comment.authorId?.trim() &&
              !rootIsCreator,
          })}
          {thread.replies.map((r) => (
            <div key={`reply-${r.index}`}>{renderRow(r.comment, r.index, { isReply: true })}</div>
          ))}
        </div>
        );
      })}
    </>
  );
}
