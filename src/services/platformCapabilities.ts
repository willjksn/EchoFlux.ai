/**
 * Platform Capability Matrix
 * 
 * Defines which features are available for each platform.
 * Used to dynamically enable/disable UI features and validate operations.
 * 
 * Values:
 * - true: Fully supported
 * - false: Not supported
 * - "limited": Partially supported (with restrictions)
 * - "paid_api": Requires paid API tier
 * - "bot_opt_in": Requires bot setup/opt-in
 * - "own_posts_only": Only works on user's own posts
 * - "channels_only": Only works in channels (not DMs)
 */

export type CapabilityValue = boolean | "limited" | "paid_api" | "bot_opt_in" | "own_posts_only" | "channels_only" | "basic" | "custom" | "external_only" | "moderator_features_optional";

export interface PlatformCapabilities {
  publishing: boolean;
  reels_publishing?: boolean;
  stories_publishing?: boolean;
  inbox: boolean | "limited" | "paid_api" | "bot_opt_in" | "own_posts_only" | "channels_only";
  comments: boolean | "limited" | "own_posts_only" | "channels_only";
  dm_auto_reply: boolean | "limited" | "paid_api" | "bot_opt_in";
  analytics: boolean | "limited" | "paid_api" | "basic" | "custom";
  trend_detection: boolean | "limited" | "external_only" | "public_search";
  community_features: boolean | "moderator_features_optional";
  notes?: string; // Additional context about limitations
}

// Platform type is imported from types.ts to avoid duplication
// Re-export for convenience
export type { Platform } from '../../types';

/**
 * Platform Capability Matrix
 * 
 * This matrix defines what features each platform supports.
 * The UI uses this to show/hide features and provide helpful tooltips.
 */
export const PLATFORM_CAPABILITIES: Record<Platform, PlatformCapabilities> = {
  Instagram: {
    publishing: true,
    reels_publishing: true,
    stories_publishing: false, // Not available via API
    inbox: true,
    comments: true,
    dm_auto_reply: "limited",
    analytics: true,
    trend_detection: false,
    community_features: false,
    notes: "Full support via Meta API. No copyrighted music uploads."
  },
  Facebook: {
    publishing: true,
    inbox: true,
    comments: true,
    dm_auto_reply: "limited",
    analytics: true,
    trend_detection: false,
    community_features: false
  },
  X: {
    publishing: true,
    inbox: true,
    comments: true,
    dm_auto_reply: true,
    analytics: true,
    trend_detection: "limited",
    community_features: false,
  },
  TikTok: {
    publishing: true,
    inbox: false,
    comments: false,
    dm_auto_reply: false,
    analytics: "basic",
    trend_detection: "external_only",
    community_features: false
  },
  YouTube: {
    publishing: true,
    inbox: false,
    comments: "limited",
    dm_auto_reply: false,
    analytics: true,
    trend_detection: false,
    community_features: false
  },
  LinkedIn: {
    publishing: true,
    inbox: false,
    comments: "limited",
    dm_auto_reply: false,
    analytics: "basic",
    trend_detection: false,
    community_features: false
  },
  Threads: {
    publishing: true,
    inbox: false,
    comments: false,
    analytics: false,
    trend_detection: false,
    community_features: false,
    notes: "API evolving; limited endpoints today."
  },
  Pinterest: {
    publishing: true,
    inbox: false,
    comments: false,
    dm_auto_reply: false,
    analytics: true,
    trend_detection: "limited",
    community_features: false,
    notes: "Visual search engine - evergreen content strategy. Focus on SEO, keywords, and traffic metrics (saves/clicks). Optimal posting: 3-5 pins/week."
  },
  Discord: {
    publishing: true,
    inbox: true,
    comments: "channels_only",
    dm_auto_reply: "bot_opt_in",
    analytics: "custom",
    trend_detection: false,
    community_features: true,
    notes: "Discord bots allow deep conversational automation."
  },
  Telegram: {
    publishing: true,
    inbox: true,
    comments: false,
    dm_auto_reply: "bot_opt_in",
    analytics: "limited",
    trend_detection: false,
    community_features: true
  },
  Reddit: {
    publishing: true,
    inbox: "own_posts_only",
    comments: "own_posts_only",
    dm_auto_reply: false,
    analytics: "limited",
    trend_detection: "public_search",
    community_features: "moderator_features_optional"
  }
};

/**
 * Check if a platform supports a specific capability
 */
export function hasCapability(
  platform: Platform,
  capability: keyof PlatformCapabilities
): boolean {
  const caps = PLATFORM_CAPABILITIES[platform];
  if (!caps) return false;
  
  const value = caps[capability];
  // true means fully supported
  if (value === true) return true;
  // false means not supported
  if (value === false) return false;
  // Any other value means partially/conditionally supported
  return value !== false && value !== undefined;
}

/**
 * Get the capability value for a platform
 */
export function getCapability(
  platform: Platform,
  capability: keyof PlatformCapabilities
): CapabilityValue | undefined {
  return PLATFORM_CAPABILITIES[platform]?.[capability];
}

/**
 * Check if a capability is fully supported (not limited/conditional)
 */
export function isFullySupported(
  platform: Platform,
  capability: keyof PlatformCapabilities
): boolean {
  const value = getCapability(platform, capability);
  return value === true;
}

/**
 * Get all platforms that support a specific capability
 */
export function getPlatformsWithCapability(
  capability: keyof PlatformCapabilities,
  fullySupportedOnly: boolean = false
): Platform[] {
  return (Object.keys(PLATFORM_CAPABILITIES) as Platform[]).filter(platform => {
    if (fullySupportedOnly) {
      return isFullySupported(platform, capability);
    }
    return hasCapability(platform, capability);
  });
}

/**
 * Get human-readable description of a capability value
 */
export function getCapabilityDescription(
  value: CapabilityValue
): string {
  if (value === true) return "Fully supported";
  if (value === false) return "Not supported";
  if (value === "limited") return "Partially supported";
  if (value === "paid_api") return "Requires paid API tier";
  if (value === "bot_opt_in") return "Requires bot setup";
  if (value === "own_posts_only") return "Only on your posts";
  if (value === "channels_only") return "Channels only";
  if (value === "basic") return "Basic support";
  if (value === "custom") return "Custom implementation";
  if (value === "external_only") return "External tools required";
  if (value === "public_search") return "Public search only";
  if (value === "moderator_features_optional") return "Moderator features available";
  return "Unknown";
}
