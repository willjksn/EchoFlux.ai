import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, getModelRouter, withErrorHandling } from "./_errorHandler.js";

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Check API keys early
  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    res.status(200).json({
      success: false,
      error: "AI not configured",
      note: apiKeyCheck.error,
    });
    return;
  }

  // Dynamic import for auth
  let user;
  try {
    const verifyAuth = await getVerifyAuth();
    user = await verifyAuth(req);
  } catch (authError: any) {
    console.error("verifyAuth error:", authError);
    res.status(200).json({
      success: false,
      error: "Authentication error",
      note: authError?.message || "Failed to verify authentication. Please try logging in again.",
    });
    return;
  }

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Check monthly reply limit based on plan
  const monthlyRepliesUsed = user.monthlyRepliesUsed || 0;
  const replyLimits: Record<string, number> = {
    'Free': 50,
    'Pro': 250,
    'Elite': 750,
    'Starter': 500,
    'Growth': 1500,
    'Agency': 2000,
  };
  
  const planLimit = user?.plan ? (replyLimits[user.plan] || 50) : 50;
  
  if (monthlyRepliesUsed >= planLimit) {
    res.status(200).json({
      success: false,
      error: "Monthly limit reached",
      note: `You've reached your monthly limit of ${planLimit} AI replies. Upgrade your plan for more replies.`,
      upgradeUrl: "/pricing",
    });
    return;
  }

  const { incomingMessage, messageContent, tone, context, settings } = (req.body as any) || {};
  const message = incomingMessage || messageContent;
  if (!message) {
    res.status(400).json({ error: "Missing 'incomingMessage' or 'messageContent' in body" });
    return;
  }
  
  // Extract tone and context from settings if provided
  const finalTone = tone || settings?.tone?.formality !== undefined 
    ? `${settings.tone.formality > 0.5 ? 'formal' : 'casual'}, ${settings.tone.humor > 0.5 ? 'humorous' : 'professional'}`
    : "friendly, on-brand";
  const finalContext = context || settings?.prioritizedKeywords || "none";

  try {
    // Use model router - replies use cheapest model for cost optimization
    const getModelForTask = await getModelRouter();
    const model = await getModelForTask('reply', user.uid);

    const prompt = `
You write replies to DMs/comments.

Incoming message:
${message}

Tone: ${finalTone}
Context: ${finalContext}

Write a short reply that feels human, not robotic. Do NOT add greetings if user already greeted. One reply only.
`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const reply = result.response.text().trim();

    // Increment monthly reply usage counter (non-blocking)
    try {
      const { getAdminDb } = await import("./_firebaseAdmin.js");
      const db = await getAdminDb();
      const currentUsage = user.monthlyRepliesUsed || 0;
      await db
        .collection("users")
        .doc(user.uid)
        .set(
          {
            monthlyRepliesUsed: currentUsage + 1,
          },
          { merge: true }
        );
    } catch (updateError: any) {
      console.error("Failed to update reply usage counter:", updateError);
      // Don't fail the request if usage tracking fails
    }

    res.status(200).json({ reply });
    return;
  } catch (err: any) {
    console.error("generateReply error:", err);
    res.status(200).json({
      success: false,
      error: "Failed to generate reply",
      note: err?.message || "An unexpected error occurred. Please try again.",
      details: process.env.NODE_ENV === "development" ? err?.stack : undefined,
    });
    return;
  }
}

export default withErrorHandling(handler);
