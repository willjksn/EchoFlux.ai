import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { verifyAuth } from "./verifyAuth.js";


export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Auth required
    let user;
    try {
      user = await verifyAuth(req);
    } catch (authError: any) {
      console.error("verifyAuth error:", authError);
      return res.status(200).json({
        error: "Authentication error",
        note: authError?.message || "Failed to verify authentication.",
      });
    }

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { analytics } = req.body || {};

    if (!analytics) {
      return res.status(400).json({ error: "Missing analytics data" });
    }

    if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
      return res.status(200).json({
        error: "AI not configured",
        note: "GEMINI_API_KEY or GOOGLE_API_KEY is missing. Configure it in your environment to enable analytics reports.",
      });
    }

    // Use model router - analytics use thinking model for better insights
    const { getModelForTask } = await import("./_modelRouter.js");
    const model = await getModelForTask('analytics', user.uid);


    const prompt = `
You are an expert social media analyst.

Generate an analytics report based on the following JSON metrics:

${JSON.stringify(analytics, null, 2)}

Return ONLY valid JSON:

{
  "summary": "string",
  "growthInsights": ["string", "string"],
  "recommendedActions": ["string", "string", "string"],
  "riskFactors": ["string"]
}
`;

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    });

    const output = result.response.text().trim();

    let parsed;
    try {
      parsed = JSON.parse(output);
    } catch (err) {
      console.warn("JSON parse failed, returning raw text fallback");
      parsed = {
        summary: output,
        growthInsights: [],
        recommendedActions: [],
        riskFactors: [],
      };
    }

    return res.status(200).json(parsed);
  } catch (err: any) {
    console.error("generateAnalyticsReport error:", err);
    console.error("Error stack:", err?.stack);
    return res.status(200).json({
      error: "Failed to generate analytics report",
      note: err?.message || "An unexpected error occurred. Please try again.",
      details: process.env.NODE_ENV === "development" ? {
        message: err?.message,
        stack: err?.stack,
        name: err?.name,
      } : undefined,
    });
  }
}
