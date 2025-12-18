import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, withErrorHandling } from "./_errorHandler.js";

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Check API keys are configured
  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    res.status(200).json({
      success: false,
      error: "AI not configured",
      note: apiKeyCheck.error,
    });
    return;
  }

  // Verify user authentication
  let user;
  try {
    const verifyAuth = await getVerifyAuth();
    user = await verifyAuth(req);
  } catch (authError: any) {
    console.error("verifyAuth error:", authError);
    res.status(401).json({
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

  // Return the API key (it's safe to expose to authenticated users as it's rate-limited by user)
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  
  res.status(200).json({
    success: true,
    apiKey: apiKey,
  });
  return;
}

export default withErrorHandling(handler);

