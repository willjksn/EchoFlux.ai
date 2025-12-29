import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

/**
 * Generate invite codes (admin only)
 * Only admins can generate invite codes
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
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

    const { count = 1, maxUses = 1, expiresInDays, expiresAt, grantPlan } = (req.body || {}) as {
      count?: number;
      maxUses?: number;
      expiresInDays?: number;
      expiresAt?: string | null;
      grantPlan?: "Free" | "Pro" | "Elite";
    };

    // Validate inputs
    if (count < 1 || count > 100) {
      return res.status(400).json({ error: "Count must be between 1 and 100" });
    }

    if (maxUses < 1 || maxUses > 100) {
      return res.status(400).json({ error: "maxUses must be between 1 and 100" });
    }

    if (grantPlan !== "Free" && grantPlan !== "Pro" && grantPlan !== "Elite") {
      return res.status(400).json({ error: "grantPlan must be 'Free', 'Pro' or 'Elite'" });
    }

    // Generate invite codes
    const codes: string[] = [];
    const batch = db.batch();

    // Normalize explicit expiresAt if provided
    let normalizedExpiresAt: string | null = null;
    if (typeof expiresAt === "string" && expiresAt.trim()) {
      const d = new Date(expiresAt);
      if (!Number.isFinite(d.getTime())) {
        return res.status(400).json({ error: "expiresAt must be a valid ISO date string" });
      }
      normalizedExpiresAt = d.toISOString();
    }

    for (let i = 0; i < count; i++) {
      // Generate a random 8-character alphanumeric code
      const code = generateInviteCode();
      codes.push(code);

      const inviteRef = db.collection("beta_invites").doc(code);
      const inviteData: any = {
        code,
        createdAt: new Date().toISOString(),
        createdBy: user.uid,
        used: false,
        usedCount: 0,
        maxUses,
        grantPlan,
      };

      // Add expiration if specified
      if (normalizedExpiresAt) {
        inviteData.expiresAt = normalizedExpiresAt;
      } else if (expiresInDays && expiresInDays > 0) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);
        inviteData.expiresAt = expiresAt.toISOString();
      }

      batch.set(inviteRef, inviteData);
    }

    await batch.commit();

    return res.status(200).json({
      success: true,
      codes,
      count: codes.length,
      maxUses,
      grantPlan,
      expiresAt: normalizedExpiresAt,
      expiresInDays: expiresInDays || null,
      message: `Generated ${codes.length} invite code${codes.length > 1 ? "s" : ""}`,
    });
  } catch (error: any) {
    console.error("Error generating invite codes:", error);
    return res.status(500).json({
      error: "Failed to generate invite codes",
      message: error?.message || "An unexpected error occurred",
    });
  }
}

/**
 * Generate a random 8-character alphanumeric invite code
 * Format: XXXX-XXXX (e.g., A1B2-C3D4)
 */
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed confusing chars (0, O, I, 1)
  const segments = [4, 4]; // Two segments of 4 characters
  const code = segments
    .map((length) => {
      let segment = "";
      for (let i = 0; i < length; i++) {
        segment += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return segment;
    })
    .join("-");
  return code;
}

