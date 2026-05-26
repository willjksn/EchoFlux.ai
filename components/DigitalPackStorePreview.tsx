import React, { useMemo, useState } from "react";
import type { TreatProduct } from "../types";
import {
  DIGITAL_PACK_LOCKED_BLUR_PX,
  defaultPackPreviewIndices,
  derivePackCoverImageUrl,
  isDigitalPackProductType,
  isPackMediaSlotPreview,
  isProtectedPackMediaUrl,
  normalizePackPreviewIndices,
  parseDigitalPackMediaItems,
} from "../src/lib/digitalPackProduct";
import { mediaPreviewBlurFilterStyle } from "../src/lib/feedMediaPreviewBlur";

type Props = {
  product: TreatProduct;
  /** Fan already purchased — show full pack sharp in store card. */
  owned?: boolean;
  imageGuardProps?: React.ImgHTMLAttributes<HTMLImageElement>;
  videoGuardProps?: React.VideoHTMLAttributes<HTMLVideoElement>;
  audioGuardProps?: React.AudioHTMLAttributes<HTMLAudioElement>;
  compact?: boolean;
};

/** Store card: sharp preview image(s), rest blurred or locked until purchase. */
export const DigitalPackStorePreview: React.FC<Props> = ({
  product,
  owned = false,
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

  const cover = derivePackCoverImageUrl(items, previewIndices, product.imageUrl);
  const blurStyle = owned ? undefined : mediaPreviewBlurFilterStyle(DIGITAL_PACK_LOCKED_BLUR_PX);
  const salesUrl = product.salesVoiceTeaserUrl?.trim();
  const gridItems = items.slice(0, compact ? 6 : 8);

  return (
    <div
      className={`digital-pack-store-preview${compact ? " digital-pack-store-preview--compact" : ""}`}
      style={{ marginTop: compact ? "0.35rem" : "0.5rem" }}
    >
      {cover ? (
        <img
          src={cover}
          alt=""
          loading="lazy"
          className="digital-pack-store-cover"
          style={{
            width: "100%",
            borderRadius: 10,
            marginBottom: gridItems.length || salesUrl ? "0.5rem" : 0,
            maxHeight: compact ? 140 : 220,
            objectFit: "cover",
          }}
          {...imageGuardProps}
        />
      ) : null}
      {gridItems.length > 0 ? (
        <div
          className="digital-pack-teaser-grid"
          style={{
            display: "grid",
            gridTemplateColumns: gridItems.length === 1 ? "1fr" : "repeat(2, 1fr)",
            gap: "0.35rem",
            marginBottom: salesUrl ? "0.5rem" : 0,
          }}
        >
          {gridItems.map((item, idx) => {
            const isPreview = isPackMediaSlotPreview(idx, previewIndices, owned);
            const locked = !owned && isProtectedPackMediaUrl(item.url);
            return (
              <div
                key={`${item.url}-${idx}`}
                className={`digital-pack-slot${locked ? " digital-pack-slot--locked" : ""}`}
              >
                {locked ? (
                  <div className="digital-pack-slot__locked">
                    <span className="digital-pack-slot__locked-label">
                      {item.type === "video" ? "Video" : item.type === "audio" ? "Voice" : "Photo"} in pack
                    </span>
                  </div>
                ) : null}
                {!locked && item.type === "image" ? (
                  <img
                    src={item.url}
                    alt=""
                    loading="lazy"
                    style={{
                      width: "100%",
                      aspectRatio: "1",
                      objectFit: "cover",
                      ...(isPreview ? {} : blurStyle),
                    }}
                    {...imageGuardProps}
                  />
                ) : null}
                {!locked && item.type === "video" ? (
                  <video
                    src={item.url}
                    muted
                    playsInline
                    preload="metadata"
                    style={{
                      width: "100%",
                      aspectRatio: "1",
                      objectFit: "cover",
                      ...(isPreview ? {} : blurStyle),
                    }}
                    {...videoGuardProps}
                  />
                ) : null}
                {!locked && item.type === "audio" ? (
                  <div
                    className="digital-pack-slot__audio"
                    style={isPreview ? undefined : blurStyle}
                  >
                    <span>Voice in pack</span>
                  </div>
                ) : null}
                {!owned && !isPreview && !locked ? (
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
          <p style={{ fontSize: "0.75rem", margin: "0 0 0.25rem", opacity: 0.85 }}>Sales teaser</p>
          <audio
            src={salesUrl}
            controls
            preload="metadata"
            style={{ width: "100%" }}
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
