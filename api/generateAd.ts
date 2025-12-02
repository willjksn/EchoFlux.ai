// api/generateAd.ts
// Generate AI-powered ad copy and video ad prompts for creators and businesses

import type { VercelRequest, VercelResponse } from "@vercel/node";


// Dynamic imports to prevent module initialization errors
let verifyAuth: any;
let getAdminDb: any;

// Lazy load modules to prevent initialization errors
async function getVerifyAuth() {
  if (!verifyAuth) {
    try {
      const module = await import("./verifyAuth.ts");
      verifyAuth = module.verifyAuth;
    } catch (importError: any) {
      console.error("Failed to import verifyAuth:", importError);
      throw new Error(`Failed to load authentication module: ${importError?.message || String(importError)}`);
    }
  }
  return verifyAuth;
}

async function getAdminDbFunction() {
  if (!getAdminDb) {
    try {
      const module = await import("./_firebaseAdmin.ts");
      getAdminDb = module.getAdminDb;
    } catch (importError: any) {
      console.error("Failed to import _firebaseAdmin:", importError);
      throw new Error(`Failed to load Firebase Admin module: ${importError?.message || String(importError)}`);
    }
  }
  return getAdminDb;
}

interface AdGenerationRequest {
  adType: "text" | "video";
  product?: string;
  service?: string;
  targetAudience?: string;
  goal?: string; // "awareness" | "conversion" | "engagement" | "sales" | "followers"
  platform?: string; // "Instagram" | "TikTok" | "YouTube" | "Facebook" | "X" | "LinkedIn"
  tone?: string;
  callToAction?: string;
  budget?: string;
  duration?: number; // For video ads, in seconds
  additionalContext?: string;
}

