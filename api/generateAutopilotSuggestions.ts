import type { VercelRequest, VercelResponse } from "@vercel/node";
// Dynamic imports to prevent module initialization errors
let getModel: any;
let parseJSON: any;
let verifyAuth: any;

async function getGeminiShared() {
  if (!getModel || !parseJSON) {
    const module = await import("./_geminiShared.ts");
    getModel = module.getModel;
    parseJSON = module.parseJSON;
  }
  return { getModel, parseJSON };
}

async function getVerifyAuth() {
  if (!verifyAuth) {
    const module = await import("./verifyAuth.ts");
    verifyAuth = module.verifyAuth;
  }
  return verifyAuth;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Check for required environment variables early
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    console.error("Missing GEMINI_API_KEY or GOOGLE_API_KEY environment variable");
    return res.status(200).json({
      success: false,
      error: "AI not configured",
      note: "GEMINI_API_KEY or GOOGLE_API_KEY is missing. Configure it in your environment to enable autopilot suggestions.",
    });
  }

  let user;
  try {
    const verifyAuthFn = await getVerifyAuth();
    user = await verifyAuthFn(req);
  } catch (authError: any) {
    console.error("verifyAuth error:", authError);
    return res.status(200).json({
      success: false,
      error: "Authentication error",
      note: authError?.message || "Failed to verify authentication. Please try logging in again.",
    });
  }

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { niche, audience, userType } = req.body || {};

  if (!niche || !audience) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const { getModel: getModelFn, parseJSON: parseJSONFn } = await getGeminiShared();
    const model = getModelFn("gemini-2.0-flash");

    const prompt = `
You are an autopilot social media strategist.

Generate 3 creative campaign ideas for:
- User type: ${userType || "creator/business"}
- Niche: ${niche}
- Audience: ${audience}

Return ONLY JSON: ["Idea 1", "Idea 2", "Idea 3"]
`;

    const response = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    const raw = response.response.text().trim();
    let ideas: string[];

    try {
      const { parseJSON: parseJSONFn } = await getGeminiShared();
      ideas = parseJSONFn(raw);
      if (!Array.isArray(ideas)) throw new Error("AI returned non-array");
    } catch {
      ideas = ["Campaign Idea 1", "Campaign Idea 2", "Campaign Idea 3"];
    }

    return res.status(200).json({ ideas });
  } catch (error: any) {
    console.error("generateAutopilotSuggestions error:", error);
    console.error("Error stack:", error?.stack);
    console.error("Error details:", JSON.stringify(error, null, 2));
    return res.status(200).json({
      success: false,
      error: "Failed to generate suggestions",
      note: error?.message || "An unexpected error occurred. Please try again.",
      details: process.env.NODE_ENV === 'development' ? {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
      } : undefined,
    });
  }
}
