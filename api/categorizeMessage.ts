import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, getModelRouter, withErrorHandling } from "./_errorHandler.js";

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Check API keys early
  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    res.status(200).json({
      success: false,
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
      success: false,
      error: "Authentication error",
      note: authError?.message || "Failed to verify authentication. Please try logging in again.",
    });
    return;
  }

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const { text } = req.body || {};

    if (!text) {
      res.status(400).json({ error: "Missing text field" });
      return;
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

    res.status(200).json(parsed);
    return;
  } catch (err: any) {
    console.error("categorizeMessage error:", err);
    res.status(200).json({
      success: false,
      error: "Failed to categorize message",
      note: err?.message || "An unexpected error occurred. Please try again.",
      details: process.env.NODE_ENV === "development" ? err?.stack : undefined,
    });
    return;
  }
}

export default withErrorHandling(handler);
