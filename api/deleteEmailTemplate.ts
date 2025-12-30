import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

/**
 * Delete an email template (admin only)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await verifyAuth(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  const adminDoc = await db.collection("users").doc(admin.uid).get();
  if ((adminDoc.data() as any)?.role !== "Admin") return res.status(403).json({ error: "Admin access required" });

  const { id } = (req.body || {}) as { id?: string };
  if (!id || typeof id !== "string") return res.status(400).json({ error: "id is required" });

  try {
    await db.collection("email_templates").doc(id).delete();
    return res.status(200).json({ success: true });
  } catch (e: any) {
    console.error("deleteEmailTemplate error:", e);
    return res.status(500).json({ error: "Failed to delete email template" });
  }
}


