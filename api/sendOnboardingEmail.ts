import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { sendEmail } from "./_mailer.js";
import { WAITLIST_EMAIL_TEMPLATES } from "./_waitlistEmailTemplates.js";

/**
 * Send first-login onboarding email to a user
 * Admin-only endpoint
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await verifyAuth(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  const adminDoc = await db.collection("users").doc(admin.uid).get();
  if ((adminDoc.data() as any)?.role !== "Admin") return res.status(403).json({ error: "Admin access required" });

  const { email, name } = (req.body || {}) as {
    email?: string;
    name?: string | null;
  };

  if (!email || typeof email !== "string") return res.status(400).json({ error: "email is required" });

  const normalizedEmail = email.trim().toLowerCase();
  const nowIso = new Date().toISOString();

  try {
    const emailText = WAITLIST_EMAIL_TEMPLATES.firstLoginOnboarding(name || null);

    const mail = await sendEmail({
      to: normalizedEmail,
      subject: "Welcome to EchoFlux.ai — Early Testing Access",
      text: emailText,
    });

    // Optionally track in waitlist_requests if the user exists there
    const waitlistId = normalizedEmail.replace(/[^a-z0-9@._+-]/g, "_");
    const waitRef = db.collection("waitlist_requests").doc(waitlistId);
    const waitSnap = await waitRef.get();
    
    if (waitSnap.exists) {
      await waitRef.set(
        {
          lastEmailedAt: nowIso,
          emailStatus: mail.sent ? "sent" : "failed",
          onboardingEmailSent: true,
          onboardingEmailSentAt: nowIso,
          ...(mail.sent ? {} : { emailError: (mail as any)?.error || (mail as any)?.reason || "Email send failed" }),
        } as any,
        { merge: true }
      );
    }

    return res.status(200).json({
      success: true,
      emailSent: mail.sent === true,
      emailPreview: mail.sent ? null : emailText,
      emailError: mail.sent ? null : ((mail as any)?.error || (mail as any)?.reason || null),
      emailProvider: (mail as any)?.provider ?? null,
    });
  } catch (e: any) {
    console.error("sendOnboardingEmail error:", e);
    return res.status(500).json({ error: "Failed to send onboarding email" });
  }
}

