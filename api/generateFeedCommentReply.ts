import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, getModelRouter, withErrorHandling } from "./_errorHandler.js";
import { sanitizeForAI } from "./_inputSanitizer.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { enforceRateLimit } from "./_rateLimit.js";

/** Elite-only: generate a single short reply to a feed comment, in creator voice. No medical/legal/explicit; edgy/bold ok if it fits personality. */
async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    res.status(200).json({ success: false, error: "AI not configured", note: apiKeyCheck.error });
    return;
  }

  let tokenUser: { uid: string } | null;
  try {
    const verifyAuth = await getVerifyAuth();
    tokenUser = await verifyAuth(req);
  } catch (authError: any) {
    res.status(200).json({ success: false, error: "Authentication error", note: authError?.message });
    return;
  }
  if (!tokenUser?.uid) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const ok = await enforceRateLimit({
    req,
    res,
    keyPrefix: "generateFeedCommentReply",
    limit: 60,
    windowMs: 60_000,
    identifier: tokenUser.uid,
  });
  if (!ok) return;

  const { commentText, postBody, tone, creatorPersonality } = (req.body as Record<string, unknown>) || {};
  const text = sanitizeForAI(String(commentText ?? ""), 2000);
  if (!text) {
    res.status(400).json({ error: "Missing or empty 'commentText'" });
    return;
  }

  const db = getAdminDb();
  const userSnap = await db.collection("users").doc(tokenUser.uid).get();
  const userData = userSnap.data() || {};
  const plan = userData.plan as string | undefined;
  const role = userData.role as string | undefined;
  const isElite = plan === "Elite" || plan === "Agency" || role === "Admin";
  if (!isElite) {
    res.status(200).json({
      success: false,
      error: "Elite only",
      note: "AI comment replies are available on Elite. Upgrade to unlock.",
      upgradeUrl: "/pricing",
    });
    return;
  }

  const personality = sanitizeForAI(String(creatorPersonality || userData.creatorPersonality || tone || "friendly"), 1500) || "friendly, authentic";
  const postSnippet = sanitizeForAI(String(postBody ?? ""), 500);

  try {
    const getModelForTask = await getModelRouter();
    const model = await getModelForTask("reply", tokenUser.uid);

    const prompt = `You write a single short reply to a fan's comment on a creator's feed post. Reply as the creator, in their voice.

RULES (strict):
- Do NOT give medical, legal, or professional advice.
- Do NOT write explicit sexual content or graphic descriptions.
- Edgy, bold, or playful is fine if it matches the creator's personality.
- One short reply only (1-2 sentences). No greetings unless the fan asked a question. Stay natural and human.

Creator personality/tone: ${personality}
Fan's comment: ${text}
${postSnippet ? `Post caption/snippet (for context): ${postSnippet}` : ""}

Reply (short, in creator voice):`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    const reply = result.response.text().trim().slice(0, 500);

    res.status(200).json({ reply });
    return;
  } catch (err: any) {
    console.error("generateFeedCommentReply error:", err);
    res.status(200).json({
      success: false,
      error: "Failed to generate reply",
      note: err?.message || "Please try again.",
    });
    return;
  }
}

export default withErrorHandling(handler);
