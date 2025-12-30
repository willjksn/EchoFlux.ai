import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

/**
 * Get email history with filtering by category
 * Admin-only endpoint
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const admin = await verifyAuth(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  const adminDoc = await db.collection("users").doc(admin.uid).get();
  if ((adminDoc.data() as any)?.role !== "Admin") return res.status(403).json({ error: "Admin access required" });

  const { category, limit = "100" } = req.query as { category?: string; limit?: string };

  try {
    let query: FirebaseFirestore.Query = db.collection("email_history").orderBy("sentAt", "desc");

    if (category && typeof category === "string" && ["waitlist", "mass", "scheduled", "template", "other"].includes(category)) {
      query = query.where("category", "==", category);
    }

    const limitNum = Math.min(parseInt(limit, 10) || 100, 500); // Max 500

    let snapshot: FirebaseFirestore.QuerySnapshot;
    try {
      snapshot = await query.limit(limitNum).get();
    } catch (e: any) {
      // Most common: Firestore requires a composite index for (category == X) + orderBy(sentAt).
      // Fallback: fetch latest N and filter in-memory.
      console.warn("getEmailHistory primary query failed; falling back to in-memory filter:", {
        message: e?.message,
        code: e?.code,
      });

      const baseSnap = await db.collection("email_history").orderBy("sentAt", "desc").limit(limitNum).get();
      if (category && typeof category === "string" && ["waitlist", "mass", "scheduled", "template", "other"].includes(category)) {
        const filteredDocs = baseSnap.docs.filter((d) => (d.data() as any)?.category === category);
        snapshot = {
          docs: filteredDocs,
          size: filteredDocs.length,
          empty: filteredDocs.length === 0,
          forEach: (cb: any) => filteredDocs.forEach(cb),
        } as any;
      } else {
        snapshot = baseSnap;
      }
    }

    const history = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        sentAt: data.sentAt,
        sentBy: data.sentBy || null,
        to: data.to,
        subject: data.subject,
        body: data.body,
        html: data.html,
        status: data.status,
        provider: data.provider,
        error: data.error,
        category: data.category,
        metadata: data.metadata || {},
      };
    });

    return res.status(200).json({ success: true, history });
  } catch (e: any) {
    console.error("getEmailHistory error:", e);
    return res.status(500).json({
      error: "Failed to fetch email history",
      // Helpful for debugging in early stage; still safe because only Admins can call this endpoint.
      details: e?.message || String(e),
    });
  }
}

