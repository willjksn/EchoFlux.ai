import React from "react";
import { audioMimeTypeHintForUrl } from "../src/lib/mediaUrlInfer";

type Props = {
  src: string;
  className?: string;
};

/**
 * DM / chat voice attachment with explicit MIME hint (fixes silent playback on some browsers).
 */
export const DmAudioPlayer: React.FC<Props> = ({ src, className = "" }) => {
  const type = audioMimeTypeHintForUrl(src);
  return (
    <audio controls playsInline preload="metadata" className={className}>
      <source src={src} type={type} />
      <source src={src} />
    </audio>
  );
};
