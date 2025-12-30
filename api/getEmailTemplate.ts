import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

/**
 * Get a single email template by id (admin only)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const admin = await verifyAuth(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  const adminDoc = await db.collection("users").doc(admin.uid).get();
  if ((adminDoc.data() as any)?.role !== "Admin") return res.status(403).json({ error: "Admin access required" });

  const { id } = req.query as { id?: string };
  if (!id || typeof id !== "string") return res.status(400).json({ error: "id is required" });

  try {
    const doc = await db.collection("email_templates").doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: "Template not found" });
    return res.status(200).json({ success: true, template: { id: doc.id, ...(doc.data() as any) } });
  } catch (e: any) {
    console.error("getEmailTemplate error:", e);
    return res.status(500).json({ error: "Failed to get email template" });
  }
}


