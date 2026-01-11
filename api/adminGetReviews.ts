import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const admin = await verifyAuth(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  try {
    const db = getAdminDb();
    const adminDoc = await db.collection("users").doc(admin.uid).get();
    if ((adminDoc.data() as any)?.role !== "Admin") return res.status(403).json({ error: "Admin access required" });

    const snap = await db.collection("reviews").orderBy("createdAt", "desc").limit(200).get();
    const items = snap.docs.map((doc) => {
      const data = doc.data() as any;
      return {
        id: doc.id,
        username: data?.username || "Creator",
        userId: data?.userId || null,
        country: data?.country || null,
        plan: data?.plan || null,
        rating: typeof data?.rating === "number" ? data.rating : 5,
        text: data?.text || "",
        showAvatar: Boolean(data?.showAvatar),
        avatarUrl: data?.avatarUrl || null,
        isFeatured: Boolean(data?.isFeatured),
        createdAt: data?.createdAt || data?.updatedAt || null,
      };
    });

    return res.status(200).json({ success: true, items });
  } catch (error: any) {
    console.error("adminGetReviews error:", error);
    return res.status(500).json({ error: "Failed to load reviews", details: error?.message || String(error) });
  }
}
