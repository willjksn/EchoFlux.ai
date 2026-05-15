import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { getModelForTask } from "./_modelRouter.js";
import { stripWelcomeNamePlaceholder } from "./_memberWelcomeDm.js";

const WELCOME_TONES = new Set(["personality", "warm", "flirty"]);

function parseJsonBody(req: VercelRequest): Record<string, unknown> {
  const b = req.body as unknown;
  if (b == null || b === "") return {};
  if (typeof b === "string") {
    try {
      const p = JSON.parse(b) as unknown;
      return p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(b)) {
    try {
      const p = JSON.parse(b.toString("utf8")) as unknown;
      return p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (typeof b === "object" && !Array.isArray(b)) return b as Record<string, unknown>;
  return {};
}

function normalizeRequestTone(raw: string): string {
  const t = raw.trim().toLowerCase();
  if (t === "direct" || t === "bold" || t === "soft") return "warm";
  return t;
}

function toneGuidance(tone: string): string {
  switch (tone) {
    case "flirty":
      return `Tone: FLIRTY & PLAYFUL — toolkit-style DM: texting someone you're into after they tapped in; warmth first, playful tension second; confident, never crude.
MUST weave TWO concrete membership specifics from CONTEXT (what lands in member DMs first, cadence, drops/voice notes — paraphrase CONTEXT).
ALIGNMENT: Same rhythm as Subscriber Messaging Toolkit welcome copy — punchy clauses, creator-first ("I/my"), casual shorthand sparingly — NOT billboard captions.`;
    case "warm":
      return `Tone: WARM & GENUINE — toolkit-style retention DM: relaxed confidence; glad they're in YOUR member inbox.
MUST give TWO vivid anchors from CONTEXT (topics from bio, hub name, what members actually get).
ALIGNMENT: Same rhythm as Subscriber Messaging Toolkit welcome Day-0 energy — human texting energy, conversion-soft invite to reply — NOT SaaS onboarding paragraphs.`;
    default:
      return "";
  }
}

/** Draft failed substance checks — retry generation. Preset tones use toolkit-length floor. */
function isLowEffortWelcomeDraft(text: string, subscriberToolkitPreset: boolean): boolean {
  const t = text.trim();
  const minLen = subscriberToolkitPreset ? 340 : 480;
  if (t.length < minLen) return true;
  const lower = t.toLowerCase();
  const thanksCap = subscriberToolkitPreset ? 620 : 720;
  if (/\bi see you\b/.test(lower)) return true;
  if (/\bthanks for joining\b/.test(lower) && t.length < thanksCap) return true;
  if (/\b(so excited you(re|'re)? here|super excited you joined)\b/.test(lower) && t.length < thanksCap) return true;
  if (/👋/.test(t) && (/\bhere\b/i.test(t) || /\bthanks for joining\b/i.test(lower))) return true;
  if (/\bi\s*'?m\s+aware\b/i.test(lower)) return true;
  if (/\bwe\s+'?re\s+aware\b/i.test(lower)) return true;
  if (/\b(just\s+so\s+you\s+know|fyi)[,\s]+i\s*'?m\s+aware\b/i.test(lower)) return true;
  if (/\b(it'?s\s+\w+\s+here|hey[, ]+\w+\s+here)\b/i.test(lower)) return true;
  return false;
}

/** Last resort if the model still emits dismissive acknowledgement phrases. */
function stripDismissiveAwareLanguage(text: string): string {
  return text
    .replace(/\bi\s*'?m\s+aware\b/gi, "")
    .replace(/\bwe\s+'?re\s+aware\b/gi, "")
    .replace(/\s*,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.!?])/g, "$1")
    .trim();
}

function nameInjectPrefix(tone: string): string {
  if (tone === "flirty") return "{{name}} — okay hi. ";
  return "{{name}} — hey. ";
}

/** Premium Studio Subscriber Messaging Toolkit cues — Warm / Flirty presets only (see OnlyFansContentBrain messaging tab). */
function subscriberToolkitPresetSection(tone: string): string {
  return `
=== SUBSCRIBER MESSAGING TOOLKIT STYLE (${tone}) ===
(This applies ONLY for Warm / Flirty presets — NOT Creator Personality mode.)

PERSPECTIVE:
- Write FROM the creator texting their inbox — steady mix of first person ("I", "my", "me") and natural "you". They already joined — never pitch subscribing.

CADENCE:
- Short, retention-aware clauses like toolkit welcome sequences (~5–14 words before a breath); reads copy-paste ready — NOT formal paragraphs or onboarding brochures.

NATURAL LANGUAGE:
- Light creator shorthand sparingly when it fits membership chat (DM/DMs, drops, tips, unlocks, early access) — organic, not jargon bingo.

OPTIONAL WARMTH:
- Casual tokens ("love", "babe", "hun") ONLY when they fit ${tone} AND CONTEXT niche — skip if forced.

TOOLKIT RULES:
- Manual vibe — never claim integrations or automated sequences inside the message text.
- Still obey global BANNED list — no corporate clichés, no "Creator Name here 👋".`;
}

function toneQualityExamples(tone: string, includeMemberFirstName: boolean): string {
  const lead = includeMemberFirstName ? "{{name}} — " : "";
  switch (tone) {
    case "warm":
      return `
=== WARM — BAD vs GOOD ===
BAD: "${lead}Thanks for joining! So excited you're here! 🎉 Let me know if you need anything!"
GOOD: "${lead}hey love — you're in my member DMs now. I dump voice notes + messy cuts here before they touch my feed… tap back with what finally made you join."`;
    case "flirty":
      return `
=== FLIRTY / PLAYFUL — BAD vs GOOD ===
BAD: "Hey, Alex here. 👋 Thanks for joining! I see you. 😉"
BAD: "${lead}Thanks for joining! So happy you're here 💕"
GOOD: "${lead}hey babe okay you're officially mine now (member-wise 😏). My inbox gets the unfiltered drops + voice notes — reply with something chaotic you liked from my page."`;
    default:
      return "";
  }
}

function buildToneQualityExtras(
  tone: string,
  useSavedPersonalityVoice: boolean,
  includeMemberFirstName: boolean,
): string {
  if (useSavedPersonalityVoice) {
    return `

=== CREATOR PERSONALITY MODE — QUALITY BAR ===
- Mirror THEIR saved voice — never lazy shortcuts: no "thanks for joining!", no "it's [name] here 👋", no empty "I see you", no pamphlet-length fluff with zero nouns.
- ~550–950 characters; weave at least TWO concrete member-facing specifics (from personality facts + bio/community/handle niche).
- If personality notes are messy, translate into clear gifts-of-membership — always ground in CONTEXT anchors when possible.`;
  }
  const examples = toneQualityExamples(tone, includeMemberFirstName);
  const emotional =
    tone === "flirty"
      ? `
=== FLIRTY — NON-NEGOTIABLE ===
- Inviting + lightly magnetic — never curt, passive-aggressive, or generic-brand-flirty.
- Do NOT brush off with "later…" vibes or stiff dismissive acknowledgements — sound glad they showed up, not like paperwork.`
      : `
=== PRESET WELCOME BAR (${tone}) ===
- They chose YOU — genuinely glad they arrived for THIS vibe; never transactional-brushoff.`;

  return `${emotional}${examples}`;
}

function buildWelcomePrompt(opts: {
  tone: string;
  useSavedPersonalityVoice: boolean;
  includeMemberFirstName: boolean;
  personalityVoiceBlock: string;
  personalityFactsOnlyBlock: string;
  storefrontSection: string;
  voicePriorityBlock: string;
  tonePackBlock: string;
  toneQualityExtras: string;
  retryPreamble?: string;
  rejectedDraft?: string;
  attemptIndex?: number;
}): string {
  const {
    tone,
    useSavedPersonalityVoice,
    includeMemberFirstName,
    personalityVoiceBlock,
    personalityFactsOnlyBlock,
    storefrontSection,
    voicePriorityBlock,
    tonePackBlock,
    toneQualityExtras,
    retryPreamble,
    rejectedDraft,
    attemptIndex,
  } = opts;

  const subscriberToolkitPreset = !useSavedPersonalityVoice;

  const jobParagraph = subscriberToolkitPreset
    ? `Write ONE welcome DM in the SAME SPIRIT as Premium Studio → Subscriber Messaging Toolkit → Welcome sequence (Day 0 energy): creator texting from their inbox — punchy, casual, retention-aware, paste-ready — grounded in CONTEXT below (never generic influencer filler).`
    : `Write ONE welcome DM sent seconds after someone joins (paid or free). Reward their attention with specificity. Follow CREATOR PERSONALITY voice — never SaaS onboarding, never creator-meta clichés ("thanks for joining", "X here 👋"), never brochure cadence.`;

  const lengthGuidance = subscriberToolkitPreset
    ? `- Length: about 380–780 characters — tight like Subscriber Messaging Toolkit subscriber DMs (one thumb-scroll); still TWO concrete member perks + one easy reply invite.`
    : `- Length: about 550–950 characters — dense with concrete nouns; honor CREATOR PERSONALITY pacing — not an essay.`;

  const pronounGuidance = subscriberToolkitPreset
    ? `- Voice: toolkit DM rhythm — creator-first ("I", "my", "me") blended with natural "you"; never third-person corporate ("the subscriber").`
    : `- Address them naturally with "you"; mirror CREATOR PERSONALITY for cadence and how much "I/we" appears.`;

  const structureAlign = useSavedPersonalityVoice ? "aligned to their saved voice" : `aligned to the ${tone} preset`;

  const emojiRule = useSavedPersonalityVoice
    ? "at most TWO total, consistent with CREATOR PERSONALITY when set"
    : `at most TWO total, consistent with the ${tone} preset (not necessarily with personality notes)`;

  const nameHardRules = includeMemberFirstName
    ? `- Include the literal token {{name}} exactly ONCE, placed where a first-name greeting feels natural (usually opening clause). Example okay shapes: "{{name}} — hey…" or "hey {{name}}…"`
    : `- Do NOT include the fan's real name or any placeholder like {{name}} — greet generically ("hey", "hey there") while staying personal toward "you".`;

  const structureLine1 = includeMemberFirstName
    ? `1) Hook + {{name}} + opening energy ${structureAlign}.`
    : `1) Strong opener + opening energy ${structureAlign} (no names).`;

  const styleGoodToolkit = includeMemberFirstName
    ? `GOOD (toolkit vibe): "{{name}} — hey love, you're in my member DMs now. I drop voice notes + messy cuts here before they touch my feed… tap back what hooked you."`
    : `GOOD (toolkit vibe): "hey — you're in my member DMs now. I drop voice notes + messy cuts here before they touch my feed… tap back what hooked you."`;

  const styleGoodPersonality = includeMemberFirstName
    ? `GOOD: "{{name}} — hey. Glad you made it past the boring side of the internet. I dump scrappy voice notes here before anything hits the feed; if you're weird in the replies we're gonna get along. What made you tap join?"`
    : `GOOD: "hey — glad you made it past the boring side of the internet. I dump scrappy voice notes here before anything hits the feed; if you're weird in the replies we're gonna get along. What made you tap join?"`;

  const styleGood = subscriberToolkitPreset ? styleGoodToolkit : styleGoodPersonality;

  const retryBlock =
    retryPreamble && rejectedDraft != null
      ? `
=== REGENERATION REQUIRED (${attemptIndex != null ? `attempt ${attemptIndex + 1}` : "retry"}) ===
${retryPreamble}

FAILED DRAFT (do not imitate — replace entirely):
---
${rejectedDraft.slice(0, 1200)}
---

`
      : "";

  return `${retryBlock}You are an elite ghostwriter for creator → fan DMs on a subscription membership product.

JOB: ${jobParagraph}

=== HARD RULES ===
- Output ONLY the message text. No title, no quotes, no preamble.
- Plain text. No Markdown. No bullet characters. No hashtags unless they truly fit the voice (usually skip).
${lengthGuidance}
${pronounGuidance}
- Never label them "subscriber", "customer", or "user".
${nameHardRules}
- Emoji: ${emojiRule}; zero emojis is fine — never 👋 as punctuation decoration.
- Never introduce yourself broadcast-style: NO "it's [your name] here", NO "[Name] here 👋", NO stage-host energy — they're already in YOUR inbox.
- Never acknowledge their join like customer support — no stiff first-person-plus-aware phrasing; use warmth or specifics instead.
- This message must feel like a real welcome: glad they're here and leaning IN — never sarcastic-at-the-fan, dismissive, chilly, or brochure-copy.

=== BANNED (cheap / influencer-script / hollow) ===
- Corporate onboarding clichés: "welcome aboard", "thrilled you're here", "thanks for subscribing", "excited to have you", "we appreciate your support", "exclusive content awaits", "don't hesitate to reach out", "feel free to", "hope you're doing well"
- Empty gratitude blobs: standalone "thanks for joining", "thanks for being here", "so glad you're here" without immediate concrete specifics in the SAME message
- Parasocial-meta flirt clichés: "I see you", "I see you 😉", "welcome to the family", "officially part of the…"
- Passive-aggressive / brush-off: postponing warmth ("I'll deal with it later"), curt ticket-counter tone ("when I get around to it"), "whatever", "not now"

=== REQUIRED STRUCTURE (blend smoothly — no labeled sections) ===
${structureLine1}
2) Two concrete glimpses of what membership is like here (formats, cadence, tone of replies — grounded in CONTEXT below; paraphrase bio/community/handle niche — never invent unrelated claims).
3) One soft invitation to reply with something easy ("what pulled you in?", "say hi", etc.) — not demanding.
4) At least ONE phrase must clearly tie to STOREFRONT CONTEXT when present (community/hub name, bio topic, niche implied by handle). If CONTEXT is thin, infer plausible on-brand specifics — never stay generic.

${voicePriorityBlock}

${tonePackBlock}
${toneQualityExtras}
${subscriberToolkitPreset ? `\n${subscriberToolkitPresetSection(tone)}\n` : ""}

=== CONTEXT ===
${useSavedPersonalityVoice ? personalityVoiceBlock : personalityFactsOnlyBlock}

STOREFRONT / PUBLIC CONTEXT:
${storefrontSection || "(minimal)"}

=== STYLE REFERENCES (do NOT copy wording; match specificity level) ===
BAD: "Welcome! Thanks for joining. Enjoy exclusive updates!"
${styleGood}

Now write the single DM:`;
}

/**
 * POST — authenticated creator drafts a membership welcome DM (My Page automation field).
 * Body (optional JSON): { tone?, includeMemberFirstName? } — includeMemberFirstName defaults true.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const uid = decoded.uid;
  const rl = await enforceRateLimit({
    req,
    res,
    keyPrefix: "generateMemberWelcomeDraft",
    limit: 30,
    windowMs: 60 * 60 * 1000,
    identifier: uid,
  });
  if (!rl) return;

  try {
    const body = parseJsonBody(req);
    const toneRaw = typeof body.tone === "string" ? body.tone.trim().toLowerCase() : "";
    const migrated = normalizeRequestTone(toneRaw);
    const tone = WELCOME_TONES.has(migrated) ? migrated : "personality";
    const useSavedPersonalityVoice = tone === "personality";
    const includeMemberFirstName = body.includeMemberFirstName !== false;

    const db = getAdminDb();
    const userSnap = await db.collection("users").doc(uid).get();
    const u = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};

    const settings = u.settings && typeof u.settings === "object" ? (u.settings as Record<string, unknown>) : {};
    const creatorPersonality =
      (typeof u.creatorPersonality === "string" && u.creatorPersonality.trim()
        ? u.creatorPersonality.trim()
        : typeof settings.creatorPersonality === "string"
          ? settings.creatorPersonality.trim()
          : "") || "";
    const displayName = typeof u.name === "string" ? u.name.trim() : "";
    const bio = typeof u.bio === "string" ? u.bio.trim() : "";

    const creatorSnap = await db.collection("creators").doc(uid).get();
    const c = creatorSnap.exists ? (creatorSnap.data() as Record<string, unknown>) : {};
    const handle = typeof c.handle === "string" ? c.handle.trim() : "";
    const storefrontDisplay = typeof c.displayName === "string" ? c.displayName.trim() : "";
    const fanAuth = c.fanAuthBranding && typeof c.fanAuthBranding === "object" ? (c.fanAuthBranding as Record<string, unknown>) : {};
    const communityName =
      typeof fanAuth.communityName === "string" && fanAuth.communityName.trim()
        ? fanAuth.communityName.trim()
        : "";

    const personalityVoiceBlock = creatorPersonality
      ? `CREATOR PERSONALITY / VOICE — match closely (vocab, pacing, emoji habits, humor, boundaries):\n${creatorPersonality}`
      : `CREATOR PERSONALITY: Not saved in Settings yet — infer a distinctive voice from bio + storefront context; avoid generic influencer clichés.`;

    const personalityFactsOnlyBlock = creatorPersonality
      ? `CREATOR PERSONALITY / SETTINGS NOTES — use ONLY for facts (what they offer, boundaries, topics). Do NOT mirror their wording or rhythm; the preset tone above owns voice.\n${creatorPersonality}`
      : `CREATOR PERSONALITY: Not saved — take light factual hints from bio/storefront only; voice comes entirely from the preset tone.`;

    const storefrontSection = [
      `Creator display name: ${displayName || "(not set)"}`,
      storefrontDisplay && storefrontDisplay !== displayName ? `Storefront display name: ${storefrontDisplay}` : "",
      handle ? `Handle: @${handle}` : "",
      communityName ? `Community / hub name fans see: "${communityName}"` : "",
      bio ? `Bio excerpt:\n${bio.slice(0, 420)}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const voicePriorityBlock = useSavedPersonalityVoice
      ? `=== VOICE (PRIMARY) ===
CREATOR PERSONALITY MODE: The CREATOR PERSONALITY section defines how this DM sounds. Follow it closely.

If personality text is empty/missing above, infer voice only from bio + storefront — still sound like a specific human, not a template.`
      : `=== VOICE PRIORITY ===
PRESET TONE (${tone}): The TONE PACK below defines cadence and vibe. It wins over CREATOR PERSONALITY for voice.

Use CREATOR PERSONALITY only for factual grounding (offerings, boundaries, topics). If personality reads shy but tone is flirty, write flirty anyway — keep facts accurate.`;

    const tonePackBlock = useSavedPersonalityVoice
      ? `(No preset tone — saved creator personality drives voice.)`
      : `=== TONE PACK (${tone}) ===
${toneGuidance(tone)}`;

    const toneQualityExtras = buildToneQualityExtras(tone, useSavedPersonalityVoice, includeMemberFirstName);

    const subscriberToolkitPreset = !useSavedPersonalityVoice;

    const basePromptArgs = {
      tone,
      useSavedPersonalityVoice,
      includeMemberFirstName,
      personalityVoiceBlock,
      personalityFactsOnlyBlock,
      storefrontSection,
      voicePriorityBlock,
      tonePackBlock,
      toneQualityExtras,
    };

    const model = await getModelForTask("member-welcome-draft", uid);

    let text = "";
    let rejected = "";
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const prompt = buildWelcomePrompt({
        ...basePromptArgs,
        retryPreamble:
          attempt > 0
            ? subscriberToolkitPreset
              ? `Prior draft failed substance checks (too long-winded, thin on specifics, or clichéd). Rewrite FROM SCRATCH in Subscriber Messaging Toolkit style: ~380–780 chars; punchy creator-first clauses; TWO concrete perks from CONTEXT; easy reply invite; obey banned list.`
              : `Prior draft failed substance checks (too short, thin on specifics, or clichéd). Rewrite FROM SCRATCH: ~550–950 chars; TWO concrete membership specifics from CONTEXT; tie visibly to bio/community/handle when possible; obey banned list absolutely.`
            : undefined,
        rejectedDraft: attempt > 0 ? rejected : undefined,
        attemptIndex: attempt > 0 ? attempt : undefined,
      });

      const out = await model.generateContent(prompt);
      text = typeof out.response?.text === "function" ? out.response.text().trim() : "";
      text = text.replace(/^["「]|["」]$/g, "").trim();

      if (!isLowEffortWelcomeDraft(text, subscriberToolkitPreset)) break;
      rejected = text;
    }

    if (!text) {
      return res.status(502).json({ error: "Empty model response", code: "EMPTY_OUTPUT" });
    }
    if (includeMemberFirstName) {
      if (!/\{\{\s*name\s*\}\}/i.test(text)) {
        const lines = text.split("\n").filter(Boolean);
        const inject = nameInjectPrefix(tone);
        text =
          lines.length > 0
            ? `${inject}${lines[0]}${lines.length > 1 ? "\n" + lines.slice(1).join("\n") : ""}`
            : `${inject}${text}`;
      }
    } else {
      text = stripWelcomeNamePlaceholder(text);
    }

    text = stripDismissiveAwareLanguage(text);

    return res.status(200).json({ text: text.slice(0, 2800), tone, includeMemberFirstName });
  } catch (e: unknown) {
    console.error("generateMemberWelcomeDraft:", e);
    return res.status(500).json({
      error: "Failed to generate draft",
      message: e instanceof Error ? e.message : String(e),
    });
  }
}
