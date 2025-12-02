// api/generateBrandSuggestions.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, getModelRouter, withErrorHandling } from "./_errorHandler.ts";

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
      const { parseJSON } = await import("./_geminiShared.ts");
      suggestions = parseJSON(raw);
    } catch {
      try {
        suggestions = JSON.parse(raw);
      } catch {
        suggestions = [raw];
      }
    }

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

