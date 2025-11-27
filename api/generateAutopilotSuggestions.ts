import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getModel, parseJSON } from "./_geminiShared.ts";
import { verifyAuth } from "./verifyAuth.ts";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await verifyAuth(req);
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
    return res.status(500).json({
      error: "Failed to generate suggestions",
      details: error?.message ?? String(error)
    });
  }
}
