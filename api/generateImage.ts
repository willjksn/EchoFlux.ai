import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getModel } from "./_geminiShared.ts";
import { verifyAuth } from "./verifyAuth.ts";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { prompt } = (req.body as any) || {};

  try {
    const model = getModel();

    const systemPrompt = `
You help generate detailed prompts for image generation models.
Given a short idea, expand it into a rich, specific, but concise image prompt.
`;

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemPrompt}\nUser idea: ${prompt || "abstract background"}` }],
        },
      ],
    });

    const suggestedPrompt = result.response.text().trim();

    // TODO: hook into an actual image-generation provider and return real image URLs.
    return res.status(200).json({
      prompt: suggestedPrompt,
      note: "This route currently returns only a textual image prompt. Connect it to an image API to get real images.",
    });
  } catch (err: any) {
    console.error("generateImage error:", err);
    return res.status(500).json({
      error: "Failed to generate image prompt",
      details: err?.message ?? String(err),
    });
  }
}
