/**
 * Shared instructions so AI captions, post ideas, and plans sound human—not generic viral filler.
 */

export type NaturalVoiceContext = "caption" | "ideas" | "strategy" | "monetization";

const BANNED_PHRASES = [
  "spill the tea",
  "spilling the tea",
  "say less",
  "it's giving",
  "its giving",
  "main character energy",
  "understood the assignment",
  "rent free",
  "living rent free",
  "low-key obsessed",
  "lowkey obsessed",
  "obsessed with this",
  "tell me you're",
  "tell me you are",
  "this is your sign",
  "that's it, that's the post",
  "thats it thats the post",
  "don't mind me just",
  "dont mind me just",
  "felt cute might delete",
  "IYKYK",
  "iykyk",
  "no thoughts just vibes",
  "chef's kiss",
  "chefs kiss",
  "ate and left no crumbs",
  "slay",
  "periodt",
  "bestie",
  "the way I",
  "not me",
  "POV:",
  "pov:",
  "gym vibes",
  "fit check",
  "that girl",
  "girl boss",
  "hot girl walk",
  "living my best life",
  "vibes only",
  "good vibes only",
  "energy check",
  "romanticize your life",
  "soft life",
  "that era",
  "core aesthetic",
  "it hits different",
  "hits different",
  "we love to see it",
  "say it louder",
  "literally me",
  "I'm literally",
  "touch grass",
  "delulu",
  "snatched",
  "serving looks",
  "ate that",
  "no cap",
  "girlie",
  "babe era",
  "here for it",
  "living for this",
  "let that sink in",
  "game changer",
  "level up",
  "glow up",
  "manifesting",
  "aligned",
  "adulting",
  "self-care sunday",
  "sunday scaries",
  "monday mood",
];

function contextGuidance(context: NaturalVoiceContext): string {
  switch (context) {
    case "ideas":
      return `- Hooks and captionStarter must be complete first-person copy the creator would actually post—not strategist notes.
- Titles name the post concept; hooks are the real caption voice (2–4 sentences, conversational).`;
    case "strategy":
      return `- Every "caption" field in the JSON must be paste-ready social copy in the creator's voice—not outlines or topic labels.
- Topics/descriptions can be strategic; captions must still sound human and specific.`;
    case "monetization":
      return `- "idea", "description", and "cta" fields should sound like a creator planning their week—not a corporate deck.
- Keep monetization natural; avoid spammy hard-sell templates.`;
    default:
      return `- Write ready-to-post copy: specific, conversational, like something you'd actually type—not a marketing blurb.
- Open with a real observation, memory, joke, or question—not a recycled trend template.`;
  }
}

/** Prompt block injected into Gemini requests for captions, ideas, strategy, and monetization plans. */
export function getNaturalVoicePromptBlock(
  context: NaturalVoiceContext = "caption",
): string {
  const banned = BANNED_PHRASES.map((p) => `"${p}"`).join(", ");
  return `
NATURAL HUMAN VOICE (CRITICAL — all generated text):
- Sound like a real person posting from their phone: natural rhythm, plain words, specific details.
${contextGuidance(context)}
- Prefer one concrete detail (place, object, feeling, small story) over abstract hype ("vibes", "energy", "moment").
- Vary sentence length; avoid three identical paragraph shapes in a row.
- Humor should come from the moment, not pasted-in internet humor.
- When Personality Override is provided, match THAT voice exactly—do not layer generic influencer slang on top.

BANNED AI / VIRAL CLICHÉS (unless Personality Override literally uses the exact phrase):
Do NOT use: ${banned}.
Also avoid filler: "loving this moment", "feeling grateful", "so grateful", "vibes", "check this out", "can't even", "obsessed", "living for this", "here for it", "that time of year".
On Fan Hub / My Page: never "link in bio" (fans are already on the page).

TRENDS:
- Trends inform topics and timing only—never copy trend-speak into hooks or captions.

FINAL CHECK:
- If the line could be posted by any random creator in this niche unchanged, rewrite with one detail only THIS post/creator would say.
`.trim();
}
