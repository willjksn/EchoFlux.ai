import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { checkApiKeys, getVerifyAuth, withErrorHandling } from "./_errorHandler.js";
import { APP_KNOWLEDGE } from "./appKnowledge.js";

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Check API keys early
  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    res.status(200).json({
      success: false,
      error: "AI not configured",
      note: apiKeyCheck.error,
    });
    return;
  }

  // Dynamic import for auth
  let user;
  try {
    const verifyAuth = await getVerifyAuth();
    user = await verifyAuth(req);
  } catch (authError: any) {
    console.error("verifyAuth error:", authError);
    res.status(200).json({
      success: false,
      error: "Authentication error",
      note: authError?.message || "Failed to verify authentication. Please try logging in again.",
    });
    return;
  }

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { question } = (req.body as any) || {};

  if (!question || typeof question !== "string") {
    res.status(400).json({ error: "Missing or invalid 'question'" });
    return;
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey!);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
    });

    const prompt = `
You are EchoFlux.ai's built-in assistant.

CRITICAL PRODUCT LIMITS (DO NOT MISREPRESENT):
- EchoFlux.ai is currently a creator-focused AI Content Studio & Campaign Planner (offline/planning-first).
- Do NOT claim the app provides social listening or competitor tracking in the current version.
- Do NOT claim the app provides automated DM/comment reply automation or automatic posting.
- You do NOT have live web access. Be honest about uncertainty for time-sensitive questions.

App System Knowledge:
${APP_KNOWLEDGE}

User UID: ${user.uid}

User question:
${question}

Answer clearly. Friendly tone. Keep responses concise and helpful.
If the user asks about \"latest\" or \"current\" external trends, you may answer based on your general knowledge, but you do NOT have direct live web access.
If something is time-sensitive (like today's exact algorithm changes), be honest about uncertainty and give generally reliable best practices instead.
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

    res.status(200).json({
      answer: text,
    });
    return;
  } catch (err: any) {
    console.error("askChatbot error:", err);
    res.status(200).json({
      success: false,
      error: "Failed to answer chatbot question",
      note: err?.message || "An unexpected error occurred. Please try again.",
      details: process.env.NODE_ENV === "development" ? err?.stack : undefined,
    });
    return;
  }
}

export default withErrorHandling(handler);
