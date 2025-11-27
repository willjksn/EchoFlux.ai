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

  const { content, goal, platform } = (req.body as any) || {};
  if (!content) {
    return res.status(400).json({ error: "Missing 'content' in body" });
  }

  try {
    const model = getModel();

    const prompt = `
You critique social media content and give constructive feedback.

Content:
${content}

Goal: ${goal || "engagement"}
Platform: ${platform || "generic"}

Return ONLY JSON:
{
  "score": 0-100,
  "summary": "short critique",
  "whatWorked": ["point 1", "point 2"],
  "improvements": ["point 1", "point 2"],
  "suggestedRewrite": "optional improved version"
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
    console.error("generateCritique error:", err);
    return res.status(500).json({
      error: "Failed to critique content",
      details: err?.message ?? String(err),
    });
  }
}

