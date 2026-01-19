import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, withErrorHandling } from "./_errorHandler.js";
import { getModelForTask } from "./_modelRouter.js";
import { getModel, parseJSON } from "./_geminiShared.js";
import { getOnlyFansResearchContext } from "./_onlyfansResearch.js";
import { getOnlyFansWeeklyTrends } from "./_trendsHelper.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { getEmojiInstructions, getEmojiExamplesForTone } from "./_emojiHelper.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { buildCacheKey, getCachedResponse, setCachedResponse } from "./_aiCache.js";
import { canUseAi, recordAiUsage } from "./_aiUsage.js";

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Check API keys early
  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    res.status(200).json({
      error: "AI not configured",
      note: apiKeyCheck.error,
    });
    return;
  }

  // Dynamic import for auth
  let user;
  try {
    const verifyAuth = await getVerifyAuth();
    user = await verifyAuth(req);
  } catch (authError: any) {
    console.error("verifyAuth error:", authError);
    res.status(200).json({
      error: "Authentication error",
      note: authError?.message || "Failed to verify authentication. Please try logging in again.",
    });
    return;
  }

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Rate limiting: 10 requests per minute per user
  const ok = await enforceRateLimit({
    req,
    res,
    keyPrefix: "generateText",
    limit: 10,
    windowMs: 60_000,
    identifier: user.uid,
  });
  if (!ok) return;

  const { prompt, context, emojiEnabled, emojiIntensity } = req.body || {};

  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "Missing or invalid 'prompt'" });
    return;
  }

  try {
    const db = getAdminDb();
    const userDoc = await db.collection("users").doc(user.uid).get();
    const userData = userDoc.data();
    const userPlan = userData?.plan || "Free";
    const userRole = userData?.role;

    const usageCheck = await canUseAi(user.uid, "general_ai", userPlan, userRole);
    if (!usageCheck.allowed) {
      res.status(200).json({
        error: "AI usage limit reached",
        note: `You've reached your monthly AI usage limit (${usageCheck.limit}). Upgrade your plan to increase your allowance.`,
        limit: usageCheck.limit,
        remaining: usageCheck.remaining,
      });
      return;
    }

    const model = await getModelForTask("caption", user.uid);
    
    const goal = context?.goal || "engagement";
    const tone = context?.tone || "friendly";
    const platforms = context?.platforms || [];
    const platformContext = platforms.length > 0 
      ? ` for ${platforms.join(', ')}` 
      : '';

    // Detect explicit content context
    const isExplicitContent = tone === 'Explicit/Adult Content' || 
                             tone === 'Explicit' ||
                             tone === 'Sexy / Explicit' ||
                             tone === 'Sexy / Bold' ||
                             (Array.isArray(platforms) && platforms.includes('OnlyFans'));

    // Detect if this is for OnlyFans platform
    const isOnlyFansPlatform = Array.isArray(platforms) && platforms.includes('OnlyFans');
    
    // Get user explicitness level and OnlyFans-specific research if OnlyFans platform is detected
    let onlyfansResearch = '';
    let onlyfansWeeklyTrends = '';
    let explicitnessLevel = 7; // Default
    
    if (isOnlyFansPlatform) {
      try {
        explicitnessLevel = userData?.explicitnessLevel ?? 7;
        
        // Get OnlyFans weekly trends
        onlyfansWeeklyTrends = await getOnlyFansWeeklyTrends();
        
        // Get OnlyFans-specific research
        onlyfansResearch = await getOnlyFansResearchContext(
          'Subscribers', // Default audience for OnlyFans
          goal,
          user.uid,
          userPlan,
          userRole
        );
        console.log('[generateText] OnlyFans research context fetched');
      } catch (error) {
        console.error('[generateText] Error fetching OnlyFans research:', error);
        // Continue without OnlyFans research - not critical
      }
    }

    // Build explicitness context based on user's explicitness level for OnlyFans
    const explicitnessContext = isOnlyFansPlatform 
      ? (explicitnessLevel >= 9 
          ? 'EXTREMELY EXPLICIT - Use very explicit, graphic language describing sexual acts, intimate moments, and explicit content in detail. Focus on lust, desire, and explicit sexual experiences.'
          : explicitnessLevel >= 7
          ? 'HIGHLY EXPLICIT - Use explicit language describing sexual content, intimate moments, girlfriend experience, and explicit scenes. Focus on sexual desire, lust, and explicit experiences.'
          : explicitnessLevel >= 5
          ? 'MODERATELY EXPLICIT - Use suggestive and explicit language describing intimate content, sexual themes, girlfriend experience, and adult content. Focus on desire and intimate experiences.'
          : 'SUGGESTIVE - Use suggestive language with adult themes, intimate moments, and romantic/sexual undertones. Focus on connection and intimate experiences.')
      : '';

    const explicitContext = isExplicitContent || isOnlyFansPlatform ? `
CRITICAL CONTEXT - ONLYFANS ADULT/EXPLICIT CONTENT PLATFORM:
- This content is EXCLUSIVELY for OnlyFans - an adult content creator platform focused on sexual content
- ALL content MUST be focused on adult/explicit sexual content, NOT generic business/tech/product content
- Focus on: sexual experiences, intimate moments, girlfriend experience, lust, desire, explicit scenes, adult content
- DO NOT generate generic business strategies, tech product ideas, or non-sexual content
- Write explicit, bold, adult-oriented content focused on sexual experiences and intimate moments
- Use explicit language appropriate for adult content platforms describing sexual content
- Be descriptive and explicit about intimate/explicit sexual content when requested
- If the user asks for explicit captions, write them with explicit, descriptive language about sexual content
- If the user asks for sales/monetization content, include CTAs for subscriptions/purchases of sexual content
- Platform mentions are optional in sales-focused content
${explicitnessContext ? `\nEXPLICITNESS LEVEL: ${explicitnessLevel}/10\n${explicitnessContext}` : ''}
` : '';

    const aiPrompt = `
You are an expert social media copywriter and content creator${isExplicitContent || isOnlyFansPlatform ? ' specializing in OnlyFans adult content platforms' : ''}.

${isOnlyFansPlatform ? onlyfansWeeklyTrends : ''}

User wants you to write: "${prompt}"
${context?.goal ? `Goal: ${goal}` : ''}
${context?.tone ? `Tone: ${tone}${isExplicitContent || isOnlyFansPlatform ? ' (ONLYFANS EXPLICIT/ADULT CONTENT - Generate bold, explicit sexual content focused on lust, desire, girlfriend experience, and intimate moments)' : ''}` : ''}
${platformContext ? `Platforms: ${platformContext}` : ''}

${onlyfansResearch ? `ONLYFANS-SPECIFIC RESEARCH & BEST PRACTICES:\n${onlyfansResearch}\n` : ''}

${explicitContext}

${isOnlyFansPlatform ? `
ONLYFANS CONTENT REQUIREMENTS:
- ALL content MUST be about adult/explicit sexual content - NO generic business/tech/product ideas
- Focus on: sexual experiences, intimate moments, girlfriend experience, lust, desire, explicit scenes
- Post ideas: Describe specific explicit content ideas, sexual themes, intimate moments, girlfriend experience scenarios
- Shoot concepts: Describe specific explicit photoshoot concepts with sexual themes, intimate settings, explicit poses, girlfriend experience scenarios
- Be specific about sexual content, intimate moments, lust, desire - NOT generic subscription prompts
- Respect explicitness level ${explicitnessLevel}/10
` : ''}

Write the content the user requested. Be engaging, authentic, and match the tone and goal specified.
If the user wants a caption, write a complete caption ready to use.
If the user wants other text content, write exactly what they asked for.
${isExplicitContent || isOnlyFansPlatform ? 'If explicit content is requested, write it with bold, explicit, adult-oriented language focused on sexual experiences, intimate moments, girlfriend experience, lust, and desire. Be descriptive and explicit about intimate/explicit sexual content.' : ''}

CREATOR PERSONALITY INTEGRATION:
- If the prompt or context includes creator personality information, USE ALL OF IT when relevant - this includes physical attributes, personality traits, preferences, values, style, and any other details
- When the user asks to "describe myself", "describe yourself", "describe me", or similar prompts, incorporate ALL relevant information from the personality description
- Use physical attributes (height, weight, body measurements, bust size, etc.) naturally when describing the creator
- Use personality traits, preferences, values, and other details from the personality description when relevant
- Use the exact details provided (e.g., "5'2"", "150lbs", "36J bust", "big butt", personality traits, preferences) naturally in the content
- All personality information should be woven naturally into the content, not forced - use it when it enhances the description
- For roleplay, messaging, or any content that describes the creator, use the complete personality description as the source of truth
- The creator personality information in the prompt is comprehensive - use ALL of it, not just parts of it, when relevant to the content being generated

${getEmojiInstructions({ enabled: emojiEnabled !== false, intensity: emojiIntensity ?? 5 })}${emojiEnabled !== false ? ` Choose emojis that match the tone (examples: ${getEmojiExamplesForTone(tone)}). Emojis should enhance the content naturally.` : ''}

Return ONLY the generated text content, no explanations or meta-commentary.
`.trim();

    const cacheKey = buildCacheKey({
      userId: user.uid,
      task: "generateText",
      prompt: aiPrompt,
      emojiEnabled,
      emojiIntensity,
    });
    const cached = await getCachedResponse(cacheKey);
    if (cached?.text) {
      res.status(200).json(cached);
      return;
    }

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: aiPrompt }] }],
    });

    const generatedText = result.response.text().trim();

    const payload = {
      text: generatedText,
      caption: generatedText, // For backward compatibility
    };

    await setCachedResponse(cacheKey, payload);
    await recordAiUsage(user.uid, "general_ai", userPlan, userRole);

    res.status(200).json(payload);
    return;
  } catch (error: any) {
    console.error("generateText error:", error);
    res.status(200).json({
      error: "Failed to generate text",
      note: error?.message || "An unexpected error occurred. Please try again.",
    });
    return;
  }
}

export default withErrorHandling(handler);
