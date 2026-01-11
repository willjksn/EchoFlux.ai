import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

type Source = "feedback" | "contact";
type AdminStatus = "open" | "done";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await verifyAuth(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  const adminDoc = await db.collection("users").doc(admin.uid).get();
  if ((adminDoc.data() as any)?.role !== "Admin") return res.status(403).json({ error: "Admin access required" });

  const { source, id, adminStatus } = (req.body || {}) as {
    source?: Source;
    id?: string;
    adminStatus?: AdminStatus;
  };

  if (!source || (source !== "feedback" && source !== "contact")) {
    return res.status(400).json({ error: "source must be 'feedback' or 'contact'" });
  }
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "id is required" });
  }
  if (!adminStatus || (adminStatus !== "open" && adminStatus !== "done")) {
    return res.status(400).json({ error: "adminStatus must be 'open' or 'done'" });
  }

  const collection = source === "feedback" ? "feedback_submissions" : "contact_submissions";

  try {
    await db.collection(collection).doc(id).set(
      {
        adminStatus,
        adminLastTouchedAt: new Date().toISOString(),
        adminLastTouchedBy: admin.uid,
      } as any,
      { merge: true }
    );

    return res.status(200).json({ success: true });
  } catch (e: any) {
    console.error("adminUpdateSupportInboxItem error:", e);
    return res.status(500).json({ error: "Failed to update inbox item", details: e?.message || String(e) });
  }
}


