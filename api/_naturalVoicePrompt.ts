/**
 * Shared instructions so AI captions and ideas sound human—current and conversational,
 * not like stale AI templates or corporate marketing copy.
 */

export type NaturalVoiceContext = "caption" | "ideas" | "strategy" | "monetization";

/** Phrases models overuse from old viral templates—not "no slang ever." */
const STALE_AI_DEFAULT_PHRASES = [
  "spill the tea",
  "spilling the tea",
  "main character energy",
  "understood the assignment",
  "living rent free",
  "tell me you're",
  "tell me you are",
  "this is your sign",
  "that's it, that's the post",
  "thats it thats the post",
  "felt cute might delete",
  "no thoughts just vibes",
  "ate and left no crumbs",
  "POV:",
  "pov:",
  "gym vibes",
  "living my best life",
  "good vibes only",
  "feeling like a total boss",
  "leaning into the good life",
  "spill the tea, loves",
  "hey loves",
  "hey lovelies",
  "hottie",
  "hotty",
  "what's your vibe",
  "whats your vibe",
  "what's playing on the radio",
  "whats playing on the radio",
  "what's on the radio",
  "whats on the radio",
  "what are you listening to",
  "what do you think",
  "rate this 1-10",
  "double tap if",
  "who else",
  "am i the only one",
  "the vibe",
  "this vibe",
  "that vibe",
  "whole vibe",
  "love the vibe",
  "catch the vibe",
  "positive vibes",
  "bad vibes",
  "summer vibes",
  "night vibe",
  "the vibes",
  "giving vibes",
];

function contextGuidance(context: NaturalVoiceContext): string {
  switch (context) {
    case "ideas":
      return `- Hooks and captionStarter must be complete first-person copy the creator would actually post—not strategist notes.
- Titles name the post concept; hooks are the real caption voice (2–4 sentences, conversational).`;
    case "strategy":
      return `- Every "caption" field in the JSON must be paste-ready social copy in the creator's voice—not outlines or topic labels.
- Topics/descriptions can be strategic; captions must still sound human, current, and specific.`;
    case "monetization":
      return `- "idea", "description", and "cta" fields should sound like a creator planning their week—not a corporate deck.
- Keep monetization natural; avoid spammy hard-sell templates.`;
    default:
      return `- Write ready-to-post copy: specific, conversational, like something you'd actually type—not a marketing blurb.
- Ground in at least one concrete detail from the media or moment, then let voice + current trend language shape how it sounds.
- Questions are RARE. Default to ending on a statement, attitude line, or mood — not a question to the audience.`;
  }
}

export type EffectiveToneSettings = {
  formality?: number;
  humor?: number;
  empathy?: number;
  spiciness?: number;
  profanity?: number;
  emojiLevel?: number;
  randomSeed?: number;
};

function hasAnyToneSlider(ts: EffectiveToneSettings): boolean {
  return (
    typeof ts.formality === "number" ||
    typeof ts.humor === "number" ||
    typeof ts.empathy === "number" ||
    typeof ts.spiciness === "number" ||
    typeof ts.profanity === "number" ||
    typeof ts.emojiLevel === "number"
  );
}

