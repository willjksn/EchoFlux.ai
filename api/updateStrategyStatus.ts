// api/updateStrategyStatus.ts
// Update strategy status (active, completed, archived) or link to posts
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

    const { strategyId, status, linkedPostIds, metrics } = req.body || {};

    if (!strategyId) {
      return res.status(400).json({
        success: false,
        error: "Missing required field",
        note: "strategyId is required"
      });
    }

    try {
      const db = getAdminDbFunction();
      const updateData: any = {};

      if (status) {
        updateData.status = status; // active, completed, archived
      }

      if (linkedPostIds && Array.isArray(linkedPostIds)) {
        updateData.linkedPostIds = linkedPostIds;
      }

      if (metrics) {
        updateData.metrics = metrics;
        updateData.lastMetricsUpdate = new Date().toISOString();
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          success: false,
          error: "No update data provided",
          note: "Provide status, linkedPostIds, or metrics to update"
        });
      }

      await db
        .collection("users")
        .doc(user.uid)
        .collection("strategies")
        .doc(strategyId)
        .update(updateData);

      return res.status(200).json({
        success: true,
        message: "Strategy updated successfully"
      });
    } catch (dbError: any) {
      console.error("Database error:", dbError);
      return res.status(200).json({
        success: false,
        error: "Database error",
        note: "Failed to update strategy. Please try again.",
        details: process.env.NODE_ENV === "development" ? dbError?.message : undefined
      });
    }
  } catch (err: any) {
    console.error("updateStrategyStatus error:", err);
    return res.status(200).json({
      success: false,
      error: "Failed to update strategy",
      note: err?.message || "An unexpected error occurred. Please try again.",
      details: process.env.NODE_ENV === "development" ? err?.stack : undefined
    });
  }
}

