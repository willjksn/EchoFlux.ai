import type { CSSProperties } from "react";

/**
 * Circular avatar crop: object-fit + object-position only.
 * Do not set width/height % here — that breaks fixed-size slots (e.g. header w-7).
 */
export function getAvatarCropStyle(avatarObjectPosition?: string | null): CSSProperties {
  const pos =
    avatarObjectPosition != null && String(avatarObjectPosition).trim() !== ""
      ? String(avatarObjectPosition).trim()
      : "center";
  return {
    objectFit: "cover",
    objectPosition: pos,
  };
}
