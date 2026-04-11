import type {
  BrandVibe,
  CreatorIdentityDraftAnswers,
  CreatorIdentityProfile,
  MonetizationFit,
  NicheCategory,
  AudienceDriver,
} from './types.js';

const NICHE_LABEL: Record<string, string> = {
  lifestyle: 'Lifestyle',
  beauty: 'Beauty',
  fashion: 'Fashion',
  fitness: 'Fitness',
  wellness: 'Wellness',
  dating_flirt: 'Dating / flirt energy',
  soft_luxury: 'Soft luxury',
  personal_access: 'Personal access',
  entertainment: 'Entertainment',
  advice_coaching: 'Advice & coaching',
  humor_personality: 'Humor & personality',
  music_performance: 'Music & performance',
  art_creativity: 'Art & creativity',
  gaming: 'Gaming',
  travel: 'Travel',
  community_connection: 'Community & connection',
  niche_interest: 'Niche interest',
};

const MON_LABEL: Record<string, string> = {
  membership: 'Membership / subscription',
  paid_posts: 'Paid posts',
  locked_content: 'Locked or PPV content',
  private_messages: 'Private messages',
  tips_support: 'Tips & direct support',
  sessions: '1:1 sessions or chats',
  shoutouts: 'Shoutouts & customs',
  community_access: 'Community access',
  coaching: 'Coaching & advice',
  custom_requests: 'Custom requests',
  bonus_drops: 'Bonus drops & exclusives',
};

export function synthesizeGeneratedProfile(input: {
  primary: NicheCategory | null;
  secondary: NicheCategory | null;
  brandVibes: BrandVibe[];
  audienceDrivers: AudienceDriver[];
  monetizationFits: MonetizationFit[];
  answers: CreatorIdentityDraftAnswers;
  nicheScores: Record<string, number>;
}): CreatorIdentityProfile['generatedProfile'] {
  const pLabel = input.primary ? NICHE_LABEL[input.primary] || input.primary : 'multi-faceted creator';
  const sLabel = input.secondary ? NICHE_LABEL[input.secondary] || input.secondary : '';
  const vibes = input.brandVibes.join(', ');
  const drivers = input.audienceDrivers.join(', ');
  const topMon = input.monetizationFits.slice(0, 3);

  const q14 = input.answers.openText.q14?.trim() || '';
  const q15 = input.answers.openText.q15?.trim() || '';
  const q16 = input.answers.openText.q16?.trim() || '';

  const brandSummary = [
    `Primary lane: ${pLabel}${sLabel ? `. Secondary pull: ${sLabel}.` : '.'}`,
    vibes ? `Brand energy: ${vibes}.` : '',
    drivers ? `Audience drivers: ${drivers.replace(/_/g, ' ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const brandStatement =
    q14 ||
    `I'm building a ${pLabel.toLowerCase()} brand that leads with ${vibes || 'authentic voice'} and gives fans ${drivers.replace(/_/g, ' ') || 'real connection'}.`;

  const pageHeadline = q14.split(/[.!?]/)[0]?.trim().slice(0, 80) || `${pLabel} — your access starts here`;
  const pageSubheadline =
    q16.slice(0, 140) || `Exclusive updates, ${topMon[0] ? MON_LABEL[topMon[0]] || topMon[0] : 'member perks'}, and a space that feels personal.`;

  const shortBio = [q15.slice(0, 200), q16.slice(0, 200)].filter(Boolean).join(' ') || brandStatement.slice(0, 280);

  const suggestedOffers = topMon.map((m) => MON_LABEL[m] || m);
  const suggestedCTAs = ['Join my membership', 'Unlock exclusive posts', 'Message me', 'Leave a tip'].slice(
    0,
    Math.min(4, 2 + topMon.length)
  );

  const pillars = [
    pLabel,
    vibes ? `Tone: ${vibes}` : null,
    q15 ? `Content you love: ${q15.slice(0, 120)}` : null,
  ].filter(Boolean) as string[];

  return {
    brandSummary,
    brandStatement,
    pageHeadline,
    pageSubheadline,
    shortBio,
    longBio: [q14, q15, q16].filter(Boolean).join('\n\n'),
    welcomeMessage: `Thanks for being here — this is where I share what I don't post anywhere else.`,
    suggestedCTAs,
    suggestedOffers,
    suggestedContentPillars: pillars,
    suggestedMembershipName: `${pLabel} Inner Circle`,
    suggestedMembershipDescription: shortBio.slice(0, 400),
    suggestedFanHubSections: ['Feed', 'Membership', 'Store', 'Messages'],
    premiumStudioProfile: {
      contentStyle: pillars,
      messageTone: input.brandVibes.map((v) => v.replace(/_/g, ' ')),
      audienceIntent: input.audienceDrivers.map((d) => d.replace(/_/g, ' ')),
      monetizationFocus: suggestedOffers,
    },
  };
}
