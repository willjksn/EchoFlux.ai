import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkApiKeys, getVerifyAuth, withErrorHandling } from "./_errorHandler.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { hasPlatformAdminAccess } from "./_platformAdminAccess.js";

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
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
  } catch (authError: unknown) {
    console.error("verifyAuth error:", authError);
    res.status(401).json({
      success: false,
      error: "Authentication error",
      note:
        authError instanceof Error
          ? authError.message
          : "Failed to verify authentication. Please try logging in again.",
    });
    return;
  }

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const db = getAdminDb();
    const userSnap = await db.collection("users").doc(user.uid).get();
    const data = userSnap.data() as Record<string, unknown> | undefined;
    if (!hasPlatformAdminAccess(data)) {
      res.status(403).json({
        success: false,
        error: "Voice live API access is restricted to platform administrators.",
      });
      return;
    }
  } catch (e) {
    console.error("getVoiceApiKey admin check failed:", e);
    res.status(503).json({ success: false, error: "Unable to verify permissions" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  res.status(200).json({
    success: true,
    apiKey,
  });
}

export default withErrorHandling(handler);
