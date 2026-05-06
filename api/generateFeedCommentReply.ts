import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, getModelRouter, withErrorHandling } from "./_errorHandler.js";
import { sanitizeForAI } from "./_inputSanitizer.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { normalizePlanForLimits } from "./_planLimits.js";

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
  const isElite = normalizePlanForLimits(plan ?? "") === "Elite" || plan === "Agency" || role === "Admin";
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

  const storefrontSnap = await db.collection("creators").doc(tokenUser.uid).get();
  const storefrontData = storefrontSnap.exists ? storefrontSnap.data() || {} : {};
  const creatorDisplay =
    (typeof userData.displayName === "string" && userData.displayName.trim()) ||
    (typeof (storefrontData as { displayName?: string }).displayName === "string" &&
      (storefrontData as { displayName: string }).displayName.trim()) ||
    "Creator";

  try {
    const getModelForTask = await getModelRouter();
    const model = await getModelForTask("reply", tokenUser.uid);

    const perspectiveBlock = `
CRITICAL — WHO YOU ARE VS THE FAN (do not invert):
- You are ${creatorDisplay}, the CREATOR. The fan commented on YOUR post — they are not the default subject of your photos unless they say they appear in the post.
- Do NOT assume the fan is doing what your photos show. Never wish THEM safe travels / fun on the road / enjoy your trip unless they clearly said THEY are traveling.
- If YOUR post depicts YOU traveling or on the road, reply as yourself; thank them or vibe — do not redirect that onto the fan.
`;

    const answerQuestionsBlock = `
QUESTIONS (must answer, not deflect):
- If they asked something — "?", or seeks info (what/when/where/which/who/why/how/can you/could you/would you/do you/is it/are you/tell me/did you, etc.) — answer AS ${creatorDisplay} directly first; do not reply with only generic thanks while ignoring what they asked.
- Use post caption/snippet when relevant; if you can't know, say so briefly instead of guessing.
- Still obey POV rules above.
`;

    const prompt = `You write ONE reply to a fan's comment on YOUR feed post. Reply as ${creatorDisplay} (the creator), first person.

RULES (strict):
- Do NOT give medical, legal, or professional advice.
- Do NOT write explicit sexual content or graphic descriptions.
- Edgy, bold, or playful is fine if it matches the creator's personality.
- Length: usually 1-2 sentences; if they asked a question, answer clearly — up to 3 short sentences if needed.
${perspectiveBlock}
${answerQuestionsBlock}

Creator personality/tone: ${personality}
Fan's comment: ${text}
${postSnippet ? `Post caption/snippet: ${postSnippet}` : ""}

Reply (creator voice — obey POV rules; if they asked something, answer it):`;

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
