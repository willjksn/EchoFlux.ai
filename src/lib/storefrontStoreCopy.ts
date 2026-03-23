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
  memberStoreSubtitle: "Personal messages, voice notes, and more — just for you.",
  memberStoreEmptyMessage: "Nothing listed here yet.",
  memberStoreLoadingMessage: "Loading…",
  storeLandingHeadline: "Want something sweet?",
  storeLandingDescription:
    "Come by the treat shop — little extras, surprises, and picks just for you.",
  storeLandingCtaLabel: "Shop treats",
  publicStoreCardTitle: "Treat store",
  publicStoreCardDescription:
    "Browse treats without a membership — checkout with your email. If you subscribe later with the same email, your purchases link to your account.",
  publicStoreOpenCtaLabel: "Open treat store",
  publicStoreModalTitle: "Treat store",
  publicStoreModalEmptyMessage:
    "No treats are listed for guest checkout yet. Check back soon — or become a member for the full store.",
};

function pick(lc: StorefrontLandingContent | null | undefined, key: keyof StorefrontLandingContent): string {
  const v = lc?.[key];
  if (typeof v !== "string") return "";
  const t = v.trim();
  return t;
}

/** Merge creator landing content with defaults for all store-related strings. */
export function resolveStoreCopy(lc?: StorefrontLandingContent | null): ResolvedStoreCopy {
  return {
    memberStoreTitle: pick(lc, "memberStoreTitle") || DEFAULTS.memberStoreTitle,
    memberStoreSubtitle: pick(lc, "memberStoreSubtitle") || DEFAULTS.memberStoreSubtitle,
    memberStoreEmptyMessage: pick(lc, "memberStoreEmptyMessage") || DEFAULTS.memberStoreEmptyMessage,
    memberStoreLoadingMessage: pick(lc, "memberStoreLoadingMessage") || DEFAULTS.memberStoreLoadingMessage,
    storeLandingHeadline: pick(lc, "storeLandingHeadline") || DEFAULTS.storeLandingHeadline,
    storeLandingDescription: pick(lc, "storeLandingDescription") || DEFAULTS.storeLandingDescription,
    storeLandingCtaLabel: pick(lc, "storeLandingCtaLabel") || DEFAULTS.storeLandingCtaLabel,
    publicStoreCardTitle: pick(lc, "publicStoreCardTitle") || DEFAULTS.publicStoreCardTitle,
    publicStoreCardDescription: pick(lc, "publicStoreCardDescription") || DEFAULTS.publicStoreCardDescription,
    publicStoreOpenCtaLabel: pick(lc, "publicStoreOpenCtaLabel") || DEFAULTS.publicStoreOpenCtaLabel,
    publicStoreModalTitle: pick(lc, "publicStoreModalTitle") || DEFAULTS.publicStoreModalTitle,
    publicStoreModalEmptyMessage:
      pick(lc, "publicStoreModalEmptyMessage") || DEFAULTS.publicStoreModalEmptyMessage,
  };
}
