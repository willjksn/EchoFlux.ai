import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

/**
 * Cancel a scheduled email (admin only)
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

  const nowIso = new Date().toISOString();

  try {
    const ref = db.collection("scheduled_emails").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Scheduled email not found" });

    const data = snap.data() as any;
    if (data?.status !== "scheduled") {
      return res.status(400).json({ error: `Cannot cancel email in status: ${data?.status || "unknown"}` });
    }

    await ref.set({ status: "cancelled", cancelledAt: nowIso, cancelledBy: admin.uid, updatedAt: nowIso, updatedBy: admin.uid } as any, { merge: true });
    return res.status(200).json({ success: true });
  } catch (e: any) {
    console.error("cancelScheduledEmail error:", e);
    return res.status(500).json({ error: "Failed to cancel scheduled email" });
  }
}


