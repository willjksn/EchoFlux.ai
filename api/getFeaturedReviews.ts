import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { enforceRateLimit } from "./_rateLimit.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    (req.headers["x-real-ip"] as string | undefined) ||
    "anonymous";

  // Rate limit: 120 requests / minute per IP
  const ok = await enforceRateLimit({
    req,
    res,
    keyPrefix: "getFeaturedReviews",
    limit: 120,
    windowMs: 60 * 1000,
    identifier: ip,
  });
  if (!ok) return;

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
          isFeatured: data?.isFeatured ?? false,
          createdAt: data?.createdAt || data?.updatedAt || null,
        };
      });

    // Try to load featured reviews first
    let items: any[] = [];
    try {
      const featuredSnap = await db
        .collection("reviews")
        .where("isFeatured", "==", true)
        .orderBy("createdAt", "desc")
        .limit(20)
        .get();
      items = mapDocs(featuredSnap.docs);
      console.log(`Found ${items.length} featured reviews with orderBy`);
    } catch (indexError: any) {
      // If index doesn't exist, try without orderBy
      console.warn("Featured reviews query with orderBy failed, trying without orderBy:", indexError?.message);
      try {
        const featuredSnap = await db
          .collection("reviews")
          .where("isFeatured", "==", true)
          .limit(20)
          .get();
        items = mapDocs(featuredSnap.docs);
        // Sort manually by createdAt
        items.sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        });
        console.log(`Found ${items.length} featured reviews without orderBy`);
      } catch (fallbackError: any) {
        console.error("Featured reviews query failed:", fallbackError?.message);
        // Try to get all reviews and filter client-side as last resort
        try {
          const allSnap = await db.collection("reviews").limit(100).get();
          const allItems = mapDocs(allSnap.docs);
          items = allItems.filter((item: any) => item.isFeatured === true || item.isFeatured === "true");
          items.sort((a: any, b: any) => {
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bTime - aTime;
          });
          console.log(`Found ${items.length} featured reviews via client-side filter`);
        } catch (finalError: any) {
          console.error("Final fallback query failed:", finalError?.message);
        }
      }
    }

    return res.status(200).json({ success: true, items });
  } catch (error: any) {
    console.error("getFeaturedReviews error:", error);
    return res.status(500).json({ success: false, error: "Failed to load reviews" });
  }
}
