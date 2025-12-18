import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, withErrorHandling } from "./_errorHandler.js";
import { getModelForTask } from "./_modelRouter.js";
import { getModel, parseJSON } from "./_geminiShared.js";

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

  const { prompt, context } = req.body || {};

  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "Missing or invalid 'prompt'" });
    return;
  }

  try {
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

    const explicitContext = isExplicitContent ? `
CRITICAL CONTEXT - EXPLICIT/ADULT CONTENT:
- This content is for an adult content platform (creator monetization platform)
- User is requesting explicit/adult content writing
- Write explicit, bold, adult-oriented content as requested
- Use explicit language appropriate for adult content platforms
- Be descriptive and explicit about intimate/explicit content when requested
- If the user asks for explicit captions, write them with explicit, descriptive language
- If the user asks for sales/monetization content, include CTAs for subscriptions/purchases
- Platform mentions are optional in sales-focused content
` : '';

    const aiPrompt = `
You are an expert social media copywriter and content creator${isExplicitContent ? ' specializing in adult content platforms' : ''}.

User wants you to write: "${prompt}"
${context?.goal ? `Goal: ${goal}` : ''}
${context?.tone ? `Tone: ${tone}${isExplicitContent ? ' (EXPLICIT/ADULT CONTENT - Generate bold, explicit content as requested)' : ''}` : ''}
${platformContext ? `Platforms: ${platformContext}` : ''}

${explicitContext}

Write the content the user requested. Be engaging, authentic, and match the tone and goal specified.
If the user wants a caption, write a complete caption ready to use.
If the user wants other text content, write exactly what they asked for.
${isExplicitContent ? 'If explicit content is requested, write it with bold, explicit, adult-oriented language. Be descriptive and explicit about intimate/explicit content.' : ''}

Return ONLY the generated text content, no explanations or meta-commentary.
`.trim();

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: aiPrompt }] }],
    });

    const generatedText = result.response.text().trim();

    res.status(200).json({
      text: generatedText,
      caption: generatedText, // For backward compatibility
    });
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
