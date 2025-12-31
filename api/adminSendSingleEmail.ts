import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { sendEmail } from "./_mailer.js";
import { logEmailHistory } from "./_emailHistory.js";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function applyPlaceholders(input: string, vars: Record<string, string>) {
  return input.replace(/\{(\w+)\}/g, (_m, key) => (vars[key] !== undefined ? vars[key] : `{${key}}`));
}

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

  const {
    to,
    name,
    subject,
    text,
    html,
    createInvite,
  } = (req.body || {}) as {
    to?: string;
    name?: string | null;
    subject?: string;
    text?: string;
    html?: string;
    createInvite?: {
      enabled?: boolean;
      grantPlan?: "Free" | "Pro" | "Elite";
      maxUses?: number;
      expiresAt?: string | null;
    };
  };

  if (!to || typeof to !== "string") return res.status(400).json({ error: "to is required" });
  if (!subject || typeof subject !== "string") return res.status(400).json({ error: "subject is required" });
  if (!text || typeof text !== "string") return res.status(400).json({ error: "text is required" });

  const normalizedTo = normalizeEmail(to);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedTo)) return res.status(400).json({ error: "Invalid email" });

  const safeName = typeof name === "string" ? name.trim().slice(0, 120) : "";
  const nowIso = new Date().toISOString();

  let inviteCode: string | null = null;
  let invitePlan: "Free" | "Pro" | "Elite" | null = null;
  let inviteExpiresAtIso: string | null = null;
  let inviteMaxUses: number | null = null;

  try {
    if (createInvite?.enabled) {
      const grantPlan = createInvite.grantPlan || "Free";
      if (grantPlan !== "Free" && grantPlan !== "Pro" && grantPlan !== "Elite") {
        return res.status(400).json({ error: "Invalid grantPlan" });
      }
      const maxUses = Number(createInvite.maxUses ?? 1);
      if (!Number.isFinite(maxUses) || maxUses < 1 || maxUses > 100) {
        return res.status(400).json({ error: "maxUses must be between 1 and 100" });
      }

      if (typeof createInvite.expiresAt === "string" && createInvite.expiresAt.trim()) {
        const d = new Date(createInvite.expiresAt);
        if (!Number.isFinite(d.getTime())) return res.status(400).json({ error: "expiresAt must be a valid date" });
        inviteExpiresAtIso = d.toISOString();
      }

      inviteCode = generateInviteCode();
      invitePlan = grantPlan;
      inviteMaxUses = maxUses;

      await db.collection("beta_invites").doc(inviteCode).set(
        {
          code: inviteCode,
          createdAt: nowIso,
          createdBy: admin.uid,
          used: false,
          usedCount: 0,
          maxUses,
          grantPlan,
          ...(inviteExpiresAtIso ? { expiresAt: inviteExpiresAtIso } : {}),
        } as any,
        { merge: true }
      );
    }

    const expiresAtHuman = inviteExpiresAtIso ? new Date(inviteExpiresAtIso).toLocaleDateString() : "";

    const vars: Record<string, string> = {
      name: safeName || "there",
      email: normalizedTo,
      inviteCode: inviteCode || "",
      plan: invitePlan || "",
      expiresAt: expiresAtHuman ? ` (expires ${expiresAtHuman})` : "",
      expiresAtIso: inviteExpiresAtIso || "",
      onboardingLink: "https://echoflux.ai",
    };

    let finalSubject = applyPlaceholders(subject, vars);
    let finalText = applyPlaceholders(text, vars);
    let finalHtml = typeof html === "string" && html.trim() ? applyPlaceholders(html, vars) : undefined;

    // If invite was generated but the email doesn't include it, append a standard block.
    if (inviteCode && !finalText.includes(inviteCode) && !text.includes("{inviteCode}")) {
      finalText += `\n\nOnboarding link: ${vars.onboardingLink}\nInvite code: ${inviteCode}\nPlan: ${invitePlan}${vars.expiresAt}\n`;
      if (finalHtml) {
        finalHtml += `<br><br><strong>Onboarding link:</strong> ${vars.onboardingLink}<br><strong>Invite code:</strong> ${inviteCode}<br><strong>Plan:</strong> ${invitePlan}${vars.expiresAt}`;
      }
    }

    const mail = await sendEmail({
      to: normalizedTo,
      subject: finalSubject,
      text: finalText,
      ...(finalHtml ? { html: finalHtml } : {}),
    });

    await logEmailHistory({
      sentBy: admin.uid,
      to: normalizedTo,
      subject: finalSubject,
      body: finalText,
      ...(finalHtml ? { html: finalHtml } : {}),
      status: mail.sent ? "sent" : "failed",
      provider: (mail as any)?.provider || null,
      error: mail.sent ? undefined : ((mail as any)?.error || (mail as any)?.reason || "Email send failed"),
      category: "other",
      metadata: { type: "single", inviteCode, invitePlan, inviteExpiresAtIso, inviteMaxUses },
    });

    return res.status(200).json({
      success: true,
      emailSent: mail.sent === true,
      emailProvider: (mail as any)?.provider ?? null,
      emailError: mail.sent ? null : ((mail as any)?.error || (mail as any)?.reason || null),
      inviteCode,
      invitePlan,
      inviteExpiresAt: inviteExpiresAtIso,
      inviteMaxUses,
    });
  } catch (e: any) {
    console.error("adminSendSingleEmail error:", e);
    return res.status(500).json({ error: "Failed to send email", details: e?.message || "Unknown error" });
  }
}


