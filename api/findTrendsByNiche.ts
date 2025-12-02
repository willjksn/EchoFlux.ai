// api/findTrendsByNiche.ts
// Find trending opportunities by niche/topic
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Dynamic imports to prevent module initialization errors
    const { verifyAuth } = await import("./verifyAuth.ts");
    const user = await verifyAuth(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { niche } = (req.body as any) || {};

    if (!niche || typeof niche !== "string" || !niche.trim()) {
      return res.status(400).json({
        success: false,
        error: "Missing required field",
        note: "niche is required and must be a non-empty string"
      });
    }

    try {
      // Use trends task type for better model routing
      const { getModelForTask } = await import("./_modelRouter.ts");
      const model = await getModelForTask("trends", user.uid);

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

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      });

      const raw = result.response.text();
      let data;

      try {
        data = JSON.parse(raw);
      } catch (parseError) {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/) || raw.match(/```\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          data = JSON.parse(jsonMatch[1]);
        } else {
          throw new Error("Failed to parse JSON response");
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

