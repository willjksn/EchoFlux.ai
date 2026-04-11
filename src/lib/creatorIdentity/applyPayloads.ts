import type { CreatorIdentityProfile, PremiumStudioIdentityDefaults, WitmeAutofillPayload } from './types.js';

function asObjectRecord(x: unknown): Record<string, unknown> {
  if (x && typeof x === 'object' && !Array.isArray(x)) {
    return { ...(x as Record<string, unknown>) };
  }
  return {};
}

/** Map completed profile → witme.io storefront-oriented fields (merge via updateCreatorStorefront / Admin). */
export function profileToWitmeAutofillPayload(profile: CreatorIdentityProfile): WitmeAutofillPayload {
  const g = profile.generatedProfile;
  const cta = g.suggestedCTAs[0] || 'Join my membership';
  return {
    headline: g.pageHeadline,
    subheadline: g.pageSubheadline,
    bio: g.shortBio,
    ctaPrimary: cta,
    ctaSecondary: g.suggestedCTAs[1],
    offerOrder: g.suggestedOffers,
    featuredTags: [
      ...(profile.primaryNiche ? [profile.primaryNiche.replace(/_/g, ' ')] : []),
      ...profile.brandVibes.slice(0, 4).map((v) => v.replace(/_/g, ' ')),
    ].filter(Boolean),
    pageTone: profile.brandVibes.map((v) => v.replace(/_/g, ' ')),
    welcomeMessage: g.welcomeMessage || g.pageSubheadline,
    membershipName: g.suggestedMembershipName,
    membershipDescription: g.suggestedMembershipDescription,
  };
}

/**
 * Patch for `creators/{uid}` when the creator opts in to "Fill Fan Hub / My Page".
 * Shallow-merges into existing `landingContent` only for those keys; does not touch `fanAuthBranding`, theme, legal, media, or prices.
 * Does not write tip-block fields (`tipSection*`).
 */
export function mergeFanHubStorefrontFromIdentity(
  existingCreatorDoc: Record<string, unknown>,
  profile: CreatorIdentityProfile
): Record<string, unknown> {
  const w = profileToWitmeAutofillPayload(profile);
  const g = profile.generatedProfile;

  const existingLanding = asObjectRecord(existingCreatorDoc.landingContent);

  const perksList =
    g.suggestedContentPillars.length > 0 ? [...g.suggestedContentPillars] : [...g.suggestedOffers].slice(0, 8);
  const previewList =
    g.suggestedOffers.length > 0 ? [...g.suggestedOffers] : [...g.suggestedContentPillars].slice(0, 8);
  const energyLines =
    w.pageTone.length > 0
      ? [...w.pageTone]
      : profile.brandVibes.map((v) => v.replace(/_/g, ' '));

  const pricingBullets =
    g.suggestedOffers.length > 0 ? g.suggestedOffers.slice(0, 8) : g.suggestedContentPillars.slice(0, 8);

  const storeBlurbSource =
    (w.membershipDescription && String(w.membershipDescription).trim()) ||
    (g.suggestedMembershipDescription && String(g.suggestedMembershipDescription).trim()) ||
    g.brandSummary;

  const storeBlurb = storeBlurbSource.slice(0, 500);

  const membershipTitle = (w.membershipName || g.suggestedMembershipName || '').trim() || 'Membership';

  const landingPatch: Record<string, unknown> = {
    perksTitle: 'Why fans subscribe',
    perksText: g.brandSummary || g.pageSubheadline,
    perksList:
      perksList.length > 0 ? perksList : ['Exclusive updates', 'Behind-the-scenes moments', 'Direct access to me'],
    previewTitle: 'What you get',
    previewText: g.pageSubheadline || g.brandSummary.slice(0, 400),
    previewList: previewList.length > 0 ? previewList : perksList,
    energyTitle: 'The energy',
    energyLines:
      energyLines.length > 0 ? energyLines : ['Warm', 'Consistent', 'True to the brand you built here'],
    boundaryTitle: 'Community',
    boundaryText: g.shortBio || g.brandSummary.slice(0, 500),
    pricingPaidTitle: membershipTitle,
    pricingFreeTitle: membershipTitle,
    ...(pricingBullets.length > 0 ? { pricingCardBullets: pricingBullets } : {}),
    storeLandingHeadline: 'Exclusives & treats',
    storeLandingDescription: storeBlurb,
    publicStoreCardDescription: storeBlurb.slice(0, 280),
    memberStoreSubtitle: storeBlurb.slice(0, 220),
  };

  const mergedLanding = { ...existingLanding, ...landingPatch };

  return {
    heroTagline: w.headline,
    heroPromise: w.subheadline,
    heroSubline: w.ctaPrimary,
    heroSubline2: w.ctaSecondary ?? '',
    bio: w.bio,
    landingContent: mergedLanding,
  };
}

export function profileToPremiumStudioDefaults(profile: CreatorIdentityProfile): PremiumStudioIdentityDefaults {
  const ps = profile.generatedProfile.premiumStudioProfile;
  return {
    enabled: true,
    voiceProfile: ps?.messageTone?.length ? ps.messageTone : profile.brandVibes.map((v) => v.replace(/_/g, ' ')),
    contentPillars: ps?.contentStyle?.length ? ps.contentStyle : profile.generatedProfile.suggestedContentPillars,
    audienceDrivers: ps?.audienceIntent?.length
      ? ps.audienceIntent
      : profile.audienceDrivers.map((d) => d.replace(/_/g, ' ')),
    monetizationPriority: ps?.monetizationFocus?.length
      ? ps.monetizationFocus
      : profile.monetizationFits.map((m) => m.replace(/_/g, ' ')),
    recommendedFormats: profile.generatedProfile.suggestedContentPillars.slice(0, 6),
    brandGuardrails: [
      `Primary niche: ${profile.primaryNiche || 'mixed'}`,
      `Clarity: ${profile.clarityLevel}`,
    ],
  };
}