/** Human-readable prompt lines for all Content Preferences tone sliders. */
export function buildToneSlidersPromptBlock(
  ts: EffectiveToneSettings,
  opts?: { secondaryToPersonalityOverride?: boolean },
): string {
  const lines: string[] = [];
  if (typeof ts.formality === "number") {
    const v = ts.formality;
    lines.push(
      `- Formality (${v}/100): ${v < 30 ? "Very casual — slang and informal phrasing OK" : v < 50 ? "Casual and conversational" : v < 70 ? "Balanced, slightly polished" : "Professional and polished"}`,
    );
  }
  if (typeof ts.humor === "number") {
    const v = ts.humor;
    lines.push(
      `- Humor (${v}/100): ${v < 30 ? "Mostly serious, minimal jokes" : v < 50 ? "Light occasional humor" : v < 70 ? "Witty and playful" : "Very funny, comedic energy"}`,
    );
  }
  if (typeof ts.empathy === "number") {
    const v = ts.empathy;
    lines.push(
      `- Warmth / Empathy (${v}/100): ${v < 30 ? "Direct and straightforward" : v < 50 ? "Friendly but not overly warm" : v < 70 ? "Warm and understanding" : "Very supportive, emotionally connected"}`,
    );
  }
  if (typeof ts.emojiLevel === "number") {
    const v = ts.emojiLevel;
    lines.push(
      `- Emoji usage (${v}/100): ${v < 20 ? "No emojis or at most one if absolutely natural" : v < 40 ? "0–1 emoji, sparingly" : v < 65 ? "1–3 emojis when they fit the tone" : v < 85 ? "2–4 emojis, expressive" : "3–6+ emojis, very emoji-rich when it fits"}`,
    );
  }
  if (typeof ts.spiciness === "number" && ts.spiciness > 0) {
    const v = ts.spiciness;
    lines.push(
      `- Spiciness / Boldness (${v}/100): ${v < 30 ? "Slightly suggestive" : v < 50 ? "Flirty and teasing" : v < 70 ? "Bold and provocative" : "Very bold and edgy when it fits the media"}`,
    );
  }
  if (typeof ts.profanity === "number" && ts.profanity > 0) {
    const v = ts.profanity;
    lines.push(
      `- Profanity (${v}/100): ${v < 30 ? "Very mild (damn, hell)" : v < 50 ? "Moderate casual swearing" : v < 70 ? "Frequent casual swearing" : "Heavy profanity OK when it fits the post"}`,
    );
  } else if (typeof ts.profanity === "number" && ts.profanity === 0) {
    lines.push("- Profanity (0/100): Keep language clean — no swearing");
  }
  if (lines.length === 0) return "";
  const header = opts?.secondaryToPersonalityOverride
    ? "TONE SLIDERS — ALL must be considered (secondary to Personality Override + goal; apply where they fit the override):"
    : "TONE SLIDERS — ALL must be considered (with AI personality + goal after media analysis):";
  return `${header}\n${lines.join("\n")}`;
}

export function hasToneSliderSettings(ts: EffectiveToneSettings): boolean {
  return hasAnyToneSlider(ts);
}

/** How slang, profanity, and spiciness should be applied (always within creator settings). */
export function getVoiceBoundariesBlock(usePersonalityOverride: boolean): string {
  if (usePersonalityOverride) {
    return `
SLANG, PROFANITY & SPICINESS (allowed — use when natural):
- Personality Override ON: follow the override's voice and boundaries FIRST, then GOAL + tone label, then ALL tone sliders (formality, humor, warmth, emoji usage, spiciness, profanity) where they fit.
- Slang, casual swearing, flirtiness, and spicy/bold lines are WELCOME when the override + goal support them — do not sanitize into generic "safe" marketing copy.
- If the override reads calm, classy, clean, or reserved, stay there — do not add profanity or heavy spice just because sliders are high.
- If the override (or goal + tone) supports edge, slang, or profanity, use it naturally — not forced every line, not censored when it fits.
- Match the PRIMARY GOAL — sales can be direct, flirty tone can tease, bold tone can push — still grounded in the media.`;
  }
  return `
SLANG, PROFANITY & SPICINESS (allowed — use when natural):
- Personality Override OFF: follow AI personality & training FIRST, then ALL tone sliders — formality, humor, warmth/empathy, emoji usage, spiciness, profanity — then tone label and GOAL.
- Slang, casual swearing, flirtiness, and spicy/bold lines are WELCOME when AI personality + sliders support them — do not default to bland, sanitized captions.
- Profanity slider > 0: use swearing at that level when it fits the moment. Spiciness slider > 0: flirt/tease/provoke at that level when it fits the media.
- If sliders are low or AI personality is clean/professional, keep it there — do not add edge the creator did not configure.
- Never add profanity or spice "for shock value" alone; it must fit the creator's configured voice and the post.`;
}

