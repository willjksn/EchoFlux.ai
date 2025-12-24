import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, getModelRouter, withErrorHandling } from "./_errorHandler.js";
import { getGoalFramework } from "./_goalFrameworks.js";

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

  let user;
  try {
    const verifyAuth = await getVerifyAuth();
    user = await verifyAuth(req);
  } catch (authError: any) {
    res.status(200).json({
      success: false,
      error: "Authentication error",
      note: authError?.message || "Failed to verify authentication.",
    });
    return;
  }

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { content, goal, platform } = (req.body as any) || {};
  if (!content) {
    res.status(400).json({ error: "Missing 'content' in body" });
    return;
  }

  try {
    const getModelForTask = await getModelRouter();
    const model = await getModelForTask('critique', user.uid);

    // Get goal-specific framework if goal is provided
    const goalContext = goal && goal !== "engagement" ? getGoalFramework(goal) : '';

    const prompt = `
You critique social media content and give constructive feedback.

${goalContext ? `PRIMARY GOAL: ${goal}\n${goalContext}\n` : ''}

Content:
${content}

Goal: ${goal || "engagement"}
Platform: ${platform || "generic"}

${goalContext ? `CRITICAL: Evaluate this content against how well it achieves the goal: ${goal}. Provide specific feedback on whether the content aligns with the strategic framework for ${goal}.\n` : ''}

Return ONLY JSON:
{
  "score": 0-100,
  "summary": "short critique",
  "whatWorked": ["point 1", "point 2"],
  "improvements": ["point 1", "point 2"],
  "suggestedRewrite": "optional improved version"
}
`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const raw = result.response.text();
    
    // Parse JSON with fallback
    let data;
    try {
      const { parseJSON } = await import("./_geminiShared.js");
      data = parseJSON(raw);
    } catch (parseError) {
      try {
        data = JSON.parse(raw);
      } catch {
        res.status(200).json({
          success: false,
          error: "Failed to parse AI response",
          note: "The AI returned an invalid response. Please try again.",
        });
        return;
      }
    }

    res.status(200).json(data);
    return;
  } catch (err: any) {
    console.error("generateCritique error:", err);
    res.status(200).json({
      success: false,
      error: "Failed to critique content",
      note: err?.message || "An unexpected error occurred. Please try again.",
      details: process.env.NODE_ENV === "development" ? err?.stack : undefined,
    });
    return;
  }
}

export default withErrorHandling(handler);

