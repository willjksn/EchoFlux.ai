import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getModel, parseJSON } from "./_geminiShared.js";
import { verifyAuth } from "./verifyAuth.js";
import { getGoalFramework, getGoalSpecificCTAs, getGoalSpecificContentGuidance } from "./_goalFrameworks.js";
import { getLatestTrends } from "./_trendsHelper.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth
  const user = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const {
      goal,
      niche,
      audience,
      channels,
      durationWeeks,
    } = (req.body as any) || {};

    if (!goal || !niche || !audience) {
      return res
        .status(400)
        .json({ error: "Missing required fields: goal, niche, audience" });
    }

    const model = getModel("gemini-2.0-flash");

    // Get goal-specific framework and current trends
    const goalFramework = getGoalFramework(goal);
    let currentTrends = '';
    try {
      currentTrends = await getLatestTrends();
    } catch (error) {
      console.error('[generateAutopilotPlan] Error fetching trends:', error);
      currentTrends = 'Trend data unavailable. Using general best practices.';
    }

    const prompt = `
You are an elite social media strategist specializing in creating goal-driven content campaigns.

${goalFramework}

${currentTrends}

PRIMARY OBJECTIVE: Create a structured content campaign plan specifically designed to achieve: ${goal}

Inputs:
- Primary Goal: ${goal} (THIS IS THE MOST IMPORTANT - every content piece should directly support this goal)
- Niche: ${niche}
- Audience: ${audience}
- Channels: ${
      Array.isArray(channels) ? channels.join(", ") : channels || "unspecified"
    }
- Duration in weeks: ${durationWeeks || 4}

CRITICAL INSTRUCTIONS FOR GOAL ACHIEVEMENT:
1. Every content piece must directly contribute to achieving "${goal}"
2. Use the strategic framework above to guide content creation
3. Incorporate current social media trends and best practices from the trends data
4. Create a strategic progression: Early weeks build foundation, later weeks drive action
5. Include specific CTAs aligned with ${goal}: ${getGoalSpecificCTAs(goal)}
6. Follow goal-specific content guidance: ${getGoalSpecificContentGuidance(goal)}

Return ONLY valid JSON with this exact shape:

{
  "overview": "short paragraph summary of the campaign",
  "weeks": [
    {
      "week": 1,
      "focus": "theme or focus for the week",
      "days": [
        {
          "day": "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun",
          "platforms": ["Instagram", "TikTok", "X", "YouTube", "Threads", "LinkedIn", "Facebook"],
          "postType": "Feed Post" | "Reel" | "Story" | "Short" | "Carousel" | "Live" | "Tweet",
          "postIdea": "short description of the content idea",
          "angle": "what makes this post compelling",
          "cta": "call to action",
          "aiCaptionPrompt": "single line prompt that can be used to generate a caption",
          "notes": "any extra execution notes"
        }
      ]
    }
  ]
}
`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const raw = result.response.text().trim();

    let plan: any;
    try {
      plan = parseJSON(raw);
    } catch (err) {
      console.error("Failed to parse JSON from model:", raw);
      return res.status(500).json({
        error: "Model returned invalid JSON",
      });
    }

    return res.status(200).json({ plan });
  } catch (err: any) {
    console.error("generateAutopilotPlan error:", err);
    return res.status(500).json({
      error: "Failed to generate autopilot plan",
      details: err?.message ?? String(err),
    });
  }
}

