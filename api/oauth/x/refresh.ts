import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "../../verifyAuth.js";
import { getAdminDb } from "../../_firebaseAdmin.js";

function isInvalidGrantError(payloadText: string): boolean {
  const text = payloadText || "";
  return text.toLowerCase().includes("invalid_grant");
}

async function fetchWithRetry(request: RequestInfo, init: RequestInit, attempts = 3) {
  let lastError: any;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(request, init);
      if (response.ok) return response;
      // Retry only on transient server errors or rate limits
      if (response.status >= 500 || response.status === 429) {
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }
      return response;
    } catch (err: any) {
      lastError = err;
    }
  }
  throw lastError;
}

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
  if (!account?.connected || !account?.accessToken) {
    res.status(200).json({ refreshed: false, reason: "not_connected" });
    return;
  }

  const refreshToken = account.refreshToken;
  if (!refreshToken) {
    res.status(400).json({
      error: "Reconnect required",
      details: "X refresh token missing. Please disconnect and reconnect X in Settings.",
    });
    return;
  }

  const clientId = process.env.TWITTER_CLIENT_ID || process.env.X_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET || process.env.X_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.status(500).json({
      error: "Server config",
      details: "X OAuth credentials not configured for token refresh.",
    });
    return;
  }

  const now = new Date();
  const twoHoursMs = 2 * 60 * 60 * 1000;
  const expiresAt = account.expiresAt ? new Date(account.expiresAt) : null;
  const shouldRefresh =
    !expiresAt ||
    expiresAt.getTime() <= now.getTime() ||
    expiresAt.getTime() - now.getTime() < twoHoursMs;

  if (!shouldRefresh) {
    res.status(200).json({ refreshed: false, reason: "token_still_valid" });
    return;
  }

  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await fetchWithRetry("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("X token refresh failed:", response.status, errorText);
      if (response.status === 400 || response.status === 401) {
        if (isInvalidGrantError(errorText)) {
          res.status(401).json({
            error: "Reconnect required",
            details: "X token could not be renewed. Please disconnect and reconnect X in Settings.",
          });
          return;
        }
      }
      if (!account.expiresAt) {
        const softExpiresAt = new Date(now.getTime() + twoHoursMs).toISOString();
        await accountRef.update({
          expiresAt: softExpiresAt,
          lastSyncedAt: new Date().toISOString(),
        });
      }
      // Transient or non-auth failure: do not force reconnect
      res.status(200).json({ refreshed: false, reason: "refresh_failed" });
      return;
    }

    const tokenData = await response.json();
    const { access_token, refresh_token: newRefreshToken, expires_in } = tokenData;
    let newExpiresAt: string | undefined;
    if (expires_in) {
      const exp = new Date();
      exp.setSeconds(exp.getSeconds() + expires_in);
      newExpiresAt = exp.toISOString();
    }

    await accountRef.update({
      accessToken: access_token,
      refreshToken: newRefreshToken || refreshToken,
      expiresAt: newExpiresAt,
      lastSyncedAt: new Date().toISOString(),
    });

    res.status(200).json({ refreshed: true });
  } catch (error: any) {
    console.error("X refresh error:", error);
    // Do not force reconnect on transient failures
    if (!account.expiresAt) {
      const softExpiresAt = new Date(now.getTime() + twoHoursMs).toISOString();
      await accountRef.update({
        expiresAt: softExpiresAt,
        lastSyncedAt: new Date().toISOString(),
      });
    }
    res.status(200).json({
      refreshed: false,
      reason: "refresh_failed",
    });
  }
}
