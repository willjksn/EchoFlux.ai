import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { checkApiKeys, getVerifyAuth, withErrorHandling } from "./_errorHandler.js";
import { getModelForTask, getModelNameForTask, getCostTierForTask } from "./_modelRouter.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { trackModelUsage } from "./trackModelUsage.js";
import { ComposeInsightLimitError, enforceAndRecordComposeInsightUsage } from "./_composeInsightsUsage.js";

/**
 * AI Content Performance Predictor
 * Analyzes content before posting and predicts performance (High/Medium/Low).
 * Uses historical data, trends, and best practices to make predictions.
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
    caption,
    platform,
    mediaType,
    mediaDescription,
    niche,
    tone,
    goal,
    scheduledDate,
    hashtags
  } = (req.body as any) || {};

  if (!caption || !platform) {
    res.status(400).json({ 
      error: "Missing required fields: caption and platform" 
    });
    return;
  }

  try {
    const db = getAdminDb();

    // Enforce Pro limits (5/mo) and record usage attempt (counts toward monthly usage)
    await enforceAndRecordComposeInsightUsage({
      db,
      userId: user.uid,
      feature: "predict",
    });
    
    // Get user's historical performance data (if available)
    const postsRef = db.collection("users").doc(user.uid).collection("posts");
    const recentPosts = await postsRef
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const historicalData: any[] = [];
    recentPosts.forEach((doc) => {
      const data = doc.data();
      historicalData.push({
        content: data.content || '',
        platform: data.platforms?.[0] || '',
        mediaType: data.mediaType || 'image',
        createdAt: data.createdAt || '',
        // Note: Actual engagement data would come from analytics if available
        // For now, we'll use pattern matching
      });
    });

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

    const model = await getModelForTask("strategy", user.uid);

    const prompt = `
You are a content performance prediction specialist for social media creators.

TASK: Analyze the provided content and predict its performance (High/Medium/Low) based on multiple factors, then suggest improvements to boost the prediction.

${trendContext ? `CURRENT TRENDS & BEST PRACTICES:\n${trendContext}\n` : ''}

CONTENT TO PREDICT:
Caption: ${caption}
Platform: ${platform}
Media Type: ${mediaType || 'image'}
${mediaDescription ? `Media Description: ${mediaDescription}` : ''}
${niche ? `Niche: ${niche}` : ''}
${tone ? `Tone: ${tone}` : ''}
${goal ? `Goal: ${goal}` : ''}
${scheduledDate ? `Scheduled Date: ${new Date(scheduledDate).toLocaleString()}` : ''}
${hashtags && hashtags.length > 0 ? `Hashtags: ${hashtags.join(', ')}` : ''}

HISTORICAL CONTEXT (User's Recent Content):
${historicalData.length > 0 
  ? historicalData.slice(0, 20).map((p, i) => 
      `${i + 1}. ${p.content?.substring(0, 80)}... | Platform: ${p.platform} | Type: ${p.mediaType}`
    ).join('\n')
  : 'No historical data available'
}

PREDICTION FACTORS TO ANALYZE:

1. **Caption Quality**:
   - Hook strength (first line)
   - Value delivery
   - Clarity and readability
   - Emotional connection
   - CTA effectiveness

2. **Platform Optimization**:
   - Length appropriateness
   - Format suitability
   - Hashtag strategy
   - Platform-specific best practices
   - Algorithm alignment

3. **Timing** (if scheduledDate provided):
   - Day of week
   - Time of day
   - Platform-specific optimal times
   - Trend relevance timing

4. **Content Type**:
   - Media type (image/video/carousel)
   - Format alignment with platform
   - Visual appeal potential

5. **Trend Alignment**:
   - Relevance to current trends
   - Trending topic usage
   - Format trends (Reels, Shorts, etc.)

6. **Historical Patterns**:
   - Similarity to high-performing content
   - Consistency with creator's style
   - Learning from past performance

OUTPUT FORMAT (JSON only):
{
  "prediction": {
    "level": "High" | "Medium" | "Low",
    "confidence": 0-100,
    "score": 0-100,
    "reasoning": "Why this prediction was made"
  },
  "factors": {
    "captionQuality": { "score": 0-100, "analysis": "..." },
    "platformOptimization": { "score": 0-100, "analysis": "..." },
    "timing": { "score": 0-100, "analysis": "..." },
    "contentType": { "score": 0-100, "analysis": "..." },
    "trendAlignment": { "score": 0-100, "analysis": "..." },
    "historicalPatterns": { "score": 0-100, "analysis": "..." }
  },
  "improvements": [
    {
      "factor": "captionQuality" | "platformOptimization" | "timing" | etc.,
      "currentIssue": "What's limiting performance",
      "suggestion": "How to improve",
      "expectedImpact": "How much this would boost prediction",
      "priority": "high" | "medium" | "low"
    }
  ],
  "optimizedVersion": {
    "caption": "Improved caption version",
    "hashtags": ["improved", "hashtags"],
    "suggestedTime": "Best time to post",
    "expectedBoost": "How much this would improve prediction"
  },
  "summary": "Overall assessment and key recommendations"
}

GUIDELINES:
- Be honest and realistic in predictions
- Provide specific, actionable improvements
- Consider all factors holistically
- Explain reasoning clearly
- Prioritize high-impact improvements
- Use current trends when relevant
${tone ? `- Maintain ${tone} tone in suggestions` : ''}
`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.6, // More analytical, less creative
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
      taskType: 'performance_prediction',
      modelName: getModelNameForTask('performance_prediction'),
      costTier: getCostTierForTask('performance_prediction'),
      inputTokens: Math.round(prompt.length / 4),
      outputTokens: Math.round(raw.length / 4),
      estimatedCost: 0,
      success: true,
    });

    res.status(200).json({
      success: true,
      prediction: data.prediction || { level: 'Medium', confidence: 50, score: 50 },
      factors: data.factors || {},
      improvements: data.improvements || [],
      optimizedVersion: data.optimizedVersion || {},
      summary: data.summary || '',
    });
  } catch (error: any) {
    console.error("Error predicting performance:", error);
    if (error instanceof ComposeInsightLimitError) {
      res.status(403).json({
        error: error.message,
        feature: error.feature,
        used: error.used,
        limit: error.limit,
      });
      return;
    }
    res.status(500).json({
      error: error?.message || "Failed to predict performance",
      note: "Please try again or contact support if the issue persists.",
    });
  }
}

export default withErrorHandling(handler);
