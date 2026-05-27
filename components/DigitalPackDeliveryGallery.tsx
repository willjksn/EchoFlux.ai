import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { DigitalPackMediaItem } from "../types";
import { inferIsVideoFromUrl } from "../src/lib/mediaUrlInfer";
import { StorefrontGuardedImage } from "../src/lib/storefrontMediaGuard";

type Props = {
  items: DigitalPackMediaItem[];
  imageGuardProps?: React.ImgHTMLAttributes<HTMLImageElement>;
  videoGuardProps?: React.VideoHTMLAttributes<HTMLVideoElement>;
  audioGuardProps?: React.AudioHTMLAttributes<HTMLAudioElement>;
};

/** Fan/creator view of delivered digital pack items — constrained size with expand on images. */
export const DigitalPackDeliveryGallery: React.FC<Props> = ({
  items,
  imageGuardProps,
  videoGuardProps,
  audioGuardProps,
}) => {
  const [expandedImageUrl, setExpandedImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!expandedImageUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpandedImageUrl(null);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [expandedImageUrl]);

  if (!items.length) return null;

  return (
    <>
      <div className="digital-pack-delivery-gallery">
        {items.map((item, idx) => {
          const key = `${item.type}-${item.url}-${idx}`;
          if (item.type === "image") {
            return (
              <div key={key} className="digital-pack-delivery-item digital-pack-delivery-item--image">
                <StorefrontGuardedImage
                  src={item.url}
                  className="digital-pack-delivery-item__img"
                  fit="contain"
                  position="top center"
                />
                <button
                  type="button"
                  className="digital-pack-delivery-item__expand"
                  aria-label="Expand image"
                  onClick={() => setExpandedImageUrl(item.url)}
                >
                  Expand
                </button>
              </div>
            );
          }
          if (item.type === "video" || (item.url && inferIsVideoFromUrl(item.url))) {
            return (
              <div key={key} className="digital-pack-delivery-item digital-pack-delivery-item--video">
                <video
                  src={item.url}
                  controls
                  playsInline
                  preload="metadata"
                  className="digital-pack-delivery-item__video"
                  {...videoGuardProps}
                />
              </div>
            );
          }
          if (item.type === "audio") {
            return (
              <div key={key} className="digital-pack-delivery-item digital-pack-delivery-item--audio">
                <audio
                  src={item.url}
                  controls
                  preload="metadata"
                  className="digital-pack-delivery-item__audio"
                  {...audioGuardProps}
                />
              </div>
            );
          }
          return null;
        })}
      </div>
      {expandedImageUrl && typeof document !== "undefined"
        ? createPortal(
            <div
              className="digital-pack-delivery-lightbox"
              role="dialog"
              aria-modal="true"
              aria-label="Expanded image"
              onClick={(e) => {
                if (e.target === e.currentTarget) setExpandedImageUrl(null);
              }}
            >
              <button
                type="button"
                className="digital-pack-delivery-lightbox__close"
                onClick={() => setExpandedImageUrl(null)}
              >
                Close
              </button>
              <div className="digital-pack-delivery-lightbox__stage">
                <StorefrontGuardedImage
                  src={expandedImageUrl}
                  className="digital-pack-delivery-lightbox__img"
                  fit="contain"
                  position="center"
                />
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
};
