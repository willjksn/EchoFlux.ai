import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { sendEmail } from "./_mailer.js";
import { WAITLIST_EMAIL_TEMPLATES } from "./_waitlistEmailTemplates.js";
import { logEmailHistory } from "./_emailHistory.js";

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${seg(4)}-${seg(4)}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await verifyAuth(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  const adminDoc = await db.collection("users").doc(admin.uid).get();
  if ((adminDoc.data() as any)?.role !== "Admin") return res.status(403).json({ error: "Admin access required" });

  const { email, grantPlan = "Free", expiresAt, name, subjectOverride, textOverride, htmlOverride } = (req.body || {}) as {
    email?: string;
    grantPlan?: "Free" | "Pro" | "Elite";
    expiresAt?: string | null;
    name?: string | null;
    subjectOverride?: string;
    textOverride?: string;
    htmlOverride?: string;
  };

  if (!email || typeof email !== "string") return res.status(400).json({ error: "email is required" });
  if (grantPlan !== "Free" && grantPlan !== "Pro" && grantPlan !== "Elite") return res.status(400).json({ error: "Invalid grantPlan" });

  const normalizedEmail = email.trim().toLowerCase();
  const waitlistId = normalizedEmail.replace(/[^a-z0-9@._+-]/g, "_");
  const waitRef = db.collection("waitlist_requests").doc(waitlistId);

  const nowIso = new Date().toISOString();
  const inviteCode = generateInviteCode();
  const inviteRef = db.collection("beta_invites").doc(inviteCode);

  let normalizedExpiresAt: string | null = null;
  if (typeof expiresAt === "string" && expiresAt.trim()) {
    const d = new Date(expiresAt);
    if (!Number.isFinite(d.getTime())) return res.status(400).json({ error: "expiresAt must be a valid date" });
    normalizedExpiresAt = d.toISOString();
  }

  const applyPlaceholders = (input: string, vars: Record<string, string>) => {
    return input.replace(/\{(\w+)\}/g, (_m, key) => (vars[key] !== undefined ? vars[key] : `{${key}}`));
  };

  try {
    // Get existing waitlist entry to preserve name if not provided
    const waitSnap = await waitRef.get();
    const existingData = waitSnap.exists ? (waitSnap.data() as any) : null;
    const userName = name || existingData?.name || null;

    // Create invite + mark waitlist approved
    await db.runTransaction(async (tx) => {
      const waitSnap = await tx.get(waitRef);
      if (!waitSnap.exists) {
        tx.set(waitRef, {
          email: normalizedEmail,
          name: userName,
          status: "approved",
          approvedAt: nowIso,
          approvedBy: admin.uid,
          updatedAt: nowIso,
          inviteCode,
          grantPlan,
          expiresAt: normalizedExpiresAt,
        } as any);
      } else {
        tx.update(waitRef, {
          status: "approved",
          approvedAt: nowIso,
          approvedBy: admin.uid,
          updatedAt: nowIso,
          inviteCode,
          grantPlan,
          expiresAt: normalizedExpiresAt,
          ...(userName ? { name: userName } : {}),
        } as any);
      }

      tx.set(inviteRef, {
        code: inviteCode,
        createdAt: nowIso,
        createdBy: admin.uid,
        used: false,
        usedCount: 0,
        maxUses: 1,
        grantPlan,
        ...(normalizedExpiresAt ? { expiresAt: normalizedExpiresAt } : {}),
      } as any);
    });

    const vars: Record<string, string> = {
      name: userName || "there",
      email: normalizedEmail,
      inviteCode,
      plan: grantPlan,
      expiresAt: normalizedExpiresAt ? new Date(normalizedExpiresAt).toLocaleDateString() : "",
      expiresAtIso: normalizedExpiresAt || "",
    };

    const defaultText = WAITLIST_EMAIL_TEMPLATES.selected(inviteCode, grantPlan, normalizedExpiresAt || null, userName || null);
    const emailText =
      typeof textOverride === "string" && textOverride.trim()
        ? applyPlaceholders(textOverride, vars)
        : defaultText;

    const defaultSubject = "You've Been Selected for Early Testing — EchoFlux.ai";
    const emailSubject =
      typeof subjectOverride === "string" && subjectOverride.trim()
        ? applyPlaceholders(subjectOverride, vars)
        : defaultSubject;

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
        email: normalizedEmail,
        lastEmailedAt: nowIso,
        emailStatus: mail.sent ? "sent" : "failed",
        ...(mail.sent ? {} : { emailError: (mail as any)?.error || (mail as any)?.reason || "Email send failed" }),
      } as any,
      { merge: true }
    );

    // Log to email history
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
      metadata: { waitlistId: waitlistId, inviteCode, grantPlan },
    });

    return res.status(200).json({
      success: true,
      inviteCode,
      grantPlan,
      expiresAt: normalizedExpiresAt,
      emailSent: mail.sent === true,
      emailPreview: mail.sent ? null : emailText,
      emailSubject,
      emailText,
      emailHtml: emailHtml || null,
      emailError: mail.sent ? null : ((mail as any)?.error || (mail as any)?.reason || null),
      emailProvider: (mail as any)?.provider ?? null,
    });
  } catch (e: any) {
    console.error("adminApproveWaitlist error:", e);
    return res.status(500).json({ error: "Failed to approve waitlist" });
  }
}


