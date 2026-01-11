import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const authed = await verifyAuth(req);
  if (!authed?.uid) return res.status(401).json({ error: "Unauthorized" });

  // Check if user is admin
  const db = getAdminDb();
  const userDoc = await db.collection("users").doc(authed.uid).get();
  const userData = userDoc.exists ? (userDoc.data() as any) : null;
  
  if (userData?.role !== "Admin") {
    return res.status(403).json({ error: "Admin access required" });
  }

  try {
    const formsSnap = await db.collection("feedback_forms")
      .orderBy("createdAt", "desc")
      .get();

    const forms = formsSnap.docs.map(doc => ({
      id: doc.id,
      ...(doc.data() as any),
    }));

    return res.status(200).json({
      success: true,
      forms,
    });
  } catch (e: any) {
    console.error("adminGetFeedbackForms error:", e);
    return res.status(500).json({ error: "Failed to fetch feedback forms" });
  }
}

