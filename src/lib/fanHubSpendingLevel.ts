/**
 * Fan Hub “💰 spending level” (0–5) from lifetime Fan Hub revenue (USD).
 * Creator-facing bag tiers: 1 bag ≤$20, 2 bags $20–$50, 3 bags $50–$100, 4 bags $100–$200, 5 bags $200+.
 */
export function spendingLevelFromLifetimeSpendDollars(totalDollars: number): number {
  const d = Math.max(0, Number(totalDollars) || 0);
  if (d <= 0) return 0;
  if (d <= 20) return 1;
  if (d <= 50) return 2;
  if (d <= 100) return 3;
  if (d <= 200) return 4;
  return 5;
}

export function spendingLevelFromLifetimeSpendCents(totalSpentCents: number): number {
  const c = Math.max(0, Math.round(Number(totalSpentCents) || 0));
  return spendingLevelFromLifetimeSpendDollars(c / 100);
}

/** Short copy for modals / tooltips */
export const FAN_HUB_SPENDING_LEVEL_HELP =
  "1 💰 up to $20 · 2 💰 $20–50 · 3 💰 $50–100 · 4 💰 $100–200 · 5 💰 $200+";

/** Plain sentence for modal footnotes (no emoji). */
export const FAN_HUB_SPENDING_LEVEL_SCALE_ONE_LINER =
  "Scale: tier 1 ≤ $20 · 2 $20–50 · 3 $50–100 · 4 $100–200 · 5 $200+ lifetime Fan Hub revenue.";

/** Human-readable lifetime band for tier `level` (0–5). */
export function fanHubSpendingTierBandLabel(level: number): string {
  const n = Math.min(5, Math.max(0, Math.round(Number(level) || 0)));
  switch (n) {
    case 0:
      return "No tier yet";
    case 1:
      return "up to $20 lifetime";
    case 2:
      return "$20–50 lifetime";
    case 3:
      return "$50–100 lifetime";
    case 4:
      return "$100–200 lifetime";
    case 5:
      return "$200+ lifetime";
    default:
      return "—";
  }
}
