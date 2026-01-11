import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const authed = await verifyAuth(req);
  if (!authed?.uid) return res.status(401).json({ error: "Unauthorized" });

  // Check if user is admin
  const db = getAdminDb();
  const userDoc = await db.collection("users").doc(authed.uid).get();
  const userData = userDoc.exists ? (userDoc.data() as any) : null;
  
  if (userData?.role !== "Admin") {
    return res.status(403).json({ error: "Admin access required" });
  }

  try {
    const feedbackSnap = await db.collection("feedback_submissions")
      .orderBy("createdAt", "desc")
      .get();

    const feedback = feedbackSnap.docs.map(doc => ({
      id: doc.id,
      ...(doc.data() as any),
    }));

    // Calculate stats
    const day7 = feedback.filter(f => f.milestone === "day7").length;
    const day14 = feedback.filter(f => f.milestone === "day14").length;
    
    // Calculate sentiment stats (if available)
    const withSentiment = feedback.filter(f => f.sentimentScore !== undefined);
    const averageSentiment = withSentiment.length > 0
      ? withSentiment.reduce((sum, f) => sum + (f.sentimentScore || 0), 0) / withSentiment.length
      : 0;
    
    const positiveCount = withSentiment.filter(f => f.sentimentLabel === "positive").length;
    const neutralCount = withSentiment.filter(f => f.sentimentLabel === "neutral").length;
    const negativeCount = withSentiment.filter(f => f.sentimentLabel === "negative").length;

    return res.status(200).json({
      success: true,
      feedback,
      stats: {
        total: feedback.length,
        day7,
        day14,
        averageSentiment,
        positiveCount,
        neutralCount,
        negativeCount,
      },
    });
  } catch (e: any) {
    console.error("adminGetFeedback error:", e);
    return res.status(500).json({ error: "Failed to fetch feedback" });
  }
}

