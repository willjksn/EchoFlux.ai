import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { prompt, baseImage } = req.body || {};

    if (!prompt) {
      return res.status(400).json({ error: "prompt is required" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    // For now, we just enhance the prompt text.
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const fullPrompt = `
Improve this text-to-image prompt for a social media asset:

Base prompt: "${prompt}"

Base image present: ${baseImage ? "yes" : "no"}

Return only the improved prompt.`;

    const result = await model.generateContent(fullPrompt);
    const improvedPrompt = result.response.text().trim();

    // TODO: hook up real image generation (Imagen, etc.)
    return res.status(200).json({
      imageData: null,      // no actual image yet
      improvedPrompt,
    });
  } catch (err: any) {
    console.error("generateImage error:", err);
    return res.status(500).json({
      error: "Failed to generate image (stub)",
      details: err?.message || String(err),
    });
  }
}
