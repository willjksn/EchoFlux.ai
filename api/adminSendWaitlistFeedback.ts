import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { sendEmail } from "./_mailer.js";
import { WAITLIST_EMAIL_TEMPLATES } from "./_waitlistEmailTemplates.js";
import { logEmailHistory } from "./_emailHistory.js";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function applyPlaceholders(input: string, vars: Record<string, string>) {
  return input.replace(/\{(\w+)\}/g, (_m, key) => (vars[key] !== undefined ? vars[key] : `{${key}}`));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await verifyAuth(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  const adminDoc = await db.collection("users").doc(admin.uid).get();
  if ((adminDoc.data() as any)?.role !== "Admin") return res.status(403).json({ error: "Admin access required" });

  const { email, name, subjectOverride, textOverride, htmlOverride } = (req.body || {}) as {
    email?: string;
    name?: string | null;
    subjectOverride?: string;
    textOverride?: string;
    htmlOverride?: string;
  };

  if (!email || typeof email !== "string") return res.status(400).json({ error: "email is required" });
  const normalizedEmail = normalizeEmail(email);
  const waitlistId = normalizedEmail.replace(/[^a-z0-9@._+-]/g, "_");
  const waitRef = db.collection("waitlist_requests").doc(waitlistId);
  const nowIso = new Date().toISOString();

  try {
    const waitSnap = await waitRef.get();
    const existingData = waitSnap.exists ? (waitSnap.data() as any) : null;
    const userName = name || existingData?.name || null;

    const vars: Record<string, string> = {
      name: userName || "there",
      email: normalizedEmail,
    };

    const defaultSubject = "EchoFlux.ai — Feedback request";
    const defaultText = WAITLIST_EMAIL_TEMPLATES.feedbackRequest(userName || null);

    const emailSubject =
      typeof subjectOverride === "string" && subjectOverride.trim()
        ? applyPlaceholders(subjectOverride, vars)
        : defaultSubject;
    const emailText =
      typeof textOverride === "string" && textOverride.trim()
        ? applyPlaceholders(textOverride, vars)
        : defaultText;
    const emailHtml =
      typeof htmlOverride === "string" && htmlOverride.trim()
        ? applyPlaceholders(htmlOverride, vars)
        : undefined;

    const mail = await sendEmail({
      to: normalizedEmail,
      subject: emailSubject,
      text: emailText,
      ...(emailHtml ? { html: emailHtml } : {}),
    });

    await waitRef.set(
      {
        feedbackLastEmailedAt: nowIso,
        feedbackEmailStatus: mail.sent ? "sent" : "failed",
        ...(mail.sent ? {} : { feedbackEmailError: (mail as any)?.error || (mail as any)?.reason || "Email send failed" }),
        updatedAt: nowIso,
      } as any,
      { merge: true }
    );

    await logEmailHistory({
      sentBy: admin.uid,
      to: normalizedEmail,
      subject: emailSubject,
      body: emailText,
      ...(emailHtml ? { html: emailHtml } : {}),
      status: mail.sent ? "sent" : "failed",
      provider: (mail as any)?.provider || null,
      error: mail.sent ? undefined : ((mail as any)?.error || (mail as any)?.reason || "Email send failed"),
      category: "waitlist",
      metadata: { waitlistId, type: "feedback" },
    });

    return res.status(200).json({
      success: true,
      emailSent: mail.sent === true,
      emailPreview: mail.sent ? null : emailText,
      emailError: mail.sent ? null : ((mail as any)?.error || (mail as any)?.reason || null),
      emailProvider: (mail as any)?.provider ?? null,
    });
  } catch (e: any) {
    console.error("adminSendWaitlistFeedback error:", e);
    return res.status(500).json({ error: "Failed to send feedback email" });
  }
}


