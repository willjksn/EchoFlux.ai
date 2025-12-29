import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

/**
 * Delete an invite code (admin only).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const db = getAdminDb();
    const adminDoc = await db.collection("users").doc(user.uid).get();
    const adminData = adminDoc.data();
    if (adminData?.role !== "Admin") return res.status(403).json({ error: "Admin access required" });

    const { code } = (req.body || {}) as { code?: string };
    if (!code || typeof code !== "string" || !code.trim()) return res.status(400).json({ error: "code is required" });
    const normalizedCode = code.trim().toUpperCase();

    const ref = db.collection("beta_invites").doc(normalizedCode);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Invite code not found" });

    await ref.delete();
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("Error deleting invite code:", error);
    return res.status(500).json({ error: "Failed to delete invite code", message: error?.message || "Unknown error" });
  }
}


