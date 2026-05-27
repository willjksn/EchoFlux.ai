import React, { useMemo, useState } from "react";
import type { TreatProduct } from "../types";
import {
  DIGITAL_PACK_LOCKED_BLUR_PX,
  defaultPackPreviewIndices,
  isDigitalPackProductType,
  isPackMediaSlotPreview,
  isProtectedPackMediaUrl,
  normalizePackPreviewIndices,
  parseDigitalPackMediaItems,
  type DigitalPackMediaItem,
} from "../src/lib/digitalPackProduct";
import { mediaPreviewBlurFilterStyle } from "../src/lib/feedMediaPreviewBlur";
import { StorefrontGuardedImage } from "../src/lib/storefrontMediaGuard";

type Props = {
  product: TreatProduct;
  /** Fan already purchased — show full pack sharp in store card. */
  owned?: boolean;
  /** Fan/member storefront — use guarded media (no native img hover menus). */
  fanFacing?: boolean;
  /** `modal` = full pack popup (contain media, no cropped faces). */
  layout?: "card" | "modal";
  imageGuardProps?: React.ImgHTMLAttributes<HTMLImageElement>;
  videoGuardProps?: React.VideoHTMLAttributes<HTMLVideoElement>;
  audioGuardProps?: React.AudioHTMLAttributes<HTMLAudioElement>;
  compact?: boolean;
};

function isStreamableMediaUrl(url: string | undefined): boolean {
  const u = typeof url === "string" ? url.trim() : "";
  return u.startsWith("http://") || u.startsWith("https://") || u.startsWith("blob:");
}

/** Before purchase, fans never get playable pack video/audio URLs (avoids black empty `<video>` boxes). */
function packSlotShowsLockedPlaceholder(
  item: DigitalPackMediaItem,
  owned: boolean,
  isPreview: boolean,
  fanFacing: boolean
): boolean {
  if (owned) return false;
  if (fanFacing && (item.type === "video" || item.type === "audio")) return true;
  if (isProtectedPackMediaUrl(item.url)) return true;
  if (!isPreview && (item.type === "video" || item.type === "audio")) return true;
  return false;
}

function PackPreviewImage({
  src,
  fanFacing,
  imageGuardProps,
  className,
  fit = "contain",
  position = "top center",
}: {
  src: string;
  fanFacing: boolean;
  imageGuardProps?: React.ImgHTMLAttributes<HTMLImageElement>;
  className: string;
  fit?: "contain" | "cover";
  position?: string;
}) {
  if (fanFacing) {
    return <StorefrontGuardedImage src={src} className={className} fit={fit} position={position} />;
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className={className}
      {...imageGuardProps}
    />
  );
}

