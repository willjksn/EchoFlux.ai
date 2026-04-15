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

/** Fan feed: computed access for CTA */
export type LiveStreamPromoFanAccess =
  | "sign_in"
  | "checkout"
  | "included"
  | "free";

/**
 * Feed card attachment for `postKind: live_stream_promo`.
 * Creator dashboard uses `variant="creator"` (non-interactive). Fans use `variant="fan"` with `fanAccess`.
 */
export const LiveStreamPromoBanner: React.FC<{
  promo: LiveStreamPromoOnPost;
  accentHex?: string;
  variant?: "creator" | "fan";
  fanAccess?: LiveStreamPromoFanAccess;
  ticketLoading?: boolean;
  onGetTicket?: () => void | Promise<void>;
  onSignIn?: () => void;
}> = ({
  promo,
  accentHex,
  variant = "fan",
  fanAccess = "free",
  ticketLoading = false,
  onGetTicket,
  onSignIn,
}) => {
  const title = promo.title?.trim() || "Live stream";
  const border = accentHex && /^#[0-9A-Fa-f]{6}$/.test(accentHex) ? accentHex : "#7c3aed";

  const cta = (() => {
    if (variant === "creator") {
      return (
        <button type="button" className="live-stream-promo-banner__cta" disabled>
          Preview — fans check out here
        </button>
      );
    }
    switch (fanAccess) {
      case "sign_in":
        return (
          <button type="button" className="live-stream-promo-banner__cta live-stream-promo-banner__cta--active" onClick={() => onSignIn?.()}>
            Sign in for a ticket
          </button>
        );
      case "checkout":
        return (
          <button
            type="button"
            className="live-stream-promo-banner__cta live-stream-promo-banner__cta--active"
            disabled={ticketLoading}
            onClick={() => void onGetTicket?.()}
          >
            {ticketLoading ? "Redirecting…" : "Get ticket"}
          </button>
        );
      case "included":
        return (
          <button type="button" className="live-stream-promo-banner__cta live-stream-promo-banner__cta--muted" disabled>
            You&apos;re in — player coming soon
          </button>
        );
      case "free":
      default:
        return (
          <button type="button" className="live-stream-promo-banner__cta live-stream-promo-banner__cta--muted" disabled>
            Join — player coming soon
          </button>
        );
    }
  })();

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
      {cta}
    </div>
  );
};
