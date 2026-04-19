import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, getVerifyAuth } from "./_errorHandler.js";
import { getAdminDb, getAdminApp } from "./_firebaseAdmin.js";
import { hasPlatformAdminAccess } from "./_platformAdminAccess.js";

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const verifyAuth = await getVerifyAuth();
  const adminUser = await verifyAuth(req);

  if (!adminUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const db = getAdminDb();
  const adminDoc = await db.collection("users").doc(adminUser.uid).get();
  const adminData = adminDoc.data();

  if (!hasPlatformAdminAccess(adminData as Record<string, unknown> | undefined)) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const { userId, newPassword } = (req.body as any) || {};

  if (!userId || typeof userId !== "string") {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  if (!newPassword || typeof newPassword !== "string") {
    res.status(400).json({ error: "newPassword is required" });
    return;
  }

  if (newPassword.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }
  if (!/[^A-Za-z0-9]/.test(newPassword)) {
    res.status(400).json({ error: "Password must include at least one special character (example: !@#$%)" });
    return;
  }

  try {
    const adminApp = getAdminApp();
    const auth = adminApp.auth();

    await auth.updateUser(userId, { password: newPassword });

    res.status(200).json({
      success: true,
      userId,
    });
    return;
  } catch (error: any) {
    if (error?.code === "auth/user-not-found") {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (error?.code === "auth/weak-password") {
      res.status(400).json({ error: "Password is too weak (minimum 6 characters and include a symbol)" });
      return;
    }
    if (String(error?.message || "").includes("PASSWORD_DOES_NOT_MEET_REQUIREMENTS")) {
      res.status(400).json({ error: "Password does not meet Firebase policy (must include a non-alphanumeric character)." });
      return;
    }
    console.error("adminUpdateUserPassword error:", error);
    res.status(500).json({
      error: "Failed to update password",
      details: process.env.NODE_ENV === "development" ? error?.message : undefined,
    });
    return;
  }
}

export default withErrorHandling(handler);
