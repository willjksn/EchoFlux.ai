import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messageContent, messageType, platform, settings } = req.body || {};

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
You are a helpful social media assistant.

Incoming message:
"${messageContent}"

Message type: ${messageType || "general"}
Platform: ${platform || "generic"}
Tone/settings JSON:
${JSON.stringify(settings || {}, null, 2)}

Write a natural reply that:
- Matches the brand tone
- Is concise (1–3 sentences)
- Includes emojis only if appropriate for the platform
Return ONLY the reply text, no explanations.`;

    const result = await model.generateContent(prompt);
    const reply = result.response.text().trim();

    return res.status(200).json({ reply });
  } catch (err: any) {
    console.error("generateReply error:", err);
    return res.status(500).json({
      error: "Failed to generate reply",
      details: err?.message || String(err),
    });
  }
}
