import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminApp } from '../../_firebaseAdmin';

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
    let stateData: { userId: string; timestamp: number };
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

    // Exchange code for access token
    const redirectUri = `${req.headers.origin || 'http://localhost:3000'}/api/oauth/instagram/callback`;
    
    const tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code: code as string,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Instagram token exchange failed:', errorText);
      return res.redirect(`/?error=token_exchange_failed&platform=instagram`);
    }

    const tokenData = await tokenResponse.json();
    const { access_token, user_id } = tokenData;

    // Get long-lived token (Instagram tokens expire in 1 hour, exchange for 60-day token)
    const longLivedTokenResponse = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${clientSecret}&access_token=${access_token}`,
      { method: 'GET' }
    );

    let finalAccessToken = access_token;
    let expiresAt: string | undefined;

    if (longLivedTokenResponse.ok) {
      const longLivedData = await longLivedTokenResponse.json();
      finalAccessToken = longLivedData.access_token;
      if (longLivedData.expires_in) {
        const expirationDate = new Date();
        expirationDate.setSeconds(expirationDate.getSeconds() + longLivedData.expires_in);
        expiresAt = expirationDate.toISOString();
      }
    }

    // Get user profile
    const profileResponse = await fetch(
      `https://graph.instagram.com/me?fields=id,username&access_token=${finalAccessToken}`
    );

    let accountUsername = '';
    if (profileResponse.ok) {
      const profileData = await profileResponse.json();
      accountUsername = profileData.username || '';
    }

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
      accountId: user_id,
      accountUsername: accountUsername,
      lastSyncedAt: new Date().toISOString(),
    }, { merge: true });

    // Redirect back to app
    return res.redirect(`/?oauth_success=instagram`);
  } catch (error: any) {
    console.error('Instagram callback error:', error);
    return res.redirect(`/?error=oauth_failed&platform=instagram`);
  }
}

