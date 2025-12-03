// api/generateContentIdeas.ts
// Generate AI-powered content ideas based on category (high engagement, niche, trending)
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, getModelRouter, withErrorHandling } from "./_errorHandler.js";

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    return res.status(200).json({
      success: false,
      error: "AI not configured",
      note: apiKeyCheck.error,
      ideas: [],
    });
  }

  let user;
  try {
    const verifyAuth = await getVerifyAuth();
    user = await verifyAuth(req);
  } catch (authError: any) {
    return res.status(200).json({
      success: false,
      error: "Authentication error",
      note: authError?.message || "Failed to verify authentication.",
      ideas: [],
    });
  }

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { niche, category, userType } = req.body || {};
  // category: 'high-engagement' | 'niche' | 'trending'

  if (!niche || !category) {
    return res.status(400).json({ 
      success: false,
      error: "Missing required fields",
      note: "niche and category are required",
      ideas: []
    });
  }

  try {
    const getModelForTask = await getModelRouter();
    // Use 'caption' task type to get the same model as captions (gemini-2.0-flash-lite)
    const model = await getModelForTask('caption', user.uid);

    const categoryPrompts = {
      'high-engagement': `Generate 5-8 high-engagement content ideas that are proven to drive likes, comments, and shares. Focus on formats and topics that typically get high engagement rates.`,
      'niche': `Generate 5-8 niche-specific content ideas tailored to ${niche}. These should be highly relevant and valuable to your specific audience.`,
      'trending': `Generate 5-8 trending content ideas that capitalize on current trends, viral formats, and popular topics in ${niche}. Make them timely and relevant.`
    };

    const prompt = `
You are an expert social media content strategist.

${categoryPrompts[category as keyof typeof categoryPrompts] || categoryPrompts['high-engagement']}

User Context:
- Niche/Topic: ${niche}
- User Type: ${userType || 'Creator'}
- Category Focus: ${category}

Return ONLY valid JSON array with this exact structure:
[
  {
    "title": "Short, catchy content idea title",
    "description": "Detailed description explaining the idea and why it works (2-3 sentences)",
    "format": "Post" | "Reel" | "Story",
    "platform": "Instagram" | "TikTok" | "X" | "LinkedIn" | "YouTube" | "Facebook" | "Threads",
    "engagementPotential": 1-10,
    "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3"]
  }
]

Requirements:
- Generate 5-8 unique content ideas
- Mix different formats (Posts, Reels, Stories)
- Include ideas for different platforms
- engagementPotential: 1-10 scale (10 = highest potential)
- Include 2-3 relevant hashtags per idea
- Make titles catchy and actionable
- Descriptions should explain why the idea works and how to execute it
`;

    const response = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    const raw = response.response.text().trim();
    let ideas: any[];

    try {
      ideas = JSON.parse(raw);
    } catch (parseError) {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/) || raw.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          ideas = JSON.parse(jsonMatch[1].trim());
        } catch {
          console.error("Failed to parse extracted JSON");
          return res.status(200).json({
            success: false,
            error: "Failed to parse AI response",
            note: "The AI model returned an invalid JSON response. Please try again.",
            ideas: [],
          });
        }
      } else {
        console.error("Failed to parse JSON response. Raw output:", raw.substring(0, 200));
        return res.status(200).json({
          success: false,
          error: "Failed to parse AI response",
          note: "The AI model returned an invalid JSON response. Please try again.",
          ideas: [],
        });
      }
    }

    // Ensure it's an array
    if (!Array.isArray(ideas)) {
      ideas = [];
    }

    // Validate and transform ideas
    const validatedIdeas = ideas.map((idea: any, index: number) => ({
      id: `idea-${Date.now()}-${index}`,
      title: idea.title || `Content Idea ${index + 1}`,
      description: idea.description || "A great content idea for your niche",
      format: idea.format || "Post",
      platform: idea.platform || "Instagram",
      engagementPotential: idea.engagementPotential || 5,
      hashtags: Array.isArray(idea.hashtags) ? idea.hashtags : [],
      category: category
    }));

    return res.status(200).json({
      success: true,
      ideas: validatedIdeas,
    });
  } catch (error: any) {
    console.error("generateContentIdeas error:", error);
    return res.status(200).json({
      success: false,
      error: "Failed to generate content ideas",
      note: error?.message || "AI generation failed. Please try again.",
      ideas: [],
    });
  }
}

export default withErrorHandling(handler);

