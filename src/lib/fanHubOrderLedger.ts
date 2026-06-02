/**
 * Classify creator-order rows for Fan Hub revenue tables / analytics / user rolls.
 * Matches legacy rows where `tipHandle` is set but `type` is not `tip`.
 */
export type FanHubOrderLedgerKind = "tip" | "unlock" | "subscription" | "treat";

export function classifyFanHubOrderLedgerKind(order: Record<string, unknown>): FanHubOrderLedgerKind {
  const raw = String(order.type ?? order.productType ?? "").trim().toLowerCase();
  if (raw === "tip") return "tip";
  if (raw === "unlock" || raw === "unlock_media" || raw === "post_unlock") return "unlock";
  if (raw === "subscription") return "subscription";
  if (typeof order.tipHandle === "string" && order.tipHandle.trim()) return "tip";
  return "treat";
}

function fanHubOrderPaymentStatus(order: Record<string, unknown>): string {
  return String(order.status ?? "").trim().toLowerCase();
}

/**
 * Orders that count toward spend columns and member purchase history.
 * Excludes abandoned checkouts (`checkout_pending` at session create) and refunds.
 */
export function isRevenueCountableFanHubOrder(order: Record<string, unknown>): boolean {
  const st = fanHubOrderPaymentStatus(order);
  if (st === "refunded") return false;
  if (
    st === "checkout_pending" ||
    st === "unpaid" ||
    st === "failed" ||
    st === "canceled" ||
    st === "cancelled"
  ) {
    return false;
  }
  return true;
}

/** Fan ids used for guest checkout / tips — consistent with Fan Hub analytics guest revenue. */
export function isGuestCheckoutFanId(fanId: string): boolean {
  const s = String(fanId ?? "").trim();
  return (
    s.startsWith("guest_") ||
    s.startsWith("guest_tip_") ||
    s.startsWith("guest_session_") ||
    s.startsWith("anon_")
  );
}
