import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, getVerifyAuth } from "./_errorHandler.js";
import { getAdminDb, getAdminApp } from "./_firebaseAdmin.js";
import { sendEmail } from "./_mailer.js";

function passwordResetEmail(name: string | null, resetLink: string): string {
  const displayName = name?.trim() || "there";
  return `Hi ${displayName},

You requested a password reset for your EchoFlux.ai account. Click the link below to set a new password:

${resetLink}

This link expires in 1 hour. If you didn't request this, you can safely ignore this email.

— The EchoFlux Team`;
}

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

  if (adminData?.role !== "Admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const { userId } = (req.body as any) || {};

  if (!userId || typeof userId !== "string") {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  try {
    const adminApp = getAdminApp();
    const auth = adminApp.auth();

    const userRecord = await auth.getUser(userId);
    const email = userRecord.email;
    if (!email) {
      res.status(400).json({ error: "User has no email address" });
      return;
    }

    const resetLink = await auth.generatePasswordResetLink(email);

    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();
    const name = (userData as any)?.name || null;

    const mail = await sendEmail({
      to: email,
      subject: "Reset your EchoFlux.ai password",
      text: passwordResetEmail(name, resetLink),
    });

    res.status(200).json({
      success: true,
      userId,
      email,
      emailSent: mail.sent === true,
    });
    return;
  } catch (error: any) {
    if (error?.code === "auth/user-not-found") {
      res.status(404).json({ error: "User not found" });
      return;
    }
    console.error("adminSendPasswordReset error:", error);
    res.status(500).json({
      error: "Failed to send password reset email",
      details: process.env.NODE_ENV === "development" ? error?.message : undefined,
    });
    return;
  }
}

export default withErrorHandling(handler);