interface AdGenerationResult {
  adCopy?: string;
  videoPrompt?: string;
  headline?: string;
  description?: string;
  callToAction?: string;
  hashtags?: string[];
  platformRecommendations?: string[];
  estimatedReach?: string;
  tips?: string[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Ultra-defensive error handling - catch everything
  try {
    // Validate request and response objects
    if (!req || !res) {
      console.error("generateAd: Invalid request or response object");
      if (res && !res.headersSent) {
        return res.status(500).json({ error: "Invalid request" });
      }
      return;
    }
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // 🔑 Soft-fail if AI keys are not configured
    if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
      console.error("generateAd: Missing GEMINI_API_KEY or GOOGLE_API_KEY");
      return res.status(200).json({
        success: false,
        error: "AI not configured",
        note: "GEMINI_API_KEY or GOOGLE_API_KEY is missing. Configure it in your environment to enable ad generation.",
      });
    }

    // 🔐 Auth
    let user;
    try {
      let verifyAuthFn;
      try {
        verifyAuthFn = await getVerifyAuth();
      } catch (importError: any) {
        console.error("Failed to load verifyAuth module:", importError);
        return res.status(200).json({
          success: false,
          error: "Module loading error",
          note: "Failed to load authentication module. Please check server configuration.",
        });
      }
      
      try {
        user = await verifyAuthFn(req);
      } catch (authError: any) {
        console.error("verifyAuth error in generateAd:", authError);
        return res.status(200).json({
          success: false,
          error: "Authentication error",
          note:
            authError?.message ||
            "Failed to verify authentication. Please try logging in again.",
        });
      }
    } catch (unexpectedError: any) {
      console.error("Unexpected error in auth section:", unexpectedError);
      return res.status(200).json({
        success: false,
        error: "Authentication error",
        note: "An unexpected error occurred during authentication.",
      });
    }

    if (!user) {
      // Real 401 is OK here – frontend should treat as "please log in"
      return res.status(401).json({ error: "Unauthorized" });
    }

    const {
      adType,
      product,
      service,
      targetAudience,
      goal,
      platform,
      tone,
      callToAction,
      budget,
      duration,
      additionalContext,
    }: AdGenerationRequest = req.body || {};

    if (!adType || !["text", "video"].includes(adType)) {
      return res
        .status(400)
        .json({ error: "Invalid adType. Must be 'text' or 'video'" });
    }

    // 🔓 Check if user has access to ad generation (premium feature)
    let db;
    let userData;
    try {
      let getAdminDbFn;
      try {
        getAdminDbFn = await getAdminDbFunction();
      } catch (importError: any) {
        console.error("Failed to load Firebase Admin module:", importError);
        return res.status(200).json({
          success: false,
          error: "Database module error",
          note: "Failed to load database module. Please check server configuration.",
        });
      }
      
      try {
        db = getAdminDbFn();
        const userDoc = await db.collection("users").doc(user.uid).get();
        userData = userDoc.data();

        if (!userData) {
          return res.status(404).json({ error: "User not found" });
        }
      } catch (dbError: any) {
        console.error("Database access error:", dbError);
        return res.status(200).json({
          success: false,
          error: "Database error",
          note: "Unable to access user data. Please check your configuration.",
        });
      }
    } catch (unexpectedDbError: any) {
      console.error("Unexpected Firebase Admin error in generateAd:", unexpectedDbError);
      return res.status(200).json({
        success: false,
        error: "Database error",
        note: "Unable to access user data. Please check your configuration.",
      });
    }

    // Check plan - Ad generation is available on Pro, Elite, Growth, Starter, and Agency plans
    const allowedPlans = ["Pro", "Elite", "Growth", "Starter", "Agency"];
    const userPlan = userData.plan || "Free";

    if (!allowedPlans.includes(userPlan)) {
      // Real 403 is okay – UI can show "upgrade" message
      return res.status(403).json({
        error: "Ad generation is a premium feature",
        requiredPlan: "Pro",
        upgradeUrl: "/pricing",
      });
    }

    // 📈 Track usage
    const usageField =
      adType === "text"
        ? "monthlyAdGenerationsUsed"
        : "monthlyVideoAdGenerationsUsed";
    const currentUsage = userData[usageField] || 0;

    const planLimits: Record<string, { text: number; video: number }> = {
      Pro: { text: 50, video: 10 },
      Elite: { text: 200, video: 50 },
      Growth: { text: 100, video: 25 },
      Starter: { text: 30, video: 5 },
      Agency: { text: 500, video: 100 },
    };

    const limits = planLimits[userPlan] || { text: 0, video: 0 };
    const limit = adType === "text" ? limits.text : limits.video;

    if (currentUsage >= limit) {
      return res.status(403).json({
        error: `Monthly ${adType} ad generation limit reached`,
        currentUsage,
        limit,
        upgradeUrl: "/pricing",
      });
    }

    // 🧠 Use model router - ad generation uses balanced model for quality
    let model;
    try {
      const { getModelForTask } = await import("./_modelRouter.ts");
      model = await getModelForTask("strategy", user.uid);
    } catch (modelError: any) {
      console.error("Model initialization error:", modelError);
      console.error("Model error stack:", modelError?.stack);
      return res.status(200).json({
        success: false,
        error: "AI model error",
        note:
          modelError?.message ||
          "Unable to initialize AI model. Please check your GEMINI_API_KEY environment variable.",
        details:
          process.env.NODE_ENV === "development"
            ? modelError?.stack
            : undefined,
      });
    }

    // 🧾 Build prompt based on ad type
    let prompt: string;

    const normalizedTone =
      tone === "sexy-bold"
        ? "Sexy/Bold (provocative but tasteful)"
        : tone === "sexy-explicit"
        ? "Sexy/Explicit (adult-oriented, provocative)"
        : tone;

    const normalizedGoal =
      goal === "followers" ? "Increase Followers/Fans" : goal;

    if (adType === "text") {
      prompt = `You are an expert copywriter specializing in social media advertising.

Generate compelling ad copy for a ${platform || "social media"} ad campaign.

${product ? `Product: ${product}` : ""}
${service ? `Service: ${service}` : ""}
${targetAudience ? `Target Audience: ${targetAudience}` : ""}
${normalizedGoal ? `Campaign Goal: ${normalizedGoal}` : ""}
${normalizedTone ? `Tone: ${normalizedTone}` : ""}
${callToAction ? `Call to Action: ${callToAction}` : ""}
${budget ? `Budget: ${budget}` : ""}
${additionalContext ? `Additional Context: ${additionalContext}` : ""}

Return ONLY valid JSON in this format:
{
  "adCopy": "The main ad copy text (engaging, persuasive, platform-optimized)",
  "headline": "Attention-grabbing headline",
  "description": "Supporting description text",
  "callToAction": "Clear call-to-action text",
  "hashtags": ["#relevant", "#hashtags"],
  "platformRecommendations": ["Instagram", "Facebook"],
  "estimatedReach": "Small/Medium/Large audience",
  "tips": ["Tip 1", "Tip 2", "Tip 3"]
}

Make it compelling, on-brand, and optimized for ${platform || "social media"} platform.`;
    } else {
      // Video ad prompt
      const seconds = duration || 15;
      prompt = `You are an expert video ad strategist specializing in short-form social media video ads.

Generate a detailed video ad concept and prompt for a ${seconds}-second video ad.

${product ? `Product: ${product}` : ""}
${service ? `Service: ${service}` : ""}
${targetAudience ? `Target Audience: ${targetAudience}` : ""}
${normalizedGoal ? `Campaign Goal: ${normalizedGoal}` : ""}
${normalizedTone ? `Tone: ${normalizedTone}` : ""}
${callToAction ? `Call to Action: ${callToAction}` : ""}
${budget ? `Budget: ${budget}` : ""}
${additionalContext ? `Additional Context: ${additionalContext}` : ""}

Return ONLY valid JSON in this format:
{
  "videoPrompt": "Detailed video generation prompt describing scenes, visuals, style, pacing, and key moments",
  "headline": "Video title/headline",
  "description": "Video description for platform",
  "callToAction": "Clear call-to-action",
  "hashtags": ["#relevant", "#hashtags"],
  "platformRecommendations": ["TikTok", "Instagram Reels", "YouTube Shorts"],
  "estimatedReach": "Small/Medium/Large audience",
  "tips": ["Tip 1", "Tip 2", "Tip 3"],
  "sceneBreakdown": [
    {"time": "0-3s", "description": "Hook/opening scene"},
    {"time": "4-8s", "description": "Main content"},
    {"time": "9-12s", "description": "CTA/closing"}
  ]
}

Make it engaging, visually compelling, and optimized for ${seconds}-second short-form video on ${
        platform || "social media"
      } platforms.`;
    }

    // 🤖 Call Gemini
    let rawOutput: string;
    try {
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      });