/** Store card: sharp preview image(s) in hero; other slots blurred or locked until purchase. */
export const DigitalPackStorePreview: React.FC<Props> = ({
  product,
  owned = false,
  fanFacing = false,
  layout = "card",
  imageGuardProps,
  videoGuardProps,
  audioGuardProps,
  compact = false,
}) => {
  const [, setSalesPlaying] = useState(false);
  const items = parseDigitalPackMediaItems(
    isDigitalPackProductType(product.type) ? product.fulfillmentItems : undefined
  );
  const previewIndices = useMemo(
    () =>
      normalizePackPreviewIndices(
        product.previewMediaIndices ?? defaultPackPreviewIndices(items),
        items
      ),
    [product.previewMediaIndices, items]
  );

  if (!isDigitalPackProductType(product.type) || items.length === 0) return null;

  const blurStyle = owned ? undefined : mediaPreviewBlurFilterStyle(DIGITAL_PACK_LOCKED_BLUR_PX);
  const salesUrl = product.salesVoiceTeaserUrl?.trim();
  const previewSet = useMemo(() => new Set(previewIndices), [previewIndices]);

  /** Sharp image slots shown in the hero row (not repeated in the grid below). */
  const heroPreviewSlots = useMemo(() => {
    if (owned) return [];
    return previewIndices
      .map((idx) => ({ idx, item: items[idx] }))
      .filter(
        ({ item }) =>
          item?.type === "image" && item.url && !isProtectedPackMediaUrl(item.url)
      );
  }, [owned, previewIndices, items]);

  const showHero = heroPreviewSlots.length > 0;

  /** Grid shows only non-preview slots so the hero image is not duplicated. */
  const gridSlots = useMemo(() => {
    const mapped = items.map((item, idx) => ({ item, idx }));
    const filtered = showHero
      ? mapped.filter(({ idx }) => !previewSet.has(idx))
      : mapped;
    return filtered.slice(0, compact ? 6 : 8);
  }, [items, showHero, previewSet, compact]);

  const gridCols =
    gridSlots.length <= 1 ? "1fr" : gridSlots.length === 2 ? "repeat(2, 1fr)" : "repeat(2, 1fr)";
  const isModal = layout === "modal";
  const imageFit: "contain" | "cover" = isModal || !fanFacing ? "contain" : "cover";
  const imagePosition = isModal || fanFacing ? "top center" : "center";

  return (
    <div
      className={`digital-pack-store-preview${compact ? " digital-pack-store-preview--compact" : ""}${
        isModal ? " digital-pack-store-preview--modal" : ""
      }${fanFacing && !isModal ? " digital-pack-store-preview--fan-card" : ""}`}
    >
      {showHero ? (
        <div
          className={`digital-pack-store-cover-row${heroPreviewSlots.length > 1 ? " digital-pack-store-cover-row--multi" : ""}`}
        >
          {heroPreviewSlots.map(({ item, idx }) => (
            <PackPreviewImage
              key={`hero-${idx}`}
              src={item.url}
              fanFacing={fanFacing}
              imageGuardProps={imageGuardProps}
              className="digital-pack-store-cover"
              fit={imageFit}
              position={imagePosition}
            />
          ))}
        </div>
      ) : null}
      {gridSlots.length > 0 ? (
        <div
          className="digital-pack-teaser-grid"
          style={{
            gridTemplateColumns: gridCols,
          }}
        >
          {gridSlots.map(({ item, idx }) => {
            const isPreview = isPackMediaSlotPreview(idx, previewIndices, owned);
            const lockedPlaceholder = packSlotShowsLockedPlaceholder(item, owned, isPreview, fanFacing);
            const blurredImage =
              !owned && !isPreview && item.type === "image" && item.url && !isProtectedPackMediaUrl(item.url);
            const showPlayableVideo =
              item.type === "video" && isStreamableMediaUrl(item.url) && (owned || (!fanFacing && isPreview));
            const ownedMissingStreamableMedia =
              owned &&
              (item.type === "video" || item.type === "audio") &&
              !isStreamableMediaUrl(item.url);
            return (
              <div
                key={`${item.url}-${idx}`}
                className={`digital-pack-slot${lockedPlaceholder ? " digital-pack-slot--locked" : ""}${
                  blurredImage ? " digital-pack-slot--blurred" : ""
                }`}
              >
                {lockedPlaceholder || ownedMissingStreamableMedia ? (
                  <div
                    className={`digital-pack-slot__locked${
                      item.type === "video" ? " digital-pack-slot__locked--video" : ""
                    }${item.type === "audio" ? " digital-pack-slot__locked--audio" : ""}`}
                  >
                    <span className="digital-pack-slot__locked-label">
                      {ownedMissingStreamableMedia
                        ? item.type === "video"
                          ? "Loading video…"
                          : "Loading audio…"
                        : item.type === "video"
                          ? "Video in pack"
                          : item.type === "audio"
                            ? "Voice in pack"
                            : "Photo in pack"}
                    </span>
                  </div>
                ) : null}
                {!lockedPlaceholder && item.type === "image" ? (
                  fanFacing ? (
                    <StorefrontGuardedImage
                      src={item.url}
                      className="digital-pack-slot__media digital-pack-slot__media--image"
                      fit={imageFit}
                      position={imagePosition}
                      extraStyle={blurredImage ? blurStyle : undefined}
                    />
                  ) : (
                    <img
                      src={item.url}
                      alt=""
                      loading="lazy"
                      className="digital-pack-slot__media digital-pack-slot__media--image"
                      style={isPreview ? undefined : blurStyle}
                      {...imageGuardProps}
                    />
                  )
                ) : null}
                {showPlayableVideo ? (
                  <video
                    src={item.url}
                    controls={owned || fanFacing}
                    muted={!owned && !fanFacing}
                    playsInline
                    preload="metadata"
                    className="digital-pack-slot__media digital-pack-slot__media--video"
                    style={isPreview && !owned ? blurStyle : undefined}
                    {...videoGuardProps}
                  />
                ) : null}
                {!lockedPlaceholder && item.type === "audio" ? (
                  <div
                    className="digital-pack-slot__audio digital-pack-slot__media"
                    style={isPreview ? undefined : blurStyle}
                  >
                    <span>Voice in pack</span>
                  </div>
                ) : null}
                {!owned && !isPreview && !lockedPlaceholder ? (
                  <span className="digital-pack-slot__badge" aria-hidden>
                    Unlock
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
      {salesUrl ? (
        <div className="digital-pack-sales-voice">
          <p className="digital-pack-sales-voice__label">Sales teaser</p>
          <audio
            src={salesUrl}
            controls
            preload="metadata"
            onPlay={() => setSalesPlaying(true)}
            onPause={() => setSalesPlaying(false)}
            onEnded={() => setSalesPlaying(false)}
            {...audioGuardProps}
          />
        </div>
      ) : null}
    </div>
  );
};
