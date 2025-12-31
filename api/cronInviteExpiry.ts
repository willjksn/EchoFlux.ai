import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { sendEmail } from "./_mailer.js";
import { logEmailHistory } from "./_emailHistory.js";
import { requireCronAuth } from "./_cronAuth.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcMidnightMs(d: Date) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!requireCronAuth(req)) return res.status(401).json({ error: "Unauthorized" });

  const now = new Date();
  const nowIso = now.toISOString();
  const nowMidnight = toUtcMidnightMs(now);

  const db = getAdminDb();

  // We keep this bounded; in early stage this is plenty.
  const snap = await db
    .collection("users")
    .where("subscriptionStatus", "==", "invite_grant")
    .orderBy("inviteGrantExpiresAt", "asc")
    .limit(500)
    .get();

  let remindersSent = 0;
  let expiredSent = 0;
  let downgraded = 0;

  for (const doc of snap.docs) {
    const user = doc.data() as any;
    const email = (user?.email as string | undefined) || "";
    if (!email) continue;

    const stripeSubscriptionId = user?.stripeSubscriptionId as string | undefined;
    if (stripeSubscriptionId) continue; // Stripe subscriber: do not manage via invite cron

    const expiresAtIso = user?.inviteGrantExpiresAt as string | undefined;
    if (!expiresAtIso) continue;
    const expiresAt = new Date(expiresAtIso);
    if (!Number.isFinite(expiresAt.getTime())) continue;

    const daysLeft = Math.floor((toUtcMidnightMs(expiresAt) - nowMidnight) / DAY_MS);
    const plan = (user?.inviteGrantPlan as string | undefined) || (user?.plan as string | undefined) || "Free";

    // Reminder: 3 days before (one-time)
    if (daysLeft === 3 && !user?.inviteExpiryReminderSentAt) {
      const upgradeUrl = "https://echoflux.ai/pricing";
      const text = [
        `Your EchoFlux access expires in 3 days.`,
        ``,
        `Current access: ${plan}`,
        `Expiry date: ${expiresAt.toLocaleString()}`,
        ``,
        `To keep access after expiry, upgrade here:`,
        upgradeUrl,
        ``,
        `If you have questions, reply to this email.`,
      ].join("\n");

      const mail = await sendEmail({
        to: email,
        subject: "EchoFlux access expires in 3 days",
        text,
      });

      await logEmailHistory({
        sentBy: null,
        to: email,
        subject: "EchoFlux access expires in 3 days",
        body: text,
        status: mail.sent ? "sent" : "failed",
        provider: (mail as any)?.provider || null,
        error: mail.sent ? undefined : ((mail as any)?.error || (mail as any)?.reason || "Email send failed"),
        category: "other",
        metadata: {
          type: "invite_expiry_reminder",
          userId: doc.id,
          daysLeft,
          inviteGrantPlan: plan,
          inviteGrantExpiresAt: expiresAtIso,
        },
      });

      await doc.ref.set(
        {
          inviteExpiryReminderSentAt: nowIso,
          inviteExpiryReminderEmailStatus: mail.sent ? "sent" : "preview",
        },
        { merge: true }
      );
      remindersSent++;
    }

    // Expired: send + downgrade (one-time)
    if (daysLeft <= 0 && !user?.inviteExpiredEmailSentAt) {
      const upgradeUrl = "https://echoflux.ai/pricing";
      const text = [
        `Your EchoFlux access has expired.`,
        ``,
        `To continue using EchoFlux, upgrade here:`,
        upgradeUrl,
        ``,
        `If you believe this is a mistake, reply to this email.`,
      ].join("\n");

      const mail = await sendEmail({
        to: email,
        subject: "Your EchoFlux access has expired",
        text,
      });

      await logEmailHistory({
        sentBy: null,
        to: email,
        subject: "Your EchoFlux access has expired",
        body: text,
        status: mail.sent ? "sent" : "failed",
        provider: (mail as any)?.provider || null,
        error: mail.sent ? undefined : ((mail as any)?.error || (mail as any)?.reason || "Email send failed"),
        category: "other",
        metadata: {
          type: "invite_expired",
          userId: doc.id,
          inviteGrantPlan: plan,
          inviteGrantExpiresAt: expiresAtIso,
        },
      });

      await doc.ref.set(
        {
          plan: "Free",
          subscriptionStatus: "invite_grant_expired",
          inviteGrantExpiredAt: nowIso,
          inviteExpiredEmailSentAt: nowIso,
          inviteExpiredEmailStatus: mail.sent ? "sent" : "preview",
        },
        { merge: true }
      );

      expiredSent++;
      downgraded++;
    }
  }

  return res.status(200).json({
    success: true,
    processed: snap.size,
    remindersSent,
    expiredSent,
    downgraded,
  });
}


