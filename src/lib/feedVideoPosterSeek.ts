/**
 * Seek slightly past the start so <video> shows a poster frame (not black).
 * Mobile Safari may fire `loadedmetadata` more than once; repeating seeks interrupts playback.
 */
export function tryFeedVideoPosterSeekOnce(
  video: HTMLVideoElement,
  doneRef: { current: boolean }
): void {
  if (doneRef.current) return;
  if (!video.paused) return;
  try {
    const d = video.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    const t = Math.min(0.1, d * 0.02);
    if (video.currentTime >= t - 0.015) {
      doneRef.current = true;
      return;
    }
    video.currentTime = t;
    doneRef.current = true;
  } catch {
    /* seek may fail on some streams */
  }
}