/** Step order for caption generation when media is attached. */
export function getCaptionVoicePriorityBlock(
  usePersonalityOverride: boolean,
  hasMedia: boolean,
): string {
  const boundaries = getVoiceBoundariesBlock(usePersonalityOverride);
  if (!hasMedia) {
    return `${usePersonalityOverride
      ? `VOICE ORDER: (1) Personality Override (2) GOAL + tone label (3) current trend language when provided (4) AI personality & tone sliders where they fit.`
      : `VOICE ORDER: (1) AI personality & training (2) tone sliders + tone label + GOAL (3) current trend language when provided.`}
${boundaries}`;
  }
  if (usePersonalityOverride) {
    return `
CAPTION CREATION ORDER (Personality Override ON — follow exactly):
1. PERSONALITY OVERRIDE — primary voice, vocabulary, attitude, humor, flirt level, profanity/spice boundaries.
2. ANALYZE the attached image/video — include at least one concrete visible detail (outfit, pose, setting, object, lighting, expression, car, room, etc.).
3. PRIMARY GOAL + tone label — shape angle and energy (engagement, sales, flirty, bold, etc.).
4. CURRENT TREND LANGUAGE — when trend research is provided, weave in hot phrasing that fits this creator + this media.
5. ALL tone sliders (formality, humor, warmth, emoji usage, spiciness, profanity) + AI personality — refine only where they fit the override; override wins conflicts.
${boundaries}
- Do NOT force a question or CTA. A confident statement or specific observation is often better than engagement bait.`;
  }
  return `
CAPTION CREATION ORDER (Personality Override OFF — follow exactly):
1. ANALYZE the attached image/video FIRST — caption must reference what is actually visible.
2. AI personality & training (Settings → Profile & AI) — primary voice.
3. ALL tone sliders (formality, humor, warmth, emoji usage, spiciness, profanity) + tone label + PRIMARY GOAL.
4. CURRENT TREND LANGUAGE — when trend research is provided, use hot phrasing that fits AI personality + media.
${boundaries}
- Do NOT force a question or CTA. Ground the caption in the media, then sound current and human—not sanitized or templated.`;
}

export function isCheesyCaption(
  text: string,
  opts?: { personalityAllowsVibe?: boolean },
): boolean {
  const t = String(text || "").trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  if (STALE_AI_DEFAULT_PHRASES.some((p) => lower.includes(p.toLowerCase()))) return true;
  if (!opts?.personalityAllowsVibe && /\bvibes?\b/i.test(t)) return true;
  const patterns = [
    /\bhottie\b/i,
    /\bhotty\b/i,
    /what'?s playing on the radio/i,
    /what'?s on the radio/i,
    /what'?s your vibe/i,
    /what'?s your go-?to/i,
    /what do you think/i,
    /tell me in the comments/i,
    /this beauty for a (midnight )?cruise/i,
    /about to take this beauty/i,
  ];
  if (patterns.some((r) => r.test(t))) return true;
  if (/\?\s*$/.test(t) && /(radio|vibe|go-?to|hottie|hotty|who else|rate this|comment)/i.test(t)) return true;
  return false;
}

/** Hard rules against cheesy AI captions (questions, pet names, invented scenarios). */
export function getAntiLameCaptionBlock(): string {
  return `
NO LAME / CHEESY CAPTIONS (HARD RULES — caption outputs only):
- Default: 1–3 sentences, first-person creator POV, at least one concrete detail from the media → END on a statement (not a question).
- Do NOT end with engagement-bait questions: "what's playing on the radio", "what's your vibe", "what's your go-to", "what do you think", "tell me…", "who else…", "am I the only one…", "comment your…", "rate this…".
- Do NOT use cringe fan-address pet names unless Personality Override literally uses that exact term: hottie, hotty, bestie, loves, lovelies, babe (as generic audience address).
- Do NOT invent scenes the media does not support (radio/playlist, midnight cruise, road trip, "this beauty" car hype) unless clearly shown or the personality always talks that way.
- Do NOT use "vibe" or "vibes" unless Personality Override literally contains that word — use specific words instead: mood, lighting, energy, attitude, tone, feel, look, setting, moment.
- For engagement goals: earn attention with a bold statement, specific detail, or attitude — NOT a quiz question tacked on the end.

BAD — never write like this:
"About to take this beauty for a midnight cruise. 😈 What's playing on the radio tonight, hottie?"

GOOD — aim for this quality:
"Off-shoulder black, heels on concrete, Mercedes hood catching the garage light. Night out started right here."
"Leaning on the grille in this dress — fluorescent light, zero rush."`.trim();
}

