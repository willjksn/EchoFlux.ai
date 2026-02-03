/**
 * Cron: proactively refresh X (Twitter) OAuth 2.0 tokens for all connected users.
 * Keeps auto-post and manual posting working without requiring users to reopen the app.
 * Schedule: every 6 hours (tokens typically expire in 2h without refresh; we refresh when <2h left).
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireCronAuth } from "./_cronAuth.js";
import { getAdminDb } from "./_firebaseAdmin.js";
import { refreshXTokenForAccount } from "./oauth/x/refreshTokenLib.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!requireCronAuth(req)) {
    return res.status(401).json({ error: "Unauthorized. Use CRON_SECRET or Vercel Cron." });
  }

  const db = getAdminDb();
  const results: { refreshed: number; skipped: number; failed: number; reconnect: number } = {
    refreshed: 0,
    skipped: 0,
    failed: 0,
    reconnect: 0,
  };

  try {
    const usersSnap = await db.collection("users").get();

    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;
      const accountRef = db.collection("users").doc(userId).collection("social_accounts").doc("x");
      const accountSnap = await accountRef.get();
      if (!accountSnap.exists) continue;

      const account = accountSnap.data();
      if (!account?.connected) continue;

      const result = await refreshXTokenForAccount(db, userId, accountRef, account);

      if (result.refreshed === true) {
        results.refreshed += 1;
      } else if (result.reason === "reconnect_required") {
        results.reconnect += 1;
      } else if (result.reason === "token_still_valid" || result.reason === "not_connected") {
        results.skipped += 1;
      } else {
        results.failed += 1;
      }
    }

    res.status(200).json({
      success: true,
      message: "X token refresh cron completed",
      total: results.refreshed + results.skipped + results.failed + results.reconnect,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("cronRefreshXTokens error:", error);
    res.status(500).json({
      error: "Cron failed",
      message: error?.message || String(error),
      timestamp: new Date().toISOString(),
    });
  }
}
