import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, withErrorHandling } from "./_errorHandler.js";
import { getModelForTask, getModelNameForTask, getCostTierForTask } from "./_modelRouter.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { trackModelUsage } from "./trackModelUsage.js";
import { ComposeInsightLimitError, enforceAndRecordComposeInsightUsage } from "./_composeInsightsUsage.js";

/**
 * What To Post Next
 * Generates next-post ideas based on trends, best practices, and recent content.
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
    platform,
    niche,
    recentContent,
    tone,
    goal,
  } = (req.body as any) || {};

  if (!platform) {
    res.status(400).json({ error: "Missing required field: platform" });
    return;
  }

  try {
    const db = getAdminDb();

    await enforceAndRecordComposeInsightUsage({
      db,
      userId: user.uid,
      feature: "predict",
    });

    const postsRef = db.collection("users").doc(user.uid).collection("posts");
    const recentPosts = await postsRef
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const historicalData: any[] = [];
    recentPosts.forEach((doc) => {
      const data = doc.data();
      historicalData.push({
        content: data.content || "",
        platform: data.platforms?.[0] || "",
        mediaType: data.mediaType || "image",
        createdAt: data.createdAt || "",
      });
    });

    let trendContext = "";
    if (user.plan === "Elite" || user.role === "Admin" || user.plan === "OnlyFansStudio") {
      try {
        const trendRes = await fetch(
          `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}/api/getTrendingContext`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: req.headers.authorization || "",
            },
            body: JSON.stringify({ niche, platforms: [platform] }),
          }
        );
        if (trendRes.ok) {
          const trendData = await trendRes.json();
          trendContext = trendData.trendContext || "";
        }
      } catch (trendError) {
        console.warn("Failed to fetch trends, continuing without:", trendError);
      }
    }

    const model = await getModelForTask("strategy", user.uid);

    const prompt = `
You are a monetized creator strategist for ${platform}.

TASK: Recommend what to post next. Give practical ideas that are likely to perform well and sell. Use trends if available and avoid repeating the user's recent themes.

${trendContext ? `CURRENT TRENDS & BEST PRACTICES:\n${trendContext}\n` : ""}

CREATOR CONTEXT:
Platform: ${platform}
${niche ? `Niche: ${niche}` : ""}
${tone ? `Tone: ${tone}` : ""}
${goal ? `Goal: ${goal}` : ""}
${recentContent ? `Most Recent Content (avoid repeating): ${recentContent}` : ""}

RECENT POST HISTORY (avoid repeating):
${historicalData.length > 0
  ? historicalData.slice(0, 20).map((p, i) =>
      `${i + 1}. ${p.content?.substring(0, 80)}... | Platform: ${p.platform} | Type: ${p.mediaType}`
    ).join('\n')
  : "No recent post history available"}

OUTPUT FORMAT (JSON only):
{
  "summary": "One short sentence overview of what to focus on next.",
  "bestBet": "One clear next action (creator language).",
  "weeklyMix": [
    { "type": "Teaser" | "Promo" | "PPV Drop" | "Session" | "Bundle" | "Win-back" | "Engagement", "count": 1-4 }
  ],
  "ideas": [
    {
      "title": "Short idea title",
      "format": "Teaser" | "Promo" | "PPV Drop" | "Session" | "Bundle" | "Win-back" | "Engagement",
      "description": "What to post and why it fits now.",
      "hook": "Hook line",
      "caption": "Optional ready-to-post caption",
      "dmLine": "Optional DM line to support the post",
      "ppvAngle": "Optional PPV angle or upsell line",
      "why": "Why this should work on ${platform}",
      "tags": ["trend" | "evergreen" | "seasonal" | "conversion" | "engagement"]
    }
  ]
}

GUIDELINES:
- Keep it short, clear, and creator-friendly.
- Focus on revenue and consistency.
- Use creator terms: teaser, promo, PPV, bundle, session, VIP, win-back.
- Provide 6-10 diverse ideas with different formats.
- If trend context is missing, lean on best bets and evergreen concepts.
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
      const match =
        raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/```\s*([\s\S]*?)```/);
      if (match) {
        data = JSON.parse(match[1].trim());
      } else {
        throw new Error("Failed to parse AI response as JSON");
      }
    }

    await trackModelUsage({
      userId: user.uid,
      taskType: "strategy",
      modelName: getModelNameForTask("strategy"),
      costTier: getCostTierForTask("strategy"),
      inputTokens: Math.round(prompt.length / 4),
      outputTokens: Math.round(raw.length / 4),
      estimatedCost: 0,
      success: true,
    });

    res.status(200).json({
      success: true,
      platform,
      summary: data.summary || "",
      bestBet: data.bestBet || "",
      weeklyMix: Array.isArray(data.weeklyMix) ? data.weeklyMix : [],
      ideas: Array.isArray(data.ideas) ? data.ideas : [],
      trendContextUsed: Boolean(trendContext),
    });
  } catch (error: any) {
    console.error("Error generating what to post next:", error);
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
      error: error?.message || "Failed to generate what to post next",
      note: "Please try again or contact support if the issue persists.",
    });
  }
}

export default withErrorHandling(handler);
