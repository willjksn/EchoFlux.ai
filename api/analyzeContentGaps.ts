import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { checkApiKeys, getVerifyAuth, withErrorHandling } from "./_errorHandler.js";
import { getModelForTask, getModelNameForTask, getCostTierForTask } from "./_modelRouter.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { trackModelUsage } from "./trackModelUsage.js";
import { getLatestTrends } from "./_trendsHelper.js";
import { ComposeInsightLimitError, enforceAndRecordComposeInsightUsage } from "./_composeInsightsUsage.js";

/**
 * Smart Content Gap Analysis
 * Analyzes user's content history to identify gaps in content mix, topics, formats, and timing.
 * Uses Tavily trends to suggest content that fills gaps AND is currently trending.
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
    daysToAnalyze = 90,
    niche,
    platforms,
    calendarEvents,
    posts: providedPosts,
    useWeeklyTrends = false
  } = (req.body as any) || {};

  try {
    const db = getAdminDb();

    // Enforce Pro limits (2/mo) and record usage attempt (counts toward monthly usage)
    await enforceAndRecordComposeInsightUsage({
      db,
      userId: user.uid,
      feature: "content_gaps",
    });
    
    let posts: any[] = [];
    
    // Use provided posts if available (for OnlyFans calendar data)
    if (providedPosts && Array.isArray(providedPosts)) {
      posts = providedPosts;
    } else {
      // Get user's posts from the last N days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToAnalyze);
      
      const postsRef = db.collection("users").doc(user.uid).collection("posts");
      const postsSnapshot = await postsRef
        .where("createdAt", ">=", cutoffDate.toISOString())
        .get();

      postsSnapshot.forEach((doc) => {
        const data = doc.data();
        posts.push({
          id: doc.id,
          content: data.content || '',
          platforms: data.platforms || [],
          mediaType: data.mediaType || 'image',
          createdAt: data.createdAt || data.scheduledDate || '',
          status: data.status || 'draft',
          goal: data.goal || '',
          tone: data.tone || '',
        });
      });
    }

    // Add calendar events to posts data if provided (for OnlyFans)
    if (calendarEvents && Array.isArray(calendarEvents)) {
      calendarEvents.forEach((event: any) => {
        posts.push({
          id: `calendar-${event.date}`,
          content: event.description || '',
          platforms: ['OnlyFans'],
          mediaType: event.contentType === 'paid' ? 'video' : 'image',
          createdAt: event.date || '',
          status: 'scheduled',
          reminderType: event.reminderType,
          contentType: event.contentType,
        });
      });
    }

    // Get trending context - use weekly trends if requested, or Elite user
    let trendContext = '';
    if (useWeeklyTrends || user.plan === 'Elite' || user.role === 'Admin') {
      try {
        // Try to get weekly trends first (free, updated every Monday)
        if (useWeeklyTrends) {
          trendContext = await getLatestTrends();
        }
        
        // If Elite user and weekly trends not available, try Tavily
        if (!trendContext && (user.plan === 'Elite' || user.role === 'Admin')) {
          const trendRes = await fetch(`${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/getTrendingContext`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': req.headers.authorization || '',
            },
            body: JSON.stringify({ niche, platforms }),
          });
          if (trendRes.ok) {
            const trendData = await trendRes.json();
            trendContext = trendData.trendContext || '';
          }
        }
      } catch (trendError) {
        console.warn('Failed to fetch trends, continuing without:', trendError);
      }
    }

    const model = await getModelForTask("strategy", user.uid);

    const prompt = `
You are a content strategy analyst specializing in identifying content gaps and opportunities.

TASK: Analyze the creator's content history and identify gaps in their content mix, then suggest specific content ideas to fill those gaps.

${trendContext ? `CURRENT TRENDS & OPPORTUNITIES:\n${trendContext}\n` : ''}

CREATOR'S CONTENT HISTORY (Last ${daysToAnalyze} days):
Total Posts: ${posts.length}

${posts.length > 0 ? posts.slice(0, 50).map((p, i) => 
  `${i + 1}. ${p.content?.substring(0, 100)}... | Platforms: ${(p.platforms || []).join(', ')} | Type: ${p.mediaType} | Date: ${p.createdAt ? new Date(p.createdAt).toLocaleDateString() : 'Unknown'}`
).join('\n') : 'No posts found in this period.'}

${niche ? `CREATOR'S NICHE: ${niche}` : ''}
${platforms && platforms.length > 0 ? `TARGET PLATFORMS: ${platforms.join(', ')}` : ''}

ANALYSIS REQUIREMENTS:

1. **Content Type Distribution**:
   - Educational vs. Entertaining vs. Promotional vs. Personal
   - Identify which types are over/under-represented

2. **Platform Distribution**:
   - Which platforms are used most/least
   - Platform-specific content gaps

3. **Topic/Thematic Coverage**:
   - What topics are covered frequently
   - What topics are missing or underutilized
   - Pillar content balance

4. **Posting Frequency Patterns**:
   - Consistency analysis
   - Best posting days/times (if data available)
   - Gaps in posting schedule

5. **Content Format Mix**:
   - Images vs. Videos vs. Carousels vs. Stories
   - Format diversity score

6. **Engagement Strategy**:
   - CTA usage
   - Question/poll frequency
   - Community engagement patterns

OUTPUT FORMAT (JSON only):
{
  "analysis": {
    "totalPosts": ${posts.length},
    "analysisPeriod": "${daysToAnalyze} days",
    "contentTypeDistribution": {
      "educational": { "count": 0, "percentage": 0, "status": "balanced" | "over" | "under" },
      "entertaining": { "count": 0, "percentage": 0, "status": "balanced" | "over" | "under" },
      "promotional": { "count": 0, "percentage": 0, "status": "balanced" | "over" | "under" },
      "personal": { "count": 0, "percentage": 0, "status": "balanced" | "over" | "under" }
    },
    "platformDistribution": {
      "Instagram": { "count": 0, "percentage": 0 },
      "TikTok": { "count": 0, "percentage": 0 },
      "X": { "count": 0, "percentage": 0 },
      // ... other platforms
    },
    "formatDistribution": {
      "image": { "count": 0, "percentage": 0 },
      "video": { "count": 0, "percentage": 0 },
      "carousel": { "count": 0, "percentage": 0 }
    },
    "postingFrequency": {
      "averagePerWeek": 0,
      "consistencyScore": 0-100,
      "bestDays": ["Day1", "Day2"],
      "gaps": ["Description of posting gaps"]
    }
  },
  "gaps": [
    {
      "type": "content_type" | "platform" | "topic" | "format" | "timing",
      "severity": "high" | "medium" | "low",
      "description": "What gap was identified",
      "impact": "Why this gap matters",
      "recommendation": "What to do about it"
    }
  ],
  "suggestions": [
    {
      "title": "Content idea title",
      "type": "Educational" | "Entertaining" | "Promotional" | "Personal",
      "platform": "Instagram" | "TikTok" | etc.,
      "format": "Post" | "Reel" | "Carousel" | "Story",
      "topic": "Specific topic",
      "captionOutline": "Brief outline of caption",
      "whyThisFillsGap": "How this addresses identified gaps",
      "trendRelevance": "How this aligns with current trends (if applicable)",
      "priority": "high" | "medium" | "low"
    }
  ],
  "summary": "Overall assessment and key recommendations"
}

GUIDELINES:
- Be specific and actionable
- Prioritize high-impact gaps
- Consider current trends when suggesting content
- Balance gap-filling with creator's niche and brand
- Provide 10-15 specific content suggestions
- Explain why each suggestion fills a gap
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
      taskType: 'content_gap_analysis',
      modelName: getModelNameForTask('content_gap_analysis'),
      costTier: getCostTierForTask('content_gap_analysis'),
      inputTokens: Math.round(prompt.length / 4),
      outputTokens: Math.round(raw.length / 4),
      estimatedCost: 0,
      success: true,
    });

    res.status(200).json({
      success: true,
      analysis: data.analysis || {},
      gaps: data.gaps || [],
      suggestions: data.suggestions || [],
      summary: data.summary || '',
    });
  } catch (error: any) {
    console.error("Error analyzing content gaps:", error);
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
      error: error?.message || "Failed to analyze content gaps",
      note: "Please try again or contact support if the issue persists.",
    });
  }
}

export default withErrorHandling(handler);
