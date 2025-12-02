import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, getModelRouter, withErrorHandling } from "./_errorHandler.ts";

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    return res.status(200).json({
      success: false,
      error: "AI not configured",
      note: apiKeyCheck.error,
    });
  }

  let user;
  try {
    const verifyAuth = await getVerifyAuth();
    user = await verifyAuth(req);
  } catch (authError: any) {
    return res.status(200).json({
      success: false,
      error: "Authentication error",
      note: authError?.message || "Failed to verify authentication.",
    });
  }

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { content, goal, platform } = (req.body as any) || {};
  if (!content) {
    return res.status(400).json({ error: "Missing 'content' in body" });
  }

  try {
    const getModelForTask = await getModelRouter();
    const model = await getModelForTask('critique', user.uid);

    const prompt = `
You critique social media content and give constructive feedback.

Content:
${content}

Goal: ${goal || "engagement"}
Platform: ${platform || "generic"}

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
      const { parseJSON } = await import("./_geminiShared.ts");
      data = parseJSON(raw);
    } catch (parseError) {
      try {
        data = JSON.parse(raw);
      } catch {
        return res.status(200).json({
          success: false,
          error: "Failed to parse AI response",
          note: "The AI returned an invalid response. Please try again.",
        });
      }
    }

    return res.status(200).json(data);
  } catch (err: any) {
    console.error("generateCritique error:", err);
    return res.status(200).json({
      success: false,
      error: "Failed to critique content",
      note: err?.message || "An unexpected error occurred. Please try again.",
      details: process.env.NODE_ENV === "development" ? err?.stack : undefined,
    });
  }
}

export default withErrorHandling(handler);

