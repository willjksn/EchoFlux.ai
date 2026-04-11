import { buildCreatorIdentityProfile } from './engine';
import type { CreatorIdentityDraftAnswers } from './types';

/** Minimal structured answers for Storybook / manual QA of the results UI. */
export const MOCK_CREATOR_IDENTITY_ANSWERS: CreatorIdentityDraftAnswers = {
  structured: {
    q1: { selected: 'energy_confidence' },
    q2: { selected: ['connected', 'want_access', 'exclusive_content'] },
    q3: { selected: ['confidence', 'want_access'] },
    q4: { selected: ['talking_cam', 'premium_access_style'] },
    q5: { ranked: ['personal_access', 'lifestyle', 'dating_flirt'] },
    q6: { selected: ['confident', 'playful', 'exclusive'] },
    q7: { selected: 'premium_exclusive' },
    q8: { selected: ['closer', 'excited'] },
    q9: { selected: 'access' },
    q10: { ranked: ['membership', 'private_messages', 'locked_content'] },
    q11: { selected: 'membership' },
    q12: { selected: 'tie_together' },
    q13: { scale: 3 },
  },
  openText: {
    q14: 'The creator who makes fans feel seen and a little bolder every day.',
    q15: 'Talking to camera and sharing real, unfiltered wins.',
    q16: 'Direct warmth and permission to be confident without the noise.',
    q17: '',
  },
};

export const MOCK_CREATOR_IDENTITY_PROFILE = buildCreatorIdentityProfile(MOCK_CREATOR_IDENTITY_ANSWERS, {
  version: 99,
});
