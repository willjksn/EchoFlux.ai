import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";

/**
 * Redeem an invite code to grant access (Pro/Elite) without Stripe.
 * - Requires the user to be authenticated (Firebase ID token)
 * - Validates invite (exists, not expired, not fully used)
 * - Marks invite as used (increment usedCount; set used=true if max reached)
 * - Sets user plan + invite grant metadata on the user's Firestore doc
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await verifyAuth(req);
  if (!user?.uid) return res.status(401).json({ error: "Unauthorized" });

  const { inviteCode, fullName } = (req.body || {}) as { inviteCode?: string; fullName?: string };
  if (!inviteCode || typeof inviteCode !== "string" || !inviteCode.trim()) {
    return res.status(400).json({ error: "Invite code is required" });
  }

  const normalizedCode = inviteCode.trim().toUpperCase();

  try {
    const db = getAdminDb();
    const inviteRef = db.collection("beta_invites").doc(normalizedCode);
    const userRef = db.collection("users").doc(user.uid);
    const nowIso = new Date().toISOString();

    const result = await db.runTransaction(async (tx) => {
      const inviteSnap = await tx.get(inviteRef);
      const userSnap = await tx.get(userRef);
      if (!inviteSnap.exists) {
        return { ok: false as const, status: 404 as const, error: "Invite code not found" };
      }

      const inviteData = inviteSnap.data() as any;
      const grantPlan = inviteData?.grantPlan as string | undefined;
      if (grantPlan !== "Free" && grantPlan !== "Pro" && grantPlan !== "Elite") {
        return { ok: false as const, status: 400 as const, error: "Invite is not configured with access" };
      }

      const existingUserData = userSnap.exists ? (userSnap.data() as any) : null;
      const alreadyRedeemedThisCode =
        existingUserData?.invitedWithCode === normalizedCode ||
        existingUserData?.inviteGrantRedeemedAt ||
        existingUserData?.subscriptionStatus === "invite_grant";

      // Expiry check
      const expiresAtIso = inviteData?.expiresAt
        ? (inviteData.expiresAt.toDate ? inviteData.expiresAt.toDate() : new Date(inviteData.expiresAt)).toISOString()
        : null;
      if (expiresAtIso && new Date(expiresAtIso).getTime() < Date.now()) {
        return { ok: false as const, status: 400 as const, error: "Invite code has expired" };
      }

      // Usage check
      const maxUses = typeof inviteData?.maxUses === "number" ? inviteData.maxUses : 1;
      const usedCount = typeof inviteData?.usedCount === "number" ? inviteData.usedCount : 0;
      const isFullyUsed = inviteData?.used === true || usedCount >= maxUses;
      // Idempotency: if the current user already redeemed this code, treat as success even if fully used.
      if (isFullyUsed && !alreadyRedeemedThisCode && inviteData?.usedBy !== user.uid) {
        return { ok: false as const, status: 400 as const, error: "Invite code has already been used" };
      }

      // Mark invite usage (only if this user hasn't redeemed it yet)
      if (!alreadyRedeemedThisCode) {
        const nextUsedCount = usedCount + 1;
        tx.update(inviteRef, {
          usedCount: FieldValue.increment(1),
          usedBy: user.uid,
          usedAt: nowIso,
          used: nextUsedCount >= maxUses,
        });
      }

      // Grant access on user doc
      // If user doesn't exist, create with all required fields
      // If user exists, merge invite grant fields
      const isNewUser = !userSnap.exists;
      const userData: any = {
        id: user.uid,
        email: user.email || "",
        name: typeof fullName === "string" && fullName.trim() ? fullName.trim() : (existingUserData?.name || "New User"),
        userType: "Creator",
        plan: grantPlan,
        role: existingUserData?.role || "User",
        hasCompletedOnboarding: existingUserData?.hasCompletedOnboarding || false,
        // Invite grant metadata
        invitedWithCode: normalizedCode,
        invitedAt: nowIso,
        inviteGrantPlan: grantPlan,
        inviteGrantExpiresAt: expiresAtIso,
        inviteGrantRedeemedAt: nowIso,
        // Marker so UI can treat as grant (not Stripe subscription)
        subscriptionStatus: "invite_grant",
      };

      // For new users, include all required fields
      if (isNewUser) {
        userData.signupDate = nowIso;
        userData.avatar = `https://picsum.photos/seed/${user.uid}/100/100`;
        userData.bio = "Welcome to EchoFlux.ai!";
        userData.notifications = {
          newMessages: true,
          weeklySummary: false,
          trendAlerts: false,
        };
        userData.monthlyCaptionGenerationsUsed = 0;
        userData.monthlyImageGenerationsUsed = 0;
        userData.monthlyVideoGenerationsUsed = 0;
        userData.monthlyRepliesUsed = 0;
        userData.storageUsed = 0;
        userData.storageLimit = 100;
        userData.mediaLibrary = [];
        userData.settings = {
          autoReply: true,
          autoRespond: false,
          safeMode: true,
          highQuality: false,
          tone: {
            formality: 50,
            humor: 30,
            empathy: 70,
            spiciness: 0,
          },
          voiceMode: true,
          prioritizedKeywords: 'collaboration, pricing, question',
          ignoredKeywords: 'spam, giveaway, follow back',
          connectedAccounts: {
            Instagram: true,
            TikTok: true,
            X: true,
            Threads: true,
            YouTube: false,
            LinkedIn: true,
            Facebook: true,
          },
        };
      }

      tx.set(userRef, userData, { merge: true });

      return {
        ok: true as const,
        grantPlan,
        expiresAt: expiresAtIso,
      };
    });

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(200).json({
      success: true,
      code: normalizedCode,
      grantPlan: result.grantPlan,
      expiresAt: result.expiresAt,
    });
  } catch (error: any) {
    console.error("Error redeeming invite code:", error);
    return res.status(500).json({ error: "Failed to redeem invite code", message: error?.message || "Unknown error" });
  }
}


