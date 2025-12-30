import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

/**
 * Creator endpoint: fetch your own bio page email subscribers.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const user = await verifyAuth(req);
  if (!user?.uid) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();

  try {
    // Prefer indexed query
    try {
      const snap = await db
        .collection("bio_page_email_captures")
        .where("creatorUid", "==", user.uid)
        .orderBy("capturedAt", "desc")
        .limit(2000)
        .get();

      const subscribers = snap.docs.map((d) => {
        const data = d.data() as any;
        return { id: d.id, email: data.email, capturedAt: data.capturedAt };
      });
      return res.status(200).json({ success: true, subscribers });
    } catch (indexError: any) {
      // Fallback without orderBy (in-memory sort) if index missing
      console.warn("getMyBioPageSubscribers fallback (missing index?)", indexError?.message || indexError);
      const snap = await db
        .collection("bio_page_email_captures")
        .where("creatorUid", "==", user.uid)
        .limit(2000)
        .get();

      const subscribers = snap.docs
        .map((d) => {
          const data = d.data() as any;
          return { id: d.id, email: data.email, capturedAt: data.capturedAt };
        })
        .sort((a, b) => String(b.capturedAt || "").localeCompare(String(a.capturedAt || "")));

      return res.status(200).json({ success: true, subscribers });
    }
  } catch (e: any) {
    console.error("getMyBioPageSubscribers error:", e);
    return res.status(500).json({ error: "Failed to fetch subscribers" });
  }
}


