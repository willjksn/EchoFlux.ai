import React from "react";

/** Props for native `<img>` on creator-side previews (context menu + drag). */
export const storefrontImageDownloadGuardProps = {
  draggable: false as const,
  onContextMenu: (e: React.MouseEvent<HTMLImageElement>) => e.preventDefault(),
};

export const storefrontVideoDownloadGuardProps = {
  controlsList: "nodownload noplaybackrate noremoteplayback" as const,
  disablePictureInPicture: true,
  onContextMenu: (e: React.MouseEvent<HTMLVideoElement>) => e.preventDefault(),
};

export const storefrontAudioDownloadGuardProps = {
  controlsList: "nodownload noplaybackrate noremoteplayback" as const,
  onContextMenu: (e: React.MouseEvent<HTMLAudioElement>) => e.preventDefault(),
};

type GuardedImageProps = {
  src: string;
  className?: string;
  fit?: "contain" | "cover";
  position?: string;
  /** e.g. locked pack teaser blur */
  extraStyle?: React.CSSProperties;
};

/**
 * Fan-facing image: `background-image` on a div avoids browser “visual search” /
 * magnify / edit-image hover menus that attach to `<img>` (e.g. Edge).
 */
export const StorefrontGuardedImage: React.FC<GuardedImageProps> = ({
  src,
  className = "",
  fit = "contain",
  position = "top center",
  extraStyle,
}) => (
  <div
    className={`storefront-guarded-image${className ? ` ${className}` : ""}`}
    role="img"
    aria-hidden
    style={{
      backgroundImage: `url("${src.replace(/"/g, '\\"')}")`,
      backgroundSize: fit,
      backgroundPosition: position,
      ...extraStyle,
    }}
  />
);
