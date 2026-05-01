import type { StorefrontLandingContent } from "../../types";

/** Resolved store copy with safe defaults (My Page, fan store, landing, preview). */
export type ResolvedStoreCopy = {
  memberStoreTitle: string;
  memberStoreSubtitle: string;
  memberStoreEmptyMessage: string;
  memberStoreLoadingMessage: string;
  storeLandingHeadline: string;
  storeLandingDescription: string;
  storeLandingCtaLabel: string;
  publicStoreCardTitle: string;
  publicStoreCardDescription: string;
  publicStoreOpenCtaLabel: string;
  publicStoreModalTitle: string;
  publicStoreModalEmptyMessage: string;
};

const DEFAULTS: ResolvedStoreCopy = {
  memberStoreTitle: "Store",
  memberStoreSubtitle: "Personal messages, voice notes, and more - just for you.",
  memberStoreEmptyMessage: "Nothing listed here yet.",
  memberStoreLoadingMessage: "Loading…",
  storeLandingHeadline: "Demo store headline",
  storeLandingDescription: "Demo store description text.",
  storeLandingCtaLabel: "Open store",
  publicStoreCardTitle: "Store",
  publicStoreCardDescription: "Demo public store description text.",
  publicStoreOpenCtaLabel: "Open store",
  publicStoreModalTitle: "Store",
  publicStoreModalEmptyMessage:
    "No store items are listed on the landing page yet. Check back soon, or become a member for full store access.",
};

function pick(lc: StorefrontLandingContent | null | undefined, key: keyof StorefrontLandingContent): string {
  const v = lc?.[key];
  if (typeof v !== "string") return "";
  const t = v.trim();
  return t;
}

/**
 * Merge creator landing content with defaults. Title, subtitle, and open-store CTA are unified:
 * the first non-empty among the legacy fields wins, then the same strings are used for the member
 * hub store, landing store card, and optional landing promo so creators don’t maintain three copies.
 */
export function resolveStoreCopy(lc?: StorefrontLandingContent | null): ResolvedStoreCopy {
  const title =
    pick(lc, "memberStoreTitle") ||
    pick(lc, "storeLandingHeadline") ||
    pick(lc, "publicStoreCardTitle") ||
    DEFAULTS.memberStoreTitle;

  const subtitle =
    pick(lc, "memberStoreSubtitle") ||
    pick(lc, "storeLandingDescription") ||
    pick(lc, "publicStoreCardDescription") ||
    DEFAULTS.memberStoreSubtitle;

  const openCta =
    pick(lc, "publicStoreOpenCtaLabel") ||
    pick(lc, "storeLandingCtaLabel") ||
    DEFAULTS.publicStoreOpenCtaLabel;

  const modalTitle = pick(lc, "publicStoreModalTitle") || title;

  return {
    memberStoreTitle: title,
    memberStoreSubtitle: subtitle,
    memberStoreEmptyMessage: pick(lc, "memberStoreEmptyMessage") || DEFAULTS.memberStoreEmptyMessage,
    memberStoreLoadingMessage: pick(lc, "memberStoreLoadingMessage") || DEFAULTS.memberStoreLoadingMessage,
    storeLandingHeadline: title,
    storeLandingDescription: subtitle,
    storeLandingCtaLabel: openCta,
    publicStoreCardTitle: title,
    publicStoreCardDescription: subtitle,
    publicStoreOpenCtaLabel: openCta,
    publicStoreModalTitle: modalTitle,
    publicStoreModalEmptyMessage:
      pick(lc, "publicStoreModalEmptyMessage") || DEFAULTS.publicStoreModalEmptyMessage,
  };
}
