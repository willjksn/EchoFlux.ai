import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminApp } from '../../_firebaseAdmin.js';

/**
 * Handle Pinterest OAuth callback
 * Exchanges authorization code for access token and stores it
 * 
 * Pinterest OAuth 2.0 Documentation:
 * https://developers.pinterest.com/docs/getting-started/authentication/
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`/?error=oauth_denied&platform=pinterest`);
    }

    if (!code || !state) {
      return res.redirect(`/?error=missing_params&platform=pinterest`);
    }

    // Decode state to get user ID
    let stateData: { userId: string; timestamp: number; redirectUri?: string };
    try {
      stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    } catch {
      return res.redirect(`/?error=invalid_state&platform=pinterest`);
    }

    const userId = stateData.userId;
    const clientId = process.env.PINTEREST_CLIENT_ID;
    const clientSecret = process.env.PINTEREST_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.redirect(`/?error=oauth_not_configured&platform=pinterest`);
    }

    // Exchange code for access token
    // IMPORTANT: redirect_uri must match EXACTLY what was used in authorization request
    let redirectUri = stateData.redirectUri;
    if (!redirectUri) {
      // Fallback: reconstruct from request headers
      const protocol = req.headers['x-forwarded-proto'] || (req.headers.host?.includes('localhost') ? 'http' : 'https');
      const host = req.headers.host || req.headers['x-forwarded-host'] || 'echoflux.ai';
      redirectUri = `${protocol}://${host}/api/oauth/pinterest/callback`;
    }
    
    // Normalize redirect URI (remove trailing slash, ensure exact match)
    redirectUri = redirectUri.replace(/\/$/, '');
    
    console.log('Pinterest OAuth callback:', {
      hasState: !!state,
      redirectUriFromState: stateData.redirectUri,
      finalRedirectUri: redirectUri,
      origin: req.headers.origin,
      host: req.headers.host,
      protocol: req.headers['x-forwarded-proto'],
    });
    
    // Exchange code for access token
    // Pinterest uses POST with form-urlencoded data
    const tokenUrl = 'https://api.pinterest.com/v5/oauth/token';
    
    // Pinterest requires Basic Auth with client_id:client_secret as base64
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code as string,
      redirect_uri: redirectUri,
    });
    
    console.log('Exchanging code for token:', {
      url: tokenUrl,
      redirectUri: redirectUri,
      hasCode: !!code,
      codeLength: (code as string)?.length,
    });
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: tokenParams.toString(),
    });

    if (!tokenResponse.ok) {
      let errorText = await tokenResponse.text();
      let errorData: any = {};
      try {
        errorData = JSON.parse(errorText);
      } catch {
        // If not JSON, use raw text
      }
      
      console.error('Pinterest token exchange failed:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: errorText,
        errorData: errorData,
        clientId: clientId?.substring(0, 10) + '...',
        redirectUri: redirectUri,
        hasCode: !!code,
      });
      
      // Extract error message from Pinterest response
      const errorMessage = errorData.message || errorData.error_description || errorData.error || errorText.substring(0, 200);
      const errorDetails = encodeURIComponent(errorMessage);
      return res.redirect(`/?error=token_exchange_failed&platform=pinterest&details=${errorDetails}`);
    }

    const tokenData = await tokenResponse.json();
    const { access_token: accessToken, expires_in, refresh_token: refreshToken } = tokenData;

    if (!accessToken) {
      console.error('No access token received from Pinterest');
      return res.redirect(`/?error=token_exchange_failed&platform=pinterest`);
    }

    // Calculate expiration time
    const expiresAt = expires_in 
      ? new Date(Date.now() + expires_in * 1000).toISOString()
      : undefined;

    // Get user profile information
    let accountId = '';
    let accountUsername = '';
    let accountName = '';

    try {
      // Pinterest User Account API endpoint
      const profileResponse = await fetch('https://api.pinterest.com/v5/user_account', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        accountId = profileData.id || '';
        accountUsername = profileData.username || '';
        accountName = profileData.full_name || profileData.username || '';
      } else {
        console.warn('Pinterest profile fetch failed, will retry later:', {
          status: profileResponse.status,
          statusText: profileResponse.statusText,
        });
      }
    } catch (profileError) {
      console.warn('Failed to fetch Pinterest profile, continuing with token storage:', profileError);
      // Continue even if profile fetch fails - we can update it later
    }

    // Store tokens in Firestore
    const adminApp = getAdminApp();
    const db = adminApp.firestore();
    const socialAccountRef = db
      .collection('users')
      .doc(userId)
      .collection('social_accounts')
      .doc('pinterest');

    await socialAccountRef.set({
      platform: 'Pinterest',
      connected: true,
      accessToken,
      refreshToken: refreshToken || null,
      expiresAt: expiresAt || null,
      accountId: accountId || 'pending',
      accountUsername: accountUsername || null,
      accountName: accountName || null,
      lastSyncedAt: new Date().toISOString(),
    }, { merge: true });

    console.log('Pinterest account connected successfully:', {
      userId,
      accountId,
      accountUsername,
      hasRefreshToken: !!refreshToken,
    });

    // Redirect back to app with success
    return res.redirect(`/?oauth_success=pinterest&account=${encodeURIComponent(accountName || accountUsername || 'Pinterest')}`);
  } catch (error: any) {
    console.error('Pinterest OAuth callback error:', error);
    return res.redirect(`/?error=oauth_error&platform=pinterest&details=${encodeURIComponent(error?.message || 'Unknown error')}`);
  }
}
