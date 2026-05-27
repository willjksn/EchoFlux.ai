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

/**
 * Prefer codecs that mux **audio** when the stream has a mic track.
 * Otherwise Chrome often picks `vp8` only → video files with no sound.
 */
export function pickVideoMimeTypeForRecorderForStream(stream: MediaStream): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const hasAudio = stream.getAudioTracks().length > 0;
  const withAudioPreferred = [
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,vorbis",
    "video/webm",
    "video/mp4",
  ] as const;
  const videoOnlyFallback = ["video/webm;codecs=vp8", "video/webm;codecs=vp9"] as const;
  const order = hasAudio
    ? [...withAudioPreferred, ...videoOnlyFallback]
    : [...videoOnlyFallback, ...withAudioPreferred];
  for (const t of order) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

export function createAudioMediaRecorder(stream: MediaStream): MediaRecorder {
  const mimeType = pickAudioMimeTypeForRecorder();
  return mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
}

export function createVideoMediaRecorder(stream: MediaStream): MediaRecorder {
  const mimeType = pickVideoMimeTypeForRecorderForStream(stream);
  const opts: MediaRecorderOptions = {};
  if (mimeType) opts.mimeType = mimeType;
  if (mimeType?.includes("webm")) {
    opts.videoBitsPerSecond = 2_500_000;
    if (stream.getAudioTracks().length > 0) {
      opts.audioBitsPerSecond = 128_000;
    }
  }
  return Object.keys(opts).length ? new MediaRecorder(stream, opts) : new MediaRecorder(stream);
}

/**
 * Wait until camera track is live (polls readyState).
 * The old unmute-only listener could hang until timeout and feel like a permission failure.
 */
export async function waitUntilVideoTrackLive(stream: MediaStream, timeoutMs = 2500): Promise<void> {
  const track = stream.getVideoTracks()[0];
  if (!track) return;
  const start = Date.now();
  while (track.readyState !== "live" && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 40));
  }
}

export async function waitUntilAudioTrackLive(stream: MediaStream, timeoutMs = 2500): Promise<void> {
  const track = stream.getAudioTracks()[0];
  if (!track) return;
  track.enabled = true;
  const start = Date.now();
  while (track.readyState !== "live" && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 40));
  }
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
export type MicrophoneAccessErrorCode =
  | "SECURE_CONTEXT"
  | "UNAVAILABLE"
  | "DENIED"
  | "NO_TRACK";

function micError(code: MicrophoneAccessErrorCode, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** User-facing message for mic failures from {@link requestMicrophoneStream}. */
export function microphoneAccessErrorMessage(err: unknown): string {
  const code = (err as { code?: MicrophoneAccessErrorCode })?.code;
  if (code === "SECURE_CONTEXT") return "Microphone requires HTTPS or localhost.";
  if (code === "UNAVAILABLE") return "Microphone is not available in this browser.";
  if (code === "DENIED") return "Microphone access was denied. Allow it in your browser settings.";
  if (code === "NO_TRACK") return "No microphone track detected. Check your device.";
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      return "Microphone access denied. Click Allow when your browser asks.";
    }
    if (err.name === "NotFoundError") return "No microphone found. Connect a mic and try again.";
  }
  return err instanceof Error ? err.message : "Could not access microphone.";
}

function mapGetUserMediaError(err: unknown): Error {
  if ((err as { code?: MicrophoneAccessErrorCode })?.code) {
    return err instanceof Error ? err : micError("UNAVAILABLE", "Microphone error");
  }
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      return micError("DENIED", err.message);
    }
    if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      return micError("NO_TRACK", err.message);
    }
    if (err.name === "NotReadableError" || err.name === "TrackStartError") {
      return micError("NO_TRACK", "Microphone is in use by another app.");
    }
  }
  return err instanceof Error ? err : micError("UNAVAILABLE", "Could not access microphone.");
}

/**
 * Open the mic for recording. Call synchronously from a click handler (do not await other work first).
 * getUserMedia is started before any await so the browser permission prompt keeps user activation.
 */
export function requestMicrophoneStream(): Promise<MediaStream> {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return Promise.reject(micError("SECURE_CONTEXT", "Secure context required"));
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(micError("UNAVAILABLE", "getUserMedia missing"));
  }

  const openMic = () =>
    navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

  const streamPromise = openMic().catch((err) => {
    if (err instanceof DOMException && err.name === "OverconstrainedError") {
      return navigator.mediaDevices.getUserMedia({ audio: true });
    }
    throw err;
  });

  return streamPromise
    .catch(mapGetUserMediaError)
    .then(async (stream) => {
      for (const t of stream.getAudioTracks()) {
        t.enabled = true;
      }
      await waitUntilAudioTrackLive(stream, 4000);
      if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        throw micError("NO_TRACK", "No audio track");
      }
      return stream;
    });
}

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
