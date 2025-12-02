import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getModel } from "./_geminiShared.js";
import { verifyAuth } from "./verifyAuth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { topic, durationSeconds, style } = (req.body as any) || {};

  try {
    const model = getModel();

    const prompt = `
You write spoken scripts for short-form content.

Topic: ${topic || "generic topic"}
Target duration: ${durationSeconds || 60} seconds
Style: ${style || "conversational, high-retention"}

Write a script with line breaks that could be read aloud. Include hooks early, keep it concise.
`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const script = result.response.text().trim();

    return res.status(200).json({ script });
  } catch (err: any) {
    console.error("generateSpeech error:", err);
    return res.status(500).json({
      error: "Failed to generate speech script",
      details: err?.message ?? String(err),
    });
  }
}
