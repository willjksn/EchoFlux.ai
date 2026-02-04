/**
 * Shared X OAuth 2.0 token refresh logic.
 * Used by GET /api/oauth/x/refresh (per-user) and cronRefreshXTokens (bulk).
 */

export function isInvalidGrantError(payloadText: string): boolean {
  const text = payloadText || "";
  return text.toLowerCase().includes("invalid_grant");
}

export async function fetchWithRetry(
  request: RequestInfo,
  init: RequestInit,
  attempts = 3
): Promise<Response> {
  let lastError: any;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(request, init);
      if (response.ok) return response;
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

/** X access tokens expire in 2 hours; refresh when less than 1 hour left so we stay ahead */
const REFRESH_BEFORE_EXPIRY_MS = 1 * 60 * 60 * 1000;

export type RefreshResult =
  | { refreshed: true }
  | { refreshed: false; reason: string }
  | { refreshed: false; reason: "reconnect_required"; details: string };

/** Firestore doc ref with update() */
type DocRef = { update: (data: object) => Promise<void> };

/**
 * Refresh one user's X token if expired or expiring within 1 hour.
 * Updates Firestore on success. Idempotent; safe to call from cron.
 */
export async function refreshXTokenForAccount(
  _db: unknown,
  userId: string,
  accountRef: DocRef,
  account: {
    connected?: boolean;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
  },
  options?: { forceRefresh?: boolean }
): Promise<RefreshResult> {
  if (!account?.connected || !account?.accessToken) {
    return { refreshed: false, reason: "not_connected" };
  }

  const refreshToken = account.refreshToken;
  if (!refreshToken) {
    return {
      refreshed: false,
      reason: "reconnect_required",
      details: "X refresh token missing. Please disconnect and reconnect X in Settings.",
    };
  }

  const clientId = process.env.TWITTER_CLIENT_ID || process.env.X_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET || process.env.X_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { refreshed: false, reason: "server_config" };
  }

  const now = new Date();
  const expiresAt = account.expiresAt ? new Date(account.expiresAt) : null;
  const shouldRefresh =
    options?.forceRefresh === true ||
    !expiresAt ||
    expiresAt.getTime() <= now.getTime() ||
    expiresAt.getTime() - now.getTime() < REFRESH_BEFORE_EXPIRY_MS;

  if (!shouldRefresh) {
    return { refreshed: false, reason: "token_still_valid" };
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
      if (response.status === 400 || response.status === 401) {
        if (isInvalidGrantError(errorText)) {
          return {
            refreshed: false,
            reason: "reconnect_required",
            details: "X token could not be renewed. Please disconnect and reconnect X in Settings.",
          };
        }
      }
      if (!account.expiresAt) {
        const softExpiresAt = new Date(now.getTime() + REFRESH_BEFORE_EXPIRY_MS).toISOString();
        await accountRef.update({
          expiresAt: softExpiresAt,
          lastSyncedAt: new Date().toISOString(),
        });
      }
      return { refreshed: false, reason: "refresh_failed" };
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

    return { refreshed: true };
  } catch (error: any) {
    console.error("X refresh error for user", userId, error);
    if (!account.expiresAt) {
      const softExpiresAt = new Date(now.getTime() + REFRESH_BEFORE_EXPIRY_MS).toISOString();
      await accountRef.update({
        expiresAt: softExpiresAt,
        lastSyncedAt: new Date().toISOString(),
      });
    }
    return { refreshed: false, reason: "refresh_failed" };
  }
}
