import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { WitmeShowcaseCreator } from "../../src/lib/witmeShowcase";
import { parseObjectPositionPercentPair } from "../../src/lib/objectPositionPan";
import { witmeCoerceShowcaseImageUrl } from "../../src/lib/witmePublicAssets";

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
  /** Applied with transform scale; origin follows focal `objectPosition` (%). Default 1. */
  mediaScale?: number;
  objectFit?: "cover" | "contain";
  /** Intrinsic: scales with media aspect ratio (no fixed crop box / side bars). Fill: absolute cover layer. */
  layout?: "fill" | "intrinsic";
  /** Passed to `<img>` when `mediaKind` is image (e.g. eager for above-the-fold hero). */
  imgLoading?: "eager" | "lazy";
  /** Fires once when the image or first video frame is ready (hero collage frame styling). */
  onReady?: () => void;
}> = ({
  url,
  mediaKind,
  alt,
  className,
  objectPosition,
  mediaScale = 1,
  objectFit = "cover",
  layout = "fill",
  imgLoading = "lazy",
  onReady,
}) => {
  const u = witmeCoerceShowcaseImageUrl(url.trim());
  const fitStyle = showcaseObjectStyle(objectPosition, objectFit);
  const [ox, oy] = parseObjectPositionPercentPair(objectPosition);
  const scale = typeof mediaScale === "number" && Number.isFinite(mediaScale) ? mediaScale : 1;
  const mediaTransformStyle: React.CSSProperties = {
    transform: `scale(${scale})`,
    transformOrigin: `${ox}% ${oy}%`,
  };
  const intrinsicClass =
    layout === "intrinsic"
      ? "block h-auto w-auto max-h-[min(70vh,36rem)] max-w-full mx-auto"
      : "";
  const mergedClass = `${intrinsicClass} ${className}`.trim();
  const intrinsicStyle: React.CSSProperties =
    layout === "intrinsic" ? { width: "auto", height: "auto", maxWidth: "100%" } : {};
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const readyOnce = useRef(false);
  /** Eager hero images: avoid an empty tile flash before `onLoad` (lazy tiles still fade in). */
  const [imgVisible, setImgVisible] = useState(() => imgLoading === "eager");

  const fireReady = useCallback(() => {
    if (readyOnce.current) return;
    readyOnce.current = true;
    if (mediaKind !== "video") setImgVisible(true);
    onReady?.();
  }, [mediaKind, onReady]);

  useEffect(() => {
    readyOnce.current = false;
    setImgVisible(imgLoading === "eager");
  }, [u, mediaKind, imgLoading]);

  useEffect(() => {
    if (mediaKind !== "video" || !u) return;
    const v = videoRef.current;
    if (!v) return;
    const onData = () => fireReady();
    if (v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) onData();
    else v.addEventListener("loadeddata", onData, { once: true });
    return () => v.removeEventListener("loadeddata", onData);
  }, [mediaKind, u, fireReady]);

  useLayoutEffect(() => {
    if (mediaKind === "video" || !u) return;
    const el = imgRef.current;
    if (el?.complete && el.naturalHeight > 0) fireReady();
  }, [mediaKind, u, fireReady]);

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
        key={u}
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
  /** Short fade: long fades read as a second “load” after any stale-frame flash. */
  const imgOpacityClass = `transition-opacity duration-[180ms] ease-out ${imgVisible ? "opacity-100" : "opacity-0"}`;

  return (
    <img
      key={u}
      ref={imgRef}
      src={u}
      alt={alt}
      className={`${imgOpacityClass} ${mergedClass}`.trim()}
      style={{ ...fitStyle, ...mediaTransformStyle, ...intrinsicStyle }}
      loading={imgLoading}
      decoding="async"
      fetchPriority={imgLoading === "eager" ? "high" : undefined}
      onLoad={() => fireReady()}
    />
  );
};
