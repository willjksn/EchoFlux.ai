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

    const {
    sessionContext,
    fanContext,
    personalityContext,
    conversationHistory,
    lastFanMessage,
    emojiEnabled,
    emojiIntensity,
  } = req.body || {};

  try {
    const model = await getModelForTask("sexting_session", user.uid);

    const roleplayType = sessionContext?.roleplayType || "Girlfriend Experience";
    const tone = sessionContext?.tone || "Teasing";
    const fanName = sessionContext?.fanName || "Fan";
    let explicitnessLevel = 7;
    try {
      const db = getAdminDb();
      const userDoc = await db.collection("users").doc(user.uid).get();
      const userData = userDoc.data();
      if (typeof userData?.explicitnessLevel === "number") {
        explicitnessLevel = userData.explicitnessLevel;
      }
    } catch (error) {
      console.warn("[generateSextingSuggestion] failed to load explicitness:", error);
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
        if (fanContext.includes('CRITICAL - PERSONALIZE FOR FAN:')) {
            // Enhanced format - use as-is
            enhancedFanContext = fanContext;
        } else {
            // Legacy format - convert to enhanced
            enhancedFanContext = `
CRITICAL - PERSONALIZE FOR FAN: ${fanName}
${fanContext}

REQUIREMENTS:
- Use ${fanName}'s name naturally in suggestions (e.g., "Hey ${fanName}...", "${fanName}, I wanted to...", etc.)
- Make suggestions feel personal and tailored specifically for ${fanName}
`;
        }
    }

    const prompt = `
You are an explicit sexting co-pilot for premium creator platforms (OnlyFans / Fansly / Fanvue).
Generate 4-6 short, message-ready suggestions the creator can send immediately.

Session context:
- Roleplay type: ${roleplayType}
- Tone: ${tone}
- Fan name: ${fanName}
- Explicitness level: ${explicitnessLevel}/10 — ${explicitnessContext}
${personalityContext ? `${personalityContext}

CRITICAL - CREATOR PERSONALITY INTEGRATION:
- The above creator personality contains ALL information about this creator: physical attributes, personality traits, preferences, values, style, and what makes them unique
- Use ALL relevant information from the personality when generating suggestions - this includes physical attributes, traits, preferences, etc.
- When describing the creator in suggestions, incorporate details from the complete personality description naturally
- The personality description is comprehensive - use ALL of it, not just parts of it, when relevant to the content being generated` : ''}
${enhancedFanContext || (fanContext ? `- Fan context: ${fanContext}` : "")}
${lastFanMessage ? `- Last fan message: "${lastFanMessage}"` : ""}

Recent conversation (most recent last):
${conversationHistory || "No prior messages provided."}

≡ƒÜ¿ CRITICAL - PERSPECTIVE & NATURAL WRITING ≡ƒÜ¿
- Write suggestions FROM THE CONTENT CREATOR'S PERSPECTIVE (first person: "I", "my", "me")
- The suggestions are what the CONTENT CREATOR is sending, NOT what fans/followers are saying
- Write as if YOU (the content creator) are sending these messages yourself
- DO NOT write from the audience's perspective
- DO NOT write as if fans are speaking to you
- Use first-person language from the creator's point of view
- The suggestions should be what the CREATOR is saying to fans, not what fans are saying to the creator
${fanName && fanName !== 'Fan' ? `- When mentioning ${fanName}, YOU are addressing them directly - but make it NATURAL
- Use ${fanName}'s name OCCASIONALLY and NATURALLY - not in every message, just when it feels right (like a real person would)
- Write like a REAL PERSON, not AI - natural flow, varied sentence structure, authentic voice
- DO NOT overuse their name - use it sparingly, like you would in real conversation` : ''}

≡ƒÄ» NATURAL CREATOR LANGUAGE & SLANG:
- Use abbreviations and slang that creators ACTUALLY use on OnlyFans/Fansly/Fanvue naturally
- Common abbreviations: PPV, DM/DMs, sub/subs, custom/customs, unlock/unlocks, tip/tips, OF (OnlyFans)
- Use casual terms naturally: "babe", "love", "hun", "baby" when appropriate - but don't overuse
- Write like a REAL CREATOR would text/message - casual, authentic, human, NOT formal or corporate
- Mix full words and abbreviations naturally - don't force abbreviations, use them when they feel right
- Example natural: "Hey babe! New PPV in your DMs ≡ƒÆò Unlock it to see the full set" (sounds human)
- Example forced: "Hello subscriber. Please unlock the Pay-Per-View content in your Direct Messages" (sounds AI)
- Vary your language - sometimes use "sub", sometimes "subscriber", sometimes "fan" - natural variation
- Sound like you're texting a friend, not writing a business email
- Use platform slang organically - it should feel natural, not like you're checking off a list

Guidelines:
- Follow the chosen tone. Only go extremely explicit when tone is Explicit and explicitness is 10.
- Be bold, playful, and explicitly adult (sexting) while respecting the chosen tone.
- Keep replies concise (1-3 sentences each).
- Vary style across suggestions (teasing, direct, playful).
- Personalize with the fan's name when natural.
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
        .map((s) => s.replace(/^[-*]\s*/, "").trim())
        .filter(Boolean);
    }

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      throw new Error("Model returned no suggestions");
    }

    res.status(200).json({
      success: true,
      suggestions,
    });
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
