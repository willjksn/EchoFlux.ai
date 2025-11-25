import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { history } = req.body || {};

    if (!Array.isArray(history)) {
      return res.status(400).json({ error: "history (array) is required" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
You are an AI CRM assistant.

Here is a chronological interaction history with a contact:
${JSON.stringify(history, null, 2)}

Return a short summary that includes:
- Who they are
- What they've shown interest in
- Current relationship stage
- Recommended next action

Use brief paragraphs and bullet points.`;

    const result = await model.generateContent(prompt);
    const summary = result.response.text().trim();

    return res.status(200).json({ summary });
  } catch (err: any) {
    console.error("generateCRMSummary error:", err);
    return res.status(500).json({
      error: "Failed to generate CRM summary",
      details: err?.message || String(err),
    });
  }
}
