import type { StorefrontLandingContent } from "../../types";

/** Fixed product copy for paid membership (not customizable — Stripe + cancel policy). */
export const PAID_MEMBERSHIP_TRUST_LINE = "🔒 Secure payment via Stripe · ✓ Cancel anytime";

/** Saved landing overrides sometimes contain placeholder text; treat as missing so we fall back to monthly price. */
function isPlaceholderPricingLabel(s: string | undefined): boolean {
  const t = s?.trim();
  if (!t) return true;
  if (/^[\?\s]+$/.test(t)) return true;
  return false;
}

export type ResolvedPricingLandingCopy = {
  cardTitle: string;
  amountDisplay: string;
  bullets: string[];
  ctaLoggedIn: string;
  ctaGuest: string;
  trustLine: string;
  finalBannerPriceLine: string;
  finalBannerSubline: string;
};

/**
 * Resolves public landing #pricing card + bottom banner copy from My Page landing content,
 * with defaults based on paid vs free access and monthly price.
 */
export function resolvePricingLandingCopy(
  landingContent: StorefrontLandingContent,
  opts: { isFreeAccess: boolean; monthlyPrice: string }
): ResolvedPricingLandingCopy {
  const { isFreeAccess, monthlyPrice } = opts;
  const lc = landingContent;

  const defaultBulletsPaid = ["Exclusive content", "Cancel anytime"];
  const defaultBulletsFree = ["Member perks & updates", "Join instantly"];

  const rawBullets = lc.pricingCardBullets;
  const bullets =
    Array.isArray(rawBullets) && rawBullets.length > 0
      ? rawBullets.map((s) => String(s).trim()).filter(Boolean)
      : isFreeAccess
        ? defaultBulletsFree
        : defaultBulletsPaid;

  return {
    cardTitle: isFreeAccess
      ? (lc.pricingFreeTitle?.trim() || "Free membership")
      : (lc.pricingPaidTitle?.trim() || "Monthly membership"),
    amountDisplay: isFreeAccess
      ? isPlaceholderPricingLabel(lc.pricingFreeAmountLabel)
        ? "Free"
        : lc.pricingFreeAmountLabel!.trim()
      : isPlaceholderPricingLabel(lc.pricingPaidAmountLabel)
        ? `$${monthlyPrice}`
        : lc.pricingPaidAmountLabel!.trim(),
    bullets,
    ctaLoggedIn: isFreeAccess
      ? (lc.pricingCtaLoggedInFree?.trim() || "Join Free")
      : (lc.pricingCtaLoggedInPaid?.trim() || `Join - $${monthlyPrice}/mo`),
    ctaGuest: isFreeAccess
      ? (lc.pricingCtaGuestFree?.trim() || "Sign up to Join Free")
      : (lc.pricingCtaGuestPaid?.trim() || "Sign up to Subscribe"),
    trustLine: isFreeAccess
      ? (lc.pricingTrustLineFree?.trim() || "🎉 No payment required")
      : PAID_MEMBERSHIP_TRUST_LINE,
    finalBannerPriceLine: lc.pricingFinalBannerPriceLine?.trim()
      ? lc.pricingFinalBannerPriceLine.trim()
      : isFreeAccess
        ? "Free to join"
        : `$${monthlyPrice}/month`,
    finalBannerSubline: lc.pricingFinalBannerSubline?.trim()
      ? lc.pricingFinalBannerSubline.trim()
      : isFreeAccess
        ? "Member access at no cost."
        : "Exclusive access.",
  };
}
