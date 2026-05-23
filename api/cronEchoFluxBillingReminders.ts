/**
 * Daily: sync default card exp from Stripe for paid EchoFlux subscribers.
 * Vercel Cron — complements client bell reminders (7 / 3 / 1 days).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireCronAuth } from "./_cronAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { verifyAuth } from "./verifyAuth.js";
import { hasPlatformAdminAccess } from "./_platformAdminAccess.js";
import { syncEchoFluxDefaultCardForUser } from "./_echoFluxBillingReminders.js";
import { PAID_ECHOFLUX_PLANS } from "../src/lib/echoFluxSubscriptionAccess.js";

const PAID_PLANS = [...PAID_ECHOFLUX_PLANS];

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
      if (hasPlatformAdminAccess(userDoc.data() as Record<string, unknown> | undefined)) {
        isAdminAuth = true;
      }
    }
  }
  if (!isCronAuth && !isAdminAuth) {
    res.status(401).json({ error: "Unauthorized. Use CRON_SECRET or Admin auth." });
    return;
  }

  const db = getAdminDb();
  if (!db) {
    res.status(500).json({ error: "Database unavailable" });
    return;
  }

  let scanned = 0;
  let synced = 0;
  let errors = 0;

  try {
    for (const plan of PAID_PLANS) {
      const snap = await db
        .collection("users")
        .where("plan", "==", plan)
        .limit(200)
        .get();

      for (const doc of snap.docs) {
        const data = doc.data() as { stripeSubscriptionId?: string };
        if (!data.stripeSubscriptionId || typeof data.stripeSubscriptionId !== "string") continue;
        scanned += 1;
        try {
          const card = await syncEchoFluxDefaultCardForUser(db, doc.id);
          if (card) synced += 1;
        } catch (e) {
          errors += 1;
          console.warn(`cronEchoFluxBillingReminders(${doc.id}):`, e);
        }
      }
    }

    res.status(200).json({ ok: true, scanned, synced, errors });
  } catch (e) {
    console.error("cronEchoFluxBillingReminders:", e);
    res.status(500).json({ error: "Cron failed" });
  }
}
