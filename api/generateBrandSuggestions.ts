// api/generateBrandSuggestions.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.ts";
import { getModel, parseJSON } from "./_geminiShared.ts";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // 🔥 Support both {data:{...}} and direct body
  const body = req.body?.data || req.body || {};
  const { niche, audience, userType } = body;

  if (!niche || !audience || !userType) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const model = getModel("gemini-2.0-flash");

    const prompt = `
You are an expert brand strategist.

Generate 5 tailored brand-building suggestions for:
- User Type: ${userType}
- Niche: ${niche}
- Audience: ${audience}

Return ONLY JSON: an array of suggestion strings.
`;

    const response = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    });

    const raw = response.response.text().trim();
    let suggestions;

    try {
      suggestions = parseJSON(raw);
    } catch {
      suggestions = [raw];
    }

    return res.status(200).json({ suggestions });
  } catch (err: any) {
    console.error("generateBrandSuggestions error:", err);
    return res.status(500).json({
      error: "Failed to generate brand suggestions",
      details: err?.message || String(err),
    });
  }
}

