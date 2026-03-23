import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";
import { getVerifyAuth } from "../../_errorHandler.js";
import { getAdminDb } from "../../_firebaseAdmin.js";

/**
 * Start Meta OAuth flow (Facebook + Instagram)
 * Redirects user to Facebook Login which enables Instagram Graph API access
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!appId || !appSecret) {
    res.status(500).json({
      error: "Meta app credentials not configured",
      details: "META_APP_ID and META_APP_SECRET must be set in Vercel environment variables",
    });
    return;
  }

  if (!/^\d{15,16}$/.test(appId)) {
    res.status(500).json({
      error: "Invalid META_APP_ID format",
      details: `App ID should be a numeric string (15-16 digits). Got: ${appId ? `${appId.substring(0, 4)}...` : "undefined"}`,
    });
    return;
  }

  if (req.method === "POST") {
    const verifyAuth = await getVerifyAuth();
    const user = await verifyAuth(req);
    if (!user?.uid) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const body = (req.body || {}) as { connect?: string };
    const connect =
      body.connect === "facebook" || body.connect === "instagram" ? body.connect : "instagram";

    const state = crypto.randomBytes(32).toString("hex");
    const db = await getAdminDb();
    await db.collection("oauth_states").doc(state).set({
      uid: user.uid,
      createdAt: new Date().toISOString(),
      provider: "meta",
      connect,
    });

    const redirectUri = encodeURIComponent("https://echoflux.ai/api/oauth/meta/callback");

    const configIdFacebook = process.env.META_LOGIN_CONFIG_FACEBOOK?.trim();
    const configIdInstagram = process.env.META_LOGIN_CONFIG_INSTAGRAM?.trim();
    const configId =
      connect === "facebook" ? configIdFacebook : configIdInstagram || configIdFacebook;

    const scopesFacebookOnly = [
      "public_profile",
      "email",
      "pages_show_list",
      "pages_read_engagement",
      "pages_read_user_content",
      "pages_manage_posts",
      "read_insights",
    ].join(",");

    const scopesWithInstagram = [
      "public_profile",
      "email",
      "pages_show_list",
      "pages_read_engagement",
      "pages_read_user_content",
      "pages_manage_posts",
      "read_insights",
      "instagram_basic",
      "instagram_content_publish",
      "instagram_manage_comments",
      "instagram_manage_insights",
    ].join(",");

    const scopes = connect === "facebook" ? scopesFacebookOnly : scopesWithInstagram;

    const authType = process.env.META_OAUTH_AUTH_TYPE?.trim();
    const authTypeParam =
      authType && ["reauthenticate", "rerequest"].includes(authType)
        ? `&auth_type=${encodeURIComponent(authType)}`
        : "";

    let authUrl: string;
    if (configId) {
      authUrl =
        `https://www.facebook.com/v19.0/dialog/oauth?` +
        `client_id=${appId}` +
        `&redirect_uri=${redirectUri}` +
        `&state=${state}` +
        `&response_type=code` +
        `&config_id=${encodeURIComponent(configId)}` +
        `&override_default_response_type=true`;
    } else {
      authUrl =
        `https://www.facebook.com/v19.0/dialog/oauth?` +
        `client_id=${appId}` +
        `&redirect_uri=${redirectUri}` +
        `&state=${state}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(scopes)}` +
        authTypeParam;
    }

    res.status(200).json({ authUrl });
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  res.status(405).json({
    error: "Method not allowed",
    details:
      "Meta connect must be started from the app (POST /api/oauth/meta/authorize with Authorization). Opening this URL in a browser tab does not associate the callback with your EchoFlux account.",
  });
}
