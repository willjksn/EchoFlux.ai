import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { checkRateLimit, getRateLimitHeaders } from "./_rateLimiter.js";
import { sendEmail } from "./_mailer.js";
import { WAITLIST_EMAIL_TEMPLATES } from "./_waitlistEmailTemplates.js";
import { logEmailHistory } from "./_emailHistory.js";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    (req.headers["x-real-ip"] as string | undefined) ||
    "anonymous";

  // Rate limit: 5 requests / hour per IP
  const rl = checkRateLimit(`waitlist:${ip}`, 5, 60 * 60 * 1000);
  Object.entries(getRateLimitHeaders(rl.remaining, rl.resetTime, 5)).forEach(([k, v]) => res.setHeader(k, v));
  if (!rl.allowed) {
    return res.status(429).json({ error: "Rate limit exceeded", retryAfter: Math.ceil((rl.resetTime - Date.now()) / 1000) });
  }

  const { email, name } = (req.body || {}) as { email?: string; name?: string };
  if (!email || typeof email !== "string") return res.status(400).json({ error: "Email is required" });
  const normalized = normalizeEmail(email);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalized)) return res.status(400).json({ error: "Invalid email address" });

  const safeName = typeof name === "string" ? name.trim().slice(0, 80) : "";
  const nowIso = new Date().toISOString();

  try {
    const db = getAdminDb();
    const docId = normalized.replace(/[^a-z0-9@._+-]/g, "_");
    const ref = db.collection("waitlist_requests").doc(docId);
    const snap = await ref.get();

    if (snap.exists) {
      const data = snap.data() as any;
      const status = data?.status || "pending";
      return res.status(200).json({
        success: true,
        status,
        message:
          status === "approved"
            ? "You're already approved. Check your email for instructions."
            : "You're already on the list. We'll email you if you're selected.",
      });
    }

    await ref.set({
      email: normalized,
      name: safeName || null,
      status: "pending",
      createdAt: nowIso,
      updatedAt: nowIso,
      source: "landing",
      ip,
    });

    // Send confirmation email
    try {
      const emailText = WAITLIST_EMAIL_TEMPLATES.confirmation(safeName || null);
      const mail = await sendEmail({
        to: normalized,
        subject: "You're on the EchoFlux.ai waitlist",
        text: emailText,
      });

      // Update waitlist entry with email status
      await ref.set(
        {
          lastEmailedAt: nowIso,
          emailStatus: mail.sent ? "sent" : "failed",
          ...(mail.sent ? {} : { emailError: (mail as any)?.error || (mail as any)?.reason || "Email send failed" }),
        } as any,
        { merge: true }
      );

      // Log to email history
      await logEmailHistory({
        sentBy: null, // System email
        to: normalized,
        subject: "You're on the EchoFlux.ai waitlist",
        body: emailText,
        status: mail.sent ? "sent" : "failed",
        provider: (mail as any)?.provider || null,
        error: mail.sent ? undefined : ((mail as any)?.error || (mail as any)?.reason || "Email send failed"),
        category: "waitlist",
        metadata: { waitlistId: docId },
      });
    } catch (emailError: any) {
      console.error("Failed to send waitlist confirmation email:", emailError);
      // Don't fail the request if email fails - user is still on the waitlist
    }

    return res.status(200).json({ success: true, status: "pending", message: "You're on the list. We'll email you if you're selected." });
  } catch (e: any) {
    console.error("joinWaitlist error:", e);
    return res.status(500).json({ error: "Failed to join waitlist" });
  }
}


