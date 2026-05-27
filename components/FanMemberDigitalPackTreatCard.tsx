import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { TreatProduct } from "../types";
import { DigitalPackStorePreview } from "./DigitalPackStorePreview";
import { XMarkIcon } from "./icons/UIIcons";

type GuardImg = React.ImgHTMLAttributes<HTMLImageElement>;
type GuardVideo = React.VideoHTMLAttributes<HTMLVideoElement>;
type GuardAudio = React.AudioHTMLAttributes<HTMLAudioElement>;

export type FanMemberDigitalPackTreatCardProps = {
  product: TreatProduct;
  categoryLine: string | null;
  owned: boolean;
  soldOut: boolean;
  isPurchasing: boolean;
  buyLabel: string;
  priceLabel: string;
  remainingLabel: string | null;
  primaryColor: string;
  onPurchase: () => void;
  imageGuardProps?: GuardImg;
  videoGuardProps?: GuardVideo;
  audioGuardProps?: GuardAudio;
};

/**
 * Member store: bundle matches other treat cards (cover + title + price).
 * Tap the card to open a modal with the full pack preview grid.
 */
export const FanMemberDigitalPackTreatCard: React.FC<FanMemberDigitalPackTreatCardProps> = ({
  product,
  categoryLine,
  owned,
  soldOut,
  isPurchasing,
  buyLabel,
  priceLabel,
  remainingLabel,
  primaryColor,
  onPurchase,
  imageGuardProps,
  videoGuardProps,
  audioGuardProps,
}) => {
  const [detailOpen, setDetailOpen] = useState(false);

  const closeDetail = useCallback(() => setDetailOpen(false), []);

  useEffect(() => {
    if (!detailOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDetail();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [detailOpen, closeDetail]);

  const shellBorder = `color-mix(in srgb, ${primaryColor} 28%, #e5e7eb)`;

  return (
    <>
      <div className="fan-member-treat-card fan-member-treat-card--pack-collapsed">
        {categoryLine ? <p className="fan-member-treat-type">{categoryLine}</p> : null}
        <h3 className="fan-member-treat-title">{product.title}</h3>
        <button
          type="button"
          className="fan-member-treat-pack-open-link"
          onClick={() => setDetailOpen(true)}
        >
          View pack contents
        </button>
        {product.description ? (
          <p className="fan-member-treat-desc fan-member-treat-desc--clamped">{product.description}</p>
        ) : null}
        <p className="fan-member-treat-price">{priceLabel}</p>
        {remainingLabel ? (
          <p className="fan-member-treat-desc" style={{ marginTop: "-0.2rem" }}>
            {remainingLabel}
          </p>
        ) : null}
        <div className="fan-member-treat-action">
          {soldOut ? (
            <span className="fan-member-treat-owned">Sold out</span>
          ) : (
            <button
              type="button"
              disabled={isPurchasing}
              onClick={onPurchase}
              className="fan-member-treat-buy"
              style={{ backgroundColor: primaryColor }}
            >
              {buyLabel}
            </button>
          )}
        </div>
      </div>

      {detailOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fan-member-digital-pack-modal-backdrop"
              role="presentation"
              onClick={closeDetail}
            >
              <div
                className="fan-member-digital-pack-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby={`fan-pack-modal-title-${product.id}`}
                style={{ borderColor: shellBorder }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="fan-member-digital-pack-modal__accent"
                  style={{ backgroundColor: primaryColor }}
                  aria-hidden
                />
                <button
                  type="button"
                  className="fan-member-digital-pack-modal__close"
                  onClick={closeDetail}
                  aria-label="Close pack preview"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
                {categoryLine ? (
                  <p className="fan-member-treat-type fan-member-digital-pack-modal__type">{categoryLine}</p>
                ) : null}
                <h2
                  id={`fan-pack-modal-title-${product.id}`}
                  className="fan-member-digital-pack-modal__title"
                >
                  {product.title}
                </h2>
                <DigitalPackStorePreview
                  product={product}
                  owned={owned}
                  fanFacing
                  imageGuardProps={imageGuardProps}
                  videoGuardProps={videoGuardProps}
                  audioGuardProps={audioGuardProps}
                />
                {product.description ? (
                  <p className="fan-member-treat-desc">{product.description}</p>
                ) : null}
                <p className="fan-member-treat-price fan-member-digital-pack-modal__price">{priceLabel}</p>
                {remainingLabel ? <p className="fan-member-treat-desc">{remainingLabel}</p> : null}
                <div className="fan-member-digital-pack-modal__actions">
                  {soldOut ? (
                    <span className="fan-member-treat-owned">Sold out</span>
                  ) : (
                    <button
                      type="button"
                      disabled={isPurchasing}
                      onClick={() => {
                        onPurchase();
                        closeDetail();
                      }}
                      className="fan-member-treat-buy fan-member-digital-pack-modal__buy"
                      style={{ backgroundColor: primaryColor }}
                    >
                      {buyLabel}
                    </button>
                  )}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
};
