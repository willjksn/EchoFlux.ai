import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

/**
 * Get email history with filtering by category
 * Admin-only endpoint
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const admin = await verifyAuth(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  const adminDoc = await db.collection("users").doc(admin.uid).get();
  if ((adminDoc.data() as any)?.role !== "Admin") return res.status(403).json({ error: "Admin access required" });

  const { category, limit = "100" } = req.query as { category?: string; limit?: string };

  try {
    let query: FirebaseFirestore.Query = db.collection("email_history").orderBy("sentAt", "desc");

    if (category && typeof category === "string" && ["waitlist", "mass", "scheduled", "template", "other"].includes(category)) {
      query = query.where("category", "==", category);
    }

    const limitNum = Math.min(parseInt(limit, 10) || 100, 500); // Max 500
    const snapshot = await query.limit(limitNum).get();

    const history = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        sentAt: data.sentAt,
        sentBy: data.sentBy || null,
        to: data.to,
        subject: data.subject,
        body: data.body,
        html: data.html,
        status: data.status,
        provider: data.provider,
        error: data.error,
        category: data.category,
        metadata: data.metadata || {},
      };
    });

    return res.status(200).json({ success: true, history });
  } catch (e: any) {
    console.error("getEmailHistory error:", e);
    return res.status(500).json({ error: "Failed to fetch email history" });
  }
}

