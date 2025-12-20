import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, withErrorHandling } from "./_errorHandler.js";
import { getModelForTask } from "./_modelRouter.js";
import { parseJSON } from "./_geminiShared.js";

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

  const { goals, contentPreferences, subscriberCount, balance, niche } = req.body || {};

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

    const prompt = `
You are an expert monetization strategist for OnlyFans creators.

CRITICAL CONTEXT - EXPLICIT/ADULT CONTENT PLATFORM:
- This monetization plan is for an adult content creator platform (OnlyFans)
- Content must be explicit, adult-oriented, and describe actual explicit/intimate content
- Focus on strategic monetization: balancing free engagement content with paid premium content
- Help creators understand when to post free vs paid content, when to tease vs upsell
- Prevent over-selling by balancing content types intelligently

Creator Goals: ${goals.join(', ')}
Content Preferences: ${contentPreferences || 'No specific preferences'}
${subscriberContext}
Niche: ${userNiche}

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

IMPORTANT:
- Make ideas SPECIFIC and explicit (describe actual content, not generic "subscribe" messages)
- Engagement ideas should be FREE and build connection
- Upsell ideas should TEASE premium content without being pushy
- Retention ideas should reward existing subscribers
- Conversion ideas should have clear CTAs but not be annoying
- Distribute ideas across the week intelligently
- Include warnings if balance might be problematic
- Make descriptions detailed and actionable
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
      return res.status(500).json({
        success: false,
        error: "Model returned invalid JSON",
        raw: raw.substring(0, 500),
      });
    }

    // Validate structure
    if (!plan.ideas || !Array.isArray(plan.ideas)) {
      return res.status(500).json({
        success: false,
        error: "Invalid plan structure: missing ideas array",
      });
    }

    return res.status(200).json({
      success: true,
      plan,
    });
  } catch (err: any) {
    console.error("generateMonetizationPlan error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to generate monetization plan",
      details: err?.message ?? String(err),
    });
  }
}

export default withErrorHandling(handler);
