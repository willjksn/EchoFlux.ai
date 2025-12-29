import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

/**
 * List all invite codes (admin only)
 * Shows usage stats and status
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Verify authentication
    const user = await verifyAuth(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Verify admin role
    const db = getAdminDb();
    const adminDoc = await db.collection("users").doc(user.uid).get();
    const adminData = adminDoc.data();

    if (adminData?.role !== "Admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    // Get all invite codes
    const invitesSnapshot = await db.collection("beta_invites").orderBy("createdAt", "desc").get();

    const invites = invitesSnapshot.docs.map((doc) => {
      const data = doc.data();
      const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : data.expiresAt ? new Date(data.expiresAt) : null;
      
      return {
        code: doc.id,
        createdAt: data.createdAt,
        createdBy: data.createdBy,
        grantPlan: (data as any)?.grantPlan || null,
        used: data.used || false,
        usedCount: data.usedCount || 0,
        maxUses: data.maxUses || 1,
        usedBy: data.usedBy || null,
        usedAt: data.usedAt || null,
        expiresAt: expiresAt?.toISOString() || null,
        isExpired: expiresAt ? expiresAt < new Date() : false,
        isFullyUsed: data.used === true || (data.maxUses && (data.usedCount || 0) >= data.maxUses),
      };
    });

    // Calculate stats
    const stats = {
      total: invites.length,
      used: invites.filter((inv) => inv.isFullyUsed).length,
      available: invites.filter((inv) => !inv.isFullyUsed && !inv.isExpired).length,
      expired: invites.filter((inv) => inv.isExpired && !inv.isFullyUsed).length,
    };

    return res.status(200).json({
      success: true,
      invites,
      stats,
    });
  } catch (error: any) {
    console.error("Error listing invite codes:", error);
    return res.status(500).json({
      error: "Failed to list invite codes",
      message: error?.message || "An unexpected error occurred",
    });
  }
}

