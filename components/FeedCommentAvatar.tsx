import React, { useState } from "react";
import { feedCommentAuthorInitial } from "../src/lib/feedCommentLabel";

/** Comment row in fan/creator View post modal (matches `.feed-comments-modal-item-avatar` sizing). */
export function FeedCommentListAvatar(props: {
  /** Same label shown next to badge (often `feedCommentAuthorLabel`). */
  authorLabel: string;
  photoURL?: string;
}) {
  const { authorLabel, photoURL } = props;
  const [failed, setFailed] = useState(false);
  const urlRaw = typeof photoURL === "string" ? photoURL.trim() : "";
  const url = urlRaw && !failed ? urlRaw : "";
  const initial = feedCommentAuthorInitial(authorLabel);

  return (
    <div
      className={`feed-comments-modal-item-avatar${url ? " feed-comments-modal-item-avatar--photo" : ""}`}
      aria-hidden
    >
      {url ? (
        <img
          src={url}
          alt=""
          className="feed-comments-modal-item-avatar-img"
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}
