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

  const { ids, emails } = (req.body || {}) as { ids?: string[]; emails?: string[] };

  const normalizedIds = Array.isArray(ids)
    ? ids
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter(Boolean)
        .slice(0, 200)
    : [];

  const normalizedFromEmails = Array.isArray(emails)
    ? emails
        .map((e) => (typeof e === "string" ? e.trim().toLowerCase() : ""))
        .filter(Boolean)
        .map((email) => email.replace(/[^a-z0-9@._+-]/g, "_"))
        .slice(0, 200)
    : [];

  const targets = Array.from(new Set([...normalizedIds, ...normalizedFromEmails]));
  if (targets.length === 0) return res.status(400).json({ error: "ids or emails is required" });

  try {
    let deleted = 0;
    // Batch deletes in chunks of 400 (Firestore limit is 500 ops, keep headroom)
    for (let i = 0; i < targets.length; i += 400) {
      const chunk = targets.slice(i, i + 400);
      const batch = db.batch();
      for (const id of chunk) {
        batch.delete(db.collection("waitlist_requests").doc(id));
      }
      await batch.commit();
      deleted += chunk.length;
    }

    return res.status(200).json({ success: true, deleted });
  } catch (e: any) {
    console.error("adminDeleteWaitlist error:", e);
    return res.status(500).json({ error: "Failed to delete waitlist entries" });
  }
}


