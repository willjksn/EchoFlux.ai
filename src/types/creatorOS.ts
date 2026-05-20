export type CreatorOSPrimaryGoal =
  | "grow_attention"
  | "story_clicks"
  | "inner_circle_subscribers"
  | "retain_subscribers"
  | "test_amazon_products"
  | "sell_treats";

export type CreatorOSPrimaryAudience = "mostly_men" | "mostly_women" | "mixed";

export type CreatorOSAvailableTime = "5_minutes" | "15_minutes" | "30_plus" | "batch_film";

export type ContentLane =
  | "smirk_curiosity"
  | "relatable_real_life"
  | "car_driving"
  | "lifestyle"
  | "talking_personality"
  | "amazon_soft_mention"
  | "inner_circle_tease";

export type PlatformTarget =
  | "instagram_reel"
  | "instagram_story"
  | "tiktok"
  | "inner_circle"
  | "amazon_storefront";

export type FunnelGoal =
  | "grow_attention"
  | "drive_story_clicks"
  | "drive_inner_circle_subscribers"
  | "retain_subscribers"
  | "sell_treat"
  | "test_product_interest";

export type ContentIdeaStatus =
  | "ideas"
  | "to_film"
  | "ready_to_post"
  | "posted"
  | "monetized"
  | "review";

export type AmazonOwnershipStatus = "own_use" | "similar_curated" | "testing_interest";
export type AmazonPerformanceStatus = "testing" | "proven" | "retired";

export type CreatorOSTrendStatus =
  | "new"
  | "saved_to_ideas"
  | "saved_to_amazon_library"
  | "ignored"
  | "tested"
  | "proven";

export interface CreatorOSSettings {
  primaryGoal: CreatorOSPrimaryGoal;
  primaryAudience: CreatorOSPrimaryAudience;
  preferredLanes: ContentLane[];
  availableTime: CreatorOSAvailableTime;
  monetizationPaths: string[];
  weeklyPublicPostsTarget: number;
  weeklyStoriesTarget: number;
  weeklyInnerCircleDropsTarget: number;
  weeklyAmazonLinksTarget: number;
  brandTone: string;
  /** 0-100: clean to flirty to bold/borderline explicit Creator OS copy. */
  spicinessLevel?: number;
  filmingDays: string[];
  mainMonetization: string[];
  /** When true, show Amazon links, product trends, and product-shot tools in Money flow. */
  amazonAffiliateEnabled?: boolean;
  /** Label for paid member drops (e.g. Stormij uses "Inner Circle"). */
  paidMemberHubLabel?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ContentIdea {
  id: string;
  title: string;
  lane: ContentLane;
  publicHook: string;
  caption: string;
  platforms: PlatformTarget[];
  funnelGoal: FunnelGoal;
  amazonLinkId?: string;
  amazonCategory?: string;
  storyText?: string[];
  innerCircleTieIn: string;
  notes: string;
  dueDate: string;
  status: ContentIdeaStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
  completedAt?: unknown;
}

export interface AmazonLink {
  id: string;
  productName: string;
  category: string;
  amazonUrl: string;
  audienceFit: string;
  bestContentSituation: string;
  ownershipStatus: AmazonOwnershipStatus;
  performanceStatus: AmazonPerformanceStatus;
  notes: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface WeeklyPlanDay {
  publicPost: string;
  storyLink: string;
  innerCircleDrop: string;
  completed: {
    publicPost: boolean;
    storyLink: boolean;
    innerCircleDrop: boolean;
  };
}

export type WeeklyPlanDayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface WeeklyPlan {
  id: string;
  weekStartDate: string;
  days: Record<WeeklyPlanDayKey, WeeklyPlanDay>;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CreatorOSTrend {
  id: string;
  title: string;
  category: string;
  audienceFit: string;
  contentAngle: string;
  storyText: string[];
  innerCircleTieIn: string;
  ownershipRecommendation: AmazonOwnershipStatus;
  sourceUrl: string;
  dateFound: string;
  status: CreatorOSTrendStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TodaysMoveChecklistItem {
  id: string;
  label: string;
  completed: boolean;
}

export interface TodaysMove {
  id: string;
  date: string;
  publicPost: string;
  hook: string;
  caption: string;
  platforms: PlatformTarget[];
  storyLinkPlan: string[];
  suggestedAmazonCategory: string;
  suggestedAmazonLinkId?: string;
  innerCircleDrop: string;
  innerCircleCaption: string;
  checklist: TodaysMoveChecklistItem[];
  whyThisWorks: string;
  completed: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface InnerCircleFunnel {
  welcomeScript: string;
  first48HourPlan: string[];
  weeklyRetentionPlan: string[];
  treatUpsellIdeas: string[];
  updatedAt?: unknown;
}

