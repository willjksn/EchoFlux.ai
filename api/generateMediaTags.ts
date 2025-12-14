import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, getModelRouter, withErrorHandling } from "./_errorHandler.js";

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Check API keys
  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    return res.status(200).json({
      success: false,
      error: "AI not configured",
      note: apiKeyCheck.error,
      tags: { outfits: [], poses: [], vibes: [] },
    });
  }

  // Verify auth
  let user;
  try {
    const verifyAuth = await getVerifyAuth();
    user = await verifyAuth(req);
  } catch (authError: any) {
    console.error("verifyAuth error:", authError);
    return res.status(200).json({
      success: false,
      error: "Authentication error",
      note: authError?.message || "Failed to verify authentication.",
      tags: { outfits: [], poses: [], vibes: [] },
    });
  }

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { mediaUrl, mediaType } = req.body || {};

    if (!mediaUrl) {
      return res.status(400).json({ error: "Missing mediaUrl" });
    }

    // Use model router for image analysis
    const getModelForTask = await getModelRouter();
    const model = await getModelForTask('image-analysis', user.uid);

    const prompt = `Analyze this ${mediaType || 'image'} and generate relevant tags for OnlyFans content organization.

Return ONLY a JSON object with this exact structure:
{
  "outfits": ["outfit tag 1", "outfit tag 2", ...],
  "poses": ["pose tag 1", "pose tag 2", ...],
  "vibes": ["vibe tag 1", "vibe tag 2", ...]
}

Guidelines:
- outfits: Describe clothing, lingerie, accessories, or lack thereof (e.g., "lingerie", "casual wear", "nude", "costume", "athletic wear")
- poses: Describe body positions and poses (e.g., "sitting", "lying down", "standing", "back arch", "profile view")
- vibes: Describe the mood, energy, or aesthetic (e.g., "sensual", "playful", "dominant", "soft", "teasing", "intimate", "bold")

Be specific and relevant. Include 3-8 tags per category. Return ONLY the JSON, no other text.

Image URL: ${mediaUrl}`;

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    });

    let output = result.response.text().trim();

    // Extract JSON from markdown code blocks if present
    const jsonMatch = output.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (jsonMatch) {
      output = jsonMatch[1];
    }

    // Parse JSON
    let parsed;
    try {
      parsed = JSON.parse(output);
    } catch (parseError) {
      // Try to extract JSON object from text
      const objectMatch = output.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          parsed = JSON.parse(objectMatch[0]);
        } catch (e) {
          console.error("Failed to parse AI response:", output);
          parsed = { outfits: [], poses: [], vibes: [] };
        }
      } else {
        parsed = { outfits: [], poses: [], vibes: [] };
      }
    }

    // Ensure all required fields exist
    const tags = {
      outfits: Array.isArray(parsed.outfits) ? parsed.outfits.slice(0, 8) : [],
      poses: Array.isArray(parsed.poses) ? parsed.poses.slice(0, 8) : [],
      vibes: Array.isArray(parsed.vibes) ? parsed.vibes.slice(0, 8) : [],
    };

    return res.status(200).json({
      success: true,
      tags,
    });
  } catch (error: any) {
    console.error("Error generating media tags:", error);
    return res.status(200).json({
      success: false,
      error: "Failed to generate tags",
      note: error?.message || "An error occurred while analyzing the media.",
      tags: { outfits: [], poses: [], vibes: [] },
    });
  }
}

export default withErrorHandling(handler);
