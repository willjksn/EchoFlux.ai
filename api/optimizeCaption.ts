import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { checkApiKeys, getVerifyAuth, withErrorHandling } from "./_errorHandler.js";
import { getModelForTask, getModelNameForTask, getCostTierForTask } from "./_modelRouter.js";
import { trackModelUsage } from "./trackModelUsage.js";

/**
 * AI Caption Optimizer
 * Analyzes existing captions and suggests improvements for engagement, hooks, CTAs, hashtags, and length.
 * Uses Tavily trends to ensure optimized captions use current best practices.
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
    originalCaption,
    platform,
    niche,
    tone,
    goal,
    mediaType,
    mediaDescription 
  } = (req.body as any) || {};

  if (!originalCaption || !platform) {
    res.status(400).json({ 
      error: "Missing required fields: originalCaption and platform" 
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
          body: JSON.stringify({ niche, platforms: [platform] }),
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

    // Platform-specific optimization guidelines
    const platformGuidelines: Record<string, string> = {
      'Instagram': `
        - Hook: First line must grab attention (first 125 characters visible)
        - Length: 125-150 words optimal for feed posts
        - Hashtags: 5-10 relevant hashtags (mix of broad + niche)
        - CTA: Clear call-to-action (question, poll, swipe up, DM)
        - Emojis: 1-3 emojis for visual break
        - Format: Storytelling or value-driven
      `,
      'TikTok': `
        - Hook: First 3 seconds critical - must be attention-grabbing
        - Length: Shorter is better (50-100 words)
        - Hashtags: 3-5 trending + niche hashtags
        - CTA: Engagement-focused (follow, like, comment, duet)
        - Format: Conversational, trending format
      `,
      'X': `
        - Hook: First line must be compelling (character limit: 280)
        - Length: Concise, impactful (under 280 characters)
        - Hashtags: 1-3 trending hashtags
        - CTA: Retweet-worthy, engagement prompt
        - Format: Thread if longer (1/5, 2/5 format)
      `,
      'LinkedIn': `
        - Hook: Professional, value-driven opening
        - Length: 300-1500 words (longer form allowed)
        - Hashtags: 3-5 professional, industry-specific
        - CTA: Thought leadership, connection, comment
        - Format: Educational, industry insights
      `,
      'YouTube': `
        - Hook: First line in description (first 125 chars visible)
        - Length: 200-500 words for description
        - Hashtags: 3-5 SEO-focused tags
        - CTA: Subscribe, like, comment, bell icon
        - Format: SEO-optimized, keyword-rich
      `,
      'OnlyFans': `
        - Hook: Direct, engaging, creator-to-fan
        - Length: 50-200 words
        - CTA: Subscription-focused, exclusive content
        - Format: Personal, intimate, behind-the-scenes
      `,
    };

    const prompt = `
You are an expert caption optimizer specializing in maximizing engagement on social media platforms.

TASK: Analyze the provided caption and optimize it for better engagement, following current best practices and trends.

${trendContext ? `CURRENT TRENDS & BEST PRACTICES:\n${trendContext}\n` : ''}

ORIGINAL CAPTION:
${originalCaption}

PLATFORM: ${platform}
${platformGuidelines[platform] || 'Use general best practices'}

${niche ? `NICHE: ${niche}` : ''}
${tone ? `TONE: ${tone} (maintain this tone)` : ''}
${goal ? `GOAL: ${goal}` : ''}
${mediaType ? `MEDIA TYPE: ${mediaType}` : ''}
${mediaDescription ? `MEDIA DESCRIPTION: ${mediaDescription}` : ''}

OPTIMIZATION CHECKLIST:

1. **Hook Analysis** (First line):
   - Is it attention-grabbing?
   - Does it create curiosity or emotion?
   - Would it stop a scroll?
   - Score: 1-10

2. **Length Optimization**:
   - Is length appropriate for platform?
   - Too long = people skip
   - Too short = missed opportunity
   - Score: 1-10

3. **CTA Clarity**:
   - Is call-to-action clear?
   - Is it specific and actionable?
   - Does it encourage engagement?
   - Score: 1-10

4. **Hashtag Strategy**:
   - Are hashtags relevant?
   - Mix of broad + niche?
   - Platform-appropriate count?
   - Trending hashtags included?
   - Score: 1-10

5. **Engagement Triggers**:
   - Questions to encourage comments?
   - Poll/story suggestions?
   - Emotional connection?
   - Score: 1-10

6. **Overall Structure**:
   - Readability and flow
   - Visual breaks (line breaks, emojis)
   - Value delivery
   - Score: 1-10

OUTPUT FORMAT (JSON only):
{
  "originalCaption": "${originalCaption}",
  "optimizedCaption": "Fully optimized caption",
  "scores": {
    "hook": 0-10,
    "length": 0-10,
    "cta": 0-10,
    "hashtags": 0-10,
    "engagement": 0-10,
    "structure": 0-10,
    "overall": 0-10
  },
  "improvements": [
    {
      "area": "hook" | "length" | "cta" | "hashtags" | "engagement" | "structure",
      "issue": "What was wrong",
      "fix": "What was changed",
      "impact": "Why this improves engagement"
    }
  ],
  "hashtagSuggestions": [
    {
      "hashtag": "hashtag",
      "reason": "Why this hashtag is recommended",
      "type": "trending" | "niche" | "broad"
    }
  ],
  "alternativeVersions": [
    {
      "version": "Alternative optimized caption",
      "focus": "What this version emphasizes",
      "useCase": "When to use this version"
    }
  ],
  "explanation": "Detailed explanation of all optimizations made"
}

GUIDELINES:
- Maintain original message and value
- Keep brand voice and tone consistent
- Apply platform-specific best practices
- Use current trends when relevant
- Explain every change clearly
- Provide actionable improvements
${tone ? `- Maintain ${tone} tone throughout` : ''}
`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.7,
      },
    });

    const raw = result.response.text().trim();
    
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
      taskType: 'caption_optimization',
      modelName: getModelNameForTask('caption_optimization'),
      costTier: getCostTierForTask('caption_optimization'),
      inputTokens: Math.round(prompt.length / 4),
      outputTokens: Math.round(raw.length / 4),
      estimatedCost: 0,
      success: true,
    });

    res.status(200).json({
      success: true,
      originalCaption: data.originalCaption || originalCaption,
      optimizedCaption: data.optimizedCaption || originalCaption,
      scores: data.scores || {},
      improvements: data.improvements || [],
      hashtagSuggestions: data.hashtagSuggestions || [],
      alternativeVersions: data.alternativeVersions || [],
      explanation: data.explanation || '',
    });
  } catch (error: any) {
    console.error("Error optimizing caption:", error);
    res.status(500).json({ 
      error: error?.message || "Failed to optimize caption",
      note: "Please try again or contact support if the issue persists.",
    });
  }
}

export default withErrorHandling(handler);
