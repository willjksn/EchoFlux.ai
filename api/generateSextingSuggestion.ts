import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, withErrorHandling } from "./_errorHandler.js";
import { getModelForTask } from "./_modelRouter.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { getEmojiInstructions, getEmojiExamplesForTone } from "./_emojiHelper.js";
import { parseJSON } from "./_geminiShared.js";
import { getAdminDb } from "./_firebaseAdmin.js";

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    res.status(200).json({
      success: false,
      error: "AI not configured",
      note: apiKeyCheck.error,
    });
    return;
  }

  // Auth
  let user;
  try {
    const verifyAuth = await getVerifyAuth();
    user = await verifyAuth(req);
  } catch (authError: any) {
    console.error("[generateSextingSuggestion] auth error:", authError);
    res.status(200).json({
      success: false,
      error: "Authentication error",
      note: authError?.message || "Failed to verify authentication.",
    });
    return;
  }

  if (!user) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  // Rate limit per user
  const ok = await enforceRateLimit({
    req,
    res,
    keyPrefix: "generateSextingSuggestion",
    limit: 8,
    windowMs: 60_000,
    identifier: user.uid,
  });
  if (!ok) return;

  const rawBody = (req.body || {}) as Record<string, unknown>;
  const sessionContext =
    rawBody.sessionContext && typeof rawBody.sessionContext === "object" && !Array.isArray(rawBody.sessionContext)
      ? (rawBody.sessionContext as Record<string, unknown>)
      : {};
  let fanContext = typeof rawBody.fanContext === "string" ? rawBody.fanContext : "";
  let personalityContext = typeof rawBody.personalityContext === "string" ? rawBody.personalityContext : "";
  let conversationHistory = typeof rawBody.conversationHistory === "string" ? rawBody.conversationHistory : "";
  let lastFanMessage = typeof rawBody.lastFanMessage === "string" ? rawBody.lastFanMessage : "";
  const emojiEnabled = rawBody.emojiEnabled;
  const emojiIntensityRaw = rawBody.emojiIntensity;
  const emojiIntensity =
    typeof emojiIntensityRaw === "number" && Number.isFinite(emojiIntensityRaw) ? emojiIntensityRaw : 5;
  const numSuggestionsRequested =
    typeof rawBody.numSuggestions === "number" && Number.isFinite(rawBody.numSuggestions) && rawBody.numSuggestions > 0
      ? Math.min(20, Math.floor(rawBody.numSuggestions))
      : undefined;

  /** Premium Studio chat session sends `recentMessages` ({ role, content }) — map into prompt fields. */
  const recentMessages = rawBody.recentMessages;
  if (Array.isArray(recentMessages) && recentMessages.length > 0) {
    const lines: string[] = [];
    for (const m of recentMessages) {
      const row = m && typeof m === "object" ? (m as Record<string, unknown>) : {};
      const role = row.role === "assistant" ? "Creator" : "Fan";
      const content = typeof row.content === "string" ? row.content : "";
      lines.push(`${role}: ${content}`);
    }
    conversationHistory = lines.join("\n");
    const lastUser = [...recentMessages]
      .reverse()
      .find((m) => (m && typeof m === "object" ? (m as Record<string, unknown>).role : null) === "user") as
      | Record<string, unknown>
      | undefined;
    if (lastUser && typeof lastUser.content === "string" && lastUser.content.trim()) {
      lastFanMessage = lastUser.content.trim();
    }
  }
  if (typeof rawBody.creatorPersona === "string" && rawBody.creatorPersona.trim()) {
    personalityContext = rawBody.creatorPersona.trim();
  }

  const useCreatorPersonalityPrimary =
    rawBody.useCreatorPersonality === true && personalityContext.trim().length > 0;

  const normalizeStudioTone = (t: string): string => {
    const s = t.trim().toLowerCase();
    if (s === "tease" || s === "teasing") return "Teasing";
    if (s === "playful") return "Playful";
    if (s === "intimate") return "Intimate";
    if (s === "sweet") return "Sweet";
    if (s === "bold") return "Bold";
    if (s === "soft") return "Soft";
    const raw = t.trim();
    if (!raw) return "Teasing";
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  };

  try {
    const model = await getModelForTask("sexting_session", user.uid);

    const roleplayType =
      typeof sessionContext.roleplayType === "string" && sessionContext.roleplayType.trim()
        ? sessionContext.roleplayType.trim()
        : "Girlfriend Experience";
    let tone =
      typeof sessionContext.tone === "string" && sessionContext.tone.trim()
        ? sessionContext.tone.trim()
        : "Teasing";
    if (typeof rawBody.tone === "string" && rawBody.tone.trim()) {
      tone = normalizeStudioTone(rawBody.tone);
    }
    let fanName =
      typeof sessionContext.fanName === "string" && sessionContext.fanName.trim() ? sessionContext.fanName.trim() : "Fan";
    if (typeof rawBody.fanName === "string" && rawBody.fanName.trim()) {
      fanName = rawBody.fanName.trim();
    }
    let explicitnessLevel = 7;
    let toneSettings: { formality?: number; humor?: number; empathy?: number; spiciness?: number; profanity?: number; emojiLevel?: number } = {};
    try {
      const db = getAdminDb();
      const userDoc = await db.collection("users").doc(user.uid).get();
      const userData = userDoc.data();
      if (typeof userData?.explicitnessLevel === "number") {
        explicitnessLevel = userData.explicitnessLevel;
      }
      // Get tone settings from user settings
      if (userData?.settings?.tone) {
        toneSettings = userData.settings.tone;
      }
    } catch (error) {
      console.warn("[generateSextingSuggestion] failed to load user settings:", error);
    }

    const studioSpice = rawBody.spiciness;
    if (typeof studioSpice === "number" && Number.isFinite(studioSpice)) {
      const s = Math.round(studioSpice);
      if (s >= 1 && s <= 10) {
        explicitnessLevel = s;
      }
    }

    const toneLower = String(tone).toLowerCase();
    const wantsExplicitTone = toneLower === "explicit";
    const explicitnessContext = wantsExplicitTone
      ? explicitnessLevel >= 10
        ? "Go extremely explicit, as intense as possible. Use vivid, raw sexual language and detailed descriptions."
        : explicitnessLevel >= 8
        ? "Be very explicit and direct. Use clear sexual language and heat."
        : explicitnessLevel >= 6
        ? "Keep it explicit and sexy, but not extreme."
        : "Keep it flirty and suggestive with light explicitness."
      : `Respect the "${tone}" tone. Keep it ${toneLower}, avoid graphic sexual language.`;

    const emojiGuidance = getEmojiInstructions({
      enabled: emojiEnabled !== false,
      intensity: emojiIntensity ?? 5,
    });
    const emojiExamples =
      emojiEnabled === false ? "" : ` Emoji examples: ${getEmojiExamplesForTone(tone)}.`;

    // Parse fan context if it's the enhanced format
    let enhancedFanContext = '';
    if (fanContext) {
      if (fanContext.includes("CRITICAL - PERSONALIZE FOR FAN:")) {
        enhancedFanContext = fanContext;
      } else {
        enhancedFanContext = `
Fan notes / context (do not echo verbatim; use only if it improves the reply):
${fanContext}
`;
      }
    }

    // Build tone style guidance
    const toneStyleGuidance = Object.keys(toneSettings).length > 0 ? `
WRITING STYLE PREFERENCES (apply to all suggestions):
${toneSettings.formality !== undefined ? `- Formality (${toneSettings.formality}/100): ${toneSettings.formality < 30 ? 'Very casual, use slang' : toneSettings.formality < 50 ? 'Casual' : toneSettings.formality < 70 ? 'Balanced' : 'More polished'}` : ''}
${toneSettings.humor !== undefined ? `- Humor (${toneSettings.humor}/100): ${toneSettings.humor < 30 ? 'Serious' : toneSettings.humor < 50 ? 'Light humor' : toneSettings.humor < 70 ? 'Playful' : 'Very funny'}` : ''}
${toneSettings.empathy !== undefined ? `- Warmth (${toneSettings.empathy}/100): ${toneSettings.empathy < 30 ? 'Direct' : toneSettings.empathy < 50 ? 'Friendly' : toneSettings.empathy < 70 ? 'Warm' : 'Very caring'}` : ''}
${toneSettings.profanity !== undefined && toneSettings.profanity > 0 ? `- Profanity (${toneSettings.profanity}/100): ${toneSettings.profanity < 30 ? 'Mild swearing OK' : toneSettings.profanity < 50 ? 'Moderate swearing' : 'Frequent swearing'}` : '- Keep language clean unless context calls for it'}
` : '';

    const voicePriorityBlock = useCreatorPersonalityPrimary
      ? `
VOICE PRIORITY: The creator turned ON "use my personality." The CREATOR PERSONALITY block below is PRIMARY for voice, attitude, and wording. It OVERRIDES session tone "${tone}", chat/session type "${roleplayType}" when they conflict, AND all studio tone sliders (formality, humor, warmth, profanity). Use explicitness ${explicitnessLevel}/10 only insofar as it does not contradict the personality; if in doubt, personality wins.
`
      : `
VOICE PRIORITY: Personality override is OFF. Match the chat/session type ("${roleplayType}") and tone ("${tone}") closely. Use explicitness ${explicitnessLevel}/10 as configured below.
`;

    const prompt = `
You are an explicit sexting co-pilot for premium creator platforms (OnlyFans / Fansly / Fanvue).
Generate 4-6 short, message-ready suggestions the creator can send immediately.

Session context:
- Chat / session type: ${roleplayType}
- Tone: ${tone}${useCreatorPersonalityPrimary ? " (secondary to personality when both conflict)" : " (primary)"}
- Fan name: ${fanName}
- Explicitness / heat level: ${explicitnessLevel}/10 — ${explicitnessContext}
${voicePriorityBlock}${useCreatorPersonalityPrimary ? "" : toneStyleGuidance}
${personalityContext ? `${personalityContext}

CREATOR PERSONALITY (USE WHEN RELEVANT - CONSISTENT WITH COMPOSE AND PREMIUM CONTENT STUDIO):
- Use ONLY the creator personality text provided above for THIS user. Never use example or placeholder values as this user's data.
- Use personality when RELEVANT: traits, preferences, voice, style. Do not force physical attributes into every message—only when it naturally fits (e.g. describing yourself, roleplay).
- When describing the creator in suggestions, incorporate details from the personality naturally. For general messaging, match voice and style; use physical/details only when relevant.` : ''}
${enhancedFanContext || (fanContext ? `- Fan context: ${fanContext}` : "")}
${lastFanMessage ? `- Last fan message: "${lastFanMessage}"` : ""}

Recent conversation (most recent last):
${conversationHistory || "No prior messages provided."}

CRITICAL — PERSPECTIVE & NATURAL WRITING
- Write suggestions FROM THE CONTENT CREATOR'S PERSPECTIVE (first person: "I", "my", "me")
- The suggestions are what the CONTENT CREATOR is sending, NOT what fans/followers are saying
- Write as if YOU (the content creator) are sending these messages yourself
- DO NOT write from the audience's perspective
- DO NOT write as if fans are speaking to you
- Use first-person language from the creator's point of view
- The suggestions should be what the CREATOR is saying to fans, not what fans are saying to the creator
NAME USAGE (strict):
- Do not sound like a template. Real creators rarely repeat someone's name in every bubble.
- Across ALL suggestions combined: use the fan's actual name **at most once** (or not at all). Never start more than one suggestion with "Hey ${fanName}" / "${fanName},"
- Prefer no name, or casual address ("babe", "love", "you") when it fits ${tone} — only use their real name if it truly fits the moment.
- If their last message did not use your (the creator's) name, strongly prefer **zero** uses of their real name in these suggestions.
${fanName && fanName !== "Fan" ? `- Fan's name is "${fanName}" — treat as optional seasoning, not a checklist item.` : ""}

≡ƒÄ» NATURAL CREATOR LANGUAGE & SLANG:
- Use abbreviations and slang that creators ACTUALLY use on OnlyFans/Fansly/Fanvue naturally
- Common abbreviations: PPV, DM/DMs, sub/subs, custom/customs, unlock/unlocks, tip/tips, OF (OnlyFans)
- Use casual terms naturally: "babe", "love", "hun", "baby" when appropriate - but don't overuse
- Write like a REAL CREATOR would text/message - casual, authentic, human, NOT formal or corporate
- Mix full words and abbreviations naturally - don't force abbreviations, use them when they feel right
- Example natural: "Hey babe! New PPV in your DMs — unlock it to see the full set" (sounds human)
- Example forced: "Hello subscriber. Please unlock the Pay-Per-View content in your Direct Messages" (sounds AI)
- Vary your language - sometimes use "sub", sometimes "subscriber", sometimes "fan" - natural variation
- Sound like you're texting a friend, not writing a business email
- Use platform slang organically - it should feel natural, not like you're checking off a list

Guidelines:
- ${useCreatorPersonalityPrimary ? `Follow CREATOR PERSONALITY exclusively for voice; ignore conflicting tone/slider hints. Use tone "${tone}" only where personality is silent on style.` : `Follow tone "${tone}" and session type "${roleplayType}" together.`} ${useCreatorPersonalityPrimary ? "Do not apply studio tone sliders when they conflict with personality." : "Studio tone sliders (formality, humor, warmth, etc.) apply on top of that baseline."} Only go extremely explicit when appropriate to personality${useCreatorPersonalityPrimary ? "" : " and when tone is Explicit and explicitness is 10"}.
- Be bold, playful, and explicitly adult (sexting) while respecting the chosen tone.
- Keep replies concise (1-3 sentences each).
- Vary style across suggestions (teasing, direct, playful).
- Do **not** lean on the fan's name for "personalization" — voice, heat, and word choice should carry it.
- ${emojiGuidance}${emojiExamples}
- Return ONLY strict JSON array of strings, no prose, like:
["Hey love, ...", "How about ..."]
`.trim();

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const raw = result.response.text().trim();

    let suggestions: string[] = [];
    try {
      const parsed = parseJSON(raw);
      if (Array.isArray(parsed)) {
        suggestions = parsed.filter((s) => typeof s === "string");
      }
    } catch {
      // Fallback: split lines
      suggestions = raw
        .split("\n")
        .map((s: string) => s.replace(/^[-*]\s*/, "").trim())
        .filter(Boolean);
    }

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      throw new Error("Model returned no suggestions");
    }

    if (numSuggestionsRequested) {
      suggestions = suggestions.slice(0, numSuggestionsRequested);
    }

    const payload: { success: true; suggestions: string[]; suggestion?: string } = {
      success: true,
      suggestions,
    };
    if (suggestions.length === 1) {
      payload.suggestion = suggestions[0];
    }

    res.status(200).json(payload);
  } catch (error: any) {
    console.error("[generateSextingSuggestion] error:", error);
    res.status(200).json({
      success: false,
      error: "Failed to generate suggestions",
      note: error?.message || "An unexpected error occurred. Please try again.",
    });
  }
}

export default withErrorHandling(handler);
