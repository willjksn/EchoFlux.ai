import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { verifyAuth } from "./verifyAuth.ts";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Require auth
  const user = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { text } = req.body || {};

    if (!text) {
      return res.status(400).json({ error: "Missing text field" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    // Use model router - categorization uses cheapest model for cost optimization
    const { getModelForTask } = await import("./_modelRouter.ts");
    const model = getModelForTask('categorize');

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
    return res.status(500).json({
      error: "Failed to categorize message",
      details: err?.message || String(err),
    });
  }
}
