import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { sendEmail } from "./_mailer.js";
import { WAITLIST_EMAIL_TEMPLATES } from "./_waitlistEmailTemplates.js";

/**
 * Send feedback request email to a user or multiple users
 * Admin-only endpoint
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await verifyAuth(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  const adminDoc = await db.collection("users").doc(admin.uid).get();
  if ((adminDoc.data() as any)?.role !== "Admin") return res.status(403).json({ error: "Admin access required" });

  const { email, emails, name } = (req.body || {}) as {
    email?: string;
    emails?: string[];
    name?: string | null;
  };

  // Support both single email and bulk emails
  const emailList: string[] = [];
  if (email && typeof email === "string") {
    emailList.push(email);
  }
  if (emails && Array.isArray(emails)) {
    emailList.push(...emails.filter((e) => typeof e === "string"));
  }

  if (emailList.length === 0) {
    return res.status(400).json({ error: "email or emails array is required" });
  }

  const nowIso = new Date().toISOString();
  const results: Array<{
    email: string;
    sent: boolean;
    error?: string;
  }> = [];

  try {
    for (const emailAddr of emailList) {
      const normalizedEmail = emailAddr.trim().toLowerCase();
      
      try {
        // Try to get name from waitlist if available
        const waitlistId = normalizedEmail.replace(/[^a-z0-9@._+-]/g, "_");
        const waitRef = db.collection("waitlist_requests").doc(waitlistId);
        const waitSnap = await waitRef.get();
        const waitlistData = waitSnap.exists ? (waitSnap.data() as any) : null;
        const userName = name || waitlistData?.name || null;

        const emailText = WAITLIST_EMAIL_TEMPLATES.feedbackRequest(userName);

        const mail = await sendEmail({
          to: normalizedEmail,
          subject: "Your EchoFlux Feedback is Valuable",
          text: emailText,
        });

        // Update waitlist entry if it exists
        if (waitSnap.exists) {
          await waitRef.set(
            {
              lastEmailedAt: nowIso,
              emailStatus: mail.sent ? "sent" : "failed",
              feedbackRequestSent: true,
              feedbackRequestSentAt: nowIso,
              ...(mail.sent ? {} : { emailError: (mail as any)?.error || (mail as any)?.reason || "Email send failed" }),
            } as any,
            { merge: true }
          );
        }

        results.push({
          email: normalizedEmail,
          sent: mail.sent === true,
          ...(mail.sent ? {} : { error: (mail as any)?.error || (mail as any)?.reason || "Email send failed" }),
        });
      } catch (e: any) {
        console.error(`Failed to send feedback request to ${normalizedEmail}:`, e);
        results.push({
          email: normalizedEmail,
          sent: false,
          error: e?.message || "Failed to send email",
        });
      }
    }

    const successCount = results.filter((r) => r.sent).length;
    const failCount = results.length - successCount;

    return res.status(200).json({
      success: true,
      total: results.length,
      sent: successCount,
      failed: failCount,
      results,
    });
  } catch (e: any) {
    console.error("sendFeedbackRequest error:", e);
    return res.status(500).json({ error: "Failed to send feedback requests" });
  }
}

