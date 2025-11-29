import type { VercelRequest, VercelResponse } from "@vercel/node";
// Model routing handled by _modelRouter.ts
import { verifyAuth } from "./verifyAuth.ts";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { incomingMessage, tone, context } = (req.body as any) || {};
  if (!incomingMessage) {
    return res.status(400).json({ error: "Missing 'incomingMessage' in body" });
  }

  try {
    // Use model router - replies use cheapest model for cost optimization
    const { getModelForTask } = await import("./_modelRouter.ts");
    const model = getModelForTask('reply');

    const prompt = `
You write replies to DMs/comments.

Incoming message:
${incomingMessage}

Tone: ${tone || "friendly, on-brand"}
Context: ${context || "none"}

Write a short reply that feels human, not robotic. Do NOT add greetings if user already greeted. One reply only.
`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const reply = result.response.text().trim();

    return res.status(200).json({ reply });
  } catch (err: any) {
    console.error("generateReply error:", err);
    return res.status(500).json({
      error: "Failed to generate reply",
      details: err?.message ?? String(err),
    });
  }
}
