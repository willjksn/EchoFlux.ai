// api/generateAutopilotPlan.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getModel, parseJSON } from "./_geminiShared.js";
import { verifyAuth } from "./verifyAuth.js";

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

    const prompt = `
You are an elite social media strategist.

Create a structured content campaign plan.

Inputs:
- Goal: ${goal}
- Niche: ${niche}
- Audience: ${audience}
- Channels: ${
      Array.isArray(channels) ? channels.join(", ") : channels || "unspecified"
    }
- Duration in weeks: ${durationWeeks || 4}

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
