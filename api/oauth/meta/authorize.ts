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

    // Generate CSRF state token and persist user mapping
    const state = crypto.randomBytes(32).toString("hex");
    const db = await getAdminDb();
    await db.collection("oauth_states").doc(state).set({
      uid: user.uid,
      createdAt: new Date().toISOString(),
      provider: "meta",
    });

    const redirectUri = encodeURIComponent(
      "https://echoflux.ai/api/oauth/meta/callback"
    );
    
    const scopes = [
      "public_profile",
      "email",
      "pages_show_list", // Required to list user's Pages
      "pages_read_engagement", // For analytics
      "pages_manage_posts", // Required to publish to Facebook Pages
      "instagram_basic", // Access Instagram account info
      "instagram_content_publish", // Post to Instagram
      "instagram_manage_comments", // Manage comments
      "instagram_manage_insights", // Read analytics
    ].join(",");

    const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?` +
      `client_id=${appId}` +
      `&redirect_uri=${redirectUri}` +
      `&state=${state}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scopes)}`;

    res.status(200).json({ authUrl });
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Generate CSRF state token for legacy GET flow (no user binding)
  const state = crypto.randomBytes(32).toString("hex");
  
  // Build OAuth URL
  const redirectUri = encodeURIComponent(
    "https://echoflux.ai/api/oauth/meta/callback"
  );
  
  // Request permissions for both Facebook and Instagram
  const scopes = [
    "public_profile",
    "email",
    "pages_show_list", // Required to list user's Pages
    "pages_read_engagement", // For analytics
    "pages_manage_posts", // Required to publish to Facebook Pages
    "instagram_basic", // Access Instagram account info
    "instagram_content_publish", // Post to Instagram
    "instagram_manage_comments", // Manage comments
    "instagram_manage_insights", // Read analytics
  ].join(",");

  const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?` +
    `client_id=${appId}` +
    `&redirect_uri=${redirectUri}` +
    `&state=${state}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scopes)}`;

  // Redirect user to Facebook
  res.redirect(302, authUrl);
}
