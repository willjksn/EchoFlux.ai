import React from "react";
import type { LiveStreamEventStatus, LiveStreamPromoOnPost } from "../types";

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

/** Creator dashboard feed card: host actions without opening the composer first */
export type LiveStreamCreatorBroadcastProps = {
  streamId: string;
  onGoLive: (streamId: string) => void;
  onEndStream: (streamId: string) => void;
  onOpenBroadcast: (streamId: string) => void;
  dailyBusy: false | "goLive" | "endLive";
};

/**
 * Feed card attachment for `postKind: live_stream_promo`.
 * Creator dashboard uses `variant="creator"` with optional `creatorFanPreviewUrl` (opens fan preview).
 * Pass `creatorBroadcast` for **Go live** / **End stream** / **Open broadcast** on the card; otherwise
 * `onOpenStreamControls` opens the composer where those controls also exist.
 */
export const LiveStreamPromoBanner: React.FC<{
  promo: LiveStreamPromoOnPost;
  accentHex?: string;
  variant?: "creator" | "fan";
  /** Creator dashboard: opens public member preview in a new tab (`?preview=member`). */
  creatorFanPreviewUrl?: string;
  /** Creator feed: inline host controls (Daily). Prefer over navigating to composer for go-live. */
  creatorBroadcast?: LiveStreamCreatorBroadcastProps;
  /** Creator dashboard: opens edit composer (Fan Hub) — e.g. edit post copy or when stream ended. */
  onOpenStreamControls?: () => void;
  fanAccess?: LiveStreamPromoFanAccess;
  ticketLoading?: boolean;
  watchLoading?: boolean;
  onGetTicket?: () => void | Promise<void>;
  onSignIn?: () => void;
  /** When stream is `live` and fan may watch, opens Daily Prebuilt */
  onWatchLive?: () => void | Promise<void>;
}> = ({
  promo,
  accentHex,
  variant = "fan",
  creatorFanPreviewUrl,
  creatorBroadcast,
  onOpenStreamControls,
  fanAccess = "free",
  ticketLoading = false,
  watchLoading = false,
  onGetTicket,
  onSignIn,
  onWatchLive,
}) => {
  const title = promo.title?.trim() || "Live stream";
  const border = accentHex && /^#[0-9A-Fa-f]{6}$/.test(accentHex) ? accentHex : "#7c3aed";
  const streamStatus = promo.streamStatus as LiveStreamEventStatus | undefined;
  const streamIsLive = streamStatus === "live";
  const streamEnded = streamStatus === "ended";

  const cta = (() => {
    if (variant === "creator") {
      const stLabel = streamIsLive ? "Live now" : streamEnded ? "Ended" : "Scheduled";
      const busy = !!creatorBroadcast?.dailyBusy;
      const canUseInlineHost =
        creatorBroadcast &&
        creatorBroadcast.streamId === promo.streamId &&
        !streamEnded;
      const steps =
        streamIsLive ? (
          <>
            Fans tap <strong>Watch live</strong>. Your camera and mic are in the host window — tap <strong>Open broadcast (host)</strong> if you closed it.
          </>
        ) : streamEnded ? (
          <>This stream has ended. Use <strong>Edit stream post</strong> if you need to change the text.</>
        ) : (
          <>
            Start with <strong>Go live</strong>, then <strong>Open broadcast (host)</strong> when Daily asks for camera and mic.
          </>
        );
      const primaryLabel = streamEnded ? "Edit stream post" : streamIsLive ? "Manage broadcast" : "Open stream controls";
      return (
        <div className="live-stream-promo-banner__creator-panel">
          {canUseInlineHost ? (
            <div className="live-stream-promo-banner__creator-host-actions flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || streamIsLive}
                className="live-stream-promo-banner__cta live-stream-promo-banner__cta--active text-xs px-3 py-2 rounded-lg"
                onClick={() => creatorBroadcast.onGoLive(creatorBroadcast.streamId)}
              >
                {creatorBroadcast.dailyBusy === "goLive" ? "Starting…" : "Go live"}
              </button>
              <button
                type="button"
                disabled={busy || !streamIsLive}
                className="live-stream-promo-banner__cta bg-gray-700 text-white hover:bg-gray-600 text-xs px-3 py-2 rounded-lg disabled:opacity-40"
                onClick={() => creatorBroadcast.onEndStream(creatorBroadcast.streamId)}
              >
                {creatorBroadcast.dailyBusy === "endLive" ? "Ending…" : "End stream"}
              </button>
              <button
                type="button"
                disabled={busy || !streamIsLive}
                className="live-stream-promo-banner__cta live-stream-promo-banner__cta--secondary-outline text-xs px-3 py-2 rounded-lg"
                onClick={() => creatorBroadcast.onOpenBroadcast(creatorBroadcast.streamId)}
              >
                Open broadcast (host)
              </button>
            </div>
          ) : onOpenStreamControls && !canUseInlineHost && !streamEnded ? (
            <button type="button" className="live-stream-promo-banner__cta live-stream-promo-banner__cta--active" onClick={onOpenStreamControls}>
              {streamIsLive ? "Manage broadcast" : "Open stream controls"}
            </button>
          ) : null}
          {streamEnded && onOpenStreamControls ? (
            <button type="button" className="live-stream-promo-banner__cta live-stream-promo-banner__cta--active" onClick={onOpenStreamControls}>
              {primaryLabel}
            </button>
          ) : null}
          <p className="live-stream-promo-banner__creator-status" role="status">
            <span className="live-stream-promo-banner__status-pill">{stLabel}</span>
            <span className="live-stream-promo-banner__creator-steps">{steps}</span>
          </p>
          <div className="live-stream-promo-banner__creator-secondary">
            {creatorFanPreviewUrl ? (
              <button
                type="button"
                className="live-stream-promo-banner__cta live-stream-promo-banner__cta--secondary-outline"
                onClick={() => {
                  const el = document.createElement("a");
                  el.href = creatorFanPreviewUrl;
                  el.target = "_blank";
                  el.rel = "noopener noreferrer";
                  document.body.appendChild(el);
                  el.click();
                  el.remove();
                }}
              >
                Preview as fan
              </button>
            ) : (
              <p className="live-stream-promo-banner__creator-hint">
                Save your witme handle on <strong>My Page</strong> to open a fan preview in a new tab.
              </p>
            )}
          </div>
        </div>
      );
    }
    if (streamEnded) {
      return (
        <button type="button" className="live-stream-promo-banner__cta live-stream-promo-banner__cta--muted" disabled>
          Stream ended
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
        if (streamIsLive) {
          return (
            <button
              type="button"
              className="live-stream-promo-banner__cta live-stream-promo-banner__cta--active"
              disabled={watchLoading}
              onClick={() => void onWatchLive?.()}
            >
              {watchLoading ? "Opening…" : "Watch live"}
            </button>
          );
        }
        return (
          <button type="button" className="live-stream-promo-banner__cta live-stream-promo-banner__cta--muted" disabled>
            You&apos;re in — Watch live appears when the show starts
          </button>
        );
      case "free":
      default:
        if (streamIsLive) {
          return (
            <button
              type="button"
              className="live-stream-promo-banner__cta live-stream-promo-banner__cta--active"
              disabled={watchLoading}
              onClick={() => void onWatchLive?.()}
            >
              {watchLoading ? "Opening…" : "Watch live"}
            </button>
          );
        }
        return (
          <button type="button" className="live-stream-promo-banner__cta live-stream-promo-banner__cta--muted" disabled>
            Not live yet — check back at showtime
          </button>
        );
    }
  })();

  const fanJoinHint =
    variant === "fan" && !streamIsLive && !streamEnded ? (
      <p className="live-stream-promo-banner__fan-join-hint">
        {fanAccess === "checkout" || fanAccess === "sign_in"
          ? "After you have access, Watch live appears here when the creator starts the stream."
          : "Watch live unlocks here when the creator taps Go live — usually at or after the time above."}
      </p>
    ) : null;

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
      <div className="live-stream-promo-banner__badges">
        <span className="live-stream-promo-banner__badge">Live stream</span>
        {variant === "fan" && streamIsLive ? (
          <span className="live-stream-promo-banner__badge live-stream-promo-banner__badge--on-air">On air</span>
        ) : null}
        {promo.creatorTestOnly ? (
          <span
            className="live-stream-promo-banner__badge live-stream-promo-banner__badge--test"
            title="This promo is hidden from the fan feed until you turn this off."
          >
            Test
          </span>
        ) : null}
      </div>
      <p className="live-stream-promo-banner__title">{title}</p>
      <p className="live-stream-promo-banner__meta">
        <span>{formatStreamStart(promo.scheduledStart)}</span>
        <span className="live-stream-promo-banner__dot" aria-hidden>
          ·
        </span>
        <span>{ticketLabel(promo)}</span>
      </p>
      {cta}
      {fanJoinHint}
    </div>
  );
};
