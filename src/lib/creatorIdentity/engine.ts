import type {
  BrandVibe,
  CreatorIdentityDraftAnswers,
  CreatorIdentityProfile,
  MonetizationFit,
  NicheCategory,
  AudienceDriver,
} from './types';
import { CREATOR_IDENTITY_QUESTIONS } from './questionBank';
import {
  applyOptionRule,
  applyRankedMonetization,
  applyRankedNiches,
  emptyBuckets,
} from './scoringRules';
import { synthesizeGeneratedProfile } from './synthesize';

function topKeys(scores: Record<string, number>, n: number): string[] {
  return Object.entries(scores)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

function primarySecondaryNiche(
  nicheScores: Record<string, number>
): { primary: NicheCategory | null; secondary: NicheCategory | null } {
  const top = topKeys(nicheScores, 3);
  const primary = (top[0] as NicheCategory) || null;
  const pScore = primary ? nicheScores[primary] || 0 : 0;
  const secondRaw = top[1] as NicheCategory | undefined;
  const sScore = secondRaw ? nicheScores[secondRaw] || 0 : 0;
  const secondary = secondRaw && pScore > 0 && sScore >= pScore * 0.65 ? secondRaw : null;
  return { primary, secondary };
}

function clarityFromConfidence(c: number): 'low' | 'medium' | 'high' {
  if (c >= 80) return 'high';
  if (c >= 55) return 'medium';
  return 'low';
}

/** Base + structured + open text + consistency/conflict heuristics. */
export function computeConfidence(
  answers: CreatorIdentityDraftAnswers,
  nicheScores: Record<string, number>,
  vibeScores: Record<string, number>
): number {
  let score = 0;
  const struct = answers.structured;
  for (const q of CREATOR_IDENTITY_QUESTIONS) {
    const a = struct[q.id];
    if (!a) continue;
    if (q.type === 'long_text') continue;
    if (q.type === 'scale' && typeof a.scale === 'number') score += 4;
    else if (q.type === 'single_select' && a.selected) score += 4;
    else if (q.type === 'multi_select' && Array.isArray(a.selected) && a.selected.length) score += 4;
    else if (q.type === 'ranked_select' && Array.isArray(a.ranked) && a.ranked.length) score += 4;
  }
  for (const v of Object.values(answers.openText)) {
    if (typeof v === 'string' && v.trim().length > 12) score += 5;
  }

  const nicheTop = topKeys(nicheScores, 4).map((k) => nicheScores[k] || 0);
  if (nicheTop.length >= 2 && nicheTop[0] > 0) {
    const ratio = nicheTop[1] / nicheTop[0];
    if (ratio < 0.55) score += 12;
    else if (ratio < 0.85) score += 6;
    else score -= 8;
  }

  const vibeVals = Object.values(vibeScores).filter((x) => x > 0);
  if (vibeVals.length >= 6) score -= 10;

  const q13 = struct.q13?.scale;
  if (typeof q13 === 'number') {
    if (q13 <= 2) score -= 5;
    if (q13 >= 4) score += 5;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function needsFollowup(confidence: number, nicheScores: Record<string, number>): boolean {
  if (confidence < 55) return true;
  const t = topKeys(nicheScores, 2);
  if (t.length < 2) return false;
  const a = nicheScores[t[0]] || 0;
  const b = nicheScores[t[1]] || 0;
  if (a > 0 && b / a > 0.82) return true;
  return false;
}

/** Merge adaptive follow-up answers into open text and rebuild scoring context. */
export function appendFollowupOpenText(
  answers: CreatorIdentityDraftAnswers,
  followupAnswers: Record<string, string>
): CreatorIdentityDraftAnswers {
  const note = Object.entries(followupAnswers)
    .filter(([, v]) => typeof v === 'string' && v.trim())
    .map(([k, v]) => `${k}: ${v.trim()}`)
    .join('\n');
  if (!note) return answers;
  return {
    ...answers,
    openText: {
      ...answers.openText,
      followup_clarifications: note,
    },
  };
}

export function scoreAnswers(answers: CreatorIdentityDraftAnswers) {
  const buckets = emptyBuckets();

  for (const q of CREATOR_IDENTITY_QUESTIONS) {
    const a = answers.structured[q.id];
    if (!a) continue;
    if (q.type === 'single_select' && typeof a.selected === 'string') {
      applyOptionRule(buckets, q.id, a.selected);
    }
    if (q.type === 'multi_select' && Array.isArray(a.selected)) {
      for (const id of a.selected) applyOptionRule(buckets, q.id, id);
    }
    if (q.type === 'ranked_select' && Array.isArray(a.ranked)) {
      if (q.id === 'q5') applyRankedNiches(buckets, a.ranked);
      if (q.id === 'q10') applyRankedMonetization(buckets, a.ranked);
    }
  }

  return buckets;
}

export function buildCreatorIdentityProfile(
  answers: CreatorIdentityDraftAnswers,
  opts?: {
    version?: number;
    status?: CreatorIdentityProfile['status'];
    startedAt?: string;
    followupQuestionsAsked?: CreatorIdentityProfile['followup']['questionsAsked'];
    followupAnswers?: Record<string, string>;
  }
): CreatorIdentityProfile {
  const buckets = scoreAnswers(answers);
  const { primary, secondary } = primarySecondaryNiche(buckets.niche);
  const confidenceScore = computeConfidence(answers, buckets.niche, buckets.vibes);
  const clarityLevel = clarityFromConfidence(confidenceScore);

  const brandVibes = topKeys(buckets.vibes, 6) as BrandVibe[];
  const audienceDrivers = topKeys(buckets.audience, 5) as AudienceDriver[];
  const monetizationFits = topKeys(buckets.monetization, 5) as MonetizationFit[];

  const customInputs: CreatorIdentityProfile['customInputs'] = {
    extraNotes: [],
  };
  for (const [qid, text] of Object.entries(answers.openText)) {
    if (text?.trim()) customInputs.extraNotes!.push(`${qid}: ${text.trim()}`);
  }

  const base: CreatorIdentityProfile = {
    version: opts?.version ?? 1,
    status: 'completed',
    primaryNiche: primary,
    secondaryNiche: secondary,
    nicheModifier: null,
    nicheScores: buckets.niche,
    brandVibes,
    vibeScores: buckets.vibes,
    audienceDrivers,
    audienceDriverScores: buckets.audience,
    monetizationFits,
    monetizationScores: buckets.monetization,
    confidenceScore,
    clarityLevel,
    customInputs,
    generatedProfile: synthesizeGeneratedProfile({
      primary,
      secondary,
      brandVibes,
      audienceDrivers,
      monetizationFits,
      answers,
      nicheScores: buckets.niche,
    }),
    rawAnswers: answers,
    followup: {
      wasTriggered: Boolean(opts?.followupQuestionsAsked?.length || opts?.followupAnswers),
      questionsAsked: opts?.followupQuestionsAsked,
      answers: opts?.followupAnswers,
      resolvedAt: opts?.followupAnswers ? new Date().toISOString() : undefined,
    },
    ecosystemSync: {
      appliedToEchoFluxProfile: false,
      appliedToStrategyDefaults: false,
      appliedToCaptionDefaults: false,
      appliedToPremiumStudio: false,
      appliedToWitmePage: false,
    },
    timestamps: {
      startedAt: opts?.startedAt || new Date().toISOString(),
      completedAt: undefined,
      updatedAt: new Date().toISOString(),
    },
  };

  if (needsFollowup(confidenceScore, buckets.niche)) {
    base.status = 'needs_followup';
  } else {
    base.status = 'completed';
  }

  if (opts?.followupAnswers && Object.keys(opts.followupAnswers).length > 0) {
    base.confidenceScore = Math.min(100, base.confidenceScore + 12);
    base.clarityLevel = clarityFromConfidence(base.confidenceScore);
    base.status = 'completed';
  }

  if (base.status === 'completed') {
    base.timestamps.completedAt = new Date().toISOString();
  }

  return base;
}
