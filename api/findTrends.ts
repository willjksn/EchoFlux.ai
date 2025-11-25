import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { niche } = req.body || {};

    if (!niche) {
      return res.status(400).json({ error: "niche is required" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
Give 10 current social content trends for the niche: "${niche}".

For each trend, return a JSON object:
{
  "name": string,
  "description": string,
  "exampleHook": string
}

Return ONLY a JSON array of these objects, no extra text.
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    let trends;
    try {
      trends = JSON.parse(text);
    } catch {
      trends = [];
    }

    return res.status(200).json({ trends });
  } catch (err: any) {
    console.error("findTrends error:", err);
    return res.status(500).json({
      error: "Failed to find trends",
      details: err?.message || String(err),
    });
  }
}
