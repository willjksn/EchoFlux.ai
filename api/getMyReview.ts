import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const db = getAdminDb();
    const doc = await db.collection("reviews").doc(user.uid).get();
    if (!doc.exists) return res.status(200).json({ success: true, review: null });

    const data = doc.data() as any;
    return res.status(200).json({
      success: true,
      review: {
        id: doc.id,
        ...data,
      },
    });
  } catch (error: any) {
    console.error("getMyReview error:", error);
    return res.status(500).json({ error: "Failed to load review", details: error?.message || String(error) });
  }
}
