import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, withErrorHandling } from "./_errorHandler.js";
import { getModelForTask } from "./_modelRouter.js";
import { parseJSON } from "./_geminiShared.js";
import { getGoalFramework, getGoalSpecificCTAs, getGoalSpecificContentGuidance } from "./_goalFrameworks.js";
import { getOnlyFansWeeklyTrends } from "./_trendsHelper.js";
import { getOnlyFansResearchContext } from "./_onlyfansResearch.js";
import {
  buildCreatorPersonalityBlock,
  buildMemberHubCreatorContext,
  buildMemberHubNicheLine,
  creatorHintRequestsSpicyContent,
  getMemberHubToneGuidanceFromSettings,
  getMemberHubTrendsContext,
  MEMBER_HUB_RETENTION_SYSTEM,
} from "./_memberHubContentContext.js";
import { getNaturalVoicePromptBlock } from "./_naturalVoicePrompt.js";

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

  const {
    goals,
    contentPreferences,
    subscriberCount,
    balance,
    niche,
    analyticsData,
    contentMode,
    creatorPersonality: bodyPersonality,
    prioritizeCreatorPersonality = false,
  } = req.body || {};
  const isMemberHub = contentMode === "member_hub";

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

    const userNiche = niche || user.niche || (isMemberHub ? "Creator" : "Adult Content Creator");
    const subscriberContext = subscriberCount 
      ? `Current subscriber count: ${subscriberCount}. ` 
      : "";

    const { getAdminDb } = await import("./_firebaseAdmin.js");
    const db = getAdminDb();
    let userData: Record<string, unknown> = {};
    let explicitnessLevel = 6;
    try {
      const userDoc = await db.collection("users").doc(user.uid).get();
      if (userDoc.exists) {
        userData = (userDoc.data() || {}) as Record<string, unknown>;
        explicitnessLevel =
          typeof userData.explicitnessLevel === "number" ? userData.explicitnessLevel : 6;
      }
    } catch (error) {
      console.error("[generateMonetizationPlan] Error loading user profile:", error);
    }

    const settingsBlock = (userData.settings || {}) as {
      creatorPersonality?: string;
      tone?: {
        spiciness?: number;
        formality?: number;
        humor?: number;
        empathy?: number;
        profanity?: number;
        emojiLevel?: number;
      };
    };
    const personalityText =
      (typeof bodyPersonality === "string" ? bodyPersonality : "") ||
      (typeof userData.creatorPersonality === "string" ? userData.creatorPersonality : "") ||
      (typeof settingsBlock.creatorPersonality === "string" ? settingsBlock.creatorPersonality : "");
    const aiPersonality =
      typeof userData.aiPersonality === "string" ? userData.aiPersonality : "";
    const aiTone = typeof userData.aiTone === "string" ? userData.aiTone : "";
    const toneSettings = settingsBlock.tone || {};
    const spiciness =
      typeof toneSettings.spiciness === "number" ? toneSettings.spiciness : 0;
    const prioritizePersonality = Boolean(prioritizeCreatorPersonality);
    const memberHubCreatorContext = isMemberHub
      ? buildMemberHubCreatorContext({
          creatorPersonality: personalityText,
          aiPersonality,
          aiTone,
          niche: userNiche,
          toneSettings,
          prioritizeCreatorPersonality: prioritizePersonality,
        })
      : "";
    const personalityBlock = isMemberHub
      ? memberHubCreatorContext
      : buildCreatorPersonalityBlock(personalityText, prioritizePersonality);
    const preferencesText = String(contentPreferences || "");
    const hintSpicy = creatorHintRequestsSpicyContent(preferencesText);

    let trendsContext = "";
    let onlyfansResearch = "";

    if (isMemberHub) {
      try {
        trendsContext = await getMemberHubTrendsContext();
      } catch (error) {
        console.error("[generateMonetizationPlan] Error fetching member hub trends:", error);
        trendsContext = "Trend data unavailable. Use member-retention and social best practices.";
      }
    } else {
      try {
        trendsContext = await getOnlyFansWeeklyTrends();
      } catch (error) {
        console.error("[generateMonetizationPlan] Error fetching OnlyFans weekly trends:", error);
        trendsContext = "OnlyFans trend data unavailable. Using general OnlyFans best practices.";
      }

      try {
        const userPlan = (userData.plan as string | undefined) || "Free";
        const userRole = userData.role as string | undefined;

        onlyfansResearch = await getOnlyFansResearchContext(
          "Subscribers",
          "Sales Conversion",
          user.uid,
          userPlan,
          userRole,
        );
      } catch (error) {
        console.error("[generateMonetizationPlan] Error fetching OnlyFans research:", error);
      }
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

    const explicitnessContext = isMemberHub
      ? getMemberHubToneGuidanceFromSettings(explicitnessLevel, spiciness)
      : explicitnessLevel >= 9
        ? "EXTREMELY EXPLICIT - Use very explicit, graphic language describing sexual acts, intimate moments, and explicit content in detail. Focus on lust, desire, and explicit sexual experiences."
        : explicitnessLevel >= 7
          ? "HIGHLY EXPLICIT - Use explicit language describing sexual content, intimate moments, girlfriend experience, and explicit scenes. Focus on sexual desire, lust, and explicit experiences."
          : explicitnessLevel >= 5
            ? "MODERATELY EXPLICIT - Use suggestive and explicit language describing intimate content, sexual themes, girlfriend experience, and adult content. Focus on desire and intimate experiences."
            : "SUGGESTIVE - Use suggestive language with adult themes, intimate moments, and romantic/sexual undertones. Focus on connection and intimate experiences.";

    const memberHubCore = isMemberHub
      ? `
${MEMBER_HUB_RETENTION_SYSTEM}

${buildMemberHubNicheLine(userNiche)}
${explicitnessContext}

WEEKLY TREND CONTEXT (Mon/Thu — Instagram, TikTok, X, and creator platforms):
${trendsContext}

PRIMARY GOAL: Member retention and sustainable monetization on a paid fan feed (My Page).
- Keep subscribers engaged, replying, and feeling they get exclusive value — reduce churn.
- Balance free connection content, teasers, drops, and PPV — avoid constant hard-sell spam.
- Sensual/flirty drops only when Content Preferences or personality explicitly call for them${hintSpicy ? " (creator preferences request sensual/spicy angles — OK within tone ceiling)" : " — otherwise default to lifestyle, connection, and niche-appropriate themes (not lingerie/OnlyFans by default)"}.
- Borrow hooks and formats from Instagram, TikTok, and X where they fit a private feed (photo, video, text, poll).

Content focus areas (mix across the week):
- Personal connection and BTS exclusives
- Polls, questions, and community moments
- Member-only updates and loyalty rewards
- Soft teasers leading to drops/PPV
- Variety so the feed does not feel one-note
`
      : `
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
`;

    const memberHubVoicePriority =
      isMemberHub && prioritizePersonality && personalityText.trim()
        ? `
VOICE PRIORITY (PERSONALITY OVERRIDE ON):
1. CREATOR PERSONALITY (override) in the block above — PRIMARY for voice and boundaries.
2. AI PERSONALITY & TRAINING + CONTENT PREFERENCES (tone sliders) in the same block — SECONDARY; refine ideas after the override.
3. Trends and creator preferences — topics and monetization angles; do not override voice.
- When override and sliders conflict, the override wins.
`
        : isMemberHub
          ? `
VOICE PRIORITY (PERSONALITY OVERRIDE OFF):
- Use AI personality/training, tone sliders, niche, and content preferences for voice.
`
          : "";

    const prompt = `
${getNaturalVoicePromptBlock("monetization")}

${personalityBlock ? `${personalityBlock}\n\n` : ""}${memberHubVoicePriority}You are an expert monetization strategist for ${
      isMemberHub ? "paid member hubs (My Page) and creator fan feeds" : "OnlyFans creators specializing in adult/explicit content monetization"
    }.

${isMemberHub ? memberHubCore : `${trendsContext}\n\n${onlyfansResearch ? `ONLYFANS-SPECIFIC RESEARCH & BEST PRACTICES:\n${onlyfansResearch}\n` : ""}`}

${analyticsContext ? analyticsContext : isMemberHub ? "Note: No analytics data available. Use member-retention best practices." : "Note: No analytics data available. Use best practices for OnlyFans monetization."}

Creator Goals: ${goals.join(", ")}
Content Preferences: ${contentPreferences || "No specific preferences"}
${subscriberContext}
${isMemberHub ? "" : `Niche: ${userNiche}`}

${isMemberHub ? "" : `GOAL-SPECIFIC GUIDANCE FOR SALES CONVERSION:\n${getGoalSpecificCTAs("Sales Conversion")}\n\n${getGoalSpecificContentGuidance("Sales Conversion")}`}

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
${
  isMemberHub
    ? `- Ideas must support member retention first, then monetization (drops/PPV)
- Mix connection, exclusives, polls, BTS, and monetized content — do NOT default to lingerie/OnlyFans themes
- Follow CREATOR PERSONALITY, AI personality, and Content Preferences tone sliders when provided
- Respect tone ceiling — never graphic explicit content; sensual angles only when preferences/personality/hint request them
- Engagement ideas: free posts that build habit and replies
- Upsell ideas: tease upcoming drops/PPV without spamming
- Retention ideas: rewards, exclusives, and "you matter" moments for loyal members
- Conversion ideas: clear but soft CTAs for paid unlocks
- Distribute ideas across the week intelligently
- ${explicitnessContext}`
    : `- ALL ideas MUST be about adult/explicit sexual content - NO generic business/tech/product ideas
- Make ideas SPECIFIC and explicit - describe actual sexual content, intimate moments, girlfriend experience, lust, desire
- Engagement ideas should be FREE sexual content that builds intimate connection
- Upsell ideas should TEASE explicit premium sexual content, girlfriend experience, intimate moments
- Retention ideas should reward subscribers with exclusive sexual content, intimate experiences
- Conversion ideas should offer specific sexual content, girlfriend experience, explicit scenes with clear CTAs
- Focus on sexual experiences, lust, desire, intimate moments, girlfriend experience - NOT generic monetization
- Distribute ideas across the week intelligently
- Include warnings if balance might be problematic
- Make descriptions detailed and actionable with explicit sexual content details
- Respect explicitness level ${explicitnessLevel}/10: ${explicitnessContext}`
}
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
