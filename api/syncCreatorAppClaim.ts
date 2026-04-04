import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminApp, getAdminDb } from "./_firebaseAdmin.js";
import { applyCreatorAppClaim } from "./_creatorAppClaim.js";

/**
 * POST — Recompute `creatorApp` custom claim from Firestore (users + creators/{uid}).
 * Caller must refresh ID token after success to see updated claims.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const decoded = await verifyAuth(req);
    if (!decoded?.uid) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const db = getAdminDb();
    const adminAuth = getAdminApp().auth();
    const creatorApp = await applyCreatorAppClaim(db, adminAuth, decoded.uid);

    return res.status(200).json({ success: true, creatorApp });
  } catch (e: unknown) {
    console.error("syncCreatorAppClaim:", e);
    return res.status(500).json({
      error: "Failed to sync creator app claim",
      message: e instanceof Error ? e.message : String(e),
    });
  }
}
