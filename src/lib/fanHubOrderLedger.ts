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
