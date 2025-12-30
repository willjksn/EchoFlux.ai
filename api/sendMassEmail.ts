import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { sendEmail } from "./_mailer.js";
import { logEmailHistory } from "./_emailHistory.js";

/**
 * Send mass email to all users or filtered users
 * Admin-only endpoint
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await verifyAuth(req);
  if (!admin) return res.status(401).json({ error: "Unauthorized" });

  const db = getAdminDb();
  const adminDoc = await db.collection("users").doc(admin.uid).get();
  if ((adminDoc.data() as any)?.role !== "Admin") return res.status(403).json({ error: "Admin access required" });

  const { subject, text, html, filterBy } = (req.body || {}) as {
    subject?: string;
    text?: string;
    html?: string;
    filterBy?: {
      plan?: "Free" | "Pro" | "Elite";
      hasCompletedOnboarding?: boolean;
      status?: "active" | "inactive";
    };
  };

  if (!subject || !text) {
    return res.status(400).json({ error: "subject and text are required" });
  }

  try {
    // Build query based on filters
    let usersQuery: FirebaseFirestore.Query = db.collection("users");
    
    if (filterBy?.plan) {
      usersQuery = usersQuery.where("plan", "==", filterBy.plan);
    }
    if (filterBy?.hasCompletedOnboarding !== undefined) {
      usersQuery = usersQuery.where("hasCompletedOnboarding", "==", filterBy.hasCompletedOnboarding);
    }

    const usersSnapshot = await usersQuery.get();
    const users = usersSnapshot.docs.map((doc) => ({
      id: doc.id,
      email: (doc.data() as any)?.email as string | undefined,
      name: (doc.data() as any)?.name || (doc.data() as any)?.fullName || null,
    })).filter((u) => u.email && typeof u.email === "string");

    if (users.length === 0) {
      return res.status(200).json({
        success: true,
        total: 0,
        sent: 0,
        failed: 0,
        message: "No users found matching the filters",
      });
    }

    const nowIso = new Date().toISOString();
    const results: Array<{
      email: string;
      sent: boolean;
      error?: string;
    }> = [];

    // Send emails with rate limiting (batch of 10 at a time)
    const BATCH_SIZE = 10;
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      
      await Promise.all(
        batch.map(async (user) => {
          try {
            const emailText = text.replace(/\{name\}/g, user.name || "there");
            const emailHtml = html ? html.replace(/\{name\}/g, user.name || "there") : undefined;

            const mail = await sendEmail({
              to: user.email!,
              subject: subject.replace(/\{name\}/g, user.name || "there"),
              text: emailText,
              html: emailHtml,
            });

            results.push({
              email: user.email!,
              sent: mail.sent === true,
              ...(mail.sent ? {} : { error: (mail as any)?.error || (mail as any)?.reason || "Email send failed" }),
            });

            // Log to email history
            await logEmailHistory({
              sentBy: admin.uid,
              to: user.email!,
              subject: subject.replace(/\{name\}/g, user.name || "there"),
              body: emailText,
              html: emailHtml,
              status: mail.sent ? "sent" : "failed",
              provider: (mail as any)?.provider || null,
              error: mail.sent ? undefined : ((mail as any)?.error || (mail as any)?.reason || "Email send failed"),
              category: "mass",
              metadata: { campaignId: "mass_email", userId: user.id },
            });

            // Small delay to avoid rate limits
            await new Promise((resolve) => setTimeout(resolve, 100));
          } catch (e: any) {
            console.error(`Failed to send mass email to ${user.email}:`, e);
            results.push({
              email: user.email!,
              sent: false,
              error: e?.message || "Failed to send email",
            });
          }
        })
      );

      // Delay between batches
      if (i + BATCH_SIZE < users.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    const successCount = results.filter((r) => r.sent).length;
    const failCount = results.length - successCount;

    // Log mass email campaign
    await db.collection("mass_email_campaigns").add({
      sentBy: admin.uid,
      sentAt: nowIso,
      subject,
      totalRecipients: users.length,
      sent: successCount,
      failed: failCount,
      filterBy: filterBy || null,
    });

    return res.status(200).json({
      success: true,
      total: results.length,
      sent: successCount,
      failed: failCount,
      results: results.slice(0, 100), // Return first 100 results to avoid huge response
    });
  } catch (e: any) {
    console.error("sendMassEmail error:", e);
    return res.status(500).json({ error: "Failed to send mass email" });
  }
}
