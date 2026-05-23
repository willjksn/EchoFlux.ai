/**
 * witme.io storefront is active only while the creator's EchoFlux SaaS subscription is in good standing.
 * Separate from fan→creator Stripe Connect memberships.
 */
import {
  hasActiveEchoFluxSubscription,
  type EchoFluxSubscriptionUserFields,
} from "./echoFluxSubscriptionAccess.js";

export type CreatorStorefrontUserFields = EchoFluxSubscriptionUserFields & {
  role?: string | null;
  isPlatformOwner?: boolean;
  platformOwner?: boolean;
};

const PLATFORM_OWNER_IDS = (process.env.PLATFORM_OWNER_CREATOR_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function isCreatorListedAsPlatformOwner(creatorId: string): boolean {
  return PLATFORM_OWNER_IDS.includes(creatorId);
}

/** True when creator may operate a public witme page and accept new fan monetization. */
export function isCreatorEchoFluxStorefrontActive(
  creatorId: string,
  userData: CreatorStorefrontUserFields | null | undefined,
): boolean {
  if (!userData) return false;
  if (userData.role === "Admin") return true;
  if (isCreatorListedAsPlatformOwner(creatorId)) return true;
  if (userData.isPlatformOwner === true || userData.platformOwner === true) return true;
  return hasActiveEchoFluxSubscription(userData);
}

export const STOREFRONT_SUSPENDED_PUBLIC_MESSAGE =
  "This creator page is temporarily unavailable. New memberships and store purchases are paused while the creator renews their EchoFlux plan.";

export const STOREFRONT_SUSPENDED_MEMBER_STORE_MESSAGE =
  "The store is closed while this creator renews their EchoFlux plan. Your paid membership stays active until the end of your current billing period.";
