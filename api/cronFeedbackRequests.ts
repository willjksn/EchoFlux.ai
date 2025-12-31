import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { sendEmail } from "./_mailer.js";
import { WAITLIST_EMAIL_TEMPLATES } from "./_waitlistEmailTemplates.js";
import { logEmailHistory } from "./_emailHistory.js";

/**
 * Cron job to send feedback requests to approved waitlist users
 * who have been active for X days but haven't received a feedback request yet
 * 
 * Run this daily via Vercel Cron or similar
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Optional: Add cron secret verification
  const cronSecret = req.headers["x-cron-secret"] || req.query.secret;
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret && cronSecret !== expectedSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const db = getAdminDb();
  const nowIso = new Date().toISOString();

  const DAY_7 = 7;
  const DAY_14 = 14;
  const cutoff7 = new Date();
  cutoff7.setDate(cutoff7.getDate() - DAY_7);
  const cutoff14 = new Date();
  cutoff14.setDate(cutoff14.getDate() - DAY_14);

  try {
    // Get approved waitlist entries that:
    // 1. Were approved at least DAYS_AFTER_APPROVAL days ago
    // 2. Haven't received a feedback request yet
    const waitlistRef = db.collection("waitlist_requests");

    // Robust approach (avoid composite indexes): fetch a bounded set and filter in-memory.
    // ISO timestamps allow lexicographic comparisons.
    const approvedSnapshot = await waitlistRef.orderBy("approvedAt", "desc").limit(500).get();

    const entries = approvedSnapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...(doc.data() as any),
      }))
      .filter((entry) => {
        return (
          entry?.status === "approved" &&
          typeof entry?.approvedAt === "string" &&
          entry.approvedAt <= cutoff7.toISOString()
        );
      });

    if (entries.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No eligible users for feedback requests",
        sent: 0,
      });
    }

    const results: Array<{ email: string; sent: boolean; error?: string }> = [];

    // Send day-7 and/or day-14 feedback requests
    for (const entry of entries) {
      const email = entry.email;
      if (!email || typeof email !== "string") continue;

      try {
        const approvedAtIso = typeof entry.approvedAt === "string" ? entry.approvedAt : null;
        const approvedAtMs = approvedAtIso ? new Date(approvedAtIso).getTime() : NaN;
        const isAtLeast7Days = Number.isFinite(approvedAtMs) && approvedAtMs <= cutoff7.getTime();
        const isAtLeast14Days = Number.isFinite(approvedAtMs) && approvedAtMs <= cutoff14.getTime();

        const shouldSendDay7 = isAtLeast7Days && !entry.feedbackDay7SentAt;
        const shouldSendDay14 = isAtLeast14Days && !entry.feedbackDay14SentAt;

        // If a user is already at day 14 and we never sent day 7, we can send both in one run (day 7 first).
        const sends: Array<{
          key: "day7" | "day14";
          subject: string;
          body: string;
          mark: Record<string, any>;
        }> = [];

        if (shouldSendDay7) {
          sends.push({
            key: "day7",
            subject: "EchoFlux early testing — quick feedback (2 minutes)",
            body: WAITLIST_EMAIL_TEMPLATES.feedbackDay7(entry.name || null),
            mark: { feedbackDay7SentAt: nowIso },
          });
        }
        if (shouldSendDay14) {
          sends.push({
            key: "day14",
            subject: "EchoFlux early testing — final feedback check-in",
            body: WAITLIST_EMAIL_TEMPLATES.feedbackDay14(entry.name || null),
            mark: { feedbackDay14SentAt: nowIso },
          });
        }

        if (sends.length === 0) continue;

        for (const s of sends) {
          const mail = await sendEmail({
            to: email,
            subject: s.subject,
            text: s.body,
          });

          await waitlistRef.doc(entry.id).set(
            {
              lastEmailedAt: nowIso,
              emailStatus: mail.sent ? "sent" : "failed",
              ...(mail.sent ? {} : { emailError: (mail as any)?.error || (mail as any)?.reason || "Email send failed" }),
              ...s.mark,
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
            metadata: { waitlistId: entry.id, milestone: s.key, approvedAt: approvedAtIso || null },
          });

          results.push({
            email,
            sent: mail.sent === true,
            ...(mail.sent ? {} : { error: (mail as any)?.error || (mail as any)?.reason || "Email send failed" }),
          });

          // Rate limiting: small delay between emails
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

      } catch (e: any) {
        console.error(`Failed to send feedback request to ${email}:`, e);
        results.push({
          email,
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
      results: results.slice(0, 50), // Return first 50 results
    });
  } catch (e: any) {
    console.error("cronFeedbackRequests error:", e);
    return res.status(500).json({ error: "Failed to process feedback requests" });
  }
}

