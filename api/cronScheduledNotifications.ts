import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireCronAuth } from "./_cronAuth.js";
import { verifyAuth } from "./verifyAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { processScheduledReminders } from "./_fanNotifications.js";

/**
 * Sends due fan reminders (e.g. 5 minutes before a scheduled 1:1 video/chat session).
 * Vercel Cron: run every few minutes so reminders are not late.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const isCronAuth = requireCronAuth(req);
  let isAdminAuth = false;
  if (!isCronAuth) {
    const user = await verifyAuth(req);
    if (user) {
      const db = getAdminDb();
      const userDoc = await db.collection("users").doc(user.uid).get();
      if (userDoc.data()?.role === "Admin") isAdminAuth = true;
    }
  }
  if (!isCronAuth && !isAdminAuth) {
    res.status(401).json({ error: "Unauthorized. Use CRON_SECRET or Admin auth." });
    return;
  }

  try {
    const processed = await processScheduledReminders();
    res.status(200).json({ ok: true, processed });
  } catch (e) {
    console.error("cronScheduledNotifications:", e);
    res.status(500).json({ error: "Failed to process scheduled notifications" });
  }
}
