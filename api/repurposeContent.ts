import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { checkApiKeys, getVerifyAuth, withErrorHandling } from "./_errorHandler.js";
import { getModelForTask, getModelNameForTask, getCostTierForTask } from "./_modelRouter.js";
import { trackModelUsage } from "./trackModelUsage.js";

/**
 * AI Content Repurposing Engine
 * Takes one piece of content and adapts it for multiple platforms with platform-specific optimizations.
 * Uses Tavily trends to ensure repurposed content is current and optimized.
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    res.status(200).json({
      success: false,
      error: "AI not configured",
      note: apiKeyCheck.error,
    });
    return;
  }

  const verifyAuth = await getVerifyAuth();
  const user = await verifyAuth(req);

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { 
    originalContent, 
    originalPlatform, 
    targetPlatforms, 
    niche,
    tone,
    goal,
    mediaType 
  } = (req.body as any) || {};

  if (!originalContent || !targetPlatforms || !Array.isArray(targetPlatforms) || targetPlatforms.length === 0) {
    res.status(400).json({ 
      error: "Missing required fields: originalContent and targetPlatforms array" 
    });
    return;
  }

  try {
    // Get trending context if Elite user (optional - works without trends too)
    let trendContext = '';
    if (user.plan === 'Elite' || user.role === 'Admin') {
      try {
        const trendRes = await fetch(`${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/getTrendingContext`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': req.headers.authorization || '',
          },
          body: JSON.stringify({ niche, platforms: targetPlatforms }),
        });
        if (trendRes.ok) {
          const trendData = await trendRes.json();
          trendContext = trendData.trendContext || '';
        }
      } catch (trendError) {
        console.warn('Failed to fetch trends, continuing without:', trendError);
      }
    }

    const model = await getModelForTask("caption", user.uid);
    
    const prompt = `
You are an expert content repurposing specialist for social media creators.

TASK: Repurpose the original content for each target platform, optimizing for platform-specific best practices and current trends.

${trendContext ? `CURRENT TRENDS & BEST PRACTICES:\n${trendContext}\n` : ''}

ORIGINAL CONTENT:
Platform: ${originalPlatform || 'Unknown'}
Content: ${originalContent}
${mediaType ? `Media Type: ${mediaType}` : ''}
${tone ? `Tone: ${tone}` : ''}
${goal ? `Goal: ${goal}` : ''}
${niche ? `Niche: ${niche}` : ''}

TARGET PLATFORMS: ${targetPlatforms.join(', ')}

REQUIREMENTS FOR EACH PLATFORM:

1. **Instagram**:
   - Feed Post: 125-150 words, storytelling format, 1-2 emojis, strong hook
   - Reel: Hook-first script (first 3 seconds critical), trending format, call-to-action
   - Carousel: Multi-slide breakdown with numbered points
   - Stories: Short, casual, question/poll suggestions

2. **TikTok**:
   - Hook-first (first 3 seconds must grab attention)
   - Trending sound/music suggestions
   - Hashtag strategy (mix of trending + niche)
   - Script format with timestamps
   - CTA for engagement (follow, like, comment)

3. **X (Twitter)**:
   - Character limit optimization (280 chars)
   - Thread format if content is longer (1/5, 2/5, etc.)
   - Trending hashtags
   - Engagement hooks (questions, polls)
   - Retweet-worthy format

4. **LinkedIn**:
   - Professional tone, industry insights
   - Longer form (up to 3000 chars if needed)
   - Value-driven, educational angle
   - Professional hashtags
   - Thought leadership positioning

5. **YouTube Shorts**:
   - Hook-first script (first 3 seconds)
   - Visual description suggestions
   - Engagement CTAs (subscribe, like, comment)
   - SEO-optimized description
   - Tags suggestions

6. **Facebook**:
   - Community-focused, conversational
   - Longer form allowed
   - Engagement prompts (questions, shares)
   - Group-friendly format

7. **Threads**:
   - Similar to Instagram but more text-focused
   - Conversational, community-driven
   - Thread format for longer content

8. **OnlyFans** (if applicable):
   - Direct, engaging, creator-to-fan tone
   - Subscription-focused CTAs
   - Behind-the-scenes, exclusive content angle
   - Personal, intimate connection

OUTPUT FORMAT (JSON only):
{
  "repurposedContent": [
    {
      "platform": "Platform Name",
      "format": "Feed Post" | "Reel" | "Story" | "Thread" | "Short" | etc.,
      "caption": "Full optimized caption for this platform",
      "hashtags": ["hashtag1", "hashtag2", ...],
      "optimizations": [
        "Why this was optimized for this platform",
        "Key changes made",
        "Trending elements included"
      ],
      "suggestedPostingTime": "Best time window for this platform",
      "additionalNotes": "Any platform-specific tips or suggestions"
    }
  ],
  "summary": "Brief summary of repurposing strategy"
}

GUIDELINES:
- Maintain core message and value across all platforms
- Adapt tone, length, and format for each platform
- Include platform-specific best practices
- Use current trends when relevant (from trend context above)
- Ensure each version is optimized for that platform's algorithm
- Keep brand voice consistent while adapting style
${tone ? `- Maintain ${tone} tone where appropriate` : ''}
`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.8, // Creative but consistent
      },
    });

    const raw = result.response.text().trim();
    
    // Parse JSON (handle code blocks)
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      const match = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/```\s*([\s\S]*?)```/);
      if (match) {
        data = JSON.parse(match[1].trim());
      } else {
        throw new Error("Failed to parse AI response as JSON");
      }
    }

    // Track usage
    await trackModelUsage({
      userId: user.uid,
      taskType: 'content_repurposing',
      modelName: getModelNameForTask('content_repurposing'),
      costTier: getCostTierForTask('content_repurposing'),
      inputTokens: Math.round(prompt.length / 4), // Rough estimate
      outputTokens: Math.round(raw.length / 4),
      estimatedCost: 0, // Calculate based on actual usage
      success: true,
    });

    res.status(200).json({
      success: true,
      repurposedContent: data.repurposedContent || [],
      summary: data.summary || '',
    });
  } catch (error: any) {
    console.error("Error repurposing content:", error);
    res.status(500).json({ 
      error: error?.message || "Failed to repurpose content",
      note: "Please try again or contact support if the issue persists.",
    });
  }
}

export default withErrorHandling(handler);
