import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const db = getAdminDb();
    const snap = await db
      .collection("reviews")
      .where("isFeatured", "==", true)
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();

    const items = snap.docs.map((doc) => {
      const data = doc.data() as any;
      return {
        id: doc.id,
        username: data?.username || "Creator",
        country: data?.country || null,
        plan: data?.plan || null,
        rating: typeof data?.rating === "number" ? data.rating : 5,
        text: data?.text || "",
        showAvatar: Boolean(data?.showAvatar),
        avatarUrl: data?.avatarUrl || null,
        createdAt: data?.createdAt || data?.updatedAt || null,
      };
    });

    return res.status(200).json({ success: true, items });
  } catch (error: any) {
    console.error("getFeaturedReviews error:", error);
    return res.status(500).json({ success: false, error: "Failed to load reviews" });
  }
}
