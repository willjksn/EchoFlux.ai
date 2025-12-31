import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { sendEmail } from "./_mailer.js";
import { logEmailHistory } from "./_emailHistory.js";

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

  const normalizedEmail = email.trim().toLowerCase();
  const waitlistId = normalizedEmail.replace(/[^a-z0-9@._+-]/g, "_");
  const ref = db.collection("waitlist_requests").doc(waitlistId);
  const nowIso = new Date().toISOString();

  const applyPlaceholders = (input: string, vars: Record<string, string>) => {
    return input.replace(/\{(\w+)\}/g, (_m, key) => (vars[key] !== undefined ? vars[key] : `{${key}}`));
  };

  try {
    const snap = await ref.get();
    const existing = snap.exists ? (snap.data() as any) : null;
    const userName = name || existing?.name || null;

    await ref.set(
      {
        email: normalizedEmail,
        status: "rejected",
        rejectedAt: nowIso,
        rejectedBy: admin.uid,
        updatedAt: nowIso,
      } as any,
      { merge: true }
    );

    const vars: Record<string, string> = {
      name: userName || "there",
      email: normalizedEmail,
    };

    const defaultSubject = "EchoFlux.ai waitlist update";
    const defaultText = [
      `Hi ${vars.name},`,
      ``,
      `Thanks for joining the EchoFlux.ai testing waitlist.`,
      ``,
      `At the moment, we’re onboarding a small group of early testers and we can’t invite everyone right away.`,
      `We’ll keep your request on file, and we’ll reach out if a spot opens up.`,
      ``,
      `— The EchoFlux Team`,
    ].join("\n");

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

    await ref.set(
      {
        lastEmailedAt: nowIso,
        emailStatus: mail.sent ? "sent" : "failed",
        ...(mail.sent ? {} : { emailError: (mail as any)?.error || (mail as any)?.reason || "Email send failed" }),
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
      metadata: { waitlistId },
    });

    return res.status(200).json({
      success: true,
      emailSent: mail.sent === true,
      emailPreview: mail.sent ? null : emailText,
      emailSubject,
      emailText,
      emailHtml: emailHtml || null,
      emailError: mail.sent ? null : ((mail as any)?.error || (mail as any)?.reason || null),
      emailProvider: (mail as any)?.provider ?? null,
    });
  } catch (e: any) {
    console.error("adminRejectWaitlist error:", e);
    return res.status(500).json({ error: "Failed to reject waitlist" });
  }
}


