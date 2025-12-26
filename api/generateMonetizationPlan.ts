import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, withErrorHandling } from "./_errorHandler.js";
import { getModelForTask } from "./_modelRouter.js";
import { parseJSON } from "./_geminiShared.js";
import { getGoalFramework, getGoalSpecificCTAs, getGoalSpecificContentGuidance } from "./_goalFrameworks.js";
import { getLatestTrends, getOnlyFansWeeklyTrends } from "./_trendsHelper.js";
import { getOnlyFansResearchContext } from "./_onlyfansResearch.js";

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

  const { goals, contentPreferences, subscriberCount, balance, niche, analyticsData } = req.body || {};

  if (!goals || !Array.isArray(goals) || goals.length === 0) {
    res.status(400).json({ error: "Missing or invalid 'goals' array" });
    return;
  }

  try {
    const model = await getModelForTask("strategy", user.uid);
    
    // Default balance if not provided (40% engagement, 30% upsell, 20% retention, 10% conversion)
    const defaultBalance = {
      engagement: 40,
      upsell: 30,
      retention: 20,
      conversion: 10,
    };
    const finalBalance = balance || defaultBalance;

    // Calculate number of ideas per category (total 10-15 ideas)
    const totalIdeas = 12;
    const engagementCount = Math.round((finalBalance.engagement / 100) * totalIdeas);
    const upsellCount = Math.round((finalBalance.upsell / 100) * totalIdeas);
    const retentionCount = Math.round((finalBalance.retention / 100) * totalIdeas);
    const conversionCount = totalIdeas - engagementCount - upsellCount - retentionCount; // Remaining

    const userNiche = niche || user.niche || "Adult Content Creator";
    const subscriberContext = subscriberCount 
      ? `Current subscriber count: ${subscriberCount}. ` 
      : "";

    // Get user explicitness level from Firestore
    let explicitnessLevel = 7; // Default to moderate-high
    try {
      const { getAdminDb } = await import("./_firebaseAdmin.js");
      const db = getAdminDb();
      const userDoc = await db.collection("users").doc(user.uid).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        explicitnessLevel = userData?.explicitnessLevel ?? 7;
      }
    } catch (error) {
      console.error('[generateMonetizationPlan] Error fetching explicitness level:', error);
    }

    // Get OnlyFans-specific weekly trends (not general trends)
    let onlyfansWeeklyTrends = '';
    try {
      onlyfansWeeklyTrends = await getOnlyFansWeeklyTrends();
    } catch (error) {
      console.error('[generateMonetizationPlan] Error fetching OnlyFans weekly trends:', error);
      onlyfansWeeklyTrends = 'OnlyFans trend data unavailable. Using general OnlyFans best practices.';
    }

    // Get OnlyFans-specific research (this is for OnlyFans monetization planning)
    let onlyfansResearch = '';
    try {
      const { getAdminDb } = await import("./_firebaseAdmin.js");
      const db = getAdminDb();
      const userDoc = await db.collection("users").doc(user.uid).get();
      const userData = userDoc.data();
      const userPlan = userData?.plan || 'Free';
      const userRole = userData?.role;
      
      onlyfansResearch = await getOnlyFansResearchContext(
        'Subscribers',
        'Sales Conversion', // Primary goal for monetization planning
        user.uid,
        userPlan,
        userRole
      );
      console.log('[generateMonetizationPlan] OnlyFans research context fetched');
    } catch (error) {
      console.error('[generateMonetizationPlan] Error fetching OnlyFans research:', error);
      // Continue without OnlyFans research - not critical
    }

    // Build analytics context for AI
    let analyticsContext = '';
    if (analyticsData) {
      const topTopics = analyticsData.topTopics?.slice(0, 5).join(', ') || 'No trending topics available';
      const engagementInsights = analyticsData.engagementInsights?.map((insight: any) => `- ${insight.title}: ${insight.description}`).join('\n') || 'No specific insights available';
      const bestDays = analyticsData.responseRate?.sort((a: any, b: any) => b.value - a.value).slice(0, 3).map((d: any) => d.name).join(', ') || 'No data';
      const engagementIncrease = analyticsData.engagementIncrease || 0;
      const subscriberCountFromAnalytics = analyticsData.subscriberCount || subscriberCount || 'Not provided';
      const engagementRate = analyticsData.engagementRate || 'Not provided';
      const topContentTypes = analyticsData.topContentTypes?.join(', ') || 'No data';
      const bestPostingTimes = analyticsData.bestPostingTimes?.join(', ') || 'No data';
      const customInsights = analyticsData.customInsights || '';
      
      analyticsContext = `
CREATOR ANALYTICS & INSIGHTS (What's Working for This Account):
- Subscriber Count: ${subscriberCountFromAnalytics}
- Engagement Rate: ${engagementRate}
- Top Performing Topics: ${topTopics}
- Top Content Types: ${topContentTypes}
- Engagement Insights:
${engagementInsights}
- Best Days for Posting: ${bestDays}
- Best Posting Times: ${bestPostingTimes}
- Engagement Increase: ${engagementIncrease}%
${customInsights ? `- Custom Insights: ${customInsights}` : ''}

Use this analytics data to inform the monetization plan:
1. Focus on content types that are already performing well (${topContentTypes})
2. Schedule content on days and times that historically perform best (${bestDays}, ${bestPostingTimes})
3. Create content similar to what's getting high engagement (${topTopics})
4. Scale what's working: Use insights from high-performing content
5. Balance monetization with engagement patterns that are proven to work
`;
    }

    // Build explicitness context based on user's explicitness level
    const explicitnessContext = explicitnessLevel >= 9 
      ? 'EXTREMELY EXPLICIT - Use very explicit, graphic language describing sexual acts, intimate moments, and explicit content in detail. Focus on lust, desire, and explicit sexual experiences.'
      : explicitnessLevel >= 7
      ? 'HIGHLY EXPLICIT - Use explicit language describing sexual content, intimate moments, girlfriend experience, and explicit scenes. Focus on sexual desire, lust, and explicit experiences.'
      : explicitnessLevel >= 5
      ? 'MODERATELY EXPLICIT - Use suggestive and explicit language describing intimate content, sexual themes, girlfriend experience, and adult content. Focus on desire and intimate experiences.'
      : 'SUGGESTIVE - Use suggestive language with adult themes, intimate moments, and romantic/sexual undertones. Focus on connection and intimate experiences.';

    const prompt = `
You are an expert monetization strategist for OnlyFans creators specializing in adult/explicit content monetization.

${onlyfansWeeklyTrends}

${onlyfansResearch ? `ONLYFANS-SPECIFIC RESEARCH & BEST PRACTICES:\n${onlyfansResearch}\n` : ''}

${analyticsContext ? analyticsContext : 'Note: No analytics data available. Use best practices for OnlyFans monetization.'}

CRITICAL CONTEXT - ONLYFANS ADULT/EXPLICIT CONTENT PLATFORM:
- This is EXCLUSIVELY for OnlyFans - an adult content creator platform focused on sexual content and intimate experiences
- ALL content ideas MUST be focused on adult/explicit sexual content, NOT generic business/tech/product content
- Content must describe actual explicit/intimate sexual content, girlfriend experience, lust, desire, and sexual experiences
- Focus on: sexual experiences, intimate moments, girlfriend experience, lust, desire, explicit scenes, adult content monetization
- DO NOT generate generic business strategies, tech product ideas, or non-sexual content
- PRIMARY GOAL: Sales Conversion through sexual content - Every idea should support revenue from adult/explicit content

EXPLICITNESS LEVEL: ${explicitnessLevel}/10
${explicitnessContext}

Content Focus Areas (ALL ideas must relate to these):
- Sexual experiences and intimate moments
- Girlfriend experience (GFE) content
- Lust, desire, and sexual attraction
- Explicit photosets and videos
- Intimate conversations and interactions
- Adult content themes and scenarios
- Sexual fantasy fulfillment
- Intimate connection building

Creator Goals: ${goals.join(', ')}
Content Preferences: ${contentPreferences || 'No specific preferences'}
${subscriberContext}
Niche: ${userNiche}

GOAL-SPECIFIC GUIDANCE FOR SALES CONVERSION:
${getGoalSpecificCTAs('Sales Conversion')}

${getGoalSpecificContentGuidance('Sales Conversion')}

Balance Requirements:
- Engagement: ${engagementCount} ideas (${finalBalance.engagement}%) - Free content to build connection
- Upsell: ${upsellCount} ideas (${finalBalance.upsell}%) - Tease premium content, create desire
- Retention: ${retentionCount} ideas (${finalBalance.retention}%) - Keep existing subscribers engaged
- Conversion: ${conversionCount} ideas (${finalBalance.conversion}%) - Direct sales/purchases

Generate a monetization plan with exactly ${totalIdeas} content ideas, distributed as specified above.

Return ONLY valid JSON in this exact structure:
{
  "summary": "Brief 2-3 sentence summary of the monetization strategy",
  "balance": {
    "engagement": ${engagementCount},
    "upsell": ${upsellCount},
    "retention": ${retentionCount},
    "conversion": ${conversionCount}
  },
  "ideas": [
    {
      "label": "engagement" | "upsell" | "retention" | "conversion",
      "idea": "Brief title/description of the content idea",
      "description": "Detailed description of what this content should include",
      "pricing": "free" | "paid" | "teaser",
      "suggestedTiming": "When to post this (e.g., 'Day 1', 'After 2 engagement posts', 'Weekend')",
      "cta": "Suggested call-to-action for this content",
      "priority": 1-5 (1 = highest priority)
    }
  ],
  "weeklyDistribution": [
    {
      "day": "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday",
      "ideas": ["idea title 1", "idea title 2"],
      "focus": "Primary focus for this day (e.g., 'Engagement building', 'Upsell push')"
    }
  ],
  "warnings": ["Any warnings about balance or pacing (if needed)"],
  "tips": ["2-3 actionable tips for maximizing monetization"]
}

CRITICAL REQUIREMENTS:
- ALL ideas MUST be about adult/explicit sexual content - NO generic business/tech/product ideas
- Make ideas SPECIFIC and explicit - describe actual sexual content, intimate moments, girlfriend experience, lust, desire
- Engagement ideas should be FREE sexual content that builds intimate connection
- Upsell ideas should TEASE explicit premium sexual content, girlfriend experience, intimate moments
- Retention ideas should reward subscribers with exclusive sexual content, intimate experiences
- Conversion ideas should offer specific sexual content, girlfriend experience, explicit scenes with clear CTAs
- Focus on sexual experiences, lust, desire, intimate moments, girlfriend experience - NOT generic monetization
- Distribute ideas across the week intelligently
- Include warnings if balance might be problematic
- Make descriptions detailed and actionable with explicit sexual content details
- Respect explicitness level ${explicitnessLevel}/10: ${explicitnessContext}
`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.8,
      },
    });

    const raw = result.response.text().trim();
    let plan: any;
    try {
      plan = parseJSON(raw);
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
    if (!plan.ideas || !Array.isArray(plan.ideas)) {
      res.status(500).json({
        success: false,
        error: "Invalid plan structure: missing ideas array",
      });
      return;
    }

    res.status(200).json({
      success: true,
      plan,
    });
    return;
  } catch (err: any) {
    console.error("generateMonetizationPlan error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to generate monetization plan",
      details: err?.message ?? String(err),
    });
    return;
  }
}

export default withErrorHandling(handler);
