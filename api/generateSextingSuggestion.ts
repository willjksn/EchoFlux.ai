import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, withErrorHandling } from "./_errorHandler.js";
import { getModelForTask } from "./_modelRouter.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { getEmojiInstructions, getEmojiExamplesForTone } from "./_emojiHelper.js";
import { parseJSON } from "./_geminiShared.js";

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
    const tone = sessionContext?.tone || "Flirty";
    const fanName = sessionContext?.fanName || "Fan";

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
${personalityContext ? personalityContext : ''}
${enhancedFanContext || (fanContext ? `- Fan context: ${fanContext}` : "")}
${lastFanMessage ? `- Last fan message: "${lastFanMessage}"` : ""}

Recent conversation (most recent last):
${conversationHistory || "No prior messages provided."}

🚨 CRITICAL - PERSPECTIVE & NATURAL WRITING 🚨
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

Guidelines:
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
