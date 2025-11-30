import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth } from '../../verifyAuth';

/**
 * Start Twitter/X OAuth flow
 * Returns authorization URL for frontend to redirect to
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify authentication
    const authUser = await verifyAuth(req);
    if (!authUser || !authUser.uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { redirectUri } = req.body || {};
    const clientId = process.env.TWITTER_CLIENT_ID || process.env.X_CLIENT_ID;
    const clientSecret = process.env.TWITTER_CLIENT_SECRET || process.env.X_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).json({
        error: 'Twitter/X OAuth not configured',
        details: 'Missing TWITTER_CLIENT_ID/X_CLIENT_ID or TWITTER_CLIENT_SECRET/X_CLIENT_SECRET'
      });
    }

    // Generate state parameter for security (include user ID)
    const state = Buffer.from(JSON.stringify({
      userId: authUser.uid,
      timestamp: Date.now(),
    })).toString('base64');

    // Build authorization URL
    // Twitter/X uses OAuth 2.0 with authorization code flow
    const baseUrl = 'https://twitter.com/i/oauth2/authorize';
    const callbackUrl = redirectUri || `${req.headers.origin || 'http://localhost:3000'}/api/oauth/x/callback`;
    
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: callbackUrl,
      scope: 'tweet.read tweet.write users.read offline.access', // Basic scopes for Twitter API v2
      state: state,
      code_challenge: 'challenge', // Twitter/X requires PKCE, but we'll use a simple challenge for now
      code_challenge_method: 'plain',
    });

    const authUrl = `${baseUrl}?${params.toString()}`;

    return res.status(200).json({
      authUrl,
      state,
    });
  } catch (error: any) {
    console.error('Twitter/X authorize error:', error);
    return res.status(500).json({
      error: 'Failed to generate authorization URL',
      details: error?.message || String(error)
    });
  }
}

