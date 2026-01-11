import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { text, rating, showAvatar, country, plan, username, avatarUrl } = req.body || {};
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Review text is required" });
    }

    const parsedRating = typeof rating === "number" ? Math.min(Math.max(rating, 1), 5) : 5;
    const db = getAdminDb();
    const docRef = db.collection("reviews").doc(user.uid);
    const existing = await docRef.get();

    const payload: any = {
      userId: user.uid,
      username: username || user?.name || user?.email?.split("@")[0] || "Creator",
      country: country || null,
      plan: plan || null,
      rating: parsedRating,
      text: text.trim(),
      showAvatar: Boolean(showAvatar),
      avatarUrl: avatarUrl || null,
      isFeatured: existing.exists ? (existing.data() as any)?.isFeatured || false : false,
      updatedAt: new Date().toISOString(),
    };

    if (!existing.exists) {
      payload.createdAt = new Date().toISOString();
    }

    await docRef.set(payload, { merge: true });

    return res.status(200).json({ success: true, review: { id: docRef.id, ...payload } });
  } catch (error: any) {
    console.error("submitReview error:", error);
    return res.status(500).json({ error: "Failed to submit review", details: error?.message || String(error) });
  }
}
