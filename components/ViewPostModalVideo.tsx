import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";

/**
 * View-post modal video: autoplay + loop (muted by default) + scrubber + play/pause + mute.
 * Styles: `feed-comments-modal-video-*` in `styles/stormij-fanhub.css`.
 */
export function ViewPostModalVideo({
  src,
  videoKey,
  accentHex,
}: {
  src: string;
  videoKey: string;
  /** Theme primary (hex) for scrubber fill */
  accentHex?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [dragging, setDragging] = useState(false);

  const cleanSrc = useMemo(() => {
    const base = src.split("#")[0]?.trim() || src;
    return base || src;
  }, [src]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
  }, [muted]);

  const seekFromClientX = useCallback((clientX: number) => {
    const track = trackRef.current;
    const v = videoRef.current;
    if (!track || !v) return;
    const d = v.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    const rect = track.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    v.currentTime = x * d;
    setCurrent(x * d);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => seekFromClientX(e.clientX);
    const onUp = (e: PointerEvent) => {
      setDragging(false);
      try {
        trackRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging, seekFromClientX]);

  const pct =
    duration > 0 && Number.isFinite(duration) ? Math.min(100, Math.max(0, (current / duration) * 100)) : 0;
  const showScrubber = Number.isFinite(duration) && duration > 0;
  const scrubFill =
    accentHex && /^#?[0-9a-fA-F]{6}$/.test(accentHex.replace("#", ""))
      ? accentHex.startsWith("#")
        ? accentHex
        : `#${accentHex}`
      : "rgba(255, 255, 255, 0.92)";

  const onMeta = () => {
    const v = videoRef.current;
    if (v && Number.isFinite(v.duration) && v.duration > 0) setDuration(v.duration);
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    setPlaying(true);
    void v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [videoKey, cleanSrc]);

  return (
    <div className="feed-comments-modal-video-shell">
      <video
        ref={videoRef}
        key={videoKey}
        src={cleanSrc}
        className="feed-comments-modal-media feed-comments-modal-media-video feed-comments-modal-media-video--loop"
        autoPlay
        loop
        muted={muted}
        playsInline
        preload="auto"
        onLoadedMetadata={onMeta}
        onDurationChange={onMeta}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => {
          if (dragging) return;
          const v = videoRef.current;
          if (v) setCurrent(v.currentTime);
        }}
      />
      <div className="feed-comments-modal-video-bottom-bar">
        <div className="feed-comments-modal-video-controls">
          <button
            type="button"
            className="feed-comments-modal-video-ctrl-btn"
            aria-label={playing ? "Pause video" : "Play video"}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const v = videoRef.current;
              if (!v) return;
              if (v.paused) void v.play();
              else v.pause();
            }}
          >
            {playing ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="feed-comments-modal-video-ctrl-btn"
            aria-label={muted ? "Unmute video" : "Mute video"}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMuted((m) => !m);
            }}
          >
            {muted ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
              </svg>
            )}
          </button>
        </div>
        {showScrubber ? (
          <div
            className="feed-comments-modal-video-scrubber"
            role="slider"
            tabIndex={0}
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(current)}
            aria-label="Video scrubber"
            onKeyDown={(e) => {
              const v = videoRef.current;
              if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return;
              const step = Math.max(3, v.duration * 0.05);
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                v.currentTime = Math.max(0, v.currentTime - step);
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                v.currentTime = Math.min(v.duration, v.currentTime + step);
              }
            }}
          >
            <div
              ref={trackRef}
              className="feed-comments-modal-video-scrub-track"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                  trackRef.current?.setPointerCapture(e.pointerId);
                } catch {
                  /* ignore */
                }
                setDragging(true);
                seekFromClientX(e.clientX);
              }}
            >
              <div
                className="feed-comments-modal-video-scrub-fill"
                style={{ width: `${pct}%`, backgroundColor: scrubFill }}
              />
              <div className="feed-comments-modal-video-scrub-thumb" style={{ left: `${pct}%` }} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
