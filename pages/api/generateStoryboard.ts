import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getModel, parseJSON } from "./_geminiShared.js";
import { verifyAuth } from "./verifyAuth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { idea, platform } = (req.body as any) || {};

  try {
    const model = getModel();

    const prompt = `
You create storyboards for short-form video content.

Idea:
${idea || "generic idea"}

Platform: ${platform || "TikTok/Reels/Shorts"}

Return ONLY JSON:

{
  "frames": [
    {
      "order": 1,
      "description": "what happens visually",
      "onScreenText": "if any",
      "spokenLine": "if any"
    }
  ]
}
`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const raw = result.response.text();
    const data = parseJSON(raw);

    return res.status(200).json(data);
  } catch (err: any) {
    console.error("generateStoryboard error:", err);
    return res.status(200).json({
      success: false,
      error: "Failed to generate storyboard",
      note: err?.message || String(err) || "An unexpected error occurred. Please try again.",
      frames: [],
    });
  }
}
