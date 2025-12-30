import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

/**
 * List scheduled emails (admin only)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const admin = await verifyAuth(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  const adminDoc = await db.collection("users").doc(admin.uid).get();
  if ((adminDoc.data() as any)?.role !== "Admin") return res.status(403).json({ error: "Admin access required" });

  try {
    const snap = await db.collection("scheduled_emails").orderBy("sendAt", "desc").limit(200).get();
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    return res.status(200).json({ success: true, items });
  } catch (e: any) {
    console.error("listScheduledEmails error:", e);
    return res.status(500).json({ error: "Failed to list scheduled emails" });
  }
}


