import { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling } from "./_errorHandler.js";

async function getGeminiShared() {
  try {
    const module = await import("./_geminiShared.js");
    return { getModel: module.getModel, parseJSON: module.parseJSON };
  } catch (importError: any) {
    console.error(
      `Failed to import _geminiShared: ${
        importError?.message || String(importError)
      }`
    );
  }
}

async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { caption, hashtags, mediaType, goal, tone } = req.body;

    if (!caption) {
      res.status(400).json({
        error: "Caption is required",
      });
      return;
    }

    const shared = await getGeminiShared();
    if (!shared?.getModel || !shared?.parseJSON) {
      res.status(500).json({ error: "Failed to initialize Gemini model" });
      return;
    }
    const { getModel, parseJSON } = shared;

    const model = getModel();

    // Build prompt to analyze content and recommend platforms
    const prompt = `
You are a social media strategy expert. Analyze the following post content and recommend the best platforms for it.

Post Details:
- Caption: "${caption}"
- Hashtags: ${hashtags?.join(", ") || "None"}
- Media Type: ${mediaType || "image"}
- Goal: ${goal || "engagement"}
- Tone: ${tone || "friendly"}

Analyze this content and recommend platforms based on:
1. Content fit (how well the content matches each platform's audience and format)
2. Hashtag relevance (which platforms use similar hashtags effectively)
3. Media type compatibility (image vs video preferences per platform)
4. Engagement potential (where this content would perform best)

Available platforms: Instagram, TikTok, X (Twitter), LinkedIn, Threads, Facebook, YouTube

Return ONLY strict JSON in this format:
{
  "recommendations": [
    {
      "platform": "Instagram",
      "score": 95,
      "reason": "Visual content with lifestyle hashtags performs well on Instagram"
    },
    {
      "platform": "TikTok",
      "score": 75,
      "reason": "Short-form video content aligns with TikTok's format"
    }
  ],
  "bestTime": {
    "day": "Monday",
    "time": "14:00",
    "timezone": "UTC"
  }
}

Order recommendations by score (highest first). Include top 3-4 platforms.
`.trim();

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Parse JSON response
    let parsed;
    try {
      parsed = parseJSON(responseText);
    } catch (parseError) {
      // Fallback: try to extract JSON from markdown code blocks
      const jsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error("Failed to parse AI response");
      }
    }

    // Validate and format response
    const recommendations = parsed.recommendations || [];
    const bestTime = parsed.bestTime || {
      day: "Monday",
      time: "14:00",
      timezone: "UTC",
    };

    res.status(200).json({
      recommendations: recommendations.map((rec: any) => ({
        platform: rec.platform,
        score: rec.score || 0,
        reason: rec.reason || "Good fit for this platform",
      })),
      bestTime,
    });
  } catch (error: any) {
    console.error("Error analyzing post for platforms:", error);
    res.status(200).json({
      error: "Failed to analyze post for platforms",
      note: error?.message || "An unexpected error occurred.",
      details: process.env.NODE_ENV === "development" ? error?.stack : undefined,
    });
    return;
  }
}

export default withErrorHandling(handler);
