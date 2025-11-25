import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { concept } = req.body || {};

    if (!concept) {
      return res.status(400).json({ error: "concept is required" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
Create a short-form video storyboard for this concept: "${concept}"

Return JSON as:
{
  "title": string,
  "hook": string,
  "scenes": [
    {
      "time": string,
      "visual": string,
      "audio": string
    }
  ],
  "cta": string
}

Return ONLY JSON.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    let storyboard;
    try {
      storyboard = JSON.parse(text);
    } catch {
      storyboard = { title: "Storyboard", raw: text };
    }

    return res.status(200).json({ storyboard });
  } catch (err: any) {
    console.error("generateStoryboard error:", err);
    return res.status(500).json({
      error: "Failed to generate storyboard",
      details: err?.message || String(err),
    });
  }
}
