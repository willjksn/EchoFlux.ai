import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "../../verifyAuth.js";
import { getAdminDb } from "../../_firebaseAdmin.js";
import { refreshXTokenForAccount } from "./refreshTokenLib.js";

/**
 * Proactively refresh X OAuth 2.0 access token.
 * Call this when the user loads Compose or Settings so the token stays fresh.
 * GET with Firebase auth; returns 200 if refreshed or already valid, 400/401 if reconnect needed.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const user = await verifyAuth(req);
  if (!user?.uid) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const db = getAdminDb();
  const accountRef = db
    .collection("users")
    .doc(user.uid)
    .collection("social_accounts")
    .doc("x");
  const accountSnap = await accountRef.get();

  if (!accountSnap.exists) {
    res.status(200).json({ refreshed: false, reason: "no_x_account" });
    return;
  }

  const account = accountSnap.data();
  const result = await refreshXTokenForAccount(db, user.uid, accountRef, account ?? {});

  if (result.refreshed === true) {
    res.status(200).json({ refreshed: true });
    return;
  }
  if (result.reason === "reconnect_required" && "details" in result) {
    res.status(401).json({ error: "Reconnect required", details: result.details });
    return;
  }
  if (result.reason === "server_config") {
    res.status(500).json({
      error: "Server config",
      details: "X OAuth credentials not configured for token refresh.",
    });
    return;
  }
  res.status(200).json({ refreshed: false, reason: result.reason });
}
