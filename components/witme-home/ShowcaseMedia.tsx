import React, { useEffect, useRef } from "react";
import type { WitmeShowcaseCreator } from "../../src/lib/witmeShowcase";

const VIDEO_LOOP_FADE_MS = 380;

const showcaseObjectStyle = (
  objectPosition?: string,
  fit: "cover" | "contain" = "cover",
): React.CSSProperties => {
  const pos =
    objectPosition != null && String(objectPosition).trim() !== ""
      ? String(objectPosition).trim()
      : "50% 50%";
  return { objectFit: fit, objectPosition: pos };
};

export const ShowcaseMedia: React.FC<{
  url: string;
  mediaKind: WitmeShowcaseCreator["mediaKind"];
  alt: string;
  className: string;
  objectPosition?: string;
  objectFit?: "cover" | "contain";
  /** Intrinsic: scales with media aspect ratio (no fixed crop box / side bars). Fill: absolute cover layer. */
  layout?: "fill" | "intrinsic";
}> = ({ url, mediaKind, alt, className, objectPosition, objectFit = "cover", layout = "fill" }) => {
  const u = url.trim();
  const fitStyle = showcaseObjectStyle(objectPosition, objectFit);
  const intrinsicClass =
    layout === "intrinsic"
      ? "block h-auto w-auto max-h-[min(70vh,36rem)] max-w-full mx-auto"
      : "";
  const mergedClass = `${intrinsicClass} ${className}`.trim();
  const intrinsicStyle: React.CSSProperties =
    layout === "intrinsic" ? { width: "auto", height: "auto", maxWidth: "100%" } : {};
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || mediaKind !== "video" || !u) return;

    let fadeTimer = 0;
    const handleEnded = () => {
      v.style.opacity = "0";
      fadeTimer = window.setTimeout(() => {
        const onSeeked = () => {
          v.style.opacity = "1";
        };
        v.addEventListener("seeked", onSeeked, { once: true });
        v.currentTime = 0;
        void v.play().catch(() => {
          v.removeEventListener("seeked", onSeeked);
          v.style.opacity = "1";
        });
      }, VIDEO_LOOP_FADE_MS);
    };

    v.addEventListener("ended", handleEnded);
    return () => {
      v.removeEventListener("ended", handleEnded);
      window.clearTimeout(fadeTimer);
      v.style.opacity = "1";
    };
  }, [mediaKind, u]);

  if (!u) {
    return <div className={`${className} bg-white/10`} aria-hidden />;
  }
  if (mediaKind === "video") {
    return (
      <video
        ref={videoRef}
        src={u}
        className={`${className} transition-opacity ease-in-out`}
        style={{
          ...fitStyle,
          transitionDuration: `${VIDEO_LOOP_FADE_MS}ms`,
        }}
        muted
        playsInline
        autoPlay
        preload="metadata"
        aria-label={alt}
      />
    );
  }
  return <img src={u} alt={alt} className={mergedClass} style={{ ...fitStyle, ...intrinsicStyle }} loading="lazy" />;
};
