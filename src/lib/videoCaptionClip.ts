/**
 * Prepares remote video URLs for /api/generateCaptions: max duration guard,
 * and client-side first-60s clip when the browser can record (fallback when
 * server has no Cloudinary trim).
 */

export const VIDEO_CAPTION_CLIP_SECONDS = 60;
/** Reject longer sources so we do not download huge files or wait forever. */
export const VIDEO_CAPTION_MAX_DURATION_SEC = 600;

export async function getVideoDurationSec(src: string): Promise<number | null> {
  const video = document.createElement("video");
  video.preload = "metadata";
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.src = src;
  return new Promise((resolve) => {
    const finish = (d: number | null) => {
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {
        /* ignore */
      }
      resolve(d);
    };
    video.onloadedmetadata = () => {
      const d = video.duration;
      if (Number.isFinite(d) && d > 0) finish(d);
      else finish(null);
    };
    video.onerror = () => finish(null);
    setTimeout(() => finish(null), 25_000);
  });
}

function pickRecorderMime(): string {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ];
  for (const t of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "video/webm";
}

/**
 * Records the first `maxSeconds` of playback via captureStream (Chrome/Edge/Firefox).
 * Returns null if unsupported or recording fails (caller falls back to full URL).
 */
export async function clipVideoUrlToBlob(
  src: string,
  maxSeconds: number
): Promise<{ blob: Blob; mimeType: string } | null> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.src = src;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("load"));
    setTimeout(() => reject(new Error("timeout")), 30_000);
  });

  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) return null;

  const recordLenSec = Math.min(maxSeconds, duration);
  const cap = (video as HTMLVideoElement & { captureStream?: (fps?: number) => MediaStream }).captureStream;
  if (typeof cap !== "function") return null;

  await video.play().catch(() => undefined);
  const stream = cap.call(video, 30);
  if (!stream) return null;

  const preferred = pickRecorderMime();
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType: preferred });
  } catch {
    try {
      recorder = new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      video.pause();
      return null;
    }
  }

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    recorder.onstop = () => done();
    recorder.onerror = () => done();
    try {
      recorder.start(250);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      video.pause();
      done();
      return;
    }
    const ms = Math.ceil(recordLenSec * 1000) + 500;
    const tid = window.setTimeout(() => {
      try {
        recorder.stop();
      } catch {
        done();
      }
    }, ms);
    video.addEventListener(
      "ended",
      () => {
        window.clearTimeout(tid);
        try {
          recorder.stop();
        } catch {
          done();
        }
      },
      { once: true }
    );
  });

  video.pause();
  stream.getTracks().forEach((t) => t.stop());
  try {
    video.removeAttribute("src");
    video.load();
  } catch {
    /* ignore */
  }

  if (chunks.length === 0) return null;
  const blob = new Blob(chunks, { type: recorder.mimeType || preferred });
  return { blob, mimeType: blob.type || preferred };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

export type VideoCaptionTrimResult =
  | { ok: false; error: string }
  | { ok: true; mediaUrl: string; videoDurationSec?: number }
  | { ok: true; mediaData: { data: string; mimeType: string }; videoDurationSec?: number };

/**
 * When `isVideo` and URL is http(s), probes duration; rejects if over max;
 * if longer than clip seconds, tries to build a small inline clip for the API.
 */
export async function maybeTrimVideoForCaption(
  mediaUrl: string | null | undefined,
  isVideo: boolean
): Promise<VideoCaptionTrimResult> {
  if (!mediaUrl || !isVideo) {
    return { ok: true, mediaUrl: mediaUrl || "" };
  }
  const http = mediaUrl.startsWith("https://") || mediaUrl.startsWith("http://");
  const blob = mediaUrl.startsWith("blob:");
  if (!http && !blob) {
    return { ok: true, mediaUrl };
  }

  const dur = await getVideoDurationSec(mediaUrl);
  if (dur != null && dur > VIDEO_CAPTION_MAX_DURATION_SEC) {
    return {
      ok: false,
      error: `This video is too long (${Math.ceil(dur / 60)} min). Use a clip under ${VIDEO_CAPTION_MAX_DURATION_SEC / 60} minutes for AI captions, or trim it first.`,
    };
  }

  if (dur == null || dur <= VIDEO_CAPTION_CLIP_SECONDS + 0.75) {
    return {
      ok: true,
      mediaUrl,
      ...(dur != null && dur > 0 ? { videoDurationSec: dur } : {}),
    };
  }

  const clipped = await clipVideoUrlToBlob(mediaUrl, VIDEO_CAPTION_CLIP_SECONDS);
  if (!clipped) {
    return { ok: true, mediaUrl, videoDurationSec: dur };
  }

  const data = await blobToBase64(clipped.blob);
  const dataSizeMB = (data.length * 3) / 4 / 1024 / 1024;
  if (dataSizeMB > 18) {
    return { ok: true, mediaUrl, videoDurationSec: dur };
  }

  return {
    ok: true,
    mediaData: { data, mimeType: clipped.mimeType },
    videoDurationSec: dur,
  };
}
