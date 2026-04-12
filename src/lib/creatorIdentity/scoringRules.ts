import type { ScoreBuckets } from './types.js';

/** Partial deltas per answer option id (questionId:optionId). */
export type RuleDelta = Partial<{
  niche: Record<string, number>;
  vibes: Record<string, number>;
  audience: Record<string, number>;
  monetization: Record<string, number>;
}>;

function addDelta(b: ScoreBuckets, d: RuleDelta) {
  const merge = (target: Record<string, number>, src?: Record<string, number>) => {
    if (!src) return;
    for (const [k, v] of Object.entries(src)) {
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      target[k] = (target[k] || 0) + v;
    }
  };
  merge(b.niche, d.niche);
  merge(b.vibes, d.vibes);
  merge(b.audience, d.audience);
  merge(b.monetization, d.monetization);
}

/** Config-driven weights (expand over time). Keys: `${qId}:${optionId}`. */
const RULES: Record<string, RuleDelta> = {
  // Q1
  // Visual first impression ≠ beauty niche (gaming, fitness, comedy all film themselves).
  'q1:looks_visual': {
    niche: { fashion: 2, lifestyle: 2, beauty: 1 },
    audience: { attraction: 2, style_aspiration: 1 },
  },
  'q1:personality': { niche: { humor_personality: 3 }, audience: { connection: 2, conversation: 1 } },
  'q1:energy_confidence': { niche: { fitness: 1 }, vibes: { confident: 3 }, audience: { inspiration: 2, attraction: 1 } },
  'q1:humor': { niche: { humor_personality: 3 }, vibes: { funny: 2 }, audience: { entertainment: 2 } },
  'q1:knowledge_advice': { niche: { advice_coaching: 4 }, audience: { education: 3 }, vibes: { smart: 2 } },
  'q1:lifestyle': { niche: { lifestyle: 3 }, audience: { connection: 1, style_aspiration: 1 } },
  'q1:creativity': { niche: { art_creativity: 3 }, audience: { inspiration: 2 } },
  'q1:talent_skill': { niche: { music_performance: 2, entertainment: 2 }, audience: { entertainment: 2 } },
  'q1:exclusivity_mystery': {
    audience: { exclusivity: 3 },
    vibes: { mysterious: 3 },
    niche: { soft_luxury: 1, personal_access: 1 },
  },
  'q1:relatability': { audience: { connection: 3 }, vibes: { relatable: 3 }, niche: { community_connection: 2 } },

  // Q2
  'q2:connected': { audience: { connection: 4 }, niche: { community_connection: 2 }, monetization: { membership: 1, private_messages: 1 } },
  'q2:updates_style': { audience: { entertainment: 2, style_aspiration: 1 }, niche: { lifestyle: 2 } },
  'q2:want_access': { audience: { access: 4 }, niche: { personal_access: 3 }, monetization: { private_messages: 2, membership: 2, sessions: 1 } },
  'q2:entertained': { audience: { entertainment: 4 }, niche: { entertainment: 2 } },
  'q2:learn': { niche: { advice_coaching: 4 }, audience: { education: 4 }, monetization: { coaching: 2 } },
  'q2:aesthetic': { audience: { style_aspiration: 3 }, niche: { beauty: 2, fashion: 2 } },
  'q2:curious_life': { audience: { connection: 2, escapism: 2 }, niche: { lifestyle: 2 } },
  'q2:exclusive_content': {
    audience: { exclusivity: 4 },
    niche: { soft_luxury: 2 },
    monetization: { locked_content: 2, membership: 2, bonus_drops: 1 },
  },
  'q2:talk_to_me': { audience: { conversation: 4, connection: 2 }, monetization: { private_messages: 2 } },
  'q2:inspired': { audience: { inspiration: 4 }, niche: { wellness: 1, fitness: 1 } },

  // Q3
  'q3:appearance': { audience: { attraction: 3, style_aspiration: 2 }, niche: { fashion: 2, beauty: 1 } },
  'q3:confidence': { vibes: { confident: 3 }, audience: { inspiration: 2 } },
  'q3:personality': { audience: { connection: 3 }, niche: { humor_personality: 2 } },
  'q3:advice': { niche: { advice_coaching: 3 }, audience: { education: 3 } },
  'q3:lifestyle': { niche: { lifestyle: 3 } },
  'q3:energy': { audience: { entertainment: 2 }, vibes: { energetic: 2 } },
  'q3:content_style': { audience: { style_aspiration: 2, entertainment: 2 } },
  'q3:want_access': { audience: { access: 3 }, monetization: { membership: 1, private_messages: 1 } },
  'q3:personal_interaction': { audience: { connection: 3, conversation: 2 }, monetization: { private_messages: 2, sessions: 1 } },
  'q3:exclusive_content': { audience: { exclusivity: 3 }, monetization: { locked_content: 2 } },

  // Q4
  'q4:selfies': {
    niche: { fashion: 2, lifestyle: 2, personal_access: 1, beauty: 1 },
    audience: { style_aspiration: 2, attraction: 1 },
  },
  'q4:bts': { niche: { personal_access: 2, lifestyle: 1 }, audience: { connection: 2 }, monetization: { paid_posts: 1 } },
  'q4:talking_cam': { niche: { humor_personality: 2, advice_coaching: 1 }, audience: { connection: 2, conversation: 1 } },
  'q4:tutorials': { niche: { advice_coaching: 3 }, audience: { education: 3 } },
  'q4:daily_life': { niche: { lifestyle: 3 }, audience: { connection: 2 } },
  'q4:storytimes': { niche: { entertainment: 2, humor_personality: 1 }, audience: { entertainment: 2 } },
  'q4:motivational': { niche: { wellness: 2, fitness: 2 }, audience: { inspiration: 3 } },
  'q4:playful_tease': {
    niche: { dating_flirt: 3 },
    vibes: { flirty: 3 },
    audience: { attraction: 3 },
    monetization: { locked_content: 1, bonus_drops: 1 },
  },
  'q4:reactions': { niche: { entertainment: 3, humor_personality: 2 }, audience: { entertainment: 3 } },
  'q4:personal_updates': { niche: { lifestyle: 2, personal_access: 2 }, audience: { connection: 2 } },
  'q4:premium_access_style': {
    niche: { personal_access: 4 },
    audience: { exclusivity: 3 },
    monetization: { membership: 2, private_messages: 2 },
  },
  'q4:community': { niche: { community_connection: 3 }, audience: { community: 3, connection: 2 } },

  // Q6 brand words → vibes + cross niche
  'q6:bold': { vibes: { bold: 4 } },
  'q6:soft': { vibes: { soft: 4 } },
  'q6:playful': { vibes: { playful: 4 } },
  'q6:flirty': { vibes: { flirty: 4 }, niche: { dating_flirt: 3 }, audience: { attraction: 3 } },
  'q6:polished': { vibes: { polished: 4, classy: 1 }, niche: { soft_luxury: 1 } },
  'q6:luxury': { vibes: { luxury: 4 }, niche: { soft_luxury: 3 }, audience: { style_aspiration: 2, exclusivity: 1 } },
  'q6:confident': { vibes: { confident: 4 } },
  'q6:relatable': { vibes: { relatable: 4 }, audience: { connection: 2 } },
  'q6:mysterious': { vibes: { mysterious: 4 }, audience: { exclusivity: 2 } },
  'q6:classy': { vibes: { classy: 4 }, niche: { soft_luxury: 2 } },
  'q6:funny': { vibes: { funny: 4 }, niche: { humor_personality: 2 } },
  'q6:smart': { vibes: { smart: 4 }, niche: { advice_coaching: 2 } },
  'q6:sensual': { vibes: { sensual: 4 }, niche: { dating_flirt: 2 }, audience: { attraction: 2 } },
  'q6:energetic': { vibes: { energetic: 4 }, audience: { entertainment: 2 } },
  'q6:calm': { vibes: { calm: 4 } },
  'q6:exclusive': { vibes: { exclusive: 4 }, audience: { exclusivity: 3 } },
  'q6:down_to_earth': { vibes: { warm: 3, relatable: 2 }, audience: { connection: 2 } },
  'q6:edgy': { vibes: { edgy: 4 } },
  'q6:warm': { vibes: { warm: 4 }, audience: { connection: 2, community: 1 } },

  // Q7 show up
  'q7:polished': { vibes: { polished: 3, classy: 1 }, niche: { soft_luxury: 2 } },
  'q7:casual': { vibes: { relatable: 2 }, niche: { lifestyle: 2 } },
  'q7:intimate': { niche: { personal_access: 3 }, audience: { connection: 3, access: 2 } },
  'q7:bold_attention': { vibes: { bold: 3 }, audience: { entertainment: 2, attraction: 1 } },
  'q7:funny_chaotic': { vibes: { funny: 3, playful: 2 }, niche: { humor_personality: 2 } },
  'q7:helpful': { niche: { advice_coaching: 3 }, audience: { education: 2 } },
  'q7:reserved_intrigue': { vibes: { mysterious: 3 }, audience: { exclusivity: 2 } },
  'q7:premium_exclusive': { niche: { soft_luxury: 3, personal_access: 2 }, audience: { exclusivity: 3 } },
  'q7:community_interactive': { niche: { community_connection: 3 }, audience: { community: 3 } },

  // Q8 feelings
  'q8:closer': { audience: { connection: 3, access: 2 }, niche: { personal_access: 2 }, monetization: { private_messages: 1, membership: 1 } },
  'q8:inspired': { audience: { inspiration: 4 } },
  'q8:attracted': { audience: { attraction: 4 }, niche: { dating_flirt: 2 }, vibes: { flirty: 2 } },
  'q8:entertained': { audience: { entertainment: 4 } },
  'q8:comfortable': { audience: { connection: 2 }, vibes: { warm: 2 } },
  'q8:curious': { audience: { escapism: 2, connection: 1 } },
  'q8:motivated': { audience: { inspiration: 3 } },
  'q8:excited': { audience: { entertainment: 2 } },
  'q8:seen': { audience: { connection: 4 }, niche: { community_connection: 2 } },
  'q8:exclusive_group': {
    audience: { exclusivity: 4, community: 2 },
    monetization: { membership: 2, community_access: 1 },
    niche: { soft_luxury: 1 },
  },

  // Q9 audience wants
  'q9:entertainment': { audience: { entertainment: 4 }, niche: { entertainment: 2 } },
  'q9:connection': { audience: { connection: 4 } },
  'q9:access': { audience: { access: 4 }, niche: { personal_access: 2 } },
  'q9:exclusivity': { audience: { exclusivity: 4 } },
  'q9:advice': { audience: { education: 3 }, niche: { advice_coaching: 3 } },
  'q9:motivation': { audience: { inspiration: 3 } },
  'q9:fantasy': { audience: { escapism: 4 } },
  'q9:community': { audience: { community: 4 }, niche: { community_connection: 2 } },
  'q9:conversation': { audience: { conversation: 4 } },
  'q9:style': { audience: { style_aspiration: 4 }, niche: { fashion: 3 } },

  // Q11 easiest offer
  'q11:membership': { monetization: { membership: 4 } },
  'q11:paid_posts': { monetization: { paid_posts: 4 } },
  'q11:messages': { monetization: { private_messages: 4 } },
  'q11:tips': { monetization: { tips_support: 4 } },
  'q11:direct_support': { monetization: { tips_support: 3 } },
  'q11:exclusive_updates': { monetization: { paid_posts: 2, membership: 2 } },
  'q11:sessions': { monetization: { sessions: 4 } },
  'q11:community_access': { monetization: { community_access: 4 } },
  'q11:shoutouts': { monetization: { shoutouts: 4 } },
  'q11:not_sure': {},

  // Q12 blockers (light signal)
  'q12:no_niche': {},
  'q12:no_brand': {},
  'q12:not_different': {},
  'q12:no_pay': {},
  'q12:random_page': {},
  'q12:describe_hard': {},
  'q12:ideas_no_direction': {},
  'q12:tie_together': {},
};

