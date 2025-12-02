import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth } from '../../verifyAuth.js';

/**
 * Start Instagram OAuth flow
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
    const clientId = process.env.INSTAGRAM_CLIENT_ID;
    const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).json({
        error: 'Instagram OAuth not configured',
        details: 'Missing INSTAGRAM_CLIENT_ID or INSTAGRAM_CLIENT_SECRET'
      });
    }

    // Generate state parameter for security (include user ID)
    const state = Buffer.from(JSON.stringify({
      userId: authUser.uid,
      timestamp: Date.now(),
    })).toString('base64');

    // Build authorization URL
    const baseUrl = 'https://api.instagram.com/oauth/authorize';
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri || `${req.headers.origin || 'http://localhost:3000'}/api/oauth/instagram/callback`,
      scope: 'user_profile,user_media',
      response_type: 'code',
      state: state,
    });

    const authUrl = `${baseUrl}?${params.toString()}`;

    return res.status(200).json({
      authUrl,
      state,
    });
  } catch (error: any) {
    console.error('Instagram authorize error:', error);
    return res.status(500).json({
      error: 'Failed to generate authorization URL',
      details: error?.message || String(error)
    });
  }
}

