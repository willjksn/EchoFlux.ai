import type { StorefrontLandingContent } from "../../types";

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
      ? (lc.pricingFreeAmountLabel?.trim() || "Free")
      : (lc.pricingPaidAmountLabel?.trim() || `$${monthlyPrice}`),
    bullets,
    ctaLoggedIn: isFreeAccess
      ? (lc.pricingCtaLoggedInFree?.trim() || "Join Free")
      : (lc.pricingCtaLoggedInPaid?.trim() || `Join - $${monthlyPrice}/mo`),
    ctaGuest: isFreeAccess
      ? (lc.pricingCtaGuestFree?.trim() || "Sign up to Join Free")
      : (lc.pricingCtaGuestPaid?.trim() || "Sign up to Subscribe"),
    trustLine: isFreeAccess
      ? (lc.pricingTrustLineFree?.trim() || "🎉 No payment required")
      : (lc.pricingTrustLinePaid?.trim() || "🔒 Secure payment · Cancel anytime"),
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
