// api/adminGetBillingEvents.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
import { hasPlatformAdminAccess } from "./_platformAdminAccess.js";
import { checkApiKeys, getVerifyAuth, withErrorHandling } from "./_errorHandler.js";

/**
 * Returns recent billing events for admin dashboard:
 * - failed payments (last 24h)
 * - upcoming renewals (next 7d) inferred from dueAt
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    res.status(503).json({ success: false, error: "AI not configured", failed: [], renewals: [] });
    return;
  }

  let authUser;
  try {
    const verifyAuth = await getVerifyAuth();
    authUser = await verifyAuth(req);
  } catch (authError: any) {
    res.status(401).json({ success: false, error: "Authentication error", failed: [], renewals: [] });
    return;
  }

  if (!authUser?.uid) {
    res.status(401).json({ success: false, error: "Unauthorized", failed: [], renewals: [] });
    return;
  }

  let db: ReturnType<typeof getAdminDb>;
  try {
    db = getAdminDb();
  } catch (e) {
    console.error("adminGetBillingEvents: getAdminDb failed", e);
    res.status(503).json({ success: false, error: "Database unavailable", failed: [], renewals: [] });
    return;
  }

  const adminSnap = await db.collection("users").doc(authUser.uid).get();
  if (!adminSnap.exists || !hasPlatformAdminAccess(adminSnap.data() as Record<string, unknown> | undefined)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const weekAhead = now + 7 * 24 * 60 * 60 * 1000;

  let failed: { id: string; [k: string]: unknown }[] = [];
  let renewals: { id: string; [k: string]: unknown }[] = [];

  try {
    const failedSnap = await db
      .collection("billing_events")
      .where("type", "==", "invoice.payment_failed")
      .where("createdAt", ">=", new Date(dayAgo).toISOString())
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();
    failed = failedSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));
  } catch (err: unknown) {
    console.error("adminGetBillingEvents: failed payments query", err);
  }

  try {
    const renewalsSnap = await db
      .collection("billing_events")
      .where("dueAt", ">=", new Date().toISOString())
      .where("dueAt", "<=", new Date(weekAhead).toISOString())
      .orderBy("dueAt", "asc")
      .limit(50)
      .get();
    renewals = renewalsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));
  } catch (err: unknown) {
    console.error("adminGetBillingEvents: renewals query", err);
  }

  res.status(200).json({ success: true, failed, renewals });
}

export default withErrorHandling(handler);


