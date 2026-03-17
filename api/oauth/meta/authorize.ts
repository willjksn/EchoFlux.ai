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
      details: "META_APP_ID and META_APP_SECRET must be set in Vercel environment variables"
    });
    return;
  }

  // Validate App ID format (should be numeric, 15-16 digits)
  if (!/^\d{15,16}$/.test(appId)) {
    res.status(500).json({ 
      error: "Invalid META_APP_ID format",
      details: `App ID should be a numeric string (15-16 digits). Got: ${appId ? `${appId.substring(0, 4)}...` : 'undefined'}`
    });
    return;
  }

  // Require auth for app-initiated OAuth
  if (req.method === "POST") {
    const verifyAuth = await getVerifyAuth();
    const user = await verifyAuth(req);
    if (!user?.uid) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // connect: 'facebook' = only Facebook Pages (no Instagram). 'instagram' = Facebook + Instagram.
    const body = (req.body || {}) as { connect?: string };
    const connect = (body.connect === "facebook" || body.connect === "instagram") ? body.connect : "instagram";

    // Generate CSRF state token and persist user mapping + connect mode
    const state = crypto.randomBytes(32).toString("hex");
    const db = await getAdminDb();
    await db.collection("oauth_states").doc(state).set({
      uid: user.uid,
      createdAt: new Date().toISOString(),
      provider: "meta",
      connect, // "facebook" | "instagram"
    });

    const redirectUri = encodeURIComponent(
      "https://echoflux.ai/api/oauth/meta/callback"
    );

    // Facebook Login for Business: if Login Configuration IDs are set, use config_id (required for Business-type apps so non-admin users can connect)
    const configIdFacebook = process.env.META_LOGIN_CONFIG_FACEBOOK?.trim();
    const configIdInstagram = process.env.META_LOGIN_CONFIG_INSTAGRAM?.trim();
    const configId = connect === "facebook" ? configIdFacebook : (configIdInstagram || configIdFacebook);

    let authUrl: string;
    if (configId) {
      authUrl = `https://www.facebook.com/v19.0/dialog/oauth?` +
        `client_id=${appId}` +
        `&redirect_uri=${redirectUri}` +
        `&state=${state}` +
        `&response_type=code` +
        `&config_id=${encodeURIComponent(configId)}` +
        `&override_default_response_type=true`;
    } else {
      const scopesFacebookOnly = [
        "public_profile",
        "email",
        "pages_show_list",
        "pages_read_engagement",
        "pages_manage_posts",
      ].join(",");
      const scopesWithInstagram = [
        "public_profile",
        "email",
        "pages_show_list",
        "pages_read_engagement",
        "pages_manage_posts",
        "instagram_basic",
        "instagram_content_publish",
        "instagram_manage_comments",
        "instagram_manage_insights",
      ].join(",");
      const scopes = connect === "facebook" ? scopesFacebookOnly : scopesWithInstagram;
      authUrl = `https://www.facebook.com/v19.0/dialog/oauth?` +
        `client_id=${appId}` +
        `&redirect_uri=${redirectUri}` +
        `&state=${state}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(scopes)}`;
    }

    res.status(200).json({ authUrl });
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Legacy GET flow (no user binding)
  const state = crypto.randomBytes(32).toString("hex");
  const redirectUri = encodeURIComponent(
    "https://echoflux.ai/api/oauth/meta/callback"
  );
  const configIdLegacy = process.env.META_LOGIN_CONFIG_INSTAGRAM || process.env.META_LOGIN_CONFIG_FACEBOOK;
  const authUrl = configIdLegacy
    ? `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&state=${state}&response_type=code&config_id=${encodeURIComponent(configIdLegacy)}&override_default_response_type=true`
    : `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&state=${state}&response_type=code&scope=${encodeURIComponent("public_profile,email,pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish,instagram_manage_comments,instagram_manage_insights")}`;

  res.redirect(302, authUrl);
}
