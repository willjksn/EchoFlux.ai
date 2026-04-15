import React from "react";
import type { LiveStreamPromoOnPost } from "../types";

function formatStreamStart(iso?: string): string {
  if (!iso?.trim()) return "Time TBA";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Time TBA";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ticketLabel(promo: LiveStreamPromoOnPost): string {
  if (promo.ticketCents <= 0) {
    if (promo.freeForSubscribers) return "Free — subscribers included";
    return "Free to join";
  }
  return `$${(promo.ticketCents / 100).toFixed(2)} ticket`;
}

/**
 * Feed card attachment for `postKind: live_stream_promo`.
 * Join / checkout wiring comes in a later iteration.
 */
export const LiveStreamPromoBanner: React.FC<{
  promo: LiveStreamPromoOnPost;
  /** Creator theme / fan accent (hex) */
  accentHex?: string;
}> = ({ promo, accentHex }) => {
  const title = promo.title?.trim() || "Live stream";
  const border = accentHex && /^#[0-9A-Fa-f]{6}$/.test(accentHex) ? accentHex : "#7c3aed";

  return (
    <div
      className="live-stream-promo-banner"
      role="region"
      aria-label="Live stream"
      style={
        {
          "--live-stream-promo-accent": border,
        } as React.CSSProperties
      }
    >
      <div className="live-stream-promo-banner__badge">Live stream</div>
      <p className="live-stream-promo-banner__title">{title}</p>
      <p className="live-stream-promo-banner__meta">
        <span>{formatStreamStart(promo.scheduledStart)}</span>
        <span className="live-stream-promo-banner__dot" aria-hidden>
          ·
        </span>
        <span>{ticketLabel(promo)}</span>
      </p>
      <button type="button" className="live-stream-promo-banner__cta" disabled>
        Join / ticket — coming soon
      </button>
    </div>
  );
};
