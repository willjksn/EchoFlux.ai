/**
 * POST: Record that a billing reminder (7/3/1 day) was shown so later thresholds are skipped if billing was fixed.
 * Auth: creator Bearer. Body: { kind: 'period'|'card', anchor: string, day: 7|3|1 }
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { recordBillingReminderSent } from "./_echoFluxBillingReminders.js";
import { ECHOFLUX_BILLING_REMINDER_DAYS } from "../src/lib/echoFluxBillingReminders.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyAuth(req);
  if (!decoded?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = (req.body || {}) as { kind?: string; anchor?: string; day?: number };
  const kind = body.kind === "period" || body.kind === "card" ? body.kind : null;
  const anchor = typeof body.anchor === "string" ? body.anchor.trim() : "";
  const day = body.day;

  if (!kind || !anchor || typeof day !== "number") {
    return res.status(400).json({ error: "kind, anchor, and day are required" });
  }
  if (!ECHOFLUX_BILLING_REMINDER_DAYS.includes(day as 7 | 3 | 1)) {
    return res.status(400).json({ error: "day must be 7, 3, or 1" });
  }

  const db = getAdminDb();
  if (!db) {
    return res.status(500).json({ error: "Database unavailable" });
  }

  try {
    await recordBillingReminderSent(db, decoded.uid, kind, anchor, day);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("ackEchoFluxBillingReminder:", e);
    return res.status(500).json({ error: "Failed to record reminder" });
  }
}
