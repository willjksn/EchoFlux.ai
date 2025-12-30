import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  const adminDoc = await db.collection("users").doc(user.uid).get();
  if ((adminDoc.data() as any)?.role !== "Admin") return res.status(403).json({ error: "Admin access required" });

  const status = (req.query.status as string | undefined) || "pending";

  try {
    // NOTE: A Firestore query with `.where('status', '==', ...)` + `.orderBy('createdAt', 'desc')`
    // requires a composite index. To avoid operational friction during early testing,
    // we instead order by createdAt and filter in-memory.
    const normalizedStatus = status === "approved" || status === "rejected" || status === "pending" ? status : "pending";
    const snap = await db.collection("waitlist_requests").orderBy("createdAt", "desc").limit(500).get();

    const items = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((it) => (it as any)?.status === normalizedStatus);
    return res.status(200).json({ success: true, items });
  } catch (e: any) {
    console.error("adminListWaitlist error:", e);
    return res.status(500).json({ error: "Failed to list waitlist" });
  }
}


