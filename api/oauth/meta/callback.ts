import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getVerifyAuth } from "../../_errorHandler.js";
import { getAdminDb } from "../../_firebaseAdmin.js";

/**
 * Handle Meta OAuth callback (Facebook + Instagram)
 * Exchanges code for tokens, gets Pages, finds Instagram accounts, and stores in Firestore
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

  // Handle errors from Meta
  if (error) {
    console.error("Meta OAuth error:", error, error_reason);
    res.redirect(302, `/?error=oauth_failed&reason=${encodeURIComponent(error_reason as string)}`);
    return;
  }

  if (!code) {
    res.status(400).json({ error: "Missing authorization code" });
    return;
  }

  try {
    // Step 1: Exchange code for User access token
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const redirectUri = "https://echoflux.ai/api/oauth/meta/callback";

    if (!appId || !appSecret) {
      res.redirect(302, `/?error=oauth_not_configured`);
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
      res.redirect(302, `/?error=token_exchange_failed`);
      return;
    }

    const tokenData = await tokenResponse.json();
    const userAccessToken = tokenData.access_token;
    const expiresIn = tokenData.expires_in || 3600;

    // Step 2: Verify token works - get user info
    const meResponse = await fetch(
      `https://graph.facebook.com/v19.0/me?access_token=${userAccessToken}&fields=id,name,email`
    );

    if (!meResponse.ok) {
      console.error("Failed to verify user token");
      res.redirect(302, `/?error=token_verification_failed`);
      return;
    }

    const userInfo = await meResponse.json();
    const facebookUserId = userInfo.id;

    // Step 3: Exchange for long-lived token (recommended for production)
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
      tokenExpiry = new Date(
        Date.now() + (longLivedData.expires_in || 5184000) * 1000
      );
    }

    // Step 4: Get user's Pages (required for Instagram)
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?` +
        `fields=id,name,access_token,instagram_business_account` +
        `&access_token=${longLivedToken}`
    );

    if (!pagesResponse.ok) {
      const errorText = await pagesResponse.text();
      console.error("Failed to fetch Pages:", errorText);
      res.redirect(302, `/?error=pages_fetch_failed`);
      return;
    }

    const pagesData = await pagesResponse.json();
    const pages = pagesData.data || [];

    if (pages.length === 0) {
      res.redirect(302, `/?error=no_pages&message=You must be an admin of at least one Facebook Page to connect Instagram.`);
      return;
    }

    // Step 5: Find Pages with Instagram accounts
    const connectedAccounts: Array<{
      pageId: string;
      pageName: string;
      pageToken: string;
      igAccountId: string | null;
      igUsername: string | null;
      igProfilePicture: string | null;
    }> = [];

    for (const page of pages) {
      if (page.instagram_business_account) {
        const igAccountId = page.instagram_business_account.id;

        // Get Instagram account details
        const igResponse = await fetch(
          `https://graph.facebook.com/v19.0/${igAccountId}?` +
            `fields=id,username,profile_picture_url` +
            `&access_token=${page.access_token}`
        );

        if (igResponse.ok) {
          const igData = await igResponse.json();
          connectedAccounts.push({
            pageId: page.id,
            pageName: page.name,
            pageToken: page.access_token,
            igAccountId: igAccountId,
            igUsername: igData.username || null,
            igProfilePicture: igData.profile_picture_url || null,
          });
        }
      }
    }

    // Step 6: Determine primary Page for Facebook publishing
    const primaryPage = connectedAccounts.length > 0
      ? {
          id: connectedAccounts[0].pageId,
          name: connectedAccounts[0].pageName,
          access_token: connectedAccounts[0].pageToken,
        }
      : pages[0];

    const db = await getAdminDb();

    // Step 7: Resolve user from OAuth state or auth header
    let userId: string | undefined;
    const stateKey = Array.isArray(state) ? state[0] : state;
    if (stateKey) {
      try {
        const stateDoc = await db.collection("oauth_states").doc(stateKey).get();
        if (stateDoc.exists) {
          userId = stateDoc.data()?.uid;
          await db.collection("oauth_states").doc(stateKey).delete();
        }
      } catch (stateError) {
        console.error("Failed to resolve OAuth state:", stateError);
      }
    }

    if (!userId) {
      const verifyAuth = await getVerifyAuth();
      const user = await verifyAuth(req);
      userId = user?.uid;
    }

    if (!userId) {
      res.redirect(302, `/?error=not_authenticated`);
      return;
    }

    // Save Facebook Page account to subcollection (required for publishing)
    const facebookAccountRef = db
      .collection("users")
      .doc(userId)
      .collection("social_accounts")
      .doc("facebook");

    await facebookAccountRef.set({
      platform: "Facebook",
      connected: true,
      accessToken: primaryPage?.access_token || longLivedToken, // Prefer Page access token
      userAccessToken: longLivedToken,
      expiresAt: tokenExpiry.toISOString(),
      accountId: primaryPage?.id || facebookUserId, // Use Page ID when available
      accountName: primaryPage?.name || userInfo.name || "",
      pageId: primaryPage?.id || null,
      pageName: primaryPage?.name || null,
      pageAccessToken: primaryPage?.access_token || null,
      lastSyncedAt: new Date().toISOString(),
    }, { merge: true });

    // Save Instagram account(s) to subcollection if found
    if (connectedAccounts.length > 0) {
      const firstAccount = connectedAccounts[0];
      const instagramAccountRef = db
        .collection("users")
        .doc(userId)
        .collection("social_accounts")
        .doc("instagram");

      await instagramAccountRef.set({
        platform: "Instagram",
        connected: true,
        accessToken: firstAccount.pageToken, // Page token works for IG API calls
        expiresAt: tokenExpiry.toISOString(), // Use same expiry as Facebook token
        accountId: firstAccount.igAccountId,
        accountUsername: firstAccount.igUsername || "",
        accountName: firstAccount.igUsername || "",
        pageId: firstAccount.pageId,
        pageName: firstAccount.pageName,
        lastSyncedAt: new Date().toISOString(),
      }, { merge: true });
    }

    // Success - redirect to settings or dashboard
    const successMessage = connectedAccounts.length > 0
      ? `Connected Facebook and Instagram (${connectedAccounts.length} account${connectedAccounts.length > 1 ? 's' : ''})`
      : "Connected Facebook (no Instagram account found)";
    
    res.redirect(302, `/?connected=meta&accounts=${connectedAccounts.length}&message=${encodeURIComponent(successMessage)}`);
  } catch (error: any) {
    console.error("OAuth callback error:", error);
    res.redirect(302, `/?error=connection_failed&message=${encodeURIComponent(error.message)}`);
  }
}
