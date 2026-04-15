/**
 * Tip checkout success query: Stripe replaces `{CHECKOUT_SESSION_ID}` literally (do not URL-encode braces).
 * `purchase_sync=1` lets `FanStorefrontView` POST `/api/syncFanCheckoutSession` when webhooks are slow or missing.
 */
export const FAN_TIP_CHECKOUT_SUCCESS_QS =
  "tip=success&purchase_sync=1&session_id={CHECKOUT_SESSION_ID}";

/** Member returns after paid live stream ticket (mirrors post_unlock + session sync). */
export const LIVE_STREAM_TICKET_CHECKOUT_SUCCESS_QS =
  "live_stream_ticket=1&purchase_sync=1&session_id={CHECKOUT_SESSION_ID}";

/**
 * Fan storefront checkout APIs usually return JSON; dev proxy errors may return plain text.
 */
export async function readFanCheckoutFetchResult(res: Response): Promise<{
  ok: boolean;
  url?: string;
  error?: string;
}> {
  const text = await res.text();
  try {
    const data = text
      ? (JSON.parse(text) as {
          url?: string;
          error?: string;
          message?: string;
          details?: string;
          hint?: string;
        })
      : {};
    const errStr = typeof data.error === "string" ? data.error.trim() : "";
    const msgStr = typeof data.message === "string" ? data.message.trim() : "";
    const detailsStr = typeof data.details === "string" ? data.details.trim() : "";
    const hintStr = typeof data.hint === "string" ? data.hint.trim() : "";
    const serverMessage =
      errStr && msgStr && errStr === "Checkout failed" && msgStr !== errStr
        ? `${errStr} ${msgStr}`
        : errStr && hintStr && errStr === "Stripe is not configured"
          ? `${errStr} ${hintStr}`
          : errStr || msgStr || detailsStr || hintStr || "";
    return {
      ok: res.ok,
      url: typeof data.url === "string" ? data.url : undefined,
      error:
        serverMessage
          ? serverMessage
          : !res.ok
            ? `Request failed (${res.status})`
            : undefined,
    };
  } catch {
    const snippet = text.replace(/\s+/g, " ").trim().slice(0, 200);
    return {
      ok: res.ok,
      error: snippet || `Request failed (${res.status})`,
    };
  }
}
