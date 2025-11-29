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

  const { posts } = (req.body as any) || {};
  if (!Array.isArray(posts) || posts.length === 0) {
    return res.status(400).json({ error: "Expected 'posts' to be a non-empty array of strings" });
  }

  try {
    // Use model router - trends analysis uses thinking model for better insights
    const { getModelForTask } = await import("./_modelRouter.ts");
    const model = getModelForTask('trends');

    const prompt = `
You analyze social media performance.

Here is a list of posts (content, captions, or summaries):

${posts.map((p: string, idx: number) => `Post ${idx + 1}: ${p}`).join("\n")}

Find 3–5 key trends or insights (topics, angles, hooks, formats) that seem to work best.
Return ONLY JSON:

{
  "trends": [
    {
      "title": "short, human-readable name",
      "description": "what this trend is",
      "examplePostIndexes": [1, 3]
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
    console.error("findTrends error:", err);
    return res.status(500).json({
      error: "Failed to find trends",
      details: err?.message ?? String(err),
    });
  }
}

