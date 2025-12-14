import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminApp } from '../../_firebaseAdmin.js';

/**
 * Handle Instagram OAuth callback
 * Exchanges authorization code for access token and stores it
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`/?error=oauth_denied&platform=instagram`);
    }

    if (!code || !state) {
      return res.redirect(`/?error=missing_params&platform=instagram`);
    }

    // Decode state to get user ID
    let stateData: { userId: string; timestamp: number; redirectUri?: string };
    try {
      stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    } catch {
      return res.redirect(`/?error=invalid_state&platform=instagram`);
    }

    const userId = stateData.userId;
    const clientId = process.env.INSTAGRAM_CLIENT_ID;
    const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.redirect(`/?error=oauth_not_configured&platform=instagram`);
    }

    // Exchange code for access token - Using Facebook OAuth for Instagram Graph API
    // IMPORTANT: redirect_uri must match EXACTLY what was used in authorization request
    // Use the redirectUri from state (stored during authorization)
    let redirectUri = stateData.redirectUri;
    if (!redirectUri) {
      // Fallback: reconstruct from request headers (should match authorize.ts logic)
      const protocol = req.headers['x-forwarded-proto'] || (req.headers.host?.includes('localhost') ? 'http' : 'https');
      const host = req.headers.host || req.headers['x-forwarded-host'] || 'echoflux.ai';
      redirectUri = `${protocol}://${host}/api/oauth/instagram/callback`;
    }
    
    // Normalize redirect URI (remove trailing slash, ensure exact match)
    redirectUri = redirectUri.replace(/\/$/, '');
    
    console.log('Instagram OAuth callback:', {
      hasState: !!state,
      redirectUriFromState: stateData.redirectUri,
      finalRedirectUri: redirectUri,
      origin: req.headers.origin,
      host: req.headers.host,
      protocol: req.headers['x-forwarded-proto'],
    });
    
    // Step 1: Exchange code for Facebook access token
    // Facebook OAuth uses GET with query parameters for token exchange
    const tokenUrl = new URL('https://graph.facebook.com/v19.0/oauth/access_token');
    tokenUrl.searchParams.set('client_id', clientId);
    tokenUrl.searchParams.set('client_secret', clientSecret);
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('code', code as string);
    
    console.log('Exchanging code for token:', {
      url: tokenUrl.toString().replace(clientSecret, '***SECRET***'),
      redirectUri: redirectUri,
      hasCode: !!code,
      codeLength: (code as string)?.length,
    });
    
    const tokenResponse = await fetch(tokenUrl.toString(), {
      method: 'GET',
    });

    if (!tokenResponse.ok) {
      let errorText = await tokenResponse.text();
      let errorData: any = {};
      try {
        errorData = JSON.parse(errorText);
      } catch {
        // If not JSON, use raw text
      }
      
      console.error('Instagram token exchange failed:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: errorText,
        errorData: errorData,
        clientId: clientId?.substring(0, 10) + '...', // Log partial ID for debugging
        redirectUri: redirectUri,
        hasCode: !!code,
      });
      
      // Extract error message from Facebook response
      const errorMessage = errorData.error?.message || errorData.error_description || errorText.substring(0, 200);
      const errorCode = errorData.error?.code || errorData.error?.type || 'unknown';
      
      // Include detailed error in redirect
      const errorDetails = encodeURIComponent(`${errorCode}: ${errorMessage}`);
      return res.redirect(`/?error=token_exchange_failed&platform=instagram&details=${errorDetails}`);
    }

    const tokenData = await tokenResponse.json();
    const { access_token: facebookAccessToken } = tokenData;

    if (!facebookAccessToken) {
      console.error('No access token received from Facebook');
      return res.redirect(`/?error=token_exchange_failed&platform=instagram`);
    }

    // Step 2: Get user's Facebook Pages (Instagram Business accounts are connected to Pages)
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?access_token=${facebookAccessToken}`
    );

    if (!pagesResponse.ok) {
      const errorText = await pagesResponse.text();
      console.error('Failed to fetch Facebook Pages:', errorText);
      return res.redirect(`/?error=pages_fetch_failed&platform=instagram`);
    }

    const pagesData = await pagesResponse.json();
    const pages = pagesData.data || [];

    // Step 3: Find Instagram Business Account connected to a Page
    let instagramAccountId = '';
    let instagramUsername = '';
    let pageAccessToken = '';

    for (const page of pages) {
      // Get Instagram Business Account ID for this page
      const igAccountResponse = await fetch(
        `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
      );

      if (igAccountResponse.ok) {
        const igAccountData = await igAccountResponse.json();
        if (igAccountData.instagram_business_account?.id) {
          instagramAccountId = igAccountData.instagram_business_account.id;
          pageAccessToken = page.access_token;
          
          // Get Instagram username
          const igProfileResponse = await fetch(
            `https://graph.facebook.com/v19.0/${instagramAccountId}?fields=username&access_token=${pageAccessToken}`
          );
          if (igProfileResponse.ok) {
            const igProfileData = await igProfileResponse.json();
            instagramUsername = igProfileData.username || '';
          }
          break;
        }
      }
    }

    if (!instagramAccountId) {
      return res.redirect(`/?error=no_instagram_account&platform=instagram&message=No Instagram Business Account found. Please connect your Instagram account to a Facebook Page.`);
    }

    // Use page access token as Instagram access token (for Graph API)
    const finalAccessToken = pageAccessToken;
    
    // Calculate expiration (Facebook Page tokens are long-lived, typically 60 days)
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 60); // 60 days
    const expiresAt = expirationDate.toISOString();

    // Store token in Firestore
    const adminApp = getAdminApp();
    const db = adminApp.firestore();
    
    const socialAccountRef = db
      .collection('users')
      .doc(userId)
      .collection('social_accounts')
      .doc('instagram');

    await socialAccountRef.set({
      platform: 'Instagram',
      connected: true,
      accessToken: finalAccessToken,
      expiresAt: expiresAt,
      accountId: instagramAccountId,
      accountUsername: instagramUsername,
      pageId: pages.find((p: any) => p.access_token === pageAccessToken)?.id,
      facebookAccessToken: facebookAccessToken, // Store for future use
      lastSyncedAt: new Date().toISOString(),
    }, { merge: true });

    // Redirect back to app
    return res.redirect(`/?oauth_success=instagram`);
  } catch (error: any) {
    console.error('Instagram callback error:', error);
    return res.redirect(`/?error=oauth_failed&platform=instagram`);
  }
}

