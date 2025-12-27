import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { getVerifyAuth, withErrorHandling } from "./_errorHandler.js";

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const verifyAuth = await getVerifyAuth();
  const user = await verifyAuth(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { message, page, url, userAgent } = (req.body || {}) as {
    message?: string;
    page?: string;
    url?: string;
    userAgent?: string;
  };

  if (!message || !String(message).trim()) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  const db = getAdminDb();
  const now = new Date().toISOString();

  await db.collection("user_problem_reports").add({
    userId: user.uid,
    email: user.email || null,
    message: String(message).trim(),
    page: page || null,
    url: url || null,
    userAgent: userAgent || null,
    createdAt: now,
    status: "new",
  });

  res.status(200).json({ success: true });
}

export default withErrorHandling(handler);


