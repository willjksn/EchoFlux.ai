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
Suggest 10 brand names, positions, and taglines for a creator or business in this niche:
"${niche}"

Return JSON:
[
  {
    "name": string,
    "positioning": string,
    "tagline": string
  }
]

Return ONLY JSON.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    let brands;
    try {
      brands = JSON.parse(text);
    } catch {
      brands = [];
    }

    return res.status(200).json({ brands });
  } catch (err: any) {
    console.error("generateBrandSuggestions error:", err);
    return res.status(500).json({
      error: "Failed to generate brand suggestions",
      details: err?.message || String(err),
    });
  }
}
