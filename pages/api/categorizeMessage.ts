import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, getModelRouter, withErrorHandling } from "./_errorHandler.js";

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Check API keys early
  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    return res.status(200).json({
      success: false,
      error: "AI not configured",
      note: apiKeyCheck.error,
    });
  }

  // Dynamic import for auth
  let user;
  try {
    const verifyAuth = await getVerifyAuth();
    user = await verifyAuth(req);
  } catch (authError: any) {
    console.error("verifyAuth error:", authError);
    return res.status(200).json({
      success: false,
      error: "Authentication error",
      note: authError?.message || "Failed to verify authentication. Please try logging in again.",
    });
  }

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { text } = req.body || {};

    if (!text) {
      return res.status(400).json({ error: "Missing text field" });
    }

    // Use model router - categorization uses cheapest model for cost optimization
    const getModelForTask = await getModelRouter();
    const model = await getModelForTask('categorize', user.uid);

    const prompt = `
Classify the user's message into one of the following categories:

Possible Categories:
- Lead
- Complaint
- Question
- Support
- Sales Inquiry
- Feedback
- Other

Return ONLY this JSON format:
{
  "category": "string",
  "confidence": number
}
Message: "${text}"
`;

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    });

    let output = result.response.text().trim();

    // Attempt JSON parse, fallback to Other
    let parsed;
    try {
      parsed = JSON.parse(output);
    } catch {
      parsed = { category: "Other", confidence: 0.5 };
    }

    return res.status(200).json(parsed);
  } catch (err: any) {
    console.error("categorizeMessage error:", err);
    return res.status(200).json({
      success: false,
      error: "Failed to categorize message",
      note: err?.message || "An unexpected error occurred. Please try again.",
      details: process.env.NODE_ENV === "development" ? err?.stack : undefined,
    });
  }
}

export default withErrorHandling(handler);
