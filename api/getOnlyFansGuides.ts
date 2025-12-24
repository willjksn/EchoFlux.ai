import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, withErrorHandling } from "./_errorHandler.js";
import { getModelForTask } from "./_modelRouter.js";
import { parseJSON } from "./_geminiShared.js";
import { getOnlyFansResearchContext } from "./_onlyfansResearch.js";
import { getLatestTrends } from "./_trendsHelper.js";

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Check API keys early
  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    res.status(200).json({
      success: false,
      error: "AI not configured",
      note: apiKeyCheck.error,
    });
    return;
  }

  // Dynamic import for auth
  let user;
  try {
    const verifyAuth = await getVerifyAuth();
    user = await verifyAuth(req);
  } catch (authError: any) {
    console.error("verifyAuth error:", authError);
    res.status(200).json({
      success: false,
      error: "Authentication error",
      note: authError?.message || "Failed to verify authentication. Please try logging in again.",
    });
    return;
  }

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { audience, goal, analyticsData } = req.body || {};

  try {
    const model = await getModelForTask("strategy", user.uid);
    
    // Get user plan for research context
    const { getAdminDb } = await import("./_firebaseAdmin.js");
    const db = getAdminDb();
    const userDoc = await db.collection("users").doc(user.uid).get();
    const userData = userDoc.data();
    const userPlan = userData?.plan || 'Free';
    const userRole = userData?.role;

    // Get OnlyFans research context
    const onlyfansResearch = await getOnlyFansResearchContext(
      audience || 'Subscribers',
      goal || 'Engagement',
      user.uid,
      userPlan,
      userRole
    );

    // Get weekly trends
    let weeklyTrends = '';
    try {
      weeklyTrends = await getLatestTrends();
    } catch (error) {
      console.error('[getOnlyFansGuides] Error fetching trends:', error);
      weeklyTrends = 'Trend data unavailable. Using general best practices.';
    }

    // Build analytics context if provided
    let analyticsContext = '';
    if (analyticsData) {
      const topTopics = analyticsData.topTopics?.slice(0, 5).join(', ') || 'No trending topics available';
      const engagementInsights = analyticsData.engagementInsights?.map((insight: any) => `- ${insight.title}: ${insight.description}`).join('\n') || 'No specific insights available';
      const bestDays = analyticsData.responseRate?.sort((a: any, b: any) => b.value - a.value).slice(0, 3).map((d: any) => d.name).join(', ') || 'No data';
      const engagementIncrease = analyticsData.engagementIncrease || 0;
      const subscriberCount = analyticsData.subscriberCount || 'Not provided';
      const engagementRate = analyticsData.engagementRate || 'Not provided';
      const topContentTypes = analyticsData.topContentTypes?.join(', ') || 'No data';
      const customInsights = analyticsData.customInsights || '';
      
      analyticsContext = `
CREATOR ANALYTICS & INSIGHTS:
- Subscriber Count: ${subscriberCount}
- Engagement Rate: ${engagementRate}
- Top Performing Topics: ${topTopics}
- Top Content Types: ${topContentTypes}
- Engagement Insights:
${engagementInsights}
- Best Days for Posting: ${bestDays}
- Engagement Increase: ${engagementIncrease}%
${customInsights ? `- Custom Insights: ${customInsights}` : ''}

Use this data to tailor the guides and tips to what's working for this creator.
`;
    }

    const prompt = `
You are an OnlyFans content strategy expert. Generate current, actionable guides and tips for OnlyFans creators.

${weeklyTrends}

${onlyfansResearch}

${analyticsContext ? analyticsContext : 'Note: No analytics data available. Provide general best practices.'}

Generate comprehensive guides and tips that are:
1. CURRENT - Based on the latest research and trends provided above
2. SPECIFIC - Actionable advice for OnlyFans creators
3. PRACTICAL - Tips that can be implemented immediately
4. DATA-DRIVEN - Use insights from successful OnlyFans creators when available

Return ONLY valid JSON in this exact structure:
{
  "contentStrategyTips": [
    {
      "title": "Tip title",
      "description": "Detailed explanation of the tip",
      "actionable": "Specific action the creator can take"
    }
  ],
  "engagementTactics": [
    {
      "title": "Tactic title",
      "description": "How this tactic works",
      "implementation": "Step-by-step how to implement"
    }
  ],
  "monetizationStrategies": [
    {
      "title": "Strategy title",
      "description": "What this strategy does",
      "revenuePotential": "How this can increase revenue"
    }
  ],
  "commonMistakes": [
    {
      "title": "Mistake title",
      "description": "Why this is a mistake",
      "solution": "How to avoid or fix this"
    }
  ],
  "platformBestPractices": [
    {
      "title": "Best practice title",
      "description": "Why this matters",
      "howTo": "How to implement this practice"
    }
  ]
}

Requirements:
- Generate 5-7 items per category
- Make all suggestions current and based on the research provided
- Be specific and actionable - not generic advice
- Focus on OnlyFans platform specifically
- Use insights from the analytics data if provided
- Update suggestions based on latest trends and research
`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.8,
      },
    });

    const raw = result.response.text().trim();
    let guides: any;
    try {
      guides = parseJSON(raw);
    } catch (err) {
      console.error("Failed to parse JSON from model:", raw);
      res.status(500).json({
        success: false,
        error: "Model returned invalid JSON",
        raw: raw.substring(0, 500),
      });
      return;
    }

    // Validate structure
    if (!guides.contentStrategyTips || !Array.isArray(guides.contentStrategyTips)) {
      res.status(500).json({
        success: false,
        error: "Invalid guides structure: missing contentStrategyTips array",
      });
      return;
    }

    res.status(200).json({
      success: true,
      guides,
      generatedAt: new Date().toISOString(),
    });
    return;
  } catch (err: any) {
    console.error("getOnlyFansGuides error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to generate guides",
      details: err?.message ?? String(err),
    });
    return;
  }
}

export default withErrorHandling(handler);

