import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { verifyAuth } from "./verifyAuth.ts";
import { APP_KNOWLEDGE } from "./appKnowledge.ts";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { question } = (req.body as any) || {};

  if (!question || typeof question !== "string") {
    return res.status(400).json({ error: "Missing or invalid 'question'" });
  }

  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
    });

    const prompt = `
You are EngageSuite.ai’s built-in assistant.

App System Knowledge:
${APP_KNOWLEDGE}

User UID: ${user.uid}

User question:
${question}

Answer clearly. Friendly tone. Keep responses concise and helpful.
`;

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    });

    const text = result.response.text().trim();

    return res.status(200).json({
      answer: text,
    });
  } catch (err: any) {
    console.error("askChatbot error:", err);
    return res.status(500).json({
      error: "Failed to answer chatbot question",
      details: err?.message || String(err),
    });
  }
}