/** Extra guidance when weekly/live trend research is present in the prompt. */
export function getTrendingLanguageGuidanceBlock(hasTrendContext: boolean): string {
  if (!hasTrendContext) {
    return `
CURRENT LANGUAGE:
- Write how people talk on social right now: casual, direct, platform-native.
- Avoid stale AI-default phrases (see stale ban list)—prefer fresh, natural wording even without explicit trend data.`;
  }
  return `
CURRENT / TRENDING LANGUAGE (USE THIS — sounds human and of-the-moment):
- Trend research appears elsewhere in this prompt. USE current hooks, slang, and phrasing people are actually saying on Instagram, TikTok, X, and creator platforms RIGHT NOW.
- Weave trend language in naturally—like someone who scrolls daily—not like a bot checking off a glossary.
- Slang from trends is encouraged when it fits the creator's personality/tone sliders and goal—not banned, just natural.
- Trend phrasing must still fit: (a) this creator's personality/tone, (b) what's in the media, (c) the platform.
- Prefer CURRENT hot phrases from the research over dead 2022–2024 viral templates in the stale ban list below.
- One well-placed current phrase + a specific detail beats generic hype ("vibes", "energy", "living my best life").
- Do NOT lean on "vibe/vibes" as a crutch — name what you actually mean (mood, lighting, attitude, tone, feel).`;
}

/** Prompt block injected into Gemini requests for captions, ideas, strategy, and monetization plans. */
export function getNaturalVoicePromptBlock(
  context: NaturalVoiceContext = "caption",
  opts?: { hasTrendContext?: boolean; usePersonalityOverride?: boolean },
): string {
  const staleBanned = STALE_AI_DEFAULT_PHRASES.map((p) => `"${p}"`).join(", ");
  const trendingBlock = getTrendingLanguageGuidanceBlock(Boolean(opts?.hasTrendContext));
  const useOverride = Boolean(opts?.usePersonalityOverride);
  const boundariesBlock = getVoiceBoundariesBlock(useOverride);
  return `
NATURAL HUMAN VOICE (CRITICAL — all generated text):
- Sound like a real person posting from their phone: natural rhythm, current language, specific details.
${contextGuidance(context)}
- Vary sentence length; avoid robotic paragraph shapes.
- Humor, slang, profanity, and spicy/bold lines are all allowed when they fit the creator's configured voice (see SLANG/PROFANITY/SPICINESS rules below)—never sanitize into bland "brand safe" copy by default.
- When Personality Override is provided, match THAT voice first, then layer current trend language only where it fits the override.

${trendingBlock}

${boundariesBlock}

STALE AI-DEFAULT PHRASES (hard ban — models overuse these; they sound fake even when "trendy"):
Do NOT use: ${staleBanned}.
Also avoid empty filler: "loving this moment", "feeling grateful", "so grateful", "check this out", "can't even", "obsessed with this", "here for it", "that time of year", "vibe", "vibes" (use mood/lighting/energy/attitude instead — unless Personality Override uses "vibe").
On Fan Hub / My Page: never "link in bio" (fans are already on the page).

ENGAGEMENT (captions):
- DEFAULT: no closing question. ~90% of captions should end on a statement.
- Questions are rare — only when genuinely natural, not as a template.
- Never use recycled hooks: "tell me in the comments", "what's your go-to", "what's your vibe", "what's playing on…", "who relates?", "this is your sign".
- Engagement goal ≠ mandatory question. A sharp line about what's in the photo beats "what do you think?" every time.

${context === "caption" ? getAntiLameCaptionBlock() : ""}

FINAL CHECK:
- Would a real creator in this niche post this today? If it sounds like ChatGPT circa 2023, rewrite with current language + one specific detail from the media or moment.
`.trim();
}
