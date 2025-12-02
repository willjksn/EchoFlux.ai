import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getModel, parseJSON } from "./_geminiShared.ts";
import { verifyAuth } from "./verifyAuth.ts";
import { getModelForTask } from "./_modelRouter.ts";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { niche, audience, goal, duration, tone, platformFocus } = req.body || {};

  if (!niche || !audience || !goal) {
    return res.status(400).json({ error: "Missing required fields: niche, audience, and goal are required" });
  }

  try {
    // Use strategy task type for better model routing
    const model = await getModelForTask("strategy", user.uid);
    
    const durationWeeks = duration ? parseInt(duration.replace(/\D/g, '')) || 4 : 4;
    const platforms = platformFocus && platformFocus !== 'Mixed / All' 
      ? [platformFocus] 
      : ['Instagram', 'TikTok', 'X', 'LinkedIn', 'Facebook', 'Threads', 'YouTube'];

    const prompt = `
You are an elite content strategist specializing in ${niche} for ${audience}.

Create a ${durationWeeks}-week content strategy with the following parameters:
- Goal: ${goal}
- Tone: ${tone}
- Platform Focus: ${platformFocus || 'Mixed / All'}
- Target Audience: ${audience}
- Niche: ${niche}

Return ONLY valid JSON in this exact structure:

{
  "weeks": [
    {
      "weekNumber": 1,
      "theme": "Week theme/focus (e.g., 'Brand Introduction' or 'Product Showcase')",
      "content": [
        {
          "dayOffset": 0,
          "topic": "Specific content topic/idea (e.g., 'Behind the scenes of our process')",
          "format": "Post" | "Reel" | "Story",
          "platform": "Instagram" | "TikTok" | "X" | "LinkedIn" | "Facebook" | "Threads" | "YouTube"
        }
      ]
    }
  ],
  "metrics": {
    "primaryKPI": "Main metric to track (e.g., 'Follower Growth', 'Lead Generation', 'Engagement Rate')",
    "targetValue": 100,
    "successCriteria": [
      "Criterion 1 (e.g., '20% increase in followers')",
      "Criterion 2 (e.g., '15% engagement rate')"
    ],
    "milestones": [
      {
        "week": 1,
        "description": "Week 1 milestone description",
        "targetMetric": 25
      }
    ]
  }
}

Requirements:
- Generate ${durationWeeks} weeks of content
- Each week should have 5-7 content items (mix of Posts, Reels, and Stories)
- Distribute content across platforms: ${platforms.join(', ')}
- Content should align with goal: ${goal}
- Use tone: ${tone}
- Make topics specific and actionable
- Ensure variety in formats and platforms
- dayOffset should be 0-6 for week 1, 7-13 for week 2, etc.
`;

    const response = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    const raw = response.response.text();
    let plan;

    try {
      plan = parseJSON(raw);
      
      // Validate and transform the response to ensure correct structure
      if (!plan.weeks || !Array.isArray(plan.weeks)) {
        throw new Error("Invalid response structure: missing weeks array");
      }

      // Ensure each week has the correct structure
      plan.weeks = plan.weeks.map((week: any, weekIndex: number) => ({
        weekNumber: week.weekNumber || weekIndex + 1,
        theme: week.theme || week.focus || `Week ${weekIndex + 1} Theme`,
        content: (week.content || []).map((day: any, dayIndex: number) => ({
          dayOffset: day.dayOffset !== undefined ? day.dayOffset : (weekIndex * 7) + dayIndex,
          topic: day.topic || day.postIdea || `Content idea ${dayIndex + 1}`,
          format: day.format || (day.postType === 'Reel' ? 'Reel' : day.postType === 'Story' ? 'Story' : 'Post'),
          platform: day.platform || (Array.isArray(day.platforms) ? day.platforms[0] : 'Instagram')
        }))
      }));

      // Ensure metrics structure
      if (!plan.metrics) {
        plan.metrics = {
          primaryKPI: goal === 'Increase Followers/Fans' ? 'Follower Growth' :
                     goal === 'Lead Generation' ? 'Leads Generated' :
                     goal === 'Sales Conversion' ? 'Revenue' :
                     goal === 'Brand Awareness' ? 'Reach' : 'Engagement Rate',
          successCriteria: [
            `Achieve ${goal.toLowerCase()} targets`,
            "Maintain consistent posting schedule"
          ]
        };
      }

    } catch (parseError: any) {
      console.error("Failed to parse strategy response:", parseError);
      console.error("Raw response:", raw);
      return res.status(200).json({
        error: "Failed to parse strategy response",
        note: "The AI generated a response but it wasn't in the expected format. Please try again.",
        details: process.env.NODE_ENV === "development" ? parseError?.message : undefined
      });
    }

    return res.status(200).json({ plan });
  } catch (error: any) {
    console.error("generateContentStrategy error:", error);
    return res.status(200).json({
      error: "Failed to generate content strategy",
      note: error?.message || "An unexpected error occurred. Please try again.",
      details: process.env.NODE_ENV === "development" ? error?.stack : undefined
    });
  }
}

