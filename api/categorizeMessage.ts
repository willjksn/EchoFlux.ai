import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";

const VALID = ["Lead", "Support", "Opportunity", "General"] as const;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messageContent } = req.body || {};

    if (!messageContent) {
      return res.status(400).json({ error: "messageContent is required" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
Classify this inbox message into one of:
- Lead
- Support
- Opportunity
- General

Message:
"${messageContent}"

Return ONLY one word: Lead, Support, Opportunity, or General.
`;

    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();

    // Normalize
    const normalized = VALID.find(
      (v) => v.toLowerCase() === text.toLowerCase()
    ) || "General";

    return res.status(200).json({ category: normalized });
  } catch (err: any) {
    console.error("categorizeMessage error:", err);
    return res.status(500).json({
      error: "Failed to categorize message",
      details: err?.message || String(err),
    });
  }
}
