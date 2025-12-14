import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminApp } from '../../_firebaseAdmin.js';

/**
 * Handle LinkedIn OAuth callback
 * Exchanges authorization code for access token and stores it
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`/?error=oauth_denied&platform=linkedin`);
    }

    if (!code || !state) {
      return res.redirect(`/?error=missing_params&platform=linkedin`);
    }

    // Decode state to get user ID
    let stateData: { userId: string; timestamp: number; redirectUri?: string };
    try {
      stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    } catch {
      return res.redirect(`/?error=invalid_state&platform=linkedin`);
    }

    const userId = stateData.userId;
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.redirect(`/?error=oauth_not_configured&platform=linkedin`);
    }

    // Exchange code for access token
    // IMPORTANT: redirect_uri must match EXACTLY what was used in authorization request
    let redirectUri = stateData.redirectUri;
    if (!redirectUri) {
      // Fallback: reconstruct from request headers
      const protocol = req.headers['x-forwarded-proto'] || (req.headers.host?.includes('localhost') ? 'http' : 'https');
      const host = req.headers.host || req.headers['x-forwarded-host'] || 'echoflux.ai';
      redirectUri = `${protocol}://${host}/api/oauth/linkedin/callback`;
    }
    
    // Normalize redirect URI (remove trailing slash, ensure exact match)
    redirectUri = redirectUri.replace(/\/$/, '');
    
    console.log('LinkedIn OAuth callback:', {
      hasState: !!state,
      redirectUriFromState: stateData.redirectUri,
      finalRedirectUri: redirectUri,
      origin: req.headers.origin,
      host: req.headers.host,
      protocol: req.headers['x-forwarded-proto'],
    });
    
    // Exchange code for access token
    // LinkedIn uses POST with form-urlencoded data
    const tokenUrl = 'https://www.linkedin.com/oauth/v2/accessToken';
    
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code as string,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
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
      
      console.error('LinkedIn token exchange failed:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: errorText,
        errorData: errorData,
        clientId: clientId?.substring(0, 10) + '...',
        redirectUri: redirectUri,
        hasCode: !!code,
      });
      
      // Extract error message from LinkedIn response
      const errorMessage = errorData.error_description || errorData.error || errorText.substring(0, 200);
      const errorDetails = encodeURIComponent(errorMessage);
      return res.redirect(`/?error=token_exchange_failed&platform=linkedin&details=${errorDetails}`);
    }

    const tokenData = await tokenResponse.json();
    const { access_token: accessToken, expires_in, refresh_token: refreshToken } = tokenData;

    if (!accessToken) {
      console.error('No access token received from LinkedIn');
      return res.redirect(`/?error=token_exchange_failed&platform=linkedin`);
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
      // Try OpenID Connect userinfo endpoint first (requires openid scope)
      const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      });

      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        accountId = profileData.sub || profileData.id || '';
        accountUsername = profileData.preferred_username || profileData.email || '';
        accountName = profileData.name || `${profileData.given_name || ''} ${profileData.family_name || ''}`.trim();
      } else {
        // Fallback: Try legacy profile endpoint with specific fields
        const legacyProfileResponse = await fetch('https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName)', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'X-Restli-Protocol-Version': '2.0.0',
          },
        });

        if (legacyProfileResponse.ok) {
          const legacyProfileData = await legacyProfileResponse.json();
          accountId = legacyProfileData.id || '';
          const firstName = legacyProfileData.localizedFirstName || '';
          const lastName = legacyProfileData.localizedLastName || '';
          accountName = `${firstName} ${lastName}`.trim();
        } else {
          // If both fail, we'll still store the token and fetch profile later
          console.warn('LinkedIn profile fetch failed, will retry later:', {
            status: legacyProfileResponse.status,
            statusText: legacyProfileResponse.statusText,
          });
        }
      }
    } catch (profileError) {
      console.warn('Failed to fetch LinkedIn profile, continuing with token storage:', profileError);
      // Continue even if profile fetch fails - we can update it later
    }

    // Store tokens in Firestore
    const adminApp = getAdminApp();
    const db = adminApp.firestore();
    const socialAccountRef = db
      .collection('users')
      .doc(userId)
      .collection('social_accounts')
      .doc('linkedin');

    await socialAccountRef.set({
      platform: 'LinkedIn',
      connected: true,
      accessToken,
      refreshToken: refreshToken || null,
      expiresAt: expiresAt || null,
      accountId: accountId || 'pending',
      accountUsername: accountUsername || null,
      accountName: accountName || null,
      lastSyncedAt: new Date().toISOString(),
    }, { merge: true });

    console.log('LinkedIn account connected successfully:', {
      userId,
      accountId,
      accountUsername,
      hasRefreshToken: !!refreshToken,
    });

    // Redirect back to app with success
    return res.redirect(`/?oauth_success=linkedin&account=${encodeURIComponent(accountName || accountUsername || 'LinkedIn')}`);
  } catch (error: any) {
    console.error('LinkedIn OAuth callback error:', error);
    return res.redirect(`/?error=oauth_error&platform=linkedin&details=${encodeURIComponent(error?.message || 'Unknown error')}`);
  }
}
