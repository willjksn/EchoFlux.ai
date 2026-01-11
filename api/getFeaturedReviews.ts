import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const db = getAdminDb();
    const mapDocs = (docs: any[]) =>
      docs.map((doc: any) => {
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

    // Try to load featured reviews first
    const featuredSnap = await db
      .collection("reviews")
      .where("isFeatured", "==", true)
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();

    let items = mapDocs(featuredSnap.docs);

    // Fallback: if no featured reviews are flagged yet, show the latest reviews
    if (!items.length) {
      const recentSnap = await db
        .collection("reviews")
        .orderBy("createdAt", "desc")
        .limit(20)
        .get();
      items = mapDocs(recentSnap.docs);
    }

    return res.status(200).json({ success: true, items });
  } catch (error: any) {
    console.error("getFeaturedReviews error:", error);
    return res.status(500).json({ success: false, error: "Failed to load reviews" });
  }
}