const Q5_RANK_WEIGHTS = [5, 3, 2];
const Q10_RANK_WEIGHTS = [6, 4, 2];

const Q5_NICHE_MAP: Record<string, string> = {
  lifestyle: 'lifestyle',
  beauty: 'beauty',
  fashion: 'fashion',
  fitness: 'fitness',
  wellness: 'wellness',
  dating_flirt: 'dating_flirt',
  soft_luxury: 'soft_luxury',
  personal_access: 'personal_access',
  entertainment: 'entertainment',
  advice_coaching: 'advice_coaching',
  humor_personality: 'humor_personality',
  music_performance: 'music_performance',
  art_creativity: 'art_creativity',
  gaming: 'gaming',
  travel: 'travel',
  niche_hobby: 'niche_interest',
  community_connection: 'community_connection',
};

const Q10_MON_MAP: Record<string, string> = {
  membership: 'membership',
  exclusive_posts: 'paid_posts',
  locked_content: 'locked_content',
  private_messages: 'private_messages',
  tips: 'tips_support',
  one_on_one: 'sessions',
  shoutouts: 'shoutouts',
  bts: 'paid_posts',
  bonus_drops: 'bonus_drops',
  community: 'community_access',
  coaching: 'coaching',
  custom: 'custom_requests',
};

export function emptyBuckets(): ScoreBuckets {
  return { niche: {}, vibes: {}, audience: {}, monetization: {} };
}

export function applyOptionRule(buckets: ScoreBuckets, questionId: string, optionId: string) {
  const key = `${questionId}:${optionId}`;
  const rule = RULES[key];
  if (rule) addDelta(buckets, rule);
}

export function applyRankedNiches(buckets: ScoreBuckets, rankedIds: string[]) {
  rankedIds.slice(0, 3).forEach((id, i) => {
    const w = Q5_RANK_WEIGHTS[i];
    if (!w) return;
    const niche = Q5_NICHE_MAP[id];
    if (niche && typeof niche === 'string') {
      buckets.niche[niche] = (buckets.niche[niche] || 0) + w;
    }
  });
}

export function applyRankedMonetization(buckets: ScoreBuckets, rankedIds: string[]) {
  rankedIds.slice(0, 3).forEach((id, i) => {
    const w = Q10_RANK_WEIGHTS[i];
    if (!w) return;
    const m = Q10_MON_MAP[id];
    if (m && typeof m === 'string') {
      buckets.monetization[m] = (buckets.monetization[m] || 0) + w;
    }
  });
}
