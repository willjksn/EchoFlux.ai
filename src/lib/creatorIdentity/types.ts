/**
 * Creator Identity Builder — shared types (EchoFlux + witme.io).
 * Precedence: Elite uses profile as default baseline; Personality Override wins per run when ON.
 */

export type NicheCategory =
  | 'lifestyle'
  | 'beauty'
  | 'fashion'
  | 'fitness'
  | 'wellness'
  | 'dating_flirt'
  | 'soft_luxury'
  | 'personal_access'
  | 'entertainment'
  | 'advice_coaching'
  | 'humor_personality'
  | 'music_performance'
  | 'art_creativity'
  | 'gaming'
  | 'travel'
  | 'community_connection'
  | 'niche_interest';

export type BrandVibe =
  | 'bold'
  | 'soft'
  | 'playful'
  | 'flirty'
  | 'polished'
  | 'luxury'
  | 'confident'
  | 'relatable'
  | 'mysterious'
  | 'classy'
  | 'funny'
  | 'smart'
  | 'sensual'
  | 'energetic'
  | 'calm'
  | 'exclusive'
  | 'warm'
  | 'edgy';

export type AudienceDriver =
  | 'connection'
  | 'access'
  | 'exclusivity'
  | 'attraction'
  | 'entertainment'
  | 'education'
  | 'inspiration'
  | 'community'
  | 'conversation'
  | 'escapism'
  | 'style_aspiration';

export type MonetizationFit =
  | 'membership'
  | 'paid_posts'
  | 'locked_content'
  | 'private_messages'
  | 'tips_support'
  | 'sessions'
  | 'shoutouts'
  | 'community_access'
  | 'coaching'
  | 'custom_requests'
  | 'bonus_drops';

export type QuestionType =
  | 'single_select'
  | 'multi_select'
  | 'ranked_select'
  | 'scale'
  | 'long_text';

export type CreatorIdentityQuestion = {
  id: string;
  section: number;
  sectionTitle: string;
  prompt: string;
  type: QuestionType;
  maxSelections?: number;
  exactSelections?: number;
  rankTop?: number;
  scaleMin?: number;
  scaleMax?: number;
  scaleLabels?: Record<number, string>;
  options?: Array<{ id: string; label: string }>;
  required?: boolean;
};

export type StructuredAnswer = {
  selected?: string | string[];
  ranked?: string[];
  scale?: number;
  customText?: string;
};

export type CreatorIdentityDraftAnswers = {
  structured: Record<string, StructuredAnswer>;
  openText: Record<string, string>;
};

export type CreatorIdentityProfile = {
  version: number;
  status: 'draft' | 'completed' | 'needs_followup';

  primaryNiche: NicheCategory | null;
  secondaryNiche: NicheCategory | null;
  nicheModifier?: string | null;

  nicheScores: Record<string, number>;
  brandVibes: BrandVibe[];
  vibeScores: Record<string, number>;
  audienceDrivers: AudienceDriver[];
  audienceDriverScores: Record<string, number>;
  monetizationFits: MonetizationFit[];
  monetizationScores: Record<string, number>;

  confidenceScore: number;
  clarityLevel: 'low' | 'medium' | 'high';

  customInputs: {
    customNicheLabels?: string[];
    customBrandWords?: string[];
    customAudienceInputs?: string[];
    customOfferInputs?: string[];
    extraNotes?: string[];
  };

  generatedProfile: {
    brandSummary: string;
    brandStatement: string;
    pageHeadline: string;
    pageSubheadline: string;
    shortBio: string;
    longBio?: string;
    welcomeMessage?: string;
    suggestedCTAs: string[];
    suggestedOffers: string[];
    suggestedContentPillars: string[];
    suggestedMembershipName?: string;
    suggestedMembershipDescription?: string;
    suggestedFanHubSections?: string[];
    premiumStudioProfile?: {
      contentStyle: string[];
      messageTone: string[];
      audienceIntent: string[];
      monetizationFocus: string[];
    };
  };

  rawAnswers: CreatorIdentityDraftAnswers;

  followup: {
    wasTriggered: boolean;
    questionsAsked?: Array<{
      id: string;
      question: string;
      reason: string;
      targetDimension?: string;
    }>;
    answers?: Record<string, string>;
    resolvedAt?: string;
  };

  ecosystemSync: {
    appliedToEchoFluxProfile: boolean;
    appliedToStrategyDefaults: boolean;
    appliedToCaptionDefaults: boolean;
    appliedToPremiumStudio: boolean;
    appliedToWitmePage: boolean;
    lastAppliedAt?: string;
  };

  timestamps: {
    startedAt: string;
    completedAt?: string;
    updatedAt: string;
  };
};

export type WitmeAutofillPayload = {
  headline: string;
  subheadline: string;
  bio: string;
  ctaPrimary: string;
  ctaSecondary?: string;
  offerOrder: string[];
  featuredTags: string[];
  pageTone: string[];
  welcomeMessage?: string;
  membershipName?: string;
  membershipDescription?: string;
};

/** Seeded into user settings when creator applies identity to Premium Content Studio (Elite). */
export type PremiumStudioIdentityDefaults = {
  enabled: boolean;
  voiceProfile: string[];
  contentPillars: string[];
  audienceDrivers: string[];
  monetizationPriority: string[];
  recommendedFormats: string[];
  brandGuardrails: string[];
};

export type ScoreBuckets = {
  niche: Record<string, number>;
  vibes: Record<string, number>;
  audience: Record<string, number>;
  monetization: Record<string, number>;
};
