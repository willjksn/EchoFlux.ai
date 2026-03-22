import { useEffect, useState } from "react";

/** Monotonic seconds while `active` is true; resets when inactive. */
export function useRecordingElapsed(active: boolean): number {
  const [sec, setSec] = useState(0);

  useEffect(() => {
    if (!active) {
      setSec(0);
      return;
    }
    const t0 = Date.now();
    setSec(0);
    const id = window.setInterval(() => {
      setSec(Math.floor((Date.now() - t0) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, [active]);

  return sec;
}

export function formatRecordingClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
