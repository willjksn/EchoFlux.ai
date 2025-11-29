import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getModel, parseJSON } from "./_geminiShared.ts";
import { verifyAuth } from "./verifyAuth.ts";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Check for required environment variables early
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    console.error("Missing GEMINI_API_KEY or GOOGLE_API_KEY environment variable");
    return res.status(500).json({
      error: "Server configuration error",
      details: "GEMINI_API_KEY environment variable is missing"
    });
  }

  let user;
  try {
    user = await verifyAuth(req);
  } catch (authError: any) {
    console.error("verifyAuth error:", authError);
    return res.status(401).json({
      error: "Authentication failed",
      details: authError?.message || "Failed to verify authentication token"
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
    const model = getModel("gemini-2.0-flash");

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
      ideas = parseJSON(raw);
      if (!Array.isArray(ideas)) throw new Error("AI returned non-array");
    } catch {
      ideas = ["Campaign Idea 1", "Campaign Idea 2", "Campaign Idea 3"];
    }

    return res.status(200).json({ ideas });
  } catch (error: any) {
    console.error("generateAutopilotSuggestions error:", error);
    console.error("Error stack:", error?.stack);
    console.error("Error details:", JSON.stringify(error, null, 2));
    return res.status(500).json({
      error: "Failed to generate suggestions",
      details: error?.message ?? String(error),
      stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    });
  }
}
