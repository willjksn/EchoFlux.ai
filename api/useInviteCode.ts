import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

/**
 * Mark an invite code as used when a user signs up
 * Called after successful account creation
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

    const { inviteCode } = (req.body || {}) as { inviteCode?: string };

    if (!inviteCode || typeof inviteCode !== "string") {
      return res.status(400).json({ error: "Invite code is required" });
    }

    const db = getAdminDb();
    const normalizedCode = inviteCode.trim().toUpperCase();
    
    // Check if invite code exists
    const inviteRef = db.collection("beta_invites").doc(normalizedCode);
    const inviteDoc = await inviteRef.get();

    if (!inviteDoc.exists) {
      return res.status(404).json({ error: "Invite code not found" });
    }

    const inviteData = inviteDoc.data();

    // Check if already used (and maxUses reached)
    if (inviteData?.used === true && (!inviteData?.maxUses || inviteData.usedCount >= inviteData.maxUses)) {
      return res.status(400).json({ error: "Invite code has already been used" });
    }

    // Check expiration
    if (inviteData?.expiresAt) {
      const expiresAt = inviteData.expiresAt.toDate ? inviteData.expiresAt.toDate() : new Date(inviteData.expiresAt);
      if (expiresAt < new Date()) {
        return res.status(400).json({ error: "Invite code has expired" });
      }
    }

    // Update invite code usage
    const updates: any = {
      usedBy: user.uid,
      usedAt: new Date().toISOString(),
      usedCount: (inviteData?.usedCount || 0) + 1,
    };

    // Mark as fully used if maxUses reached
    if (inviteData?.maxUses && updates.usedCount >= inviteData.maxUses) {
      updates.used = true;
    } else if (!inviteData?.maxUses) {
      // If no maxUses, mark as used (single-use)
      updates.used = true;
    }

    await inviteRef.update(updates);

    // Also mark user as invited in their user document
    await db.collection("users").doc(user.uid).update({
      invitedWithCode: normalizedCode,
      invitedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      message: "Invite code marked as used",
    });
  } catch (error: any) {
    console.error("Error using invite code:", error);
    return res.status(500).json({
      error: "Failed to use invite code",
      message: error?.message || "An unexpected error occurred",
    });
  }
}

