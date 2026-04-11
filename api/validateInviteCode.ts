import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { verifyAuth } from "./verifyAuth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    (req.headers["x-real-ip"] as string | undefined) ||
    "anonymous";

  // Rate limit: 10 requests / minute per IP
  const ok = await enforceRateLimit({
    req,
    res,
    keyPrefix: "validateInviteCode",
    limit: 10,
    windowMs: 60 * 1000,
    identifier: ip,
  });
  if (!ok) return;

  const authUser = await verifyAuth(req);

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
    if (grantPlan !== "Pro" && grantPlan !== "Elite" && grantPlan !== "CreatorChoice") {
      return res.status(200).json({
        valid: false,
        error: "This invite code is not configured with access. Please contact support.",
      });
    }
    
    // Expiry first (applies even if the code was redeemed)
    if (inviteData?.expiresAt) {
      const expiresAt = inviteData.expiresAt.toDate ? inviteData.expiresAt.toDate() : new Date(inviteData.expiresAt);
      if (expiresAt < new Date()) {
        return res.status(200).json({
          valid: false,
          error: "This invite code has expired.",
        });
      }
    }

    const maxUses = typeof inviteData?.maxUses === "number" ? inviteData.maxUses : 1;
    const usedCount = typeof inviteData?.usedCount === "number" ? inviteData.usedCount : 0;
    const usedByUid = typeof (inviteData as any)?.usedBy === "string" ? (inviteData as any).usedBy : "";
    const isExhausted = inviteData?.used === true || usedCount >= maxUses;

    // Single-use (or max reached): still valid for the account that already redeemed (CreatorChoice checkout, retries, re-validation).
    if (isExhausted) {
      if (authUser?.uid && usedByUid && authUser.uid === usedByUid) {
        const expiresAtIso = inviteData?.expiresAt
          ? (inviteData.expiresAt.toDate ? inviteData.expiresAt.toDate() : new Date(inviteData.expiresAt)).toISOString()
          : null;
        return res.status(200).json({
          valid: true,
          code: normalizedCode,
          grantPlan,
          creatorChoice: grantPlan === "CreatorChoice",
          expiresAt: expiresAtIso,
          message: "Invite already applied to your account.",
          redeemedByYou: true,
        });
      }
      return res.status(200).json({
        valid: false,
        error: "This invite code has already been used.",
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
      /** When grantPlan is CreatorChoice, user picks CreatorPro ($1) or CreatorElite ($2) after signup. */
      creatorChoice: grantPlan === "CreatorChoice",
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

