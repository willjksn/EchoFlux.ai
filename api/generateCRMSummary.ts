import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, getModelRouter, withErrorHandling } from "./_errorHandler.js";

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    res.status(200).json({
      success: false,
      error: "AI not configured",
      note: apiKeyCheck.error,
    });
    return;
  }

  let user;
  try {
    const verifyAuth = await getVerifyAuth();
    user = await verifyAuth(req);
  } catch (authError: any) {
    res.status(200).json({
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

  const { interactions } = (req.body as any) || {};

  if (!Array.isArray(interactions) || interactions.length === 0) {
    res.status(400).json({
      error: "Expected 'interactions' to be a non-empty array of messages/notes",
    });
    return;
  }

  try {
    const getModelForTask = await getModelRouter();
    const model = await getModelForTask('crm-summary', user.uid);

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

    res.status(200).json({ summary });
    return;
  } catch (err: any) {
    console.error("generateCRMSummary error:", err);
    res.status(200).json({
      success: false,
      error: "Failed to summarize CRM interactions",
      note: err?.message || "An unexpected error occurred. Please try again.",
      details: process.env.NODE_ENV === "development" ? err?.stack : undefined,
    });
    return;
  }
}

export default withErrorHandling(handler);

