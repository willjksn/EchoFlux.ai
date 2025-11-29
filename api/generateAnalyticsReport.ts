import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { verifyAuth } from "./verifyAuth.ts";


export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth required
  const user = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { analytics } = req.body || {};

    if (!analytics) {
      return res.status(400).json({ error: "Missing analytics data" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    // Use model router - analytics use thinking model for better insights
    const { getModelForTask } = await import("./_modelRouter.ts");
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
    return res.status(500).json({
      error: "Failed to generate analytics report",
      details: err?.message || String(err),
    });
  }
}
