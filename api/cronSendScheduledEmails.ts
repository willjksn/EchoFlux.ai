import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { sendEmail } from "./_mailer.js";
import { logEmailHistory } from "./_emailHistory.js";
import { requireCronAuth } from "./_cronAuth.js";

/**
 * Cron worker: sends scheduled emails that are due.
 * Configure Vercel cron separately (vercel.json) when ready.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!requireCronAuth(req)) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  const nowIso = new Date().toISOString();

  // Avoid composite index requirements during early stage:
  // order by sendAt and filter in-memory for status + due time.
  const baseSnap = await db.collection("scheduled_emails").orderBy("sendAt", "asc").limit(50).get();
  const dueDocs = baseSnap.docs.filter((d) => {
    const data = d.data() as any;
    if (data?.status !== "scheduled") return false;
    const sendAt = String(data?.sendAt || "");
    return !!sendAt && sendAt <= nowIso;
  });

  let processed = 0;
  let sentEmails = 0;
  let failedEmails = 0;

  for (const schedDoc of dueDocs.slice(0, 10)) {
    const schedRef = schedDoc.ref;

    // Acquire a simple lock (transaction): scheduled -> sending
    const locked = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(schedRef);
      if (!fresh.exists) return false;
      const data = fresh.data() as any;
      if (data?.status !== "scheduled") return false;
      tx.set(
        schedRef,
        {
          status: "sending",
          startedAt: nowIso,
          updatedAt: nowIso,
        },
        { merge: true }
      );
      return true;
    });
    if (!locked) continue;

    processed++;

    const sched = schedDoc.data() as any;
    const subject = String(sched?.subject || "");
    const text = String(sched?.text || "");
    const html = typeof sched?.html === "string" ? (sched.html as string) : undefined;
    const filterBy = (sched?.filterBy || null) as
      | { plan?: "Free" | "Pro" | "Elite"; hasCompletedOnboarding?: boolean }
      | null;
    const templateId = (sched?.templateId as string | null) || null;

    try {
      // Build query (same as mass email)
      let usersQuery: FirebaseFirestore.Query = db.collection("users");
      if (filterBy?.plan) usersQuery = usersQuery.where("plan", "==", filterBy.plan);
      if (typeof filterBy?.hasCompletedOnboarding === "boolean") {
        usersQuery = usersQuery.where("hasCompletedOnboarding", "==", filterBy.hasCompletedOnboarding);
      }

      const usersSnapshot = await usersQuery.get();
      const users = usersSnapshot.docs
        .map((doc) => ({
          id: doc.id,
          email: (doc.data() as any)?.email as string | undefined,
          name: (doc.data() as any)?.name || (doc.data() as any)?.fullName || null,
        }))
        .filter((u) => u.email && typeof u.email === "string");

      const results: Array<{ email: string; sent: boolean; error?: string }> = [];

      // Send in batches to reduce per-run duration
      const BATCH_SIZE = 10;
      for (let i = 0; i < users.length; i += BATCH_SIZE) {
        const batch = users.slice(i, i + BATCH_SIZE);
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(
          batch.map(async (u) => {
            const personalizedSubject = subject.replace(/\{name\}/g, u.name || "there");
            const personalizedText = text.replace(/\{name\}/g, u.name || "there");
            const personalizedHtml = html ? html.replace(/\{name\}/g, u.name || "there") : undefined;
            try {
              const mail = await sendEmail({
                to: u.email!,
                subject: personalizedSubject,
                text: personalizedText,
                html: personalizedHtml,
              });

              results.push({
                email: u.email!,
                sent: mail.sent === true,
                ...(mail.sent ? {} : { error: (mail as any)?.error || (mail as any)?.reason || "Email send failed" }),
              });

              await logEmailHistory({
                sentBy: null, // cron/system
                to: u.email!,
                subject: personalizedSubject,
                body: personalizedText,
                html: personalizedHtml,
                status: mail.sent ? "sent" : "failed",
                provider: (mail as any)?.provider || null,
                error: mail.sent ? undefined : ((mail as any)?.error || (mail as any)?.reason || "Email send failed"),
                category: "scheduled",
                metadata: {
                  scheduledEmailId: schedDoc.id,
                  ...(templateId ? { templateId } : {}),
                  userId: u.id,
                },
              });
            } catch (e: any) {
              results.push({ email: u.email!, sent: false, error: e?.message || "Failed to send email" });
              await logEmailHistory({
                sentBy: null,
                to: u.email!,
                subject: personalizedSubject,
                body: personalizedText,
                html: personalizedHtml,
                status: "failed",
                provider: null,
                error: e?.message || "Failed to send email",
                category: "scheduled",
                metadata: {
                  scheduledEmailId: schedDoc.id,
                  ...(templateId ? { templateId } : {}),
                  userId: u.id,
                },
              });
            }
          })
        );
      }

      const ok = results.filter((r) => r.sent).length;
      const bad = results.length - ok;
      sentEmails += ok;
      failedEmails += bad;

      await schedRef.set(
        {
          status: "sent",
          completedAt: new Date().toISOString(),
          recipientCount: results.length,
          sentCount: ok,
          failedCount: bad,
          updatedAt: new Date().toISOString(),
          // Store a small sample of results for debugging
          resultsPreview: results.slice(0, 50),
        } as any,
        { merge: true }
      );
    } catch (e: any) {
      console.error("Scheduled email send failed:", { id: schedDoc.id, error: e });
      await schedRef.set(
        {
          status: "failed",
          failedAt: new Date().toISOString(),
          error: e?.message || "Failed to send scheduled email",
          updatedAt: new Date().toISOString(),
        } as any,
        { merge: true }
      );
    }
  }

  return res.status(200).json({
    success: true,
    due: dueDocs.length,
    processed,
    sentEmails,
    failedEmails,
  });
}