      if (!result?.response || typeof result.response.text !== "function") {
        console.error("generateAd: Unexpected Gemini response shape", result);
        return res.status(200).json({
          success: false,
          error: "AI generation failed",
          note: "Received an invalid response from the AI model.",
        });
      }

      rawOutput = result.response.text();
    } catch (genError: any) {
      console.error("AI generation error:", genError);
      return res.status(200).json({
        success: false,
        error: "AI generation failed",
        note:
          genError?.message ||
          "Failed to generate ad. Please check your GEMINI_API_KEY and try again.",
      });
    }

    // 🧮 Parse JSON response
    let adResult: AdGenerationResult;
    try {
      adResult = JSON.parse(rawOutput);
    } catch (parseError) {
      // Fallback: try to extract JSON from markdown code blocks
      const jsonMatch =
        rawOutput.match(/```json\s*([\s\S]*?)\s*```/) ||
        rawOutput.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        adResult = JSON.parse(jsonMatch[1]);
      } else {
        // Last resort: return raw text as ad copy
        adResult = {
          adCopy: rawOutput.trim(),
          headline: "Generated Ad",
          description: "",
          callToAction: callToAction || "Learn More",
          hashtags: [],
          platformRecommendations: platform ? [platform] : [],
          estimatedReach: "Medium",
          tips: [],
        };
      }
    }

    // 🔢 Increment usage counter (non-blocking)
    try {
      await db
        .collection("users")
        .doc(user.uid)
        .set(
          {
            [usageField]: currentUsage + 1,
          },
          { merge: true }
        );
    } catch (updateError: any) {
      console.error("Failed to update usage counter:", updateError);
      // Don't fail the request if usage tracking fails
    }

    // 📊 Track model usage (non-blocking)
    try {
      const { trackModelUsage } = await import("./trackModelUsage.ts");
      await trackModelUsage({
        userId: user.uid,
        taskType: "strategy",
        modelName: "gemini-1.5-pro",
        costTier: "medium",
        success: true,
      });
    } catch (trackError) {
      console.error("Failed to track model usage:", trackError);
      // Don't fail the request if tracking fails
    }

    return res.status(200).json({
      success: true,
      adType,
      result: adResult,
      usage: {
        current: currentUsage + 1,
        limit,
      },
    });
  } catch (err: any) {
    console.error("generateAd error:", err);
    console.error("Error stack:", err?.stack);
    console.error("Error name:", err?.name);
    console.error("Error message:", err?.message);
    
    // Check if response was already sent
    if (res.headersSent) {
      console.error("generateAd: Response already sent, cannot send error response");
      return;
    }
    
    // Ultra-defensive: Try multiple ways to send error response
    try {
      res.status(200).json({
        success: false,
        error: "Failed to generate ad",
        note: err?.message || "An unexpected error occurred. Please try again.",
        details:
          process.env.NODE_ENV === "development"
            ? {
                message: err?.message,
                stack: err?.stack,
                name: err?.name,
              }
            : undefined,
      });
    } catch (jsonError: any) {
      console.error("generateAd: Failed to send JSON error response:", jsonError);
      // Try sending a simple text response
      try {
        if (!res.headersSent) {
          res.status(200).send(JSON.stringify({
            success: false,
            error: "Failed to generate ad",
            note: "An unexpected error occurred.",
          }));
        }
      } catch (sendError: any) {
        console.error("generateAd: Failed to send any error response:", sendError);
        // Last resort - try to end the response
        try {
          if (!res.headersSent) {
            res.status(200).end();
          }
        } catch {
          // Give up - response handling is broken
          console.error("generateAd: Completely failed to send error response");
        }
      }
    }
  }
}