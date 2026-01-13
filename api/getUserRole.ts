import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await verifyAuth(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const db = getAdminDb();
    const userDoc = await db.collection("users").doc(user.uid).get();
    const userData = userDoc.exists ? (userDoc.data() as any) : null;
    const role = userData?.role || null;

    return res.status(200).json({ success: true, role });
  } catch (error: any) {
    console.error("getUserRole error:", error);
    return res.status(500).json({ error: "Failed to get user role", details: error?.message || String(error) });
  }
}
