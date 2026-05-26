import React from "react";
import type { DigitalPackMediaItem } from "../types";

type Props = {
  items: DigitalPackMediaItem[];
  imageGuardProps?: React.ImgHTMLAttributes<HTMLImageElement>;
  videoGuardProps?: React.VideoHTMLAttributes<HTMLVideoElement>;
  audioGuardProps?: React.AudioHTMLAttributes<HTMLAudioElement>;
};

/** Fan/creator view of delivered digital pack items. */
export const DigitalPackDeliveryGallery: React.FC<Props> = ({
  items,
  imageGuardProps,
  videoGuardProps,
  audioGuardProps,
}) => {
  if (!items.length) return null;
  return (
    <div className="digital-pack-delivery-gallery" style={{ marginTop: "0.6rem", display: "grid", gap: "0.75rem" }}>
      {items.map((item, idx) => (
        <div key={`${item.url}-${idx}`} className="digital-pack-delivery-item">
          {item.type === "image" ? (
            <img
              src={item.url}
              alt=""
              loading="lazy"
              style={{ width: "100%", borderRadius: 10 }}
              {...imageGuardProps}
            />
          ) : null}
          {item.type === "video" ? (
            <video
              src={item.url}
              controls
              playsInline
              preload="metadata"
              style={{ width: "100%", borderRadius: 10 }}
              {...videoGuardProps}
            />
          ) : null}
          {item.type === "audio" ? (
            <audio src={item.url} controls preload="metadata" style={{ width: "100%" }} {...audioGuardProps} />
          ) : null}
        </div>
      ))}
    </div>
  );
};
