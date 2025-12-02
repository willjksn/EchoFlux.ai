// api/generateBrandSuggestions.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, getModelRouter, withErrorHandling } from "./_errorHandler.js";

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    return res.status(200).json({
      success: false,
      error: "AI not configured",
      note: apiKeyCheck.error,
    });
  }

  let user;
  try {
    const verifyAuth = await getVerifyAuth();
    user = await verifyAuth(req);
  } catch (authError: any) {
    return res.status(200).json({
      success: false,
      error: "Authentication error",
      note: authError?.message || "Failed to verify authentication.",
    });
  }

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
    const getModelForTask = await getModelRouter();
    const model = await getModelForTask('brand', user.uid);

    const prompt = `
You are an expert brand strategist specializing in brand partnerships and collaborations.

Generate 5 brand partnership suggestions for:
- User Type: ${userType}
- Niche: ${niche}
- Target Audience: ${audience}

Return ONLY valid JSON array with this exact structure:
[
  {
    "name": "Brand Name",
    "reason": "Why this brand is a good match (2-3 sentences)",
    "matchScore": 85
  }
]

Each brand should:
- Be relevant to the niche and audience
- Have a matchScore between 70-100
- Include a clear reason for the partnership potential
`;

    const response = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    });

    const raw = response.response.text().trim();
    let suggestions;

    try {
      const { parseJSON } = await import("./_geminiShared.js");
      suggestions = parseJSON(raw);
    } catch {
      try {
        suggestions = JSON.parse(raw);
      } catch {
        // Fallback: create suggestions from raw text
        suggestions = [{ name: "Brand Partnership", reason: raw, matchScore: 80 }];
      }
    }

    // Ensure suggestions is an array
    if (!Array.isArray(suggestions)) {
      suggestions = [suggestions];
    }

    // Ensure each suggestion has the required fields
    suggestions = suggestions.map((s: any, idx: number) => ({
      name: s.name || `Brand ${idx + 1}`,
      reason: s.reason || s.description || s || "Potential brand partnership opportunity",
      matchScore: typeof s.matchScore === 'number' ? s.matchScore : (s.score || 80)
    }));

    return res.status(200).json({ suggestions });
  } catch (err: any) {
    console.error("generateBrandSuggestions error:", err);
    return res.status(200).json({
      success: false,
      error: "Failed to generate brand suggestions",
      note: err?.message || "An unexpected error occurred. Please try again.",
      details: process.env.NODE_ENV === "development" ? err?.stack : undefined,
    });
  }
}

export default withErrorHandling(handler);


