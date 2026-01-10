import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, getModelRouter, withErrorHandling } from "./_errorHandler.js";
import { getAdminDb } from "./_firebaseAdmin.js";

interface UsageStats {
  totalUsers: number;
  featureUsage: {
    captionGenerations: { total: number; average: number; users: number };
    imageGenerations: { total: number; average: number; users: number };
    videoGenerations: { total: number; average: number; users: number };
    strategyGenerations: { total: number; average: number; users: number };
    autopilotCampaigns: { total: number; average: number; users: number };
    calendarEvents: { total: number; average: number; users: number };
    postsCreated: { total: number; average: number; users: number };
    mediaLibraryItems: { total: number; average: number; users: number };
  };
  planDistribution: Record<string, number>;
  mostUsedFeatures: Array<{ feature: string; usage: number; percentage: number }>;
  leastUsedFeatures: Array<{ feature: string; usage: number; percentage: number }>;
  modelUsage?: {
    totalRequests: number;
    requestsByTask: Record<string, number>;
    topTasks: Array<{ task: string; count: number }>;
  };
}

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Check API keys early
  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    res.status(503).json({
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
    res.status(401).json({
      success: false,
      error: "Authentication error",
      note: authError?.message || "Failed to verify authentication.",
    });
    return;
  }

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Check if user is admin
  const db = getAdminDb();
  const userDoc = await db.collection("users").doc(user.uid).get();
  const userData = userDoc.exists ? (userDoc.data() as any) : null;
  
  if (userData?.role !== "Admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const { formPurpose, targetAudience, specificPlan } = (req.body || {}) as {
    formPurpose?: string;
    targetAudience?: string;
    specificPlan?: string;
  };

  try {
    // Collect usage statistics
    const usersSnap = await db.collection("users").limit(1000).get();
    const users = usersSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));

    // Filter by target audience if specified
    let filteredUsers = users;
    if (targetAudience === "invite_grant") {
      filteredUsers = users.filter(u => u.subscriptionStatus === "invite_grant");
    } else if (targetAudience === "specific_plan" && specificPlan) {
      filteredUsers = users.filter(u => u.plan === specificPlan);
    }

    if (filteredUsers.length === 0) {
      res.status(400).json({ error: "No users found matching the target audience" });
      return;
    }

    // Collect additional usage data from subcollections
    let strategyCount = 0;
    let autopilotCount = 0;
    let calendarCount = 0;
    let postsCount = 0;
    const usersWithStrategies = new Set<string>();
    const usersWithAutopilot = new Set<string>();
    const usersWithCalendar = new Set<string>();
    const usersWithPosts = new Set<string>();

    // Sample a subset of users to check subcollections (for performance)
    const sampleSize = Math.min(100, filteredUsers.length);
    const sampleUsers = filteredUsers.slice(0, sampleSize);

    for (const user of sampleUsers) {
      try {
        // Check strategies
        const strategiesSnap = await db.collection("users").doc(user.id).collection("strategies").limit(1).get();
        if (!strategiesSnap.empty) {
          usersWithStrategies.add(user.id);
          const allStrategies = await db.collection("users").doc(user.id).collection("strategies").get();
          strategyCount += allStrategies.size;
        }

        // Check autopilot campaigns
        const autopilotSnap = await db.collection("users").doc(user.id).collection("autopilot_campaigns").limit(1).get();
        if (!autopilotSnap.empty) {
          usersWithAutopilot.add(user.id);
          const allAutopilot = await db.collection("users").doc(user.id).collection("autopilot_campaigns").get();
          autopilotCount += allAutopilot.size;
        }

        // Check calendar events
        const calendarSnap = await db.collection("users").doc(user.id).collection("calendar_events").limit(1).get();
        if (!calendarSnap.empty) {
          usersWithCalendar.add(user.id);
          const allCalendar = await db.collection("users").doc(user.id).collection("calendar_events").get();
          calendarCount += allCalendar.size;
        }

        // Check posts
        const postsSnap = await db.collection("users").doc(user.id).collection("posts").limit(1).get();
        if (!postsSnap.empty) {
          usersWithPosts.add(user.id);
          const allPosts = await db.collection("users").doc(user.id).collection("posts").get();
          postsCount += allPosts.size;
        }
      } catch (e) {
        // Skip if subcollection doesn't exist or access denied
        console.warn(`Failed to check subcollections for user ${user.id}:`, e);
      }
    }

    // Scale up counts based on sample ratio
    const sampleRatio = filteredUsers.length / sampleSize;
    strategyCount = Math.round(strategyCount * sampleRatio);
    autopilotCount = Math.round(autopilotCount * sampleRatio);
    calendarCount = Math.round(calendarCount * sampleRatio);
    postsCount = Math.round(postsCount * sampleRatio);

    // Calculate feature usage
    const featureUsage = {
      captionGenerations: {
        total: filteredUsers.reduce((sum, u) => sum + (u.monthlyCaptionGenerationsUsed || 0), 0),
        users: filteredUsers.filter(u => (u.monthlyCaptionGenerationsUsed || 0) > 0).length,
        average: 0,
      },
      imageGenerations: {
        total: filteredUsers.reduce((sum, u) => sum + (u.monthlyImageGenerationsUsed || 0), 0),
        users: filteredUsers.filter(u => (u.monthlyImageGenerationsUsed || 0) > 0).length,
        average: 0,
      },
      videoGenerations: {
        total: filteredUsers.reduce((sum, u) => sum + (u.monthlyVideoGenerationsUsed || 0), 0),
        users: filteredUsers.filter(u => (u.monthlyVideoGenerationsUsed || 0) > 0).length,
        average: 0,
      },
      strategyGenerations: {
        total: strategyCount,
        users: Math.round(usersWithStrategies.size * sampleRatio),
        average: 0,
      },
      autopilotCampaigns: {
        total: autopilotCount,
        users: Math.round(usersWithAutopilot.size * sampleRatio),
        average: 0,
      },
      calendarEvents: {
        total: calendarCount,
        users: Math.round(usersWithCalendar.size * sampleRatio),
        average: 0,
      },
      postsCreated: {
        total: postsCount,
        users: Math.round(usersWithPosts.size * sampleRatio),
        average: 0,
      },
      mediaLibraryItems: {
        total: filteredUsers.reduce((sum, u) => sum + ((u.mediaLibrary?.length || 0)), 0),
        users: filteredUsers.filter(u => (u.mediaLibrary?.length || 0) > 0).length,
        average: 0,
      },
    };

    // Calculate averages
    Object.keys(featureUsage).forEach(key => {
      const feature = featureUsage[key as keyof typeof featureUsage];
      feature.average = feature.users > 0 ? feature.total / feature.users : 0;
    });

    // Get plan distribution
    const planDistribution: Record<string, number> = {};
    filteredUsers.forEach(u => {
      planDistribution[u.plan || "Free"] = (planDistribution[u.plan || "Free"] || 0) + 1;
    });

    // Calculate usage percentages
    const totalUsage = Object.values(featureUsage).reduce((sum, f) => sum + f.total, 0);
    const mostUsedFeatures = Object.entries(featureUsage)
      .map(([feature, stats]) => ({
        feature: feature.replace(/([A-Z])/g, ' $1').trim(),
        usage: stats.total,
        percentage: totalUsage > 0 ? (stats.total / totalUsage) * 100 : 0,
      }))
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 5);

    const leastUsedFeatures = Object.entries(featureUsage)
      .map(([feature, stats]) => ({
        feature: feature.replace(/([A-Z])/g, ' $1').trim(),
        usage: stats.total,
        percentage: totalUsage > 0 ? (stats.total / totalUsage) * 100 : 0,
      }))
      .sort((a, b) => a.usage - b.usage)
      .filter(f => f.usage === 0)
      .slice(0, 5);

    // Try to get model usage stats if available
    let modelUsage: UsageStats["modelUsage"] | undefined;
    try {
      // This would require the getModelUsageAnalytics endpoint
      // For now, we'll skip it or make it optional
    } catch (e) {
      // Model usage not available, continue without it
    }

    const usageStats: UsageStats = {
      totalUsers: filteredUsers.length,
      featureUsage,
      planDistribution,
      mostUsedFeatures,
      leastUsedFeatures,
      modelUsage,
    };

    // Use model router - question generation uses thinking model for better insights
    const getModelForTask = await getModelRouter();
    const model = await getModelForTask('analytics', user.uid);

    const prompt = `You are an expert product researcher and feedback form designer.

Based on the following user usage statistics from EchoFlux.ai (an AI-powered social media content creation platform), generate intelligent feedback questions that will help understand:
1. Why certain features are used most/least
2. What users find valuable or frustrating
3. What improvements or new features they want
4. Their overall experience and satisfaction

Usage Statistics:
${JSON.stringify(usageStats, null, 2)}

${formPurpose ? `Form Purpose: ${formPurpose}\n` : ''}
Target Audience: ${targetAudience || 'all users'}
${specificPlan ? `Specific Plan: ${specificPlan}\n` : ''}

Generate 5-8 feedback questions that are:
- Specific to the usage patterns shown
- Mix of open-ended and multiple-choice questions
- Focused on understanding WHY features are used/not used
- Actionable for product improvement
- Easy for users to answer

Return ONLY a JSON array with this exact structure:
[
  {
    "type": "open-ended" | "multiple-choice",
    "text": "Question text here",
    "options": ["Option 1", "Option 2", "Option 3"] (only for multiple-choice),
    "required": true | false,
    "reasoning": "Brief explanation of why this question is relevant based on usage data"
  }
]

Focus on:
- Questions about the most used features (why they're valuable, what could be better)
- Questions about the least used features (why they're not used, what's missing)
- Questions about overall satisfaction and experience
- Questions about desired improvements or new features

Return ONLY the JSON array, no other text.`;

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    });

    const responseText = result.response.text();
    
    // Parse JSON from response
    let questions: Array<{
      type: "open-ended" | "multiple-choice";
      text: string;
      options?: string[];
      required: boolean;
      reasoning?: string;
    }>;
    
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      const jsonText = jsonMatch ? jsonMatch[0] : responseText;
      questions = JSON.parse(jsonText);
    } catch (parseError) {
      console.error("Failed to parse questions response:", responseText);
      throw new Error("Failed to parse AI response. Please try again.");
    }

    // Validate and clean questions
    const validQuestions = questions
      .filter(q => q.text && q.text.trim())
      .map((q, idx) => ({
        id: `ai-generated-${Date.now()}-${idx}`,
        type: q.type === "multiple-choice" ? "multiple-choice" : "open-ended",
        text: q.text.trim(),
        options: q.type === "multiple-choice" && q.options && q.options.length >= 2
          ? q.options.filter(opt => opt && opt.trim()).map(opt => opt.trim())
          : undefined,
        required: q.required !== undefined ? q.required : false,
        reasoning: q.reasoning,
      }))
      .filter(q => {
        // Ensure multiple-choice has at least 2 options
        if (q.type === "multiple-choice" && (!q.options || q.options.length < 2)) {
          return false;
        }
        return true;
      });

    if (validQuestions.length === 0) {
      throw new Error("No valid questions were generated. Please try again.");
    }

    res.status(200).json({
      success: true,
      questions: validQuestions,
      usageStats: {
        totalUsers: usageStats.totalUsers,
        mostUsedFeatures: usageStats.mostUsedFeatures.slice(0, 3),
        leastUsedFeatures: usageStats.leastUsedFeatures.slice(0, 3),
      },
    });
    return;
  } catch (e: any) {
    console.error("generateFeedbackQuestions error:", e);
    res.status(500).json({
      success: false,
      error: "Failed to generate feedback questions",
      note: e?.message || "An error occurred while generating questions",
    });
    return;
  }
}

export default withErrorHandling(handler);

