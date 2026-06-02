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

/** Rows passed to ledger dedupe (API + optional client normalization). */
export type FanHubLedgerDedupeRow = {
  id: string;
  type?: string;
  status?: string;
  amountCents?: number;
  productId?: string | null;
  productTitle?: string;
  fanId?: string;
  fanEmail?: string;
  stripePaymentIntentId?: string | null;
  stripeSessionId?: string | null;
  __createdAtMs?: number;
};

const PRODUCT_COLLAPSE_WINDOW_MS = 2 * 60 * 60 * 1000;

function productLedgerStatusRank(st: string): number {
  if (st === "paid") return 3;
  if (st === "checkout_pending") return 1;
  return 2;
}

function productLedgerIdPriority(id: string): number {
  if (id.startsWith("cs_")) return 100;
  if (id.startsWith("legacy_purchase_")) return 40;
  return 55;
}

function pickBetterProductLedgerRow<T extends FanHubLedgerDedupeRow>(a: T, b: T): T {
  const rankA = productLedgerStatusRank(fanHubOrderPaymentStatus(a));
  const rankB = productLedgerStatusRank(fanHubOrderPaymentStatus(b));
  if (rankA !== rankB) return rankA > rankB ? a : b;
  const piA = a.stripePaymentIntentId?.startsWith("pi_") ? 1 : 0;
  const piB = b.stripePaymentIntentId?.startsWith("pi_") ? 1 : 0;
  if (piA !== piB) return piA > piB ? a : b;
  return productLedgerIdPriority(a.id) >= productLedgerIdPriority(b.id) ? a : b;
}

/**
 * Collapse duplicate store checkouts (abandoned session + paid session, or two sessions / emails, one Stripe charge).
 */
function shouldCollapseDuplicateProductPurchases<T extends FanHubLedgerDedupeRow>(group: T[]): boolean {
  if (group.length <= 1) return false;
  const paidWithPi = group.filter(
    (r) =>
      r.stripePaymentIntentId?.startsWith("pi_") &&
      fanHubOrderPaymentStatus(r) === "paid",
  );
  if (paidWithPi.length === 1) return true;
  const fanIds = new Set(group.map((r) => String(r.fanId || "").trim()).filter(Boolean));
  if (fanIds.size === 1) return true;
  const emails = new Set(
    group
      .map((r) => String(r.fanEmail || "").trim().toLowerCase())
      .filter((e) => e.includes("@")),
  );
  if (emails.size === 1) return true;
  return false;
}

function productCollapseKey(row: FanHubLedgerDedupeRow): string | null {
  const pid = String(row.productId ?? "").trim();
  const title = String(row.productTitle ?? "").trim().toLowerCase();
  const amt = Math.round(row.amountCents ?? 0);
  const productKey = pid || (title ? `title:${title}` : "");
  if (!productKey || amt <= 0) return null;
  const bucket = Math.floor((row.__createdAtMs ?? 0) / PRODUCT_COLLAPSE_WINDOW_MS);
  return `${productKey}:${amt}:w${bucket}`;
}

function productStripeFingerprint(row: FanHubLedgerDedupeRow): string {
  const pi =
    typeof row.stripePaymentIntentId === "string" && row.stripePaymentIntentId.startsWith("pi_")
      ? row.stripePaymentIntentId
      : null;
  if (pi) return `pi:${pi}`;
  const sid =
    typeof row.stripeSessionId === "string" && row.stripeSessionId.startsWith("cs_")
      ? row.stripeSessionId
      : row.id.startsWith("cs_")
        ? row.id
        : null;
  if (sid) return `cs:${sid}`;
  return `id:${row.id}`;
}

/**
 * Store/treat rows: dedupe same Stripe charge, abandoned checkout + paid session, and duplicate sessions with one payment.
 */
export function dedupeFanHubProductLedgerRows<T extends FanHubLedgerDedupeRow>(rows: T[]): T[] {
  const nonProducts: T[] = [];
  const productRows: T[] = [];

  for (const row of rows) {
    const typ = String(row.type ?? "").trim().toLowerCase();
    if (typ !== "product" || fanHubOrderPaymentStatus(row) === "refunded") {
      nonProducts.push(row);
    } else {
      productRows.push(row);
    }
  }

  const collapseGroups = new Map<string, T[]>();
  const orphanProducts: T[] = [];

  for (const row of productRows) {
    const key = productCollapseKey(row);
    if (!key) {
      orphanProducts.push(row);
      continue;
    }
    const g = collapseGroups.get(key) || [];
    g.push(row);
    collapseGroups.set(key, g);
  }

  const dedupedProducts: T[] = [];

  for (const [, group] of collapseGroups) {
    if (shouldCollapseDuplicateProductPurchases(group)) {
      let best = group[0];
      for (let i = 1; i < group.length; i++) {
        best = pickBetterProductLedgerRow(best, group[i]);
      }
      dedupedProducts.push(best);
      continue;
    }
    const stripePick = new Map<string, T>();
    for (const row of group) {
      const fp = productStripeFingerprint(row);
      const prev = stripePick.get(fp);
      stripePick.set(fp, prev ? pickBetterProductLedgerRow(prev, row) : row);
    }
    dedupedProducts.push(...stripePick.values());
  }

  const orphanPick = new Map<string, T>();
  for (const row of orphanProducts) {
    const fp = productStripeFingerprint(row);
    const prev = orphanPick.get(fp);
    orphanPick.set(fp, prev ? pickBetterProductLedgerRow(prev, row) : row);
  }

  return [...nonProducts, ...dedupedProducts, ...orphanPick.values()];
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
