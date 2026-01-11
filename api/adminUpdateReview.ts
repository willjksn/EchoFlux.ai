import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

interface UpdatePayload {
  id?: string;
  action?: "upsert" | "delete";
  username?: string;
  userId?: string;
  country?: string;
  plan?: string;
  rating?: number;
  text?: string;
  showAvatar?: boolean;
  avatarUrl?: string | null;
  isFeatured?: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await verifyAuth(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  const adminDoc = await db.collection("users").doc(admin.uid).get();
  if ((adminDoc.data() as any)?.role !== "Admin") return res.status(403).json({ error: "Admin access required" });

  try {
    const body = req.body as UpdatePayload;
    const { id, action = "upsert" } = body;

    if (action === "delete") {
      if (!id) return res.status(400).json({ error: "id required for delete" });
      await db.collection("reviews").doc(id).delete();
      return res.status(200).json({ success: true, deleted: id });
    }

    // Upsert (admin can create or update). Merge with existing values when id is provided.
    const docId = id || db.collection("reviews").doc().id;
    const existing = await db.collection("reviews").doc(docId).get();
    const existingData = existing.exists ? (existing.data() as any) : {};

    const rating = typeof body.rating === "number"
      ? Math.min(Math.max(body.rating, 1), 5)
      : typeof existingData.rating === "number"
        ? existingData.rating
        : 5;

    const text = typeof body.text === "string" ? body.text : existingData.text;
    if (!text || !text.trim()) return res.status(400).json({ error: "Review text is required" });

    const payload = {
      username: body.username || existingData.username || "Creator",
      userId: body.userId || existingData.userId || null,
      country: typeof body.country === "string" ? body.country : existingData.country || null,
      plan: typeof body.plan === "string" ? body.plan : existingData.plan || null,
      rating,
      text: text.trim(),
      showAvatar: typeof body.showAvatar === "boolean" ? body.showAvatar : Boolean(existingData.showAvatar),
      avatarUrl: typeof body.avatarUrl === "string" ? body.avatarUrl : existingData.avatarUrl || null,
      isFeatured: typeof body.isFeatured === "boolean" ? body.isFeatured : Boolean(existingData.isFeatured),
      updatedAt: new Date().toISOString(),
      createdAt: existingData.createdAt || new Date().toISOString(),
    } as any;

    await db.collection("reviews").doc(docId).set(payload, { merge: true });

    return res.status(200).json({ success: true, id: docId, review: { id: docId, ...payload } });
  } catch (error: any) {
    console.error("adminUpdateReview error:", error);
    return res.status(500).json({ error: "Failed to update review", details: error?.message || String(error) });
  }
}
