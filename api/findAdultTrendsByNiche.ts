// api/findAdultTrendsByNiche.ts
// Find trending opportunities for adult creators (cached trends only)
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdultWeeklyTrends } from "./_trendsHelper.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
      console.error("findAdultTrendsByNiche: Missing GEMINI_API_KEY or GOOGLE_API_KEY");
      return res.status(200).json({
        success: false,
        error: "AI not configured",
        note: "GEMINI_API_KEY or GOOGLE_API_KEY is missing. Configure it in your environment to enable trend detection.",
        opportunities: [],
      });
    }

    let verifyAuth: any;
    try {
      const verifyAuthModule = await import("./verifyAuth.js");
      verifyAuth = verifyAuthModule.verifyAuth;
    } catch (importError: any) {
      console.error("Failed to import verifyAuth:", importError);
      return res.status(200).json({
        success: false,
        error: "Authentication module error",
        note: "Failed to load authentication module. Please check server configuration.",
        opportunities: [],
        details: process.env.NODE_ENV === "development" ? importError?.stack : undefined,
      });
    }

    let user;
    try {
      user = await verifyAuth(req);
    } catch (authError: any) {
      console.error("verifyAuth error:", authError);
      return res.status(200).json({
        success: false,
        error: "Authentication error",
        note: authError?.message || "Failed to verify authentication. Please try logging in again.",
        opportunities: [],
      });
    }

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { niche } = (req.body as any) || {};
    if (!niche || typeof niche !== "string" || !niche.trim()) {
      return res.status(400).json({
        success: false,
        error: "Missing required field",
        note: "niche is required and must be a non-empty string",
        opportunities: [],
      });
    }

    let webContextText = "";
    try {
      webContextText = await getAdultWeeklyTrends();
    } catch (err) {
      console.error("[findAdultTrendsByNiche] Failed to load cached weekly trends:", err);
      webContextText = "No cached trend data available. Use general best practices.";
    }

    let getModelForTask: any;
    try {
      const modelRouterModule = await import("./_modelRouter.js");
      getModelForTask = modelRouterModule.getModelForTask;
    } catch (importError: any) {
      console.error("Failed to import _modelRouter:", importError);
      return res.status(200).json({
        success: false,
        error: "Model router error",
        note: "Failed to load model router module. Please check server configuration.",
        opportunities: [],
        details: process.env.NODE_ENV === "development" ? importError?.stack : undefined,
      });
    }

    let model;
    try {
      model = await getModelForTask("trends", user.uid);
    } catch (modelError: any) {
      console.error("Model initialization error:", modelError);
      return res.status(200).json({
        success: false,
        error: "AI model error",
        note: modelError?.message || "Unable to initialize AI model. Please check your GEMINI_API_KEY environment variable.",
        opportunities: [],
        details: process.env.NODE_ENV === "development" ? modelError?.stack : undefined,
      });
    }

    const prompt = `
You are a trend strategist for adult monetized creators on OnlyFans, Fansly, and Fanvue.

Analyze the niche/topic: "${niche}"

Here is cached weekly trends & best-practices research (updated by a system job). Use it as a signal for what's currently relevant, but do NOT copy wording verbatim:

${webContextText}

IMPORTANT: Do NOT claim you performed a live web search. This is cached weekly research only.

Find 6-10 trending opportunities for adult creators. Cover OnlyFans, Fansly, and Fanvue.

For each opportunity, identify:
1. Trending Theme
2. PPV Angle
3. Interactive Trend
4. Offer/Bundle Angle
5. Content Gap

Return ONLY valid JSON in this exact structure:

{
  "opportunities": [
    {
      "id": "unique-id-1",
      "type": "Trending Theme" | "PPV Angle" | "Interactive Trend" | "Bundle/Offer" | "Content Gap",
      "title": "Short, clear title",
      "description": "Why this works and how to use it this week",
      "platform": "OnlyFans" | "Fansly" | "Fanvue",
      "engagementPotential": 1-10,
      "trendingVelocity": "Rising" | "Peak" | "Declining",
      "relatedHashtags": ["#tag1", "#tag2"],
      "bestPractices": "Tip on how to apply it for monetized creators"
    }
  ]
}

Requirements:
- Mix opportunity types (don't return all the same type)
- Include all three platforms
- Keep it explicit-friendly and monetization-focused
- engagementPotential: 1-10 (10 = highest potential)
- trendingVelocity: "Rising" = just starting, "Peak" = hot right now, "Declining" = still relevant but cooling
- Provide 2-3 related hashtags when relevant
`;

    let result;
    try {
      result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      });
    } catch (genError: any) {
      console.error("AI generation error:", genError);
      return res.status(200).json({
        success: false,
        error: "AI generation failed",
        note: genError?.message || "Failed to generate opportunities. Please check your GEMINI_API_KEY and try again.",
        opportunities: [],
        details: process.env.NODE_ENV === "development" ? genError?.stack : undefined,
      });
    }

    if (!result?.response) {
      console.error("Unexpected Gemini response shape:", result);
      return res.status(200).json({
        success: false,
        error: "AI generation failed",
        note: "Received an invalid response from the AI model.",
        opportunities: [],
      });
    }

    let raw: string;
    try {
      raw = result.response.text();
    } catch (textError: any) {
      console.error("Error extracting text from response:", textError);
      return res.status(200).json({
        success: false,
        error: "AI response parsing failed",
        note: textError?.message || "Failed to extract text from AI response. Please try again.",
        opportunities: [],
      });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (parseError: any) {
      console.error("Failed to parse JSON:", parseError, raw);
      return res.status(200).json({
        success: false,
        error: "AI response parsing failed",
        note: "The AI response was not valid JSON.",
        opportunities: [],
      });
    }

    const opportunities = Array.isArray(parsed?.opportunities) ? parsed.opportunities : [];

    return res.status(200).json({
      success: true,
      opportunities,
    });
  } catch (err: any) {
    console.error("findAdultTrendsByNiche error:", err);
    return res.status(200).json({
      success: false,
      error: "Unknown error",
      note: err?.message || "Unexpected server error",
      opportunities: [],
    });
  }
}
