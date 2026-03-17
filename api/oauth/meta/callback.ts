import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getVerifyAuth } from "../../_errorHandler.js";
import { getAdminDb } from "../../_firebaseAdmin.js";

const APP_ORIGIN = "https://echoflux.ai";

/**
 * Handle Meta OAuth callback (Facebook + Instagram)
 * Exchanges code for tokens, gets Pages, finds Instagram accounts, and stores in Firestore.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { code, state, error, error_reason } = req.query;

  if (error) {
    console.error("Meta OAuth error:", error, error_reason);
    res.redirect(302, `${APP_ORIGIN}/?error=oauth_failed&platform=facebook&reason=${encodeURIComponent((error_reason as string) || String(error))}`);
    return;
  }

  if (!code) {
    res.redirect(302, `${APP_ORIGIN}/?error=missing_code&platform=facebook&message=Missing+authorization+code`);
    return;
  }

  try {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const redirectUri = "https://echoflux.ai/api/oauth/meta/callback";

    if (!appId || !appSecret) {
      res.redirect(302, `${APP_ORIGIN}/?error=oauth_not_configured&platform=facebook`);
      return;
    }

    const tokenResponse = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?` +
      `client_id=${appId}` +
      `&client_secret=${appSecret}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&code=${code}`,
      { method: "GET" }
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange failed:", errorText);
      res.redirect(302, `${APP_ORIGIN}/?error=token_exchange_failed&platform=facebook`);
      return;
    }

    const tokenData = await tokenResponse.json();
    const userAccessToken = tokenData.access_token;
    const expiresIn = tokenData.expires_in || 3600;

    const meResponse = await fetch(
      `https://graph.facebook.com/v19.0/me?access_token=${userAccessToken}&fields=id,name,email`
    );
    if (!meResponse.ok) {
      res.redirect(302, `${APP_ORIGIN}/?error=token_verification_failed&platform=facebook`);
      return;
    }

    const userInfo = await meResponse.json();
    const facebookUserId = userInfo.id;

    const longLivedResponse = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?` +
      `grant_type=fb_exchange_token` +
      `&client_id=${appId}` +
      `&client_secret=${appSecret}` +
      `&fb_exchange_token=${userAccessToken}`,
      { method: "GET" }
    );

    let longLivedToken = userAccessToken;
    let tokenExpiry = new Date(Date.now() + expiresIn * 1000);
    if (longLivedResponse.ok) {
      const longLivedData = await longLivedResponse.json();
      longLivedToken = longLivedData.access_token;
      tokenExpiry = new Date(Date.now() + (longLivedData.expires_in || 5184000) * 1000);
    }

    const pagesResponse = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${longLivedToken}`
    );
    if (!pagesResponse.ok) {
      const errorText = await pagesResponse.text();
      console.error("Failed to fetch Pages:", errorText);
      res.redirect(302, `${APP_ORIGIN}/?error=pages_fetch_failed&platform=facebook`);
      return;
    }

    const pagesData = await pagesResponse.json();
    const pages = pagesData.data || [];
    if (!pages.length) {
      res.redirect(302, `${APP_ORIGIN}/?error=no_pages&platform=facebook&message=${encodeURIComponent("You must be an admin of at least one Facebook Page to connect.")}`);
      return;
    }

    const db = await getAdminDb();
    let userId: string | undefined;
    let connectMode: "facebook" | "instagram" = "instagram";
    const stateKey = Array.isArray(state) ? state[0] : state;
    if (stateKey) {
      const stateDoc = await db.collection("oauth_states").doc(stateKey).get();
      if (stateDoc.exists) {
        const data = stateDoc.data();
        userId = data?.uid;
        if (data?.connect === "facebook" || data?.connect === "instagram") {
          connectMode = data.connect;
        }
        await db.collection("oauth_states").doc(stateKey).delete();
      }
    }

    if (!userId) {
      const verifyAuth = await getVerifyAuth();
      const user = await verifyAuth(req);
      userId = user?.uid;
    }
    if (!userId) {
      res.redirect(302, `${APP_ORIGIN}/?error=not_authenticated&platform=facebook`);
      return;
    }

    const connectedAccounts: Array<{
      pageId: string;
      pageName: string;
      pageToken: string;
      igAccountId: string | null;
      igUsername: string | null;
    }> = [];

    if (connectMode === "instagram") {
      for (const page of pages) {
        if (!page.instagram_business_account) continue;
        const igAccountId = page.instagram_business_account.id;
        const igResponse = await fetch(
          `https://graph.facebook.com/v19.0/${igAccountId}?fields=id,username,profile_picture_url&access_token=${page.access_token}`
        );
        if (!igResponse.ok) continue;
        const igData = await igResponse.json();
        connectedAccounts.push({
          pageId: page.id,
          pageName: page.name,
          pageToken: page.access_token,
          igAccountId,
          igUsername: igData.username || null,
        });
      }
    }

    const primaryPage = connectedAccounts.length > 0
      ? { id: connectedAccounts[0].pageId, name: connectedAccounts[0].pageName, access_token: connectedAccounts[0].pageToken }
      : pages[0];

    await db.collection("users").doc(userId).collection("social_accounts").doc("facebook").set({
      platform: "Facebook",
      connected: true,
      accessToken: primaryPage?.access_token || longLivedToken,
      userAccessToken: longLivedToken,
      expiresAt: tokenExpiry.toISOString(),
      accountId: primaryPage?.id || facebookUserId,
      accountName: primaryPage?.name || userInfo.name || "",
      pageId: primaryPage?.id || null,
      pageName: primaryPage?.name || null,
      pageAccessToken: primaryPage?.access_token || null,
      lastSyncedAt: new Date().toISOString(),
    }, { merge: true });

    if (connectedAccounts.length > 0) {
      const first = connectedAccounts[0];
      await db.collection("users").doc(userId).collection("social_accounts").doc("instagram").set({
        platform: "Instagram",
        connected: true,
        accessToken: first.pageToken,
        expiresAt: tokenExpiry.toISOString(),
        accountId: first.igAccountId,
        accountUsername: first.igUsername || "",
        accountName: first.igUsername || "",
        pageId: first.pageId,
        pageName: first.pageName,
        lastSyncedAt: new Date().toISOString(),
      }, { merge: true });
    }

    // Use oauth_success query params so Settings page refresh handler runs.
    const successPlatform = connectMode === "instagram" && connectedAccounts.length > 0 ? "instagram" : "facebook";
    const accountLabel = successPlatform === "instagram"
      ? (connectedAccounts[0]?.igUsername || connectedAccounts[0]?.pageName || "")
      : (primaryPage?.name || userInfo?.name || "");
    res.redirect(
      302,
      `${APP_ORIGIN}/?oauth_success=${encodeURIComponent(successPlatform)}&platform=${encodeURIComponent(successPlatform)}&account=${encodeURIComponent(accountLabel)}`
    );
  } catch (error: any) {
    console.error("OAuth callback error:", error);
    res.redirect(302, `${APP_ORIGIN}/?error=connection_failed&platform=facebook&message=${encodeURIComponent(error?.message || "Connection failed")}`);
  }
}
