import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

/**
 * Get email subscribers for a creator's bio page
 * Admin-only endpoint
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const admin = await verifyAuth(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  const adminDoc = await db.collection("users").doc(admin.uid).get();
  if ((adminDoc.data() as any)?.role !== "Admin") return res.status(403).json({ error: "Admin access required" });

  const { creatorId } = req.query as { creatorId?: string };

  try {
    const subscribersRef = db.collection("bio_page_subscribers");
    
    let query: FirebaseFirestore.Query = subscribersRef;
    if (creatorId) {
      query = query.where("creatorId", "==", creatorId);
    }

    const snapshot = await query.orderBy("subscribedAt", "desc").get();
    
    const subscribers = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as any),
    }));

    return res.status(200).json({
      success: true,
      subscribers,
      total: subscribers.length,
    });
  } catch (e: any) {
    console.error("getBioPageSubscribers error:", e);
    return res.status(500).json({ error: "Failed to fetch subscribers" });
  }
}
