import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminApp } from '../../_firebaseAdmin';

/**
 * Handle Twitter/X OAuth callback
 * Exchanges authorization code for access token and stores it
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      console.error('Twitter/X OAuth error:', error, error_description);
      return res.redirect(`/?error=oauth_denied&platform=x&details=${encodeURIComponent(error_description as string || error as string)}`);
    }

    if (!code || !state) {
      return res.redirect(`/?error=missing_params&platform=x`);
    }

    // Decode state to get user ID and code verifier
    let stateData: { userId: string; codeVerifier: string; timestamp: number };
    try {
      stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    } catch {
      return res.redirect(`/?error=invalid_state&platform=x`);
    }

    const userId = stateData.userId;
    const codeVerifier = stateData.codeVerifier; // PKCE verifier
    const clientId = process.env.TWITTER_CLIENT_ID || process.env.X_CLIENT_ID;
    const clientSecret = process.env.TWITTER_CLIENT_SECRET || process.env.X_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.redirect(`/?error=oauth_not_configured&platform=x`);
    }

    // Exchange code for access token
    const redirectUri = `${req.headers.origin || 'http://localhost:3000'}/api/oauth/x/callback`;
    
    // Create basic auth header for Twitter API
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        code: code as string,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code_verifier: codeVerifier, // PKCE verifier from state
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Twitter/X token exchange failed:', errorText);
      return res.redirect(`/?error=token_exchange_failed&platform=x`);
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    // Calculate expiration time
    let expiresAt: string | undefined;
    if (expires_in) {
      const expirationDate = new Date();
      expirationDate.setSeconds(expirationDate.getSeconds() + expires_in);
      expiresAt = expirationDate.toISOString();
    }

    // Get user profile using Twitter API v2
    const profileResponse = await fetch(
      'https://api.twitter.com/2/users/me?user.fields=username,name,profile_image_url',
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
        },
      }
    );

    let accountUsername = '';
    let accountName = '';
    let accountId = '';

    if (profileResponse.ok) {
      const profileData = await profileResponse.json();
      if (profileData.data) {
        accountUsername = profileData.data.username || '';
        accountName = profileData.data.name || '';
        accountId = profileData.data.id || '';
      }
    }

    // Store token in Firestore
    const adminApp = getAdminApp();
    const db = adminApp.firestore();
    
    const socialAccountRef = db
      .collection('users')
      .doc(userId)
      .collection('social_accounts')
      .doc('x');

    await socialAccountRef.set({
      platform: 'X',
      connected: true,
      accessToken: access_token,
      refreshToken: refresh_token, // Store refresh token for token renewal
      expiresAt: expiresAt,
      accountId: accountId,
      accountUsername: accountUsername,
      accountName: accountName,
      lastSyncedAt: new Date().toISOString(),
    }, { merge: true });

    // Redirect back to app
    return res.redirect(`/?oauth_success=x`);
  } catch (error: any) {
    console.error('Twitter/X callback error:', error);
    return res.redirect(`/?error=oauth_failed&platform=x`);
  }
}

