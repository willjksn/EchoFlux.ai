// api/findTrendsByNiche.ts
// Find trending opportunities by niche/topic
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Ultra-defensive error handling - catch everything
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Check for required environment variables early
    if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
      console.error("findTrendsByNiche: Missing GEMINI_API_KEY or GOOGLE_API_KEY");
      return res.status(200).json({
        success: false,
        error: "AI not configured",
        note: "GEMINI_API_KEY or GOOGLE_API_KEY is missing. Configure it in your environment to enable trend detection.",
        opportunities: [],
      });
    }

    // Dynamic imports to prevent module initialization errors
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

    try {
      // Use trends task type for better model routing
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
You are an expert social media trend analyst specializing in identifying engagement opportunities.

Analyze the niche/topic: "${niche}"

Find 5-8 trending opportunities across different platforms (Instagram, TikTok, X/Twitter, LinkedIn, YouTube, Facebook, Threads).

For each opportunity, identify:
1. Trending Hashtags - Popular hashtags gaining traction
2. Viral Audio/Trends - Audio clips, sounds, or video trends going viral
3. Popular Topics - Hot topics and discussions
4. Collaboration Opportunities - Brands or creators to partner with (if applicable)
5. Content Gaps - Underserved topics in this niche

Return ONLY valid JSON in this exact structure:

{
  "opportunities": [
    {
      "id": "unique-id-1",
      "type": "Trending Hashtag" | "Viral Audio" | "Popular Topic" | "Collaboration Opportunity" | "Content Gap",
      "title": "Short, catchy title (e.g., '#SustainableFashion is trending')",
      "description": "Detailed description explaining why this is an opportunity, what it's about, and how to leverage it",
      "platform": "Instagram" | "TikTok" | "X" | "LinkedIn" | "YouTube" | "Facebook" | "Threads",
      "engagementPotential": 1-10,
      "trendingVelocity": "Rising" | "Peak" | "Declining",
      "relatedHashtags": ["#hashtag1", "#hashtag2"],
      "bestPractices": "Tip on how to use this opportunity effectively"
    }
  ]
}

Requirements:
- Mix of opportunity types (don't just return hashtags)
- Include opportunities across multiple platforms
- Focus on actionable, relevant opportunities for "${niche}"
- engagementPotential: 1-10 scale (10 = highest potential)
- trendingVelocity: "Rising" = just starting, "Peak" = hot right now, "Declining" = still relevant but cooling
- Make descriptions specific and actionable
- Include 2-3 related hashtags per opportunity when relevant
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

      if (!raw || typeof raw !== 'string') {
        console.error("Invalid raw response:", raw);
        return res.status(200).json({
          success: false,
          error: "Invalid AI response",
          note: "The AI model returned an invalid response format. Please try again.",
          opportunities: [],
        });
      }

      let data;
      try {
        data = JSON.parse(raw.trim());
      } catch (parseError) {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/) || raw.match(/```\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          try {
            data = JSON.parse(jsonMatch[1].trim());
          } catch (nestedParseError) {
            console.error("Failed to parse extracted JSON:", nestedParseError);
            console.error("Raw output (first 500 chars):", raw.substring(0, 500));
            return res.status(200).json({
              success: false,
              error: "Failed to parse AI response",
              note: "The AI model returned an invalid JSON response. Please try again.",
              opportunities: [],
            });
          }
        } else {
          console.error("Failed to parse JSON response. Raw output (first 500 chars):", raw.substring(0, 500));
          return res.status(200).json({
            success: false,
            error: "Failed to parse AI response",
            note: "The AI model returned an invalid JSON response. Please try again.",
            opportunities: [],
          });
        }
      }

      // Ensure opportunities array exists
      if (!data.opportunities || !Array.isArray(data.opportunities)) {
        data.opportunities = [];
      }

      // Validate and transform opportunities
      const opportunities = data.opportunities.map((opp: any, index: number) => ({
        id: opp.id || `opp-${Date.now()}-${index}`,
        type: opp.type || "Popular Topic",
        title: opp.title || "Trending Opportunity",
        description: opp.description || "A trending opportunity in your niche",
        platform: opp.platform || "Instagram",
        engagementPotential: opp.engagementPotential || 5,
        trendingVelocity: opp.trendingVelocity || "Rising",
        relatedHashtags: opp.relatedHashtags || [],
        bestPractices: opp.bestPractices || "",
      }));

      return res.status(200).json({
        success: true,
        opportunities,
      });
    } catch (aiError: any) {
      console.error("AI generation error:", aiError);
      return res.status(200).json({
        success: false,
        error: "Failed to generate opportunities",
        note: aiError?.message || "AI analysis failed. Please try again.",
        opportunities: [],
        details: process.env.NODE_ENV === "development" ? aiError?.stack : undefined,
      });
    }
  } catch (err: any) {
    console.error("findTrendsByNiche error:", err);
    return res.status(200).json({
      success: false,
      error: "Failed to find trends",
      note: err?.message || "An unexpected error occurred. Please try again.",
      opportunities: [],
      details: process.env.NODE_ENV === "development" ? err?.stack : undefined,
    });
  }
}

