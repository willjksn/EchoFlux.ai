import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getModel, parseJSON } from "./_geminiShared.js";
import { verifyAuth } from "./verifyAuth.js";
import { getModelForTask } from "./_modelRouter.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { niche, audience, goal, duration, tone, platformFocus, analyticsData } = req.body || {};

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

    // Build analytics context for AI
    let analyticsContext = '';
    if (analyticsData) {
      const topTopics = analyticsData.topTopics?.slice(0, 5).join(', ') || 'No trending topics available';
      const engagementInsights = analyticsData.engagementInsights?.map(insight => `- ${insight.title}: ${insight.description}`).join('\n') || 'No specific insights available';
      const bestDays = analyticsData.responseRate?.sort((a, b) => b.value - a.value).slice(0, 3).map(d => d.name).join(', ') || 'No data';
      const engagementIncrease = analyticsData.engagementIncrease || 0;
      
      analyticsContext = `
ANALYTICS DATA (What's Working for This Account):
- Top Performing Topics: ${topTopics}
- Engagement Insights:
${engagementInsights}
- Best Days for Posting: ${bestDays}
- Engagement Increase: ${engagementIncrease}%
- Top Topics Getting Engagement: ${topTopics}

Use this analytics data to inform your strategy:
1. Focus on topics that are already performing well (${topTopics})
2. Schedule content on days that historically perform best (${bestDays})
3. Create content similar to what's getting high engagement
4. For image ideas: Suggest visual styles/types that match high-performing content
5. For video ideas: Suggest video formats/types that align with trending engagement patterns
`;
    }

    const prompt = `
You are an elite content strategist specializing in ${niche} for ${audience}.

${analyticsContext ? analyticsContext : 'Note: No analytics data available. Use best practices for this niche and audience.'}

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
          "platform": "Instagram" | "TikTok" | "X" | "LinkedIn" | "Facebook" | "Threads" | "YouTube",
          "imageIdeas": ["Idea 1 for images", "Idea 2 for images", "Idea 3 for images"],
          "videoIdeas": ["Idea 1 for videos", "Idea 2 for videos"]
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
- For each content item, provide 2-3 creative imageIdeas (specific visual concepts that would work well as images)
- For each content item, provide 1-2 creative videoIdeas (specific video concepts that would work well as short-form videos)
- Image and video ideas should be specific, actionable, and aligned with the topic and format
${analyticsData ? `
IMPORTANT: When generating imageIdeas and videoIdeas:
- Base suggestions on what types of images/videos are getting high engagement according to the analytics
- Suggest visual styles, compositions, and formats that match trending content types
- Consider the engagement patterns - if certain visual styles are working, incorporate similar approaches
- Make image/video type suggestions specific (e.g., "Behind-the-scenes photo with natural lighting", "Quick tutorial video with text overlays", "Product showcase with lifestyle context")
` : ''}
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

