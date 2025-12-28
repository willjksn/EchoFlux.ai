// api/saveStrategy.ts
// Save a generated strategy to Firestore
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await verifyAuth(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { strategy, name, goal, niche, audience, tone, duration, platformFocus } = req.body || {};

    if (!strategy || !name) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        note: "strategy and name are required"
      });
    }

    try {
      const getDb = await getAdminDbFunction();
      const db = getDb();
      const strategyId = `strategy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const nowIso = new Date().toISOString();

      // Ensure only ONE active strategy per user.
      // This prevents older opportunity-based strategies from reloading after a user generates a new one.
      try {
        const activeSnap = await db
          .collection("users")
          .doc(user.uid)
          .collection("strategies")
          .where("status", "==", "active")
          .get();

        if (!activeSnap.empty) {
          const batch = db.batch();
          activeSnap.docs.forEach((d: any) => {
            batch.set(d.ref, { status: "archived", updatedAt: nowIso }, { merge: true });
          });
          await batch.commit();
        }
      } catch (archiveErr: any) {
        // Don't fail saving if archival fails; still continue to write the new strategy.
        console.error("Failed to archive existing active strategies:", archiveErr);
      }
      
      const strategyData = {
        id: strategyId,
        name,
        goal: goal || "Content Strategy",
        niche: niche || "",
        audience: audience || "",
        tone: tone || undefined,
        duration: duration || undefined,
        platformFocus: platformFocus || undefined,
        plan: strategy,
        createdAt: nowIso,
        status: "active", // active, completed, archived
        userId: user.uid,
      };

      await db.collection("users").doc(user.uid).collection("strategies").doc(strategyId).set(strategyData);

      return res.status(200).json({
        success: true,
        strategyId,
        message: "Strategy saved successfully"
      });
    } catch (dbError: any) {
      console.error("Database error:", dbError);
      return res.status(200).json({
        success: false,
        error: "Database error",
        note: "Failed to save strategy. Please try again.",
        details: process.env.NODE_ENV === "development" ? dbError?.message : undefined
      });
    }
  } catch (err: any) {
    console.error("saveStrategy error:", err);
    return res.status(200).json({
      success: false,
      error: "Failed to save strategy",
      note: err?.message || "An unexpected error occurred. Please try again.",
      details: process.env.NODE_ENV === "development" ? err?.stack : undefined
    });
  }
}

