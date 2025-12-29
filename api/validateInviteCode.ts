import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { inviteCode } = (req.body || {}) as { inviteCode?: string };

  if (!inviteCode || typeof inviteCode !== "string" || inviteCode.trim() === "") {
    return res.status(400).json({ 
      error: "Invalid invite code",
      valid: false 
    });
  }

  try {
    const db = getAdminDb();
    const normalizedCode = inviteCode.trim().toUpperCase();
    
    // Check if invite code exists
    const inviteRef = db.collection("beta_invites").doc(normalizedCode);
    const inviteDoc = await inviteRef.get();

    if (!inviteDoc.exists) {
      return res.status(200).json({
        valid: false,
        error: "Invalid invite code. Please check and try again.",
      });
    }

    const inviteData = inviteDoc.data();

    // Ensure invite has a plan grant configured
    const grantPlan = (inviteData as any)?.grantPlan as string | undefined;
    if (grantPlan !== "Pro" && grantPlan !== "Elite") {
      return res.status(200).json({
        valid: false,
        error: "This invite code is not configured with access. Please contact support.",
      });
    }
    
    // Check if invite is already used
    if (inviteData?.used === true) {
      return res.status(200).json({
        valid: false,
        error: "This invite code has already been used.",
      });
    }

    // Check if invite has expired (optional - if expiresAt field exists)
    if (inviteData?.expiresAt) {
      const expiresAt = inviteData.expiresAt.toDate ? inviteData.expiresAt.toDate() : new Date(inviteData.expiresAt);
      if (expiresAt < new Date()) {
        return res.status(200).json({
          valid: false,
          error: "This invite code has expired.",
        });
      }
    }

    // Check if invite has reached max uses (if maxUses field exists)
    if (inviteData?.maxUses && inviteData?.usedCount >= inviteData.maxUses) {
      return res.status(200).json({
        valid: false,
        error: "This invite code has reached its usage limit.",
      });
    }

    // Invite is valid
    const expiresAtIso = inviteData?.expiresAt
      ? (inviteData.expiresAt.toDate ? inviteData.expiresAt.toDate() : new Date(inviteData.expiresAt)).toISOString()
      : null;
    return res.status(200).json({
      valid: true,
      code: normalizedCode,
      grantPlan,
      expiresAt: expiresAtIso,
      message: "Invite code is valid!",
    });
  } catch (error: any) {
    console.error("Error validating invite code:", error);
    return res.status(500).json({
      error: "Failed to validate invite code",
      valid: false,
      message: error?.message || "An unexpected error occurred",
    });
  }
}

