/**
 * Browser MediaRecorder helpers — consistent mime types, timeslices, and safe stop
 * (avoids silent/empty clips on some Chromium/Safari combinations).
 */

export const AUDIO_RECORDER_TIMESLICE_MS = 250;
export const VIDEO_RECORDER_TIMESLICE_MS = 250;

const AUDIO_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/aac",
] as const;

/** Prefer VP8 first — wider playback support than VP9 across devices. */
const VIDEO_CANDIDATES = [
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8",
  "video/webm;codecs=vp9",
  "video/webm",
  "video/mp4",
] as const;

export function pickAudioMimeTypeForRecorder(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of AUDIO_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

export function pickVideoMimeTypeForRecorder(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of VIDEO_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

export function createAudioMediaRecorder(stream: MediaStream): MediaRecorder {
  const mimeType = pickAudioMimeTypeForRecorder();
  return mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
}

export function createVideoMediaRecorder(stream: MediaStream): MediaRecorder {
  const mimeType = pickVideoMimeTypeForRecorder();
  const opts: MediaRecorderOptions = {};
  if (mimeType) opts.mimeType = mimeType;
  if (mimeType?.includes("webm")) {
    opts.videoBitsPerSecond = 2_500_000;
    opts.audioBitsPerSecond = 128_000;
  }
  return Object.keys(opts).length ? new MediaRecorder(stream, opts) : new MediaRecorder(stream);
}

/** Wait until camera track is producing frames (reduces black / empty WebM). */
export function waitUntilVideoTrackLive(stream: MediaStream, timeoutMs = 8000): Promise<void> {
  const track = stream.getVideoTracks()[0];
  if (!track) return Promise.resolve();
  if (track.readyState === "live") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(done, timeoutMs);
    track.addEventListener("unmute", done, { once: true });
    track.addEventListener("ended", done, { once: true });
  });
}

/** Prefer recorder-reported type after start (most accurate). */
export function effectiveBlobType(recorder: MediaRecorder, requested?: string): string {
  const fromRec = (recorder.mimeType || "").trim();
  if (fromRec) return fromRec;
  if (requested) return requested;
  return "audio/webm";
}

export function fileExtensionForAudioMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mp4") || m.includes("aac") || m.includes("mpeg")) return "m4a";
  return "webm";
}

export function fileExtensionForVideoMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("mp4")) return "mp4";
  if (m.includes("webm")) return "webm";
  return "webm";
}

/**
 * Safari sometimes uses a video/mp4 container for audio-only MediaRecorder output.
 * Force an audio/* type so players and our upload classifier treat it as voice.
 */
export function normalizeVoiceRecordingFileType(mime: string): string {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("audio/")) return mime || "audio/webm";
  if (m.startsWith("video/") && m.includes("mp4")) return "audio/mp4";
  return mime || "audio/webm";
}

/** Request final chunk then stop (when supported). */
export function stopMediaRecorderSafe(rec: MediaRecorder | null): void {
  if (!rec || rec.state === "inactive") return;
  try {
    if (typeof rec.requestData === "function") {
      rec.requestData();
    }
  } catch {
    /* ignore */
  }
  try {
    rec.stop();
  } catch {
    /* ignore */
  }
}
