import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

type Source = "feedback" | "contact";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await verifyAuth(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  const adminDoc = await db.collection("users").doc(admin.uid).get();
  if ((adminDoc.data() as any)?.role !== "Admin") return res.status(403).json({ error: "Admin access required" });

  const { items } = (req.body || {}) as { items?: Array<{ source?: Source; id?: string }> };
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items array required" });
  }

  const batch = db.batch();
  let count = 0;

  for (const it of items) {
    const source = it?.source;
    const id = it?.id;
    if (!id || typeof id !== "string") continue;
    if (source !== "feedback" && source !== "contact") continue;

    const col = source === "feedback" ? "feedback_submissions" : "contact_submissions";
    batch.delete(db.collection(col).doc(id));
    count += 1;
  }

  if (count === 0) return res.status(400).json({ error: "No valid items to delete" });

  try {
    await batch.commit();
    return res.status(200).json({ success: true, deleted: count });
  } catch (e: any) {
    console.error("adminDeleteSupportInboxItems error:", e);
    return res.status(500).json({ error: "Failed to delete items", details: e?.message || String(e) });
  }
}


