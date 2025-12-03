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

    // Validate analytics data - check if it exists and is an object
    if (!analytics || typeof analytics !== 'object' || Array.isArray(analytics)) {
      return res.status(400).json({ 
        error: "Missing analytics data",
        note: "Analytics data must be a valid object. Please ensure analytics data is loaded before generating a report."
      });
    }
    
    // Check if analytics object has any meaningful data
    if (Object.keys(analytics).length === 0) {
      return res.status(400).json({ 
        error: "Empty analytics data",
        note: "Analytics data is empty. Please wait for data to load or try again."
      });
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

Generate a comprehensive, professional analytics report based on the following metrics:

${JSON.stringify(analytics, null, 2)}

Return ONLY valid JSON with a well-formatted report:

{
  "summary": "A comprehensive 2-3 paragraph executive summary of the analytics data, highlighting key metrics, trends, and overall performance.",
  "growthInsights": ["Insight 1: Detailed insight about growth patterns", "Insight 2: Another growth insight", "Insight 3: Additional growth observation"],
  "recommendedActions": ["Action 1: Specific actionable recommendation", "Action 2: Another recommendation", "Action 3: Third recommendation"],
  "riskFactors": ["Risk 1: Potential concern or risk identified", "Risk 2: Another risk factor"]
}

Important:
- Write in a professional, business-friendly tone
- Use clear, concise language
- Make insights actionable and specific
- Format as a readable report, not raw data
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
