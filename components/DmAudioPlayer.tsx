import React, { useCallback, useEffect, useRef, useState } from "react";
import { audioMimeTypeHintForUrl } from "../src/lib/mediaUrlInfer";

type Props = {
  src: string;
  className?: string;
  /** Instagram-style voice note (mic + compact pill: play · scrub · mute). Default keeps native `<audio controls>`. */
  variant?: "default" | "voiceNote";
};

function formatVoiceTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * DM / chat voice attachment with explicit MIME hint (fixes silent playback on some browsers).
 */
export const DmAudioPlayer: React.FC<Props> = ({ src, className = "", variant = "default" }) => {
  const type = audioMimeTypeHintForUrl(src);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.muted = muted;
  }, [muted]);

  useEffect(() => {
    setCurrent(0);
    setDuration(0);
    setPlaying(false);
    const el = audioRef.current;
    if (el && variant === "voiceNote") el.load();
  }, [src, variant]);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, []);

  const onScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = audioRef.current;
    if (!el || !duration) return;
    const next = (Number(e.target.value) / 1000) * duration;
    el.currentTime = next;
    setCurrent(next);
  };

  if (variant === "default") {
    return (
      <audio controls playsInline preload="metadata" className={className}>
        <source src={src} type={type} />
        <source src={src} />
      </audio>
    );
  }

  const progressPct = duration > 0 ? Math.min(1000, Math.round((current / duration) * 1000)) : 0;

  return (
    <div className={`fh-dm-voice-note ${className}`.trim()}>
      <div className="fh-dm-voice-note__mic" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
          <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </div>
      <div className="fh-dm-voice-note__pill">
        <button
          type="button"
          className="fh-dm-voice-note__play"
          onClick={togglePlay}
          aria-label={playing ? "Pause voice message" : "Play voice message"}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12" aria-hidden>
              <rect x="5" y="4" width="4" height="16" rx="1" />
              <rect x="15" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <div
          className="fh-dm-voice-note__progress-wrap"
          title={`${formatVoiceTime(current)} / ${formatVoiceTime(duration)}`}
          style={{ "--fh-voice-pct": `${progressPct / 10}%` } as React.CSSProperties}
        >
          <input
            type="range"
            min={0}
            max={1000}
            value={progressPct}
            onChange={onScrub}
            className="fh-dm-voice-note__range"
            aria-label="Playback position"
          />
        </div>
        <button
          type="button"
          className="fh-dm-voice-note__icon"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? (
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden>
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden>
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
            </svg>
          )}
        </button>
      </div>
      <audio
        ref={audioRef}
        preload="metadata"
        playsInline
        className="fh-dm-voice-note__audio"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        onTimeUpdate={() => {
          const el = audioRef.current;
          if (el) setCurrent(el.currentTime);
        }}
        onLoadedMetadata={() => {
          const el = audioRef.current;
          if (el && Number.isFinite(el.duration)) setDuration(el.duration);
        }}
        onDurationChange={() => {
          const el = audioRef.current;
          if (el && Number.isFinite(el.duration)) setDuration(el.duration);
        }}
      >
        <source src={src} type={type} />
        <source src={src} />
      </audio>
    </div>
  );
};
