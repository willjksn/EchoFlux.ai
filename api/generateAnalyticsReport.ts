import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const data = req.body || {};

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
You are an analytics expert.

Here is the user's social analytics data (JSON):
${JSON.stringify(data, null, 2)}

Write a concise, CMO-level report including:
- Key wins
- Weak spots
- Recommended actions for next 30 days
- Any notable patterns by platform or content type

Use markdown headings and bullet lists.`;

    const result = await model.generateContent(prompt);
    const report = result.response.text().trim();

    return res.status(200).json({ report });
  } catch (err: any) {
    console.error("generateAnalyticsReport error:", err);
    return res.status(500).json({
      error: "Failed to generate analytics report",
      details: err?.message || String(err),
    });
  }
}

