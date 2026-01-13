import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { checkApiKeys, getVerifyAuth, withErrorHandling } from "./_errorHandler.js";
import { APP_KNOWLEDGE } from "./appKnowledge.js";

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

  const { question } = (req.body as any) || {};

  if (!question || typeof question !== "string") {
    res.status(400).json({ error: "Missing or invalid 'question'" });
    return;
  }

  // Check if user is admin
  let isAdmin = false;
  try {
    const { getAdminDb } = await import("./_firebaseAdmin.js");
    const db = getAdminDb();
    const userDoc = await db.collection("users").doc(user.uid).get();
    const userData = userDoc.exists ? (userDoc.data() as any) : null;
    isAdmin = userData?.role === "Admin";
  } catch (error) {
    console.error("Failed to check admin status:", error);
    // Continue with non-admin access if check fails
  }

  // Filter knowledge base based on admin status
  let knowledgeBase = APP_KNOWLEDGE;
  if (!isAdmin) {
    // Remove admin section from knowledge base for non-admins
    const adminSectionStart = knowledgeBase.indexOf("## Admin Dashboard & Features");
    if (adminSectionStart !== -1) {
      // Find the end of admin section (look for next major section or end)
      const nextSection = knowledgeBase.indexOf("\n---\n## ", adminSectionStart);
      if (nextSection !== -1) {
        knowledgeBase = knowledgeBase.substring(0, adminSectionStart) + knowledgeBase.substring(nextSection + 5);
      } else {
        // If no next section, remove from admin section to end
        knowledgeBase = knowledgeBase.substring(0, adminSectionStart);
      }
    }
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey!);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
    });

    const adminRestriction = !isAdmin ? `
CRITICAL ADMIN RESTRICTION:
- You MUST NOT answer any questions about admin features, admin dashboard, admin tools, or admin functionality.
- If the user asks about admin features, politely decline and say: "I can only answer questions about admin features if you have admin access. Please contact support if you need admin assistance."
- Do NOT provide any information about:
  - Admin Dashboard
  - User management
  - Admin tools (Tavily searches, invite codes, announcements, etc.)
  - Review management
  - Model usage analytics
  - Any admin-only features
- Redirect non-admin users asking about admin features to contact support.
` : "";

    const prompt = `
You are EchoFlux.ai's built-in assistant.

CRITICAL PRODUCT LIMITS (DO NOT MISREPRESENT):
- EchoFlux.ai is currently a creator-focused AI Content Studio & Campaign Planner (offline/planning-first).
- Do NOT claim the app provides social listening or competitor tracking in the current version.
- Do NOT claim the app provides automated DM/comment reply automation or automatic posting.
- You do NOT have live web access. Be honest about uncertainty for time-sensitive questions.

${adminRestriction}

App System Knowledge:
${knowledgeBase}

User UID: ${user.uid}
User is Admin: ${isAdmin}

User question:
${question}

Answer clearly. Friendly tone. Keep responses concise and helpful.
If the user asks about \"latest\" or \"current\" external trends, you may answer based on your general knowledge, but you do NOT have direct live web access.
If something is time-sensitive (like today's exact algorithm changes), be honest about uncertainty and give generally reliable best practices instead.
`;

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    });

    const text = result.response.text().trim();

    res.status(200).json({
      answer: text,
    });
    return;
  } catch (err: any) {
    console.error("askChatbot error:", err);
    res.status(200).json({
      success: false,
      error: "Failed to answer chatbot question",
      note: err?.message || "An unexpected error occurred. Please try again.",
      details: process.env.NODE_ENV === "development" ? err?.stack : undefined,
    });
    return;
  }
}

export default withErrorHandling(handler);
