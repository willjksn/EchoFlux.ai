import React from "react";
import { useRecordingElapsed, formatRecordingClock } from "../src/hooks/useRecordingElapsed";

type Props = {
  active: boolean;
  className?: string;
};

/** Live MM:SS while recording (voice or video). */
export const RecordingDurationLabel: React.FC<Props> = ({ active, className = "" }) => {
  const sec = useRecordingElapsed(active);
  if (!active) return null;
  return (
    <span
      className={`inline-flex items-center rounded-md bg-black/70 text-white px-2 py-0.5 text-sm font-mono font-semibold tabular-nums ${className}`}
      aria-live="polite"
    >
      {formatRecordingClock(sec)}
    </span>
  );
};
