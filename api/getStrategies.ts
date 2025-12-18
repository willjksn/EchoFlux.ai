// api/getStrategies.ts
// Fetch saved strategies from Firestore
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";

// Dynamic import to prevent initialization errors
let getAdminDb: any;

async function getAdminDbFunction() {
  if (!getAdminDb) {
    try {
      const module = await import("./_firebaseAdmin.js");
      getAdminDb = module.getAdminDb;
    } catch (importError: any) {
      console.error("Failed to import _firebaseAdmin:", importError);
      throw new Error(`Failed to load Firebase Admin module: ${importError?.message || String(importError)}`);
    }
  }
  return getAdminDb;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const user = await verifyAuth(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const getDb = await getAdminDbFunction();
      const db = getDb();
      const strategiesSnapshot = await db
        .collection("users")
        .doc(user.uid)
        .collection("strategies")
        .orderBy("createdAt", "desc")
        .get();

      const strategies = strategiesSnapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...(doc.data() as any)
      }));

      res.status(200).json({
        success: true,
        strategies
      });
      return;
    } catch (dbError: any) {
      console.error("Database error:", dbError);
      res.status(200).json({
        success: false,
        error: "Database error",
        note: "Failed to fetch strategies. Please try again.",
        strategies: [],
        details: process.env.NODE_ENV === "development" ? dbError?.message : undefined
      });
      return;
    }
  } catch (err: any) {
    console.error("getStrategies error:", err);
    res.status(200).json({
      success: false,
      error: "Failed to fetch strategies",
      note: err?.message || "An unexpected error occurred. Please try again.",
      strategies: [],
      details: process.env.NODE_ENV === "development" ? err?.stack : undefined
    });
    return;
  }
}

