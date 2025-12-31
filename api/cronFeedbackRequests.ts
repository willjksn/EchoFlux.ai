import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { sendEmail } from "./_mailer.js";
import { logEmailHistory } from "./_emailHistory.js";

function requireCronAuth(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && secret.trim()) {
    return req.headers.authorization === `Bearer ${secret}`;
  }
  // Fallback for environments without a configured secret.
  return req.headers["x-vercel-cron"] === "1";
}

function getEasternTimeParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const lookup: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") lookup[p.type] = p.value;
  }
  const hour = Number(lookup.hour);
  const minute = Number(lookup.minute);
  return { hour, minute };
}

function buildFeedbackLink(milestone: "day7" | "day14") {
  // Keep this stable for production; it works even if user has to log in first.
  const base = process.env.APP_BASE_URL || "https://echoflux.ai";
  return `${base.replace(/\/$/, "")}/?feedback=${milestone}`;
}

/**
 * Cron job: send a short email nudge to open the in-app feedback modal.
 * - Day 7 and Day 14 after invite grant redemption (inviteGrantRedeemedAt)
 * - Only sends during a 10:00–10:15am ET window (run hourly via Vercel Cron; this gate prevents off-hour sends)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!requireCronAuth(req)) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  const nowIso = new Date().toISOString();

  const DAY_7 = 7;
  const DAY_14 = 14;
  const cutoff7 = new Date();
  cutoff7.setDate(cutoff7.getDate() - DAY_7);
  const cutoff14 = new Date();
  cutoff14.setDate(cutoff14.getDate() - DAY_14);

  // ET send window gate
  const { hour, minute } = getEasternTimeParts(new Date());
  const inWindow = hour === 10 && minute >= 0 && minute <= 15;
  if (!inWindow) {
    return res.status(200).json({
      success: true,
      message: "Outside 10:00–10:15am ET send window",
      sent: 0,
      nowIso,
    });
  }

  try {
    const usersSnap = await db.collection("users").where("subscriptionStatus", "==", "invite_grant").limit(500).get();
    const users = usersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    const results: Array<{ email: string; sent: boolean; error?: string }> = [];

    for (const u of users) {
      const email = typeof u?.email === "string" ? u.email.trim().toLowerCase() : "";
      if (!email) continue;

      const redeemedAtIso = typeof u?.inviteGrantRedeemedAt === "string" ? u.inviteGrantRedeemedAt : null;
      const redeemedAtMs = redeemedAtIso ? new Date(redeemedAtIso).getTime() : NaN;
      if (!Number.isFinite(redeemedAtMs)) continue;

      const isAtLeast7Days = redeemedAtMs <= cutoff7.getTime();
      const isAtLeast14Days = redeemedAtMs <= cutoff14.getTime();

      const shouldSendDay7 = isAtLeast7Days && !u.feedbackDay7NudgeSentAt && !u.feedbackDay7SubmittedAt;
      const shouldSendDay14 = isAtLeast14Days && !u.feedbackDay14NudgeSentAt && !u.feedbackDay14SubmittedAt;
      if (!shouldSendDay7 && !shouldSendDay14) continue;

      const name = typeof u?.name === "string" ? u.name : null;

      const sends: Array<{ key: "day7" | "day14"; subject: string; body: string }> = [];
      if (shouldSendDay7) {
        const link = buildFeedbackLink("day7");
        sends.push({
          key: "day7",
          subject: "EchoFlux — quick feedback (2 minutes)",
          body: `${name ? `Hi ${name},` : "Hi there,"}

Quick check-in — we added a short in-app feedback form (mostly multiple-choice).

Open your Day 7 feedback form:
${link}

If you’re not logged in, log in first and it will pop up automatically.

— The EchoFlux Team`,
        });
      }
      if (shouldSendDay14) {
        const link = buildFeedbackLink("day14");
        sends.push({
          key: "day14",
          subject: "EchoFlux — final feedback check-in",
          body: `${name ? `Hi ${name},` : "Hi there,"}

Final check-in — we’d love a last quick round of feedback (mostly multiple-choice).

Open your Day 14 feedback form:
${link}

If you’re not logged in, log in first and it will pop up automatically.

— The EchoFlux Team`,
        });
      }

      // If already at day 14 and day 7 never sent, we can send both (day 7 first).
      for (const s of sends) {
        try {
          const mail = await sendEmail({ to: email, subject: s.subject, text: s.body });

          await db
            .collection("users")
            .doc(u.id)
            .set(
              {
                ...(s.key === "day7" ? { feedbackDay7NudgeSentAt: nowIso } : { feedbackDay14NudgeSentAt: nowIso }),
              } as any,
              { merge: true }
            );

          await logEmailHistory({
            sentBy: null,
            to: email,
            subject: s.subject,
            body: s.body,
            status: mail.sent ? "sent" : "failed",
            provider: (mail as any)?.provider || null,
            error: mail.sent ? undefined : ((mail as any)?.error || (mail as any)?.reason || "Email send failed"),
            category: "scheduled",
            metadata: { userId: u.id, milestone: s.key, inviteGrantRedeemedAt: redeemedAtIso },
          });

          results.push({
            email,
            sent: mail.sent === true,
            ...(mail.sent ? {} : { error: (mail as any)?.error || (mail as any)?.reason || "Email send failed" }),
          });

          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (e: any) {
          console.error(`Failed to send feedback nudge (${s.key}) to ${email}:`, e);
          results.push({ email, sent: false, error: e?.message || "Failed to send email" });
        }
      }
    }

    const successCount = results.filter((r) => r.sent).length;
    return res.status(200).json({
      success: true,
      total: results.length,
      sent: successCount,
      failed: results.length - successCount,
      results: results.slice(0, 50),
      nowIso,
    });
  } catch (e: any) {
    console.error("cronFeedbackRequests error:", e);
    return res.status(500).json({ error: "Failed to process feedback nudges" });
  }
}

