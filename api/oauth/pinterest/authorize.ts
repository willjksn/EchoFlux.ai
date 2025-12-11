import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuth } from '../../verifyAuth.js';

/**
 * Start Pinterest OAuth flow
 * Returns authorization URL for frontend to redirect to
 * 
 * Pinterest OAuth 2.0 Documentation:
 * https://developers.pinterest.com/docs/getting-started/authentication/
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
    const clientId = process.env.PINTEREST_CLIENT_ID;

    if (!clientId) {
      return res.status(500).json({
        error: 'Pinterest OAuth not configured',
        details: 'Missing PINTEREST_CLIENT_ID'
      });
    }

    // Generate state parameter for security (include user ID and redirectUri)
    const finalRedirectUri = redirectUri || `${req.headers.origin || 'http://localhost:3000'}/api/oauth/pinterest/callback`;
    const state = Buffer.from(JSON.stringify({
      userId: authUser.uid,
      timestamp: Date.now(),
      redirectUri: finalRedirectUri,
    })).toString('base64');

    // Build authorization URL
    // Pinterest OAuth 2.0 authorization endpoint
    const baseUrl = 'https://www.pinterest.com/oauth/';
    
    // Ensure redirectUri is normalized (no trailing slash, correct protocol)
    const normalizedRedirectUri = finalRedirectUri.replace(/\/$/, '');
    
    console.log('Pinterest OAuth authorize:', {
      clientId: clientId?.substring(0, 10) + '...',
      redirectUri: normalizedRedirectUri,
      origin: req.headers.origin,
      host: req.headers.host,
    });
    
    // Pinterest OAuth scopes:
    // - boards:read - Read board information
    // - boards:write - Create and update boards
    // - pins:read - Read pin information
    // - pins:write - Create and update pins
    // - user_accounts:read - Read user account information
    const params = new URLSearchParams({
      response_type: 'code',
      redirect_uri: normalizedRedirectUri,
      client_id: clientId,
      state: state,
      scope: 'boards:read boards:write pins:read pins:write user_accounts:read',
    });

    const authUrl = `${baseUrl}?${params.toString()}`;

    return res.status(200).json({
      authUrl,
      state,
    });
  } catch (error: any) {
    console.error('Pinterest authorize error:', error);
    return res.status(500).json({
      error: 'Failed to generate authorization URL',
      details: error?.message || String(error)
    });
  }
}
