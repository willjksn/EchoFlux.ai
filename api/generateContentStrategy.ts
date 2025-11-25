import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      niche,
      audience,
      goal,
      duration,
      tone,
      platformFocus,
    } = req.body || {};

    if (!niche || !audience || !goal || !duration) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
Create a social media content strategy.

Inputs:
- Niche: ${niche}
- Audience: ${audience}
- Goal: ${goal}
- Duration: ${duration}
- Tone: ${tone || "friendly"}
- Platform focus: ${platformFocus || "Instagram, TikTok, X, LinkedIn"}

Return a structured plan in JSON with:
{
  "overview": string,
  "pillars": [
    {
      "name": string,
      "description": string,
      "postIdeas": string[]
    }
  ],
  "postingSchedule": string,
  "kpis": string[]
}

Return ONLY valid JSON.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    let plan;
    try {
      plan = JSON.parse(text);
    } catch {
      plan = { overview: text };
    }

    return res.status(200).json({ plan });
  } catch (err: any) {
    console.error("generateContentStrategy error:", err);
    return res.status(500).json({
      error: "Failed to generate content strategy",
      details: err?.message || String(err),
    });
  }
}
