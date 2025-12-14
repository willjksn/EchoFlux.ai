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

    // Generate state parameter for security (include user ID and redirectUri)
    const finalRedirectUri = redirectUri || `${req.headers.origin || 'http://localhost:3000'}/api/oauth/instagram/callback`;
    const state = Buffer.from(JSON.stringify({
      userId: authUser.uid,
      timestamp: Date.now(),
      redirectUri: finalRedirectUri, // Store redirectUri in state to ensure exact match
    })).toString('base64');

    // Build authorization URL - Using Facebook Login for Instagram Graph API
    // Instagram Basic Display was deprecated Dec 2024, now using Graph API via Facebook Login
    const baseUrl = 'https://www.facebook.com/v19.0/dialog/oauth';
    
    // Ensure redirectUri is normalized (no trailing slash, correct protocol)
    const normalizedRedirectUri = finalRedirectUri.replace(/\/$/, ''); // Remove trailing slash
    
    console.log('Instagram OAuth authorize:', {
      clientId: clientId?.substring(0, 10) + '...',
      redirectUri: normalizedRedirectUri,
      origin: req.headers.origin,
      host: req.headers.host,
    });
    
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: normalizedRedirectUri,
      scope: 'pages_show_list,instagram_basic,instagram_content_publish,pages_read_engagement',
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

