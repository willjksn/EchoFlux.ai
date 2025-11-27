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

  const { interactions } = (req.body as any) || {};

  if (!Array.isArray(interactions) || interactions.length === 0) {
    return res.status(400).json({
      error: "Expected 'interactions' to be a non-empty array of messages/notes",
    });
  }

  try {
    const model = getModel();

    const prompt = `
You summarize CRM-style interactions and suggest next actions.

Here are the interactions:
${interactions.map((it: any, i: number) => `#${i + 1}: ${JSON.stringify(it)}`).join("\n")}

Write:
- A short summary paragraph
- 3 bullet points for key themes
- 3 suggested next actions (in bullet form)
Return markdown.
`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const summary = result.response.text().trim();

    return res.status(200).json({ summary });
  } catch (err: any) {
    console.error("generateCRMSummary error:", err);
    return res.status(500).json({
      error: "Failed to summarize CRM interactions",
      details: err?.message ?? String(err),
    });
  }
}

