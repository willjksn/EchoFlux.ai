// api/generateAdKeyMessage.ts
// AI help for generating key message suggestions for ad campaigns (Admin-only)

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { getModelForTask } from "./_modelRouter.js";
import { enforceRateLimit } from "./_rateLimit.js";

// Brand guardrails for EchoFlux
const BRAND_VOICE = `
EchoFlux Voice:
- Creator-first, supportive, calm confidence
- Short, clear lines
- Emphasize consistency and burnout prevention
- AI-led guidance, not overwhelm
`;

const APPROVED_CLAIMS = [
  "Plan → create → post workflow designed for creators",
  "AI-led planning keeps you consistent",
  "Prevents burnout and decision fatigue",
  "Built for monetized creators and new creators starting out",
  "The creators who plan consistently earn 3x more",
];

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authUser = await verifyAuth(req);
  if (!authUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Verify admin access
  const db = getAdminDb();
  const userDoc = await db.collection("users").doc(authUser.uid).get();
  
  if (!userDoc.exists) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const userData = userDoc.data();
  if (userData?.role !== "Admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  // Rate limiting: 20 requests per minute per admin
  const ok = await enforceRateLimit({
    req,
    res,
    keyPrefix: "generateAdKeyMessage",
    limit: 20,
    windowMs: 60_000,
    identifier: authUser.uid,
  });
  if (!ok) return;

  const {
    objective = "awareness",
    targetAudience,
    currentMessage,
  } = req.body || {};

  if (!targetAudience || typeof targetAudience !== "string") {
    res.status(400).json({ error: "targetAudience is required" });
    return;
  }

  try {
    const model = await getModelForTask("strategy", authUser.uid);

    const prompt = `
You are helping write a key message for EchoFlux.ai ad campaigns.

${BRAND_VOICE}

APPROVED CLAIMS (use only these):
${APPROVED_CLAIMS.map((claim) => `- ${claim}`).join("\n")}

Context:
- Objective: ${objective}
- Target Audience: ${targetAudience}
${currentMessage ? `- Current Message: ${currentMessage}\n(Improve or expand this, or provide an alternative)` : ""}

Generate a concise, compelling key message (1-2 sentences max) that:
1. Aligns with brand voice
2. Uses only approved claims
3. Targets: ${targetAudience}
4. Supports objective: ${objective}
5. Is ready to use in ad copy

Return ONLY the key message text, nothing else. No JSON, no quotes, just the message.
`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const suggestion = result.response.text().trim();
    
    // Clean up any extra formatting
    const cleaned = suggestion
      .replace(/^["']|["']$/g, "") // Remove surrounding quotes
      .replace(/^Key Message:\s*/i, "") // Remove "Key Message:" prefix
      .replace(/^Message:\s*/i, "") // Remove "Message:" prefix
      .trim();

    return res.status(200).json({
      suggestion: cleaned,
    });
  } catch (err: any) {
    console.error("generateAdKeyMessage error:", err);
    return res.status(500).json({
      error: "Failed to generate key message suggestion",
      details: err?.message || String(err),
    });
  }
}
