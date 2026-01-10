// api/adminGetBillingEvents.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAdminDb } from "./_firebaseAdmin.js";
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

  let user;
  try {
    const verifyAuth = await getVerifyAuth();
    user = await verifyAuth(req);
  } catch (authError: any) {
    res.status(401).json({ success: false, error: "Authentication error", failed: [], renewals: [] });
    return;
  }

  // Only admins
  if (!user || user.role !== "Admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const db = getAdminDb();
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const weekAhead = now + 7 * 24 * 60 * 60 * 1000;

  try {
    // Failed payments last 24h
    const failedSnap = await db
      .collection("billing_events")
      .where("type", "==", "invoice.payment_failed")
      .where("createdAt", ">=", new Date(dayAgo).toISOString())
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const failed = failedSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));

    // Renewals next 7d (use dueAt if present)
    const renewalsSnap = await db
      .collection("billing_events")
      .where("dueAt", ">=", new Date().toISOString())
      .where("dueAt", "<=", new Date(weekAhead).toISOString())
      .orderBy("dueAt", "asc")
      .limit(50)
      .get();

    const renewals = renewalsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));

    res.status(200).json({ success: true, failed, renewals });
  } catch (err: any) {
    console.error("adminGetBillingEvents error:", err);
    res.status(500).json({ success: false, error: "Failed to load billing events", failed: [], renewals: [] });
  }
}

export default withErrorHandling(handler);


