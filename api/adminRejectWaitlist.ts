import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await verifyAuth(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  const adminDoc = await db.collection("users").doc(admin.uid).get();
  if ((adminDoc.data() as any)?.role !== "Admin") return res.status(403).json({ error: "Admin access required" });

  const { email } = (req.body || {}) as { email?: string };
  if (!email || typeof email !== "string") return res.status(400).json({ error: "email is required" });

  const normalizedEmail = email.trim().toLowerCase();
  const waitlistId = normalizedEmail.replace(/[^a-z0-9@._+-]/g, "_");
  const ref = db.collection("waitlist_requests").doc(waitlistId);
  const nowIso = new Date().toISOString();

  try {
    await ref.set(
      {
        email: normalizedEmail,
        status: "rejected",
        rejectedAt: nowIso,
        rejectedBy: admin.uid,
        updatedAt: nowIso,
      } as any,
      { merge: true }
    );
    return res.status(200).json({ success: true });
  } catch (e: any) {
    console.error("adminRejectWaitlist error:", e);
    return res.status(500).json({ error: "Failed to reject waitlist" });
  }
}


