import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { postContent } = req.body || {};

    if (!postContent) {
      return res.status(400).json({ error: "postContent is required" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
You are a senior social strategist.

Critique this post:
"${postContent}"

Give:
- 3 bullet points of what works
- 3 bullet points to improve
- 1 suggested improved version

Format with clear headings.`;

    const result = await model.generateContent(prompt);
    const critique = result.response.text().trim();

    return res.status(200).json({ critique });
  } catch (err: any) {
    console.error("generateCritique error:", err);
    return res.status(500).json({
      error: "Failed to generate critique",
      details: err?.message || String(err),
    });
  }
}
