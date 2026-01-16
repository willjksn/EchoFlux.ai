import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, withErrorHandling } from "./_errorHandler.js";
import { getModelForTask } from "./_modelRouter.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { getEmojiInstructions, getEmojiExamplesForTone } from "./_emojiHelper.js";
import { parseJSON } from "./_geminiShared.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { canUseAi, recordAiUsage } from "./_aiUsage.js";

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
    const db = getAdminDb();
    const userDoc = await db.collection("users").doc(user.uid).get();
    const userData = userDoc.data();
    const userPlan = userData?.plan || "Free";
    const userRole = userData?.role;

    const usageCheck = await canUseAi(user.uid, "sexting_session", userPlan, userRole);
    if (!usageCheck.allowed) {
      res.status(200).json({
        success: false,
        error: "AI usage limit reached",
        note: `You've reached your monthly sexting assistant limit (${usageCheck.limit}). Upgrade for more.`,
        limit: usageCheck.limit,
        remaining: usageCheck.remaining,
      });
      return;
    }

    const model = await getModelForTask("sexting_session", user.uid);

  const roleplayType = sessionContext?.roleplayType || "Girlfriend Experience";
  const tone = sessionContext?.tone || "Flirty";
  const fanName = sessionContext?.fanName || "Fan";
  const sessionLength = sessionContext?.sessionLength || 20;
  const goal = sessionContext?.goal || "Upsell PPV and bring them back";

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

    const flowLengthHint =
      sessionLength <= 10
        ? "5-7"
        : sessionLength <= 20
        ? "8-12"
        : "10-15";

    const prompt = `
You are an explicit DM session planner for premium creator platforms (OnlyFans / Fansly / Fanvue).
Your goal is money mode: upsell PPV, keep them buying, and bring them back.

Session context:
- Roleplay type: ${roleplayType}
- Tone: ${tone}
- Fan name: ${fanName}
- Session length: ${sessionLength} minutes
- Goal: ${goal}
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

🎯 NATURAL CREATOR LANGUAGE & SLANG:
- Use abbreviations and slang that creators ACTUALLY use on OnlyFans/Fansly/Fanvue naturally
- Common abbreviations: PPV, DM/DMs, sub/subs, custom/customs, unlock/unlocks, tip/tips, OF (OnlyFans)
- Use casual terms naturally: "babe", "love", "hun", "baby" when appropriate - but don't overuse
- Write like a REAL CREATOR would text/message - casual, authentic, human, NOT formal or corporate
- Mix full words and abbreviations naturally - don't force abbreviations, use them when they feel right
- Example natural: "Hey babe! New PPV in your DMs 💕 Unlock it to see the full set" (sounds human)
- Example forced: "Hello subscriber. Please unlock the Pay-Per-View content in your Direct Messages" (sounds AI)
- Vary your language - sometimes use "sub", sometimes "subscriber", sometimes "fan" - natural variation
- Sound like you're texting a friend, not writing a business email
- Use platform slang organically - it should feel natural, not like you're checking off a list

Required plan structure:
- Opener (1 line)
- Message flow (${flowLengthHint} lines)
- Paywall moment (1 PPV drop line)
- Close + follow-up (1 line)

Guidelines:
- Be bold, playful, and explicitly adult (sexting) while respecting the chosen tone.
- Keep each line concise (1-3 sentences each).
- Vary style across the flow (teasing, direct, playful).
- Personalize with the fan's name when natural.
- ${emojiGuidance}${emojiExamples}
- Return ONLY strict JSON object, no prose, like:
{"opener":"...","messageFlow":["...","..."],"paywallMoment":"...","closeFollowUp":"..."}
`.trim();

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const raw = result.response.text().trim();

    let plan: any = null;
    try {
      const parsed = parseJSON(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        plan = parsed;
      }
    } catch {
      plan = null;
    }

    if (!plan) {
      throw new Error("Model returned no plan");
    }

    await recordAiUsage(user.uid, "sexting_session", userPlan, userRole, 1);

    res.status(200).json({
      success: true,
      plan,
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
