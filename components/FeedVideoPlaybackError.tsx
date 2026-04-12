import React from "react";
import { inferQuickTimeStyleVideoFromUrl } from "../src/lib/mediaUrlInfer";

export function FeedVideoPlaybackErrorOverlay({ videoSrc }: { videoSrc: string }) {
  const movHint = inferQuickTimeStyleVideoFromUrl(videoSrc);
  const openHref = videoSrc.split("#")[0]?.trim() || videoSrc;
  return (
    <div className="feed-video-playback-error" role="alert">
      <p className="feed-video-playback-error-title">Can’t play this video in this browser.</p>
      {movHint ? (
        <p className="feed-video-playback-error-hint">
          .mov and some phone exports often need to be re-exported as MP4 (H.264 + AAC) for the web. Re-upload after
          converting.
        </p>
      ) : (
        <p className="feed-video-playback-error-hint">
          The file may use a format your browser does not support. Try opening it in a new tab or re-export as MP4.
        </p>
      )}
      <a href={openHref} target="_blank" rel="noopener noreferrer" className="feed-video-playback-error-link">
        Open video in new tab
      </a>
    </div>
  );
}
