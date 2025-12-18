import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getVerifyAuth } from "./_errorHandler.js";
import { getAdminDb } from "./_firebaseAdmin.js";

/**
 * Test Instagram access token and store it
 * POST with { accessToken: "your_token_here" }
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    // Authenticate user (optional for testing)
    const verifyAuth = await getVerifyAuth();
    const user = await verifyAuth(req);

    // If no user, continue in "dry-run" mode (no Firestore write)
    if (!user) {
      console.warn(
        "test-instagram-token: No authenticated user; running in dry-run mode (no Firestore write)."
      );
    }

    const { accessToken } = req.body;

    if (!accessToken) {
      res.status(400).json({ error: "Missing accessToken in body" });
      return;
    }

    // Step 1: Test the token - get Instagram account info
    const testResponse = await fetch(
      `https://graph.facebook.com/v19.0/me?` +
        `fields=id,name,accounts{id,name,access_token,instagram_business_account{id,username,profile_picture_url}}` +
        `&access_token=${accessToken}`
    );

    if (!testResponse.ok) {
      const errorText = await testResponse.text();
      console.error("Token test failed:", errorText);
      res.status(400).json({
        error: "Invalid token",
        details: errorText,
      });
      return;
    }

    const userData = await testResponse.json();
    const facebookUserId = userData.id;

    // Step 2: Get Pages and Instagram accounts
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?` +
        `fields=id,name,access_token,instagram_business_account{id,username,profile_picture_url}` +
        `&access_token=${accessToken}`
    );

    let pages: any[] = [];
    let instagramAccount: any = null;

    if (pagesResponse.ok) {
      const pagesData = await pagesResponse.json();
      pages = pagesData.data || [];

      // Find first Page with Instagram account
      for (const page of pages) {
        if (page.instagram_business_account) {
          instagramAccount = {
            accountId: page.instagram_business_account.id,
            username: page.instagram_business_account.username || null,
            profilePicture: page.instagram_business_account.profile_picture_url || null,
            pageId: page.id,
            pageName: page.name,
            pageToken: page.access_token,
          };
          break;
        }
      }
    }

    // Step 3: Try to exchange for long-lived token
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    let longLivedToken = accessToken;
    let tokenExpiry = new Date(Date.now() + 3600 * 1000); // Default 1 hour

    if (appId && appSecret) {
      try {
        const exchangeResponse = await fetch(
          `https://graph.facebook.com/v19.0/oauth/access_token?` +
            `grant_type=fb_exchange_token` +
            `&client_id=${appId}` +
            `&client_secret=${appSecret}` +
            `&fb_exchange_token=${accessToken}`,
          { method: "GET" }
        );

        if (exchangeResponse.ok) {
          const exchangeData = await exchangeResponse.json();
          longLivedToken = exchangeData.access_token;
          tokenExpiry = new Date(
            Date.now() + (exchangeData.expires_in || 5184000) * 1000
          );
        }
      } catch (exchangeError) {
        console.warn("Token exchange failed, using provided token:", exchangeError);
      }
    }

    // Step 4: Optionally store in Firestore (only if user is authenticated)
    let stored = false;
    if (user) {
      const db = await getAdminDb();

      const socialAccounts: any = {
        Facebook: {
          accountId: facebookUserId,
          accessToken: longLivedToken,
          tokenExpiry: tokenExpiry.toISOString(),
          connectedAt: new Date().toISOString(),
        },
      };

      if (instagramAccount) {
        socialAccounts.Instagram = {
          accountId: instagramAccount.accountId,
          username: instagramAccount.username,
          pageId: instagramAccount.pageId,
          pageName: instagramAccount.pageName,
          pageToken: instagramAccount.pageToken,
          accessToken: instagramAccount.pageToken, // Use Page token for IG API
          profilePicture: instagramAccount.profilePicture,
          connectedAt: new Date().toISOString(),
        };
      }

      await db
        .collection("users")
        .doc(user.uid)
        .set(
          {
            socialAccounts,
          },
          { merge: true }
        );

      stored = true;
    }

    // Step 5: Test Instagram API call if we have an account
    let igTestResult = null;
    if (instagramAccount) {
      try {
        const igTestResponse = await fetch(
          `https://graph.facebook.com/v19.0/${instagramAccount.accountId}?` +
            `fields=id,username,profile_picture_url,followers_count` +
            `&access_token=${instagramAccount.pageToken}`
        );

        if (igTestResponse.ok) {
          igTestResult = await igTestResponse.json();
        }
      } catch (igError) {
        console.warn("IG API test failed:", igError);
      }
    }

    res.status(200).json({
      success: true,
      message: stored
        ? "Token verified and stored"
        : "Token verified (dry-run: not stored, no authenticated user)",
      facebook: {
        userId: facebookUserId,
        name: userData.name,
      },
      pages: pages.length,
      instagram: instagramAccount
        ? {
            accountId: instagramAccount.accountId,
            username: instagramAccount.username,
            testResult: igTestResult,
          }
        : null,
      tokenExpiry: tokenExpiry.toISOString(),
      stored,
    });
  } catch (error: any) {
    console.error("Test token error:", error);
    res.status(500).json({
      error: "Failed to process token",
      details: error?.message || String(error),
    });
  }
}
