import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, getModelRouter, withErrorHandling } from "./_errorHandler.js";
import { getAdminDb } from "./_firebaseAdmin.js";

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Check API keys early
  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    res.status(503).json({
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
    res.status(401).json({
      success: false,
      error: "Authentication error",
      note: authError?.message || "Failed to verify authentication.",
    });
    return;
  }

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Check if user is admin
  const db = getAdminDb();
  const userDoc = await db.collection("users").doc(user.uid).get();
  const userData = userDoc.exists ? (userDoc.data() as any) : null;
  
  if (userData?.role !== "Admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const {
    instructions,
    emailType,
    recipientName,
    recipientContext,
    tone,
    includePlaceholders,
  } = (req.body || {}) as {
    instructions?: string;
    emailType?: "single" | "mass";
    recipientName?: string;
    recipientContext?: string;
    tone?: "professional" | "friendly" | "casual" | "formal" | "enthusiastic";
    includePlaceholders?: boolean;
  };

  if (!instructions || typeof instructions !== "string" || !instructions.trim()) {
    res.status(400).json({ error: "instructions is required" });
    return;
  }

  try {
    // Use model router - email generation uses thinking model for better quality
    const getModelForTask = await getModelRouter();
    const model = await getModelForTask('analytics', user.uid);

    const toneDescription = tone || "professional";
    const placeholderNote = includePlaceholders
      ? "\n\nIMPORTANT: Use {name} placeholder for personalization (e.g., 'Hi {name},' or 'Dear {name},'). You can also use {inviteCode}, {plan}, {expiresAt}, {onboardingLink} if relevant."
      : "";

    const recipientContextNote = recipientContext
      ? `\n\nRecipient Context: ${recipientContext}`
      : "";

    const recipientNameNote = recipientName && emailType === "single"
      ? `\n\nRecipient Name: ${recipientName}`
      : "";

    const prompt = `You are an expert email copywriter for EchoFlux.ai, an AI-powered social media content creation platform.

Generate a professional email based on these instructions:
${instructions}

Email Type: ${emailType === "mass" ? "Mass email to multiple recipients" : "Single email to one recipient"}
Tone: ${toneDescription}${recipientNameNote}${recipientContextNote}${placeholderNote}

Requirements:
- Write a compelling subject line (keep it under 60 characters for best open rates)
- Write a clear, engaging email body
- Use appropriate tone: ${toneDescription}
- Keep it concise but complete
- For mass emails, use {name} placeholder for personalization
- For single emails, you can use the actual name if provided
- Make it actionable and clear about what the recipient should do
- Sign off as "The EchoFlux Team"

Return ONLY a JSON object with this exact structure:
{
  "subject": "Email subject line here",
  "body": "Email body text here (plain text, no markdown)"
}

Do NOT include any other text, explanations, or markdown formatting. Return ONLY the JSON object.`;

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    });

    const responseText = result.response.text();
    
    // Parse JSON from response
    let parsed: { subject: string; body: string };
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? jsonMatch[0] : responseText;
      parsed = JSON.parse(jsonText);
    } catch (parseError) {
      console.error("Failed to parse email response:", responseText);
      throw new Error("Failed to parse AI response. Please try again.");
    }

    // Validate response
    if (!parsed.subject || !parsed.body) {
      throw new Error("AI response missing subject or body");
    }

    // Clean up the content
    const subject = parsed.subject.trim();
    const body = parsed.body.trim();

    if (!subject || !body) {
      throw new Error("Generated email is empty");
    }

    res.status(200).json({
      success: true,
      subject,
      body,
    });
    return;
  } catch (e: any) {
    console.error("generateEmailContent error:", e);
    res.status(500).json({
      success: false,
      error: "Failed to generate email content",
      note: e?.message || "An error occurred while generating email content",
    });
    return;
  }
}

export default withErrorHandling(handler);

