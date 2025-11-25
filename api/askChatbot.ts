import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { question } = req.body || {};

    if (!question) {
      return res.status(400).json({ error: "question is required" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent(
      `You are a helpful assistant for a social media management tool. Answer clearly and concisely.\n\nUser: ${question}`
    );

    const answer = result.response.text().trim();
    return res.status(200).json({ answer });
  } catch (err: any) {
    console.error("askChatbot error:", err);
    return res.status(500).json({
      error: "Failed to answer question",
      details: err?.message || String(err),
    });
  }
}
