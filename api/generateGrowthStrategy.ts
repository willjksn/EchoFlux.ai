// api/generateGrowthStrategy.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, getModelRouter, withErrorHandling } from "./_errorHandler.js";

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    res.status(503).json({ success: false, error: "AI not configured", strategy: null });
    return;
  }

  let user;
  try {
    const verifyAuth = await getVerifyAuth();
    user = await verifyAuth(req);
  } catch (authError: any) {
    res.status(401).json({ success: false, error: "Authentication error", strategy: null });
    return;
  }

  if (!user || user.role !== 'Admin') {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { query: growthQuery } = req.body || {};
  if (!growthQuery || typeof growthQuery !== 'string') {
    res.status(400).json({ success: false, error: "Missing query" });
    return;
  }

  try {
    const getModelForTask = await getModelRouter();
    // Use an existing TaskType for the model router (analysis-like work maps best to 'analytics')
    const model = await getModelForTask('analytics', user.uid);

    const prompt = `
You are a product-led growth strategist for a social scheduling SaaS.
Expand the following growth research query into a concise, actionable mini playbook:
"${growthQuery}"

Return a short JSON object:
{
  "title": "Short title",
  "objective": "Clear objective",
  "steps": ["Step 1", "Step 2", "Step 3", "Step 4"],
  "metrics": ["metric to watch 1", "metric to watch 2"]
}
Keep steps concrete (who/what/when), metrics minimal. No markdown fences.
`;

    const response = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    const raw = response.response.text().trim();
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/) || raw.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1].trim());
      } else {
        throw new Error("Failed to parse AI response");
      }
    }

    res.status(200).json({ success: true, strategy: parsed });
  } catch (error: any) {
    console.error("generateGrowthStrategy error:", error);
    res.status(200).json({
      success: false,
      error: error?.message || "Failed to generate strategy",
      strategy: null
    });
  }
}

export default withErrorHandling(handler);

